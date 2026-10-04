// Registers all ipcMain handlers and wires service-layer events (download
// progress, runtime state changes, install progress) back out to the
// renderer via webContents.send.

import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc-channels';
import * as setup from '../services/setup';
import * as modelManager from '../services/modelManager';
import * as localImport from '../services/localImport';
import * as inferenceRuntime from '../services/inferenceRuntime';
import * as storageConfig from '../services/storageConfig';
import * as systemMetrics from '../services/systemMetrics';
import * as opencodeRuntime from '../services/opencodeRuntime';
import * as opencodeView from '../services/opencodeView';
import * as appCatalog from '../services/appCatalog';
import * as optimizedCatalog from '../services/optimizedCatalog';
import * as appStore from '../services/appStore';
import * as memoryStore from '../services/memoryStore';
import * as chatHistory from '../services/chatHistory';
import * as fileOrganizer from '../apps/file-organizer';
import * as explorer from '../apps/file-organizer/explorer';
import * as organize from '../apps/file-organizer/organize';
import * as modelScheduler from '../services/modelScheduler';
import * as embeddedAppRuntime from '../services/embeddedAppRuntime';
import * as embeddedAppViewManager from '../services/embeddedAppViewManager';
import { dialog } from 'electron';
import type {
  PullProgress,
  CliSetupState,
  ChatMessage,
  ChatThread,
  MemoryEntry,
  MemorySearchQuery,
  FileOrganizerScanProgress,
} from '@shared/types';
import { OPENCODE_URL } from '../services/opencodeConfig';

// Identity used for model-scheduler requests made by screens that live in
// this bundle (My Models, Chat, Code) rather than a separately-embedded app
// with its own Core API token. They already share one renderer/process, so
// one fixed identity is enough — the scheduler's real job is coordinating
// *this* shell against separately-embedded apps, not screens within it.
const NEURON_SHELL_APP_ID = 'neuron-shell';

/**
 * Fire-and-forget: on install, download (if not already cached) and load an
 * app's first required model so it's ready without the user hunting through
 * My Models. Scoped to install time only — never triggered just from opening
 * an app's screen, since that would silently unload whatever model another
 * app (e.g. an active Chat session) currently has loaded. Routes through the
 * model scheduler (as an 'interactive' request) rather than calling
 * inferenceRuntime.loadModel() directly, so this can't silently preempt a
 * background job in a way the scheduler doesn't know about.
 */
