import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExplorerEntry,
  ExplorerPlace,
  FileOrganizerEntry,
  OrganizeMove,
  OrganizePlan,
} from '@shared/types';
import { formatBytes } from '../../lib/format';
import { useExplorer, parentDir, type SortKey, type SortState } from './useExplorer';

type IndexMap = Map<string, FileOrganizerEntry>;
const idxOf = (index: IndexMap, p: string) => index.get(p.toLowerCase());

/** Strip Electron's "Error invoking remote method '…': Error: " IPC wrapper. */
function cleanErr(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '');
}

const PATHS_MIME = 'application/x-geniex-paths';

const EXT_ICON: Array<[RegExp, string]> = [
  [/\.(png|jpe?g|gif|webp|bmp|svg|heic|tiff?|ico)$/i, '🖼️'],
  [/\.(mp4|mov|mkv|avi|webm|m4v)$/i, '🎬'],
  [/\.(mp3|wav|flac|aac|ogg|m4a)$/i, '🎵'],
  [/\.pdf$/i, '📄'],
  [/\.(docx?|rtf|odt)$/i, '📝'],
  [/\.(xlsx?|csv|ods)$/i, '📊'],
  [/\.(pptx?|odp)$/i, '📽️'],
  [/\.(zip|rar|7z|tar|gz)$/i, '🗜️'],
  [/\.(txt|md|markdown|log)$/i, '📃'],
  [/\.(js|ts|tsx|jsx|json|html|css|py|rs|go|c|cpp|java|sh)$/i, '💻'],
  [/\.(exe|msi|bat|cmd)$/i, '⚙️'],
];

function iconFor(entry: ExplorerEntry): string {
  if (entry.isDirectory) return '📁';
  for (const [re, icon] of EXT_ICON) if (re.test(entry.name)) return icon;
  return '📦';
}

function typeLabel(entry: ExplorerEntry): string {
  if (entry.isDirectory) return 'File folder';
  const ext = entry.ext.replace('.', '').toUpperCase();
  return ext ? `${ext} file` : 'File';
}

/** Absolute path -> clickable breadcrumb segments. */
function crumbs(cwd: string): Array<{ label: string; path: string }> {
  const norm = cwd.replace(/[\\/]+$/, '');
  const parts = norm.split(/[\\/]+/).filter((p, i) => p !== '' || i === 0);
  const out: Array<{ label: string; path: string }> = [];
  let acc = '';
  parts.forEach((part, i) => {
    if (i === 0) {
      acc = /^[A-Za-z]:$/.test(part) ? `${part}\\` : `/${part}`;
      out.push({ label: /^[A-Za-z]:$/.test(part) ? part : part || '/', path: acc });
    } else {
      acc = /[\\/]$/.test(acc) ? acc + part : `${acc}\\${part}`;
      out.push({ label: part, path: acc });
    }
  });
  return out;
}

function sortEntries(entries: ExplorerEntry[], key: SortKey, dir: 1 | -1): ExplorerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1; // folders first, always
    let cmp = 0;
    if (key === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
    else if (key === 'modifiedAt') cmp = a.modifiedAt.localeCompare(b.modifiedAt);
    else if (key === 'size') cmp = a.sizeBytes - b.sizeBytes;
    else if (key === 'type') cmp = a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name);
    return cmp * dir;
  });
}

