import type { DiskSpaceInfo } from '@shared/types';
import { formatBytes } from '../lib/format';

export function DiskSpaceIndicator({ info }: { info: DiskSpaceInfo | null }) {
  if (!info) return null;
  const usedBytes = info.totalBytes - info.freeBytes;
  const usedPct = info.totalBytes > 0 ? Math.min(100, Math.round((usedBytes / info.totalBytes) * 100)) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatBytes(info.freeBytes)} free of {formatBytes(info.totalBytes)}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>{info.diskPath}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}
