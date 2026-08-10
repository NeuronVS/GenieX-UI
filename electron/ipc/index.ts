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
import { dialog } from 'electron';
import type { PullProgress, CliSetupState, ChatMessage } from '@shared/types';
import { OPENCODE_URL } from '../services/opencodeConfig';

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
  ipcMain.handle(IPC.runtimeLoad, (_e, modelName: string) => inferenceRuntime.loadModel(modelName));
  ipcMain.handle(IPC.runtimeUnload, () => inferenceRuntime.unloadModel());
  ipcMain.handle(IPC.chatCompletions, (_e, messages: ChatMessage[]) =>
    inferenceRuntime.chatCompletions(messages),
  );
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
}
