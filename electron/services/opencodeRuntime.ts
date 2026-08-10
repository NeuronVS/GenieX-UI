// Bridges GenieX → OpenCode web UI.
//
// We do NOT vendor OpenCode. We write an opencode.json that points at the
// local GenieX OpenAI endpoint, then spawn `opencode web` and embed that URL.
// Docs: https://opencode.ai/docs/web/ and https://opencode.ai/docs/providers/

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OpenCodeState } from '@shared/types';
import { getSettings } from './storageConfig';
import { getActiveModelState } from './inferenceRuntime';
import {
  OPENCODE_PORT,
  OPENCODE_URL,
  writeOpenCodeConfig,
} from './opencodeConfig';
import { destroyOpenCodeView } from './opencodeView';

const execFileAsync = promisify(execFile);

export { OPENCODE_PORT, OPENCODE_URL };

let processHandle: ChildProcess | null = null;
let state: OpenCodeState = {
  installed: false,
  version: null,
  running: false,
  url: null,
  projectDir: null,
  installing: false,
  progressMessage: null,
  error: null,
};
let installing = false;
let listeners: Array<(s: OpenCodeState) => void> = [];
let cachedBin: string | null | undefined;

export function onOpenCodeStateChanged(cb: (s: OpenCodeState) => void): () => void {
  listeners.push(cb);
  cb(getOpenCodeState());
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function setState(next: Partial<OpenCodeState>) {
  state = { ...state, ...next };
  for (const l of listeners) l(getOpenCodeState());
}

export function getOpenCodeState(): OpenCodeState {
  return {
    ...state,
    projectDir: getSettings().projectDir || null,
    running: !!(processHandle && !processHandle.killed),
    url: processHandle && !processHandle.killed ? OPENCODE_URL : null,
  };
}

/** Prefer a real Windows executable over the unix `#!/bin/sh` npm shim. */
function pickWindowsBin(candidates: string[]): string | null {
  const existing = candidates.filter((p) => p && fs.existsSync(p));
  const exe = existing.find((p) => p.toLowerCase().endsWith('.exe'));
  if (exe) return exe;
  const cmd = existing.find((p) => p.toLowerCase().endsWith('.cmd'));
  if (cmd) return cmd;
  // Last resort: skip extensionless shims (they crash spawn on Windows).
  return existing.find((p) => path.extname(p) !== '') ?? null;
}

async function findOpenCodeBin(): Promise<string | null> {
  if (cachedBin !== undefined) return cachedBin;

  const candidates: string[] = [];

  try {
    const { stdout } = await execFileAsync('where', ['opencode'], { windowsHide: true });
    for (const line of stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      candidates.push(line);
      // If where returned the unix shim, also try sibling .cmd / resolved exe.
      if (!path.extname(line)) {
        candidates.push(`${line}.cmd`);
        candidates.push(
          path.join(path.dirname(line), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        );
      }
      if (line.toLowerCase().endsWith('.cmd')) {
        candidates.push(
          path.join(path.dirname(line), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        );
      }
    }
  } catch {
    // not on PATH
  }

  candidates.push(
    path.join(
      process.cwd(),
      'node_modules',
      'opencode-ai',
      'bin',
      process.platform === 'win32' ? 'opencode.exe' : 'opencode',
    ),
  );

  try {
    const npmCmd = await resolveNpmCmd();
    const { stdout } = await execFileAsync(npmCmd, ['root', '-g'], {
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    const root = stdout.trim().split(/\r?\n/).pop()?.trim();
    if (root) {
      candidates.push(
        path.join(root, 'opencode-ai', 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode'),
      );
    }
  } catch {
    // ignore
  }

  const picked =
    process.platform === 'win32' ? pickWindowsBin(candidates) : candidates.find((p) => fs.existsSync(p)) ?? null;

  cachedBin = picked;
  return cachedBin;
}

export function resetOpenCodeBinCache(): void {
  cachedBin = undefined;
}

export async function refreshOpenCodeInstallState(): Promise<OpenCodeState> {
  const bin = await findOpenCodeBin();
  let version: string | null = null;
  if (bin) {
    try {
      const { stdout } = await execFileAsync(bin, ['--version'], {
        timeout: 10_000,
        windowsHide: true,
        shell: bin.toLowerCase().endsWith('.cmd'),
      });
      version = stdout.trim().split(/\r?\n/)[0] ?? null;
    } catch {
      version = null;
    }
  }
  setState({
    installed: !!bin,
    version,
    installing: false,
    progressMessage: null,
    error: null,
  });
  return getOpenCodeState();
}

async function resolveNpmCmd(): Promise<string> {
  if (process.platform !== 'win32') return 'npm';
  try {
    const { stdout } = await execFileAsync('where', ['npm.cmd'], { windowsHide: true });
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (first) return first;
  } catch {
    // fall through
  }
  return 'npm.cmd';
}

/** Global install via npm (with postinstall scripts so the binary downloads). */
export async function installOpenCode(): Promise<OpenCodeState> {
  if (installing) return getOpenCodeState();
  installing = true;
  setState({
    installing: true,
    progressMessage: 'Installing OpenCode CLI…',
    error: null,
  });

  try {
    const npmCmd = await resolveNpmCmd();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        npmCmd,
        ['install', '-g', '--allow-scripts=opencode-ai', 'opencode-ai@latest'],
        {
          windowsHide: true,
          shell: process.platform === 'win32',
          env: { ...process.env },
        },
      );

      let lastLine = '';
      const onData = (buf: Buffer) => {
        const text = buf.toString('utf8');
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length > 0) {
          lastLine = lines[lines.length - 1]!;
          setState({
            installing: true,
            progressMessage: lastLine.slice(0, 160),
            error: null,
          });
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(lastLine || `npm install failed (exit ${code})`));
      });
    });

    resetOpenCodeBinCache();
    try {
      const { stdout } = await execFileAsync(await resolveNpmCmd(), ['root', '-g'], {
        windowsHide: true,
        shell: process.platform === 'win32',
      });
      const root = stdout.trim().split(/\r?\n/).pop()?.trim();
      if (root) {
        const candidate = path.join(
          root,
          'opencode-ai',
          'bin',
          process.platform === 'win32' ? 'opencode.exe' : 'opencode',
        );
        if (fs.existsSync(candidate)) cachedBin = candidate;
      }
    } catch {
      // refresh below will still try PATH
    }

    const refreshed = await refreshOpenCodeInstallState();
    if (!refreshed.installed) {
      setState({
        installing: false,
        progressMessage: null,
        error:
          'Install finished but opencode was not found. Close and reopen the app, or ensure npm’s global bin is on PATH.',
      });
      return getOpenCodeState();
    }
    setState({
      installing: false,
      progressMessage: null,
      error: null,
      installed: true,
      version: refreshed.version,
    });
    return getOpenCodeState();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState({ installing: false, progressMessage: null, error: message });
    return getOpenCodeState();
  } finally {
    installing = false;
  }
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${OPENCODE_URL}/global/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Timed out waiting for OpenCode web server');
}

/** No-op "browser" so `opencode web` doesn't pop Edge/Chrome outside our app. */
function ensureNoopBrowser(): string {
  const p = path.join(os.tmpdir(), 'geniex-noop-browser.cmd');
  fs.writeFileSync(p, '@echo off\r\nexit /b 0\r\n', 'utf8');
  return p;
}

function spawnOpenCode(bin: string, projectDir: string): ChildProcess {
  const useShell = bin.toLowerCase().endsWith('.cmd') || bin.toLowerCase().endsWith('.bat');
  const noopBrowser = ensureNoopBrowser();
  const child = spawn(
    bin,
    [
      'web',
      '--port',
      String(OPENCODE_PORT),
      '--hostname',
      '127.0.0.1',
      '--cors',
      'http://localhost:5173',
      '--cors',
      'http://127.0.0.1:5173',
    ],
    {
      cwd: projectDir,
      windowsHide: true,
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // `open` npm package / Windows start honor BROWSER
        BROWSER: noopBrowser,
      },
    },
  );
  return child;
}

