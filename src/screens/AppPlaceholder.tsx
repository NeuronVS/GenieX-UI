import { useMemo, useState } from 'react';
import type { CatalogApp } from '@shared/types';
import { useCachedModels } from '../hooks/useModels';
import { useActiveModel } from '../hooks/useActiveModel';
import { useStartPull } from '../hooks/usePull';

export function AppPlaceholder({ app }: { app: CatalogApp }) {
  const { models, refresh } = useCachedModels();
  const { state: active, load } = useActiveModel();
  const { start } = useStartPull();
  const [busy, setBusy] = useState(false);

  const missing = useMemo(
    () =>
      app.requiredModels.filter(
        (name) => !models.some((m) => m.name.toLowerCase() === name.toLowerCase()),
      ),
    [app.requiredModels, models],
  );

  const firstRequired = app.requiredModels[0];
  const needsLoad =
    !!firstRequired &&
    missing.length === 0 &&
    !(active.status === 'loaded' && active.modelName?.toLowerCase() === firstRequired.toLowerCase());

  const handleDownloadMissing = async () => {
    setBusy(true);
    try {
      for (const modelName of missing) {
        await start({ modelName, precision: null, modelHub: 'aihub' });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async () => {
    if (!firstRequired) return;
    setBusy(true);
    try {
      await load(firstRequired);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            {app.icon} {app.name}
          </h1>
          <p>{app.description}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, padding: 24, gap: 16 }}>
        <div style={{ fontWeight: 600 }}>Coming soon</div>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          This app is installed and ready in your menu. The full experience ships in a later
          Neuron release — the structure and model hooks are already wired.
        </p>

        {app.requiredModels.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Required models: {app.requiredModels.join(', ')}
          </div>
        )}

        {missing.length > 0 && (
          <div className="error-banner">
            Missing models: {missing.join(', ')}. Download them to prepare this app.
          </div>
        )}

        {needsLoad && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
            Model is downloaded but not loaded. Load it before using this app.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {missing.length > 0 && (
            <button className="btn btn-primary" onClick={handleDownloadMissing} disabled={busy}>
              {busy ? 'Starting…' : 'Download required models'}
            </button>
          )}
          {needsLoad && (
            <button className="btn btn-primary" onClick={handleLoad} disabled={busy}>
              {busy ? 'Loading…' : `Load ${firstRequired}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
