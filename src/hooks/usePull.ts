import { useCallback, useEffect, useRef, useState } from 'react';
import type { PullProgress } from '@shared/types';

/** Tracks all in-flight pulls/imports by requestId, keyed off the shared pull:progress event. */
export function usePullProgress() {
  const [pulls, setPulls] = useState<Record<string, PullProgress>>({});

  useEffect(() => {
    return window.geniex.pull.onProgress((progress) => {
      setPulls((prev) => ({ ...prev, [progress.requestId]: progress }));
    });
  }, []);

  const dismiss = useCallback((requestId: string) => {
    setPulls((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }, []);

  return { pulls, dismiss };
}

export function useStartPull() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestId = useRef<string | null>(null);

  const start = useCallback(
    async (opts: { modelName: string; precision: string | null; modelHub: 'hf' | 'aihub' | null }) => {
      setStarting(true);
      setError(null);
      try {
        const requestId = await window.geniex.pull.start(opts);
        lastRequestId.current = requestId;
        return requestId;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  const cancel = useCallback((requestId: string) => window.geniex.pull.cancel(requestId), []);

  return { start, cancel, starting, error };
}
