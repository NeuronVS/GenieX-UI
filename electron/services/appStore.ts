import Store from 'electron-store';
import type { InstalledApp } from '@shared/types';
import { getCatalogApp, getCachedCatalog, fetchAppsCatalog } from './appCatalog';

interface StoreShape {
  installed: InstalledApp[];
  seeded: boolean;
}

const store = new Store<StoreShape>({
  name: 'neuron-apps',
  defaults: {
    installed: [],
    seeded: false,
  },
});

function seedChatIfNeeded(): void {
  if (store.get('seeded')) return;
  const installed = store.get('installed');
  if (!installed.some((a) => a.id === 'chat')) {
    installed.push({
      id: 'chat',
      version: getCatalogApp('chat')?.version ?? '1.0.0',
      installedAt: new Date().toISOString(),
    });
    store.set('installed', installed);
  }
  store.set('seeded', true);
}

export function listInstalledApps(): InstalledApp[] {
  seedChatIfNeeded();
  return store.get('installed');
}

export async function installApp(id: string): Promise<InstalledApp[]> {
  await fetchAppsCatalog();
  const catalog = getCachedCatalog();
  const meta = catalog.apps.find((a) => a.id === id);
  if (!meta) throw new Error(`Unknown app: ${id}`);

  const installed = listInstalledApps();
  if (!installed.some((a) => a.id === id)) {
    installed.push({
      id,
      version: meta.version,
      installedAt: new Date().toISOString(),
    });
    store.set('installed', installed);
  }
  return store.get('installed');
}

export function uninstallApp(id: string): InstalledApp[] {
  const next = listInstalledApps().filter((a) => a.id !== id);
  store.set('installed', next);
  return next;
}
