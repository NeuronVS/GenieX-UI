// File Organizer app (v1: index/tag only — nothing on disk is moved,
// renamed, or modified). Scans a user-picked folder, extracts text from
// pdf/docx/text files and asks the currently loaded model for a short
// summary + tags; images and everything else are cataloged by filename,
// size, and modified date only (no vision model in this stack yet).
//
// Runs directly against inferenceRuntime today (same process, same IPC
// bus as Chat/Code) — this is the in-repo prototype. See project notes on
// the Neuron app platform for the eventual spawned-process-over-HTTP model.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog, nativeImage, type BrowserWindow } from 'electron';
import type {
  FileOrganizerEntry,
  FileOrganizerKind,
  FileOrganizerRoot,
  FileOrganizerScanProgress,
} from '@shared/types';
import * as db from './store';
import { extractText } from './extract';
import * as inferenceRuntime from '../../services/inferenceRuntime';

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.heic', '.tiff']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.svn', '.hg']);

function classifyKind(ext: string): FileOrganizerKind {
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (TEXT_EXTS.has(ext)) return 'text';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'other';
}

interface ScanHandle {
  cancelled: boolean;
}
const activeScans = new Map<string, ScanHandle>();

async function walkFiles(rootPath: string, handle: ScanHandle): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [rootPath];
  while (stack.length) {
    if (handle.cancelled) break;
    const dir = stack.pop()!;
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // permission error or vanished dir — skip it, keep going
    }
    for (const d of dirents) {
      if (d.name.startsWith('.') || d.isSymbolicLink()) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(d.name)) stack.push(full);
      } else if (d.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Thumbnail via Electron's built-in nativeImage — no extra dependency, and
 * it never throws for an unsupported/corrupt file, just returns an empty
 * image (checked via isEmpty()). Resized to a fixed width only (not both
 * dimensions) so it isn't distorted — the renderer crops to a square with
 * object-fit: cover. JPEG re-encode keeps the persisted store small.
 */
function generateImageThumbnail(filePath: string): string | null {
  try {
    const img = nativeImage.createFromPath(filePath);
    if (img.isEmpty()) return null;
    const resized = img.resize({ width: 240 });
    if (resized.isEmpty()) return null;
    return `data:image/jpeg;base64,${resized.toJPEG(60).toString('base64')}`;
  } catch {
    return null;
  }
}

function parseSummaryReply(reply: string): { summary: string; tags: string[] } {
  const jsonMatch = reply.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as { summary?: unknown; tags?: unknown };
      const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 400) : reply.trim().slice(0, 400);
      const tags = Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
        : [];
      return { summary, tags };
    } catch {
      // fall through to raw-text fallback below
    }
  }
  return { summary: reply.trim().slice(0, 400), tags: [] };
}

async function summarize(fileName: string, text: string): Promise<{ summary: string; tags: string[] }> {
  const reply = await inferenceRuntime.chatCompletions([
    {
      role: 'system',
      content:
        'You catalog local files for a folder index. Given a filename and its extracted text, respond with ONLY a compact JSON object of the form {"summary": "one sentence, under 200 characters", "tags": ["tag1", "tag2"]} — 2 to 5 short lowercase tags, no markdown fences, no extra text.',
    },
    { role: 'user', content: `Filename: ${fileName}\n\nContent:\n${text}` },
  ]);
  return parseSummaryReply(reply);
}

async function indexOneFile(
  filePath: string,
  rootId: string,
  canSummarize: boolean,
): Promise<FileOrganizerEntry> {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const kind = classifyKind(ext);

  let sizeBytes = 0;
  let modifiedAt = new Date().toISOString();
  try {
    const stat = await fs.stat(filePath);
    sizeBytes = stat.size;
    modifiedAt = stat.mtime.toISOString();
  } catch {
    // file vanished mid-scan — still record what we can below
  }

  const base: FileOrganizerEntry = {
    path: filePath,
    rootId,
    name,
    ext,
    kind,
    sizeBytes,
    modifiedAt,
    summary: null,
    tags: [],
    error: null,
    thumbnail: null,
  };

  if (kind === 'image') return { ...base, thumbnail: generateImageThumbnail(filePath) };
  if (kind === 'other') return base;
  if (!canSummarize) return { ...base, error: 'No model loaded' };

  try {
    const text = await extractText(filePath, kind);
    if (!text.trim()) return { ...base, error: 'No extractable text' };
    const { summary, tags } = await summarize(name, text);
    return { ...base, summary, tags };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, error: message };
  }
}

export async function pickFolder(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select a folder to index',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

export function addRoot(folderPath: string): FileOrganizerRoot[] {
  const root: FileOrganizerRoot = {
    id: randomUUID(),
    path: folderPath,
    addedAt: new Date().toISOString(),
    lastScanAt: null,
  };
  return db.addRoot(root);
}

export function listRoots(): FileOrganizerRoot[] {
  return db.listRoots();
}

export function removeRoot(id: string): { roots: FileOrganizerRoot[]; entries: FileOrganizerEntry[] } {
  cancelScan(id);
  return db.removeRoot(id);
}

export function listEntries(rootId?: string | null): FileOrganizerEntry[] {
  return db.listEntries(rootId);
}

/** Raw bytes for renderer-side preview rendering (e.g. pdfjs). No text/size limit applied here. */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

/** Persist a thumbnail the renderer generated (e.g. a rendered PDF first page). */
export function setThumbnail(filePath: string, dataUrl: string): boolean {
  return db.setEntryThumbnail(filePath, dataUrl);
}

export function cancelScan(rootId: string): void {
  const handle = activeScans.get(rootId);
  if (handle) handle.cancelled = true;
}

export async function scanRoot(
  rootId: string,
  onProgress: (progress: FileOrganizerScanProgress) => void,
): Promise<void> {
  const root = db.getRoot(rootId);
  if (!root) throw new Error('Unknown folder — it may have been removed.');
  if (activeScans.has(rootId)) throw new Error('This folder is already being scanned.');

  const handle: ScanHandle = { cancelled: false };
  activeScans.set(rootId, handle);

  const emit = (partial: Partial<FileOrganizerScanProgress>) =>
    onProgress({
      rootId,
      status: 'scanning',
      scanned: 0,
      total: 0,
      currentFile: null,
      message: null,
      ...partial,
    });

  try {
    emit({ message: 'Scanning folder…' });
    const files = await walkFiles(root.path, handle);
    const total = files.length;
    const seen = new Set<string>();
    let scanned = 0;

    // Check once up front so a missing model is one clear message, not one
    // error per file — every non-image file would otherwise fail the same way.
    const canSummarize = inferenceRuntime.getActiveModelState().status === 'loaded';

    for (const filePath of files) {
      if (handle.cancelled) break;
      scanned++;
      seen.add(filePath);
      emit({ scanned, total, currentFile: filePath });
      const entry = await indexOneFile(filePath, rootId, canSummarize);
      db.upsertEntry(entry);
    }

    if (handle.cancelled) {
      emit({ status: 'cancelled', scanned, total, currentFile: null, message: 'Scan cancelled' });
      return;
    }

    db.pruneMissingEntries(rootId, seen);
    db.setRootLastScanAt(rootId, new Date().toISOString());
    emit({
      status: 'completed',
      scanned,
      total,
      currentFile: null,
      message: canSummarize ? null : 'No model loaded — files were cataloged without summaries.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ status: 'error', message });
    throw err;
  } finally {
    activeScans.delete(rootId);
  }
}
