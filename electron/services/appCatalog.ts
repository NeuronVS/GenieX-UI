import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppsCatalog, CatalogApp } from '@shared/types';
import { DEFAULT_APPS_CATALOG, REMOTE_APPS_CATALOG_URL } from './defaultAppsCatalog';

let cached: AppsCatalog = DEFAULT_APPS_CATALOG;
let lastFetchAt = 0;

function readBundledCatalog(): AppsCatalog | null {
  const candidates = [
    path.join(process.cwd(), 'catalog', 'apps.json'),
    path.join(app.getAppPath(), 'catalog', 'apps.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as AppsCatalog;
      if (Array.isArray(raw.apps) && raw.apps.length > 0) return raw;
    } catch {
      // try next
    }
  }
  return null;
}

function normalizeCatalog(raw: unknown): AppsCatalog | null {
  if (!raw || typeof raw !== 'object') return null;
  const apps = (raw as AppsCatalog).apps;
  if (!Array.isArray(apps)) return null;
  const cleaned: CatalogApp[] = apps
    .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: typeof a.description === 'string' ? a.description : '',
      icon: typeof a.icon === 'string' ? a.icon : '📦',
      version: typeof a.version === 'string' ? a.version : '0.0.0',
      builtin: Boolean(a.builtin),
      requiredModels: Array.isArray(a.requiredModels) ? a.requiredModels.map(String) : [],
      entry: typeof a.entry === 'string' ? a.entry : 'placeholder',
      memoryTags: Array.isArray(a.memoryTags) ? a.memoryTags.map(String) : undefined,
    }));
  return cleaned.length ? { apps: cleaned } : null;
}

export function getCachedCatalog(): AppsCatalog {
  return cached;
}

export async function fetchAppsCatalog(force = false): Promise<AppsCatalog> {
  const staleMs = 5 * 60 * 1000;
  if (!force && lastFetchAt && Date.now() - lastFetchAt < staleMs) {
    return cached;
  }

  try {
    const res = await fetch(REMOTE_APPS_CATALOG_URL, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const normalized = normalizeCatalog(await res.json());
      if (normalized) {
        cached = normalized;
        lastFetchAt = Date.now();
        return cached;
      }
    }
  } catch {
    // fall through to bundled / default
  }

  cached = readBundledCatalog() ?? DEFAULT_APPS_CATALOG;
  lastFetchAt = Date.now();
  return cached;
}

export function getCatalogApp(id: string): CatalogApp | undefined {
  return cached.apps.find((a) => a.id === id);
}
