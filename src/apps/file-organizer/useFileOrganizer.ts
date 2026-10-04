import { useCallback, useEffect, useState } from 'react';
import type { FileOrganizerEntry, FileOrganizerRoot, FileOrganizerScanProgress } from '@shared/types';

export function useFileOrganizer() {
  const [roots, setRoots] = useState<FileOrganizerRoot[]>([]);
  const [entries, setEntries] = useState<FileOrganizerEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, FileOrganizerScanProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, e] = await Promise.all([
        window.geniex.fileOrganizer.listRoots(),
        window.geniex.fileOrganizer.listEntries(null),
      ]);
      setRoots(r);
      setEntries(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return window.geniex.fileOrganizer.onScanProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.rootId]: p }));
      if (p.status === 'completed' || p.status === 'cancelled') {
        void refresh();
      }
    });
  }, [refresh]);

  const addFolder = useCallback(async () => {
    const picked = await window.geniex.fileOrganizer.pickFolder();
    if (!picked) return null;
    const next = await window.geniex.fileOrganizer.addRoot(picked);
    setRoots(next);
    return picked;
  }, []);

  const removeFolder = useCallback(async (id: string) => {
    const next = await window.geniex.fileOrganizer.removeRoot(id);
    setRoots(next.roots);
    setEntries(next.entries);
  }, []);

  const scanFolder = useCallback(async (id: string) => {
    setError(null);
    try {
      await window.geniex.fileOrganizer.scanRoot(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const cancelFolderScan = useCallback(async (id: string) => {
    await window.geniex.fileOrganizer.cancelScan(id);
  }, []);

  return {
    roots,
    entries,
    progress,
    loading,
    error,
    refresh,
    addFolder,
    removeFolder,
    scanFolder,
    cancelFolderScan,
  };
}
