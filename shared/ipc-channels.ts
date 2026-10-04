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

  // Optimized (Neuron-curated) models catalog
  optimizedGetCatalog: 'optimized:getCatalog',
  optimizedRefreshCatalog: 'optimized:refreshCatalog',

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
  chatCompletionsStream: 'chat:completionsStream',
  chatStreamChunk: 'chat:streamChunk', // main -> renderer (delta text)
  chatHistoryList: 'chatHistory:list',
  chatHistoryGet: 'chatHistory:get',
  chatHistoryCreate: 'chatHistory:create',
  chatHistorySave: 'chatHistory:save',
  chatHistoryDelete: 'chatHistory:delete',
  chatHistoryGetActiveId: 'chatHistory:getActiveId',
  chatHistorySetActiveId: 'chatHistory:setActiveId',

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

  // Apps catalog / install
  appsGetCatalog: 'apps:getCatalog',
  appsRefreshCatalog: 'apps:refreshCatalog',
  appsListInstalled: 'apps:listInstalled',
  appsInstall: 'apps:install',
  appsUninstall: 'apps:uninstall',

  // Neuron Memory (stub — in-memory / light persist)
  memoryUpsert: 'memory:upsert',
  memorySearch: 'memory:search',
  memoryList: 'memory:list',
  memoryRemove: 'memory:remove',

  // System info for sidebar chrome
  systemGetArch: 'system:getArch',

  // Core-API-embedded apps (Small Business/Photos/future ones) — lifecycle
  // only. The Core API itself needs no IPC: it's reached by the embedded
  // app's own `fetch` calls over plain HTTP, which is the whole point.
  embeddedAppGetState: 'embeddedApp:getState',
  embeddedAppStart: 'embeddedApp:start',
  embeddedAppStop: 'embeddedApp:stop',
  embeddedAppStateChanged: 'embeddedApp:stateChanged', // main -> renderer event
  embeddedAppShowView: 'embeddedApp:showView',
  embeddedAppHideView: 'embeddedApp:hideView',
  embeddedAppOpenWindow: 'embeddedApp:openWindow',

  // File Organizer app (index/tag only — nothing on disk is moved)
  fileOrganizerPickFolder: 'fileOrganizer:pickFolder',
  fileOrganizerAddRoot: 'fileOrganizer:addRoot',
  fileOrganizerListRoots: 'fileOrganizer:listRoots',
  fileOrganizerRemoveRoot: 'fileOrganizer:removeRoot',
  fileOrganizerScanRoot: 'fileOrganizer:scanRoot',
  fileOrganizerCancelScan: 'fileOrganizer:cancelScan',
  fileOrganizerListEntries: 'fileOrganizer:listEntries',
  fileOrganizerScanProgress: 'fileOrganizer:scanProgress', // main -> renderer event
  // PDF thumbnails are rendered in the renderer (needs a real <canvas>) —
  // main only supplies the raw bytes and persists the result.
  fileOrganizerReadFileBuffer: 'fileOrganizer:readFileBuffer',
  fileOrganizerSetThumbnail: 'fileOrganizer:setThumbnail',

  // File Manager — live filesystem Explorer (browses real disk, moves/opens
  // files). Distinct from the fileOrganizer:* channels above, which only
  // touch the persisted LLM index.
  explorerListDirectory: 'explorer:listDirectory',
  explorerListDrives: 'explorer:listDrives',
  explorerQuickAccess: 'explorer:quickAccess',
  explorerPathInfo: 'explorer:pathInfo',
  explorerMove: 'explorer:move',
  explorerCopy: 'explorer:copy',
  explorerCreateFolder: 'explorer:createFolder',
  explorerRename: 'explorer:rename',
  explorerTrash: 'explorer:trash',
  explorerOpenPath: 'explorer:openPath',
  explorerRevealInOs: 'explorer:revealInOs',
  explorerProposeOrganize: 'explorer:proposeOrganize',
  explorerApplyOrganize: 'explorer:applyOrganize',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
