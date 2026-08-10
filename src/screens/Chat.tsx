import { useEffect, useRef, useState } from 'react';
import { GENIEX_OPENAI_BASE_URL, type ChatMessage } from '@shared/types';
import { useActiveModel } from '../hooks/useActiveModel';

export function Chat() {
  const { state: active } = useActiveModel();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ready = active.status === 'loaded' && !!active.modelName;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Clear thread when the loaded model changes.
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [active.modelName]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !ready || !active.modelName || sending) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft('');
    setSending(true);
    setError(null);

    try {
      // Main-process proxy — renderer fetch to :18181 hits CORS from Vite.
      const reply = await window.geniex.chat.completions(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-screen">
      <div className="page-header">
        <div>
          <h1>Chat</h1>
          <p>
            Quick chat with the loaded model
            {ready ? ` (${active.modelName})` : ''}.
          </p>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => {
            setMessages([]);
            setError(null);
          }}
          disabled={messages.length === 0 || sending}
        >
          Clear
        </button>
      </div>

      <div className="chat-anythingllm">
        Want docs, RAG, and a fuller chat UI? Point{' '}
        <a href="https://anythingllm.com" target="_blank" rel="noreferrer">
          AnythingLLM
        </a>{' '}
        at this OpenAI-compatible endpoint — Base URL{' '}
        <code>{GENIEX_OPENAI_BASE_URL}</code>
        {ready ? (
          <>
            , model <code>{active.modelName}</code>
          </>
        ) : null}
        . No API key needed.
      </div>

      {!ready ? (
        <div className="empty-state">Load a model in My Models first, then come back here to chat.</div>
      ) : (
        <>
          <div className="chat-log">
            {messages.length === 0 && (
              <div className="chat-placeholder">Say hello — replies run on-device through GenieX.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>
                <div className="chat-role">{m.role === 'user' ? 'You' : 'Model'}</div>
                <div className="chat-content">{m.content}</div>
              </div>
            ))}
            {sending && (
              <div className="chat-bubble assistant">
                <div className="chat-role">Model</div>
                <div className="chat-content chat-typing">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              className="chat-input"
              rows={2}
              placeholder="Message the model…"
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
