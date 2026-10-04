import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'neuron_theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveEffective(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

function applyTheme(pref: ThemePreference) {
  const effective = resolveEffective(pref);
  // Dark has no explicit attribute (it's the default look, matching all the
  // existing hand-authored CSS); light opts in via [data-theme="light"].
  if (effective === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/** Reads/writes the persisted theme preference and keeps <html data-theme> in sync.
 *  Call `applyStoredTheme()` once at startup (before React mounts) to avoid a flash. */
export function applyStoredTheme(): void {
  const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'dark';
  applyTheme(stored);
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'dark',
  );

  useEffect(() => {
    applyTheme(preference);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  // Live-update when in 'auto' mode and the OS theme changes.
  useEffect(() => {
    if (preference !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => setPreference(next), []);

  return { preference, setTheme };
}
