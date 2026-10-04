// The Core API's HTTP implementation — see shared/coreApiContract.ts for the
// documented spec this implements. Plain node:http + a hand-rolled router:
// only ~10 endpoints, and avoids repeating the CJS-bundling risk already hit
// once with check-disk-space (see vite.config.mts) by not adding a new
// runtime dependency to the main-process bundle. Revisit only if the
// endpoint count grows enough to make this a real maintenance tax.
//
// Dynamically-allocated port (listen(0)): unlike GenieX (18181) or OpenCode
// (4096), this server's only consumers are processes Neuron itself spawns
// and directly hands the URL to via env var — there's no fixed-port
// convention to honor, so dynamic allocation removes "port already in use"
// as a bug class entirely.

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';
import { CORE_API_VERSION, PATHS } from '@shared/coreApiContract';
import type { ModelRequestPriority } from '@shared/types';
import * as modelScheduler from './modelScheduler';
import { getActiveModelState } from './inferenceRuntime';
import { getSnapshot as getMetricsSnapshot } from './systemMetrics';
import * as appSecretsStore from './appSecretsStore';
import * as memoryStore from './memoryStore';

let server: http.Server | null = null;
let port: number | null = null;
const tokenToAppId = new Map<string, string>();

export function registerAppToken(appId: string, token: string): void {
  tokenToAppId.set(token, appId);
}

export function revokeAppToken(token: string): void {
  tokenToAppId.delete(token);
}

export function generateAppToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getCoreApiUrl(): string | null {
  return port ? `http://127.0.0.1:${port}/api/v1` : null;
}

function ramTierLabel(totalBytes: number): string {
  const gb = totalBytes / 1024 ** 3;
  if (gb <= 9) return '8gb';
  if (gb <= 13) return '12gb';
  if (gb <= 20) return '16gb';
  if (gb <= 28) return '24gb';
  return '32gb';
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function authenticate(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return tokenToAppId.get(token) ?? null;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://internal');
  const prefix = '/api/v1';
  if (!url.pathname.startsWith(prefix)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  const path = url.pathname.slice(prefix.length) || '/';

  if (req.method === 'GET' && path === PATHS.health) {
    sendJson(res, 200, { ok: true, version: CORE_API_VERSION });
    return;
  }

  const appId = authenticate(req);
  if (!appId) {
    sendJson(res, 401, { error: 'Missing or invalid bearer token' });
    return;
  }

  try {
    if (req.method === 'GET' && path === PATHS.modelActive) {
      sendJson(res, 200, getActiveModelState());
      return;
    }

    if (req.method === 'POST' && path === PATHS.modelRequest) {
      const body = await readJsonBody<{ modelName?: string; priority?: ModelRequestPriority }>(req);
      if (!body?.modelName || !body.priority) {
        sendJson(res, 400, { error: 'modelName and priority are required' });
        return;
      }
      const result = await modelScheduler.requestModel(appId, body.modelName, body.priority);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && path === PATHS.modelRelease) {
      sendJson(res, 200, { released: modelScheduler.releaseModel(appId) });
      return;
    }

    if (req.method === 'GET' && path === PATHS.deviceInfo) {
      const snap = getMetricsSnapshot();
      sendJson(res, 200, {
        ram: {
          totalBytes: snap.ram.totalBytes,
          freeBytes: snap.ram.totalBytes - snap.ram.usedBytes,
          tierLabel: ramTierLabel(snap.ram.totalBytes),
        },
        npu: { available: snap.npu.available, name: snap.npu.name },
      });
      return;
    }

    if (req.method === 'GET' && path === PATHS.settings) {
      sendJson(res, 200, { settings: appSecretsStore.listAppSettings(appId) });
      return;
    }

    const settingMatch = path.match(/^\/settings\/([^/]+)$/);
    if (settingMatch) {
      const key = decodeURIComponent(settingMatch[1]);
      if (req.method === 'GET') {
        sendJson(res, 200, { key, value: appSecretsStore.getAppSetting(appId, key) });
        return;
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody<{ value?: string }>(req);
        if (typeof body?.value !== 'string') {
          sendJson(res, 400, { error: 'value (string) is required' });
          return;
        }
        appSecretsStore.setAppSetting(appId, key, body.value);
        sendJson(res, 200, { key, value: body.value });
        return;
      }
      if (req.method === 'DELETE') {
        sendJson(res, 200, { key, deleted: appSecretsStore.deleteAppSetting(appId, key) });
        return;
      }
    }

    if (req.method === 'GET' && path === PATHS.memory) {
      const tags = url.searchParams.get('tags');
      const entries = memoryStore.searchMemory({
        appId,
        query: url.searchParams.get('query') ?? undefined,
        tags: tags ? tags.split(',').filter(Boolean) : undefined,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
      });
      sendJson(res, 200, { entries });
      return;
    }

    if (req.method === 'POST' && path === PATHS.memory) {
      const body = await readJsonBody<{ id?: string; text?: string; tags?: string[]; meta?: Record<string, string> }>(
        req,
      );
      if (!body?.text) {
        sendJson(res, 400, { error: 'text is required' });
        return;
      }
      // appId is forced from the authenticated token, never the request body.
      const entry = memoryStore.upsertMemory({
        appId,
        text: body.text,
        tags: body.tags ?? [],
        id: body.id,
        meta: body.meta,
      });
      sendJson(res, 200, entry);
      return;
    }

    const memoryIdMatch = path.match(/^\/memory\/([^/]+)$/);
    if (memoryIdMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(memoryIdMatch[1]);
      // Ownership check that memoryStore.removeMemory() doesn't itself do —
      // this is the one place the HTTP surface enforces appId scoping as a
      // real boundary rather than a filter.
      const owned = memoryStore.listMemory(appId).some((e) => e.id === id);
      const deleted = owned && memoryStore.removeMemory(id);
      sendJson(res, 200, { id, deleted });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function startCoreApiServer(): Promise<number> {
  if (server && port) return port;
  server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });
  const overridePort = process.env.NEURON_CORE_API_PORT
    ? Number(process.env.NEURON_CORE_API_PORT)
    : 0;
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(overridePort, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Core API server failed to bind');
  port = address.port;
  return port;
}

export async function stopCoreApiServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  port = null;
  tokenToAppId.clear();
}
