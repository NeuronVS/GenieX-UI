// Central registry of IPC channel names, shared by preload (ipcRenderer.invoke/on)
// and main (ipcMain.handle/emit) so the two sides can never drift apart.

export const IPC = {
  // Setup
  setupGetState: 'setup:getState',
  setupInstall: 'setup:install',
  setupProgress: 'setup:progress', // main -> renderer event

  // Marketplace / hub catalog
  hubListModels: 'hub:listModels',
  hubQueryPrecisions: 'hub:queryPrecisions',

  // Local cached models
  modelsList: 'models:list',
  modelsRemove: 'models:remove',

  // Pull / download
  pullStart: 'pull:start',
  pullCancel: 'pull:cancel',
  pullProgress: 'pull:progress', // main -> renderer event

  // Local import
  importPickPath: 'import:pickPath',
  importStart: 'import:start',

  // Inference runtime (load/unload)
  runtimeGetActive: 'runtime:getActive',
  runtimeLoad: 'runtime:load',
  runtimeUnload: 'runtime:unload',
  runtimeStateChanged: 'runtime:stateChanged', // main -> renderer event
  // Chat via main process (avoids renderer CORS against geniex serve)
  chatCompletions: 'chat:completions',

  // Settings / storage
  settingsGet: 'settings:get',
  settingsSetDataDir: 'settings:setDataDir',
  settingsSetHfToken: 'settings:setHfToken',
  settingsSetProjectDir: 'settings:setProjectDir',
  settingsPickDataDir: 'settings:pickDataDir',
  settingsPickProjectDir: 'settings:pickProjectDir',
  storageGetDiskSpace: 'storage:getDiskSpace',

  // System metrics (NPU / RAM)
  metricsGet: 'metrics:get',
  metricsChanged: 'metrics:changed', // main -> renderer event

  // OpenCode web bridge
  opencodeGetState: 'opencode:getState',
  opencodeStart: 'opencode:start',
  opencodeStop: 'opencode:stop',
  opencodeInstall: 'opencode:install',
  opencodeRefreshInstall: 'opencode:refreshInstall',
  opencodeStateChanged: 'opencode:stateChanged', // main -> renderer event
  opencodeShowView: 'opencode:showView',
  opencodeHideView: 'opencode:hideView',
  opencodeOpenWindow: 'opencode:openWindow',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
