import type { PullProgress } from '@shared/types';
import { formatBytes } from '../lib/format';

// Despite the name (kept for parity with the plan), this renders as a
// non-blocking floating panel in the corner rather than a modal dialog —
// downloads can run for minutes and shouldn't trap the user on one screen.
export function DownloadProgressModal({
  pulls,
  onCancel,
  onDismiss,
}: {
  pulls: Record<string, PullProgress>;
  onCancel: (requestId: string) => void;
  onDismiss: (requestId: string) => void;
}) {
  const entries = Object.values(pulls);
  if (entries.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 100,
      }}
    >
      {entries.map((p) => (
        <div
          key={p.requestId}
          className="card"
          style={{ padding: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="card-title" style={{ fontSize: 13 }}>
              {p.modelName}
              {p.precision ? `:${p.precision}` : ''}
            </span>
            {(p.status === 'completed' || p.status === 'cancelled' || p.status === 'error') && (
              <button className="btn btn-sm" onClick={() => onDismiss(p.requestId)}>
                ✕
              </button>
            )}
          </div>

          {(p.status === 'starting' || p.status === 'downloading') && (
            <>
              <div className="progress-track">
                <div
                  className={`progress-fill${p.percent == null ? ' indeterminate' : ''}`}
                  style={p.percent != null ? { width: `${p.percent}%` } : undefined}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>
                  {p.downloadedBytes != null && p.totalBytes != null
                    ? `${formatBytes(p.downloadedBytes)} / ${formatBytes(p.totalBytes)}`
                    : p.message ?? 'Working…'}
                </span>
                <span>{p.speedLabel ?? ''}</span>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => onCancel(p.requestId)}>
                Cancel
              </button>
            </>
          )}

          {p.status === 'completed' && (
            <span style={{ fontSize: 12, color: 'var(--success)' }}>✔ Download complete</span>
          )}
          {p.status === 'cancelled' && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Cancelled</span>
          )}
          {p.status === 'error' && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--danger)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                display: 'block',
                marginTop: 4,
              }}
            >
              {p.message ?? 'Download failed'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
