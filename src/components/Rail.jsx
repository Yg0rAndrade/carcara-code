import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, RotateCcw, Square, GripHorizontal, Pencil, Image as ImageIcon, Undo2, ChevronDown, FolderPlus, Folder as FolderIcon } from 'lucide-react';
import { SettingsIcon } from './ui/settings.jsx';
import { SearchIcon } from './ui/search.jsx';
import { RailFolderIcon } from './RailFolder.jsx';
import { colorFor, initials } from '@/lib/projectColor';
import { buildRows } from '@/lib/railTree';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { hasPendingUpdate } from '@/lib/updateView';

export function Rail({ projects, rail = [], projectByPath, active, activity = {}, onOpen, onAdd, onRemove, onRestart, onStop, onReorder, onToggleFolder, onApplyDrop, onRenameFolder, onDissolveFolder, onRename, onSetColor, onSetIcon, onResetCustom, onOpenSettings, onSearch, onRailGrab, width = 64, version = '', update, onOpenAbout }) {
  const t = useT();
  const [menu, setMenu] = useState(null);               // menu de projeto { x, y, project }
  const [folderMenu, setFolderMenu] = useState(null);   // menu de pasta { x, y, folder }
  const [addMenu, setAddMenu] = useState(false);        // popover do "+"
  const [renamingPath, setRenamingPath] = useState(null); // projeto em edição de nome
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState(null); // pasta em edição de nome
  const [folderDraft, setFolderDraft] = useState('');
  const fileInputRef = useRef(null);
  const iconTargetRef = useRef(null);

  // --- drag (borda reordena, centro cria/entra pasta) ---
  const [drag, setDrag] = useState(null);   // { path } | { folderId }
  const [over, setOver] = useState(null);    // { key, zone: 'reorder'|'merge' }
  const dwellRef = useRef(null);
  const dwellKeyRef = useRef(null);
  const clearDwell = () => { if (dwellRef.current) { clearTimeout(dwellRef.current); dwellRef.current = null; } };
  const resetDrag = () => { clearDwell(); dwellKeyRef.current = null; setDrag(null); setOver(null); };

  const dragKeyOf = () => (drag?.path ? drag.path : (drag?.folderId ? 'folder:' + drag.folderId : null));

  const onRowDragOver = (e, row) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragKey = dragKeyOf();
    if (!dragKey || row.key === dragKey) { clearDwell(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const inCenter = cx > r.width * 0.28 && cx < r.width * 0.72 && cy > r.height * 0.28 && cy < r.height * 0.72;
    const canMerge = !drag?.folderId && (row.kind === 'project' || row.kind === 'folder' || row.kind === 'child');

    if (dwellKeyRef.current !== row.key) {
      clearDwell();
      setOver({ key: row.key, zone: 'reorder' });
      dwellKeyRef.current = row.key;
    }

    if (inCenter && canMerge) {
      if (!dwellRef.current) {
        dwellRef.current = setTimeout(() => {
          dwellRef.current = null;
          setOver({ key: row.key, zone: 'merge' });
        }, 400);
      }
    } else {
      clearDwell();
      setOver((prev) => (prev && prev.key === row.key && prev.zone === 'merge' ? { key: row.key, zone: 'reorder' } : prev));
    }
  };

  const onRowDrop = (e, row) => {
    e.preventDefault();
    const dragKey = dragKeyOf();
    if (dragKey && row.key !== dragKey) {
      const zone = over?.key === row.key && over?.zone === 'merge' ? 'merge' : 'reorder';
      if (drag?.path) {
        onApplyDrop?.({
          dragPath: drag.path,
          targetKind: row.kind,
          targetPath: (row.kind === 'project' || row.kind === 'child') ? row.project.path : undefined,
          targetFolderId: row.kind === 'folder' ? row.folder.id : (row.kind === 'child' ? row.folderId : undefined),
          zone,
        });
      } else if (drag?.folderId) {
        onApplyDrop?.({
          dragFolderId: drag.folderId,
          targetKind: row.kind,
          targetPath: row.kind === 'project' ? row.project.path : undefined,
          targetFolderId: row.kind === 'folder' ? row.folder.id : undefined,
          zone: 'reorder',
        });
      }
    }
    resetDrag();
  };

  // --- imagem do projeto (upload) ---
  const pickImage = (p) => { iconTargetRef.current = p; fileInputRef.current?.click(); };
  const onImageChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const p = iconTargetRef.current;
    if (!file || !p) return;
    const reader = new FileReader();
    reader.onload = () => onSetIcon?.(p, String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  // --- rename de projeto ---
  const startRename = (p) => { setRenameDraft(p.name || ''); setRenamingPath(p.path); };
  const cancelRename = () => { setRenamingPath(null); setRenameDraft(''); };
  const commitRename = (p) => {
    if (renamingPath !== p.path) return;
    const name = renameDraft.trim();
    setRenamingPath(null);
    setRenameDraft('');
    if (name !== p.name) onRename?.(p, name);
  };

  // --- rename de pasta ---
  const startFolderRename = (f) => { setFolderDraft(f.name || ''); setRenamingFolderId(f.id); };
  const cancelFolderRename = () => { setRenamingFolderId(null); setFolderDraft(''); };
  const commitFolderRename = (f) => {
    if (renamingFolderId !== f.id) return;
    const name = folderDraft.trim();
    setRenamingFolderId(null);
    setFolderDraft('');
    if (name !== f.name) onRenameFolder?.(f.id, name);
  };

  const openMenu = (e, p) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setMenu({ x, y, project: p });
  };
  const openFolderMenu = (e, f) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 110);
    setFolderMenu({ x, y, folder: f });
  };

  // Botão/entrada de um projeto (solto ou dentro de pasta). indented = filho de pasta.
  const renderProject = (p, { indented = false } = {}) => {
    const isMergeTarget = over?.key === p.path && over?.zone === 'merge';
    const el = renamingPath === p.path ? (
      <div className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border bg-card">
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => commitRename(p)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(p); }
            else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
          }}
          className="h-full w-full rounded-xl bg-transparent px-1 text-center text-[11px] font-bold text-foreground outline-none"
        />
      </div>
    ) : (
      <button
        draggable
        onDragStart={() => setDrag({ path: p.path })}
        onDragOver={(e) => onRowDragOver(e, { key: p.path, kind: indented ? 'child' : 'project', project: p, folderId: p.__folderId })}
        onDrop={(e) => onRowDrop(e, { key: p.path, kind: indented ? 'child' : 'project', project: p, folderId: p.__folderId })}
        onDragEnd={resetDrag}
        onClick={() => onOpen(p)}
        onDoubleClick={() => startRename(p)}
        onContextMenu={(e) => openMenu(e, p)}
        title={p.name}
        className={cn(
          'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border font-bold text-white transition-all hover:-translate-y-0.5 hover:rounded-2xl active:cursor-grabbing',
          active?.path === p.path && 'rounded-2xl ring-2 ring-primary',
          drag?.path === p.path && 'opacity-40',
          isMergeTarget && 'scale-105 ring-2 ring-primary'
        )}
        style={p.icon ? { background: 'hsl(var(--secondary))' } : { background: p.color || colorFor(p.name) }}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]">
          {p.icon ? (
            <img src={p.icon} alt={p.name} draggable={false} className="h-full w-full object-contain p-1" />
          ) : (
            <span>{initials(p.name)}</span>
          )}
        </span>
        {p.running && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
        )}
        {activity[p.path] && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            {activity[p.path] === 'asking' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            )}
            <span
              title={
                activity[p.path] === 'working' ? t('rail.claude_working')
                : activity[p.path] === 'asking' ? t('rail.claude_asking')
                : t('rail.claude_done')
              }
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-card bg-amber-500',
                activity[p.path] === 'working' && 'animate-pulse'
              )}
            />
          </span>
        )}
      </button>
    );
    return indented ? (
      <div className="flex basis-full items-center justify-center gap-1">
        <span className="h-[42px] w-px shrink-0 rounded bg-border" />
        {el}
      </div>
    ) : el;
  };

  // Ícone da pasta (fechada ou aberta) + rename inline.
  const renderFolder = (row) => {
    const f = row.folder;
    const open = !f.collapsed;
    const isMergeTarget = over?.key === row.key && over?.zone === 'merge';
    if (renamingFolderId === f.id) {
      return (
        <div className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border bg-card">
          <input
            autoFocus
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => commitFolderRename(f)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitFolderRename(f); }
              else if (e.key === 'Escape') { e.preventDefault(); cancelFolderRename(); }
            }}
            className="h-full w-full rounded-xl bg-transparent px-1 text-center text-[11px] font-bold text-foreground outline-none"
          />
        </div>
      );
    }
    return (
      <button
        draggable
        onDragStart={() => setDrag({ folderId: f.id })}
        onDragOver={(e) => onRowDragOver(e, row)}
        onDrop={(e) => onRowDrop(e, row)}
        onDragEnd={resetDrag}
        onClick={() => onToggleFolder?.(f.id)}
        onDoubleClick={() => startFolderRename(f)}
        onContextMenu={(e) => openFolderMenu(e, f)}
        title={f.name || t('rail.folder_default')}
        className={cn(
          'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 active:cursor-grabbing',
          open && 'ring-2 ring-primary/50',
          drag?.folderId === f.id && 'opacity-40',
          isMergeTarget && 'scale-105 ring-2 ring-primary'
        )}
      >
        <RailFolderIcon previews={row.previews} count={row.count} open={open} moreLabel={t('rail.folder_more', { n: row.count - 3 })} />
        {open && <ChevronDown className="absolute -bottom-1 h-3 w-3 text-primary" />}
      </button>
    );
  };

  const rows = buildRows(rail, projectByPath || new Map());

  return (
    <nav style={{ width }} className="flex shrink-0 flex-col overflow-hidden border-r bg-card py-3">
      <div className="flex shrink-0 flex-col items-center px-2">
        <span
          onMouseDown={(e) => onRailGrab?.(e)}
          title={t('rail.move_tooltip')}
          className="mb-1.5 grid h-5 w-7 cursor-grab place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:size-3.5"
        >
          <GripHorizontal />
        </span>
        <button
          onClick={onSearch}
          title={t('rail.search_tooltip')}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-full border bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground [&_svg]:size-[18px]"
        >
          <SearchIcon size={18} />
        </button>
        <div className="my-2.5 h-px w-7 rounded-full bg-border" />
      </div>

      {/* Lista rolável: projetos soltos + pastas (com filhos indentados quando abertas). */}
      <div
        className="no-scrollbar flex min-h-0 flex-1 flex-wrap content-start justify-center gap-2.5 overflow-y-auto px-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); resetDrag(); }}
      >
        <AnimatePresence initial={false}>
          {rows.map((row) => {
            if (row.kind === 'folder') {
              return (
                <motion.div layout key={row.key} className="basis-full flex justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {renderFolder(row)}
                </motion.div>
              );
            }
            const indented = row.kind === 'child';
            const p = indented ? { ...row.project, __folderId: row.folderId } : row.project;
            return (
              <motion.div layout key={row.key} className={cn('flex justify-center', indented ? 'basis-full' : 'basis-auto')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {renderProject(p, { indented })}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Rodapé fixo: adicionar (projeto/pasta) + configurações. */}
      <div className="relative shrink-0 px-2 pt-2">
        <div className="flex flex-col items-center gap-1.5 py-2">
          <button
            onClick={() => setAddMenu((v) => !v)}
            title={t('rail.add_open_tooltip')}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-dashed text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
          <div className="h-px w-7 rounded-full bg-border" />
          <button
            onClick={onOpenSettings}
            title={t('rail.settings_tooltip')}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon size={20} />
          </button>
        </div>

        {addMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAddMenu(false)} />
            <div className="absolute bottom-[76px] left-1/2 z-50 min-w-[170px] -translate-x-1/2 overflow-hidden rounded-md border bg-background py-1 shadow-md">
              <button
                type="button"
                onClick={() => { setAddMenu(false); onAdd?.(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('rail.add_menu_project')}</span>
              </button>
              <button
                type="button"
                onClick={() => { setAddMenu(false); toast(t('rail.add_folder_hint')); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('rail.add_menu_folder')}</span>
              </button>
            </div>
          </>
        )}

        {version && (
          <div className="mt-1 flex justify-center">
            <button
              onClick={onOpenAbout}
              title={t('rail.version_tooltip')}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              {hasPendingUpdate(update) && <span className="size-1.5 rounded-full bg-primary" />}
              v{version}
            </button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />

      <RailMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onRestart={(p) => { setMenu(null); onRestart?.(p); }}
        onStop={(p) => { setMenu(null); onStop?.(p); }}
        onRemove={(p) => { setMenu(null); onRemove(p); }}
        onRename={(p) => { setMenu(null); startRename(p); }}
        onSetColor={(p, c) => onSetColor?.(p, c)}
        onPickImage={(p) => { setMenu(null); pickImage(p); }}
        onRemoveImage={(p) => { setMenu(null); onSetIcon?.(p, ''); }}
        onReset={(p) => { setMenu(null); onResetCustom?.(p); }}
      />

      <FolderMenu
        menu={folderMenu}
        onClose={() => setFolderMenu(null)}
        onRename={(f) => { setFolderMenu(null); startFolderRename(f); }}
        onDissolve={(f) => { setFolderMenu(null); onDissolveFolder?.(f.id); }}
      />
    </nav>
  );
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];

// Menu de contexto de projeto (igual ao atual).
function RailMenu({ menu, onClose, onRestart, onStop, onRemove, onRename, onSetColor, onPickImage, onRemoveImage, onReset }) {
  const t = useT();
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const p = menu.project;
  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[190px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      <button type="button" onClick={() => onRename(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_rename')}</span>
      </button>

      <div className="px-3 py-1.5">
        <div className="mb-1 text-[11px] text-muted-foreground">{t('rail.menu_color')}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSetColor(p, c)}
              title={c}
              className={cn('h-4 w-4 rounded-full border border-black/10 transition-transform hover:scale-110', p.color === c && 'ring-2 ring-primary ring-offset-1 ring-offset-background')}
              style={{ background: c }}
            />
          ))}
          <label
            title={t('rail.menu_color_custom')}
            className="grid h-4 w-4 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed"
            style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
          >
            <input type="color" value={p.color || '#3b82f6'} onChange={(e) => onSetColor(p, e.target.value)} className="h-6 w-6 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>

      <button type="button" onClick={() => onPickImage(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_image')}</span>
      </button>
      {p.icon && (
        <button type="button" onClick={() => onRemoveImage(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('rail.menu_image_remove')}</span>
        </button>
      )}
      <button type="button" onClick={() => onReset(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <Undo2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_reset')}</span>
      </button>

      <div className="my-1 border-t" />

      <button type="button" onClick={() => onRestart(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{p.running ? t('rail.menu_restart_running') : t('rail.menu_start_running')}</span>
      </button>
      {p.running && (
        <button type="button" onClick={() => onStop(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
          <Square className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('rail.menu_stop_server')}</span>
        </button>
      )}
      <div className="my-1 border-t" />
      <button type="button" onClick={() => onRemove(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-muted">
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_remove_project')}</span>
      </button>
    </div>
  );
}

// Menu de contexto de pasta: renomear e desfazer (solta os filhos; não apaga nada).
function FolderMenu({ menu, onClose, onRename, onDissolve }) {
  const t = useT();
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const f = menu.folder;
  return (
    <div ref={ref} className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-background py-1 shadow-md" style={{ left: menu.x, top: menu.y }}>
      <button type="button" onClick={() => onRename(f)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_folder_rename')}</span>
      </button>
      <button type="button" onClick={() => onDissolve(f)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted">
        <Undo2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_folder_dissolve')}</span>
      </button>
    </div>
  );
}