async function ensureAppModelReady(appId: string, send: (channel: string, payload: unknown) => void): Promise<void> {
  const app = appCatalog.getCatalogApp(appId);
  const modelName = app?.requiredModels[0];
  if (!modelName) return;

  const cached = await modelManager.listCachedModels();
  const alreadyCached = cached.some((m) => m.name.toLowerCase() === modelName.toLowerCase());

  if (!alreadyCached) {
    await new Promise<void>((resolve, reject) => {
      modelManager
        .startModelPull({
          modelName,
          precision: null,
          modelHub: 'aihub',
          onProgress: (progress) => {
            send(IPC.pullProgress, progress);
            if (progress.status === 'completed') resolve();
            else if (progress.status === 'error') reject(new Error(progress.message ?? 'Download failed'));
            else if (progress.status === 'cancelled') reject(new Error('Download cancelled'));
          },
        })
        .catch(reject);
    });
  }

  const active = inferenceRuntime.getActiveModelState();
  const alreadyLoaded =
    active.status === 'loaded' && active.modelName?.toLowerCase() === modelName.toLowerCase();
  if (!alreadyLoaded) {
    await modelScheduler.requestModel(NEURON_SHELL_APP_ID, modelName, 'interactive');
  }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown) => {
    getWindow()?.webContents.send(channel, payload);
  };

  // --- Setup -----------------------------------------------------------
  ipcMain.handle(IPC.setupGetState, () => setup.getCliSetupState());
  ipcMain.handle(IPC.setupInstall, async () => {
    return setup.installCli((state: CliSetupState) => send(IPC.setupProgress, state));
  });

  // --- Hub / marketplace -------------------------------------------------
  ipcMain.handle(IPC.hubListModels, () => modelManager.listHubModels());
  ipcMain.handle(IPC.hubQueryPrecisions, (_e, modelName: string) =>
    modelManager.queryHfPrecisions(modelName),
  );

  // --- Cached models -------------------------------------------------
  ipcMain.handle(IPC.modelsList, () => modelManager.listCachedModels());
  ipcMain.handle(IPC.modelsRemove, (_e, name: string) => modelManager.removeCachedModel(name));

  // --- Pull / download -------------------------------------------------
  ipcMain.handle(
    IPC.pullStart,
    (_e, opts: { modelName: string; precision: string | null; modelHub: 'hf' | 'aihub' | null }) =>
      modelManager.startModelPull({
        ...opts,
        onProgress: (progress: PullProgress) => send(IPC.pullProgress, progress),
      }),
  );
  ipcMain.handle(IPC.pullCancel, (_e, requestId: string) => modelManager.cancelModelPull(requestId));

  // --- Local import -------------------------------------------------
  ipcMain.handle(IPC.importPickPath, () => {
    const win = getWindow();
    if (!win) return null;
    return localImport.pickLocalModelPath(win);
  });
  ipcMain.handle(IPC.importStart, (_e, opts: { sourcePath: string; modelName: string }) =>
    localImport.startLocalModelImport({
      ...opts,
      onProgress: (progress: PullProgress) => send(IPC.pullProgress, progress),
    }),
  );

  // --- Inference runtime (load/unload) -------------------------------------------------
  ipcMain.handle(IPC.runtimeGetActive, () => inferenceRuntime.getActiveModelState());
  ipcMain.handle(IPC.runtimeLoad, async (_e, modelName: string) => {
    // Goes through the scheduler (as 'interactive') rather than calling
    // inferenceRuntime.loadModel() directly, so it can't silently preempt a
    // background job (e.g. a future Photos captioning run) without the
    // scheduler's bookkeeping knowing about it.
    await modelScheduler.requestModel(NEURON_SHELL_APP_ID, modelName, 'interactive');
    return inferenceRuntime.getActiveModelState();
  });
  ipcMain.handle(IPC.runtimeUnload, () => {
    modelScheduler.releaseModel(NEURON_SHELL_APP_ID);
    return inferenceRuntime.unloadModel();
  });
  ipcMain.handle(IPC.chatCompletions, (_e, messages: ChatMessage[]) =>
    inferenceRuntime.chatCompletions(messages),
  );
  ipcMain.handle(IPC.chatCompletionsStream, async (e, messages: ChatMessage[]) =>
    inferenceRuntime.chatCompletionsStream(messages, (text) => {
      e.sender.send(IPC.chatStreamChunk, text);
    }),
  );
  ipcMain.handle(IPC.chatHistoryList, () => chatHistory.listThreads());
  ipcMain.handle(IPC.chatHistoryGet, (_e, id: string) => chatHistory.getThread(id));
  ipcMain.handle(IPC.chatHistoryCreate, () => chatHistory.createThread());
  ipcMain.handle(IPC.chatHistorySave, (_e, thread: ChatThread) => chatHistory.saveThread(thread));
  ipcMain.handle(IPC.chatHistoryDelete, (_e, id: string) => chatHistory.deleteThread(id));
  ipcMain.handle(IPC.chatHistoryGetActiveId, () => chatHistory.getActiveId());
  ipcMain.handle(IPC.chatHistorySetActiveId, (_e, id: string | null) => {
    chatHistory.setActiveId(id);
  });
  inferenceRuntime.onActiveModelStateChanged((s) => send(IPC.runtimeStateChanged, s));

  // --- Settings / storage -------------------------------------------------
  ipcMain.handle(IPC.settingsGet, () => storageConfig.getSettings());
  ipcMain.handle(IPC.settingsSetDataDir, (_e, dir: string) => storageConfig.setDataDir(dir));
  ipcMain.handle(IPC.settingsSetHfToken, (_e, token: string) => storageConfig.setHfToken(token));
  ipcMain.handle(IPC.settingsSetProjectDir, (_e, dir: string) => storageConfig.setProjectDir(dir));
  ipcMain.handle(IPC.settingsPickDataDir, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a folder to store downloaded models',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle(IPC.settingsPickProjectDir, async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose a project folder for OpenCode to edit',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle(IPC.storageGetDiskSpace, (_e, forPath?: string) => storageConfig.getDiskSpace(forPath));

  // --- System metrics (NPU / RAM) -------------------------------------------------
  ipcMain.handle(IPC.metricsGet, () => systemMetrics.getSnapshot());
  systemMetrics.onSystemMetrics((s) => send(IPC.metricsChanged, s));

  // --- OpenCode web bridge -------------------------------------------------
  ipcMain.handle(IPC.opencodeGetState, () => opencodeRuntime.getOpenCodeState());
  ipcMain.handle(IPC.opencodeStart, () => opencodeRuntime.startOpenCode());
  ipcMain.handle(IPC.opencodeStop, () => opencodeRuntime.stopOpenCode());
  ipcMain.handle(IPC.opencodeInstall, () => opencodeRuntime.installOpenCode());
  ipcMain.handle(IPC.opencodeRefreshInstall, () => opencodeRuntime.refreshOpenCodeInstallState());
  ipcMain.handle(
    IPC.opencodeShowView,
    (_e, bounds: { x: number; y: number; width: number; height: number }) => {
      const win = getWindow();
      if (!win) return false;
      opencodeView.showOpenCodeView(win, bounds, OPENCODE_URL);
      return true;
    },
  );
  ipcMain.handle(IPC.opencodeHideView, () => {
    opencodeView.hideOpenCodeView();
  });
  ipcMain.handle(IPC.opencodeOpenWindow, () => {
    const state = opencodeRuntime.getOpenCodeState();
    if (!state.running || !state.url) {
      throw new Error('Start OpenCode first.');
    }
    opencodeView.openOpenCodeDetachedWindow(state.url);
  });
  opencodeRuntime.onOpenCodeStateChanged((s) => send(IPC.opencodeStateChanged, s));

  // --- Apps catalog / install ---------------------------------------------
  ipcMain.handle(IPC.appsGetCatalog, async () => appCatalog.fetchAppsCatalog(false));
  ipcMain.handle(IPC.appsRefreshCatalog, async () => appCatalog.fetchAppsCatalog(true));

  // --- Optimized (Neuron-curated) models catalog --------------------------
  ipcMain.handle(IPC.optimizedGetCatalog, async () => optimizedCatalog.fetchOptimizedCatalog(false));
  ipcMain.handle(IPC.optimizedRefreshCatalog, async () => optimizedCatalog.fetchOptimizedCatalog(true));
  ipcMain.handle(IPC.appsListInstalled, () => appStore.listInstalledApps());
  ipcMain.handle(IPC.appsInstall, async (_e, id: string) => {
    const installed = await appStore.installApp(id);
    // Don't block the install call on a multi-minute download — the pull
    // and active-model-state events already flow to the UI as they happen.
    void ensureAppModelReady(id, send).catch((err) => {
      console.error(`[apps] failed to prepare required model for "${id}":`, err);
    });
    return installed;
  });
  ipcMain.handle(IPC.appsUninstall, (_e, id: string) => appStore.uninstallApp(id));

  // --- Neuron Memory (stub) -----------------------------------------------
  ipcMain.handle(
    IPC.memoryUpsert,
    (_e, input: Omit<MemoryEntry, 'id' | 'createdAt'> & { id?: string }) =>
      memoryStore.upsertMemory(input),
  );
  ipcMain.handle(IPC.memorySearch, (_e, query: MemorySearchQuery) => memoryStore.searchMemory(query));
  ipcMain.handle(IPC.memoryList, (_e, appId?: string | null) => memoryStore.listMemory(appId));
  ipcMain.handle(IPC.memoryRemove, (_e, id: string) => memoryStore.removeMemory(id));

  // --- System ------------------------------------------------------------
  ipcMain.handle(IPC.systemGetArch, () => process.arch);

  // --- File Organizer app (index/tag only — nothing on disk is moved) ----
  ipcMain.handle(IPC.fileOrganizerPickFolder, () => {
    const win = getWindow();
    if (!win) return null;
    return fileOrganizer.pickFolder(win);
  });
  ipcMain.handle(IPC.fileOrganizerAddRoot, (_e, folderPath: string) => fileOrganizer.addRoot(folderPath));
  ipcMain.handle(IPC.fileOrganizerListRoots, () => fileOrganizer.listRoots());
  ipcMain.handle(IPC.fileOrganizerRemoveRoot, (_e, id: string) => fileOrganizer.removeRoot(id));
  ipcMain.handle(IPC.fileOrganizerListEntries, (_e, rootId?: string | null) =>
    fileOrganizer.listEntries(rootId),
  );
  ipcMain.handle(IPC.fileOrganizerCancelScan, (_e, rootId: string) => {
    fileOrganizer.cancelScan(rootId);
  });
  ipcMain.handle(IPC.fileOrganizerScanRoot, (_e, rootId: string) =>
    fileOrganizer.scanRoot(rootId, (progress: FileOrganizerScanProgress) =>
      send(IPC.fileOrganizerScanProgress, progress),
    ),
  );
  ipcMain.handle(IPC.fileOrganizerReadFileBuffer, (_e, filePath: string) =>
    fileOrganizer.readFileBuffer(filePath),
  );
  ipcMain.handle(IPC.fileOrganizerSetThumbnail, (_e, filePath: string, dataUrl: string) =>
    fileOrganizer.setThumbnail(filePath, dataUrl),
  );

  // --- File Manager — live filesystem Explorer (real disk I/O) -----------
  ipcMain.handle(IPC.explorerListDirectory, (_e, dirPath: string) => explorer.listDirectory(dirPath));
  ipcMain.handle(IPC.explorerListDrives, () => explorer.listDrives());
  ipcMain.handle(IPC.explorerQuickAccess, () => explorer.quickAccess());
  ipcMain.handle(IPC.explorerPathInfo, (_e, p: string) => explorer.pathInfo(p));
  ipcMain.handle(IPC.explorerMove, (_e, sources: string[], destDir: string) =>
    explorer.move(sources, destDir),
  );
  ipcMain.handle(IPC.explorerCopy, (_e, sources: string[], destDir: string) =>
    explorer.copy(sources, destDir),
  );
  ipcMain.handle(IPC.explorerCreateFolder, (_e, parentDir: string, name?: string) =>
    explorer.createFolder(parentDir, name),
  );
  ipcMain.handle(IPC.explorerRename, (_e, targetPath: string, newName: string) =>
    explorer.rename(targetPath, newName),
  );
  ipcMain.handle(IPC.explorerTrash, (_e, paths: string[]) => explorer.trash(paths));
  ipcMain.handle(IPC.explorerOpenPath, (_e, filePath: string) => explorer.openPath(filePath));
  ipcMain.handle(IPC.explorerRevealInOs, (_e, p: string) => explorer.revealInOs(p));
  ipcMain.handle(IPC.explorerProposeOrganize, (_e, dirPath: string) =>
    organize.proposeOrganization(dirPath),
  );
  ipcMain.handle(IPC.explorerApplyOrganize, (_e, dirPath: string, moves) =>
    organize.applyOrganization(dirPath, moves),
  );

  // --- Core-API-embedded apps (lifecycle only — see coreApiServer.ts for
  // the actual API those apps talk to over plain HTTP) --------------------
  ipcMain.handle(IPC.embeddedAppGetState, (_e, appId: string) =>
    embeddedAppRuntime.getEmbeddedAppState(appId),
  );
  ipcMain.handle(IPC.embeddedAppStart, (_e, appId: string) => embeddedAppRuntime.startEmbeddedApp(appId));
  ipcMain.handle(IPC.embeddedAppStop, (_e, appId: string) => embeddedAppRuntime.stopEmbeddedApp(appId));
  ipcMain.handle(
    IPC.embeddedAppShowView,
    (_e, appId: string, bounds: { x: number; y: number; width: number; height: number }) => {
      const win = getWindow();
      const state = embeddedAppRuntime.getEmbeddedAppState(appId);
      if (!win || !state.url) return false;
      embeddedAppViewManager.showEmbeddedAppView(appId, win, bounds, state.url);
      return true;
    },
  );
  ipcMain.handle(IPC.embeddedAppHideView, (_e, appId: string) => {
    embeddedAppViewManager.hideEmbeddedAppView(appId);
  });
  ipcMain.handle(IPC.embeddedAppOpenWindow, (_e, appId: string) => {
    const state = embeddedAppRuntime.getEmbeddedAppState(appId);
    if (!state.running || !state.url) throw new Error(`App "${appId}" isn't running.`);
    embeddedAppViewManager.openEmbeddedAppDetachedWindow(appId, state.url);
  });
  embeddedAppRuntime.onEmbeddedAppStateChanged((s) => send(IPC.embeddedAppStateChanged, s));
}
