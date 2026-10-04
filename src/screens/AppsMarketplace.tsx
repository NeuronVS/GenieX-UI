import { useState } from 'react';
import type { AppsCatalog, CatalogApp, InstalledApp } from '@shared/types';
import { useCachedModels } from '../hooks/useModels';
import { useStartPull } from '../hooks/usePull';
import { ModelCard } from '../components/ModelCard';

export function AppsMarketplace({
  catalog,
  installed,
  loading,
  error,
  refreshCatalog,
  install,
  uninstall,
}: {
  catalog: AppsCatalog | null;
  installed: InstalledApp[];
  loading: boolean;
  error: string | null;
  refreshCatalog: () => Promise<AppsCatalog>;
  install: (id: string) => Promise<InstalledApp[]>;
  uninstall: (id: string) => Promise<InstalledApp[]>;
}) {
  const { models, refresh: refreshModels } = useCachedModels();
  const { start } = useStartPull();
  const [busyId, setBusyId] = useState<string | null>(null);

  const installedSet = new Set(installed.map((i) => i.id));

  const handleInstall = async (app: CatalogApp) => {
    setBusyId(app.id);
    try {
      await refreshModels();
      const cachedNames = new Set(
        (await window.geniex.models.list()).map((m) => m.name.toLowerCase()),
      );
      for (const modelName of app.requiredModels) {
        if (!cachedNames.has(modelName.toLowerCase())) {
          await start({ modelName, precision: null, modelHub: 'aihub' });
        }
      }
      await install(app.id);
    } finally {
      setBusyId(null);
    }
  };

  const handleUninstall = async (id: string) => {
    const name = catalog?.apps.find((a) => a.id === id)?.name ?? 'this app';
    if (!window.confirm(`Uninstall "${name}"? You can reinstall it later from this Marketplace.`)) return;
    setBusyId(id);
    try {
      await uninstall(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Marketplace</h1>
          <p>Install Neuron apps. They show up in the left menu when ready.</p>
        </div>
        <button className="btn" onClick={() => refreshCatalog()}>
          Refresh catalog
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && !catalog ? (
        <div className="empty-state">Loading apps…</div>
      ) : (
        <div className="card-grid">
          {(catalog?.apps ?? []).map((app) => {
            const isInstalled = installedSet.has(app.id);
            const missingModels = app.requiredModels.filter(
              (name) => !models.some((m) => m.name.toLowerCase() === name.toLowerCase()),
            );
            return (
              <ModelCard
                key={app.id}
                title={`${app.icon} ${app.name}`}
                badges={
                  <>
                    {app.builtin && <span className="badge">Built-in</span>}
                    <span className="badge">v{app.version}</span>
                    {isInstalled && <span className="badge badge-loaded">Installed</span>}
                  </>
                }
                meta={<span>{app.description}</span>}
                footer={
                  <>
                    {app.requiredModels.length > 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Models:{' '}
                        {missingModels.length
                          ? `${missingModels.join(', ')} (will download)`
                          : app.requiredModels.join(', ')}
                      </span>
                    )}
                    {isInstalled ? (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleUninstall(app.id)}
                        disabled={busyId === app.id}
                      >
                        {busyId === app.id ? '…' : 'Uninstall'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleInstall(app)}
                        disabled={busyId === app.id}
                      >
                        {busyId === app.id ? 'Installing…' : 'Install'}
                      </button>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
