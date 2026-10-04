import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GENIEX_OPENAI_BASE_URL,
  type ChatCompletionStats,
  type ChatMessage,
  type ChatThread,
  type ChatThreadSummary,
} from '@shared/types';
import { useActiveModel } from '../hooks/useActiveModel';
import { finalizeAssistantSplit, splitReasoning } from '../lib/chatText';

const CHAT_SYSTEM = {
  role: 'system' as const,
  content:
    'After any private reasoning in <think>...</think>, you MUST write a clear final answer for the user AFTER the closing </think> tag. Never end with only thinking — always include a user-facing reply outside the tags.',
};

type UiMessage = ChatMessage & { thinking?: string };

function formatStats(stats: ChatCompletionStats): string {
  const parts: string[] = [];
  if (stats.tokensPerSecond != null) {
    parts.push(`${stats.tokensPerSecond.toFixed(1)} tok/s`);
  }
  if (stats.completionTokens != null) {
    parts.push(`${stats.completionTokens} tokens`);
  }
  if (stats.promptTokens != null) {
    parts.push(`${stats.promptTokens} prompt`);
  }
  const sec = (stats.elapsedMs / 1000).toFixed(1);
  parts.push(`${sec}s`);
  return parts.join(' · ');
}

function ThinkingBox({
  text,
  active,
}: {
  text: string;
  active?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!text.trim() && !active) return null;

  return (
    <div className={`chat-thinking${active ? ' active' : ''}`}>
      <div className="chat-thinking-label">{active ? 'Thinking…' : 'Thought'}</div>
      <div className="chat-thinking-scroll" ref={scrollerRef}>
        {text.trim() || (active ? '…' : '')}
        {active ? <span className="chat-caret" /> : null}
      </div>
    </div>
  );
}

function titleFromMessages(messages: UiMessage[]): string {
  const first = messages.find((m) => m.role === 'user')?.content.replace(/\s+/g, ' ').trim();
  return first ? first.slice(0, 48) : 'New chat';
}

