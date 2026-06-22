import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RefreshCCWIcon } from './components/ui/refresh-ccw.jsx';
import { XIcon } from './components/ui/x.jsx';
import { Rail } from './components/Rail.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { PreviewPanel } from './components/PreviewPanel.jsx';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable.jsx';
import { Button } from './components/ui/button.jsx';
import { ResizeBar } from './components/ui/resize-bar.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Toaster } from './components/ui/toaster.jsx';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
  // Atividade do Claude por projeto: 'working' (pulsa) | 'attention' (terminou, você não viu).
  const [activity, setActivity] = useState({});
  // Refs pra ler valor atual dentro de listeners de longa duração (sem stale closure).
  const activeRef = useRef(null);
  const projectsRef = useRef([]);
  const [pendingRemove, setPendingRemove] = useState(null); // projeto aguardando confirmação
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(() => Number(localStorage.getItem('railWidth')) || 64);
  const [railResizing, setRailResizing] = useState(false);
  // Coluna do chat: recolhe pra ganhar espaço no preview. O react-resizable-panels
  // lembra a largura anterior, então expand() restaura o tamanho que estava antes.
  const chatPanelRef = useRef(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const toggleChat = () => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };
  // Controles do servidor (parar/reiniciar) vivem no PreviewPanel, mas os botões
  // ficam no cabeçalho do título (outra coluna). O PreviewPanel publica as ações
  // neste ref e reporta o `mode` pra habilitar/desabilitar os botões.
  const previewControls = useRef(null);
  const [serverMode, setServerMode] = useState('empty');
  // O ícone animado (RefreshCCWIcon) só dispara no hover do svg pequeno. Como o
  // botão "Reiniciar" é largo (ícone + texto), guiamos a animação pelo hover do
  // botão inteiro via a API controlada (startAnimation/stopAnimation) do ícone.
  const restartIcon = useRef(null);
  const stopIcon = useRef(null);

  const startRailResize = (e) => {
    e.preventDefault();
    setRailResizing(true);
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => setRailWidth(Math.max(56, Math.min(ev.clientX, 280)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setRailResizing(false);
      setRailWidth((w) => { localStorage.setItem('railWidth', String(Math.round(w))); return w; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const reload = useCallback(async () => {
    setProjects(await window.api.listProjects());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Ctrl +/-/0 dão zoom na JANELA do app (rail, chat, abas…). O listener só dispara
  // quando o foco está no app: se estiver DENTRO do preview (webview), o keydown vai
  // pro site e o atalho ali zooma a página (tratado no main). A borda em volta do
  // preview avisa onde o foco está. Persiste o nível pra sobreviver ao reload.
  useEffect(() => {
    const saved = Number(localStorage.getItem('appZoom'));
    if (saved) window.api.setZoom(saved);
    const onKey = (e) => {
      if ((!e.ctrlKey && !e.metaKey) || e.altKey) return;
      const dir =
        e.key === '=' || e.key === '+' ? 'in' :
        e.key === '-' || e.key === '_' ? 'out' :
        e.key === '0' ? 'reset' : null;
      if (!dir) return;
      e.preventDefault();
      localStorage.setItem('appZoom', String(window.api.zoom(dir)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addProjects = async () => { await window.api.addProjects(); reload(); };

  // Reordena (drag-and-drop): atualiza na hora e salva a ordem no config.json.
  const reorderProjects = async (orderedPaths) => {
    setProjects((cur) => {
      const byPath = new Map(cur.map((p) => [p.path, p]));
      return orderedPaths.map((p) => byPath.get(p)).filter(Boolean);
    });
    await window.api.reorderProjects(orderedPaths);
  };

  const confirmRemove = async () => {
    const p = pendingRemove;
    setPendingRemove(null);
    if (!p) return;
    await window.api.removeProject(p.path);
    setActive((cur) => (cur?.path === p.path ? null : cur));
    reload();
  };

  return (
    <div className="relative flex h-screen bg-background text-foreground">
      <Rail
        projects={projects}
        active={active}
        onOpen={setActive}
        onAdd={addProjects}
        onRemove={setPendingRemove}
        onReorder={reorderProjects}
        onOpenSettings={() => setSettingsOpen(true)}
        width={railWidth}
      />
      <ResizeBar onMouseDown={startRailResize} />
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel
          ref={chatPanelRef}
          id="chat"
          order={1}
          defaultSize={34}
          minSize={22}
          collapsible
          collapsedSize={0}
          onCollapse={() => setChatCollapsed(true)}
          onExpand={() => setChatCollapsed(false)}
          className="flex flex-col border-r"
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
            <span className="truncate text-[15px] font-semibold">
              {active ? active.name : 'Selecione um projeto'}
            </span>
            {active?.hasPkg && (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => previewControls.current?.restart?.()}
                  onMouseEnter={() => restartIcon.current?.startAnimation?.()}
                  onMouseLeave={() => restartIcon.current?.stopAnimation?.()}
                  title="Reiniciar servidor"
                  className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground [&_svg]:size-[15px]"
                >
                  <RefreshCCWIcon ref={restartIcon} />Reiniciar
                </button>
                <button
                  type="button"
                  onClick={() => previewControls.current?.stop?.()}
                  onMouseEnter={() => stopIcon.current?.startAnimation?.()}
                  onMouseLeave={() => stopIcon.current?.stopAnimation?.()}
                  disabled={serverMode !== 'web'}
                  title="Parar servidor"
                  className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]"
                >
                  <XIcon ref={stopIcon} />Parar
                </button>
              </div>
            )}
          </div>
          <ErrorBoundary label="Chat">
            <ChatPanel activeProject={active?.path || null} />
          </ErrorBoundary>
        </ResizablePanel>
        <ResizableHandle withHandle>
          {/* Botão de recolher: fica no topo da "slide" (divisor). Some quando já
              está recolhido — aí quem reabre é a bolinha colada no rail. */}
          {!chatCollapsed && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleChat}
              title="Recolher chat"
              className="absolute left-1/2 top-1/3 z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </ResizableHandle>
        <ResizablePanel id="preview" order={2} minSize={28} className="flex flex-col">
          <ErrorBoundary label="Preview">
            <PreviewPanel active={active} onProjectsChanged={reload} controlsRef={previewControls} onModeChange={setServerMode} />
          </ErrorBoundary>
        </ResizablePanel>
      </ResizablePanelGroup>

      {pendingRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={() => setPendingRemove(null)}
        >
          <div
            className="w-[340px] rounded-lg border bg-background p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">Remover projeto</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Remover <span className="font-medium text-foreground">{pendingRemove.name}</span> da lista?
              <br />O projeto no disco NÃO é apagado.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingRemove(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={confirmRemove}>Remover</Button>
            </div>
          </div>
        </div>
      )}

      {/* Bolinha de reabrir: cola na borda direita do rail (seletor de projetos).
          Só aparece com o chat recolhido; expand() volta à largura anterior. */}
      {chatCollapsed && (
        <button
          type="button"
          onClick={() => chatPanelRef.current?.expand()}
          style={{ left: railWidth - 14 }}
          title="Expandir chat"
          className="absolute top-1/3 z-40 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {railResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      <Toaster />
    </div>
  );
}