export function ExplorerScreen() {
  const ex = useExplorer();
  const {
    cwd,
    entries,
    roots,
    addRoot,
    loading,
    error,
    notice,
    setNotice,
    selection,
    setSelection,
    clipboard,
    setClipboard,
    sort,
    setSort,
    view,
    setView,
    navState,
    index,
    loadIndex,
    navigate,
    back,
    forward,
    up,
    refresh,
    move,
    paste,
    open,
    createFolder,
    rename,
    trash,
  } = ex;

  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: ExplorerEntry | null } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [organizeBusy, setOrganizeBusy] = useState(false);
  const [plan, setPlan] = useState<OrganizePlan | null>(null);

  useEffect(() => setFilter(''), [cwd]);

  const runOrganize = useCallback(async () => {
    if (!cwd) return;
    setOrganizeBusy(true);
    setNotice(null);
    try {
      const p = await window.geniex.explorer.proposeOrganize(cwd);
      if (p.moves.length === 0) {
        setNotice('The AI didn’t find a clearer way to group these files.');
      } else {
        setPlan(p);
      }
    } catch (err) {
      setNotice(cleanErr(err));
    } finally {
      setOrganizeBusy(false);
    }
  }, [cwd, setNotice]);

  const applyPlan = useCallback(
    async (moves: OrganizeMove[]) => {
      if (!cwd) return;
      setPlan(null);
      const results = await window.geniex.explorer.applyOrganize(cwd, moves);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) setNotice(`Organize: ${failed.length} file(s) skipped — ${failed[0].error}`);
      void loadIndex();
      void refresh();
    },
    [cwd, refresh, loadIndex, setNotice],
  );

  // Global search across the LLM index — files anywhere that match, so the
  // Explorer replaces the old separate "indexed" browser.
  const indexHits = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length < 2) return [];
    const cwdLower = cwd?.toLowerCase() ?? null;
    const out: FileOrganizerEntry[] = [];
    for (const e of index.values()) {
      const parent = e.path.slice(0, e.path.length - e.name.length - 1).toLowerCase();
      if (cwdLower && parent === cwdLower) continue; // already shown in the folder view
      if (
        e.name.toLowerCase().includes(q) ||
        e.summary?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        out.push(e);
      }
    }
    return out.slice(0, 40);
  }, [index, filter, cwd]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
    return sortEntries(filtered, sort.key, sort.dir);
  }, [entries, filter, sort]);

  const selectedPaths = useMemo(() => [...selection], [selection]);

  const dragPayload = useCallback(
    (entry: ExplorerEntry): string[] => (selection.has(entry.path) ? [...selection] : [entry.path]),
    [selection],
  );

  const handleDropOn = useCallback(
    (e: React.DragEvent, destDir: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(null);
      const raw = e.dataTransfer.getData(PATHS_MIME);
      if (!raw) return;
      try {
        const paths = JSON.parse(raw) as string[];
        void move(paths, destDir);
      } catch {
        /* ignore malformed payload */
      }
    },
    [move],
  );

  const allowDrop = (e: React.DragEvent, key: string) => {
    if (!e.dataTransfer.types.includes(PATHS_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver((prev) => (prev === key ? prev : key));
  };

  // --- keyboard shortcuts ---------------------------------------------------
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (renaming) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'F2' && selectedPaths.length === 1) {
        setRenaming(selectedPaths[0]);
      } else if (e.key === 'Delete' && selectedPaths.length) {
        void trash(selectedPaths);
      } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
        up();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        back();
      } else if (e.altKey && e.key === 'ArrowRight') {
        forward();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedPaths.length) {
        setClipboard({ mode: 'copy', paths: selectedPaths });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedPaths.length) {
        setClipboard({ mode: 'cut', paths: selectedPaths });
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard && cwd) {
        void paste(cwd);
      } else if (e.key === 'Enter' && selectedPaths.length === 1) {
        const entry = entries.find((x) => x.path === selectedPaths[0]);
        if (entry) void open(entry);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    renaming,
    selectedPaths,
    entries,
    clipboard,
    cwd,
    trash,
    up,
    back,
    forward,
    setClipboard,
    paste,
    open,
  ]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const clickEntry = (e: React.MouseEvent, entry: ExplorerEntry) => {
    if (e.ctrlKey || e.metaKey) {
      setSelection((prev) => {
        const next = new Set(prev);
        next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
        return next;
      });
    } else {
      setSelection(new Set([entry.path]));
    }
  };

  const openMenu = (e: React.MouseEvent, entry: ExplorerEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry && !selection.has(entry.path)) setSelection(new Set([entry.path]));
    setMenu({ x: e.clientX, y: e.clientY, target: entry });
  };

  return (
    <div ref={rootRef} className="explorer" onContextMenu={(e) => openMenu(e, null)}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h1>🗂️ File Manager</h1>
        </div>
      </div>

      {/* toolbar */}
      <div className="explorer-toolbar">
        <button className="btn btn-sm" onClick={back} disabled={!navState.canBack} title="Back (Alt+←)">
          ◀
        </button>
        <button
          className="btn btn-sm"
          onClick={forward}
          disabled={!navState.canForward}
          title="Forward (Alt+→)"
        >
          ▶
        </button>
        <button className="btn btn-sm" onClick={up} disabled={cwd === null} title="Up (Backspace)">
          ▲
        </button>

        <AddressBar
          cwd={cwd}
          roots={roots}
          onNavigate={navigate}
          onDropOn={handleDropOn}
          allowDrop={allowDrop}
          dragOver={dragOver}
        />

        <input
          className="search-input"
          style={{ minWidth: 160, maxWidth: 240 }}
          placeholder="Filter folder / search indexed…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className="btn btn-sm"
          onClick={createFolder}
          disabled={cwd === null}
          title="New folder"
        >
          ＋ New folder
        </button>
        <button
          className="btn btn-sm"
          onClick={runOrganize}
          disabled={cwd === null || organizeBusy}
          title="Let the local AI sort this folder into subfolders"
        >
          {organizeBusy ? '✨ Organizing…' : '✨ Organize'}
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-sm${view === 'details' ? ' btn-primary' : ''}`}
            onClick={() => setView('details')}
            title="Details"
          >
            ☰
          </button>
          <button
            className={`btn btn-sm${view === 'icons' ? ' btn-primary' : ''}`}
            onClick={() => setView('icons')}
            title="Large icons"
          >
            ▦
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="error-banner" style={{ marginBottom: 10 }} onClick={() => setNotice(null)}>
          {error ?? notice}
        </div>
      )}

      <div className="explorer-layout">
        <NavPane
          roots={roots}
          cwd={cwd}
          onNavigate={navigate}
          onAddRoot={addRoot}
          onDropOn={handleDropOn}
          allowDrop={allowDrop}
          dragOver={dragOver}
          onDragLeave={() => setDragOver(null)}
        />

        <div
          className={`explorer-main${dragOver === '__cwd__' ? ' drag-over' : ''}`}
          onDragOver={(e) => cwd && allowDrop(e, '__cwd__')}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => cwd && handleDropOn(e, cwd)}
        >
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : cwd === null ? (
            <RootsView roots={roots} onNavigate={navigate} onAddRoot={addRoot} />
          ) : (
            <>
              {visible.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  {filter ? 'Nothing in this folder matches.' : 'This folder is empty.'}
                </div>
              ) : view === 'details' ? (
                <DetailsView
                  entries={visible}
                  index={index}
                  selection={selection}
                  sort={sort}
                  setSort={setSort}
                  clipboard={clipboard}
                  renaming={renaming}
                  setRenaming={setRenaming}
                  onRename={rename}
                  onClick={clickEntry}
                  onOpen={open}
                  onMenu={openMenu}
                  onDragStartPayload={dragPayload}
                  onDropOn={handleDropOn}
                  allowDrop={allowDrop}
                  dragOver={dragOver}
                  onDragLeave={() => setDragOver(null)}
                />
              ) : (
                <IconsView
                  entries={visible}
                  index={index}
                  selection={selection}
                  clipboard={clipboard}
                  renaming={renaming}
                  setRenaming={setRenaming}
                  onRename={rename}
                  onClick={clickEntry}
                  onOpen={open}
                  onMenu={openMenu}
                  onDragStartPayload={dragPayload}
                  onDropOn={handleDropOn}
                  allowDrop={allowDrop}
                  dragOver={dragOver}
                  onDragLeave={() => setDragOver(null)}
                />
              )}

              {indexHits.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="explorer-section-title">
                    Indexed matches elsewhere ({indexHits.length})
                  </div>
                  <div className="explorer-table">
                    {indexHits.map((hit) => (
                      <div
                        key={hit.path}
                        className="explorer-tr"
                        title={hit.summary ?? hit.path}
                        onDoubleClick={() => void window.geniex.explorer.openPath(hit.path)}
                        onClick={() => navigate(parentDir(hit.path))}
                      >
                        <div className="explorer-td explorer-td-name">
                          <span className="explorer-ico">📄</span>
                          <span className="explorer-name">{hit.name}</span>
                          {hit.tags.slice(0, 3).map((t) => (
                            <span key={t} className="explorer-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="explorer-td" style={{ flex: 1, color: 'var(--text-tertiary)' }}>
                          {parentDir(hit.path)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {plan && cwd && (
        <OrganizeModal
          dir={cwd}
          plan={plan}
          onCancel={() => setPlan(null)}
          onApply={applyPlan}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          canPaste={!!clipboard && !!cwd}
          onOpen={() => menu.target && open(menu.target)}
          onReveal={() => {
            const p = menu.target?.path ?? cwd;
            if (p) void window.geniex.explorer.revealInOs(p);
          }}
          onCut={() => selectedPaths.length && setClipboard({ mode: 'cut', paths: selectedPaths })}
          onCopy={() => selectedPaths.length && setClipboard({ mode: 'copy', paths: selectedPaths })}
          onPaste={() => cwd && paste(cwd)}
          onRename={() => selectedPaths.length === 1 && setRenaming(selectedPaths[0])}
          onDelete={() => selectedPaths.length && trash(selectedPaths)}
          onCopyPath={() => {
            const p = menu.target?.path ?? cwd;
            if (p) void navigator.clipboard?.writeText(p);
          }}
          onNewFolder={createFolder}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

/** Which added root contains `p` (longest match), if any. */
function containingRoot(p: string, roots: ExplorerPlace[]): ExplorerPlace | null {
  const lp = p.replace(/[\\/]+$/, '').toLowerCase();
  let best: ExplorerPlace | null = null;
  for (const r of roots) {
    const lr = r.path.replace(/[\\/]+$/, '').toLowerCase();
    if (lp === lr || lp.startsWith(lr + '\\') || lp.startsWith(lr + '/')) {
      if (!best || lr.length > best.path.length) best = r;
    }
  }
  return best;
}

function AddressBar({
  cwd,
  roots,
  onNavigate,
  onDropOn,
  allowDrop,
  dragOver,
}: {
  cwd: string | null;
  roots: ExplorerPlace[];
  onNavigate: (p: string | null) => void;
  onDropOn: (e: React.DragEvent, dest: string) => void;
  allowDrop: (e: React.DragEvent, key: string) => void;
  dragOver: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  // Breadcrumbs are scoped to the containing indexed folder — the app never
  // exposes anything above the roots the user added in Settings.
  const root = cwd ? containingRoot(cwd, roots) : null;
  const segs = (() => {
    if (!cwd) return [];
    if (root) {
      const rel = cwd.slice(root.path.replace(/[\\/]+$/, '').length).replace(/^[\\/]+/, '');
      const parts = rel ? rel.split(/[\\/]+/).filter(Boolean) : [];
      let acc = root.path.replace(/[\\/]+$/, '');
      return [
        { label: root.label, path: root.path },
        ...parts.map((part) => {
          acc = `${acc}\\${part}`;
          return { label: part, path: acc };
        }),
      ];
    }
    return crumbs(cwd); // typed path outside any root — show it verbatim
  })();

  const commit = async () => {
    const target = text.trim();
    setEditing(false);
    if (!target) return;
    const info = await window.geniex.explorer.pathInfo(target);
    if (info.exists && info.isDirectory) onNavigate(target);
  };

  if (editing) {
    return (
      <input
        className="search-input explorer-address"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      className="explorer-address"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setText(cwd ?? '');
          setEditing(true);
        }
      }}
    >
      <button className="explorer-crumb" onClick={() => onNavigate(null)}>
        Folders
      </button>
      {segs.map((s) => (
        <span key={s.path} style={{ display: 'contents' }}>
          <span className="explorer-crumb-sep">›</span>
          <button
            className={`explorer-crumb${dragOver === s.path ? ' drag-over' : ''}`}
            onClick={() => onNavigate(s.path)}
            onDragOver={(e) => allowDrop(e, s.path)}
            onDrop={(e) => onDropOn(e, s.path)}
          >
            {s.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function RootsView({
  roots,
  onNavigate,
  onAddRoot,
}: {
  roots: ExplorerPlace[];
  onNavigate: (p: string) => void;
  onAddRoot: () => void;
}) {
  if (roots.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 0' }}>
        No folders yet.
        <br />
        <br />
        Add a folder to browse, open and organize its files.
        <br />
        <br />
        <button className="btn btn-primary" onClick={onAddRoot}>
          Add a folder
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="explorer-section-title">Your folders</div>
      <div className="explorer-icons">
        {roots.map((r) => (
          <div key={r.path} className="explorer-tile" onClick={() => onNavigate(r.path)} title={r.path}>
            <div className="explorer-tile-ico">📁</div>
            <div className="explorer-tile-name">{r.label}</div>
          </div>
        ))}
        <div className="explorer-tile" onClick={onAddRoot} title="Add another folder">
          <div className="explorer-tile-ico">＋</div>
          <div className="explorer-tile-name">Add folder</div>
        </div>
      </div>
    </div>
  );
}

function NavPane({
  roots,
  cwd,
  onNavigate,
  onAddRoot,
  onDropOn,
  allowDrop,
  dragOver,
  onDragLeave,
}: {
  roots: ExplorerPlace[];
  cwd: string | null;
  onNavigate: (p: string | null) => void;
  onAddRoot: () => void;
  onDropOn: (e: React.DragEvent, dest: string) => void;
  allowDrop: (e: React.DragEvent, key: string) => void;
  dragOver: string | null;
  onDragLeave: () => void;
}) {
  return (
    <div className="explorer-nav">
      <button
        className={`explorer-nav-item${cwd === null ? ' active' : ''}`}
        onClick={() => onNavigate(null)}
      >
        <span>🗂️</span>
        <span>All folders</span>
      </button>

      <div className="explorer-nav-heading">Indexed folders</div>
      {roots.map((r) => (
        <TreeNode
          key={r.path}
          label={r.label}
          icon="📁"
          path={r.path}
          depth={0}
          cwd={cwd}
          onNavigate={onNavigate}
          onDropOn={onDropOn}
          allowDrop={allowDrop}
          dragOver={dragOver}
          onDragLeave={onDragLeave}
        />
      ))}

      <button
        className="explorer-nav-item"
        style={{ color: 'var(--text-tertiary)', marginTop: 4 }}
        onClick={onAddRoot}
      >
        <span>＋</span>
        <span>Add folder</span>
      </button>
    </div>
  );
}

function TreeNode({
  label,
  icon,
  path,
  depth,
  cwd,
  onNavigate,
  onDropOn,
  allowDrop,
  dragOver,
  onDragLeave,
}: {
  label: string;
  icon: string;
  path: string;
  depth: number;
  cwd: string | null;
  onNavigate: (p: string) => void;
  onDropOn: (e: React.DragEvent, dest: string) => void;
  allowDrop: (e: React.DragEvent, key: string) => void;
  dragOver: string | null;
  onDragLeave: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<ExplorerEntry[] | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      try {
        const list = await window.geniex.explorer.listDirectory(path);
        setChildren(list.filter((e) => e.isDirectory && !e.isSymbolicLink));
      } catch {
        setChildren([]);
      }
    }
  };

  const active = cwd != null && cwd.replace(/[\\/]+$/, '') === path.replace(/[\\/]+$/, '');

  return (
    <div>
      <div
        className={`explorer-nav-item${active ? ' active' : ''}${dragOver === path ? ' drag-over' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onNavigate(path)}
        onDragOver={(e) => allowDrop(e, path)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDropOn(e, path)}
      >
        <span
          className="explorer-nav-caret"
          onClick={(e) => {
            e.stopPropagation();
            void toggle();
          }}
        >
          {expanded ? '▾' : '▸'}
        </span>
        <span>{icon}</span>
        <span className="explorer-nav-label">{label}</span>
      </div>
      {expanded &&
        children?.map((c) => (
          <TreeNode
            key={c.path}
            label={c.name}
            icon="📁"
            path={c.path}
            depth={depth + 1}
            cwd={cwd}
            onNavigate={onNavigate}
            onDropOn={onDropOn}
            allowDrop={allowDrop}
            dragOver={dragOver}
            onDragLeave={onDragLeave}
          />
        ))}
    </div>
  );
}