export function Chat() {
  const { state: active } = useActiveModel();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [streamThinking, setStreamThinking] = useState('');
  const [streamAnswer, setStreamAnswer] = useState('');
  const [thinkingDone, setThinkingDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastStats, setLastStats] = useState<ChatCompletionStats | null>(null);
  const [booted, setBooted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = active.status === 'loaded' && !!active.modelName;

  const refreshList = useCallback(async () => {
    setThreads(await window.geniex.chat.history.list());
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const thread = await window.geniex.chat.history.get(id);
    if (!thread) return;
    await window.geniex.chat.history.setActiveId(id);
    setActiveId(id);
    setMessages(thread.messages.filter((m) => m.role !== 'system') as UiMessage[]);
    setError(null);
    setStreamThinking('');
    setStreamAnswer('');
    setThinkingDone(false);
    setLastStats(null);
    setDraft('');
  }, []);

  const persistMessages = useCallback(
    (id: string, msgs: UiMessage[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        const thread: ChatThread = {
          id,
          title: titleFromMessages(msgs),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: msgs,
          modelName: active.modelName,
        };
        void window.geniex.chat.history.save(thread).then(() => refreshList());
      }, 250);
    },
    [active.modelName, refreshList],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await window.geniex.chat.history.list();
      let id = await window.geniex.chat.history.getActiveId();
      if (!id || !list.some((t) => t.id === id)) {
        const created = await window.geniex.chat.history.create();
        id = created.id;
      }
      if (cancelled) return;
      setThreads(await window.geniex.chat.history.list());
      await loadThread(id);
      setBooted(true);
    })();
    return () => {
      cancelled = true;
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, streamThinking, streamAnswer]);

  // Persist whenever messages change for the active thread
  useEffect(() => {
    if (!booted || !activeId || sending) return;
    persistMessages(activeId, messages);
  }, [messages, activeId, booted, sending, persistMessages]);

  const newChat = async () => {
    if (sending) return;
    const created = await window.geniex.chat.history.create();
    await refreshList();
    await loadThread(created.id);
  };

  const selectChat = async (id: string) => {
    if (sending || id === activeId) return;
    if (activeId) {
      await window.geniex.chat.history.save({
        id: activeId,
        title: titleFromMessages(messages),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages,
        modelName: active.modelName,
      });
    }
    await loadThread(id);
    await refreshList();
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sending) return;
    const title = threads.find((t) => t.id === id)?.title || 'this chat';
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const { activeId: nextId, threads: nextThreads } = await window.geniex.chat.history.delete(id);
    setThreads(nextThreads);
    if (id === activeId) {
      if (nextId) await loadThread(nextId);
      else {
        const created = await window.geniex.chat.history.create();
        await refreshList();
        await loadThread(created.id);
      }
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !ready || !active.modelName || sending || !activeId) return;

    const nextUi: UiMessage[] = [...messages, { role: 'user', content: text }];
    const apiMessages: ChatMessage[] = [
      CHAT_SYSTEM,
      ...nextUi.map(({ role, content }) => ({ role, content })),
    ];
    setMessages(nextUi);
    setDraft('');
    setSending(true);
    setStreamThinking('');
    setStreamAnswer('');
    setThinkingDone(false);
    setError(null);

    try {
      let raw = '';
      const { content, stats } = await window.geniex.chat.completionsStream(apiMessages, (chunk) => {
        raw += chunk;
        const split = splitReasoning(raw);
        setStreamThinking(split.thinking);
        setStreamAnswer(split.answer);
        setThinkingDone(split.thinkingDone);
      });
      const rawSplit = splitReasoning(content);
      const hadSeparateAnswer = !!rawSplit.answer.trim();
      const { thinking, answer } = finalizeAssistantSplit(rawSplit);
      const withAssistant: UiMessage[] = [
        ...nextUi,
        {
          role: 'assistant',
          content: answer || '(empty reply)',
          thinking: hadSeparateAnswer && thinking ? thinking : undefined,
        },
      ];
      setMessages(withAssistant);
      // Save immediately after turn (don't wait for debounce / sending gate)
      await window.geniex.chat.history.save({
        id: activeId,
        title: titleFromMessages(withAssistant),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: withAssistant,
        modelName: active.modelName,
      });
      await refreshList();
      setStreamThinking('');
      setStreamAnswer('');
      setThinkingDone(false);
      setLastStats(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStreamThinking('');
      setStreamAnswer('');
      setThinkingDone(false);
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
        <div className="chat-layout">
          <aside className="chat-history">
            <button className="btn btn-primary btn-sm chat-history-new" onClick={() => void newChat()} disabled={sending}>
              + New chat
            </button>
            <div className="chat-history-list">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`chat-history-item${t.id === activeId ? ' active' : ''}`}
                  onClick={() => void selectChat(t.id)}
                  disabled={sending}
                >
                  <span className="chat-history-title">{t.title}</span>
                  {t.preview ? <span className="chat-history-preview">{t.preview}</span> : null}
                  <span
                    className="chat-history-delete"
                    role="button"
                    tabIndex={0}
                    title="Delete chat"
                    onClick={(e) => void deleteChat(t.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void deleteChat(t.id, e as unknown as React.MouseEvent);
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
              {threads.length === 0 && (
                <div className="chat-history-empty">No chats yet</div>
              )}
            </div>
          </aside>

          <div className="chat-main">
            <div className="chat-log">
              {messages.length === 0 && !sending && (
                <div className="chat-placeholder">Say hello — replies stream on-device through GenieX.</div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role}`}>
                  <div className="chat-role">{m.role === 'user' ? 'You' : 'Model'}</div>
                  {m.role === 'assistant' && m.thinking ? (
                    <ThinkingBox text={m.thinking} />
                  ) : null}
                  {m.content ? <div className="chat-content">{m.content}</div> : null}
                </div>
              ))}
              {sending && (
                <div className="chat-bubble assistant">
                  <div className="chat-role">Model</div>
                  {(streamThinking || !thinkingDone) && (
                    <ThinkingBox text={streamThinking} active={!thinkingDone || !streamAnswer} />
                  )}
                  {streamAnswer.trim() ? (
                    <div className="chat-content">
                      {streamAnswer}
                      <span className="chat-caret" />
                    </div>
                  ) : thinkingDone ? (
                    <div className="chat-content chat-typing">Writing reply…</div>
                  ) : null}
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
                {sending ? 'Streaming…' : 'Send'}
              </button>
            </form>

            <div className="chat-stats">
              {sending ? (
                <span>{thinkingDone ? 'Generating reply…' : 'Thinking…'}</span>
              ) : lastStats ? (
                <span title={lastStats.estimated ? 'Token count estimated from reply length' : undefined}>
                  Last reply · {formatStats(lastStats)}
                  {lastStats.estimated ? ' (est.)' : ''}
                </span>
              ) : (
                <span>Reply speed and token stats show here after the first response</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
