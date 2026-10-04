// Model scheduler: only one model can be loaded at a time (see
// inferenceRuntime.ts), so callers *request* one with a priority instead of
// commanding a load directly. This is the layer that decides who wins.
//
//   interactive — Chat/Code/My Models/future embedded apps while a user is
//     actively using them. Always wins immediately; preempts whatever else
//     is loaded. Held as a *lease*, not a one-time grant: callers should
//     re-request periodically (e.g. on every message send) to keep it, and
//     an unrefreshed lease expires automatically so a crashed/closed app
//     doesn't permanently starve background work.
//
//   background — e.g. a future Photos app's captioning job. Only granted
//     when nothing interactive currently holds the model, AND the OS has
//     been idle past a short threshold at the moment of the initial grant
//     (electron's real powerMonitor primitive, not hand-rolled). Once
//     running, only a new interactive request revokes it — no continuous
//     idle re-checking.
//
// This is polling, not push callbacks, because callers may be entirely
// separate processes (Core-API-embedded apps): a background job calls
// requestModel() before each unit of work and pauses itself on denial.
// Resumability (where a paused job picks back up) is the caller's own job,
// not the scheduler's — it has no notion of "progress."
//
// Existing in-repo callers (My Models' Load button, Chat, Code) route
// through this too (as 'interactive' requests) rather than calling
// inferenceRuntime.loadModel() directly, so there's one real source of
// truth for "what's loaded and why" — not a scheduler that only some
// callers respect.

import { powerMonitor } from 'electron';
import { getActiveModelState, loadModel } from './inferenceRuntime';
import type { ActiveModelState, ModelRequestPriority, ModelRequestResult } from '@shared/types';

const INTERACTIVE_LEASE_MS = 45_000;
const IDLE_THRESHOLD_SECONDS = 10;
const RETRY_AFTER_MS = 5_000;

interface Holder {
  appId: string;
  priority: ModelRequestPriority;
  modelName: string;
  lastRequestedAt: number;
}

let holder: Holder | null = null;

function expireStaleInteractiveHold(): void {
  if (
    holder?.priority === 'interactive' &&
    Date.now() - holder.lastRequestedAt > INTERACTIVE_LEASE_MS
  ) {
    holder = null;
  }
}

async function ensureLoaded(modelName: string): Promise<ActiveModelState> {
  const active = getActiveModelState();
  if (active.status === 'loaded' && active.modelName === modelName) return active;
  return loadModel(modelName);
}

function denied(retryAfterMs = RETRY_AFTER_MS): ModelRequestResult {
  return { granted: false, activeModel: getActiveModelState().modelName, retryAfterMs };
}

export async function requestModel(
  appId: string,
  modelName: string,
  priority: ModelRequestPriority,
): Promise<ModelRequestResult> {
  expireStaleInteractiveHold();

  if (priority === 'interactive') {
    if (
      holder?.priority === 'interactive' &&
      holder.appId === appId &&
      holder.modelName === modelName
    ) {
      holder.lastRequestedAt = Date.now();
      return { granted: true, activeModel: modelName };
    }
    await ensureLoaded(modelName);
    holder = { appId, priority: 'interactive', modelName, lastRequestedAt: Date.now() };
    return { granted: true, activeModel: modelName };
  }

  // background
  if (holder?.priority === 'interactive') return denied();

  if (holder?.priority === 'background') {
    if (holder.appId === appId && holder.modelName === modelName) {
      holder.lastRequestedAt = Date.now();
      return { granted: true, activeModel: modelName };
    }
    return denied(); // v1: first-come-first-served among background jobs, no queue
  }

  // No current holder — only start background work once the machine's
  // genuinely idle, not the instant an interactive session ends.
  if (powerMonitor.getSystemIdleTime() < IDLE_THRESHOLD_SECONDS) return denied();

  await ensureLoaded(modelName);
  holder = { appId, priority: 'background', modelName, lastRequestedAt: Date.now() };
  return { granted: true, activeModel: modelName };
}

/** Explicit release (e.g. user navigates away from Chat) rather than waiting out the lease. */
export function releaseModel(appId: string): boolean {
  if (holder?.appId === appId) {
    holder = null;
    return true;
  }
  return false;
}

export function getSchedulerHolder(): Holder | null {
  expireStaleInteractiveHold();
  return holder;
}
