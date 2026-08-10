import { useMemo, useState } from 'react';
import { useHubModels } from '../hooks/useModels';
import { useStartPull } from '../hooks/usePull';
import { ModelCard } from '../components/ModelCard';
import { ALLOWED_PRECISIONS } from '@shared/types';
import type { PrecisionQueryResult } from '@shared/types';

type Tab = 'qualcomm' | 'huggingface';

export function Marketplace() {
  const [tab, setTab] = useState<Tab>('qualcomm');
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Marketplace</h1>
          <p>Browse Qualcomm AI Hub models or pull a model directly from HuggingFace.</p>
        </div>
        <div className="toolbar">
          <button
            className={`btn${tab === 'qualcomm' ? ' btn-primary' : ''}`}
            onClick={() => setTab('qualcomm')}
          >
            Qualcomm AI Hub
          </button>
          <button
            className={`btn${tab === 'huggingface' ? ' btn-primary' : ''}`}
            onClick={() => setTab('huggingface')}
          >
            HuggingFace
          </button>
        </div>
      </div>
      {tab === 'qualcomm' ? <QualcommCatalog /> : <HuggingFaceLookup />}
    </div>
  );
}

function QualcommCatalog() {
  const { models, loading, error, refresh } = useHubModels();
  const [query, setQuery] = useState('');
  const { start } = useStartPull();
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => models.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())),
    [models, query],
  );

  const handleDownload = async (name: string) => {
    setDownloading((prev) => new Set(prev).add(name));
    try {
      // Qualcomm AI Hub bundles are pre-quantized (w4a16) with a single
      // build per model — there's no precision picker to show, so this
      // starts the download directly.
      await start({ modelName: name, precision: null, modelHub: 'aihub' });
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          className="search-input"
          placeholder="Search Qualcomm models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <div className="empty-state">Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No models match "{query}".</div>
      ) : (
        <div className="card-grid">
          {filtered.map((m) => (
            <ModelCard
              key={m.name}
              title={m.name}
              badges={
                <>
                  <span className="badge badge-type">{m.type}</span>
                  <span className="badge">NPU-optimized</span>
                </>
              }
              meta={<span>{m.chipsets.slice(0, 3).join(', ')}{m.chipsets.length > 3 ? '…' : ''}</span>}
              footer={
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleDownload(m.name)}
                  disabled={downloading.has(m.name)}
                >
                  {downloading.has(m.name) ? 'Starting…' : 'Download'}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HuggingFaceLookup() {
  const [repo, setRepo] = useState('');
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<PrecisionQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const { start } = useStartPull();
  const [downloadingPrecision, setDownloadingPrecision] = useState<string | null>(null);

  const handleQuery = async () => {
    if (!repo.trim()) return;
    setQuerying(true);
    setQueryError(null);
    setResult(null);
    try {
      const res = await window.geniex.hub.queryPrecisions(repo.trim());
      setResult(res);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
    } finally {
      setQuerying(false);
    }
  };

  const handleDownload = async (precision: string) => {
    setDownloadingPrecision(precision);
    try {
      await start({ modelName: repo.trim(), precision, modelHub: 'hf' });
    } finally {
      setDownloadingPrecision(null);
    }
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          className="search-input"
          style={{ minWidth: 380 }}
          placeholder="e.g. unsloth/Qwen3-0.6B-GGUF"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
        />
        <button className="btn btn-primary" onClick={handleQuery} disabled={querying || !repo.trim()}>
          {querying ? 'Checking…' : 'Check available precisions'}
        </button>
      </div>

      <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: -8, marginBottom: 20 }}>
        Only {ALLOWED_PRECISIONS.join(', ')} are shown — other quantizations aren't guaranteed to
        run well on this device.
      </p>

      {queryError && <div className="error-banner">{queryError}</div>}

      {result?.isSinglePrecisionAutoStart && (
        <div className="error-banner">
          This model only offers one precision and GenieX starts downloading it immediately with
          no size preview. Use the model name directly if you're sure you want it.
        </div>
      )}

      {result && !result.isSinglePrecisionAutoStart && (
        result.candidates.length === 0 ? (
          <div className="empty-state">
            None of this model's available precisions are in the allowed set ({ALLOWED_PRECISIONS.join(', ')}).
          </div>
        ) : (
          <div className="card-grid">
            {result.candidates.map((c) => (
              <ModelCard
                key={c.precision}
                title={`${result.modelName}:${c.precision}`}
                badges={<span className="badge badge-precision">{c.precision}</span>}
                meta={<span>{c.sizeLabel}</span>}
                footer={
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDownload(c.precision)}
                    disabled={downloadingPrecision === c.precision}
                  >
                    {downloadingPrecision === c.precision ? 'Starting…' : 'Download'}
                  </button>
                }
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
