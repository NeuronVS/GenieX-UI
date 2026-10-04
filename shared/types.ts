// Types shared between the Electron main process (electron/) and the React
// renderer (src/). Keep this file free of any Node- or DOM-only APIs.

/**
 * The only quantizations we allow the UI to surface, per hardware guidance:
 *  - Q4_0 (default): Hexagon NPU, best NPU support, recommended for most llama.cpp/GGUF models
 *  - Q8_0: GPU/CPU, ~2x the disk/memory cost of Q4_0
 *  - F16: GPU/CPU, reference precision — large and slow, evaluation only
 *  - W4A16: Qualcomm AI Hub's native qairt (NPU) pre-quantized format — the
 *    format Qualcomm's own catalog models actually ship in
 * Anything else the CLI/hub offers (Q4_K_M, Q5_K_M, w4, BF16, ...) must never
 * reach the UI. This list is the single source of truth for filtering.
 */
export const ALLOWED_PRECISIONS = ['Q4_0', 'Q8_0', 'F16', 'W4A16'] as const;
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

/**
 * Model scheduler — only one model can be loaded at a time, so callers
 * *request* one with a priority rather than commanding a load directly.
 * `interactive` always preempts immediately; `background` is only granted
 * when nothing interactive holds the model and the OS has been idle past a
 * short threshold. See electron/services/modelScheduler.ts.
 */
export type ModelRequestPriority = 'interactive' | 'background';

export interface ModelRequest {
  modelName: string;
  priority: ModelRequestPriority;
}

export interface ModelRequestResult {
  granted: boolean;
  activeModel: string | null;
  /** Set when denied — suggested backoff before retrying, in ms. */
  retryAfterMs?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** One message stored in a chat thread (may include optional thinking trace). */
export interface ChatThreadMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
}

/** A persisted chat conversation. */
export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatThreadMessage[];
  /** Model that was active when last messaged (informational). */
  modelName?: string | null;
}

/** Lightweight row for the chat history list. */
export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
}

/** Stats for the last streamed assistant reply (shown under the chat composer). */
export interface ChatCompletionStats {
  /** Wall-clock duration of the generation (first byte → done). */
  elapsedMs: number;
  completionTokens: number | null;
  promptTokens: number | null;
  /** Tokens / second for the completion; null if we couldn't measure. */
  tokensPerSecond: number | null;
  /** True when completionTokens were estimated (~chars/4), not from the server. */
  estimated: boolean;
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

/** One installable / builtin mini-app from the Neuron apps catalog. */
export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  builtin: boolean;
  requiredModels: string[];
  /** `builtin:chat` | `builtin:code` | `embedded:<id>` | `placeholder` | future remote entries */
  entry: string;
  memoryTags?: string[];
  /**
   * Present for apps embedded via the Core API platform (see
   * embeddedAppRuntime.ts) — a separately-built app Neuron spawns as its own
   * process and hosts in a BrowserView, rather than a screen in this bundle.
   * `command`/`args` are opaque to Neuron; how the app got installed onto
   * the machine in the first place is intentionally out of scope here.
   */
  embed?: {
    command: string;
    args?: string[];
    /** Path on the child's own port to poll for readiness. Default '/'. */
    healthPath?: string;
  };
}

export interface AppsCatalog {
  apps: CatalogApp[];
}

/** Lifecycle state of one Core-API-embedded app's spawned process. */
export interface EmbeddedAppState {
  appId: string;
  running: boolean;
  url: string | null;
  installing: boolean;
  error: string | null;
}

/**
 * One curated, Neuron-published GGUF model — hand-vetted precisions, so no
 * "check available precisions" round-trip is needed before downloading.
 */
export interface OptimizedModel {
  id: string;
  name: string;
  description: string;
  /** HuggingFace repo id, e.g. "NeuronVS/Qwen3-4B-Neuron-GGUF". */
  hfRepo: string;
  type: ModelType;
  /** Precisions actually published for this repo (subset of ALLOWED_PRECISIONS). */
  precisions: string[];
}

export interface OptimizedModelsCatalog {
  models: OptimizedModel[];
}

export interface InstalledApp {
  id: string;
  version: string;
  installedAt: string;
}

export interface MemoryEntry {
  id: string;
  appId: string;
  tags: string[];
  text: string;
  createdAt: string;
  meta?: Record<string, string>;
}

export interface MemorySearchQuery {
  /** Omit or null = search all apps */
  appId?: string | null;
  tags?: string[];
  /** Substring match against text (case-insensitive) */
  query?: string;
  limit?: number;
}

/* --- File Organizer -------------------------------------------------- */

/**
 * v1 scope: index/tag only, nothing on disk is moved or renamed.
 * pdf/docx/text get LLM summary + tags; image/other get metadata only
 * (no vision model — see project memory on the app platform / scheduler).
 */
export type FileOrganizerKind = 'pdf' | 'docx' | 'text' | 'image' | 'other';

/** A folder the user added to be indexed. */
export interface FileOrganizerRoot {
  id: string;
  path: string;
  addedAt: string;
  lastScanAt: string | null;
}

/** One file discovered under a root, with LLM-derived metadata when applicable. */
export interface FileOrganizerEntry {
  path: string;
  rootId: string;
  name: string;
  ext: string;
  kind: FileOrganizerKind;
  sizeBytes: number;
  modifiedAt: string;
  /** LLM-generated summary; null for image/other kinds or if summarization failed. */
  summary: string | null;
  /** LLM-suggested tags; empty for image/other kinds or if summarization failed. */
  tags: string[];
  /** Set when extraction/summarization failed for this file; entry is still indexed. */
  error: string | null;
  /** Small data: URL preview, currently generated for images only; null otherwise. */
  thumbnail: string | null;
}

export type FileOrganizerScanStatus = 'scanning' | 'completed' | 'cancelled' | 'error';

export interface FileOrganizerScanProgress {
  rootId: string;
  status: FileOrganizerScanStatus;
  scanned: number;
  total: number;
  currentFile: string | null;
  message: string | null;
}

/**
 * Live filesystem browsing for the File Manager app's Explorer view. Unlike
 * FileOrganizerEntry (a persisted LLM-index record), these are read straight
 * off disk on every navigation — nothing is cached in electron-store.
 */
export interface ExplorerEntry {
  /** Absolute path. */
  path: string;
  name: string;
  isDirectory: boolean;
  /** Bytes for files; 0 for directories. */
  sizeBytes: number;
  modifiedAt: string;
  /** Lowercased extension incl. dot (''+ for directories / extensionless). */
  ext: string;
  /** True for junctions/symlinks — the tree does not recurse into these. */
  isSymbolicLink: boolean;
}

/** A shortcut shown in the Explorer navigation pane (Quick access / drives). */
export interface ExplorerPlace {
  path: string;
  label: string;
  icon: string;
}

export interface ExplorerPathInfo {
  exists: boolean;
  isDirectory: boolean;
}

/** Per-item result of a move/copy/trash batch. */
export interface ExplorerOpResult {
  path: string;
  ok: boolean;
  error?: string;
}

/** One file the model wants moved into a (possibly new) subfolder of the current directory. */
export interface OrganizeMove {
  /** Exact current filename (direct child of the organized directory). */
  file: string;
  /** Target subfolder name (simple name, no separators). */
  toFolder: string;
}

/** The model's proposed reorganization of a single folder. */
export interface OrganizePlan {
  moves: OrganizeMove[];
  /** One-sentence explanation of the grouping, for the confirmation dialog. */
  rationale: string;
}
