import { useEffect, useState } from 'react';
import type { SystemMetricsSnapshot } from '@shared/types';

export function useSystemMetrics(): SystemMetricsSnapshot | null {
  const [snap, setSnap] = useState<SystemMetricsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.geniex.metrics.get().then((s) => {
      if (!cancelled) setSnap(s);
    });
    const off = window.geniex.metrics.onChanged(setSnap);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  return snap;
}
