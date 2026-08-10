import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc';
import { unloadModel } from './services/inferenceRuntime';
import { startSystemMetrics, stopSystemMetrics } from './services/systemMetrics';
import { stopOpenCode, refreshOpenCodeInstallState } from './services/opencodeRuntime';
import { destroyOpenCodeView } from './services/opencodeView';

// The main process bundle is emitted as CommonJS by vite-plugin-electron's
// default config, so __dirname is available as-is (no import.meta.url shim
// needed — that would only be correct for an ESM output target).

// Populated by vite-plugin-electron in dev; undefined in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow);
  void startSystemMetrics();
  void refreshOpenCodeInstallState();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure a loaded model's `geniex serve` background process doesn't
// linger after the app closes.
app.on('before-quit', async (event) => {
  event.preventDefault();
  stopSystemMetrics();
  destroyOpenCodeView();
  await stopOpenCode().catch(() => {});
  await unloadModel().catch(() => {});
  app.exit(0);
});
