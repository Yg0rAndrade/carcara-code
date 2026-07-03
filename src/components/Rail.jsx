import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, RotateCcw, Square, GripHorizontal, Settings2 } from 'lucide-react';
import { SettingsIcon } from './ui/settings.jsx';
import { SearchIcon } from './ui/search.jsx';
import { ProjectSettingsModal } from './ProjectSettingsModal.jsx';
import { colorFor, initials } from '@/lib/projectColor';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { hasPendingUpdate } from '@/lib/updateView';

export function Rail({ projects, active, activity = {}, onOpen, onAdd, onRemove, onRestart, onStop, onReorder, onRename, onSetColor, onSetIcon, onResetCustom, onOpenSettings, onSearch, onRailGrab, width = 64, version = '', update, onOpenAbout }) {
  const t = useT();
  const [menu, setMenu] = useState(null);         // { x, y, project }
  const [dragPath, setDragPath] = useState(null); // path do item sendo arrastado
  const [overPath, setOverPath] = useState(null); // path do item sob o cursor
  // Personalização (nome/cor/imagem) vive num modal central. Guardamos só o PATH do
  // projeto aberto e derivamos o objeto vivo da lista, pra o preview refletir na hora
  // as mudanças de cor/imagem que já persistiram.
  const [settingsPath, setSettingsPath] = useState(null);
  const settingsProject = settingsPath ? projects.find((p) => p.path === settingsPath) || null : null;
  const openProjectSettings = (p) => setSettingsPath(p.path);

  const openMenu = (e, p) => {
    e.preventDefault();
    // Posição bruta do cursor; o RailMenu mede o próprio tamanho e ajusta pra caber 100%.
    setMenu({ x: e.clientX, y: e.clientY, project: p });
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
    <nav style={{ width }} className="flex shrink-0 flex-col overflow-hidden border-r bg-card py-3">
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
      {/* Única área rolável do rail: a lista de projetos. O topo (busca/grip) e o
          rodapé (adicionar/configurações) ficam fixos, sempre acessíveis. */}
      <div
        className="no-scrollbar flex min-h-0 flex-1 flex-wrap content-start justify-center gap-2.5 overflow-y-auto px-2"
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
            onDoubleClick={() => openProjectSettings(p)}
            onContextMenu={(e) => openMenu(e, p)}
            title={p.name}
            className={cn(
              'relative flex h-[42px] w-[42px] cursor-grab items-center justify-center rounded-xl border font-bold text-white transition-all hover:-translate-y-0.5 hover:rounded-2xl active:cursor-grabbing',
              active?.path === p.path && 'rounded-2xl ring-2 ring-primary',
              dragPath === p.path && 'opacity-40'
            )}
            style={p.icon ? { background: 'hsl(var(--secondary))' } : { background: p.color || colorFor(p.name) }}
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
      </div>

      {/* Rodapé fixo (card): adicionar projeto + configurações sempre acessíveis,
          mesmo com a lista rolada pro fim. */}
      <div className="shrink-0 px-2 pt-2">
        <div className="flex flex-col items-center gap-1.5 py-2">
          <button
            onClick={onAdd}
            title={t('rail.add_project_tooltip')}
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
      </div>

      <RailMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onOpenSettings={(p) => { setMenu(null); openProjectSettings(p); }}
        onRestart={(p) => { setMenu(null); onRestart?.(p); }}
        onStop={(p) => { setMenu(null); onStop?.(p); }}
        onRemove={(p) => { setMenu(null); onRemove(p); }}
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

// Menu de contexto do rail (botão direito) — enxuto: abre o modal de configurações do
// projeto, controla o servidor de preview e remove o projeto da lista. Toda a
// personalização (nome, cor, imagem) mora no ProjectSettingsModal.
function RailMenu({ menu, onClose, onOpenSettings, onRestart, onStop, onRemove }) {
  const t = useT();
  const ref = useRef(null);
  // Posição ajustada pra o menu caber 100% na tela mesmo aberto perto da borda.
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });
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
  // Mede o menu já montado e recua das bordas direita/inferior se estourar. Roda antes
  // do paint (useLayoutEffect) pra nunca piscar na posição errada; fica invisível até medir.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const pad = 8;
    const { width, height } = ref.current.getBoundingClientRect();
    const left = Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(menu.y, window.innerHeight - height - pad));
    setPos({ left, top, ready: true });
  }, [menu]);
  if (!menu) return null;
  const p = menu.project;
  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-background py-1 shadow-md"
      style={{ left: pos.ready ? pos.left : menu.x, top: pos.ready ? pos.top : menu.y, visibility: pos.ready ? 'visible' : 'hidden' }}
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

      {/* Servidor de preview: reiniciar (sobe se estiver parado) e parar — sem precisar
          abrir o projeto. "Parar" só aparece quando há servidor rodando. */}
      <button
        type="button"
        onClick={() => onRestart(p)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{p.running ? t('rail.menu_restart_running') : t('rail.menu_start_running')}</span>
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
