import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, RotateCcw, Square, GripHorizontal } from 'lucide-react';
import { SettingsIcon } from './ui/settings.jsx';
import { SearchIcon } from './ui/search.jsx';
import { colorFor, initials } from '@/lib/projectColor';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { hasPendingUpdate } from '@/lib/updateView';

export function Rail({ projects, active, activity = {}, onOpen, onAdd, onRemove, onRestart, onStop, onReorder, onOpenSettings, onSearch, onRailGrab, width = 64, version = '', update, onOpenAbout }) {
  const t = useT();
  const [menu, setMenu] = useState(null);         // { x, y, project }
  const [dragPath, setDragPath] = useState(null); // path do item sendo arrastado
  const [overPath, setOverPath] = useState(null); // path do item sob o cursor

  const openMenu = (e, p) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 140);
    setMenu({ x, y, project: p });
  };

  const resetDrag = () => { setDragPath(null); setOverPath(null); };

  // Ordem exibida durante o arraste: o item arrastado já ocupa o lugar do alvo,
  // empurrando os demais (estilo Kanban). O que se vê é o que será salvo.
  let display = projects;
  if (dragPath && overPath && dragPath !== overPath) {
    const from = projects.findIndex((p) => p.path === dragPath);
    const to = projects.findIndex((p) => p.path === overPath);
    if (from !== -1 && to !== -1) {
      display = [...projects];
      const [moved] = display.splice(from, 1);
      display.splice(to, 0, moved);
    }
  }

  // Persiste a ordem previsualizada quando o item é solto.
  const commitDrop = () => {
    if (dragPath && overPath && dragPath !== overPath) onReorder?.(display.map((p) => p.path));
    resetDrag();
  };

  return (
    <nav style={{ width }} className="no-scrollbar flex shrink-0 flex-col overflow-y-auto border-r bg-card py-3">
      {/* Busca no topo: a "bolinha" que abre a paleta de comandos (Ctrl+K) — projetos,
          arquivos e ações. Fica acima dos projetos pra a pessoa saber que existe. */}
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
      <div
        className="flex flex-1 flex-wrap content-start justify-center gap-2.5 px-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); commitDrop(); }}
      >
        {display.map((p) => (
          <button
            key={p.path}
            draggable
            onDragStart={(e) => { setDragPath(p.path); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (p.path !== dragPath && p.path !== overPath) setOverPath(p.path);
            }}
            onDragEnd={resetDrag}
            onDrop={(e) => { e.preventDefault(); commitDrop(); }}
            onClick={() => onOpen(p)}
            onContextMenu={(e) => openMenu(e, p)}
            title={p.name}
            className={cn(
              'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border font-bold text-white transition-all hover:-translate-y-0.5 hover:rounded-2xl active:cursor-grabbing',
              active?.path === p.path && 'rounded-2xl ring-2 ring-primary',
              dragPath === p.path && 'opacity-40'
            )}
            style={p.icon ? { background: 'hsl(var(--secondary))' } : { background: colorFor(p.name) }}
          >
            {/* Recorte do ícone nos cantos arredondados fica neste wrapper interno,
                para que a bolinha de status (abaixo) não seja cortada pelo overflow. */}
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
            {/* Atividade do Claude (canto superior, separado do verde de "preview rodando"),
                agregada por projeto: âmbar pulsando = trabalhando; âmbar com halo = pediu
                uma confirmação; âmbar fixo = terminou e você ainda não viu. O badge some ao
                focar o projeto; o detalhe por sessão aparece na aba (ver ChatPanel). */}
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
        ))}
        <button
          onClick={onAdd}
          title={t('rail.add_project_tooltip')}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-dashed text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Engrenagem fixa no fim do rail: abre as configurações. */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onOpenSettings}
          title={t('rail.settings_tooltip')}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* Versão do app: spot pequeno e sempre visível. Clica → abre Configurações > Sobre. */}
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

      <RailMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onRestart={(p) => { setMenu(null); onRestart?.(p); }}
        onStop={(p) => { setMenu(null); onStop?.(p); }}
        onRemove={(p) => { setMenu(null); onRemove(p); }}
      />
    </nav>
  );
}

// Menu de contexto do rail (botão direito) — no mesmo padrão da árvore de arquivos.
function RailMenu({ menu, onClose, onRestart, onStop, onRemove }) {
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
  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
      style={{ left: menu.x, top: menu.y }}
    >
      {/* Servidor de preview: reiniciar (sobe se estiver parado) e parar — sem precisar
          abrir o projeto. "Parar" só aparece quando há servidor rodando. */}
      <button
        type="button"
        onClick={() => onRestart(menu.project)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{menu.project.running ? t('rail.menu_restart_running') : t('rail.menu_start_running')}</span>
      </button>
      {menu.project.running && (
        <button
          type="button"
          onClick={() => onStop(menu.project)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
        >
          <Square className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('rail.menu_stop_server')}</span>
        </button>
      )}
      <div className="my-1 border-t" />
      <button
        type="button"
        onClick={() => onRemove(menu.project)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-muted"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t('rail.menu_remove_project')}</span>
      </button>
    </div>
  );
}
