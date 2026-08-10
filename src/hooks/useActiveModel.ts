import { useCallback, useEffect, useState } from 'react';
import type { ActiveModelState } from '@shared/types';

const INITIAL: ActiveModelState = { modelName: null, status: 'idle', error: null };

export function useActiveModel() {
  const [state, setState] = useState<ActiveModelState>(INITIAL);

  useEffect(() => {
    window.geniex.runtime.getActive().then(setState);
    return window.geniex.runtime.onStateChanged(setState);
  }, []);

  const load = useCallback(async (modelName: string) => {
    setState((s) => ({ ...s, status: 'starting' }));
    const next = await window.geniex.runtime.load(modelName);
    setState(next);
    return next;
  }, []);

  const unload = useCallback(async () => {
    setState((s) => ({ ...s, status: 'stopping' }));
    const next = await window.geniex.runtime.unload();
    setState(next);
    return next;
  }, []);

  return { state, load, unload };
}
