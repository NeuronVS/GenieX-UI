// Types shared between the Electron main process (electron/) and the React
// renderer (src/). Keep this file free of any Node- or DOM-only APIs.

/**
 * The only quantizations we allow the UI to surface, per hardware guidance:
 *  - Q4_0 (default): Hexagon NPU, best NPU support, recommended for most models
 *  - Q8_0: GPU/CPU, ~2x the disk/memory cost of Q4_0
 *  - F16: GPU/CPU, reference precision — large and slow, evaluation only
 * Anything else the CLI/hub offers (Q4_K_M, Q5_K_M, w4a16, w4, BF16, ...) must
 * never reach the UI. This list is the single source of truth for filtering.
 */
export const ALLOWED_PRECISIONS = ['Q4_0', 'Q8_0', 'F16'] as const;
export type AllowedPrecision = (typeof ALLOWED_PRECISIONS)[number];

export type ModelRuntime = 'llama_cpp' | 'qairt';
export type ModelType = 'llm' | 'vlm';

/** One row from `geniex list --format json` — a model already cached locally. */
export interface CachedModel {
  name: string;
  /** Total cached size across all downloaded precisions, in bytes. */
  size: number;
  runtime: ModelRuntime;
  type: ModelType;
  /** Precisions currently downloaded for this model (unfiltered, as reported by the CLI). */
  precisions: string[];
}

/** One row parsed from the `geniex model list --all` table (Qualcomm AI Hub catalog). */
export interface HubModel {
  name: string;
  type: ModelType;
  chipsets: string[];
}

/** A single precision option surfaced by the pull picker peek, before download. */
export interface PrecisionCandidate {
  precision: string;
  sizeLabel: string;
  sizeBytes: number | null;
}

/** Result of querying available precisions for a model before downloading. */
export interface PrecisionQueryResult {
  modelName: string;
  /** True for Qualcomm AI Hub (qairt) models where the CLI may auto-start a download
   *  with no picker if there's only one precision — callers must not treat this like
   *  a safe "peek" the way HF queries are. */
  isSinglePrecisionAutoStart: boolean;
  candidates: PrecisionCandidate[];
}

export type PullStatus = 'starting' | 'downloading' | 'completed' | 'cancelled' | 'error';

export interface PullProgress {
  requestId: string;
  modelName: string;
  precision: string;
  status: PullStatus;
  percent: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speedLabel: string | null;
  etaLabel: string | null;
  message: string | null;
}

export type ActiveModelStatus = 'idle' | 'starting' | 'loaded' | 'stopping' | 'error';

export interface ActiveModelState {
  modelName: string | null;
  status: ActiveModelStatus;
  error: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Local OpenAI-compatible GenieX serve endpoint (must match inferenceRuntime). */
export const GENIEX_SERVE_HOST = '127.0.0.1';
export const GENIEX_SERVE_PORT = 18181;
export const GENIEX_OPENAI_BASE_URL = `http://${GENIEX_SERVE_HOST}:${GENIEX_SERVE_PORT}/v1`;

/** Live NPU / RAM sample pushed from the main process (~1 Hz). */
export interface SystemMetricsSnapshot {
  ts: number;
  npu: {
    available: boolean;
    name: string | null;
    /** 0–100, or null when NPU isn't available on this machine. */
    percent: number | null;
    /** Newest-last utilization history for the sparkline (0–100). */
    history: number[];
  };
  ram: {
    usedBytes: number;
    totalBytes: number;
    percent: number;
    history: number[];
  };
}

export interface DiskSpaceInfo {
  diskPath: string;
  freeBytes: number;
  totalBytes: number;
}

export interface AppSettings {
  dataDir: string;
  hfToken: string;
  /** Workspace folder OpenCode is allowed to edit. */
  projectDir: string;
}

export interface OpenCodeState {
  installed: boolean;
  version: string | null;
  running: boolean;
  url: string | null;
  projectDir: string | null;
  installing: boolean;
  progressMessage: string | null;
  error: string | null;
}

export interface CliSetupState {
  installed: boolean;
  version: string | null;
  installing: boolean;
  progressMessage: string | null;
  error: string | null;
}

export interface LocalImportRequest {
  sourcePath: string;
  modelName: string;
}
