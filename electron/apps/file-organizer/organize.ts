// "Organize" — ask the loaded local model to sort a folder's loose files into
// well-named subfolders, then apply the plan with the same guarded fs helpers
// the Explorer uses. Only ever touches direct file children of the target
// directory; never recurses, never moves folders, never deletes.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { OrganizeMove, OrganizePlan, ExplorerOpResult } from '@shared/types';
import * as inferenceRuntime from '../../services/inferenceRuntime';
import * as db from './store';

const MAX_FILES = 200;

function kb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function illegalFolder(name: string): boolean {
  if (!name || name === '.' || name === '..') return true;
  if (/[<>:"|?*/\\]/.test(name)) return true;
  for (let i = 0; i < name.length; i++) if (name.charCodeAt(i) < 32) return true;
  return false;
}

async function directFiles(dir: string): Promise<string[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  return dirents.filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name);
}

/** Pull the first balanced {...} object out of a reply that may be fenced or chatty. */
function extractJson(reply: string): unknown {
  const start = reply.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < reply.length; i++) {
    const c = reply[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(reply.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parsePlan(reply: string, validFiles: Set<string>): OrganizePlan {
  const obj = extractJson(reply) as { moves?: unknown; rationale?: unknown } | null;
  if (!obj) return { moves: [], rationale: '' };

  const rawMoves = Array.isArray(obj.moves) ? obj.moves : [];
  const moves: OrganizeMove[] = [];
  const seen = new Set<string>();
  for (const m of rawMoves) {
    if (!m || typeof m !== 'object') continue;
    const file = String((m as OrganizeMove).file ?? '').trim();
    const toFolder = String((m as OrganizeMove).toFolder ?? '').trim();
    if (!validFiles.has(file) || seen.has(file)) continue;
    if (illegalFolder(toFolder)) continue;
    // Reject the model just echoing the filename (with or without extension) as the folder.
    const stem = file.replace(/\.[^.]+$/, '');
    if (toFolder === file || toFolder === stem) continue;
    seen.add(file);
    moves.push({ file, toFolder });
  }

  // Degenerate plan: every folder holds exactly one file -> no real grouping. Drop it.
  const counts = new Map<string, number>();
  for (const m of moves) counts.set(m.toFolder, (counts.get(m.toFolder) ?? 0) + 1);
  if (moves.length > 1 && [...counts.values()].every((n) => n === 1)) {
    return { moves: [], rationale: '' };
  }

  const rationale = typeof obj.rationale === 'string' ? obj.rationale.slice(0, 300) : '';
  return { moves, rationale };
}

/** Build the plan. Throws with a friendly message if no model is loaded. */
export async function proposeOrganization(dirPath: string): Promise<OrganizePlan> {
  if (!path.isAbsolute(dirPath)) throw new Error('Invalid folder');
  if (inferenceRuntime.getActiveModelState().status !== 'loaded') {
    throw new Error('Load a model first — Organize needs the local AI to group your files.');
  }

  const names = (await directFiles(dirPath)).slice(0, MAX_FILES);
  if (names.length === 0) throw new Error('This folder has no loose files to organize.');

  const index = new Map(db.listEntries(null).map((e) => [e.path.toLowerCase(), e]));
  const lines = await Promise.all(
    names.map(async (name) => {
      let size = 0;
      try {
        size = (await fs.stat(path.join(dirPath, name))).size;
      } catch {
        /* ignore */
      }
      const hit = index.get(path.join(dirPath, name).toLowerCase());
      const meta = hit
        ? ` — ${hit.summary ?? ''}${hit.tags.length ? ` [tags: ${hit.tags.join(', ')}]` : ''}`
        : '';
      return `- ${name} (${kb(size)})${meta}`;
    }),
  );

  const reply = await inferenceRuntime.chatCompletions([
    {
      role: 'system',
      content:
        'You organize a folder of loose files into a few well-named subfolders. ' +
        'Respond with ONLY a JSON object: {"moves":[{"file":"<exact filename from the list>","toFolder":"<subfolder name>"}],"rationale":"<one sentence>"}. ' +
        'Rules: use at most 6 subfolders; group clearly-related files together; leave a file out of "moves" if it does not clearly belong in a group; ' +
        'folder names in Title Case, short, no slashes; never invent files that are not in the list; no markdown, no prose outside the JSON.',
    },
    { role: 'user', content: `Folder: ${path.basename(dirPath)}\nFiles:\n${lines.join('\n')}` },
  ]);

  return parsePlan(reply, new Set(names));
}

/** Apply a (possibly user-trimmed) plan: mkdir the target subfolders, move each file in. */
export async function applyOrganization(
  dirPath: string,
  moves: OrganizeMove[],
): Promise<ExplorerOpResult[]> {
  if (!path.isAbsolute(dirPath)) throw new Error('Invalid folder');
  const existing = new Set(await directFiles(dirPath));
  const results: ExplorerOpResult[] = [];

  for (const mv of moves) {
    const src = path.join(dirPath, mv.file);
    try {
      if (illegalFolder(mv.toFolder)) throw new Error('Unsafe folder name');
      if (!existing.has(mv.file)) throw new Error('File no longer here');
      const destDir = path.join(dirPath, mv.toFolder);
      await fs.mkdir(destDir, { recursive: true });
      const dest = path.join(destDir, mv.file);
      try {
        await fs.access(dest);
        throw new Error(`"${mv.file}" already exists in ${mv.toFolder}`);
      } catch (e) {
        if (e instanceof Error && e.message.includes('already exists')) throw e;
      }
      await fs.rename(src, dest);
      db.renameEntryPaths(src, dest);
      results.push({ path: src, ok: true });
    } catch (err) {
      results.push({ path: src, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
