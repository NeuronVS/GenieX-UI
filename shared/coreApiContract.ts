// The Core API contract — the documented boundary a separately-built,
// separately-repo'd app (e.g. a future Small Business or Photos app) codes
// against to integrate with Neuron, instead of being coded directly into
// this bundle. Implemented by electron/services/coreApiServer.ts, which
// imports this file directly so the spec and the implementation can't drift.
//
// This file is dependency-free on purpose: it's meant to be copied into a
// new app's own repo for now (see the header note below). A real published
// `@neuron/core-api-client` package is premature with zero apps built
// against it yet — revisit once a second app exists to validate the shape.
//
// --- FOR APP AUTHORS ---
// Copy this file into your app's repo and re-copy it whenever Neuron's
// Core API version changes (see CORE_API_VERSION). Your app receives four
// environment variables at startup (see ENV_VARS below) that tell it how to
// reach this API and how to authenticate.

import type {
  ActiveModelState,
  ModelRequest,
  ModelRequestResult,
  MemoryEntry,
  MemorySearchQuery,
} from './types';

export const CORE_API_VERSION = 1;

/** Env var names Neuron sets on every embedded app process it spawns. */
export const ENV_VARS = {
  /** Base URL for this contract's endpoints, e.g. http://127.0.0.1:54213/api/v1 */
  coreApiUrl: 'NEURON_CORE_API_URL',
  /** This app's catalog id, e.g. "small-business". Also the memory/settings scope. */
  appId: 'NEURON_APP_ID',
  /** Bearer token for every Core API call except /health. */
  appToken: 'NEURON_APP_TOKEN',
  /** GenieX's own OpenAI-compatible server — call this directly for chat
   *  completions (including tool-calling); it's CORS-open by default and
   *  Core API deliberately does not proxy it. */
  geniexBaseUrl: 'NEURON_GENIEX_BASE_URL',
  /** Port this app's own HTTP server must bind to (Neuron picks it). */
  appPort: 'NEURON_PORT',
} as const;

/** Path constants, relative to ENV_VARS.coreApiUrl. */
export const PATHS = {
  health: '/health',
  modelActive: '/model/active',
  modelRequest: '/model/request',
  modelRelease: '/model/release',
  deviceInfo: '/device/info',
  settings: '/settings',
  settingByKey: (key: string) => `/settings/${encodeURIComponent(key)}`,
  memory: '/memory',
  memoryById: (id: string) => `/memory/${encodeURIComponent(id)}`,
} as const;

// --- Request / response shapes ---------------------------------------------

export interface HealthResponse {
  ok: true;
  version: number;
}

/** GET /model/active — read-only, doesn't acquire anything. */
export type ModelActiveResponse = ActiveModelState;

/** POST /model/request — body is a ModelRequest (see shared/types.ts). */
export type ModelRequestResponse = ModelRequestResult;

/** POST /model/release — no body. */
export interface ModelReleaseResponse {
  released: boolean;
}

export interface DeviceInfoResponse {
  ram: {
    totalBytes: number;
    freeBytes: number;
    /** Coarse bucket for RAM-tiered model selection, e.g. "8gb" | "16gb" | "24gb". */
    tierLabel: string;
  };
  npu: {
    available: boolean;
    name: string | null;
  };
}

export interface SettingsListResponse {
  settings: Record<string, string>;
}

export interface SettingGetResponse {
  key: string;
  value: string | null;
}

export interface SettingPutRequest {
  value: string;
}

export interface SettingPutResponse {
  key: string;
  value: string;
}

export interface SettingDeleteResponse {
  key: string;
  deleted: boolean;
}

export interface MemoryListResponse {
  entries: MemoryEntry[];
}

/** POST /memory body — appId is forced server-side from the bearer token, never client-supplied. */
export type MemoryCreateRequest = Pick<MemoryEntry, 'text'> &
  Partial<Pick<MemoryEntry, 'id' | 'tags' | 'meta'>>;

export type MemoryCreateResponse = MemoryEntry;

export interface MemoryDeleteResponse {
  id: string;
  deleted: boolean;
}

/** Query params for GET /memory. */
export interface MemoryListQuery extends Pick<MemorySearchQuery, 'tags' | 'query' | 'limit'> {}

export type { ModelRequest };
