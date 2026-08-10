import { useState } from 'react';
import { useCachedModels } from '../hooks/useModels';
import { useActiveModel } from '../hooks/useActiveModel';
import { ModelCard } from '../components/ModelCard';
import { ConnectEndpointPanel } from '../components/ConnectEndpointPanel';
import { formatBytes } from '../lib/format';

export function MyModels() {
  const { models, loading, error, refresh, remove } = useCachedModels();
  const { state: active, load, unload } = useActiveModel();
  const [busyName, setBusyName] = useState<string | null>(null);
  const showConnect = active.status === 'loaded' && !!active.modelName;

  const handleLoad = async (name: string) => {
    setBusyName(name);
    try {
      await load(name);
    } finally {
      setBusyName(null);
    }
  };

  const handleUnload = async () => {
    setBusyName(active.modelName);
    try {
      await unload();
    } finally {
      setBusyName(null);
    }
  };

  const handleRemove = async (name: string) => {
    if (active.modelName === name && active.status !== 'idle') {
      await unload();
    }
    await remove(name);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Models</h1>
          <p>Models downloaded to your local GenieX cache.</p>
        </div>
        <button className="btn" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showConnect && active.modelName && (
        <div style={{ marginBottom: 20 }}>
          <div className="active-model-row" style={{ marginBottom: 10 }}>
            <div className="active-model-info">
              <span className="status-dot loaded" />
              <span className="active-model-name">{active.modelName}</span>
              <span className="active-model-status">Loaded — OpenAI-compatible endpoint ready</span>
            </div>
            <button
              className="btn btn-sm"
              onClick={handleUnload}
              disabled={busyName === active.modelName}
            >
              {busyName === active.modelName ? 'Unloading…' : 'Unload'}
            </button>
          </div>
          <ConnectEndpointPanel modelName={active.modelName} />
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : models.length === 0 ? (
        <div className="empty-state">
          No models downloaded yet. Head to the Marketplace or Import Local to add one.
        </div>
      ) : (
        <div className="card-grid">
          {models.map((m) => {
            const isActive = active.modelName === m.name;
            const isBusy = busyName === m.name || (isActive && (active.status === 'starting' || active.status === 'stopping'));
            return (
              <ModelCard
                key={m.name}
                title={m.name}
                badges={
                  <>
                    <span className="badge badge-type">{m.type}</span>
                    <span className="badge">{m.runtime}</span>
                    {isActive && active.status === 'loaded' && <span className="badge badge-loaded">● loaded</span>}
                  </>
                }
                meta={
                  <>
                    {m.precisions.filter((p) => p !== 'N/A').map((p) => (
                      <span key={p} className="badge badge-precision">
                        {p}
                      </span>
                    ))}
                    <span>{formatBytes(m.size)}</span>
                  </>
                }
                footer={
                  <>
                    {isActive && active.status === 'loaded' ? (
                      <button className="btn btn-sm" onClick={handleUnload} disabled={isBusy}>
                        {isBusy ? 'Unloading…' : 'Unload'}
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => handleLoad(m.name)} disabled={isBusy}>
                        {isBusy ? 'Loading…' : 'Load'}
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => handleRemove(m.name)} disabled={isBusy}>
                      Delete
                    </button>
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