interface RowCommonProps {
  entries: ExplorerEntry[];
  index: IndexMap;
  selection: Set<string>;
  clipboard: { mode: 'copy' | 'cut'; paths: string[] } | null;
  renaming: string | null;
  setRenaming: (p: string | null) => void;
  onRename: (target: string, newName: string) => void;
  onClick: (e: React.MouseEvent, entry: ExplorerEntry) => void;
  onOpen: (entry: ExplorerEntry) => void;
  onMenu: (e: React.MouseEvent, entry: ExplorerEntry | null) => void;
  onDragStartPayload: (entry: ExplorerEntry) => string[];
  onDropOn: (e: React.DragEvent, dest: string) => void;
  allowDrop: (e: React.DragEvent, key: string) => void;
  dragOver: string | null;
  onDragLeave: () => void;
}

function dragHandlers(
  entry: ExplorerEntry,
  props: Pick<RowCommonProps, 'onDragStartPayload' | 'onDropOn' | 'allowDrop' | 'onDragLeave'>,
) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(PATHS_MIME, JSON.stringify(props.onDragStartPayload(entry)));
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: entry.isDirectory ? (e: React.DragEvent) => props.allowDrop(e, entry.path) : undefined,
    onDragLeave: entry.isDirectory ? props.onDragLeave : undefined,
    onDrop: entry.isDirectory ? (e: React.DragEvent) => props.onDropOn(e, entry.path) : undefined,
  };
}

