import { useMemo, useState } from 'react';
import { useHubModels } from '../hooks/useModels';
import { useOptimizedModels } from '../hooks/useOptimizedModels';
import { useStartPull } from '../hooks/usePull';
import { ModelCard } from '../components/ModelCard';
import { ALLOWED_PRECISIONS } from '@shared/types';

export function QualcommCatalog() {
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
              meta={
                <span>
                  {m.chipsets.slice(0, 3).join(', ')}
                  {m.chipsets.length > 3 ? '…' : ''}
                </span>
              }
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

export function OptimizedCatalog() {
  const { models, loading, error, refresh } = useOptimizedModels();
  const { start } = useStartPull();
  const [downloading, setDownloading] = useState<string | null>(null); // `${id}:${precision}`
  const [precisionByModel, setPrecisionByModel] = useState<Record<string, string>>({});

  const handleDownload = async (hfRepo: string, key: string, precision: string) => {
    setDownloading(key);
    try {
      await start({ modelName: hfRepo, precision, modelHub: 'hf' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => refresh(true)}>
          Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading ? (
        <div className="empty-state">Loading catalog…</div>
      ) : models.length === 0 ? (
        <div className="empty-state">
          No Neuron-optimized picks published yet — check back soon, or use the Hugging Face or
          Qualcomm tabs in the meantime.
        </div>
      ) : (
        <div className="card-grid">
          {models.map((m) => {
            const precision = precisionByModel[m.id] ?? m.precisions[0];
            const key = `${m.id}:${precision}`;
            return (
              <ModelCard
                key={m.id}
                title={m.name}
                badges={<span className="badge badge-type">{m.type}</span>}
                meta={
                  <>
                    <span>{m.description}</span>
                  </>
                }
                footer={
                  <>
                    <select
                      className="search-input"
                      style={{ minWidth: 90, padding: '5px 8px' }}
                      value={precision}
                      onChange={(e) =>
                        setPrecisionByModel((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                    >
                      {m.precisions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleDownload(m.hfRepo, key, precision)}
                      disabled={downloading === key}
                    >
                      {downloading === key ? 'Starting…' : 'Download'}
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

// HF/GGUF models pick a llama.cpp quantization — W4A16 is Qualcomm's own
// qairt format and never applies here, so it's left out of this dropdown.
const HF_PRECISIONS = ALLOWED_PRECISIONS.filter((p) => p !== 'W4A16');

export function HuggingFaceLookup() {
  const [repo, setRepo] = useState('');
  const [precision, setPrecision] = useState<string>(HF_PRECISIONS[0]);
  const { start, starting, error } = useStartPull();
  const [started, setStarted] = useState(false);

  const handleDownload = async () => {
    if (!repo.trim()) return;
    setStarted(false);
    try {
      await start({ modelName: repo.trim(), precision, modelHub: 'hf' });
      setStarted(true);
    } catch {
      // error already surfaced via useStartPull's `error` state
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
          onChange={(e) => {
            setRepo(e.target.value);
            setStarted(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
        />
        <select
          className="search-input"
          style={{ minWidth: 100 }}
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
        >
          {HF_PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleDownload} disabled={starting || !repo.trim()}>
          {starting ? 'Starting…' : 'Download'}
        </button>
      </div>

      <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: -8, marginBottom: 20 }}>
        Pick a precision ({HF_PRECISIONS.join(', ')}) — other quantizations aren't guaranteed to
        run well on this device. If the repo doesn't offer the one you picked, the download will
        fail with an error instead of silently substituting another.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {started && !error && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          Download started — track progress in the bottom-right panel.
        </div>
      )}
    </div>
  );
}

export function ImportModelPanel() {
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [modelName, setModelName] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const handlePick = async () => {
    const path = await window.geniex.import.pickPath();
    if (path) {
      setSourcePath(path);
      setStarted(false);
      if (!modelName) {
        const base = path.split(/[\\/]/).filter(Boolean).pop() ?? 'imported-model';
        setModelName(base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'));
      }
    }
  };

  const handleImport = async () => {
    if (!sourcePath || !modelName.trim()) return;
    setStarting(true);
    setError(null);
    try {
      await window.geniex.import.start({ sourcePath, modelName: modelName.trim() });
      setStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 520, padding: 24, gap: 18 }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>1. Choose a folder</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" onClick={handlePick}>
            Browse…
          </button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>
            {sourcePath ?? 'No folder selected'}
          </span>
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
          A directory containing GGUF file(s), or a QAIRT bundle directory with a{' '}
          <code>metadata.json</code>.
        </p>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>2. Name this model</div>
        <input
          className="search-input"
          style={{ width: '100%' }}
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="my-imported-model"
        />
      </div>

      {sourcePath && (
        <div
          className="error-banner"
          style={{
            background: 'rgba(245,158,11,0.08)',
            borderColor: 'rgba(245,158,11,0.3)',
            color: '#fbbf24',
          }}
        >
          GenieX copies these files into its own model cache — the original folder is safe to
          delete afterward, but this needs enough free disk space for a temporary duplicate.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {started && !error && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          Import started — track progress in the bottom-right panel.
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleImport}
        disabled={!sourcePath || !modelName.trim() || starting}
      >
        {starting ? 'Starting…' : 'Import Model'}
      </button>
    </div>
  );
}
