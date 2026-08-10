import type { ActiveModelState } from '@shared/types';

const STATUS_LABEL: Record<ActiveModelState['status'], string> = {
  idle: 'No model loaded',
  starting: 'Loading…',
  loaded: 'Loaded',
  stopping: 'Unloading…',
  error: 'Failed to load',
};

export function ActiveModelHeader({
  state,
  onUnload,
}: {
  state: ActiveModelState;
  onUnload: () => void;
}) {
  const busy = state.status === 'starting' || state.status === 'stopping';

  return (
    <div className="active-model-header">
      <div className="active-model-row">
        <div className="active-model-info">
          <span className={`status-dot ${state.status}`} />
          {state.modelName ? (
            <span className="active-model-name">{state.modelName}</span>
          ) : (
            <span className="active-model-name" style={{ color: 'var(--text-tertiary)' }}>
              No model loaded
            </span>
          )}
          <span className="active-model-status">
            {state.status === 'error' && state.error ? state.error : STATUS_LABEL[state.status]}
          </span>
        </div>
        {state.modelName && state.status !== 'idle' && (
          <button className="btn btn-sm" onClick={onUnload} disabled={busy}>
            {state.status === 'stopping' ? 'Unloading…' : 'Unload'}
          </button>
        )}
      </div>
    </div>
  );
}
