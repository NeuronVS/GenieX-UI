// Load/unload: manages a single background `geniex serve` process.
//
// GenieX's OpenAI-compatible server loads models on-demand per request and
// has no separate "unload just this model" endpoint (confirmed against the
// CLI's `serve --help`). Combined with the product decision to support only
// one active model at a time, the mapping is:
//   Load(model)   -> ensure `geniex serve` is running, then send a tiny
//                     warm-up request naming the model to force it into
//                     memory before reporting "loaded".
//   Unload()      -> stop the whole `geniex serve` process.
//   Load(other)   -> Unload() the current one, then Load(other).
//
// NOTE: the assumption that a 1-token warm-up request actually forces the
// model into NPU/GPU memory (rather than only queuing lazy load on the next
// *real* request) needs empirical validation — see the note in loadModel().

import { spawn, type ChildProcess } from 'node:child_process';
import { findGeniexPath } from './geniexCli';
import { getSettings } from './storageConfig';
import {
  GENIEX_OPENAI_BASE_URL,
  GENIEX_SERVE_HOST,
  GENIEX_SERVE_PORT,
  type ActiveModelState,
  type ChatMessage,
} from '@shared/types';
import { syncOpenCodeModel } from './opencodeConfig';

let serverProcess: ChildProcess | null = null;
let state: ActiveModelState = { modelName: null, status: 'idle', error: null };
let listeners: Array<(s: ActiveModelState) => void> = [];

export function onActiveModelStateChanged(cb: (s: ActiveModelState) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function setState(next: Partial<ActiveModelState>) {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

export function getActiveModelState(): ActiveModelState {
  return state;
}

async function waitForServerReady(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${GENIEX_OPENAI_BASE_URL}/models`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok || res.status === 404) return; // reachable is enough, even if this route 404s
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for GenieX server to start');
}

async function ensureServerRunning(): Promise<void> {
  if (serverProcess && !serverProcess.killed) return;

  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  const { dataDir } = getSettings();

  serverProcess = spawn(
    bin,
    ['--data-dir', dataDir, 'serve', '--host', `${GENIEX_SERVE_HOST}:${GENIEX_SERVE_PORT}`],
    { stdio: 'ignore' },
  );
  serverProcess.on('exit', () => {
    serverProcess = null;
    if (state.status === 'loaded' || state.status === 'starting') {
      setState({ modelName: null, status: 'idle', error: null });
    }
  });

  await waitForServerReady(20_000);
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    const proc = serverProcess;
    proc.once('exit', () => resolve());
    proc.kill('SIGINT');
    if (process.platform === 'win32' && proc.pid) {
      setTimeout(() => {
        if (!proc.killed) spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f']);
      }, 2000);
    }
    // Safety net in case 'exit' never fires.
    setTimeout(resolve, 5000);
  });
}

export async function loadModel(modelName: string): Promise<ActiveModelState> {
  if (state.modelName === modelName && state.status === 'loaded') return state;
  if (state.modelName && state.modelName !== modelName) {
    await unloadModel();
  }

  setState({ modelName, status: 'starting', error: null });
  try {
    await ensureServerRunning();

    // Warm-up request: forces the model to load now rather than on the
    // caller's first real message. NEEDS VALIDATION (see file header) —
    // if this doesn't reliably force a load, switch to reporting "loaded"
    // optimistically once the server is reachable, and let the first real
    // chat request eat the load latency instead.
    const res = await fetch(`${GENIEX_OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(120_000), // first load can be slow
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Warm-up request failed: HTTP ${res.status} ${body}`.trim());
    }

    setState({ modelName, status: 'loaded', error: null });
    syncOpenCodeModel(modelName);
    return state;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState({ modelName, status: 'error', error: message });
    throw err;
  }
}

export async function unloadModel(): Promise<ActiveModelState> {
  if (state.status === 'idle' && !serverProcess) return state;
  setState({ ...state, status: 'stopping' });
  await stopServer();
  setState({ modelName: null, status: 'idle', error: null });
  syncOpenCodeModel(null);
  return state;
}

/** Chat completions from the main process — avoids renderer CORS against geniex serve. */
export async function chatCompletions(messages: ChatMessage[]): Promise<string> {
  if (state.status !== 'loaded' || !state.modelName) {
    throw new Error('No model loaded. Load one in My Models first.');
  }
  await ensureServerRunning();

  const res = await fetch(`${GENIEX_OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: state.modelName,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Chat failed: HTTP ${res.status}${body ? ` ${body.slice(0, 240)}` : ''}`.trim());
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || '(empty reply)';
}
