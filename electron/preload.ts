// Safe IPC surface exposed to the renderer as `window.geniex`. No Node or
// Electron APIs are exposed directly — every call is a named, typed method
// that forwards to a single fixed ipcMain channel.

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  AppSettings,
  CachedModel,
  CliSetupState,
  DiskSpaceInfo,
  HubModel,
  PrecisionQueryResult,
  PullProgress,
  ActiveModelState,
  ChatMessage,
  SystemMetricsSnapshot,
  OpenCodeState,
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
};

contextBridge.exposeInMainWorld('geniex', api);

export type GeniexApi = typeof api;
