import { useCallback, useEffect, useState } from 'react';
import type { CachedModel, HubModel } from '@shared/types';

export function useHubModels() {
  const [models, setModels] = useState<HubModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await window.geniex.hub.listModels());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, loading, error, refresh };
}

export function useCachedModels() {
  const [models, setModels] = useState<CachedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await window.geniex.models.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (name: string) => {
      await window.geniex.models.remove(name);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, loading, error, refresh, remove };
}
