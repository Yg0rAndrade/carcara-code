import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  RotateCcw,
  Square,
  GripHorizontal,
  Pencil,
  Undo2,
  ChevronDown,
  FolderPlus,
  Folder as FolderIcon,
  Settings2,
  Server,
} from 'lucide-react';
import { SettingsIcon } from './ui/settings.jsx';
import { SearchIcon } from './ui/search.jsx';
import { RailFolderIcon } from './RailFolder.jsx';
import { ProjectSettingsModal } from './ProjectSettingsModal.jsx';
import { colorFor, initials } from '@/lib/projectColor';
import { hasExternalFiles } from '@/lib/dragPaths.js';
import { buildRows } from '@/lib/railTree';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { hasPendingUpdate } from '@/lib/updateView';

export function Rail({
  projects,
  rail = [],
  projectByPath,
  active,
  activity = {},
  onOpen,
  onAdd,
  onAddFolder,
  onAddRemote,
  onRemove,
  onRestart,
  onStop,
  onReorder,
  onToggleFolder,
  onApplyDrop,
  onRenameFolder,
  onDissolveFolder,
  onRename,
  onSetColor,
  onSetIcon,
  onResetCustom,
  onOpenSettings,
  onSearch,
  onRailGrab,
  width = 64,
  version = '',
  update,
  onOpenAbout,
}) {
  const t = useT();
  const [menu, setMenu] = useState(null); // menu de projeto { x, y, project }
  const [folderMenu, setFolderMenu] = useState(null); // menu de pasta { x, y, folder }
  const [addMenu, setAddMenu] = useState(null); // popover do "+" { left, bottom } (fixed) | null
  const [renamingFolder, setRenamingFolder] = useState(null); // pasta aberta no modal de renomear | null
  const [tip, setTip] = useState(null); // tooltip do nome (projeto/pasta) { name, x, y } | null
  // Personalização (nome/cor/imagem) do projeto vive no ProjectSettingsModal. Guardamos
  // só o PATH do projeto aberto e derivamos o objeto vivo da lista, pra o preview refletir
  // na hora as mudanças de cor/imagem já persistidas.
  const [settingsPath, setSettingsPath] = useState(null);
  const settingsProject = settingsPath
    ? projects.find((p) => p.path === settingsPath) || null
    : null;
  const openProjectSettings = (p) => setSettingsPath(p.path);

  // --- drag (borda reordena, centro cria/entra pasta) ---
  const [drag, setDrag] = useState(null); // { path } | { folderId }
  const [over, setOver] = useState(null); // { key, zone: 'reorder'|'merge' }
  const mergeRef = useRef(null); // timer do merge (criar/entrar pasta) no centro
  const reorderRef = useRef(null); // timer do slide de reordenar (atraso curto estilo iOS)
  const dwellKeyRef = useRef(null);
  const hoverRef = useRef(null); // alvo IMEDIATO { row, zone } pro drop (o `over` é só o visual, atrasado)
  const clearTimers = () => {
    if (mergeRef.current) {
      clearTimeout(mergeRef.current);
      mergeRef.current = null;
    }
    if (reorderRef.current) {
      clearTimeout(reorderRef.current);
      reorderRef.current = null;
    }
  };
  const resetDrag = () => {
    clearTimers();
    dwellKeyRef.current = null;
    hoverRef.current = null;
    setDrag(null);
    setOver(null);
  };

  const dragKeyOf = () =>
    drag?.path ? drag.path : drag?.folderId ? 'folder:' + drag.folderId : null;

  // --- Arrasto de arquivo EXTERNO (de fora do app) sobre a barra ---
  // Parar ~0,7s em cima de OUTRO projeto durante um arrasto externo abre aquele projeto
  // (dwell / spring-loaded), pra o usuário soltar o arquivo lá. Medimos o tempo pelos
  // ticks do próprio 'dragover' (o HTML dispara ~a cada 350ms mesmo parado), então não
  // há timer pra vazar: sair da linha para de tickar e o dwell nunca completa; entrar
  // noutra troca a chave e reinicia. `springKey` é só o feedback visual ("vou abrir").
  const extDwellRef = useRef({ key: null, since: 0, fired: false });
  const [springKey, setSpringKey] = useState(null);
  const clearExtDwell = () => {
    extDwellRef.current = { key: null, since: 0, fired: false };
    setSpringKey(null);
  };
  useEffect(() => {
    // Rede de segurança: qualquer fim de arrasto (soltou, ou saiu da janela) zera o
    // feedback. dragend NÃO dispara pra arrasto externo, então cobrimos drop + dragleave
    // pras bordas da janela.
    const onDocLeave = (e) => {
      if (
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      )
        clearExtDwell();
    };
    window.addEventListener('drop', clearExtDwell, true);
    window.addEventListener('dragend', clearExtDwell, true);
    document.addEventListener('dragleave', onDocLeave);
    return () => {
      window.removeEventListener('drop', clearExtDwell, true);
      window.removeEventListener('dragend', clearExtDwell, true);
      document.removeEventListener('dragleave', onDocLeave);
    };
  }, []);
  const onExternalRowDragOver = (e, project) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {}
    const key = project.path;
    if (active?.path === key) {
      if (extDwellRef.current.key) clearExtDwell(); // já é o ativo: nada a abrir
      return;
    }
    const d = extDwellRef.current;
    const now = Date.now();
    if (d.key !== key) {
      extDwellRef.current = { key, since: now, fired: false };
      setSpringKey(key);
    } else if (!d.fired && now - d.since >= 600) {
      extDwellRef.current = { key, since: d.since, fired: true };
      setSpringKey(null);
      onOpen?.(project); // troca pro projeto; o usuário solta lá (preview/terminal)
    }
  };

  const onRowDragOver = (e, row) => {
    // Arquivo de fora do app: não é reordenar/mesclar — é o dwell que troca de projeto.
    if (hasExternalFiles(e.dataTransfer)) {
      if (row.kind === 'project' || row.kind === 'child') onExternalRowDragOver(e, row.project);
      else {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'none';
        } catch {}
      }
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragKey = dragKeyOf();
    if (!dragKey || row.key === dragKey) {
      clearTimers();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left,
      cy = e.clientY - r.top;
    const inCenter =
      cx > r.width * 0.28 && cx < r.width * 0.72 && cy > r.height * 0.28 && cy < r.height * 0.72;
    const canMerge =
      !drag?.folderId && (row.kind === 'project' || row.kind === 'folder' || row.kind === 'child');

    // Alvo imediato pro drop (não espera o atraso do visual): centro+mergeável = merge,
    // senão reorder. Assim um drop rápido sempre funciona.
    hoverRef.current = { row, zone: inCenter && canMerge ? 'merge' : 'reorder' };

    // Entrou numa linha nova: NÃO desliza na hora (feel iOS). Agenda o slide (reorder) com
    // um atraso curto; assim dá tempo de pousar no centro pra criar/entrar pasta. Guardamos
    // o próprio `row` no `over` pra o drop usar o alvo rastreado (não o elemento sob o
    // cursor, que o preview ao vivo pode ter trocado pelo item arrastado).
    if (dwellKeyRef.current !== row.key) {
      clearTimers();
      dwellKeyRef.current = row.key;
      reorderRef.current = setTimeout(() => {
        reorderRef.current = null;
        setOver({ key: row.key, zone: 'reorder', row });
      }, 150);
    }

    if (inCenter && canMerge) {
      if (!mergeRef.current) {
        mergeRef.current = setTimeout(() => {
          mergeRef.current = null;
          setOver({ key: row.key, zone: 'merge', row });
        }, 420);
      }
    } else {
      if (mergeRef.current) {
        clearTimeout(mergeRef.current);
        mergeRef.current = null;
      }
      setOver((prev) =>
        prev && prev.key === row.key && prev.zone === 'merge'
          ? { key: row.key, zone: 'reorder', row }
          : prev,
      );
    }
  };

  // Aplica o drop pelo alvo RASTREADO (over.row), não pelo elemento que recebeu o evento:
  // com o preview ao vivo, o item arrastado pode estar sob o cursor (drop nele = no-op),
  // o que travava o arraste pra primeira posição.
  const commitDrop = () => {
    const dragKey = dragKeyOf();
    const hover = hoverRef.current;
    const row = hover?.row;
    if (dragKey && row && row.key !== dragKey) {
      if (drag?.path) {
        onApplyDrop?.({
          dragPath: drag.path,
          targetKind: row.kind,
          targetPath: row.kind === 'project' || row.kind === 'child' ? row.project.path : undefined,
          targetFolderId:
            row.kind === 'folder' ? row.folder.id : row.kind === 'child' ? row.folderId : undefined,
          zone: hover.zone,
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

  // Renomear pasta abre um modal central (nome não cabe no ícone; edição inline era ruim).
  const openFolderRename = (f) => {
    setTip(null);
    setRenamingFolder(f);
  };

  const openMenu = (e, p) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 190);
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
    const el = (
      <button
        draggable
        onDragStart={() => setDrag({ path: p.path })}
        onDragOver={(e) =>
          onRowDragOver(e, {
            key: p.path,
            kind: indented ? 'child' : 'project',
            project: p,
            folderId: p.__folderId,
          })
        }
        onDrop={(e) => {
          e.preventDefault();
          commitDrop();
        }}
        onDragEnd={resetDrag}
        onClick={() => onOpen(p)}
        onDoubleClick={() => openProjectSettings(p)}
        onContextMenu={(e) => openMenu(e, p)}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTip({ name: p.name, x: r.right + 8, y: r.top + r.height / 2 });
        }}
        onMouseLeave={() => setTip(null)}
        className={cn(
          'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border font-bold text-white transition-all hover:-translate-y-0.5 hover:rounded-2xl active:cursor-grabbing',
          active?.path === p.path && 'rounded-2xl ring-2 ring-primary',
          drag?.path === p.path && 'opacity-40',
          isMergeTarget && 'scale-105 ring-2 ring-primary',
          // Dwell do arrasto externo: "segura que eu abro este projeto".
          springKey === p.path &&
            'scale-110 rounded-2xl ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
        style={
          p.icon
            ? { background: 'hsl(var(--secondary))' }
            : { background: p.color || colorFor(p.name) }
        }
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]">
          {p.icon ? (
            <img
              src={p.icon}
              alt={p.name}
              draggable={false}
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span>{initials(p.name)}</span>
          )}
        </span>
        {p.running && (
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
        )}
        {p.remote && (
          <span
            title={t('rail.ssh_' + (p.status || 'idle'))}
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card"
            style={{
              background:
                p.status === 'connected'
                  ? '#16a34a'
                  : p.status === 'connecting'
                    ? '#f59e0b'
                    : p.status === 'error' || p.status === 'disconnected'
                      ? '#ef4444'
                      : '#9ca3af',
            }}
          />
        )}
        {activity[p.path] && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            {activity[p.path] === 'asking' && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            )}
            <span
              title={
                activity[p.path] === 'working'
                  ? t('rail.claude_working')
                  : activity[p.path] === 'asking'
                    ? t('rail.claude_asking')
                    : t('rail.claude_done')
              }
              className={cn(
                'relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-card bg-amber-500',
                activity[p.path] === 'working' && 'animate-pulse',
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
    ) : (
      el
    );
  };

  // Ícone da pasta (fechada ou aberta). Nome vive no tooltip (hover) e no modal de renomear.
  const renderFolder = (row) => {
    const f = row.folder;
    const open = !f.collapsed;
    const isMergeTarget = over?.key === row.key && over?.zone === 'merge';
    const label = f.name || t('rail.folder_default');
    return (
      <button
        draggable
        onDragStart={() => setDrag({ folderId: f.id })}
        onDragOver={(e) => onRowDragOver(e, row)}
        onDrop={(e) => {
          e.preventDefault();
          commitDrop();
        }}
        onDragEnd={resetDrag}
        onClick={() => onToggleFolder?.(f.id)}
        onContextMenu={(e) => openFolderMenu(e, f)}
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTip({ name: label, x: r.right + 8, y: r.top + r.height / 2 });
        }}
        onMouseLeave={() => setTip(null)}
        className={cn(
          'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5 active:cursor-grabbing',
          open && 'ring-2 ring-primary/50',
          drag?.folderId === f.id && 'opacity-40',
          isMergeTarget && 'scale-105 ring-2 ring-primary',
        )}
      >
        <RailFolderIcon
          previews={row.previews}
          count={row.count}
          open={open}
          moreLabel={t('rail.folder_more', { n: row.count - 3 })}
        />
        {open && <ChevronDown className="absolute -bottom-1 h-3 w-3 text-primary" />}
      </button>
    );
  };

  const rows = buildRows(rail, projectByPath || new Map());

  // Preview de reordenação (estilo iOS): enquanto arrasta um projeto e paira sobre um
  // alvo de "reorder", move a linha arrastada pra posição do alvo já no render — os
  // vizinhos abrem espaço na hora porque o motion `layout` anima o deslocamento. É só
  // visual; o drop de verdade continua no onApplyDrop.
  let displayRows = rows;
  if (over && over.zone === 'reorder') {
    if (drag?.path) {
      // Move uma linha de projeto/filho pra posição do alvo.
      const from = rows.findIndex(
        (r) => (r.kind === 'project' || r.kind === 'child') && r.key === drag.path,
      );
      const to = rows.findIndex((r) => r.key === over.key);
      if (from !== -1 && to !== -1 && from !== to) {
        const copy = rows.slice();
        const [moved] = copy.splice(from, 1);
        copy.splice(to > from ? to - 1 : to, 0, moved);
        displayRows = copy;
      }
    } else if (drag?.folderId) {
      // Move a PASTA + seus filhos abertos (bloco) pra posição do alvo, pra os vizinhos
      // abrirem espaço igual acontece com projeto.
      const key = 'folder:' + drag.folderId;
      const start = rows.findIndex((r) => r.key === key);
      if (start !== -1) {
        let end = start + 1;
        while (
          end < rows.length &&
          rows[end].kind === 'child' &&
          rows[end].folderId === drag.folderId
        )
          end++;
        const block = rows.slice(start, end);
        const rest = [...rows.slice(0, start), ...rows.slice(end)];
        const to = rest.findIndex((r) => r.key === over.key);
        if (to !== -1) {
          rest.splice(to, 0, ...block);
          displayRows = rest;
        }
      }
    }
  }

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
        onDrop={(e) => {
          e.preventDefault();
          commitDrop();
        }}
      >
        <AnimatePresence initial={false}>
          {displayRows.map((row) => {
            if (row.kind === 'folder') {
              return (
                <motion.div
                  layout
                  key={row.key}
                  className="basis-full flex justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {renderFolder(row)}
                </motion.div>
              );
            }
            const indented = row.kind === 'child';
            const p = indented ? { ...row.project, __folderId: row.folderId } : row.project;
            // Filho de pasta: "brota" da pasta (escala pequena→grande + sobe), em vez de
            // fade. Com `layout`, os itens de baixo são empurrados enquanto a pasta abre;
            // ao fechar, encolhe de volta pra dentro da pasta.
            const anim = indented
              ? {
                  initial: { opacity: 0, scale: 0.3, y: -18 },
                  animate: { opacity: 1, scale: 1, y: 0 },
                  exit: { opacity: 0, scale: 0.3, y: -18 },
                }
              : {
                  initial: { opacity: 0, scale: 0.6 },
                  animate: { opacity: 1, scale: 1 },
                  exit: { opacity: 0, scale: 0.6 },
                };
            return (
              <motion.div
                layout
                key={row.key}
                className={cn('flex justify-center', indented ? 'basis-full' : 'basis-auto')}
                initial={anim.initial}
                animate={anim.animate}
                exit={anim.exit}
                transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              >
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
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              // Abre pra DIREITA, fora do rail (fixed escapa o overflow-hidden do <nav>);
              // ancora a base do menu na base do botão pra crescer pra cima e não vazar embaixo.
              setAddMenu((cur) =>
                cur ? null : { left: r.right + 8, bottom: window.innerHeight - r.bottom },
              );
            }}
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
            <div className="fixed inset-0 z-40" onClick={() => setAddMenu(null)} />
            <div
              className="fixed z-50 min-w-[170px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
              style={{ left: addMenu.left, bottom: addMenu.bottom }}
            >
              <button
                type="button"
                onClick={() => {
                  setAddMenu(null);
                  onAdd?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('rail.add_menu_project')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMenu(null);
                  onAddFolder?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('rail.add_menu_folder')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMenu(null);
                  onAddRemote?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <Server className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('rail.add_remote')}</span>
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
              {hasPendingUpdate(update) && <span className="size-1.5 rounded-full bg-primary" />}v
              {version}
            </button>
          </div>
        )}
      </div>

      <RailMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onOpenSettings={(p) => {
          setMenu(null);
          openProjectSettings(p);
        }}
        onRestart={(p) => {
          setMenu(null);
          onRestart?.(p);
        }}
        onStop={(p) => {
          setMenu(null);
          onStop?.(p);
        }}
        onRemove={(p) => {
          setMenu(null);
          onRemove(p);
        }}
      />

      <FolderMenu
        menu={folderMenu}
        onClose={() => setFolderMenu(null)}
        onRename={(f) => {
          setFolderMenu(null);
          openFolderRename(f);
        }}
        onDissolve={(f) => {
          setFolderMenu(null);
          onDissolveFolder?.(f.id);
        }}
      />

      {/* Tooltip do nome da pasta (o nome não cabe no ícone). Fixed → escapa o overflow. */}
      {tip && (
        <div
          className="pointer-events-none fixed z-[60] max-w-[240px] -translate-y-1/2 truncate rounded-md border bg-popover px-2 py-1 text-[12px] font-medium text-popover-foreground shadow-md"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.name}
        </div>
      )}

      <FolderRenameModal
        folder={renamingFolder}
        onClose={() => setRenamingFolder(null)}
        onRename={(id, name) => onRenameFolder?.(id, name)}
      />

      <ProjectSettingsModal
        project={settingsProject}
        onClose={() => setSettingsPath(null)}
        onRename={onRename}
        onSetColor={onSetColor}
        onSetIcon={onSetIcon}
        onResetCustom={onResetCustom}
      />
    </nav>
  );
}

// Menu de contexto de projeto: abre as Configurações (nome/cor/imagem vivem no
// ProjectSettingsModal) + ações de servidor e remover.
function RailMenu({ menu, onClose, onOpenSettings, onRestart, onStop, onRemove }) {
  const t = useT();
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
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
      <button
        type="button"
        onClick={() => onOpenSettings(p)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <Settings2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_settings')}</span>
      </button>

      <div className="my-1 border-t" />

      <button
        type="button"
        onClick={() => onRestart(p)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {p.running ? t('rail.menu_restart_running') : t('rail.menu_start_running')}
        </span>
      </button>
      {p.running && (
        <button
          type="button"
          onClick={() => onStop(p)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
        >
          <Square className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('rail.menu_stop_server')}</span>
        </button>
      )}
      <div className="my-1 border-t" />
      <button
        type="button"
        onClick={() => onRemove(p)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-muted"
      >
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
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
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
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        onClick={() => onRename(f)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_folder_rename')}</span>
      </button>
      <button
        type="button"
        onClick={() => onDissolve(f)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <Undo2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_folder_dissolve')}</span>
      </button>
    </div>
  );
}

// Modal central de renomear pasta (o nome não cabe no ícone; edição inline era ruim).
// Enter/Salvar confirma; Esc/clique fora/Cancelar fecha sem salvar.
function FolderRenameModal({ folder, onClose, onRename }) {
  const t = useT();
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (folder) setName(folder.name || '');
  }, [folder?.id]);
  useEffect(() => {
    if (!folder) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(id);
    };
  }, [folder, onClose]);
  if (!folder) return null;
  const save = () => {
    onRename(folder.id, name.trim());
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40"
      onMouseDown={onClose}
    >
      <div
        className="w-[320px] max-w-[90vw] rounded-xl border bg-background p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FolderIcon className="h-4 w-4 text-primary" />
          {t('rail.menu_folder_rename')}
        </div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder={t('rail.folder_default')}
          maxLength={64}
          className="mb-4 w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
          >
            {t('rail.rename_cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            {t('rail.rename_save')}
          </button>
        </div>
      </div>
    </div>
  );
}
