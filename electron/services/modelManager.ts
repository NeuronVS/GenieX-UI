// Higher-level model operations consumed by IPC handlers: browsing the
// Qualcomm AI Hub catalog, querying HuggingFace precisions (filtered to the
// allowed set), listing/removing cached models, and starting/cancelling pulls.

import crypto from 'node:crypto';
import {
  findGeniexPath,
  listHubModels as cliListHubModels,
  listCachedModels as cliListCachedModels,
  removeCachedModel as cliRemoveCachedModel,
  queryHuggingFacePrecisions,
  startPull,
  type PullHandle,
} from './geniexCli';
import { getSettings } from './storageConfig';
import { ALLOWED_PRECISIONS, type PullProgress, type PrecisionQueryResult } from '@shared/types';

const activePulls = new Map<string, PullHandle>();

export async function listHubModels() {
  const { dataDir } = getSettings();
  return cliListHubModels(dataDir);
}

export async function listCachedModels() {
  const { dataDir } = getSettings();
  return cliListCachedModels(dataDir);
}

export async function removeCachedModel(name: string) {
  const { dataDir } = getSettings();
  return cliRemoveCachedModel(dataDir, name);
}

/**
 * Query available precisions for a HuggingFace model, filtered down to the
 * allowed set (Q4_0 / Q8_0 / F16). Never call this for Qualcomm AI Hub
 * (qualcomm/*) catalog models — see queryHuggingFacePrecisions's doc comment.
 */
export async function queryHfPrecisions(modelName: string): Promise<PrecisionQueryResult> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  const { dataDir, hfToken } = getSettings();
  const result = await queryHuggingFacePrecisions(bin, dataDir, hfToken || undefined, modelName);
  return {
    ...result,
    candidates: result.candidates.filter((c) =>
      (ALLOWED_PRECISIONS as readonly string[]).includes(c.precision),
    ),
  };
}

export interface StartPullOptions {
  modelName: string;
  precision: string | null;
  modelHub: 'hf' | 'aihub' | null;
  onProgress: (progress: PullProgress) => void;
}

export async function startModelPull(opts: StartPullOptions): Promise<string> {
  const bin = await findGeniexPath();
  if (!bin) throw new Error('geniex CLI not found');
  if (opts.precision && !(ALLOWED_PRECISIONS as readonly string[]).includes(opts.precision)) {
    throw new Error(`Precision ${opts.precision} is not allowed`);
  }
  const { dataDir, hfToken } = getSettings();
  const requestId = crypto.randomUUID();

  const handle = startPull(
    bin,
    dataDir,
    hfToken || undefined,
    requestId,
    opts.modelName,
    opts.precision,
    opts.modelHub,
    (progress) => {
      opts.onProgress(progress);
      if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'error') {
        activePulls.delete(requestId);
      }
    },
  );
  activePulls.set(requestId, handle);
  return requestId;
}

export function cancelModelPull(requestId: string): void {
  activePulls.get(requestId)?.cancel();
}