export async function startOpenCode(): Promise<OpenCodeState> {
  try {
    if (processHandle && !processHandle.killed) {
      return getOpenCodeState();
    }

    const active = getActiveModelState();
    if (active.status !== 'loaded' || !active.modelName) {
      setState({ error: 'Load a GenieX model first (My Models → Load).' });
      return getOpenCodeState();
    }

    const projectDir = getSettings().projectDir;
    if (!projectDir || !fs.existsSync(projectDir)) {
      setState({ error: 'Choose a project folder in Settings (files OpenCode will edit).' });
      return getOpenCodeState();
    }

    const bin = await findOpenCodeBin();
    if (!bin) {
      setState({
        installed: false,
        error: 'OpenCode CLI not found. Install it from Settings → OpenCode CLI.',
      });
      return getOpenCodeState();
    }

    try {
      writeOpenCodeConfig(active.modelName, projectDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ error: `Failed to write opencode.json: ${message}` });
      return getOpenCodeState();
    }

    setState({ error: null, running: false });

    let stderr = '';
    const child = spawnOpenCode(bin, projectDir);
    processHandle = child;

    child.stderr?.on('data', (buf: Buffer) => {
      stderr = (stderr + buf.toString('utf8')).slice(-2000);
    });

    child.on('error', (err) => {
      processHandle = null;
      setState({
        running: false,
        url: null,
        error: `Failed to start OpenCode: ${err.message}`,
      });
    });

    child.on('exit', (code) => {
      if (processHandle === child) processHandle = null;
      if (state.running || state.error == null) {
        setState({
          running: false,
          url: null,
          error:
            code && code !== 0
              ? `OpenCode exited (code ${code})${stderr ? `: ${stderr.trim()}` : ''}`
              : null,
        });
      }
    });

    try {
      await waitForServer(45_000);
      setState({ running: true, url: OPENCODE_URL, installed: true, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = stderr.trim() ? `${message} — ${stderr.trim()}` : message;
      await stopOpenCode();
      setState({ error: detail, running: false, url: null });
    }

    return getOpenCodeState();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState({ error: message, running: false, url: null });
    return getOpenCodeState();
  }
}

export async function stopOpenCode(): Promise<OpenCodeState> {
  destroyOpenCodeView();
  if (!processHandle) {
    setState({ running: false, url: null });
    return getOpenCodeState();
  }
  const proc = processHandle;
  processHandle = null;
  await new Promise<void>((resolve) => {
    proc.once('exit', () => resolve());
    try {
      proc.kill();
    } catch {
      // already gone
    }
    if (process.platform === 'win32' && proc.pid) {
      setTimeout(() => {
        spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      }, 1500);
    }
    setTimeout(resolve, 4000);
  });
  setState({ running: false, url: null });
  return getOpenCodeState();
}
