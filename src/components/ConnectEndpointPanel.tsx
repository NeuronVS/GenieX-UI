import { useState } from 'react';
import { GENIEX_OPENAI_BASE_URL } from '@shared/types';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function curlExample(modelName: string): string {
  return `curl ${GENIEX_OPENAI_BASE_URL}/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelName}","messages":[{"role":"user","content":"Hello"}]}'`;
}

export function ConnectEndpointPanel({ modelName }: { modelName: string }) {
  const example = curlExample(modelName);

  return (
    <div className="connect-panel">
      <div className="connect-panel-title">Connect an OpenAI-compatible client</div>
      <p className="connect-panel-hint">
        Point any OpenAI SDK or tool at this local GenieX server. No API key required.
      </p>
      <div className="connect-fields">
        <div className="connect-field">
          <span className="connect-label">Base URL</span>
          <code className="connect-value">{GENIEX_OPENAI_BASE_URL}</code>
          <CopyButton value={GENIEX_OPENAI_BASE_URL} />
        </div>
        <div className="connect-field">
          <span className="connect-label">Model</span>
          <code className="connect-value">{modelName}</code>
          <CopyButton value={modelName} />
        </div>
        <div className="connect-field">
          <span className="connect-label">Chat</span>
          <code className="connect-value">{GENIEX_OPENAI_BASE_URL}/chat/completions</code>
          <CopyButton value={`${GENIEX_OPENAI_BASE_URL}/chat/completions`} />
        </div>
      </div>
      <div className="connect-example">
        <div className="connect-example-bar">
          <span className="connect-label">Example</span>
          <CopyButton value={example} />
        </div>
        <pre className="connect-example-code">{example}</pre>
      </div>
    </div>
  );
}
