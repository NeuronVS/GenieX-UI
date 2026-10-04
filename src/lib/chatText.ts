/**
 * Split Qwen/R1-style <think>…</think> (and similar) from the visible answer.
 * Thinking is shown in a compact gray box; answer is the normal reply.
 */

const TAG = 'think|thinking|reasoning|reason|redacted_reasoning';
const OPEN_RE = new RegExp(`<(?:${TAG})\\b[^>]*>`, 'i');
const CLOSE_RE = new RegExp(`</(?:${TAG})>`, 'gi');
const BLOCK_RE = new RegExp(
  `<(?:${TAG})\\b[^>]*>([\\s\\S]*?)</(?:${TAG})>`,
  'gi',
);

export type SplitReasoning = {
  thinking: string;
  answer: string;
  /** True once a closing think tag has been seen (answer may still be streaming). */
  thinkingDone: boolean;
};

export function splitReasoning(text: string): SplitReasoning {
  const thinkingParts: string[] = [];
  BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    const inner = m[1]?.trim();
    if (inner) thinkingParts.push(inner);
  }

  CLOSE_RE.lastIndex = 0;
  let lastClose = -1;
  let cm: RegExpExecArray | null;
  while ((cm = CLOSE_RE.exec(text)) !== null) {
    lastClose = cm.index + cm[0].length;
  }

  if (lastClose >= 0) {
    return {
      thinking: thinkingParts.join('\n\n'),
      answer: text.slice(lastClose).replace(/^\s+/, ''),
      thinkingDone: true,
    };
  }

  // Still inside an open think block (or tags never used).
  const open = text.match(OPEN_RE);
  if (open && open.index != null) {
    const afterOpen = text.slice(open.index + open[0].length);
    return {
      thinking: afterOpen,
      answer: text.slice(0, open.index).trim(),
      thinkingDone: false,
    };
  }

  // No think tags — whole string is the answer.
  return { thinking: '', answer: text, thinkingDone: true };
}

/**
 * When the model only writes inside <think> and never emits a separate answer,
 * use the thinking text as the user-facing reply so the bubble isn't empty.
 */
export function finalizeAssistantSplit(split: SplitReasoning): {
  thinking: string;
  answer: string;
} {
  const thinking = split.thinking.trim();
  let answer = split.answer.trim();
  if (!answer && thinking) {
    answer = thinking;
  }
  return { thinking, answer };
}

/** Strip think markup only (legacy helper). Prefer splitReasoning for Chat UI. */
export function stripReasoningTags(text: string): string {
  return splitReasoning(text).answer || text.replace(new RegExp(`</?(?:${TAG})\\b[^>]*>`, 'gi'), '');
}
