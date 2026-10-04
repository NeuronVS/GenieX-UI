// App-scoped settings/secrets for Core-API-embedded apps (e.g. a future
// Small Business app's Brave Search token). Plaintext electron-store, same
// precedent as storageConfig.ts's hfToken — not a real secrets vault, just
// as secure as everything else Neuron already stores this way.
//
// Scoping is enforced by the caller always passing the appId resolved from
// the Core API's bearer token (see coreApiServer.ts) — never a client-
// supplied field, which is what makes this a real boundary and not just a
// filter (unlike memoryStore.ts's existing appId, which IPC callers can
// currently claim freely — acceptable there only because IPC is exclusively
// reachable from Neuron's own trusted renderer).

import Store from 'electron-store';

interface StoreShape {
  perApp: Record<string, Record<string, string>>;
}

const store = new Store<StoreShape>({
  name: 'neuron-app-secrets',
  defaults: { perApp: {} },
});

export function listAppSettings(appId: string): Record<string, string> {
  return store.get('perApp')[appId] ?? {};
}

export function getAppSetting(appId: string, key: string): string | null {
  return listAppSettings(appId)[key] ?? null;
}

export function setAppSetting(appId: string, key: string, value: string): void {
  const perApp = store.get('perApp');
  const app = { ...(perApp[appId] ?? {}), [key]: value };
  store.set('perApp', { ...perApp, [appId]: app });
}

export function deleteAppSetting(appId: string, key: string): boolean {
  const perApp = store.get('perApp');
  const app = perApp[appId];
  if (!app || !(key in app)) return false;
  const { [key]: _removed, ...rest } = app;
  store.set('perApp', { ...perApp, [appId]: rest });
  return true;
}
