import { useCallback, useEffect, useState } from 'react';
import type { OpenCodeState } from '@shared/types';

const INITIAL: OpenCodeState = {
  installed: false,
  version: null,
  running: false,
  url: null,
  projectDir: null,
  installing: false,
  progressMessage: null,
  error: null,
};

export function useOpenCode() {
  const [state, setState] = useState<OpenCodeState>(INITIAL);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.geniex.opencode.getState().then(setState);
    return window.geniex.opencode.onStateChanged(setState);
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      setState(await window.geniex.opencode.start());
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      setState(await window.geniex.opencode.stop());
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      setState(await window.geniex.opencode.install());
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshInstall = useCallback(async () => {
    setState(await window.geniex.opencode.refreshInstall());
  }, []);

  return { state, busy, start, stop, install, refreshInstall };
}
