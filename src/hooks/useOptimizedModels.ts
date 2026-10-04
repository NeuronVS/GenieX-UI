import { useCallback, useEffect, useState } from 'react';
import type { OptimizedModel } from '@shared/types';

export function useOptimizedModels() {
  const [models, setModels] = useState<OptimizedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const catalog = force
        ? await window.geniex.optimized.refreshCatalog()
        : await window.geniex.optimized.getCatalog();
      setModels(catalog.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { models, loading, error, refresh };
}
