import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExplorerEntry,
  ExplorerOpResult,
  ExplorerPlace,
  FileOrganizerEntry,
} from '@shared/types';

export type ExplorerView = 'details' | 'icons';
export type SortKey = 'name' | 'modifiedAt' | 'type' | 'size';
export interface SortState {
  key: SortKey;
  dir: 1 | -1;
}
export interface Clipboard {
  mode: 'copy' | 'cut';
  paths: string[];
}

/** `null` cwd = the root list — the folders added for indexing in Settings. */
export function useExplorer() {
  const [cwd, setCwd] = useState<string | null>(null);
  const [entries, setEntries] = useState<ExplorerEntry[]>([]);
  const [roots, setRoots] = useState<ExplorerPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 1 });
  const [view, setView] = useState<ExplorerView>('details');

  // LLM index (summaries/tags/thumbnails), keyed by lowercased absolute path.
  // Optional layer over the live filesystem — absent entries just mean "not indexed".
  const [index, setIndex] = useState<Map<string, FileOrganizerEntry>>(new Map());
  const loadIndex = useCallback(async () => {
    try {
      const all = await window.geniex.fileOrganizer.listEntries(null);
      setIndex(new Map(all.map((e) => [e.path.toLowerCase(), e])));
    } catch {
      /* index is optional */
    }
  }, []);

  const history = useRef<Array<string | null>>([null]);
  const hIndex = useRef(0);
  const [navState, setNavState] = useState({ canBack: false, canForward: false });

  const syncNavState = useCallback(() => {
    setNavState({
      canBack: hIndex.current > 0,
      canForward: hIndex.current < history.current.length - 1,
    });
  }, []);

  // The File Manager is scoped to the folders the user added for indexing in
  // Settings — it is not a whole-machine browser. `null` cwd shows this list.
  const loadRoots = useCallback(async (): Promise<ExplorerPlace[]> => {
    try {
      const list = await window.geniex.fileOrganizer.listRoots();
      const places = list.map((r) => ({
        path: r.path,
        label: r.path.split(/[\\/]+/).filter(Boolean).pop() ?? r.path,
        icon: '📁',
      }));
      setRoots(places);
      return places;
    } catch {
      setRoots([]);
      return [];
    }
  }, []);

  const load = useCallback(async (dir: string | null) => {
    setLoading(true);
    setError(null);
    try {
      if (dir === null) {
        setEntries([]);
      } else {
        setEntries(await window.geniex.explorer.listDirectory(dir));
      }
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoots();
    void load(null);
    void loadIndex();
    // Refresh index + roots when a background scan finishes.
    return window.geniex.fileOrganizer.onScanProgress((p) => {
      if (p.status === 'completed') {
        void loadIndex();
        void loadRoots();
      }
    });
  }, [load, loadIndex, loadRoots]);

  const refresh = useCallback(() => {
    void loadIndex();
    void loadRoots();
    return load(cwd);
  }, [load, cwd, loadIndex, loadRoots]);

  const rootPaths = useMemo(
    () => new Set(roots.map((r) => r.path.replace(/[\\/]+$/, '').toLowerCase())),
    [roots],
  );
  /** True when `dir` is one of the added roots (so "up" from it returns to the list). */
  const isRoot = useCallback(
    (dir: string) => rootPaths.has(dir.replace(/[\\/]+$/, '').toLowerCase()),
    [rootPaths],
  );

  const navigate = useCallback(
    (dir: string | null) => {
      // Truncate any forward history, push the new location.
      history.current = history.current.slice(0, hIndex.current + 1);
      history.current.push(dir);
      hIndex.current = history.current.length - 1;
      syncNavState();
      setSelection(new Set());
      setCwd(dir);
      void load(dir);
      void loadIndex(); // pick up entries from a scan that finished elsewhere
    },
    [load, syncNavState, loadIndex],
  );

  const back = useCallback(() => {
    if (hIndex.current <= 0) return;
    hIndex.current -= 1;
    const dir = history.current[hIndex.current];
    syncNavState();
    setSelection(new Set());
    setCwd(dir);
    void load(dir);
  }, [load, syncNavState]);

  const forward = useCallback(() => {
    if (hIndex.current >= history.current.length - 1) return;
    hIndex.current += 1;
    const dir = history.current[hIndex.current];
    syncNavState();
    setSelection(new Set());
    setCwd(dir);
    void load(dir);
  }, [load, syncNavState]);

  const up = useCallback(() => {
    if (cwd === null) return;
    // At an added root (or above it) -> back to the root list, never the real parent.
    navigate(isRoot(cwd) ? null : parentDir(cwd));
  }, [cwd, navigate, isRoot]);

  const addRoot = useCallback(async () => {
    const picked = await window.geniex.fileOrganizer.pickFolder();
    if (!picked) return;
    await window.geniex.fileOrganizer.addRoot(picked);
    await loadRoots();
  }, [loadRoots]);

  const reportResults = useCallback((label: string, results: ExplorerOpResult[]) => {
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      setNotice(null);
      return;
    }
    setNotice(`${label} failed for ${failed.length} item(s): ${failed[0].error ?? 'unknown error'}`);
  }, []);

  const move = useCallback(
    async (sources: string[], destDir: string) => {
      const clean = sources.filter((s) => parentDir(s) !== destDir && s !== destDir);
      if (clean.length === 0) return;
      const results = await window.geniex.explorer.move(clean, destDir);
      reportResults('Move', results);
      setSelection(new Set());
      void refresh();
    },
    [refresh, reportResults],
  );

  const paste = useCallback(
    async (destDir: string) => {
      if (!clipboard) return;
      const fn = clipboard.mode === 'cut' ? window.geniex.explorer.move : window.geniex.explorer.copy;
      const results = await fn(clipboard.paths, destDir);
      reportResults(clipboard.mode === 'cut' ? 'Move' : 'Copy', results);
      if (clipboard.mode === 'cut') setClipboard(null);
      void refresh();
    },
    [clipboard, refresh, reportResults],
  );

  const open = useCallback(
    async (entry: ExplorerEntry) => {
      if (entry.isDirectory) {
        navigate(entry.path);
        return;
      }
      const err = await window.geniex.explorer.openPath(entry.path);
      if (err) setNotice(`Couldn't open "${entry.name}": ${err}`);
    },
    [navigate],
  );

  const createFolder = useCallback(async () => {
    if (cwd === null) return null;
    try {
      const created = await window.geniex.explorer.createFolder(cwd);
      await refresh();
      return created;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [cwd, refresh]);

  const rename = useCallback(
    async (targetPath: string, newName: string) => {
      try {
        await window.geniex.explorer.rename(targetPath, newName);
        await refresh();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  const trash = useCallback(
    async (paths: string[]) => {
      const results = await window.geniex.explorer.trash(paths);
      reportResults('Delete', results);
      setSelection(new Set());
      void refresh();
    },
    [refresh, reportResults],
  );

  return {
    cwd,
    entries,
    roots,
    isRoot,
    addRoot,
    loading,
    error,
    notice,
    setNotice,
    selection,
    setSelection,
    clipboard,
    setClipboard,
    sort,
    setSort,
    view,
    setView,
    navState,
    index,
    loadIndex,
    navigate,
    back,
    forward,
    up,
    refresh,
    move,
    paste,
    open,
    createFolder,
    rename,
    trash,
  };
}

/** Parent of an absolute path, or `null` when it's a drive/filesystem root. */
export function parentDir(p: string): string | null {
  const norm = p.replace(/[\\/]+$/, '');
  // Windows drive root, e.g. "C:" -> This PC.
  if (/^[A-Za-z]:$/.test(norm)) return null;
  if (norm === '') return null;
  const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'));
  if (idx < 0) return null;
  if (/^[A-Za-z]:$/.test(norm.slice(0, idx))) return norm.slice(0, idx + 1); // "C:\" stays rooted
  if (idx === 0) return '/';
  return norm.slice(0, idx);
}
