// Embeds the OpenCode web UI inside the main window via BrowserView.
// iframes are unreliable here (X-Frame-Options / CSP); BrowserView is the
// Electron-native way to host another localhost app in-process.

import { BrowserView, BrowserWindow, type Rectangle } from 'electron';
import { OPENCODE_URL } from './opencodeConfig';

let view: BrowserView | null = null;
let attachedWin: BrowserWindow | null = null;
let detachedWin: BrowserWindow | null = null;

export function isOpenCodeViewVisible(): boolean {
  return !!view && !!attachedWin && !attachedWin.isDestroyed();
}

export function showOpenCodeView(win: BrowserWindow, bounds: Rectangle, url = OPENCODE_URL): void {
  if (win.isDestroyed()) return;

  if (!view) {
    view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  }

  if (attachedWin !== win) {
    if (attachedWin && !attachedWin.isDestroyed()) {
      try {
        attachedWin.removeBrowserView(view);
      } catch {
        // ignore
      }
    }
    win.setBrowserView(view);
    attachedWin = win;
    void view.webContents.loadURL(url);
  } else if (view.webContents.getURL() !== url && !view.webContents.isLoading()) {
    void view.webContents.loadURL(url);
  }

  view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  });
  view.setAutoResize({ width: true, height: true });
}

export function hideOpenCodeView(): void {
  if (view && attachedWin && !attachedWin.isDestroyed()) {
    try {
      attachedWin.removeBrowserView(view);
    } catch {
      // ignore
    }
  }
  attachedWin = null;
}

export function destroyOpenCodeView(): void {
  hideOpenCodeView();
  if (view) {
    try {
      // Electron 31+: destroy the webContents by closing the view
      (view.webContents as { close?: () => void }).close?.();
    } catch {
      // ignore
    }
    view = null;
  }
  if (detachedWin && !detachedWin.isDestroyed()) {
    detachedWin.close();
  }
  detachedWin = null;
}

/** Open (or focus) OpenCode in its own Electron window. */
export function openOpenCodeDetachedWindow(url = OPENCODE_URL): void {
  if (detachedWin && !detachedWin.isDestroyed()) {
    if (detachedWin.webContents.getURL() !== url) {
      void detachedWin.loadURL(url);
    }
    detachedWin.focus();
    return;
  }

  detachedWin = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: 'OpenCode',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void detachedWin.loadURL(url);
  detachedWin.on('closed', () => {
    detachedWin = null;
  });
}
