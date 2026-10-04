// Safe IPC surface exposed to the renderer as `window.geniex`. No Node or
// Electron APIs are exposed directly — every call is a named, typed method
// that forwards to a single fixed ipcMain channel.

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  AppSettings,
  AppsCatalog,
  CachedModel,
  CliSetupState,
  DiskSpaceInfo,
  HubModel,
  InstalledApp,
  MemoryEntry,
  MemorySearchQuery,
  OptimizedModelsCatalog,
  PrecisionQueryResult,
  PullProgress,
  ActiveModelState,
  ChatCompletionStats,
  ChatMessage,
  ChatThread,
  ChatThreadSummary,
  SystemMetricsSnapshot,
  OpenCodeState,
  FileOrganizerRoot,
  FileOrganizerEntry,
  FileOrganizerScanProgress,
  EmbeddedAppState,
  ExplorerEntry,
  ExplorerPlace,
  ExplorerPathInfo,
  ExplorerOpResult,
  OrganizeMove,
  OrganizePlan,
} from '../shared/types';

const api = {
  setup: {
    getState: (): Promise<CliSetupState> => ipcRenderer.invoke(IPC.setupGetState),
    install: (): Promise<CliSetupState> => ipcRenderer.invoke(IPC.setupInstall),
    onProgress: (cb: (state: CliSetupState) => void) => {
      const listener = (_e: unknown, state: CliSetupState) => cb(state);
      ipcRenderer.on(IPC.setupProgress, listener);
      return () => ipcRenderer.removeListener(IPC.setupProgress, listener);
    },
  },
  hub: {
    listModels: (): Promise<HubModel[]> => ipcRenderer.invoke(IPC.hubListModels),
    queryPrecisions: (modelName: string): Promise<PrecisionQueryResult> =>
      ipcRenderer.invoke(IPC.hubQueryPrecisions, modelName),
  },
  optimized: {
    getCatalog: (): Promise<OptimizedModelsCatalog> => ipcRenderer.invoke(IPC.optimizedGetCatalog),
    refreshCatalog: (): Promise<OptimizedModelsCatalog> =>
      ipcRenderer.invoke(IPC.optimizedRefreshCatalog),
  },
  models: {
    list: (): Promise<CachedModel[]> => ipcRenderer.invoke(IPC.modelsList),
    remove: (name: string): Promise<void> => ipcRenderer.invoke(IPC.modelsRemove, name),
  },
  pull: {
    start: (opts: {
      modelName: string;
      precision: string | null;
      modelHub: 'hf' | 'aihub' | null;
    }): Promise<string> => ipcRenderer.invoke(IPC.pullStart, opts),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke(IPC.pullCancel, requestId),
    onProgress: (cb: (progress: PullProgress) => void) => {
      const listener = (_e: unknown, progress: PullProgress) => cb(progress);
      ipcRenderer.on(IPC.pullProgress, listener);
      return () => ipcRenderer.removeListener(IPC.pullProgress, listener);
    },
  },
  import: {
    pickPath: (): Promise<string | null> => ipcRenderer.invoke(IPC.importPickPath),
    start: (opts: { sourcePath: string; modelName: string }): Promise<string> =>
      ipcRenderer.invoke(IPC.importStart, opts),
  },
  runtime: {
    getActive: (): Promise<ActiveModelState> => ipcRenderer.invoke(IPC.runtimeGetActive),
    load: (modelName: string): Promise<ActiveModelState> => ipcRenderer.invoke(IPC.runtimeLoad, modelName),
    unload: (): Promise<ActiveModelState> => ipcRenderer.invoke(IPC.runtimeUnload),
    onStateChanged: (cb: (state: ActiveModelState) => void) => {
      const listener = (_e: unknown, state: ActiveModelState) => cb(state);
      ipcRenderer.on(IPC.runtimeStateChanged, listener);
      return () => ipcRenderer.removeListener(IPC.runtimeStateChanged, listener);
    },
  },
  chat: {
    completions: (messages: ChatMessage[]): Promise<string> =>
      ipcRenderer.invoke(IPC.chatCompletions, messages),
    /** Stream deltas via onChunk; resolves with final content + tokens/s stats. */
    completionsStream: (
      messages: ChatMessage[],
      onChunk: (text: string) => void,
    ): Promise<{ content: string; stats: ChatCompletionStats }> => {
      const listener = (_e: unknown, text: string) => onChunk(text);
      ipcRenderer.on(IPC.chatStreamChunk, listener);
      return ipcRenderer
        .invoke(IPC.chatCompletionsStream, messages)
        .finally(() => ipcRenderer.removeListener(IPC.chatStreamChunk, listener));
    },
    history: {
      list: (): Promise<ChatThreadSummary[]> => ipcRenderer.invoke(IPC.chatHistoryList),
      get: (id: string): Promise<ChatThread | null> => ipcRenderer.invoke(IPC.chatHistoryGet, id),
      create: (): Promise<ChatThread> => ipcRenderer.invoke(IPC.chatHistoryCreate),
      save: (thread: ChatThread): Promise<ChatThread> =>
        ipcRenderer.invoke(IPC.chatHistorySave, thread),
      delete: (id: string): Promise<{ activeId: string | null; threads: ChatThreadSummary[] }> =>
        ipcRenderer.invoke(IPC.chatHistoryDelete, id),
      getActiveId: (): Promise<string | null> => ipcRenderer.invoke(IPC.chatHistoryGetActiveId),
      setActiveId: (id: string | null): Promise<void> =>
        ipcRenderer.invoke(IPC.chatHistorySetActiveId, id),
    },
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    setDataDir: (dir: string): Promise<void> => ipcRenderer.invoke(IPC.settingsSetDataDir, dir),
    setHfToken: (token: string): Promise<void> => ipcRenderer.invoke(IPC.settingsSetHfToken, token),
    setProjectDir: (dir: string): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetProjectDir, dir),
    pickDataDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsPickDataDir),
    pickProjectDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsPickProjectDir),
  },
  storage: {
    getDiskSpace: (forPath?: string): Promise<DiskSpaceInfo> =>
      ipcRenderer.invoke(IPC.storageGetDiskSpace, forPath),
  },
  metrics: {
    get: (): Promise<SystemMetricsSnapshot> => ipcRenderer.invoke(IPC.metricsGet),
    onChanged: (cb: (snap: SystemMetricsSnapshot) => void) => {
      const listener = (_e: unknown, snap: SystemMetricsSnapshot) => cb(snap);
      ipcRenderer.on(IPC.metricsChanged, listener);
      return () => ipcRenderer.removeListener(IPC.metricsChanged, listener);
    },
  },
  opencode: {
    getState: (): Promise<OpenCodeState> => ipcRenderer.invoke(IPC.opencodeGetState),
    start: (): Promise<OpenCodeState> => ipcRenderer.invoke(IPC.opencodeStart),
    stop: (): Promise<OpenCodeState> => ipcRenderer.invoke(IPC.opencodeStop),
    install: (): Promise<OpenCodeState> => ipcRenderer.invoke(IPC.opencodeInstall),
    refreshInstall: (): Promise<OpenCodeState> => ipcRenderer.invoke(IPC.opencodeRefreshInstall),
    showView: (bounds: { x: number; y: number; width: number; height: number }): Promise<boolean> =>
      ipcRenderer.invoke(IPC.opencodeShowView, bounds),
    hideView: (): Promise<void> => ipcRenderer.invoke(IPC.opencodeHideView),
    openWindow: (): Promise<void> => ipcRenderer.invoke(IPC.opencodeOpenWindow),
    onStateChanged: (cb: (state: OpenCodeState) => void) => {
      const listener = (_e: unknown, state: OpenCodeState) => cb(state);
      ipcRenderer.on(IPC.opencodeStateChanged, listener);
      return () => ipcRenderer.removeListener(IPC.opencodeStateChanged, listener);
    },
  },
  apps: {
    getCatalog: (): Promise<AppsCatalog> => ipcRenderer.invoke(IPC.appsGetCatalog),
    refreshCatalog: (): Promise<AppsCatalog> => ipcRenderer.invoke(IPC.appsRefreshCatalog),
    listInstalled: (): Promise<InstalledApp[]> => ipcRenderer.invoke(IPC.appsListInstalled),
    install: (id: string): Promise<InstalledApp[]> => ipcRenderer.invoke(IPC.appsInstall, id),
    uninstall: (id: string): Promise<InstalledApp[]> => ipcRenderer.invoke(IPC.appsUninstall, id),
  },
  memory: {
    upsert: (
      input: Omit<MemoryEntry, 'id' | 'createdAt'> & { id?: string },
    ): Promise<MemoryEntry> => ipcRenderer.invoke(IPC.memoryUpsert, input),
    search: (query: MemorySearchQuery): Promise<MemoryEntry[]> =>
      ipcRenderer.invoke(IPC.memorySearch, query),
    list: (appId?: string | null): Promise<MemoryEntry[]> =>
      ipcRenderer.invoke(IPC.memoryList, appId),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.memoryRemove, id),
  },
  system: {
    getArch: (): Promise<string> => ipcRenderer.invoke(IPC.systemGetArch),
  },
  fileOrganizer: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.fileOrganizerPickFolder),
    addRoot: (folderPath: string): Promise<FileOrganizerRoot[]> =>
      ipcRenderer.invoke(IPC.fileOrganizerAddRoot, folderPath),
    listRoots: (): Promise<FileOrganizerRoot[]> => ipcRenderer.invoke(IPC.fileOrganizerListRoots),
    removeRoot: (id: string): Promise<{ roots: FileOrganizerRoot[]; entries: FileOrganizerEntry[] }> =>
      ipcRenderer.invoke(IPC.fileOrganizerRemoveRoot, id),
    listEntries: (rootId?: string | null): Promise<FileOrganizerEntry[]> =>
      ipcRenderer.invoke(IPC.fileOrganizerListEntries, rootId),
    scanRoot: (rootId: string): Promise<void> => ipcRenderer.invoke(IPC.fileOrganizerScanRoot, rootId),
    cancelScan: (rootId: string): Promise<void> => ipcRenderer.invoke(IPC.fileOrganizerCancelScan, rootId),
    readFileBuffer: (filePath: string): Promise<Uint8Array> =>
      ipcRenderer.invoke(IPC.fileOrganizerReadFileBuffer, filePath),
    setThumbnail: (filePath: string, dataUrl: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.fileOrganizerSetThumbnail, filePath, dataUrl),
    onScanProgress: (cb: (progress: FileOrganizerScanProgress) => void) => {
      const listener = (_e: unknown, progress: FileOrganizerScanProgress) => cb(progress);
      ipcRenderer.on(IPC.fileOrganizerScanProgress, listener);
      return () => ipcRenderer.removeListener(IPC.fileOrganizerScanProgress, listener);
    },
  },
  /** File Manager — live filesystem Explorer (browses/moves/opens real files). */
  explorer: {
    listDirectory: (dirPath: string): Promise<ExplorerEntry[]> =>
      ipcRenderer.invoke(IPC.explorerListDirectory, dirPath),
    listDrives: (): Promise<ExplorerPlace[]> => ipcRenderer.invoke(IPC.explorerListDrives),
    quickAccess: (): Promise<ExplorerPlace[]> => ipcRenderer.invoke(IPC.explorerQuickAccess),
    pathInfo: (p: string): Promise<ExplorerPathInfo> => ipcRenderer.invoke(IPC.explorerPathInfo, p),
    move: (sources: string[], destDir: string): Promise<ExplorerOpResult[]> =>
      ipcRenderer.invoke(IPC.explorerMove, sources, destDir),
    copy: (sources: string[], destDir: string): Promise<ExplorerOpResult[]> =>
      ipcRenderer.invoke(IPC.explorerCopy, sources, destDir),
    createFolder: (parentDir: string, name?: string): Promise<string> =>
      ipcRenderer.invoke(IPC.explorerCreateFolder, parentDir, name),
    rename: (targetPath: string, newName: string): Promise<string> =>
      ipcRenderer.invoke(IPC.explorerRename, targetPath, newName),
    trash: (paths: string[]): Promise<ExplorerOpResult[]> =>
      ipcRenderer.invoke(IPC.explorerTrash, paths),
    openPath: (filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC.explorerOpenPath, filePath),
    revealInOs: (p: string): Promise<void> => ipcRenderer.invoke(IPC.explorerRevealInOs, p),
    proposeOrganize: (dirPath: string): Promise<OrganizePlan> =>
      ipcRenderer.invoke(IPC.explorerProposeOrganize, dirPath),
    applyOrganize: (dirPath: string, moves: OrganizeMove[]): Promise<ExplorerOpResult[]> =>
      ipcRenderer.invoke(IPC.explorerApplyOrganize, dirPath, moves),
  },
  /** Lifecycle for Core-API-embedded apps (e.g. a future Small Business/Photos
   *  app). The Core API itself is reached by that app's own `fetch` calls
   *  over plain HTTP — no IPC needed for that part. */
  embeddedApps: {
    getState: (appId: string): Promise<EmbeddedAppState> =>
      ipcRenderer.invoke(IPC.embeddedAppGetState, appId),
    start: (appId: string): Promise<EmbeddedAppState> =>
      ipcRenderer.invoke(IPC.embeddedAppStart, appId),
    stop: (appId: string): Promise<EmbeddedAppState> => ipcRenderer.invoke(IPC.embeddedAppStop, appId),
    showView: (
      appId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ): Promise<boolean> => ipcRenderer.invoke(IPC.embeddedAppShowView, appId, bounds),
    hideView: (appId: string): Promise<void> => ipcRenderer.invoke(IPC.embeddedAppHideView, appId),
    openWindow: (appId: string): Promise<void> => ipcRenderer.invoke(IPC.embeddedAppOpenWindow, appId),
    onStateChanged: (cb: (state: EmbeddedAppState) => void) => {
      const listener = (_e: unknown, state: EmbeddedAppState) => cb(state);
      ipcRenderer.on(IPC.embeddedAppStateChanged, listener);
      return () => ipcRenderer.removeListener(IPC.embeddedAppStateChanged, listener);
    },
  },
};

contextBridge.exposeInMainWorld('geniex', api);

export type GeniexApi = typeof api;
