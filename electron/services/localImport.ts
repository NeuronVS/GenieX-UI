// Local / already-downloaded HuggingFace model import: native folder picker
// + `geniex pull local/<name> --model-hub localfs --local-path <path>`.

import { dialog, type BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import { findGeniexPath, startLocalImport, type PullHandle } from './geniexCli';
import { getSettings } from './storageConfig';
import type { PullProgress } from '@shared/types';

const activeImports = new Map<string, PullHandle>();

export async function pickLocalModelPath(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select a local model folder',
    // GenieX expects a directory (GGUF file(s) or a QAIRT bundle with
    // metadata.json) or an AI Hub zip file.
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

export interface StartImportOptions {
  sourcePath: string;
  modelName: string;
  onProgress: (progress: PullProgress) => void;
}

export async function startLocalModelImport(opts: StartImportOptions): Promise<string> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  const { dataDir } = getSettings();
  const requestId = crypto.randomUUID();

  const handle = startLocalImport(bin, dataDir, requestId, opts.modelName, opts.sourcePath, (progress) => {
    opts.onProgress(progress);
    if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'error') {
      activeImports.delete(requestId);
    }
  });
  activeImports.set(requestId, handle);
  return requestId;
}

export function cancelLocalModelImport(requestId: string): void {
  activeImports.get(requestId)?.cancel();
}
