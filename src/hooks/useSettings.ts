import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, DiskSpaceInfo } from '@shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshDiskSpace = useCallback(async (dir?: string) => {
    setDiskSpace(await window.geniex.storage.getDiskSpace(dir));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await window.geniex.settings.get();
    setSettings(s);
    await refreshDiskSpace(s.dataDir);
    setLoading(false);
  }, [refreshDiskSpace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setDataDir = useCallback(
    async (dir: string) => {
      await window.geniex.settings.setDataDir(dir);
      await refresh();
    },
    [refresh],
  );

  const pickAndSetDataDir = useCallback(async () => {
    const dir = await window.geniex.settings.pickDataDir();
    if (dir) await setDataDir(dir);
    return dir;
  }, [setDataDir]);

  const setHfToken = useCallback(
    async (token: string) => {
      await window.geniex.settings.setHfToken(token);
      await refresh();
    },
    [refresh],
  );

  const setProjectDir = useCallback(
    async (dir: string) => {
      await window.geniex.settings.setProjectDir(dir);
      await refresh();
    },
    [refresh],
  );

  const pickAndSetProjectDir = useCallback(async () => {
    const dir = await window.geniex.settings.pickProjectDir();
    if (dir) await setProjectDir(dir);
    return dir;
  }, [setProjectDir]);

  return {
    settings,
    diskSpace,
    loading,
    setDataDir,
    pickAndSetDataDir,
    setHfToken,
    setProjectDir,
    pickAndSetProjectDir,
    refresh,
  };
}
