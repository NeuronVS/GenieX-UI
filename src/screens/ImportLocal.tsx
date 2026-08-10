import { useState } from 'react';

export function ImportLocal() {
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
    <div>
      <div className="page-header">
        <div>
          <h1>Import Local</h1>
          <p>
            Load a model already on disk — a GGUF file/folder or a Qualcomm AI Engine Direct bundle
            (e.g. one already downloaded from HuggingFace).
          </p>
        </div>
      </div>

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
          <div className="error-banner" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}>
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
    </div>
  );
}
