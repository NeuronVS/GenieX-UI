// Low-level wrapper around the `geniex` CLI binary: locating it, running
// short commands and parsing their output (JSON or table), and spawning
// long-running commands (pull, serve) with streaming output.
//
// Nothing here knows about IPC or the renderer — see modelManager.ts,
// localImport.ts, and inferenceRuntime.ts for the higher-level operations
// that consume this.

import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type {
  CachedModel,
  HubModel,
  PrecisionCandidate,
  PrecisionQueryResult,
  PullProgress,
} from '@shared/types';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Locating the binary
// ---------------------------------------------------------------------------

const DEFAULT_INSTALL_PATH = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'GenieX CLI',
  'geniex.exe',
);

let cachedGeniexPath: string | null | undefined; // undefined = not checked yet

/** Resolve the geniex executable path, checking PATH first, then the default installer location. */
export async function findGeniexPath(): Promise<string | null> {
  if (cachedGeniexPath !== undefined) return cachedGeniexPath;

  try {
    const { stdout } = await execFileAsync('where', ['geniex']);
    const first = stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first) {
      cachedGeniexPath = first;
      return cachedGeniexPath;
    }
  } catch {
    // not on PATH — fall through to default location
  }

  if (fs.existsSync(DEFAULT_INSTALL_PATH)) {
    cachedGeniexPath = DEFAULT_INSTALL_PATH;
    return cachedGeniexPath;
  }

  cachedGeniexPath = null;
  return null;
}

/** Forget the cached path — call after installing so the next lookup re-checks. */
export function resetGeniexPathCache(): void {
  cachedGeniexPath = undefined;
}

export interface GeniexVersionInfo {
  cliVersion: string;
  raw: string;
}

export async function getGeniexVersion(): Promise<GeniexVersionInfo | null> {
  const bin = await findGeniexPath();
  if (!bin) return null;
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 10_000 });
    const match = stdout.match(/GenieX CLI Version:\s*(\S+)/);
    return { cliVersion: match?.[1] ?? stdout.trim(), raw: stdout };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ANSI / text helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|[\x00-\x08\x0e-\x1f]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

function baseArgs(dataDir: string | undefined): string[] {
  return dataDir ? ['--data-dir', dataDir] : [];
}

function baseEnv(hfToken: string | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (hfToken) env.GENIEX_HFTOKEN = hfToken;
  return env;
}

// ---------------------------------------------------------------------------
// geniex list --format json
// ---------------------------------------------------------------------------

export async function listCachedModels(dataDir: string): Promise<CachedModel[]> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  const { stdout } = await execFileAsync(
    bin,
    [...baseArgs(dataDir), 'list', '--format', 'json'],
    { timeout: 20_000, maxBuffer: 10 * 1024 * 1024 },
  );
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  return JSON.parse(trimmed) as CachedModel[];
}

export async function removeCachedModel(dataDir: string, name: string): Promise<void> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  await execFileAsync(bin, [...baseArgs(dataDir), 'remove', name, '-y'], {
    timeout: 60_000,
  });
}

// ---------------------------------------------------------------------------
// geniex model list --all  (table parsing — no JSON output exists for this)
// ---------------------------------------------------------------------------

/**
 * Parses a box-drawing table like:
 * ┌──────┬──────┬──────────┐
 * │ NAME │ TYPE │ CHIPSETS │
 * ├──────┼──────┼──────────┤
 * │ foo  │  llm │ a, b, c  │
 * └──────┴──────┴──────────┘
 */
