// Generic spawn/health-poll/lifecycle for Core-API-embedded apps, keyed by
// appId (unlike opencodeRuntime.ts's one-off OpenCode-specific singleton).
// Deliberately has no npm-install/bin-discovery logic — that was specific
// to OpenCode being an npm CLI. How a future app actually gets *installed*
// onto the machine in the first place is an open question this file doesn't
// answer; it only knows how to run `embed.command`/`args` once something
// has put it there.

import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { GENIEX_OPENAI_BASE_URL, type EmbeddedAppState } from '@shared/types';
import { ENV_VARS } from '@shared/coreApiContract';
import { getCatalogApp } from './appCatalog';
import * as coreApiServer from './coreApiServer';
import { hideEmbeddedAppView, destroyEmbeddedAppView } from './embeddedAppViewManager';

interface Instance {
  process: ChildProcess | null;
  port: number | null;
  token: string | null;
  state: EmbeddedAppState;
}

const instances = new Map<string, Instance>();
let listeners: Array<(s: EmbeddedAppState) => void> = [];

export function onEmbeddedAppStateChanged(cb: (s: EmbeddedAppState) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function emit(state: EmbeddedAppState): void {
  for (const l of listeners) l(state);
}

function getOrCreate(appId: string): Instance {
  let inst = instances.get(appId);
  if (!inst) {
    inst = { process: null, port: null, token: null, state: idleState(appId) };
    instances.set(appId, inst);
  }
  return inst;
}

function idleState(appId: string): EmbeddedAppState {
  return { appId, running: false, url: null, installing: false, error: null };
}

function setState(appId: string, next: Partial<EmbeddedAppState>): EmbeddedAppState {
  const inst = getOrCreate(appId);
  inst.state = { ...inst.state, ...next };
  emit(inst.state);
  return inst.state;
}

export function getEmbeddedAppState(appId: string): EmbeddedAppState {
  return getOrCreate(appId).state;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      srv.close(() => {
        if (!address || typeof address === 'string') reject(new Error('Failed to allocate a port'));
        else resolve(address.port);
      });
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for embedded app to start');
}

export async function startEmbeddedApp(appId: string): Promise<EmbeddedAppState> {
  const existing = getOrCreate(appId);
  if (existing.state.running) return existing.state;

  const app = getCatalogApp(appId);
  if (!app?.embed) {
    return setState(appId, { error: `App "${appId}" has no embed configuration` });
  }

  setState(appId, { installing: false, error: null });

  try {
    const coreApiUrl = coreApiServer.getCoreApiUrl();
    if (!coreApiUrl) throw new Error('Core API server is not running');

    const port = await getFreePort();
    const token = coreApiServer.generateAppToken();
    coreApiServer.registerAppToken(appId, token);

    const { command, args = [], healthPath = '/' } = app.embed;
    const useShell = /\.(cmd|bat)$/i.test(command);
    const child = spawn(command, args, {
      windowsHide: true,
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        [ENV_VARS.coreApiUrl]: coreApiUrl,
        [ENV_VARS.appId]: appId,
        [ENV_VARS.appToken]: token,
        [ENV_VARS.geniexBaseUrl]: GENIEX_OPENAI_BASE_URL,
        [ENV_VARS.appPort]: String(port),
      },
    });

    const inst = getOrCreate(appId);
    inst.process = child;
    inst.port = port;
    inst.token = token;

    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000);
    });
    child.on('exit', (code) => {
      const wasIntentional = inst.process === null;
      inst.process = null;
      hideEmbeddedAppView(appId);
      if (!wasIntentional) {
        setState(appId, {
          running: false,
          url: null,
          error: code === 0 ? null : `Exited with code ${code}${stderrTail ? `: ${stderrTail.trim()}` : ''}`,
        });
      }
    });

    const url = `http://127.0.0.1:${port}`;
    await waitForHealth(`${url}${healthPath}`, 30_000);

    return setState(appId, { running: true, url, installing: false, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await stopEmbeddedApp(appId).catch(() => {});
    return setState(appId, { running: false, url: null, installing: false, error: message });
  }
}

export function stopEmbeddedApp(appId: string): Promise<EmbeddedAppState> {
  return new Promise((resolve) => {
    const inst = getOrCreate(appId);
    destroyEmbeddedAppView(appId);
    if (inst.token) {
      coreApiServer.revokeAppToken(inst.token);
      inst.token = null;
    }
    const proc = inst.process;
    if (!proc) {
      resolve(setState(appId, idleState(appId)));
      return;
    }
    inst.process = null; // marks the exit as intentional for the 'exit' handler above
    proc.once('exit', () => resolve(setState(appId, idleState(appId))));
    proc.kill('SIGINT');
    if (process.platform === 'win32' && proc.pid) {
      setTimeout(() => {
        if (!proc.killed) spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true });
      }, 1500);
    }
    setTimeout(() => resolve(setState(appId, idleState(appId))), 4000);
  });
}

export async function stopAllEmbeddedApps(): Promise<void> {
  await Promise.all([...instances.keys()].map((appId) => stopEmbeddedApp(appId)));
}
