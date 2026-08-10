import { useEffect, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useCliSetup } from '../hooks/useCliSetup';
import { useOpenCode } from '../hooks/useOpenCode';
import { DiskSpaceIndicator } from '../components/DiskSpaceIndicator';

export function Settings() {
  const { settings, diskSpace, pickAndSetDataDir, pickAndSetProjectDir, setHfToken } = useSettings();
  const { state: cli } = useCliSetup();
  const { state: oc, busy: ocBusy, install: installOpenCode, refreshInstall } = useOpenCode();
  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);

  useEffect(() => {
    if (settings) setTokenDraft(settings.hfToken);
  }, [settings]);

  const handleSaveToken = async () => {
    await setHfToken(tokenDraft);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Storage location, HuggingFace access, and CLI info.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 560 }}>
        <section className="card" style={{ padding: 20, gap: 14 }}>
          <div style={{ fontWeight: 600 }}>Model storage location</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={pickAndSetDataDir}>
              Choose folder…
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>
              {settings?.dataDir ?? 'Loading…'}
            </span>
          </div>
          <DiskSpaceIndicator info={diskSpace} />
        </section>

        <section className="card" style={{ padding: 20, gap: 14 }}>
          <div style={{ fontWeight: 600 }}>OpenCode project folder</div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>
            Workspace the OpenCode agent can read and edit when you use the Code screen.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={pickAndSetProjectDir}>
              Choose folder…
            </button>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>
              {settings?.projectDir || 'Not set'}
            </span>
          </div>
        </section>

        <section className="card" style={{ padding: 20, gap: 14 }}>
          <div style={{ fontWeight: 600 }}>HuggingFace access token</div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>
            Needed for gated models. Create a Read-scope token at huggingface.co/settings/tokens.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              className="search-input"
              style={{ flex: 1 }}
              type="password"
              placeholder="hf_…"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveToken}>
              {tokenSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </section>

        <section className="card" style={{ padding: 20, gap: 8 }}>
          <div style={{ fontWeight: 600 }}>GenieX CLI</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {cli.installed ? `Installed — version ${cli.version ?? 'unknown'}` : 'Not installed'}
          </div>
        </section>

        <section className="card" style={{ padding: 20, gap: 12 }}>
          <div style={{ fontWeight: 600 }}>OpenCode CLI</div>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: 0 }}>
            Coding agent web UI used by the Code screen. Installs globally via npm (
            <code>opencode-ai</code>).
          </p>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {oc.installing
              ? oc.progressMessage || 'Installing…'
              : oc.installed
                ? `Installed — ${oc.version ?? 'version unknown'}`
                : 'Not installed'}
          </div>
          {oc.error && <div className="error-banner">{oc.error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary"
              onClick={installOpenCode}
              disabled={ocBusy || oc.installing}
            >
              {oc.installing || ocBusy
                ? 'Installing…'
                : oc.installed
                  ? 'Reinstall / Update'
                  : 'Install OpenCode'}
            </button>
            <button className="btn" onClick={refreshInstall} disabled={ocBusy || oc.installing}>
              Refresh
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
