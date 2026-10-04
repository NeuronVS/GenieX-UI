import { useCallback, useEffect, useState } from 'react';
import type { AppsCatalog, CatalogApp, InstalledApp } from '@shared/types';

export function useApps() {
  const [catalog, setCatalog] = useState<AppsCatalog | null>(null);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cat, inst] = await Promise.all([
        window.geniex.apps.getCatalog(),
        window.geniex.apps.listInstalled(),
      ]);
      setCatalog(cat);
      setInstalled(inst);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(async (id: string) => {
    const next = await window.geniex.apps.install(id);
    setInstalled(next);
    return next;
  }, []);

  const uninstall = useCallback(async (id: string) => {
    const next = await window.geniex.apps.uninstall(id);
    setInstalled(next);
    return next;
  }, []);

  const refreshCatalog = useCallback(async () => {
    const cat = await window.geniex.apps.refreshCatalog();
    setCatalog(cat);
    return cat;
  }, []);

  const installedApps: CatalogApp[] = (catalog?.apps ?? []).filter((a) =>
    installed.some((i) => i.id === a.id),
  );

  return {
    catalog,
    installed,
    installedApps,
    loading,
    error,
    refresh,
    refreshCatalog,
    install,
    uninstall,
  };
}
