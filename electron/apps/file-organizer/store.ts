// Persistence for the File Organizer app: roots (folders the user added) and
// the flat entry index across all of them. v1 is index/tag only — nothing
// here ever touches a file on disk, it only records metadata about them.

import Store from 'electron-store';
import type { FileOrganizerEntry, FileOrganizerRoot } from '@shared/types';

interface StoreShape {
  roots: FileOrganizerRoot[];
  entries: FileOrganizerEntry[];
}

const store = new Store<StoreShape>({
  name: 'neuron-file-organizer',
  defaults: { roots: [], entries: [] },
});

export function listRoots(): FileOrganizerRoot[] {
  return store.get('roots');
}

export function getRoot(id: string): FileOrganizerRoot | undefined {
  return store.get('roots').find((r) => r.id === id);
}

export function addRoot(root: FileOrganizerRoot): FileOrganizerRoot[] {
  const roots = store.get('roots');
  if (roots.some((r) => r.path === root.path)) return roots;
  roots.push(root);
  store.set('roots', roots);
  return roots;
}

export function setRootLastScanAt(id: string, iso: string): void {
  const roots = store.get('roots');
  const idx = roots.findIndex((r) => r.id === id);
  if (idx < 0) return;
  roots[idx] = { ...roots[idx], lastScanAt: iso };
  store.set('roots', roots);
}

export function removeRoot(id: string): { roots: FileOrganizerRoot[]; entries: FileOrganizerEntry[] } {
  const roots = store.get('roots').filter((r) => r.id !== id);
  const entries = store.get('entries').filter((e) => e.rootId !== id);
  store.set('roots', roots);
  store.set('entries', entries);
  return { roots, entries };
}

export function listEntries(rootId?: string | null): FileOrganizerEntry[] {
  const entries = store.get('entries');
  return rootId ? entries.filter((e) => e.rootId === rootId) : entries;
}

/** Insert or replace one entry, keyed by absolute path. */
export function upsertEntry(entry: FileOrganizerEntry): void {
  const entries = store.get('entries');
  const idx = entries.findIndex((e) => e.path === entry.path);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  store.set('entries', entries);
}

/** Merge in a lazily-rendered thumbnail (e.g. a PDF first page) without touching the rest of the entry. */
export function setEntryThumbnail(path: string, thumbnail: string): boolean {
  const entries = store.get('entries');
  const idx = entries.findIndex((e) => e.path === path);
  if (idx < 0) return false;
  entries[idx] = { ...entries[idx], thumbnail };
  store.set('entries', entries);
  return true;
}

/** Drop entries under `rootId` whose path wasn't seen in the latest full scan (deleted/moved files). */
export function pruneMissingEntries(rootId: string, seenPaths: Set<string>): void {
  const entries = store.get('entries');
  const next = entries.filter((e) => e.rootId !== rootId || seenPaths.has(e.path));
  if (next.length !== entries.length) store.set('entries', next);
}

const sep = process.platform === 'win32' ? '\\' : '/';

/**
 * Rewrite indexed entry paths after the Explorer moved/renamed something on
 * disk, so LLM search results don't point at a path that no longer exists.
 * Handles both the item itself and (if it was a folder) everything under it.
 */
export function renameEntryPaths(oldPath: string, newPath: string): void {
  const entries = store.get('entries');
  const oldPrefix = oldPath.endsWith(sep) ? oldPath : oldPath + sep;
  let changed = false;
  const next = entries.map((e) => {
    if (e.path === oldPath) {
      changed = true;
      return { ...e, path: newPath, name: newPath.split(/[\\/]+/).pop() ?? e.name };
    }
    if (e.path.startsWith(oldPrefix)) {
      changed = true;
      return { ...e, path: newPath + sep + e.path.slice(oldPrefix.length) };
    }
    return e;
  });
  if (changed) store.set('entries', next);
}

/** Drop indexed entries at (or under) any of the given paths — e.g. after a trash. */
export function removeEntriesUnder(paths: string[]): void {
  const entries = store.get('entries');
  const prefixes = paths.map((p) => (p.endsWith(sep) ? p : p + sep));
  const next = entries.filter(
    (e) => !paths.includes(e.path) && !prefixes.some((pre) => e.path.startsWith(pre)),
  );
  if (next.length !== entries.length) store.set('entries', next);
}