function parseBoxTable(text: string): string[][] {
  const clean = stripAnsi(text);
  const rows: string[][] = [];
  for (const line of clean.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('│')) continue;
    const cells = trimmed
      .split('│')
      .slice(1, -1) // drop the empty strings before the first and after the last │
      .map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

export async function listHubModels(dataDir: string): Promise<HubModel[]> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  const { stdout } = await execFileAsync(
    bin,
    [...baseArgs(dataDir), 'model', 'list', '--all'],
    { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
  );
  const rows = parseBoxTable(stdout);
  if (rows.length === 0) return [];
  // First row is the header (NAME | TYPE | CHIPSETS) — skip it.
  return rows.slice(1).map(([name, type, chipsets]) => ({
    name,
    type: (type.toLowerCase() === 'vlm' ? 'vlm' : 'llm') as HubModel['type'],
    chipsets: chipsets.split(',').map((c) => c.trim()).filter(Boolean),
  }));
}

// ---------------------------------------------------------------------------
// Precision peek for HuggingFace models (SAFE: HF pulls always show a picker
// before touching the network for real weight bytes).
//
// IMPORTANT: never call this for AI Hub (qualcomm/*) models — those may have
// only one precision, in which case `geniex pull` skips the picker entirely
// and starts a real download immediately. Confirmed empirically.
// ---------------------------------------------------------------------------

const PRECISION_LINE_RE = /┃\s*>?\s*(\S+)\s*\[([\d.]+\s*[A-Za-z]+)\]/;
const DOWNLOADING_RE = /downloading\s+(\d+)%/i;

function parseSizeLabelToBytes(label: string): number | null {
  const m = label.match(/^([\d.]+)\s*([A-Za-z]+)$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
  };
  const mult = multipliers[unit];
  return mult ? Math.round(value * mult) : null;
}

export function queryHuggingFacePrecisions(
  bin: string,
  dataDir: string,
  hfToken: string | undefined,
  modelName: string,
): Promise<PrecisionQueryResult> {
  return new Promise((resolve, reject) => {
    const args = [...baseArgs(dataDir), 'pull', modelName, '--model-hub', 'hf'];
    const child = spawn(bin, args, { env: baseEnv(hfToken), stdio: ['pipe', 'pipe', 'pipe'] });

    let buffer = '';
    let settled = false;
    const candidates = new Map<string, PrecisionCandidate>();

    const finish = (result: PrecisionQueryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      clearTimeout(debounceTimer);
      child.kill();
      // Belt-and-suspenders: if kill() didn't stop it fast enough on Windows,
      // force it after a short grace period.
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead */
        }
      }, 1500);
      resolve(result);
    };

    let debounceTimer: NodeJS.Timeout;
    const scheduleDebouncedFinish = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        finish({
          modelName,
          isSinglePrecisionAutoStart: false,
          candidates: [...candidates.values()],
        });
      }, 400);
    };

    const onData = (chunk: Buffer) => {
      buffer += stripAnsi(chunk.toString('utf8'));

      if (DOWNLOADING_RE.test(buffer)) {
        // A real download started before any picker appeared — this model has
        // exactly one precision and the CLI auto-selected it. Abort immediately.
        finish({ modelName, isSinglePrecisionAutoStart: true, candidates: [] });
        return;
      }

      const lines = buffer.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(PRECISION_LINE_RE);
        if (m) {
          const [, precision, sizeLabel] = m;
          candidates.set(precision, {
            precision,
            sizeLabel,
            sizeBytes: parseSizeLabelToBytes(sizeLabel),
          });
        }
      }
      if (candidates.size > 0) scheduleDebouncedFinish();
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(safetyTimer);
        clearTimeout(debounceTimer);
        reject(err);
      }
    });

    // Absolute upper bound so a hung process can't leak forever.
    const safetyTimer = setTimeout(() => {
      finish({ modelName, isSinglePrecisionAutoStart: false, candidates: [...candidates.values()] });
    }, 15_000);
  });
}

// ---------------------------------------------------------------------------
// Pull with streaming progress
// ---------------------------------------------------------------------------

// Matches: "downloading  42% |bar| (123 MB/1.8 GB, 8.3 MB/s) [12s:1m30s]"
const PROGRESS_RE =
  /downloading\s+(\d+)%.*?\(([^/]+)\/([^,]+),\s*([^)]+)\)\s*\[([^:\]]+):([^\]]+)\]/i;

export interface PullHandle {
  requestId: string;
  cancel: () => void;
}

