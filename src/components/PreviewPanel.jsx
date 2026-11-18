import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  Terminal,
  X,
  Copy,
  Bug,
  Loader2,
  Crosshair,
  Camera,
  Crop,
  ExternalLink,
  Monitor,
  Plus,
  Globe,
  ListTodo,
  SquareKanbanIcon,
} from 'lucide-react';
// Ícones animados (lucide-animated): animam no hover. Só os que têm versão no
// registry; Crosshair/Bug seguem estáticos (não há equivalente animado).
import { EarthIcon } from './ui/earth.jsx';
import { ChevronsLeftRightIcon } from './ui/chevrons-left-right.jsx';
import { GitBranchIcon } from './ui/git-branch.jsx';
import { ChevronDownIcon } from './ui/chevron-down.jsx';
import { ZapIcon } from './ui/zap.jsx';
import { PlugZapIcon } from './ui/plug-zap.jsx';
import { PenToolIcon } from './ui/pen-tool.jsx';
import { ArrowLeftIcon } from './ui/arrow-left.jsx';
import { ArrowRightIcon } from './ui/arrow-right.jsx';
import { RotateCWIcon } from './ui/rotate-cw.jsx';
import { ClockIcon } from './ui/clock.jsx';
import { TerminalIcon } from './ui/terminal.jsx';
import { HoverIcon } from './ui/hover-icon.jsx';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.jsx';
import { Input } from './ui/input.jsx';
import { Button } from './ui/button.jsx';
import { ToolButton } from './ui/tool-button.jsx';
import { useLanShare, PhoneShareButton, PhoneShareCard } from './PhoneShare.jsx';
import { DevicePicker, DeviceSwitcher } from './ui/device-picker.jsx';
import { ResizeBar } from './ui/resize-bar.jsx';
import { DragHandle } from './ui/drag-handle.jsx';
import { EmptyState } from './ui/empty-state.jsx';
import { ScaffoldWizard } from './ScaffoldWizard.jsx';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { FindBar } from './FindBar.jsx';
import { INJECT, CLEANUP, GRAB_SENTINEL, GRAB_CANCEL } from '@/lib/grabScript';
import { NO_HOVER_INJECT, NO_HOVER_CLEANUP } from '@/lib/noHoverScript';
import { normalizeViewport, resolveDevice, clampCustom, fitDevice } from '@/lib/devices';
import { DeviceFrame } from './ui/device-frame.jsx';
import { PAGE_CHROME_SCRIPT } from '@/lib/pageChrome';
import { createSurface, createViewSurface, normalizeEngine } from '@/lib/previewSurface';
import { watchOcclusion } from '@/lib/previewOcclusion';
import { decideAutoStart } from '@/lib/previewAutoStart';
import {
  cropInject,
  cropToCapture,
  CROP_CLEANUP,
  CROP_SENTINEL,
  CROP_CANCEL,
} from '@/lib/cropScript';
import { hasExternalFiles } from '@/lib/dragPaths.js';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';

// Faz os botões laterais do mouse (voltar/avançar) funcionarem dentro do preview.
// O Electron não identifica esses botões no input-event do main (button=undefined),
// mas no DOM da página eles vêm certos (button 3 = voltar, 4 = avançar) — igual a
// qualquer site de teste de mouse. Injetado a cada navegação (dom-ready).
const NAV_INJECT = `(function(){
  if (window.__carcaraNav) return; window.__carcaraNav = true;
  function h(e){
    if (e.button === 3 || e.button === 4){
      e.preventDefault();
      if (e.type === 'mouseup'){ if (e.button === 3) history.back(); else history.forward(); }
    }
  }
  ['mousedown','mouseup','auxclick'].forEach(function(t){ window.addEventListener(t, h, true); });
})();`;

// Painéis pesados carregados sob demanda (code-splitting). CodeView arrasta todo o
// CodeMirror + 16 linguagens; ShellView arrasta o xterm; cada um vira um chunk
// separado que só baixa quando a aba/terminal correspondente é aberta — fora do
// bundle inicial, então o boot fica bem mais leve.
const CodeView = lazy(() => import('./CodeView.jsx').then((m) => ({ default: m.CodeView })));
const GitPanel = lazy(() => import('./GitPanel.jsx').then((m) => ({ default: m.GitPanel })));
const ApiPanel = lazy(() => import('./ApiPanel.jsx').then((m) => ({ default: m.ApiPanel })));
const ShellView = lazy(() => import('./ShellView.jsx').then((m) => ({ default: m.ShellView })));
const MCPPanel = lazy(() => import('./MCPPanel.jsx').then((m) => ({ default: m.MCPPanel })));
const TldrawPanel = lazy(() =>
  import('./TldrawPanel.jsx').then((m) => ({ default: m.TldrawPanel })),
);
const CheckpointsPanel = lazy(() =>
  import('./CheckpointsPanel.jsx').then((m) => ({ default: m.CheckpointsPanel })),
);
const TodosPanel = lazy(() => import('./TodosPanel.jsx').then((m) => ({ default: m.TodosPanel })));
// Sai do bundle inicial junto com os outros: arrasta o dnd-kit e o mdast atrás de si.
const KanbanPanel = lazy(() =>
  import('./KanbanPanel.jsx').then((m) => ({ default: m.KanbanPanel })),
);
// Anotador do print (Fabric.js): code-split — só carrega quando há uma captura pra marcar.
const AnnotatorModal = lazy(() => import('./AnnotatorModal.jsx'));
// Escolha da porta do túnel SSH — só existe em projeto remoto, então fica fora do bundle.
const RemotePreviewStart = lazy(() =>
  import('./RemotePreviewStart.jsx').then((m) => ({ default: m.RemotePreviewStart })),
);

// Fallback enquanto o chunk do painel carrega (costuma ser instantâneo no disco).
function PanelFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

