import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { OptimizedModel, OptimizedModelsCatalog } from '@shared/types';
import { ALLOWED_PRECISIONS } from '@shared/types';
import { DEFAULT_OPTIMIZED_CATALOG, REMOTE_OPTIMIZED_CATALOG_URL } from './defaultOptimizedCatalog';

let cached: OptimizedModelsCatalog = DEFAULT_OPTIMIZED_CATALOG;
let lastFetchAt = 0;

function readBundledCatalog(): OptimizedModelsCatalog | null {
  const candidates = [
    path.join(process.cwd(), 'catalog', 'models.json'),
    path.join(app.getAppPath(), 'catalog', 'models.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as OptimizedModelsCatalog;
      if (Array.isArray(raw.models) && raw.models.length > 0) return raw;
    } catch {
      // try next
    }
  }
  return null;
}

function normalizeCatalog(raw: unknown): OptimizedModelsCatalog | null {
  if (!raw || typeof raw !== 'object') return null;
  const models = (raw as OptimizedModelsCatalog).models;
  if (!Array.isArray(models)) return null;
  const allowed: readonly string[] = ALLOWED_PRECISIONS;
  const cleaned: OptimizedModel[] = models
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.hfRepo === 'string')
    .map((m): OptimizedModel => ({
      id: m.id,
      name: m.name,
      description: typeof m.description === 'string' ? m.description : '',
      hfRepo: m.hfRepo,
      type: m.type === 'vlm' ? 'vlm' : 'llm',
      precisions: Array.isArray(m.precisions)
        ? m.precisions.map(String).filter((p) => allowed.includes(p))
        : [],
    }))
    .filter((m) => m.precisions.length > 0);
  return cleaned.length ? { models: cleaned } : null;
}

export async function fetchOptimizedCatalog(force = false): Promise<OptimizedModelsCatalog> {
  const staleMs = 5 * 60 * 1000;
  if (!force && lastFetchAt && Date.now() - lastFetchAt < staleMs) {
    return cached;
  }

  try {
    const res = await fetch(REMOTE_OPTIMIZED_CATALOG_URL, {
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

  cached = readBundledCatalog() ?? DEFAULT_OPTIMIZED_CATALOG;
  lastFetchAt = Date.now();
  return cached;
}