export function startPull(
  bin: string,
  dataDir: string,
  hfToken: string | undefined,
  requestId: string,
  modelName: string,
  precision: string | null,
  modelHub: 'hf' | 'aihub' | null,
  onProgress: (progress: PullProgress) => void,
): PullHandle {
  const target = precision ? `${modelName}:${precision}` : modelName;
  // --verbose so licensing / hub failures show a real message, not just exit 1.
  const args = [...baseArgs(dataDir), '--verbose', 'pull', target];
  if (modelHub) args.push('--model-hub', modelHub);

  const child: ChildProcess = spawn(bin, args, {
    env: baseEnv(hfToken),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let cancelled = false;
  const logTail: string[] = [];

  const emit = (partial: Partial<PullProgress>) => {
    onProgress({
      requestId,
      modelName,
      precision: precision ?? '',
      status: 'downloading',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speedLabel: null,
      etaLabel: null,
      message: null,
      ...partial,
    });
  };

  emit({ status: 'starting', message: 'Starting download…' });

  const rememberLogLine = (line: string) => {
    const cleaned = line.replace(/\r/g, '').trim();
    if (!cleaned) return;
    // Skip redraw-only progress noise; keep real messages / errors.
    if (PROGRESS_RE.test(cleaned) && !/error|fail|denied|restrict/i.test(cleaned)) return;
    logTail.push(cleaned);
    if (logTail.length > 40) logTail.shift();
  };

  const lastUsefulError = (): string | null => {
    for (let i = logTail.length - 1; i >= 0; i--) {
      const line = logTail[i]!;
      // Prefer explicit error lines; otherwise last non-spinner line.
      if (/^error\b/i.test(line) || /hub error|SDKError|failed|denied|restrict|unauthorized|not found/i.test(line)) {
        return line.replace(/^error:\s*/i, '').trim();
      }
    }
    const last = logTail[logTail.length - 1];
    return last && !/^🌍|^Downloading/i.test(last) ? last : null;
  };

  const onData = (chunk: Buffer) => {
    buffer += stripAnsi(chunk.toString('utf8'));
    // CLI redraws the bar with \r; also split on newlines for error text.
    const parts = buffer.split(/\r|\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      rememberLogLine(line);
      const m = line.match(PROGRESS_RE);
      if (m) {
        const [, percent, downloaded, total, speed] = m;
        emit({
          status: 'downloading',
          percent: Number(percent),
          downloadedBytes: parseSizeLabelToBytes(downloaded.trim().replace(' ', '')),
          totalBytes: parseSizeLabelToBytes(total.trim().replace(' ', '')),
          speedLabel: speed.trim(),
        });
      }
    }
  };

  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  child.on('close', (code) => {
    if (buffer.trim()) rememberLogLine(buffer);
    if (cancelled) {
      emit({ status: 'cancelled', message: 'Download cancelled' });
    } else if (code === 0) {
      emit({ status: 'completed', percent: 100, message: 'Download complete' });
    } else {
      const detail = lastUsefulError();
      emit({
        status: 'error',
        message: detail
          ? detail
          : `geniex exited with code ${code}`,
      });
    }
  });

  child.on('error', (err) => {
    emit({ status: 'error', message: err.message });
  });

  return {
    requestId,
    cancel: () => {
      cancelled = true;
      // Try a graceful interrupt first; the CLI handles SIGINT cleanly and
      // leaves a resumable partial download. Windows' child_process.kill()
      // does not deliver a real Ctrl+C, but it does terminate the process;
      // fall back to taskkill for a more forceful stop if needed.
      child.kill('SIGINT');
      if (process.platform === 'win32' && child.pid) {
        setTimeout(() => {
          if (!child.killed) {
            spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
          }
        }, 2000);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Local import: `geniex pull local/<name> --model-hub localfs --local-path <path>`
// Note this COPIES the source into GenieX's cache (confirmed in docs) — the
// caller should warn the user about transient 2x disk usage before starting.
// ---------------------------------------------------------------------------

export function startLocalImport(
  bin: string,
  dataDir: string,
  requestId: string,
  modelName: string,
  sourcePath: string,
  onProgress: (progress: PullProgress) => void,
): PullHandle {
  const target = `local/${modelName}`;
  const args = [
    ...baseArgs(dataDir),
    'pull',
    target,
    '--model-hub',
    'localfs',
    '--local-path',
    sourcePath,
  ];

  const child: ChildProcess = spawn(bin, args, {
    env: baseEnv(undefined),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let cancelled = false;
  const logTail: string[] = [];

  const emit = (partial: Partial<PullProgress>) => {
    onProgress({
      requestId,
      modelName: target,
      precision: '',
      status: 'downloading',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speedLabel: null,
      etaLabel: null,
      message: null,
      ...partial,
    });
  };

  emit({ status: 'starting', message: 'Copying model files…' });

  const rememberLogLine = (line: string) => {
    const cleaned = line.replace(/\r/g, '').trim();
    if (!cleaned) return;
    if (PROGRESS_RE.test(cleaned) && !/error|fail/i.test(cleaned)) return;
    logTail.push(cleaned);
    if (logTail.length > 40) logTail.shift();
  };

  const onData = (chunk: Buffer) => {
    buffer += stripAnsi(chunk.toString('utf8'));
    const parts = buffer.split(/\r|\n/);
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      rememberLogLine(line);
      const m = line.match(PROGRESS_RE);
      if (m) {
        const [, percent, done, total, speed] = m;
        emit({
          status: 'downloading',
          percent: Number(percent),
          downloadedBytes: parseSizeLabelToBytes(done.trim().replace(' ', '')),
          totalBytes: parseSizeLabelToBytes(total.trim().replace(' ', '')),
          speedLabel: speed.trim(),
        });
      }
    }
  };

  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  child.on('close', (code) => {
    if (buffer.trim()) rememberLogLine(buffer);
    if (cancelled) emit({ status: 'cancelled', message: 'Import cancelled' });
    else if (code === 0) emit({ status: 'completed', percent: 100, message: 'Import complete' });
    else {
      const detail =
        [...logTail]
          .reverse()
          .find((l) => /^error\b|failed|denied/i.test(l))
          ?.replace(/^error:\s*/i, '')
          .trim() || logTail[logTail.length - 1];
      emit({
        status: 'error',
        message: detail || `geniex exited with code ${code}`,
      });
    }
  });

  child.on('error', (err) => emit({ status: 'error', message: err.message }));

  return {
    requestId,
    cancel: () => {
      cancelled = true;
      child.kill('SIGINT');
      if (process.platform === 'win32' && child.pid) {
        setTimeout(() => {
          if (!child.killed) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
        }, 2000);
      }
    },
  };
}

export { execFileAsync };
