import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SettingsIcon } from './ui/settings.jsx';
import { cn } from '@/lib/utils';

function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export function Rail({ projects, active, activity = {}, onOpen, onAdd, onRemove, onReorder, onOpenSettings, width = 64 }) {
  const [menu, setMenu] = useState(null);         // { x, y, project }
  const [dragPath, setDragPath] = useState(null); // path do item sendo arrastado
  const [overPath, setOverPath] = useState(null); // path do item sob o cursor

  const openMenu = (e, p) => {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 80);
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
                <span>{p.name.slice(0, 2).toUpperCase()}</span>
              )}
            </span>
            {p.running && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
            )}
            {/* Atividade do Claude (canto superior, separado do verde de "preview rodando"):
                âmbar pulsando = trabalhando; âmbar fixo = terminou e você ainda não viu. */}
            {activity[p.path] && (
              <span
                title={activity[p.path] === 'working' ? 'Claude trabalhando…' : 'Claude terminou'}
                className={cn(
                  'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-amber-500',
                  activity[p.path] === 'working' && 'animate-pulse'
                )}
              />
            )}
          </button>
        ))}
        <button
          onClick={onAdd}
          title="Adicionar projeto(s) — pode escolher várias pastas"
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-dashed text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Engrenagem fixa no fim do rail: abre as configurações. */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onOpenSettings}
          title="Configurações"
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      <RailMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onRemove={(p) => { setMenu(null); onRemove(p); }}
      />
    </nav>
  );
}

// Menu de contexto do rail (botão direito) — no mesmo padrão da árvore de arquivos.
function RailMenu({ menu, onClose, onRemove }) {
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
      <button
        type="button"
        onClick={() => onRemove(menu.project)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-red-600 hover:bg-muted"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Remover da lista</span>
      </button>
    </div>
  );
}
