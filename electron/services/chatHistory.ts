import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import type { ChatThread, ChatThreadSummary } from '@shared/types';

interface StoreShape {
  threads: ChatThread[];
  activeId: string | null;
}

const store = new Store<StoreShape>({
  name: 'neuron-chat-history',
  defaults: { threads: [], activeId: null },
});

function sortNewest(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function toSummary(t: ChatThread): ChatThreadSummary {
  const lastUser = [...t.messages].reverse().find((m) => m.role === 'user');
  const lastAny = t.messages[t.messages.length - 1];
  const preview = (lastUser?.content || lastAny?.content || '').replace(/\s+/g, ' ').trim();
  return {
    id: t.id,
    title: t.title || 'New chat',
    updatedAt: t.updatedAt,
    preview: preview.slice(0, 80),
  };
}

export function listThreads(): ChatThreadSummary[] {
  return sortNewest(store.get('threads')).map(toSummary);
}

export function getThread(id: string): ChatThread | null {
  return store.get('threads').find((t) => t.id === id) ?? null;
}

export function getActiveId(): string | null {
  return store.get('activeId');
}

export function setActiveId(id: string | null): void {
  store.set('activeId', id);
}

export function createThread(): ChatThread {
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: randomUUID(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    modelName: null,
  };
  const threads = store.get('threads');
  threads.unshift(thread);
  store.set('threads', threads);
  store.set('activeId', thread.id);
  return thread;
}

export function saveThread(thread: ChatThread): ChatThread {
  const threads = store.get('threads');
  const idx = threads.findIndex((t) => t.id === thread.id);
  const firstUser = thread.messages.find((m) => m.role === 'user');
  const title =
    firstUser?.content.replace(/\s+/g, ' ').trim().slice(0, 48) ||
    thread.title ||
    'New chat';
  const saved: ChatThread = {
    ...thread,
    title,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) threads[idx] = saved;
  else threads.unshift(saved);
  store.set('threads', threads);
  store.set('activeId', saved.id);
  return saved;
}

export function deleteThread(id: string): { activeId: string | null; threads: ChatThreadSummary[] } {
  const next = store.get('threads').filter((t) => t.id !== id);
  store.set('threads', next);
  let activeId = store.get('activeId');
  if (activeId === id) {
    activeId = next[0]?.id ?? null;
    store.set('activeId', activeId);
  }
  return { activeId, threads: sortNewest(next).map(toSummary) };
}

/** Ensure there is always at least one active thread. */
export function ensureActiveThread(): ChatThread {
  const activeId = store.get('activeId');
  if (activeId) {
    const existing = getThread(activeId);
    if (existing) return existing;
  }
  const threads = sortNewest(store.get('threads'));
  if (threads[0]) {
    store.set('activeId', threads[0].id);
    return threads[0];
  }
  return createThread();
}
