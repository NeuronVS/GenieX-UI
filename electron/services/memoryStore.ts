import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import type { MemoryEntry, MemorySearchQuery } from '@shared/types';

interface StoreShape {
  entries: MemoryEntry[];
}

const store = new Store<StoreShape>({
  name: 'neuron-memory',
  defaults: { entries: [] },
});

export function upsertMemory(
  input: Omit<MemoryEntry, 'id' | 'createdAt'> & { id?: string },
): MemoryEntry {
  const entries = store.get('entries');
  const now = new Date().toISOString();
  if (input.id) {
    const idx = entries.findIndex((e) => e.id === input.id);
    if (idx >= 0) {
      const updated: MemoryEntry = {
        ...entries[idx],
        appId: input.appId,
        tags: input.tags,
        text: input.text,
        meta: input.meta,
      };
      entries[idx] = updated;
      store.set('entries', entries);
      return updated;
    }
  }
  const created: MemoryEntry = {
    id: input.id ?? randomUUID(),
    appId: input.appId,
    tags: input.tags ?? [],
    text: input.text,
    createdAt: now,
    meta: input.meta,
  };
  entries.push(created);
  store.set('entries', entries);
  return created;
}

export function listMemory(appId?: string | null): MemoryEntry[] {
  const entries = store.get('entries');
  if (!appId) return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries
    .filter((e) => e.appId === appId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function searchMemory(query: MemorySearchQuery): MemoryEntry[] {
  const q = query.query?.trim().toLowerCase() ?? '';
  const tags = query.tags?.map((t) => t.toLowerCase()) ?? [];
  const limit = query.limit ?? 50;

  let results = store.get('entries');
  if (query.appId) {
    results = results.filter((e) => e.appId === query.appId);
  }
  if (tags.length) {
    results = results.filter((e) => tags.every((t) => e.tags.map((x) => x.toLowerCase()).includes(t)));
  }
  if (q) {
    results = results.filter((e) => e.text.toLowerCase().includes(q));
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export function removeMemory(id: string): boolean {
  const entries = store.get('entries');
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  store.set('entries', next);
  return true;
}
