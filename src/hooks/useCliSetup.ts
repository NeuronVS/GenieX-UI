import { useCallback, useEffect, useState } from 'react';
import type { CliSetupState } from '@shared/types';

const INITIAL: CliSetupState = {
  installed: false,
  version: null,
  installing: false,
  progressMessage: null,
  error: null,
};

export function useCliSetup() {
  const [state, setState] = useState<CliSetupState>(INITIAL);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    window.geniex.setup.getState().then((s) => {
      setState(s);
      setChecked(true);
    });
    return window.geniex.setup.onProgress(setState);
  }, []);

  const install = useCallback(async () => {
    const final = await window.geniex.setup.install();
    setState(final);
    return final;
  }, []);

  return { state, checked, install };
}
