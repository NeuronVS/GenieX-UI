// Persists the app's own settings (data dir, HF token) — GenieX itself has no
// persistent "remembered" data dir, so we own that state and pass
// `--data-dir` / GENIEX_HFTOKEN on every CLI invocation ourselves.

import Store from 'electron-store';
import path from 'node:path';
import os from 'node:os';
import * as checkDiskSpaceModule from 'check-disk-space';
import type { AppSettings, DiskSpaceInfo } from '@shared/types';

// check-disk-space ships as CJS with a `.default` export. It's externalized
// in the Electron main bundle (see vite.config.ts), so esbuild doesn't apply
// its usual default-import interop shim here — resolve it manually instead.
const checkDiskSpace = (checkDiskSpaceModule as unknown as { default: typeof import('check-disk-space').default })
  .default;

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.cache', 'geniex');

interface StoreShape {
  dataDir: string;
  hfToken: string;
  projectDir: string;
}

const store = new Store<StoreShape>({
  defaults: {
    dataDir: DEFAULT_DATA_DIR,
    hfToken: '',
    projectDir: '',
  },
});

export function getSettings(): AppSettings {
  return {
    dataDir: store.get('dataDir'),
    hfToken: store.get('hfToken'),
    projectDir: store.get('projectDir'),
  };
}

export function setDataDir(dir: string): void {
  store.set('dataDir', dir);
}

export function setHfToken(token: string): void {
  store.set('hfToken', token);
}

export function setProjectDir(dir: string): void {
  store.set('projectDir', dir);
}

export async function getDiskSpace(forPath?: string): Promise<DiskSpaceInfo> {
  const target = forPath ?? getSettings().dataDir;
  // check-disk-space needs an existing path; the data dir may not exist yet
  // on first run, so fall back to its nearest existing ancestor.
  let probePath = target;
  const fs = await import('node:fs');
  while (!fs.existsSync(probePath)) {
    const parent = path.dirname(probePath);
    if (parent === probePath) break;
    probePath = parent;
  }
  const info = await checkDiskSpace(probePath);
  return {
    diskPath: info.diskPath,
    freeBytes: info.free,
    totalBytes: info.size,
  };
}
