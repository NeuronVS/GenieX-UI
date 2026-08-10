import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { formatBytes } from '../lib/format';
import { UsageChart } from './UsageChart';

export function SystemMetricsPanel() {
  const snap = useSystemMetrics();
  if (!snap) return null;

  const npuLabel = snap.npu.available
    ? `${(snap.npu.percent ?? 0).toFixed(0)}%`
    : 'N/A';
  const ramLabel = `${formatBytes(snap.ram.usedBytes)} / ${formatBytes(snap.ram.totalBytes)}`;

  return (
    <div className="metrics-panel">
      <div className="metrics-card">
        <div className="metrics-card-head">
          <div>
            <div className="metrics-title">NPU</div>
            <div className="metrics-subtitle" title={snap.npu.name ?? undefined}>
              {snap.npu.available
                ? snap.npu.name?.replace(/^Snapdragon\(R\)\s*/i, '') ?? 'Hexagon NPU'
                : 'No NPU detected'}
            </div>
          </div>
          <div className="metrics-value npu">{npuLabel}</div>
        </div>
        <UsageChart
          values={snap.npu.available ? snap.npu.history : [0]}
          color="var(--npu-line)"
          fill="var(--npu-fill)"
        />
      </div>

      <div className="metrics-card">
        <div className="metrics-card-head">
          <div>
            <div className="metrics-title">Memory</div>
            <div className="metrics-subtitle">{ramLabel}</div>
          </div>
          <div className="metrics-value ram">{snap.ram.percent.toFixed(0)}%</div>
        </div>
        <UsageChart
          values={snap.ram.history}
          color="var(--ram-line)"
          fill="var(--ram-fill)"
        />
      </div>
    </div>
  );
}
