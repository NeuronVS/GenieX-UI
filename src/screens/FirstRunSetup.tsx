import { useState } from 'react';
import { useCliSetup } from '../hooks/useCliSetup';

export function FirstRunSetup({ onReady }: { onReady: () => void }) {
  const { state, install } = useCliSetup();
  const [triedInstall, setTriedInstall] = useState(false);

  const handleInstall = async () => {
    setTriedInstall(true);
    const final = await install();
    if (final.installed) onReady();
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 40 }}>⚡</div>
      <h1 style={{ margin: 0 }}>GenieX Model Manager</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>
        This app needs the GenieX CLI to browse, download, and run models on your Snapdragon
        device's Hexagon NPU.
      </p>

      {!state.installing && !state.installed && (
        <button className="btn btn-primary" onClick={handleInstall} style={{ padding: '10px 24px' }}>
          Install GenieX CLI
        </button>
      )}

      {state.installing && (
        <div style={{ minWidth: 280 }}>
          <div className="progress-track">
            <div className="progress-fill indeterminate" />
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>
            {state.progressMessage ?? 'Installing…'}
          </p>
        </div>
      )}

      {state.error && (
        <div className="error-banner" style={{ maxWidth: 420 }}>
          {state.error}
        </div>
      )}

      {triedInstall && state.error && (
        <button className="btn" onClick={handleInstall}>
          Retry
        </button>
      )}
    </div>
  );
}
