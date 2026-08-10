import { useEffect, useRef } from 'react';
import { useActiveModel } from '../hooks/useActiveModel';
import { useOpenCode } from '../hooks/useOpenCode';
import { useSettings } from '../hooks/useSettings';

export function Code() {
  const { state: model } = useActiveModel();
  const { state: oc, busy, start, stop, install, refreshInstall } = useOpenCode();
  const { settings, refresh } = useSettings();
  const hostRef = useRef<HTMLDivElement>(null);

  const modelReady = model.status === 'loaded' && !!model.modelName;
  const projectDir = settings?.projectDir || oc.projectDir;

  const pickProject = async () => {
    const dir = await window.geniex.settings.pickProjectDir();
    if (!dir) return;
    await window.geniex.settings.setProjectDir(dir);
    await refresh();
    await refreshInstall();
  };

  // Embed OpenCode inside the app (BrowserView), not the system browser.
  useEffect(() => {
    if (!oc.running || !oc.url || !hostRef.current) {
      void window.geniex.opencode.hideView();
      return;
    }

    const sync = () => {
      const el = hostRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      void window.geniex.opencode.showView({
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(hostRef.current);
    window.addEventListener('resize', sync);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      void window.geniex.opencode.hideView();
    };
  }, [oc.running, oc.url]);

  return (
    <div className="code-screen">
      <div className="code-toolbar">
        <div className="code-toolbar-title">Code</div>
        <div className="code-toolbar-meta" title={modelReady ? model.modelName! : undefined}>
          <span className="code-meta-label">Model</span>
          <span className="code-meta-value">{modelReady ? model.modelName : 'none'}</span>
        </div>
        <div className="code-toolbar-meta code-toolbar-project" title={projectDir || undefined}>
          <span className="code-meta-label">Project</span>
          <span className="code-meta-value">{projectDir || 'not set'}</span>
          <button className="btn btn-sm" onClick={pickProject}>
            …
          </button>
        </div>
        <div className="code-toolbar-meta">
          <span className="code-meta-label">OpenCode</span>
          <span className="code-meta-value">
            {!oc.installed
              ? 'missing'
              : oc.running
                ? `on${oc.version ? ` · ${oc.version}` : ''}`
                : `off${oc.version ? ` · ${oc.version}` : ''}`}
          </span>
        </div>
        <div className="code-toolbar-actions">
          {!oc.running ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={start}
              disabled={busy || !modelReady || !oc.installed}
            >
              {busy ? 'Starting…' : 'Start'}
            </button>
          ) : (
            <>
              <button
                className="btn btn-sm"
                onClick={() => void window.geniex.opencode.openWindow()}
                disabled={busy}
                title="Open OpenCode in a separate window"
              >
                Pop out
              </button>
              <button className="btn btn-sm" onClick={stop} disabled={busy}>
                {busy ? '…' : 'Stop'}
              </button>
            </>
          )}
          <button className="btn btn-sm" onClick={refreshInstall} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      {oc.error && <div className="error-banner">{oc.error}</div>}

      {!oc.installed && (
        <div className="code-install-hint">
          <span>OpenCode CLI required.</span>
          <button className="btn btn-primary btn-sm" onClick={install} disabled={busy || oc.installing}>
            {oc.installing ? oc.progressMessage || 'Installing…' : 'Install'}
          </button>
        </div>
      )}

      {oc.running && oc.url ? (
        <div ref={hostRef} className="code-frame" aria-label="OpenCode" />
      ) : (
        <div className="code-empty">
          {modelReady
            ? 'Start OpenCode to open the coding agent against your local GenieX endpoint.'
            : 'Load a model first, pick a project folder, then start OpenCode.'}
        </div>
      )}
    </div>
  );
}
