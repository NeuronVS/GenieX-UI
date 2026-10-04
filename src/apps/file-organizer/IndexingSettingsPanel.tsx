import { useState } from 'react';
import { useFileOrganizer } from './useFileOrganizer';

/**
 * File Organizer's own settings — folder add/scan/remove. Lives inside the
 * app (Sidebar → Settings section), not the global Settings screen, so it
 * stays in context while browsing files instead of jumping to unrelated
 * app-wide settings (HF token, CLI info, etc.).
 */
export function IndexingSettingsPanel() {
  const { roots, entries, progress, addFolder, removeFolder, scanFolder, cancelFolderScan } =
    useFileOrganizer();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAdd = async () => {
    setBusyId('add');
    try {
      await addFolder();
    } finally {
      setBusyId(null);
    }
  };

  const handleScan = async (id: string) => {
    setBusyId(id);
    try {
      await scanFolder(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card" style={{ maxWidth: 560, padding: 20, gap: 14 }}>
      <div style={{ fontWeight: 600 }}>Indexed folders</div>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>
        Documents get an LLM summary + tags; images and other files are cataloged by name and date
        only.
      </p>

      {roots.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No folders added yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roots.map((root) => {
            const p = progress[root.id];
            const scanning = p?.status === 'scanning';
            const count = entries.filter((e) => e.rootId === root.id).length;
            return (
              <div
                key={root.id}
                style={{ border: '1px solid var(--card-border)', borderRadius: 'var(--radius-sm)', padding: 12 }}
              >
                <div style={{ fontSize: 13, wordBreak: 'break-all' }}>{root.path}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {count} file{count === 1 ? '' : 's'} indexed
                  {root.lastScanAt ? ` · last scanned ${new Date(root.lastScanAt).toLocaleString()}` : ' · never scanned'}
                </div>

                {scanning && (
                  <div style={{ marginTop: 8 }}>
                    <div className="progress-track">
                      <div
                        className={`progress-fill${p.total === 0 ? ' indeterminate' : ''}`}
                        style={p.total > 0 ? { width: `${Math.round((p.scanned / p.total) * 100)}%` } : undefined}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {p.total > 0 ? `${p.scanned}/${p.total} — ` : ''}
                      {p.currentFile ? p.currentFile.split(/[\\/]/).pop() : p.message}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {scanning ? (
                    <button className="btn btn-sm" onClick={() => cancelFolderScan(root.id)}>
                      Cancel
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleScan(root.id)}
                      disabled={busyId === root.id}
                    >
                      {root.lastScanAt ? 'Rescan' : 'Scan'}
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Stop indexing "${root.path}"? This removes its ${count} indexed file${count === 1 ? '' : 's'} from the index (the files themselves are untouched).`,
                        )
                      ) {
                        removeFolder(root.id);
                      }
                    }}
                    disabled={scanning}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <button className="btn" onClick={handleAdd} disabled={busyId === 'add'}>
          {busyId === 'add' ? 'Choosing…' : '+ Add folder'}
        </button>
      </div>
    </section>
  );
}
