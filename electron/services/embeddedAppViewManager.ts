// Generalized version of opencodeView.ts's BrowserView-hosting pattern,
// keyed by appId instead of being a one-off singleton — so multiple
// Core-API-embedded apps (Small Business, Photos, future ones) can each
// have their own hosted view. BrowserView, not an iframe: iframes are
// unreliable here (X-Frame-Options / CSP); BrowserView is the Electron-
// native way to host another localhost app in-process — same reasoning as
// opencodeView.ts, just generalized.
//
// Deliberately not refactoring opencodeView.ts onto this — Code is shipped
// and working; forcing a migration adds regression risk for no near-term
// benefit. Revisit once this has proven itself with a real second app.

import { BrowserView, BrowserWindow, type Rectangle } from 'electron';

interface Entry {
  view: BrowserView;
  attachedWin: BrowserWindow | null;
  detachedWin: BrowserWindow | null;
}

const entries = new Map<string, Entry>();

function getOrCreate(appId: string): Entry {
  let entry = entries.get(appId);
  if (!entry) {
    const view = new BrowserView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    entry = { view, attachedWin: null, detachedWin: null };
    entries.set(appId, entry);
  }
  return entry;
}

export function isEmbeddedAppViewVisible(appId: string): boolean {
  const entry = entries.get(appId);
  return !!entry?.attachedWin && !entry.attachedWin.isDestroyed();
}

export function showEmbeddedAppView(
  appId: string,
  win: BrowserWindow,
  bounds: Rectangle,
  url: string,
): void {
  if (win.isDestroyed()) return;
  const entry = getOrCreate(appId);

  if (entry.attachedWin !== win) {
    if (entry.attachedWin && !entry.attachedWin.isDestroyed()) {
      try {
        entry.attachedWin.removeBrowserView(entry.view);
      } catch {
        /* ignore */
      }
    }
    win.setBrowserView(entry.view);
    entry.attachedWin = win;
    void entry.view.webContents.loadURL(url);
  } else if (entry.view.webContents.getURL() !== url && !entry.view.webContents.isLoading()) {
    void entry.view.webContents.loadURL(url);
  }

  entry.view.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(0, Math.round(bounds.width)),
    height: Math.max(0, Math.round(bounds.height)),
  });
  entry.view.setAutoResize({ width: true, height: true });
}

export function hideEmbeddedAppView(appId: string): void {
  const entry = entries.get(appId);
  if (entry?.attachedWin && !entry.attachedWin.isDestroyed()) {
    try {
      entry.attachedWin.removeBrowserView(entry.view);
    } catch {
      /* ignore */
    }
  }
  if (entry) entry.attachedWin = null;
}

export function hideAllEmbeddedAppViews(): void {
  for (const appId of entries.keys()) hideEmbeddedAppView(appId);
}

export function destroyEmbeddedAppView(appId: string): void {
  hideEmbeddedAppView(appId);
  const entry = entries.get(appId);
  if (!entry) return;
  try {
    (entry.view.webContents as { close?: () => void }).close?.();
  } catch {
    /* ignore */
  }
  if (entry.detachedWin && !entry.detachedWin.isDestroyed()) entry.detachedWin.close();
  entries.delete(appId);
}

export function destroyAllEmbeddedAppViews(): void {
  for (const appId of [...entries.keys()]) destroyEmbeddedAppView(appId);
}

export function openEmbeddedAppDetachedWindow(appId: string, url: string): void {
  const entry = getOrCreate(appId);
  if (entry.detachedWin && !entry.detachedWin.isDestroyed()) {
    if (entry.detachedWin.webContents.getURL() !== url) void entry.detachedWin.loadURL(url);
    entry.detachedWin.focus();
    return;
  }
  entry.detachedWin = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void entry.detachedWin.loadURL(url);
  entry.detachedWin.on('closed', () => {
    entry.detachedWin = null;
  });
}