function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="search-input"
      style={{ padding: '2px 6px', font: 'inherit', width: '100%' }}
      autoFocus
      value={value}
      onFocus={(e) => {
        const dot = initial.lastIndexOf('.');
        e.currentTarget.setSelectionRange(0, dot > 0 ? dot : initial.length);
      }}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => (value.trim() && value !== initial ? onCommit(value.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') value.trim() && value !== initial ? onCommit(value.trim()) : onCancel();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

function DetailsView(
  props: RowCommonProps & {
    sort: SortState;
    setSort: (fn: (s: SortState) => SortState) => void;
  },
) {
  const { entries, index, selection, sort, setSort, clipboard, renaming, setRenaming, onRename, onClick, onOpen, onMenu } =
    props;

  const header = (key: SortKey, label: string, width?: number) => (
    <button
      className="explorer-th"
      style={width ? { width } : undefined}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}
    >
      {label} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </button>
  );

  return (
    <div className="explorer-table">
      <div className="explorer-tr explorer-tr-head">
        {header('name', 'Name')}
        {header('modifiedAt', 'Date modified', 170)}
        {header('type', 'Type', 120)}
        {header('size', 'Size', 100)}
      </div>
      {entries.map((entry) => {
        const cut = clipboard?.mode === 'cut' && clipboard.paths.includes(entry.path);
        const meta = idxOf(index, entry.path);
        return (
          <div
            key={entry.path}
            className={`explorer-tr${selection.has(entry.path) ? ' selected' : ''}${
              props.dragOver === entry.path ? ' drag-over' : ''
            }${cut ? ' cut' : ''}`}
            title={meta?.summary ?? undefined}
            onClick={(e) => onClick(e, entry)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => onMenu(e, entry)}
            {...dragHandlers(entry, props)}
          >
            <div className="explorer-td explorer-td-name">
              <span className="explorer-ico">{iconFor(entry)}</span>
              {renaming === entry.path ? (
                <RenameField
                  initial={entry.name}
                  onCommit={(name) => {
                    setRenaming(null);
                    onRename(entry.path, name);
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <>
                  <span className="explorer-name">{entry.name}</span>
                  {meta?.tags.slice(0, 3).map((t) => (
                    <span key={t} className="explorer-tag">
                      {t}
                    </span>
                  ))}
                </>
              )}
            </div>
            <div className="explorer-td" style={{ width: 170 }}>
              {new Date(entry.modifiedAt).toLocaleString()}
            </div>
            <div className="explorer-td" style={{ width: 120 }}>
              {typeLabel(entry)}
            </div>
            <div className="explorer-td" style={{ width: 100, textAlign: 'right' }}>
              {entry.isDirectory ? '' : formatBytes(entry.sizeBytes)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IconsView(props: RowCommonProps) {
  const { entries, index, selection, clipboard, renaming, setRenaming, onRename, onClick, onOpen, onMenu } = props;
  return (
    <div className="explorer-icons">
      {entries.map((entry) => {
        const cut = clipboard?.mode === 'cut' && clipboard.paths.includes(entry.path);
        const meta = idxOf(index, entry.path);
        return (
          <div
            key={entry.path}
            className={`explorer-tile${selection.has(entry.path) ? ' selected' : ''}${
              props.dragOver === entry.path ? ' drag-over' : ''
            }${cut ? ' cut' : ''}`}
            title={meta?.summary ?? undefined}
            onClick={(e) => onClick(e, entry)}
            onDoubleClick={() => onOpen(entry)}
            onContextMenu={(e) => onMenu(e, entry)}
            {...dragHandlers(entry, props)}
          >
            {meta?.thumbnail ? (
              <div className="explorer-tile-thumb">
                <img src={meta.thumbnail} alt="" />
              </div>
            ) : (
              <div className="explorer-tile-ico">{iconFor(entry)}</div>
            )}
            {renaming === entry.path ? (
              <RenameField
                initial={entry.name}
                onCommit={(name) => {
                  setRenaming(null);
                  onRename(entry.path, name);
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <div className="explorer-tile-name" title={entry.name}>
                {entry.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  target,
  canPaste,
  onOpen,
  onReveal,
  onCut,
  onCopy,
  onPaste,
  onRename,
  onDelete,
  onCopyPath,
  onNewFolder,
  onRefresh,
}: {
  x: number;
  y: number;
  target: ExplorerEntry | null;
  canPaste: boolean;
  onOpen: () => void;
  onReveal: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
}) {
  const Item = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button className="context-menu-item" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      {target ? (
        <>
          <Item label={target.isDirectory ? 'Open' : 'Open'} onClick={onOpen} />
          <Item label="Show in Windows Explorer" onClick={onReveal} />
          <div className="context-menu-sep" />
          <Item label="Cut" onClick={onCut} />
          <Item label="Copy" onClick={onCopy} />
          <Item label="Paste" onClick={onPaste} disabled={!canPaste} />
          <div className="context-menu-sep" />
          <Item label="Rename" onClick={onRename} />
          <Item label="Delete" onClick={onDelete} />
          <Item label="Copy path" onClick={onCopyPath} />
        </>
      ) : (
        <>
          <Item label="Paste" onClick={onPaste} disabled={!canPaste} />
          <Item label="New folder" onClick={onNewFolder} />
          <Item label="Refresh" onClick={onRefresh} />
          <Item label="Show in Windows Explorer" onClick={onReveal} />
        </>
      )}
    </div>
  );
}

/**
 * Confirmation for an AI "Organize" run. Groups the model's proposed moves by
 * target folder, lets the user drop individual files, and only touches disk on
 * Apply.
 */
function OrganizeModal({
  dir,
  plan,
  onCancel,
  onApply,
}: {
  dir: string;
  plan: OrganizePlan;
  onCancel: () => void;
  onApply: (moves: OrganizeMove[]) => void;
}) {
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const kept = plan.moves.filter((m) => !dropped.has(m.file));

  const byFolder = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const m of kept) {
      if (!groups.has(m.toFolder)) groups.set(m.toFolder, []);
      groups.get(m.toFolder)!.push(m.file);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [kept]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px' }}>✨ Organize “{dir.split(/[\\/]/).pop()}”</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 14px' }}>
          {plan.rationale || 'The AI suggests grouping these files:'}
        </p>

        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {byFolder.length === 0 ? (
            <div className="empty-state">No moves left — nothing to apply.</div>
          ) : (
            byFolder.map(([folder, files]) => (
              <div key={folder} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>📁 {folder}</div>
                {files.map((f) => (
                  <div key={f} className="organize-row">
                    <span className="explorer-name">{f}</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => setDropped((d) => new Set(d).add(f))}
                      title="Leave this file where it is"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={kept.length === 0}
            onClick={() => onApply(kept)}
          >
            Move {kept.length} file{kept.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
