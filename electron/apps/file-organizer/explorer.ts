// File Manager — live filesystem access for the Explorer view.
//
// Unlike the rest of this app's modules (which only read/write the persisted
// LLM index in store.ts), this one operates directly on disk: listing real
// directories on every navigation, moving/copying/trashing files, and handing
// files off to the OS default application. All of it is user-initiated from
// the renderer via IPC — the same trust posture as the existing
// fileOrganizer:readFileBuffer channel, just with mutations added.

import fs from 'node:fs/promises';
import path from 'node:path';
import { shell, app } from 'electron';
import type {
  ExplorerEntry,
  ExplorerOpResult,
  ExplorerPathInfo,
  ExplorerPlace,
} from '@shared/types';
import * as db from './store';

/** Reject names Windows (or the shell) can't represent. */
function isIllegalName(name: string): boolean {
  if (!name || name === '.' || name === '..') return true;
  if (/[<>:"|?*/]/.test(name)) return true;
  if (name.includes(path.sep) || name.includes('/')) return true;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return true;
  }
  return false;
}

function assertAbsolute(p: string): string {
  const norm = path.normalize(p);
  if (!path.isAbsolute(norm)) throw new Error(`Not an absolute path: ${p}`);
  return norm;
}

/** Case-insensitive on Windows: is `child` at or below `parent`? */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function toEntry(dir: string, name: string): Promise<ExplorerEntry | null> {
  const full = path.join(dir, name);
  try {
    const lst = await fs.lstat(full);
    const isSymbolicLink = lst.isSymbolicLink();
    // Resolve through links so a junction to a folder still reads as a folder.
    const stat = isSymbolicLink ? await fs.stat(full).catch(() => lst) : lst;
    const isDirectory = stat.isDirectory();
    return {
      path: full,
      name,
      isDirectory,
      sizeBytes: isDirectory ? 0 : stat.size,
      modifiedAt: stat.mtime.toISOString(),
      ext: isDirectory ? '' : path.extname(name).toLowerCase(),
      isSymbolicLink,
    };
  } catch {
    return null; // permission denied / vanished mid-listing — skip it
  }
}

export async function listDirectory(dirPath: string): Promise<ExplorerEntry[]> {
  const dir = assertAbsolute(dirPath);
  const names = await fs.readdir(dir);
  const settled = await Promise.all(names.map((n) => toEntry(dir, n)));
  return settled.filter((e): e is ExplorerEntry => e !== null);
}

export async function listDrives(): Promise<ExplorerPlace[]> {
  if (process.platform !== 'win32') {
    return [{ path: '/', label: '/', icon: '💽' }];
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const checks = await Promise.all(
    letters.map(async (l) => {
      const root = `${l}:\\`;
      return (await pathExists(root)) ? ({ path: root, label: `${l}:`, icon: '💽' } as ExplorerPlace) : null;
    }),
  );
  return checks.filter((d): d is ExplorerPlace => d !== null);
}

export async function quickAccess(): Promise<ExplorerPlace[]> {
  const wanted: Array<{ key: Parameters<typeof app.getPath>[0]; label: string; icon: string }> = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'desktop', label: 'Desktop', icon: '🖥️' },
    { key: 'documents', label: 'Documents', icon: '📄' },
    { key: 'downloads', label: 'Downloads', icon: '⬇️' },
    { key: 'pictures', label: 'Pictures', icon: '🖼️' },
    { key: 'music', label: 'Music', icon: '🎵' },
    { key: 'videos', label: 'Videos', icon: '🎬' },
  ];
  const out: ExplorerPlace[] = [];
  for (const w of wanted) {
    let p: string;
    try {
      p = app.getPath(w.key);
    } catch {
      continue;
    }
    if (await pathExists(p)) out.push({ path: p, label: w.label, icon: w.icon });
  }
  return out;
}

export async function pathInfo(p: string): Promise<ExplorerPathInfo> {
  try {
    const stat = await fs.stat(assertAbsolute(p));
    return { exists: true, isDirectory: stat.isDirectory() };
  } catch {
    return { exists: false, isDirectory: false };
  }
}

/** `report.pdf` -> `report (2).pdf`, incrementing until a free name is found. */
async function dedupedDest(destDir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(destDir, name);
  let n = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(destDir, `${stem} (${n})${ext}`);
    n++;
  }
  return candidate;
}

async function moveOne(src: string, destDir: string): Promise<ExplorerOpResult> {
  try {
    const from = assertAbsolute(src);
    const dir = assertAbsolute(destDir);
    const dest = path.join(dir, path.basename(from));

    if (path.relative(from, dest) === '') return { path: src, ok: true }; // already there
    if (isInside(from, dir)) throw new Error("Can't move a folder into itself");
    if (await pathExists(dest)) throw new Error(`"${path.basename(from)}" already exists here`);

    try {
      await fs.rename(from, dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        // Cross-volume: copy then delete the original.
        await fs.cp(from, dest, { recursive: true, errorOnExist: true, force: false });
        await fs.rm(from, { recursive: true, force: true });
      } else {
        throw err;
      }
    }
    db.renameEntryPaths(from, dest);
    return { path: src, ok: true };
  } catch (err) {
    return { path: src, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function move(sources: string[], destDir: string): Promise<ExplorerOpResult[]> {
  return Promise.all(sources.map((s) => moveOne(s, destDir)));
}

async function copyOne(src: string, destDir: string): Promise<ExplorerOpResult> {
  try {
    const from = assertAbsolute(src);
    const dir = assertAbsolute(destDir);
    if (isInside(from, dir)) throw new Error("Can't copy a folder into itself");
    const dest = await dedupedDest(dir, path.basename(from));
    await fs.cp(from, dest, { recursive: true });
    return { path: src, ok: true };
  } catch (err) {
    return { path: src, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function copy(sources: string[], destDir: string): Promise<ExplorerOpResult[]> {
  return Promise.all(sources.map((s) => copyOne(s, destDir)));
}

export async function createFolder(parentDir: string, name?: string): Promise<string> {
  const dir = assertAbsolute(parentDir);
  const requested = (name ?? '').trim();
  if (requested && isIllegalName(requested)) throw new Error('That folder name is not allowed');

  let target = requested || 'New folder';
  if (!requested) {
    let n = 2;
    while (await pathExists(path.join(dir, target))) target = `New folder (${n++})`;
  }
  const full = path.join(dir, target);
  await fs.mkdir(full);
  return full;
}

export async function rename(targetPath: string, newName: string): Promise<string> {
  const from = assertAbsolute(targetPath);
  const trimmed = newName.trim();
  if (isIllegalName(trimmed)) throw new Error('That name is not allowed');
  const dest = path.join(path.dirname(from), trimmed);
  if (path.relative(from, dest) === '') return from;
  if (await pathExists(dest)) throw new Error(`"${trimmed}" already exists here`);
  await fs.rename(from, dest);
  db.renameEntryPaths(from, dest);
  return dest;
}

export async function trash(paths: string[]): Promise<ExplorerOpResult[]> {
  return Promise.all(
    paths.map(async (p) => {
      try {
        await shell.trashItem(assertAbsolute(p));
        db.removeEntriesUnder([p]);
        return { path: p, ok: true };
      } catch (err) {
        return { path: p, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}

/** Hand a file to the OS default application. Returns an error string, or '' on success. */
export async function openPath(filePath: string): Promise<string> {
  return shell.openPath(assertAbsolute(filePath));
}

export function revealInOs(p: string): void {
  shell.showItemInFolder(assertAbsolute(p));
}