// Painel lazy isolado: o ErrorBoundary segura um crash de render OU um chunk que falhou
// ao carregar (import() rejeitado) e mostra o card de erro só nesta área — a barra de abas
// e o resto do app seguem vivos. Recuperação: o botão "Tentar novamente" do card, ou sair
// e voltar pra aba (o painel é condicional, então remonta limpo sozinho).
function LazyPanel({ label, children }) {
  return (
    <ErrorBoundary label={label}>
      <Suspense fallback={<PanelFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// Menu "Ferramentas" (seta ˅) com as abas menos usadas (API, MCP), pra enxugar a barra.
function MoreTools({ view, onPick }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const TOOLS = [
    { value: 'kanban', label: t('preview.kanban'), Icon: SquareKanbanIcon },
    { value: 'todos', label: t('preview.todos'), Icon: ListTodo },
    { value: 'history', label: t('preview.history'), Icon: ClockIcon },
    { value: 'api', label: t('preview.api'), Icon: ZapIcon },
    { value: 'mcp', label: t('preview.mcp'), Icon: PlugZapIcon },
    { value: 'board', label: t('preview.board'), Icon: PenToolIcon },
  ];
  const active = TOOLS.find((tool) => tool.value === view);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('preview.more_tools')}
        className={cn(
          'flex h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors [&_svg]:size-[15px]',
          active
            ? 'text-primary-ink'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {active && <HoverIcon as={active.Icon} />}
        <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 min-w-[150px] overflow-hidden rounded-md border bg-popover py-1 shadow-md">
          {TOOLS.map((tool) => (
            <button
              key={tool.value}
              type="button"
              onClick={() => {
                onPick(tool.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-4',
                view === tool.value && 'font-medium text-primary-ink',
              )}
            >
              <HoverIcon as={tool.Icon} />
              {tool.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Rótulo curto de uma aba: título da página → senão o caminho da URL → senão host.
function tabLabel(tab, fallback) {
  if (tab.title) return tab.title;
  const raw = tab.url || tab.src || '';
  try {
    const u = new URL(raw);
    return u.pathname && u.pathname !== '/' ? u.pathname : u.host;
  } catch {
    return raw || fallback;
  }
}

// Uma "aba" no estilo VS Code / Claude Code: encostada na vizinha, com uma listrinha
// da cor da brasa em cima da ATIVA e o fundo dela igual ao do conteúdo (pra "saltar").
// Clique = ativa; botão do meio ou ✕ = fecha.
function TabChip({ label, favicon, active, onSelect, onClose, closeTitle }) {
  // Favicon da página na aba; cai no globo se não houver ou se a imagem quebrar.
  const [favBroken, setFavBroken] = useState(false);
  useEffect(() => setFavBroken(false), [favicon]);
  const showFav = favicon && !favBroken;
  return (
    <div
      onClick={onSelect}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      title={label}
      className={cn(
        'group relative flex h-9 min-w-0 max-w-[210px] shrink-0 cursor-default select-none items-center gap-1.5 border-r border-border/60 pl-3 pr-1.5 text-[12.5px] transition-colors',
        active
          ? 'bg-background text-foreground'
          : 'bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {/* Listrinha em cima = qual aba está selecionada (só na ativa). */}
      {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
      {showFav ? (
        <img
          src={favicon}
          alt=""
          className="size-3.5 shrink-0 rounded-[2px] object-contain"
          onError={() => setFavBroken(true)}
        />
      ) : (
        <Globe className={cn('size-3.5 shrink-0', active ? 'text-primary-ink' : 'opacity-50')} />
      )}
      <span className={cn('min-w-0 flex-1 truncate', active && 'font-medium')}>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={closeTitle}
        className={cn(
          'grid size-5 shrink-0 place-items-center rounded transition-opacity hover:bg-accent [&_svg]:size-3.5',
          active
            ? 'opacity-70 hover:opacity-100'
            : 'opacity-0 group-hover:opacity-70 hover:opacity-100',
        )}
      >
        <X />
      </button>
    </div>
  );
}

// Botão de recarregar da barra de URL. O estado "Ctrl pressionado" (que pinta a
// setinha de laranja pra anunciar o hard reload) mora AQUI, e não no PreviewPanel:
// lá em cima, cada toque no Ctrl re-renderizava o painel inteiro — incluindo o
// preview de markdown da aba Código, que perdia a seleção de texto e deixava o
// Ctrl+C sem nada pra copiar. Isolado, o Ctrl só repinta este botão.
function ReloadButton({ onClick, disabled }) {
  const t = useT();
  const [ctrlHeld, setCtrlHeld] = useState(false);
  // blur limpa o estado pra não travar "preso" laranja se a pessoa alt-tabar
  // segurando a tecla.
  useEffect(() => {
    const onDown = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true);
    };
    const onUp = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false);
    };
    const onBlur = () => setCtrlHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={ctrlHeld ? t('preview.reload_hard') : t('preview.reload')}
      className={cn(
        'absolute left-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[14px]',
        ctrlHeld ? 'text-primary-ink' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <RotateCWIcon />
    </button>
  );
}

// Menu da câmera (mesmo padrão do DevicePicker): clicar abre "Selecionar área" / "Tela toda".
function ShotPicker({ onArea, onFull, active, disabled }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  const OPTS = [
    { key: 'area', label: t('preview.shot_area'), Icon: Crop, run: onArea, keys: ['Ctrl', 'P'] },
    {
      key: 'full',
      label: t('preview.shot_full'),
      Icon: Monitor,
      run: onFull,
      keys: ['Ctrl', 'Shift', 'P'],
    },
  ];
  return (
    <div ref={ref} className="relative">
      <ToolButton
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        active={open || active}
        title={t('preview.screenshot')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Camera />
      </ToolButton>
      {open && (
        <div className="absolute right-0 top-9 z-50 min-w-[220px] overflow-hidden rounded-md border bg-popover py-1 shadow-md">
          {OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => {
                setOpen(false);
                o.run();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted [&_svg]:size-4"
            >
              <o.Icon />
              <span>{o.label}</span>
              <span className="ml-auto flex items-center gap-0.5 text-muted-foreground">
                {o.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border bg-muted px-1 font-mono text-[10px] leading-normal"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Sessão isolada por projeto. Sem isso, todos os previews dividem a sessão padrão
// do Electron (mesmo cache, localStorage e SERVICE WORKER). Um SW registrado por
// um site (ex.: localhost:8080) passa a interceptar e servir aquele site pra
// qualquer outro projeto que rode na mesma porta/origem — inclusive depois de
// fechar e reabrir, porque fica gravado em disco. Uma partition única por projeto
// dá cache/SW/storage próprios, isolando de verdade. Hash simples do caminho.
function partitionFor(projectPath) {
  let h = 0;
  for (let i = 0; i < projectPath.length; i++) h = (h * 31 + projectPath.charCodeAt(i)) | 0;
  return 'persist:preview-' + (h >>> 0).toString(36);
}

export function PreviewPanel({
  active,
  chatSession,
  onProjectsChanged,
  controlsRef,
  onTerminalChange,
  onModeChange,
  onNewChatSession,
}) {
  const t = useT();
  const [view, setView] = useState('preview');
  const [openRequest, setOpenRequest] = useState(null); // { path, name, seq } — abrir arquivo na aba Código (paleta)
  const openSeqRef = useRef(0);
  const [mode, setMode] = useState('empty'); // empty | log | web
  const [scaffoldProbe, setScaffoldProbe] = useState(null); // { scaffoldable, junk } | null
  const [url, setUrl] = useState('');
  const [termOpen, setTermOpen] = useState(false);
  const [termHeight, setTermHeight] = useState(300);
  const [copied, setCopied] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [devtoolsWidth, setDevtoolsWidth] = useState(
    () => Number(localStorage.getItem('devtoolsWidth')) || 520,
  );
  const [dtDragging, setDtDragging] = useState(false);
  const [termDragging, setTermDragging] = useState(false);
  const [grabbing, setGrabbing] = useState(false); // modo "selecionar elemento" ativo
  const [findOpen, setFindOpen] = useState(false); // barra "buscar na página" (Ctrl+F)
  const [findNonce, setFindNonce] = useState(0); // bump a cada Ctrl+F: re-foca o input da busca
  const [shooting, setShooting] = useState(false); // modo "print do preview" ativo
  const [shot, setShot] = useState(null); // dataURL da captura crua → abre o anotador
  const shotRef = useRef(shot); // leitura síncrona dentro do listener de F5/hard-reload (deps [])
  shotRef.current = shot;
  // Motor das abas: 'view' (WebContentsView, padrão) ou 'webview' (reserva, via
  // `"previewEngine": "webview"` no config.json). Lido uma vez; abas já abertas não mudam.
  const engineRef = useRef('view');
  useEffect(() => {
    let alive = true;
    window.api
      .getConfig?.()
      .then((cfg) => {
        if (alive) engineRef.current = normalizeEngine(cfg && cfg.previewEngine);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // Motor 'view': quando algo do app cobre o preview (menu, modal, arraste), a view some e
  // fica esta foto no lugar (ver src/lib/previewOcclusion.js). { src, rect } | null.
  const [freeze, setFreeze] = useState(null);
  const [occluded, setOccluded] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const [canBack, setCanBack] = useState(false); // navegação do preview (voltar/avançar)
  const [canFwd, setCanFwd] = useState(false);
  const [webFocused, setWebFocused] = useState(false); // foco está DENTRO do site do projeto ativo
  const [viewport, setViewport] = useState(() =>
    normalizeViewport(localStorage.getItem('previewViewport')),
  ); // 'desktop' | id de aparelho (src/lib/devices.js) | 'custom'
  // Tamanho do "Personalizado" (largura × altura digitadas no seletor).
  const [customSize, setCustomSize] = useState(() => {
    try {
      return clampCustom(JSON.parse(localStorage.getItem('previewCustomSize') || 'null'));
    } catch {
      return clampCustom(null);
    }
  });
  const customRef = useRef(customSize);
  customRef.current = customSize;
  // Tamanho do painel do preview: a moldura do aparelho encolhe pra caber nele.
  const [stageBox, setStageBox] = useState(null);
  const [viewportPicks, setViewportPicks] = useState(0); // cliques no seletor (dispara o reload)
  const viewportRef = useRef(viewport); // leitura síncrona dentro do createTab (deps [])
  viewportRef.current = viewport;
  // "Olhando um site de verdade": aba Preview + servidor no ar. TODO recurso que age sobre
  // o site já exige isto (foco, busca, grabber, print — ver os efeitos mais abaixo).
  const inWeb = view === 'preview' && mode === 'web';
  // Modo celular/tablet: telas de toque não têm hover. São DUAS peças independentes, e
  // nenhuma delas mexe no cursor ou no input da janela:
  //   1. `Emulation.setTouchEmulationEnabled` no main → APIs de toque e as media queries
  //      `(hover: none)` / `(pointer: coarse)`;
  //   2. o script `noHoverScript` injetado na página → desarma os `:hover` puros (que
  //      nenhuma media query cobre).
  // O que NÃO se usa mais é `setEmitTouchEventsForMouse` (mouse→toque): ele não é do
  // <webview>, é da árvore inteira de WebContents — ligava o modo toque na JANELA TODA e
  // punha o cursor de toque do Chromium por cima do app. Ver noHoverScript.js.
  const touchMode = viewport !== 'desktop' && inWeb;
  const device = resolveDevice(viewport, customSize); // null = computador
  // Cor do topo/rodapé do site + scroll, lidos da página (pinta as barras do celular).
  const [pageChrome, setPageChrome] = useState(null);
  // Barra do Safari grande no topo da página, compacta depois de rolar (empurra o site).
  const safariExpanded = (pageChrome?.y ?? 0) <= 8;
  const safariRef = useRef(safariExpanded);
  safariRef.current = safariExpanded;
  const lan = useLanShare(active?.path, url); // "abrir no celular": botão + card
  const touchModeRef = useRef(touchMode); // leitura síncrona no dom-ready
  touchModeRef.current = touchMode;
  // "Olhando um site": o Ctrl+F só abre a busca aqui (na aba Código, o CodeMirror
  // tem a busca dele). Ref pra ser lido dentro dos listeners registrados uma vez.
  const inWebRef = useRef(false);
  inWebRef.current = inWeb;
  // Marca que a aba Código já foi visitada (mantém o CodeView montado dali em diante).
  const codeMountedRef = useRef(false);
  const bodyRowRef = useRef(null);
  // Abas por projeto. Cada projeto tem uma lista de abas (cada uma com o seu
  // <webview>) e a id da aba ativa. A aba "raiz" é o servidor de preview; as demais
  // nascem de links que abririam nova janela (target=_blank, window.open, Ctrl+clique).
  // projTabsRef: path -> { activeId, tabs: [{ id, webview, src, url, title, canBack, canFwd }] }
  //   src = URL que navegamos de propósito (recuperação/dedup); url = URL viva (barra).
  const projTabsRef = useRef(new Map());
  const tabIdRef = useRef(0);
  const [tabBar, setTabBar] = useState({ activeId: null, tabs: [] }); // snapshot do projeto ativo (render da tira)
  const containerRef = useRef(null);
  const logRef = useRef(null);
  const urlsRef = useRef(new Map()); // path -> url do servidor de preview (marca "tem server no ar")
  const activePathRef = useRef(null);
  const manualStopRef = useRef(new Set()); // paths parados pelo usuário (botão Parar)
  // Projeto remoto: porta da VPS que o túnel aberto aponta (path -> porta). A URL do
  // webview é sempre 127.0.0.1:<efêmera>, então sem isto não dá pra mostrar na UI
  // QUAL porta de lá está sendo vista.
  const remotePortRef = useRef(new Map());
  const [remotePort, setRemotePort] = useState(null);

  // --- Helpers do modelo de abas ---
  const getProjTabs = (path) => {
    let p = projTabsRef.current.get(path);
    if (!p) {
      p = { activeId: null, tabs: [] };
      projTabsRef.current.set(path, p);
    }
    return p;
  };
  const activeTabOf = (path) => {
    const p = projTabsRef.current.get(path);
    if (!p) return null;
    return p.tabs.find((t) => t.id === p.activeId) || null;
  };
  const activeWebviewOf = (path) => activeTabOf(path)?.webview || null;
  // executeJavaScript sem estourar: o <webview> lança SÍNCRONO antes do dom-ready e a view
  // rejeita a promise; aqui as duas viram "ignorado".
  const safeExec = (w, code) => {
    if (!w) return;
    try {
      const r = w.executeJavaScript(code);
      if (r && r.catch) r.catch(() => {});
    } catch {}
  };
  const allWebviews = () => {
    const out = [];
    for (const p of projTabsRef.current.values()) for (const t of p.tabs) out.push(t.webview);
    return out;
  };
  // Reprojeta o estado das abas do projeto ATIVO pra tira (é o único que ela mostra).
  const refreshTabBar = useCallback(() => {
    const p = activePathRef.current && projTabsRef.current.get(activePathRef.current);
    if (!p) {
      setTabBar({ activeId: null, tabs: [] });
      return;
    }
    setTabBar({
      activeId: p.activeId,
      tabs: p.tabs.map((t) => ({
        id: t.id,
        url: t.url,
        src: t.src,
        title: t.title,
        favicon: t.favicon,
      })),
    });
  }, []);
  const devtoolsHostRef = useRef(null); // slot do DevTools (div; no motor 'view' só é medido)
  const devtoolsRef = useRef(null); // superfície que hospeda o DevTools (<webview> ou view)
  // Retângulo do painel do site em px CSS do app (o motor 'view' posiciona a view nele).
  const panelBox = () => {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  // Recorte do print terminou dentro da página (cropScript) → captura. Ref porque o
  // listener mora no createTab (deps estáveis).
  const cropDoneRef = useRef(() => {});
  const toggleDevtoolsRef = useRef(() => {});

  const appendLog = useCallback((projectPath, text) => {
    if (activePathRef.current !== projectPath || !logRef.current) return;
    const clean = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    const el = logRef.current;
    el.textContent += clean;
    if (el.textContent.length > 40000) el.textContent = el.textContent.slice(-30000);
    el.scrollTop = el.scrollHeight;
  }, []);

  // Cria uma aba (um <webview>) no projeto e devolve o objeto-aba. Se `activate`,
  // ela vira a aba visível do projeto. As listeners atualizam a barra/nav só quando
  // ESTA aba é a ativa do projeto ativo — abas de fundo carregam sem mexer na UI.
  const createTab = useCallback(
    (projectPath, url, { activate = true } = {}) => {
      const proj = getProjTabs(projectPath);
      const id = ++tabIdRef.current;
      // Superfície do site: WebContentsView (padrão) ou <webview> (reserva). Mesma forma nos
      // dois — ver src/lib/previewSurface.js. Nasce escondida e já navegando pra `url`.
      const w = createSurface(engineRef.current, {
        api: window.api,
        container: containerRef.current,
        partition: partitionFor(projectPath),
        projectPath,
        url,
      });
      w.layout(panelBox(), viewportRef.current, customRef.current, {
        expanded: safariRef.current,
      });
      const tab = {
        id,
        webview: w, // a superfície (o nome ficou do tempo em que era sempre <webview>)
        _retry: 0,
        src: url || '',
        url: url || '',
        title: '',
        favicon: '',
        canBack: false,
        canFwd: false,
      };
      proj.tabs.push(tab);
      if (activate) proj.activeId = id;

      const isActiveTab = () => activePathRef.current === projectPath && proj.activeId === id;
      // A tira só mostra o projeto ativo, então só vale re-projetar quando a navegação é
      // deste projeto. Sem isso, uma aba de fundo (ou de OUTRO projeto) navegando/pollando
      // disparava um setTabBar a cada evento → re-render do app inteiro à toa.
      const isActiveProject = () => activePathRef.current === projectPath;
      const syncNav = () => {
        try {
          tab.canBack = w.canGoBack();
          tab.canFwd = w.canGoForward();
        } catch {}
        if (isActiveTab()) {
          setCanBack(tab.canBack);
          setCanFwd(tab.canFwd);
        }
      };
      w.addEventListener('did-navigate', (e) => {
        if (e.url) {
          tab.url = e.url;
          tab.favicon = ''; // nova página: zera o favicon até o page-favicon-updated chegar
          if (isActiveTab()) setUrl(e.url);
          if (isActiveProject()) refreshTabBar();
        }
        syncNav();
      });
      w.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame && e.url) {
          tab.url = e.url;
          if (isActiveTab()) setUrl(e.url);
          if (isActiveProject()) refreshTabBar();
        }
        syncNav();
      });
      w.addEventListener('page-title-updated', (e) => {
        tab.title = e.title || '';
        if (isActiveProject()) refreshTabBar();
      });
      w.addEventListener('page-favicon-updated', (e) => {
        tab.favicon = (e.favicons && e.favicons[0]) || '';
        if (isActiveProject()) refreshTabBar();
      });
      w.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3) return; // navegação abortada (outra começou), não é falha real
        // Uma aba nova/de fundo que AINDA não carregou precisa re-tentar mesmo escondida
        // (senão fica em branco pra sempre). Já uma aba que carregou e agora está offscreen
        // não fica martelando reload.
        if (!w.isShown() && tab._loaded) return;
        if (tab._retry++ < 8)
          setTimeout(() => {
            try {
              w.reload();
            } catch {}
          }, 1000);
      });
      w.addEventListener('did-finish-load', () => {
        tab._retry = 0;
        tab._loaded = true;
        syncNav();
        // Uma página recém-carregada (aba de fundo, nova navegação) pode dar autoplay:
        // re-afirma o mute pra só a aba à mostra tocar som. Ver applyMuting.
        try {
          applyMutingRef.current();
        } catch {}
      });
      // Botões laterais do mouse → voltar/avançar (detecta no DOM da página).
      w.addEventListener('dom-ready', () => {
        try {
          w.executeJavaScript(NAV_INJECT);
        } catch {}
        // Modo celular: a navegação/reload traz folhas de estilo novas e apaga o que foi
        // injetado, então re-mata o :hover a cada dom-ready. E re-afirma a emulação de
        // toque (persiste no debugger, mas garante depois de navegar).
        if (touchModeRef.current) {
          try {
            w.executeJavaScript(NO_HOVER_INJECT);
          } catch {}
          try {
            window.api.previewEmulateTouch(w.getWebContentsId(), true);
          } catch {}
        }
      });
      // Pontes dos scripts injetados ("selecionar elemento" e recorte do print): o script
      // emite o pacote pelo console. No motor 'view' o main só repassa estas mensagens.
      w.addEventListener('console-message', (e) => {
        const msg = e.message || '';
        if (msg.startsWith(GRAB_SENTINEL)) {
          try {
            const { md } = JSON.parse(msg.slice(GRAB_SENTINEL.length));
            window.api.copyText(md);
            toast.success(tRef.current('preview.grab_done').replace(/^✓\s*/, ''));
          } catch {}
          setGrabbing(false);
        } else if (msg.startsWith(GRAB_CANCEL)) {
          setGrabbing(false);
        } else if (msg.startsWith(CROP_SENTINEL)) {
          setShooting(false);
          try {
            cropDoneRef.current(w, JSON.parse(msg.slice(CROP_SENTINEL.length)));
          } catch {}
        } else if (msg.startsWith(CROP_CANCEL)) {
          setShooting(false);
        }
      });
      refreshTabBar();
      return tab;
    },
    [refreshTabBar],
  );

  // Remove TODAS as abas de um projeto (servidor caiu/parado). Zera o webview de cada.
  const removeAllTabs = useCallback(
    (projectPath) => {
      const proj = projTabsRef.current.get(projectPath);
      if (proj) {
        for (const t of proj.tabs) {
          try {
            t.webview.destroy();
          } catch {}
        }
      }
      projTabsRef.current.delete(projectPath);
      refreshTabBar();
    },
    [refreshTabBar],
  );

  // Foco do site (vem do main): acende a barra de URL só quando o id é o do projeto ativo.
  useEffect(() => {
    return window.api.on('webview:focus', ({ id, focused }) => {
      const w = activePathRef.current && activeWebviewOf(activePathRef.current);
      let activeId = null;
      try {
        activeId = w && w.getWebContentsId();
      } catch {}
      if (activeId != null && id === activeId) setWebFocused(focused);
    });
  }, []);

  // Some com a borda ao trocar de projeto ou sair do preview/site (o foco antigo
  // não vale mais; volta a aparecer quando clicarem no novo webview).
  useEffect(() => {
    setWebFocused(false);
  }, [active?.path]);
  useEffect(() => {
    if (!(view === 'preview' && mode === 'web')) setWebFocused(false);
  }, [view, mode]);

  // Navegação do preview (voltar/avançar), estilo navegador.
  const goBack = useCallback(() => {
    const w = active && activeWebviewOf(active.path);
    if (w && w.canGoBack()) w.goBack();
  }, [active]);
  const goFwd = useCallback(() => {
    const w = active && activeWebviewOf(active.path);
    if (w && w.canGoForward()) w.goForward();
  }, [active]);

  // Botões laterais do mouse (vêm do main via app-command) — lê o projeto ativo pelo ref.
  useEffect(() => {
    const nav = (dir) => {
      const p = activePathRef.current;
      const w = p && activeWebviewOf(p);
      if (!w) return;
      if (dir === 'back' && w.canGoBack()) w.goBack();
      if (dir === 'fwd' && w.canGoForward()) w.goForward();
    };
    window.api.on('nav:back', () => nav('back'));
    window.api.on('nav:forward', () => nav('fwd'));
  }, []);

  // Um modo por vez: "selecionar elemento" e "print" são mutuamente exclusivos.
  const stopShoot = useCallback(() => {
    const w = activePathRef.current && activeWebviewOf(activePathRef.current);
    safeExec(w, CROP_CLEANUP);
    setShooting(false);
  }, []);
  const stopGrab = useCallback(() => {
    const w = active && activeWebviewOf(active.path);
    try {
      w && w.executeJavaScript(CLEANUP);
    } catch {}
    setGrabbing(false);
  }, [active]);

  // Liga/desliga o modo "selecionar elemento" no webview do projeto ativo.
  const toggleGrab = useCallback(() => {
    if (!active) return;
    const w = activeWebviewOf(active.path);
    if (!w) return;
    if (grabbing) {
      try {
        w.executeJavaScript(CLEANUP);
      } catch {}
      setGrabbing(false);
    } else {
      stopShoot(); // entrar no seletor desliga o print
      w.executeJavaScript(INJECT)
        .then(() => setGrabbing(true))
        .catch(() => {});
    }
  }, [active, grabbing, stopShoot]);

  // Sai do modo "selecionar" se deixar o preview/site (troca de aba, para o servidor, etc.).
  useEffect(() => {
    if (grabbing && !(view === 'preview' && mode === 'web')) {
      for (const w of allWebviews()) {
        try {
          w.executeJavaScript(CLEANUP);
        } catch {}
      }
      setGrabbing(false);
    }
  }, [view, mode, grabbing]);

  // Atualiza os botões voltar/avançar ao trocar de projeto OU de aba. Durante a
  // navegação da aba ativa, o próprio syncNav já mantém canBack/canFwd em dia — por
  // isso a dep é tabBar.activeId (troca de aba), não o tabBar inteiro (que muda a cada
  // navegação de qualquer aba e faria este efeito rodar à toa).
  useEffect(() => {
    const w = active && activeWebviewOf(active.path);
    try {
      setCanBack(!!w && w.canGoBack());
      setCanFwd(!!w && w.canGoForward());
    } catch {
      setCanBack(false);
      setCanFwd(false);
    }
  }, [active, mode, tabBar.activeId]);

  // Esc cancela o modo mesmo quando o foco está na janela do app (não no webview).
  useEffect(() => {
    if (!grabbing) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      for (const w of allWebviews()) {
        try {
          w.executeJavaScript(CLEANUP);
        } catch {}
      }
      setGrabbing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [grabbing]);

  // --- Buscar na página (Ctrl+F) ---
  // Abre a barra de busca. Só vale "olhando um site"; cada chamada bumpa o nonce pra
  // a barra re-focar/selecionar o input (reabrir com Ctrl+F = pronto pra digitar).
  const openFind = useCallback(() => {
    if (!inWebRef.current) return;
    setFindOpen(true);
    setFindNonce((n) => n + 1);
  }, []);

  // Caminho 1 — foco na app (fora do webview): pega o Ctrl+F no window.
  useEffect(() => {
    const onKey = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'f' || e.key === 'F')
      ) {
        if (!inWebRef.current) return;
        e.preventDefault();
        openFind();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openFind]);

  // Caminho 2 — foco DENTRO do webview: o main intercepta o Ctrl+F e manda 'preview:find'
  // com o id do webContents. Só abre se for o webview do projeto ativo.
  useEffect(() => {
    return window.api.on('preview:find', ({ id }) => {
      const w = activePathRef.current && activeWebviewOf(activePathRef.current);
      let cid = null;
      try {
        cid = w && w.getWebContentsId();
      } catch {}
      if (cid != null && id === cid) openFind();
    });
  }, [openFind]);

  // Fecha a busca ao sair do preview/site (a FindBar limpa o realce ao desmontar).
  useEffect(() => {
    if (findOpen && !(view === 'preview' && mode === 'web')) setFindOpen(false);
  }, [view, mode, findOpen]);
  // Fecha ao trocar de aba ou de projeto (o webview alvo mudaria).
  useEffect(() => {
    setFindOpen(false);
  }, [tabBar.activeId, active?.path]);

  // ---- Print do preview (tela toda ou recorte) ----
  // O overlay (camada do app) captura o gesto de recorte; a captura em si roda no main
  // via webContents.capturePage e cai no clipboard.

  // Captura o webview ativo (rect = null → tela toda) SEM copiar: abre o anotador com a
  // imagem crua. Copiar (com ou sem marcações) acontece no modal.
  const doCapture = useCallback(
    async (rect) => {
      const w = active && activeWebviewOf(active.path);
      if (!w) return;
      let id = null;
      try {
        id = w.getWebContentsId();
      } catch {}
      if (id == null) return;
      const res = await window.api.capturePreview(id, rect, { toClipboard: false });
      if (res && res.dataURL) setShot(res.dataURL);
      else toast.error(t('preview.capture_failed'));
    },
    [active, t],
  );

  // Recorte terminou dentro da página: converte o retângulo (px CSS do site) pra DIP da
  // superfície e captura. A razão largura-em-DIP / innerWidth cobre o zoom do site, o zoom
  // do app e a escala do aparelho de uma vez (cropToCapture).
  cropDoneRef.current = (w, r) => {
    const box = w.cssRect && w.cssRect();
    const z = (window.api.getZoom && window.api.getZoom()) || 1;
    const dipWidth = w.kind === 'view' ? box && box.width * z : w.offsetWidth * z;
    const rect = cropToCapture(r, dipWidth);
    if (rect) doCapture(rect);
  };

  // Enquanto o anotador está aberto, esconde a camada dos <webview> (motor 'webview'): o
  // webview compõe ACIMA do DOM onde se sobrepõem e comeria os cliques do modal. No motor
  // 'view' quem cuida disso é a oclusão (a view vira foto enquanto o modal cobre).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.visibility = shot ? 'hidden' : '';
    return () => {
      if (el) el.style.visibility = '';
    };
  }, [shot]);

  // Menu da câmera: "Selecionar área" entra no modo recorte; "Tela toda" captura na hora.
  // Qualquer um desliga o seletor de elemento (um modo por vez).
  const startCrop = useCallback(() => {
    if (!active) return;
    const w = activeWebviewOf(active.path);
    if (!w) return;
    stopGrab();
    w.executeJavaScript(cropInject(t('preview.shot_active')))
      .then(() => setShooting(true))
      .catch(() => {});
  }, [active, stopGrab, t]);
  const captureFull = useCallback(() => {
    if (!active) return;
    stopGrab();
    stopShoot();
    doCapture(null);
  }, [active, stopGrab, stopShoot, doCapture]);

  // Atalhos de print (mesmo esquema do Ctrl+F): Ctrl/Cmd+P = "Selecionar área" (recorte);
  // Ctrl/Cmd+Shift+P = "Tela toda" (abre o anotador na hora). Só valem olhando um site.
  // Caminho 1 — foco na app (fora do webview): pega o atalho no window; preventDefault
  // barra o "imprimir" do navegador.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== 'p') return;
      if (!inWebRef.current) return;
      e.preventDefault();
      if (e.shiftKey) captureFull();
      else startCrop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startCrop, captureFull]);

  // Caminho 2 — foco DENTRO do webview: o main intercepta o Ctrl+P (senão o site abriria o
  // próprio diálogo de impressão) e manda 'preview:screenshot' com o id do webContents.
  useEffect(() => {
    return window.api.on('preview:screenshot', ({ id, full }) => {
      const w = activePathRef.current && activeWebviewOf(activePathRef.current);
      let cid = null;
      try {
        cid = w && w.getWebContentsId();
      } catch {}
      if (cid == null || id !== cid) return;
      if (full) captureFull();
      else startCrop();
    });
  }, [startCrop, captureFull]);

  // Sai do modo print ao deixar o preview/site, ou ao trocar de projeto.
  // A camada de recorte mora DENTRO da página: sair limpa em todas as abas.
  const clearCropAll = useCallback(() => {
    for (const w of allWebviews()) safeExec(w, CROP_CLEANUP);
    setShooting(false);
  }, []);
  useEffect(() => {
    if (shooting && !(view === 'preview' && mode === 'web')) clearCropAll();
  }, [view, mode, shooting, clearCropAll]);
  useEffect(() => {
    clearCropAll();
  }, [active?.path, tabBar.activeId, clearCropAll]);

  // Esc cancela o modo print mesmo com o foco fora do site (com o foco nele, o script trata).
  useEffect(() => {
    if (!shooting) return;
    const onKey = (e) => {
      if (e.key === 'Escape') clearCropAll();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [shooting, clearCropAll]);

  const showWebFor = useCallback(
    (projectPath, u) => {
      urlsRef.current.set(projectPath, u);
      // A UI troca PRIMEIRO (barra de URL + modo); só DEPOIS mexemos no <webview>.
      // Criar/navegar o <webview> pode lançar (o timing de attach difere no build
      // empacotado vs. dev) e isto roda dentro do callback do IPC 'preview:ready' —
      // que a ErrorBoundary não captura. Antes, uma exceção aqui abortava o callback
      // e setUrl/setMode nunca rodavam: o preview ficava preso no log com o NOME do
      // projeto na barra. Atualizando o estado antes, a virada acontece de qualquer jeito.
      const proj = getProjTabs(projectPath);
      if (activePathRef.current === projectPath) {
        setMode('web');
        // Já tem abas abertas (voltando pro projeto): reflete a aba ativa, não força a raiz.
        setUrl(proj.tabs.length ? activeTabOf(projectPath)?.url || u : u);
      }
      // Sem nenhuma aba ainda → cria a aba "raiz" (servidor de preview).
      if (proj.tabs.length === 0) {
        const create = () => createTab(projectPath, u, { activate: true });
        try {
          create();
        } catch {
          requestAnimationFrame(() => {
            try {
              create();
            } catch {}
          });
        }
      }
    },
    [createTab],
  );

  // DevTools encaixado (definido antes dos effects que o usam, pra não dar TDZ).
  // Motor 'view': o host do DevTools é uma WebContentsView NOVA a cada encaixe (a doc do
  // setDevToolsWebContents pede um host que nunca navegou). Motor 'webview': o <webview>
  // about:blank fixo de sempre (criado no efeito mais abaixo).
  const closeDevtoolsHost = () => {
    const h = devtoolsRef.current;
    if (h && h.kind === 'view') {
      h.destroy();
      devtoolsRef.current = null;
    }
  };
  const dockDevtools = useCallback(() => {
    const pv = active && activeWebviewOf(active.path);
    if (!pv) return;
    if (pv.kind === 'view') {
      closeDevtoolsHost();
      try {
        const host = createViewSurface({ api: window.api, kind: 'devtools' });
        const slot = devtoolsHostRef.current;
        if (slot) {
          const r = slot.getBoundingClientRect();
          host.layout({ x: r.left, y: r.top, width: r.width, height: r.height }, 'desktop');
        }
        host.show(true);
        devtoolsRef.current = host;
      } catch {
        return;
      }
    }
    if (devtoolsRef.current) {
      try {
        window.api.dockDevTools(pv.getWebContentsId(), devtoolsRef.current.getWebContentsId());
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const toggleDevtools = useCallback(() => {
    if (!active) return;
    const pv = activeWebviewOf(active.path);
    if (devtoolsOpen) {
      if (pv) {
        try {
          window.api.undockDevTools(pv.getWebContentsId());
        } catch {}
      }
      closeDevtoolsHost();
      setDevtoolsOpen(false);
    } else {
      setDevtoolsOpen(true);
      requestAnimationFrame(() => requestAnimationFrame(dockDevtools));
    }
  }, [active, devtoolsOpen, dockDevtools]);
  toggleDevtoolsRef.current = toggleDevtools;

  // Arrasta a borda esquerda do painel de DevTools pra aumentar/diminuir (igual os outros).
  const startDevtoolsResize = (e) => {
    e.preventDefault();
    const rect = bodyRowRef.current.getBoundingClientRect();
    setDtDragging(true);
    document.body.style.cursor = 'col-resize';
    const onMove = (ev) => {
      const w = Math.max(300, Math.min(rect.right - ev.clientX, rect.width - 320));
      setDevtoolsWidth(w);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setDtDragging(false);
      setDevtoolsWidth((w) => {
        localStorage.setItem('devtoolsWidth', String(Math.round(w)));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Os listeners de IPC são registrados UMA vez (deps []) e chamam sempre os closures
  // atuais via ref. Antes as deps eram [appendLog, showWebFor, onProjectsChanged]: se
  // qualquer uma mudasse de identidade, o efeito desmontava e re-registrava os 4
  // listeners — e um evento ('preview:ready'/'preview:log') chegando nesse intervalo
  // síncrono se perdia. Com [] não há mais essa janela.
  const ipcRef = useRef(null);
  ipcRef.current = { appendLog, showWebFor, onProjectsChanged, t, removeAllTabs };
  useEffect(() => {
    const offs = [];
    offs.push(
      window.api.on('preview:phase', ({ projectPath, text }) =>
        ipcRef.current.appendLog(projectPath, '\n> ' + text + '\n'),
      ),
    );
    offs.push(
      window.api.on('preview:log', ({ projectPath, chunk }) =>
        ipcRef.current.appendLog(projectPath, chunk),
      ),
    );
    offs.push(
      window.api.on('preview:ready', ({ projectPath, url: u }) => {
        ipcRef.current.showWebFor(projectPath, u);
        ipcRef.current.onProjectsChanged?.();
      }),
    );
    offs.push(
      window.api.on('preview:exit', ({ projectPath }) => {
        const hadUrl = urlsRef.current.has(projectPath);
        const wasManual = manualStopRef.current.delete(projectPath); // Set.delete devolve true se existia
        urlsRef.current.delete(projectPath);
        ipcRef.current.removeAllTabs(projectPath);
        if (activePathRef.current === projectPath) {
          if (wasManual || hadUrl) {
            setMode('empty'); // parado pelo usuário, ou já tinha aberto e o servidor caiu
          } else {
            setMode('log'); // falhou ao subir: mantém o log à mostra pra ver o erro
            ipcRef.current.appendLog(projectPath, ipcRef.current.t('preview.log_exited'));
          }
        }
        ipcRef.current.onProjectsChanged?.();
      }),
    );
    return () => {
      for (const off of offs) off?.();
    };
  }, []);

  // Motor 'webview': cria o <webview> que HOSPEDA o DevTools (à direita). Existe sempre
  // (escondido quando fechado). No motor 'view' o host nasce no dockDevtools.
  useEffect(() => {
    if (engineRef.current !== 'webview') {
      return () => closeDevtoolsHost();
    }
    const w = document.createElement('webview');
    w.setAttribute('src', 'about:blank');
    w.style.width = '100%';
    w.style.height = '100%';
    devtoolsHostRef.current.appendChild(w);
    devtoolsRef.current = w;
    return () => {
      try {
        w.remove();
      } catch {}
      devtoolsRef.current = null;
    };
  }, []);

  // F12 / "Inspecionar elemento" (vêm do processo principal) abrem/fecham o DevTools.
  useEffect(() => {
    window.api.on('devtools:toggle', () => toggleDevtoolsRef.current());
  }, []);

  // Flags de view derivadas — hoisted p/ cima porque o efeito de scaffold logo abaixo
  // usa inPreview nas deps (senão dá TDZ: "Cannot access 'inPreview' before initialization").
  const remote = !!active?.remote;
  // Projeto remoto so tem Preview e Codigo. Se um estado salvo pedir outra aba (Git,
  // API...), cai no Codigo em vez de renderizar nada.
  const effView = remote && view !== 'preview' ? 'code' : view;
  const inPreview = effView === 'preview';

  // Pasta vazia/só-lixo? Decide se o ramo "empty" mostra o wizard de scaffold.
  useEffect(() => {
    if (!inPreview || remote || mode !== 'empty' || !active) {
      setScaffoldProbe(null);
      return;
    }
    let alive = true;
    setScaffoldProbe(null);
    window.api.scaffoldProbe(active.path).then((r) => {
      if (alive) setScaffoldProbe(r ? { ...r, path: active.path } : null);
    });
    return () => {
      alive = false;
    };
  }, [inPreview, remote, mode, active]);

  // Se trocar de projeto OU de aba com o DevTools aberto, re-encaixa no webview atual.
  useEffect(() => {
    if (devtoolsOpen) requestAnimationFrame(dockDevtools);
  }, [active, devtoolsOpen, dockDevtools, tabBar.activeId]);

  // ---- Estado de UI por projeto (aba ativa, terminal, DevTools) ----
  // Cada projeto lembra em que aba estava (Preview/Código/Git) e se tinha o
  // terminal/DevTools aberto. Sem isso, abrir o terminal/DevTools num projeto
  // "vazava" pros outros. O 'dono' evita que a troca grave no projeto errado.
  const uiByProjectRef = useRef({});
  const stateOwnerRef = useRef(null);

  // Restaura o estado salvo ao trocar de projeto.
  useEffect(() => {
    const p = active?.path || null;
    stateOwnerRef.current = p;
    const s = (p && uiByProjectRef.current[p]) || null;
    // Remoto abre no Codigo: o preview de la so existe depois de escolher a porta do
    // tunel, entao cair nele de cara seria mostrar um formulario no lugar do projeto.
    setView(s?.view ?? (active?.remote ? 'code' : 'preview'));
    setTermOpen(s?.termOpen ?? false);
    setDevtoolsOpen(s?.devtoolsOpen ?? false);
  }, [active?.path, active?.remote]);

  // Salva o estado do projeto dono atual sempre que muda.
  useEffect(() => {
    const p = stateOwnerRef.current;
    if (p) uiByProjectRef.current[p] = { view, termOpen, devtoolsOpen };
  }, [view, termOpen, devtoolsOpen]);

  // Mostra só o webview do projeto ATIVO; esconde todos os outros. Ao revelar o
  // ativo, RE-GARANTE o src: se a navegação inicial no showWebFor falhou (timing de
  // attach no build empacotado), aqui ela é refeita — senão o modo web mostraria um
  // webview em branco que nunca carrega. É a rede de recuperação do ponto fraco do fix.
  useEffect(() => {
    const ap = active?.path || null;
    for (const [p, proj] of projTabsRef.current) {
      for (const tab of proj.tabs) {
        const show = p === ap && proj.activeId === tab.id && view === 'preview' && mode === 'web';
        // Motor 'view': encaixa ANTES de mostrar (senão pisca nos bounds antigos) e deixa
        // escondida enquanto algo do app cobre o preview (a foto fica no lugar).
        if (show)
          tab.webview.layout(panelBox(), viewportRef.current, customRef.current, {
            expanded: safariRef.current,
          });
        tab.webview.show(show && !(freeze && tab.webview.kind === 'view'));
        // Recuperação: SÓ re-aponta se o webview está em branco (a navegação inicial
        // falhou no build empacotado). Nunca recarrega uma página já carregada. E as
        // deps são [tabBar.activeId] (troca de aba), NÃO o tabBar inteiro: senão o
        // efeito rodava a cada evento de navegação e o re-aponte abortava o load em
        // curso (-3) e disparava outro → loop infinito de reload (a "piscada").
        if (show && tab.src && tab.webview.kind === 'webview') {
          let cur = '';
          try {
            cur = tab.webview.getURL();
          } catch {}
          if (!cur || cur === 'about:blank') {
            try {
              tab.webview.src = tab.src;
            } catch {}
          }
        }
      }
    }
  }, [view, mode, active, tabBar.activeId, freeze]);

  // ---- Motor 'view' (WebContentsView) ----
  // A view não acompanha o layout do DOM sozinha. A cada quadro re-encaixa a aba à mostra (e
  // o host do DevTools) no retângulo do painel; o handle só manda IPC quando algo mudou. Um
  // laço só cobre tudo que mexe no painel: divisória, recolher, terminal, tira de abas
  // animando, rail, zoom do app, janela.
  const showingSite = inPreview && mode === 'web' && !!active;
  useEffect(() => {
    if (!showingSite) return undefined;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const w = activeWebviewOf(active.path);
      if (w && w.kind === 'view')
        w.layout(panelBox(), viewportRef.current, customRef.current, {
          expanded: safariRef.current,
        });
      const dt = devtoolsRef.current;
      const slot = devtoolsHostRef.current;
      if (dt && dt.kind === 'view' && slot) {
        const r = slot.getBoundingClientRect();
        dt.layout({ x: r.left, y: r.top, width: r.width, height: r.height }, 'desktop');
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingSite, active?.path, tabBar.activeId]);

  // Oclusão: algo do app (menu, modal, toast, arraste) cobre a view → ela vira foto. Ver
  // src/lib/previewOcclusion.js.
  useEffect(() => {
    const w0 = showingSite && activeWebviewOf(active.path);
    if (!w0 || w0.kind !== 'view') {
      setOccluded(false);
      return undefined;
    }
    const stop = watchOcclusion({
      getRects: () => {
        const out = [];
        const w = activeWebviewOf(active.path);
        const r = w && w.cssRect && w.cssRect();
        if (r) out.push(r);
        const dt = devtoolsRef.current;
        const slot = devtoolsHostRef.current;
        if (dt && dt.kind === 'view' && slot) {
          const b = slot.getBoundingClientRect();
          if (b.width > 0) out.push({ x: b.left, y: b.top, width: b.width, height: b.height });
        }
        return out;
      },
      ownRoots: () => [containerRef.current, devtoolsHostRef.current],
      onChange: setOccluded,
    });
    return () => {
      stop();
      setOccluded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingSite, active?.path, tabBar.activeId]);

  // Coberto → fotografa a view e SÓ DEPOIS a esconde (view escondida não fotografa).
  // Descoberto → solta a foto e a view volta (efeito de mostrar/esconder acima).
  useEffect(() => {
    if (!occluded) {
      setFreeze(null);
      return undefined;
    }
    const w = active && activeWebviewOf(active.path);
    if (!w || w.kind !== 'view') return undefined;
    let alive = true;
    const rect = w.cssRect();
    const box = panelBox();
    const place =
      rect && box
        ? { x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height }
        : { x: 0, y: 0, width: 0, height: 0 };
    window.api
      .capturePreview(w.getWebContentsId(), null, { toClipboard: false })
      .then((res) => {
        if (alive) setFreeze({ src: (res && res.dataURL) || '', rect: place });
      })
      .catch(() => {
        if (alive) setFreeze({ src: '', rect: place });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occluded]);

  // Host do DevTools (motor 'view'): visível com o painel aberto e nada por cima.
  useEffect(() => {
    const dt = devtoolsRef.current;
    if (dt && dt.kind === 'view') dt.show(devtoolsOpen && showingSite && !occluded);
  }, [devtoolsOpen, showingSite, occluded, tabBar.activeId]);

  // Troca o modo de visualização (desktop/tablet/celular): re-aplica o viewport em
  // todos os webviews (os escondidos não atrapalham) e guarda a preferência.
  useEffect(() => {
    localStorage.setItem('previewViewport', viewport);
    localStorage.setItem('previewCustomSize', JSON.stringify(customSize));
    for (const w of allWebviews())
      w.layout(panelBox(), viewport, customSize, { expanded: safariExpanded });
  }, [viewport, customSize, safariExpanded]);

  // Modo celular: lê de tempos em tempos a cor do topo/rodapé da página e o scroll, pra
  // barra de status acompanhar o header do site (como no iOS/Android) e a barra do Safari
  // encolher quando a página rola. Só roda com o aparelho na tela.
  useEffect(() => {
    if (!device || !inWeb || !active) return undefined;
    let alive = true;
    const tick = () => {
      const w = activeWebviewOf(active.path);
      if (!w) return;
      // Antes do dom-ready (aba nascendo, recarregando) o executeJavaScript LANÇA na hora,
      // em vez de rejeitar a promise — o .catch não pega. Só tenta de novo no próximo tick.
      let run;
      try {
        run = w.executeJavaScript(PAGE_CHROME_SCRIPT);
      } catch {
        return;
      }
      run
        .then((r) => {
          if (!alive || !r) return;
          setPageChrome((cur) =>
            cur &&
            cur.top === r.top &&
            cur.bottom === r.bottom &&
            cur.host === r.host &&
            cur.y > 8 === r.y > 8
              ? cur
              : r,
          );
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 600);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!device, inWeb, active?.path, tabBar.activeId]);

  // Painel mudou de tamanho (janela, divisória, terminal): re-encaixa o aparelho e
  // atualiza a moldura, que usa a mesma conta (fitDevice).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      setStageBox({ width: el.clientWidth, height: el.clientHeight });
      for (const w of allWebviews())
        w.layout(panelBox(), viewportRef.current, customRef.current, {
          expanded: safariRef.current,
        });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Modo celular/tablet — peça 1: APIs de toque e as media queries `(hover: none)` /
  // `(pointer: coarse)`, via `Emulation.setTouchEmulationEnabled` no main. Não mexe no
  // cursor nem no input (medido). Ver `touchMode` acima.
  useEffect(() => {
    for (const w of allWebviews()) {
      let id = null;
      try {
        id = w.getWebContentsId();
      } catch {}
      if (id != null) window.api.previewEmulateTouch(id, touchMode);
    }
  }, [touchMode]);

  // Peça 2: desarmar os `:hover` puros da página (nenhuma media query cobre esses). Roda
  // dentro do site; sair do modo celular restaura os seletores originais.
  useEffect(() => {
    const script = touchMode ? NO_HOVER_INJECT : NO_HOVER_CLEANUP;
    for (const w of allWebviews()) {
      try {
        w.executeJavaScript(script);
      } catch {}
    }
  }, [touchMode]);

  // Silencia a mídia do preview que não está à mostra. Só toca som o webview da aba
  // ATIVA do projeto ATIVO com o Preview aberto (mode 'web'); qualquer outro — aba de
  // fundo, projeto trocado, ou quando saímos pra tela de Código — é mutado. Sem isso,
  // um vídeo/áudio (ou trilha de fundo) seguia tocando depois de trocar de tela. O mute
  // é reversível: ao voltar pra aba/projeto, o efeito re-roda e devolve o som.
  const shouldPlayAudio = useCallback(
    (w) => view === 'preview' && mode === 'web' && !!active && activeWebviewOf(active.path) === w,
    [view, mode, active],
  );
  const applyMuting = useCallback(() => {
    for (const w of allWebviews()) {
      try {
        w.setAudioMuted(!shouldPlayAudio(w));
      } catch {}
    }
  }, [shouldPlayAudio]);
  const applyMutingRef = useRef(applyMuting);
  applyMutingRef.current = applyMuting;
  useEffect(() => {
    applyMuting();
  }, [applyMuting, tabBar.activeId]);

  const pollingRef = useRef(new Set()); // paths com um waitAndShow em curso (evita loops duplicados)
  // Paths cujo preview este efeito JÁ tentou subir sozinho. O efeito abaixo re-roda
  // sempre que o OBJETO do projeto muda de identidade — e ele muda quando o main
  // reporta `running: false` (o reload() disparado por 'preview:exit'). Sem esta
  // trava, o "Parar" ressuscitava o servidor no mesmo instante (parar → exit →
  // reload → objeto novo → efeito → start) e um dev server que morre no boot
  // entrava em loop infinito de relançar. Auto-start é só a PRIMEIRA vez; depois,
  // quem manda subir de novo é o usuário (botão Reiniciar).
  const autoStartedRef = useRef(new Set());

  // Troca de projeto: inicia/retoma o preview do projeto ativo.
  useEffect(() => {
    if (active?.remote) {
      // Nada de auto-start/status: quem sobe o servidor la e a pessoa, pelo terminal.
      // So reencaixamos a UI no tunel que este projeto ja tiver aberto.
      activePathRef.current = active.path;
      refreshTabBar();
      setRemotePort(remotePortRef.current.get(active.path) ?? null);
      const u = urlsRef.current.get(active.path);
      if (u) {
        setUrl(activeTabOf(active.path)?.url || u);
        setMode('web');
      } else {
        setUrl('');
        setMode('empty');
      }
      return;
    }
    let cancelled = false; // efeito desmontou/trocou de projeto: corta o setTimeout e o poller
    const prevPath = activePathRef.current; // pra saber se é troca de projeto ou só re-run
    activePathRef.current = active?.path || null;
    refreshTabBar(); // a tira reflete as abas do novo projeto ativo
    if (!active) {
      setMode('empty');
      setUrl('');
      return;
    }
    setUrl(activeTabOf(active.path)?.url || urlsRef.current.get(active.path) || active.name);

    // Rede de segurança: vira pro modo web consultando o status até a URL existir,
    // mesmo que o evento 'preview:ready' não chegue. No build empacotado o push único
    // do IPC às vezes se perde e o preview ficava parado no log — aqui não depende dele.
    const waitAndShow = async () => {
      const path = active.path;
      if (pollingRef.current.has(path)) return; // já tem um loop pra este projeto
      pollingRef.current.add(path);
      try {
        for (let i = 0; i < 600; i++) {
          // ~3 min (300ms cada): cobre instalar deps + subir
          if (cancelled || activePathRef.current !== path) return;
          if (urlsRef.current.has(path)) return; // o evento já resolveu
          const st = await window.api.previewStatus(path);
          if (cancelled || activePathRef.current !== path) return;
          if (st && st.url) {
            showWebFor(path, st.url);
            return;
          }
          if (st && !st.running) return; // morreu/parou: o preview:exit trata
          await new Promise((r) => setTimeout(r, 300));
        }
      } finally {
        pollingRef.current.delete(path);
      }
    };

    (async () => {
      // O que fazer é decisão PURA (src/lib/previewAutoStart.js) — inclusive a trava que
      // impede o efeito de ressuscitar o servidor que o usuário acabou de parar.
      const hasUrl = urlsRef.current.has(active.path);
      const status = hasUrl
        ? { running: true, url: null }
        : await window.api.previewStatus(active.path);
      if (cancelled || activePathRef.current !== active.path) return; // já trocou/desmontou
      const { action, markHandled } = decideAutoStart({
        hasUrl,
        running: !!status.running,
        statusUrl: status.url || null,
        previewType: active.previewType,
        handled: autoStartedRef.current.has(active.path),
        sameProject: prevPath === active.path,
        // Ausente no objeto antigo (projeto remoto, config nunca gravada) = ligado, que
        // e o comportamento que o app sempre teve.
        autoStart: active.autoStart !== false,
      });
      if (markHandled) autoStartedRef.current.add(active.path);
      if (action === 'keep') return; // log do erro de quem caiu continua à mostra
      if (action === 'empty') {
        setMode('empty');
        return;
      }
      if (action === 'show') {
        showWebFor(active.path, hasUrl ? urlsRef.current.get(active.path) : status.url);
        return;
      }

      setMode('log');
      setTimeout(async () => {
        if (cancelled || activePathRef.current !== active.path) return;
        if (logRef.current) logRef.current.textContent = '';
        if (action === 'attach') {
          const log = await window.api.previewGetLog(active.path);
          if (log) appendLog(active.path, log);
          appendLog(active.path, t('preview.log_found'));
          waitAndShow();
          return;
        }
        appendLog(active.path, t('preview.log_preparing'));
        const res = await startPreviewResolved(active.path);
        if (cancelled) return;
        if (res && res.cancelled) {
          setMode('empty'); // usuário cancelou no conflito de porta
          return;
        }
        if (res && res.error) {
          appendLog(active.path, '\n[erro] ' + res.error + '\n');
          return;
        }
        onProjectsChanged?.();
        waitAndShow();
      }, 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, showWebFor, appendLog, onProjectsChanged, refreshTabBar]);

  // Navega o preview do projeto ativo até `v` (garante http://, troca pra aba
  // Preview e aponta o webview). Caminho único usado tanto pela barra de URL
  // quanto pelo Ctrl+clique num link do terminal.
  const navigateTo = useCallback(
    (v) => {
      if (!active) return;
      v = (v || '').trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
      setView('preview');
      setMode('web');
      setUrl(v);
      // Navega a ABA ATIVA (barra de URL / link do terminal). Sem aba ainda → cria a raiz.
      const tab = activeTabOf(active.path);
      if (!tab) {
        createTab(active.path, v, { activate: true });
        return;
      }
      tab.src = v;
      tab.url = v;
      try {
        tab.webview.src = v;
      } catch {}
      refreshTabBar();
    },
    [active, createTab, refreshTabBar],
  );

  const onUrlKey = (e) => {
    if (e.key !== 'Enter') return;
    navigateTo(url);
    e.target.blur();
  };

  // Projeto remoto: o túnel já está de pé e `u` é o http://127.0.0.1:<efêmera> que
  // desemboca na `port` da VPS. Daqui pra frente é o preview normal — por isso o
  // caminho reaproveita o mesmo showWebFor/navigateTo do projeto local.
  const openRemoteUrl = useCallback(
    (u, port) => {
      const p = activePathRef.current;
      if (!p) return;
      remotePortRef.current.set(p, port);
      setRemotePort(port);
      urlsRef.current.set(p, u);
      if (activeTabOf(p)) navigateTo(u);
      else showWebFor(p, u);
    },
    [navigateTo, showWebFor],
  );

  // --- Ações da tira de abas ---
  const selectTab = useCallback(
    (id) => {
      const p = activePathRef.current;
      if (!p) return;
      const proj = projTabsRef.current.get(p);
      if (!proj) return;
      proj.activeId = id;
      const tab = proj.tabs.find((t) => t.id === id);
      if (tab) {
        setUrl(tab.url || tab.src || '');
        setCanBack(tab.canBack);
        setCanFwd(tab.canFwd);
      }
      refreshTabBar();
    },
    [refreshTabBar],
  );

  const closeTab = useCallback(
    (id) => {
      const p = activePathRef.current;
      if (!p) return;
      const proj = projTabsRef.current.get(p);
      if (!proj) return;
      const idx = proj.tabs.findIndex((t) => t.id === id);
      if (idx === -1 || proj.tabs.length <= 1) return; // nunca fecha a última (a tira some antes disso)
      const [removed] = proj.tabs.splice(idx, 1);
      try {
        removed.webview.destroy();
      } catch {}
      if (proj.activeId === id) {
        // ativa a vizinha
        const next = proj.tabs[idx] || proj.tabs[idx - 1] || null;
        proj.activeId = next ? next.id : null;
        if (next) {
          setUrl(next.url || next.src || '');
          setCanBack(next.canBack);
          setCanFwd(next.canFwd);
        }
      }
      refreshTabBar();
    },
    [refreshTabBar],
  );

  const newTab = useCallback(() => {
    const p = activePathRef.current;
    if (!p) return;
    const home = urlsRef.current.get(p) || activeTabOf(p)?.url || 'about:blank';
    const tab = createTab(p, home, { activate: true });
    setUrl(tab.url);
    setMode('web');
    setView('preview');
    refreshTabBar();
  }, [createTab, refreshTabBar]);

  // Abre `url` numa ABA NOVA do projeto (o "botão do meio" do preview). Caminho único do
  // popup do site (preview:new-tab) e do link clicado no terminal do Claude.
  const openNewTab = useCallback(
    (projectPath, url, { foreground = true } = {}) => {
      if (!projectPath || !url) return;
      createTab(projectPath, url, { activate: foreground });
      if (foreground && activePathRef.current === projectPath) {
        setUrl(url);
        setMode('web');
        setView('preview');
      }
      refreshTabBar();
    },
    [createTab, refreshTabBar],
  );

  // Link que abriria "nova janela" (interceptado no main) → vira aba interna. O main
  // manda o webContentsId de origem; aqui achamos o projeto dono e criamos a aba nele.
  useEffect(() => {
    return window.api.on('preview:new-tab', ({ sourceId, url, disposition }) => {
      if (!url) return;
      let ownerPath = null;
      outer: for (const [p, proj] of projTabsRef.current) {
        for (const t of proj.tabs) {
          let cid = null;
          try {
            cid = t.webview.getWebContentsId();
          } catch {}
          if (cid === sourceId) {
            ownerPath = p;
            break outer;
          }
        }
      }
      if (!ownerPath) return;
      openNewTab(ownerPath, url, { foreground: disposition !== 'background-tab' });
    });
  }, [openNewTab]);

  // Recria a aba ativa: destrói o <webview> e monta outro na mesma URL e na mesma posição da
  // tira. É o remendo do "preview congela as animações depois de minimizar" (DESAFIOS.md): o
  // defeito mora no próprio <webview>, que volta "visível" mas sem requestAnimationFrame, então
  // recarregar a página DENTRO dele não garante nada. Um webview novo anima igual à carga do
  // zero (o mesmo que o Reiniciar/Parar já faziam via removeAllTabs). Custo: a aba perde o
  // histórico de voltar/avançar. `hard`: depois de nascer, recarrega ignorando o cache.
  const recreateActiveTab = useCallback(
    (projectPath, { hard = false } = {}) => {
      const proj = projTabsRef.current.get(projectPath);
      const old = activeTabOf(projectPath);
      if (!proj || !old) return;
      const target = old.url || old.src;
      if (!target) return;
      const idx = proj.tabs.indexOf(old);
      proj.tabs.splice(idx, 1);
      try {
        old.webview.destroy();
      } catch {}
      setGrabbing(false); // o script do seletor morreu junto com o webview antigo
      setShooting(false); // idem o recorte do print
      const tab = createTab(projectPath, target, { activate: true });
      // createTab põe a aba no fim; devolve pra posição original na tira.
      proj.tabs.splice(proj.tabs.indexOf(tab), 1);
      proj.tabs.splice(idx, 0, tab);
      if (hard) {
        tab.webview.addEventListener(
          'dom-ready',
          () => {
            try {
              tab.webview.reloadIgnoringCache();
            } catch {}
          },
          { once: true },
        );
      }
      refreshTabBar();
    },
    [createTab, refreshTabBar],
  );
  // Recarregar a aba ativa. Motor 'view': recarregar normal (mantém voltar/avançar) — a view
  // não tem o defeito do <webview> que o recriar contornava. Motor 'webview': recria.
  const reloadActiveTab = useCallback(
    (projectPath, { hard = false } = {}) => {
      const w = activeWebviewOf(projectPath);
      if (!w) return;
      if (w.kind === 'view') {
        if (hard) w.reloadIgnoringCache();
        else w.reload();
        return;
      }
      recreateActiveTab(projectPath, { hard });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recreateActiveTab],
  );
  const recreateRef = useRef(reloadActiveTab);
  recreateRef.current = reloadActiveTab;

  // Recarregar = recriar a aba (ver recreateActiveTab); com Ctrl/Cmd vira hard reload.
  const reload = (e) => {
    if (!active) return;
    try {
      reloadActiveTab(active.path, { hard: !!(e && (e.ctrlKey || e.metaKey)) });
    } catch {}
  };
  // Escolher um dispositivo recarrega a página, pra ela não ficar presa no layout anterior.
  // Vem depois dos efeitos que aplicam o tamanho e o toque: o reload já nasce no modo novo.
  useEffect(() => {
    if (!viewportPicks) return;
    try {
      const w = activePathRef.current && activeWebviewOf(activePathRef.current);
      w?.reload();
    } catch {}
  }, [viewportPicks]);
  // Atalhos de hard reload (Ctrl+F5 / Ctrl+Shift+R / Cmd+Shift+R), só valem "olhando um
  // site" (mesmo gate do Ctrl+F acima). Lê tudo por ref pra não precisar de deps e não
  // correr risco de webview/path desatualizados. F5 puro recria a aba (recreateActiveTab).
  useEffect(() => {
    const onKey = (e) => {
      if (!inWebRef.current) return;
      if (shotRef.current) return; // anotador aberto por cima: não recarrega o webview escondido
      const key = e.key;
      const hard =
        (e.ctrlKey && key === 'F5') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'R' || key === 'r'));
      const p = activePathRef.current;
      if (!p) return;
      if (hard || (key === 'F5' && !e.ctrlKey)) {
        e.preventDefault();
        try {
          recreateRef.current(p, { hard });
        } catch {}
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Abre o preview atual no navegador padrão do sistema. Sem lock-in: se a pessoa
  // preferir o navegador dela (DevTools próprio, extensões, etc.), é só um clique.
  const openInBrowser = () => {
    if (mode === 'web' && url) window.api.openExternal(url);
  };
  // Trava contra clique repetido: parar/reiniciar mexem no mesmo servidor, então
  // enquanto uma operação está rodando, as outras são ignoradas. Por mais que
  // cliquem 10x num segundo, só a primeira vale; as demais voltam na hora. É um
  // lock por operação (não um timer), então libera assim que a ação termina.
  const serverBusyRef = useRef(false);
  const stop = async () => {
    if (!active || serverBusyRef.current) return;
    serverBusyRef.current = true;
    manualStopRef.current.add(active.path); // pra o preview:exit cair no empty state, não no log
    try {
      await window.api.stopPreview(active.path);
      urlsRef.current.delete(active.path);
      removeAllTabs(active.path);
      setMode('empty');
    } finally {
      serverBusyRef.current = false;
    }
  };
  // --- Conflito de porta fixa ---
  // A porta reservada do projeto está ocupada por processo externo: o main devolve
  // { portConflict } e aqui perguntamos o que fazer (Encerrar o que está lá / Usar
  // porta aleatória desta vez / Cancelar), re-tentando com a decisão. Um único ponto,
  // usado tanto pelo start inicial quanto pelo reiniciar.
  const [portPrompt, setPortPrompt] = useState(null); // { port } | null
  const portPromptResolveRef = useRef(null);
  const askPortDecision = useCallback(
    (port) =>
      new Promise((resolve) => {
        portPromptResolveRef.current = resolve;
        setPortPrompt({ port });
      }),
    [],
  );
  const resolvePortPrompt = useCallback((decision) => {
    setPortPrompt(null);
    const r = portPromptResolveRef.current;
    portPromptResolveRef.current = null;
    if (r) r(decision);
  }, []);
  const startPreviewResolved = useCallback(
    async (projectPath) => {
      let decision;
      for (;;) {
        const res = await window.api.startPreview(projectPath, decision);
        if (res && res.portConflict) {
          decision = await askPortDecision(res.port);
          if (decision === 'cancel') return { cancelled: true };
          continue; // 'kill' | 'random' → re-tenta
        }
        return res;
      }
    },
    [askPortDecision],
  );

  const restart = async () => {
    if (!active || serverBusyRef.current) return;
    serverBusyRef.current = true;
    manualStopRef.current.delete(active.path); // reiniciar não é parada manual: deixa o fluxo normal (log)
    await window.api.stopPreview(active.path);
    urlsRef.current.delete(active.path);
    removeAllTabs(active.path);
    setMode('log');
    setTimeout(async () => {
      try {
        if (logRef.current) logRef.current.textContent = '';
        appendLog(active.path, t('preview.log_restarting'));
        const res = await startPreviewResolved(active.path);
        if (res && res.cancelled) {
          setMode('empty'); // usuário cancelou no conflito de porta
          return;
        }
        if (res && res.error) appendLog(active.path, '\n[erro] ' + res.error + '\n');
        onProjectsChanged?.();
      } finally {
        serverBusyRef.current = false;
      }
    }, 0);
  };

  // Expõe parar/reiniciar pro cabeçalho (App.jsx), que mora na outra coluna. O ref
  // é reatribuído a cada render pra sempre apontar pros closures atuais; o `mode`
  // é reportado pra o cabeçalho saber habilitar/desabilitar os botões.
  // Abre um arquivo na aba "Código" (vindo da paleta de comandos). O `seq` força o
  // CodeView a reagir mesmo quando o mesmo arquivo é pedido duas vezes seguidas.
  const openFile = useCallback((file) => {
    if (!file?.path) return;
    openSeqRef.current += 1;
    setOpenRequest({ path: file.path, name: file.name, seq: openSeqRef.current });
    setView('code');
  }, []);

  if (controlsRef)
    controlsRef.current = {
      stop,
      restart,
      setView,
      openFile,
      // Link do terminal do Claude: aba nova no preview do projeto ativo.
      openTab: (url) => openNewTab(activePathRef.current, url),
      toggleTerminal: () => setTermOpen((o) => !o),
    };
  // Avisa o App (botão do terminal na barra de título) quando o terminal abre ou fecha.
  useEffect(() => {
    onTerminalChange?.(termOpen);
  }, [termOpen, onTerminalChange]);
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // Arrasta a borda superior do terminal pra redimensionar (estilo VS Code).
  const startResize = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = termHeight;
    setTermDragging(true); // camada por cima do webview pra ele não engolir o arraste
    const onMove = (ev) => {
      const h = Math.max(120, Math.min(startH + (startY - ev.clientY), window.innerHeight - 180));
      setTermHeight(h);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      setTermDragging(false);
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const copyClaudePrompt = async () => {
    if (!active) return;
    const prompt = [
      t('preview.claude_prompt_1', { projectName: active.name }),
      t('preview.claude_prompt_2'),
      t('preview.claude_prompt_3'),
      t('preview.claude_prompt_4'),
      t('preview.claude_prompt_5'),
      t('preview.claude_prompt_6'),
      t('preview.claude_prompt_7'),
      t('preview.claude_prompt_8'),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Spring-loaded nas abas Código/Preview: um arrasto de arquivo EXTERNO parado sobre a
  // aba (~0,6s) troca a view antes de soltar. Mede pelos ticks do 'dragover' (~350ms
  // mesmo parado), igual ao dwell da barra lateral — sem timer pra vazar.
  const tabDwellRef = useRef({ key: null, since: 0, fired: false });
  const onTabDragOver = (value) => (e) => {
    if (!hasExternalFiles(e.dataTransfer)) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {}
    if (view === value) {
      tabDwellRef.current = { key: null, since: 0, fired: false };
      return;
    }
    const d = tabDwellRef.current;
    const now = Date.now();
    if (d.key !== value) tabDwellRef.current = { key: value, since: now, fired: false };
    else if (!d.fired && now - d.since >= 600) {
      tabDwellRef.current = { key: value, since: d.since, fired: true };
      setView(value);
    }
  };

  const inCode = effView === 'code';
  // Uma vez aberto, o CodeView fica MONTADO (só escondido via CSS quando saímos da aba),
  // pra não perder as abas de arquivos abertos ao alternar Código ↔ Preview. O ref garante
  // que ele só monta na 1ª visita (respeitando o lazy-load do CodeMirror), nunca antes.
  if (inCode) codeMountedRef.current = true;
  const inGit = !remote && view === 'git';
  const inApi = !remote && view === 'api';
  const inMcp = !remote && view === 'mcp';
  const inBoard = !remote && view === 'board';
  const inTodos = !remote && view === 'todos';
  const inKanban = !remote && view === 'kanban';
  const inHistory = !remote && view === 'history';

  return (
    <>
      {active && (
        <div className="relative z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2.5">
          <Tabs value={effView} onValueChange={setView}>
            <TabsList className="h-8 gap-0.5 p-0.5">
              <TabsTrigger
                value="preview"
                onDragOver={onTabDragOver('preview')}
                className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"
              >
                <HoverIcon as={EarthIcon} />
                {t('preview.tab')}
              </TabsTrigger>
              <TabsTrigger
                value="code"
                onDragOver={onTabDragOver('code')}
                className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"
              >
                <HoverIcon as={ChevronsLeftRightIcon} />
                {t('preview.code')}
              </TabsTrigger>
              {!remote && (
                <TabsTrigger
                  value="git"
                  className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"
                >
                  <HoverIcon as={GitBranchIcon} />
                  {t('preview.git')}
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {/* Ferramentas menos usadas (API, MCP) num menu com seta, pra enxugar a barra. */}
          {!remote && <MoreTools view={view} onPick={setView} />}

          {inPreview && (
            <>
              {/* Voltar/avançar, estilo navegador. */}
              <div className="flex items-center gap-0.5">
                <ToolButton onClick={goBack} disabled={!canBack} title={t('preview.back')}>
                  <ArrowLeftIcon />
                </ToolButton>
                <ToolButton onClick={goFwd} disabled={!canFwd} title={t('preview.forward')}>
                  <ArrowRightIcon />
                </ToolButton>
              </div>
              {/* Remoto: a barra mostra 127.0.0.1:<efêmera>, que não diz nada. Este chip
                  diz QUAL porta da VPS está do outro lado do túnel, e clicar volta pra
                  escolha (trocar de porta sem sair do Preview). */}
              {remote && (
                <button
                  type="button"
                  onClick={() => setMode('empty')}
                  title={t('remotePreview.change_port')}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Globe className="size-3.5" aria-hidden="true" />
                  {remotePort ? ':' + remotePort : t('remotePreview.pick')}
                </button>
              )}
              {/* Tamanho de tela (computador/tablet/celular), colado na barra de URL. */}
              <DevicePicker
                value={viewport}
                onChange={(v) => {
                  setViewport(v);
                  setViewportPicks((n) => n + 1);
                }}
                disabled={mode !== 'web'}
              />
              {/* Barra de URL com o "recarregar" embutido, estilo navegador. */}
              <div className="relative flex-1">
                <ReloadButton onClick={reload} disabled={mode !== 'web'} />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={onUrlKey}
                  spellCheck={false}
                  placeholder={t('preview.url_placeholder')}
                  className={cn(
                    'h-8 pl-8 pr-8 font-mono text-xs',
                    // Foco DENTRO do site → Ctrl +/- zooma o site, não o app. Antes era um anel
                    // por cima do site; a WebContentsView desenha por cima do DOM, então o
                    // aviso mora aqui na barra.
                    inPreview && mode === 'web' && webFocused && 'ring-2 ring-primary/40',
                  )}
                />
                {/* Ctrl+F: a busca ocupa a barra de URL (por cima do site ela ficaria escondida
                    atrás da view). Fechar devolve a URL. */}
                {inPreview && mode === 'web' && findOpen && (
                  <FindBar
                    webview={active ? activeWebviewOf(active.path) : null}
                    nonce={findNonce}
                    onClose={() => setFindOpen(false)}
                    t={t}
                    className="absolute inset-0 z-10"
                  />
                )}
                <button
                  type="button"
                  onClick={openInBrowser}
                  disabled={mode !== 'web'}
                  title={t('preview.open_browser')}
                  className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[14px]"
                >
                  <ExternalLink />
                </button>
              </div>

              <div className="flex items-center gap-0.5">
                {/* Nova guia colada na barra de URL (ao lado do "abrir no navegador"),
                    mais discreto que no grupo voltar/avançar. A tira de abas só aparece
                    com 2+ páginas, então sem este botão não havia como abrir a segunda. */}
                <ToolButton onClick={newTab} title={t('preview.tab_new')}>
                  <Plus />
                </ToolButton>
                <ToolButton
                  onClick={toggleGrab}
                  disabled={mode !== 'web'}
                  active={grabbing}
                  title={t('preview.grab_element')}
                >
                  <Crosshair />
                </ToolButton>
                <ShotPicker
                  onArea={startCrop}
                  onFull={captureFull}
                  active={shooting}
                  disabled={mode !== 'web'}
                />
                <ToolButton
                  onClick={toggleDevtools}
                  disabled={mode !== 'web'}
                  active={devtoolsOpen}
                  title={t('preview.devtools')}
                >
                  <Bug />
                </ToolButton>
                {/* Abrir no celular: rede local + QR Code. */}
                <PhoneShareButton share={lan} disabled={mode !== 'web'} />
              </div>
              <div className="h-5 w-px bg-border" />
            </>
          )}

          {(inCode || inGit || inApi || inMcp || inBoard || inTodos) && <div className="flex-1" />}

          <ToolButton
            onClick={() => setTermOpen((o) => !o)}
            disabled={!active}
            active={termOpen}
            title={termOpen ? t('preview.close_terminal') : t('preview.open_terminal')}
          >
            <TerminalIcon />
          </ToolButton>
        </div>
      )}

      {/* Tira de abas discreta: só aparece quando o projeto tem MAIS DE UMA página
          aberta. Com uma só, fica com altura 0 (invisível) e o site ocupa tudo — a
          experiência de sempre. Ao surgir uma 2ª aba, ela "estica" pra baixo e o
          preview encolhe um pouquinho. É o padrão de navegador, sem virar navegador. */}
      {active && (
        <div
          className="shrink-0 overflow-hidden border-b bg-card transition-[height] duration-200 ease-out"
          style={{ height: inPreview && mode === 'web' && tabBar.tabs.length > 1 ? 36 : 0 }}
        >
          <div className="flex h-9 items-stretch overflow-x-auto">
            {tabBar.tabs.map((tab) => (
              <TabChip
                key={tab.id}
                label={tabLabel(tab, t('preview.tab_untitled'))}
                favicon={tab.favicon}
                active={tab.id === tabBar.activeId}
                onSelect={() => selectTab(tab.id)}
                onClose={() => closeTab(tab.id)}
                closeTitle={t('preview.tab_close')}
              />
            ))}
            <button
              type="button"
              onClick={newTab}
              title={t('preview.tab_new')}
              className="grid w-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4"
            >
              <Plus />
            </button>
          </div>
        </div>
      )}

      <div ref={bodyRowRef} className="relative flex min-h-0 min-w-0 flex-1">
        <div className="relative isolate min-h-0 min-w-0 flex-1">
          <div
            ref={containerRef}
            className={cn(
              'absolute inset-0',
              !inPreview && 'pointer-events-none',
              inPreview && mode === 'web' && viewport !== 'desktop' && 'bg-muted/40',
            )}
          >
            {/* Foto do site enquanto algo do app cobre a view (motor 'view'). */}
            {freeze && inPreview && mode === 'web' && (
              <img
                src={freeze.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute select-none"
                style={{
                  left: freeze.rect.x,
                  top: freeze.rect.y,
                  width: freeze.rect.width,
                  height: freeze.rect.height,
                }}
              />
            )}
          </div>
          {/* Moldura de celular/tablet: convite/QR "abrir no celular" no espaço vazio ao lado. */}
          {inPreview && mode === 'web' && device && stageBox && (
            <>
              <DeviceFrame dev={device} box={stageBox} showLabel={false} page={pageChrome} />
              {/* Embaixo do aparelho: nome + medidas, e clicando, a grade pra trocar. */}
              <DeviceSwitcher
                value={viewport}
                onChange={(v) => {
                  setViewport(v);
                  setViewportPicks((n) => n + 1);
                }}
                custom={customSize}
                onCustomChange={setCustomSize}
                device={device}
                geometry={fitDevice(device, stageBox, { expanded: safariExpanded })}
              />
              <PhoneShareCard share={lan} frameWidth={fitDevice(device, stageBox).frame.w} />
            </>
          )}
          {shot && (
            <Suspense fallback={null}>
              <AnnotatorModal
                dataURL={shot}
                onClose={() => setShot(null)}
                onCopy={async (png) => {
                  const res = await window.api.copyImage(png);
                  setShot(null);
                  if (res && res.ok) {
                    toast.success(t('preview.shot_done').replace(/^✓\s*/, ''));
                  } else {
                    toast.error(t('preview.copy_image_failed'));
                  }
                }}
              />
            </Suspense>
          )}
          {/* Conflito de porta fixa: a porta reservada está ocupada por outro processo.
              Não matamos cego — o usuário decide. */}
          {portPrompt && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55">
              <div className="w-[360px] rounded-2xl border border-primary/30 bg-background p-5 shadow-xl">
                <div className="text-sm font-semibold">
                  {t('preview.port_conflict_title', { port: portPrompt.port })}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t('preview.port_conflict_body', { port: portPrompt.port })}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button size="sm" variant="destructive" onClick={() => resolvePortPrompt('kill')}>
                    {t('preview.port_conflict_kill')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resolvePortPrompt('random')}>
                    {t('preview.port_conflict_random')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resolvePortPrompt('cancel')}>
                    {t('preview.port_conflict_cancel')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {inPreview && mode === 'log' && (
            <pre
              ref={logRef}
              className="absolute inset-0 m-0 overflow-auto whitespace-pre-wrap break-words bg-background p-3.5 font-mono text-xs leading-relaxed text-muted-foreground"
            />
          )}
          {inPreview && mode === 'empty' && active && remote && (
            <LazyPanel label="Preview remoto">
              <RemotePreviewStart projectPath={active.path} onOpen={openRemoteUrl} />
            </LazyPanel>
          )}
          {inPreview &&
            mode === 'empty' &&
            !remote &&
            (active ? (
              scaffoldProbe?.scaffoldable && scaffoldProbe.path === active.path ? (
                <ScaffoldWizard
                  projectPath={active.path}
                  junk={scaffoldProbe.junk}
                  onNewSession={onNewChatSession}
                />
              ) : (
                <div className="absolute inset-0">
                  <EmptyState>
                    {active.previewType == null
                      ? t('preview.no_preview_server')
                      : active.autoStart === false
                        ? // Auto-start desligado neste projeto: nao e falha, e escolha.
                          t('preview.no_preview_manual')
                        : t('preview.no_preview')}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={copyClaudePrompt}
                      className="mt-1"
                    >
                      <Copy className="mr-1" />
                      {copied ? t('preview.prompt_copied') : t('preview.copy_prompt')}
                    </Button>
                  </EmptyState>
                </div>
              )
            ) : (
              <div className="absolute inset-0">
                <EmptyState size="lg">{t('preview.select_project')}</EmptyState>
              </div>
            ))}
          {(inCode || codeMountedRef.current) && (
            <div className={cn('absolute inset-0', !inCode && 'hidden')}>
              <LazyPanel label="Código">
                <CodeView active={active} openRequest={openRequest} visible={inCode} />
              </LazyPanel>
            </div>
          )}
          {inHistory && (
            <LazyPanel label="Histórico">
              <CheckpointsPanel active={active} visible={inHistory} />
            </LazyPanel>
          )}
          {inGit && (
            <LazyPanel label="Git">
              <GitPanel active={active} visible={inGit} />
            </LazyPanel>
          )}
          {inApi && (
            <LazyPanel label="API">
              <ApiPanel key={active?.path || 'none'} active={active} />
            </LazyPanel>
          )}
          {inMcp && (
            <LazyPanel label="MCP">
              <MCPPanel active={active} />
            </LazyPanel>
          )}
          {inBoard && (
            <LazyPanel label="Quadro">
              <TldrawPanel active={active} />
            </LazyPanel>
          )}
          {inTodos && (
            <LazyPanel label="Tarefas">
              <TodosPanel active={active} chatSession={chatSession} />
            </LazyPanel>
          )}
          {inKanban && (
            <LazyPanel label="Kanban">
              <KanbanPanel active={active} />
            </LazyPanel>
          )}
        </div>

        {/* Alça pra redimensionar o painel de DevTools. */}
        {devtoolsOpen && inPreview && <ResizeBar onMouseDown={startDevtoolsResize} />}

        {/* Painel do DevTools (à direita). O webview vive sempre aqui; só fica escondido quando fechado. */}
        <div
          className={cn(
            'relative min-h-0 shrink-0',
            !(devtoolsOpen && inPreview) && 'w-0 overflow-hidden',
          )}
          style={devtoolsOpen && inPreview ? { width: devtoolsWidth } : undefined}
        >
          <div ref={devtoolsHostRef} className="absolute inset-0 bg-card" />
          {/* Motor 'view': o DevTools é outra view; enquanto algo cobre, fica só o fundo. */}
        </div>

        {/* Camada que captura o mouse durante o arraste (senão o webview "engole" o evento). */}
        {dtDragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      </div>

      {termOpen && (
        <div className="flex shrink-0 flex-col" style={{ height: termHeight }}>
          <DragHandle onMouseDown={startResize} />
          <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-card px-2.5 text-xs text-muted-foreground">
            <Terminal className="h-3.5 w-3.5" />
            <span className="truncate font-medium">
              {active
                ? t('preview.terminal_label', { projectName: active.name })
                : t('preview.terminal_bare')}
            </span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setTermOpen(false)}
              title={t('preview.close_terminal')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="relative min-h-0 flex-1">
            <LazyPanel label="Terminal">
              <ShellView
                activeProject={active?.path || null}
                visible={termOpen}
                onOpenUrl={navigateTo}
              />
            </LazyPanel>
          </div>
        </div>
      )}

      {/* Captura o mouse durante o arraste do terminal (senão o webview engole o evento). */}
      {termDragging && <div className="fixed inset-0 z-50 cursor-row-resize" />}
    </>
  );
}
