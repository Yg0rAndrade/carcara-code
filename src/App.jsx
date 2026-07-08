import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  Folder,
  Settings,
  SunMoon,
  RefreshCw,
  Square,
  MessageSquarePlus,
  PanelLeftClose,
  Eye,
  Code2,
  GitBranch,
  Zap,
  Plug,
  PenTool,
  History,
  Wrench,
  RotateCw,
  GripVertical,
  ListTodo,
} from 'lucide-react';
import { RefreshCCWIcon } from './components/ui/refresh-ccw.jsx';
import { XIcon } from './components/ui/x.jsx';
import { Rail } from './components/Rail.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { PreviewPanel } from './components/PreviewPanel.jsx';
import { CommandPalette } from './components/CommandPalette.jsx';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './components/ui/resizable.jsx';
import { Button } from './components/ui/button.jsx';
import { ResizeBar } from './components/ui/resize-bar.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { SetupScreen } from './components/SetupScreen.jsx';
import { RemoteProjectModal } from '@/components/RemoteProjectModal.jsx';
import { UpdatePill } from './components/UpdatePill.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Toaster } from './components/ui/toaster.jsx';
import { toast } from './lib/toast';
import { useTheme } from './lib/theme.jsx';
import { colorFor, initials } from './lib/projectColor';
import { useT } from './lib/i18n';
import { useLayout } from './lib/layoutContext.jsx';
import { resolveLayout } from './lib/layout.js';
import { toggleCollapse, renameFolder, dissolveFolder, applyDrop, addFolder } from './lib/railTree';
import { shouldShowChangelog } from './lib/changelog.js';

export default function App() {
  const t = useT();
  const { toggle: toggleTheme } = useTheme();
  const { railSide, claudeSide, setRailSide, setClaudeSideGlobal } = useLayout();
  const [projects, setProjects] = useState([]);
  const [rail, setRail] = useState([]); // layout do Rail: projetos soltos + pastas (ver railTree)
  const [active, setActive] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Ref pra disparar ações que vivem no ChatPanel (ex.: nova sessão) a partir da paleta.
  const chatControls = useRef(null);
  // Atividade do Claude por projeto: 'working' (pulsa) | 'attention' (terminou, você não viu).
  const [activity, setActivity] = useState({});
  // Refs pra ler valor atual dentro de listeners de longa duração (sem stale closure).
  const activeRef = useRef(null);
  const projectsRef = useRef([]);
  const [pendingRemove, setPendingRemove] = useState(null); // projeto aguardando confirmação
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [update, setUpdate] = useState({ state: 'idle' });
  const [pillDismissed, setPillDismissed] = useState(false);
  const [settingsTab, setSettingsTab] = useState('appearance');
  // Tela de preparo do 1º uso: aparece só até concluir uma vez. A flag mora no config.json
  // (via main), não no localStorage — começa fechada e abre só se o main disser que falta.
  const [setupOpen, setSetupOpen] = useState(false);
  // Modal de "adicionar projeto remoto (SSH)" — aberto pelo menu do botão "+" do Rail.
  const [remoteOpen, setRemoteOpen] = useState(false);
  const closeSetup = () => {
    window.api.markSetupDone();
    setSetupOpen(false);
  };
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
  const [chatSession, setChatSession] = useState(null); // aba de chat ativa (painel de Tarefas segue ela)
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
      setRailWidth((w) => {
        localStorage.setItem('railWidth', String(Math.round(w)));
        return w;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const reload = useCallback(async () => {
    const res = await window.api.listProjects();
    setProjects(res.projects);
    setRail(res.rail);
  }, []);

  // Mapa path -> projeto vivo, pro Rail resolver ícones/cores dos itens do layout.
  const projectByPath = useMemo(() => new Map(projects.map((p) => [p.path, p])), [projects]);

  // Aplica um novo layout de rail (otimista) e persiste; adota o rail reconciliado do main.
  const persistRail = useCallback(async (nextRail) => {
    setRail(nextRail);
    const res = await window.api.setRail(nextRail);
    if (res?.rail) setRail(res.rail);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Versão do app (uma vez), pra exibir no rail e em Configurações > Sobre. Também decide
  // se abre a aba "Novidades" sozinha (só quando já havia uma versão salva e ela mudou —
  // shouldShowChangelog trata o 1º uso sem incomodar). Grava lastSeenVersion sempre, pra
  // não repetir o auto-abrir na próxima vez que a versão continuar a mesma.
  useEffect(() => {
    window.api
      .getAppVersion()
      .then((v) => {
        setAppVersion(v);
        if (shouldShowChangelog(v, localStorage.getItem('lastSeenVersion'))) {
          setSettingsTab('whatsnew');
          setSettingsOpen(true);
        }
        localStorage.setItem('lastSeenVersion', v);
      })
      .catch(() => {});
  }, []);

  // Status da auto-atualização (canal único). Reabre a pílula a cada estado novo.
  useEffect(
    () =>
      window.api.on('update:status', (s) => {
        setUpdate(s || { state: 'idle' });
        setPillDismissed(false);
      }),
    [],
  );

  // Status de conexão SSH de projetos remotos (conectando/conectado/erro/etc.):
  // recarrega a lista pra refletir a bolinha de status no rail.
  useEffect(() => window.api.on('remote:status', () => reload()), [reload]);

  // No 1º uso (flag ausente no config.json), abre a tela de preparo. Migra quem já
  // tinha dispensado pelo localStorage antigo, pra não ver a tela de novo.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const done = await window.api.isSetupDone();
        if (!alive) return;
        if (done) return;
        if (localStorage.getItem('setupDone') === '1') {
          window.api.markSetupDone();
          return;
        }
        setSetupOpen(true);
      } catch {
        /* sem a ponte, não trava o app */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mantém refs em dia pros listeners de atividade lerem o estado atual.
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Lado do Claude e do rail são GLOBAIS (valem pra todos os projetos). Arrastar o
  // painel ou o rail muda o padrão de todos — não há mais override por projeto.
  const eff = resolveLayout({ railSide, claudeSide }, null);
  const claudeLeft = eff.claudeSide === 'left';
  const railFirst = eff.railSide === 'left';
  // Posição da "bolinha" de reabrir o chat: colada na borda EXTERNA do chat.
  const expandStyle = claudeLeft
    ? { left: Math.max(0, (railFirst ? railWidth : 0) - 14) }
    : { right: Math.max(0, (railFirst ? 0 : railWidth) - 14) };

  // Arrastar o painel do Claude (por projeto) ou o rail (global) de lado. NÃO usamos
  // HTML5 drag-and-drop: no Electron ele não inicia de forma confiável num "punho" só
  // com ícone e não entrega dragover/drop por cima do webview do Preview. Em vez disso,
  // usamos eventos de mouse (mousedown → mousemove/mouseup) + overlay full-screen — o
  // MESMO padrão do startRailResize, que já arrasta a janela inteira sem problema. O
  // overlay cobre o webview pra o mousemove continuar caindo na janela host.
  const [dragMode, setDragMode] = useState(null); // null | 'panel' | 'rail'
  const [dragZone, setDragZone] = useState(null); // 'left' | 'right'
  const startLayoutDrag = (mode, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragMode(mode);
    let zone = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
    setDragZone(zone);
    document.body.style.cursor = 'grabbing';
    const onMove = (ev) => {
      const z = ev.clientX < window.innerWidth / 2 ? 'left' : 'right';
      if (z !== zone) {
        zone = z;
        setDragZone(z);
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      if (mode === 'panel') {
        // Preserva a largura atual do painel ao trocar de lado: captura antes do swap
        // e reaplica no frame seguinte (a key estável já mantém a identidade do painel;
        // isto é garantia caso a lib reinicie no defaultSize ao reordenar).
        const size = chatPanelRef.current?.getSize?.();
        setClaudeSideGlobal(zone);
        if (typeof size === 'number') {
          requestAnimationFrame(() => {
            try {
              chatPanelRef.current?.resize?.(size);
            } catch {}
          });
        }
      } else if (mode === 'rail') {
        setRailSide(zone);
      }
      setDragMode(null);
      setDragZone(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Atividade do Claude (vinda do main): atualiza o indicador no rail e atende o clique
  // da notificação do SO (que pede pra abrir o projeto que terminou).
  useEffect(() => {
    const offState = window.api.on('activity:state', ({ projectPath, state, asking }) => {
      setActivity((cur) => {
        const next = { ...cur };
        if (state === 'working') {
          next[projectPath] = 'working';
        } else if (state === 'done') {
          // Parou de trabalhar. No projeto ABERTO não marca badge no rail — você já está
          // olhando, e o detalhe por SESSÃO aparece na aba (ver ChatPanel). Nos outros
          // projetos vira 'asking' (pediu confirmação) ou 'attention' (só terminou).
          if (activeRef.current?.path === projectPath) delete next[projectPath];
          else next[projectPath] = asking ? 'asking' : 'attention';
        } else {
          delete next[projectPath]; // idle/exit: limpa
        }
        return next;
      });
    });
    const offFocus = window.api.on('activity:focus', ({ projectPath }) => {
      const p = projectsRef.current.find((x) => x.path === projectPath);
      if (p) setActive(p);
    });
    return () => {
      offState?.();
      offFocus?.();
    };
  }, []);

  // Avisa o main qual projeto está em foco e apaga o badge do rail (atenção/asking) ao
  // abri-lo — o pulso de "trabalhando" continua, e o detalhe por sessão vai na aba.
  useEffect(() => {
    window.api.setActiveProject(active?.path || null);
    if (active) {
      setActivity((cur) => {
        if (cur[active.path] !== 'attention' && cur[active.path] !== 'asking') return cur;
        const next = { ...cur };
        delete next[active.path];
        return next;
      });
    }
  }, [active]);

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
        e.key === '=' || e.key === '+'
          ? 'in'
          : e.key === '-' || e.key === '_'
            ? 'out'
            : e.key === '0'
              ? 'reset'
              : null;
      if (!dir) return;
      e.preventDefault();
      localStorage.setItem('appZoom', String(window.api.zoom(dir)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl/Cmd+K abre (ou fecha) a paleta de comandos. Como o zoom acima, só pega
  // quando o foco está no app — dentro do webview do preview o atalho vai pra página.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Ctrl/Cmd+R recarrega a janela do app. O menu padrão do Electron (que traria esse
  // atalho de graça) foi removido por causa do bug de colagem dupla, então religamos só
  // o reload aqui. EXCEÇÃO: se o foco está num terminal (xterm — terminal livre ou Claude
  // Code), deixa passar pra o Ctrl+R virar a busca reversa do shell, não recarregar o app.
  useEffect(() => {
    const onKey = (e) => {
      if ((!e.ctrlKey && !e.metaKey) || e.altKey || e.key.toLowerCase() !== 'r') return;
      if (document.activeElement?.closest?.('.xterm')) return; // foco no terminal: Ctrl+R é do shell
      e.preventDefault();
      window.location.reload();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const addProjects = async () => {
    await window.api.addProjects();
    reload();
  };

  // Abre um arquivo na aba "Código" do projeto ativo (vindo da paleta de comandos).
  const openFileFromPalette = (file) => previewControls.current?.openFile?.(file);

  // Comandos da paleta (Ctrl+K). Trocar de projeto, abas do painel, servidor,
  // sessão de chat, tema e configurações. As ações de painel/servidor passam pelo
  // previewControls; a nova sessão pelo chatControls; o resto o App resolve direto.
  const commands = useMemo(() => {
    const view = (v) => () => previewControls.current?.setView?.(v);
    const list = [
      ...projects.map((p) => ({
        id: 'proj:' + p.path,
        group: t('app.cmd_group_projects'),
        label: p.name,
        hint: active?.path === p.path ? t('app.cmd_hint_current') : t('app.cmd_hint_open_project'),
        // Ícone real do projeto (favicon/logo), igual ao rail; sem ícone, o MESMO
        // avatar de iniciais e cor do rail (a pessoa associa pelo ícone, não pelo texto).
        icon: p.icon ? (
          <img src={p.icon} alt="" className="size-4 rounded-sm object-contain" />
        ) : (
          <span
            className="grid size-4 place-items-center rounded-sm text-[7px] font-bold leading-none text-white"
            style={{ background: colorFor(p.name) }}
          >
            {initials(p.name)}
          </span>
        ),
        run: () => setActive(p),
      })),
      {
        id: 'view:preview',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_preview'),
        hint: t('app.cmd_hint_tab'),
        icon: <Eye />,
        run: view('preview'),
      },
      {
        id: 'view:code',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_code'),
        hint: t('app.cmd_hint_tab'),
        icon: <Code2 />,
        run: view('code'),
      },
      {
        id: 'view:git',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_git'),
        hint: t('app.cmd_hint_tab'),
        icon: <GitBranch />,
        run: view('git'),
      },
      {
        id: 'view:todos',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_todos'),
        hint: t('app.cmd_hint_tab'),
        icon: <ListTodo />,
        run: view('todos'),
      },
      {
        id: 'view:history',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_history'),
        hint: t('app.cmd_hint_tab'),
        icon: <History />,
        run: view('history'),
      },
      {
        id: 'view:api',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_api'),
        hint: t('app.cmd_hint_tab'),
        icon: <Zap />,
        run: view('api'),
      },
      {
        id: 'view:mcp',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_mcp'),
        hint: t('app.cmd_hint_tab'),
        icon: <Plug />,
        run: view('mcp'),
      },
      {
        id: 'view:board',
        group: t('app.cmd_group_panel'),
        label: t('app.cmd_view_board'),
        hint: t('app.cmd_hint_tab'),
        icon: <PenTool />,
        run: view('board'),
      },
      {
        id: 'srv:restart',
        group: t('app.cmd_group_server'),
        label: t('app.cmd_restart_server'),
        hint: t('app.cmd_hint_preview'),
        icon: <RefreshCw />,
        run: () => previewControls.current?.restart?.(),
      },
      {
        id: 'srv:stop',
        group: t('app.cmd_group_server'),
        label: t('app.cmd_stop_server'),
        hint: t('app.cmd_hint_preview'),
        icon: <Square />,
        run: () => previewControls.current?.stop?.(),
      },
      {
        id: 'chat:new',
        group: t('app.cmd_group_chat'),
        label: t('app.cmd_new_chat_session'),
        hint: t('app.cmd_hint_tab'),
        icon: <MessageSquarePlus />,
        run: () => chatControls.current?.newSession?.(),
      },
      {
        id: 'chat:toggle',
        group: t('app.cmd_group_chat'),
        label: t('app.cmd_toggle_chat'),
        icon: <PanelLeftClose />,
        run: toggleChat,
      },
      {
        id: 'app:add',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_add_project'),
        icon: <FolderPlus />,
        run: addProjects,
      },
      {
        id: 'app:add_folder',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_add_folder'),
        icon: <Folder />,
        run: () => persistRail(addFolder(rail)),
      },
      {
        id: 'app:theme',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_toggle_theme'),
        icon: <SunMoon />,
        run: toggleTheme,
      },
      {
        id: 'app:settings',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_settings'),
        icon: <Settings />,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'app:setup',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_setup_tools'),
        icon: <Wrench />,
        run: () => setSetupOpen(true),
      },
      {
        id: 'app:reload',
        group: t('app.cmd_group_app'),
        label: t('app.cmd_reload_app'),
        hint: 'Ctrl/Cmd+R',
        icon: <RotateCw />,
        run: () => window.location.reload(),
      },
    ];
    // Sem projeto ativo, ações de painel/servidor/chat ficam inertes — filtra-as.
    const projectsGroup = t('app.cmd_group_projects');
    const appGroup = t('app.cmd_group_app');
    return active ? list : list.filter((c) => c.group === projectsGroup || c.group === appGroup);
  }, [projects, active, rail, persistRail, toggleTheme, t]);

  // Reordena (drag-and-drop): atualiza na hora e salva a ordem no config.json.
  const reorderProjects = async (orderedPaths) => {
    setProjects((cur) => {
      const byPath = new Map(cur.map((p) => [p.path, p]));
      return orderedPaths.map((p) => byPath.get(p)).filter(Boolean);
    });
    await window.api.reorderProjects(orderedPaths);
  };

  // Parar/Reiniciar o preview de um projeto direto pelo menu do rail (botão direito),
  // sem precisar abri-lo. Se for o projeto ATIVO, usa os controles do PreviewPanel
  // (mantém o log/empty state casados); senão, fala direto com o main e atualiza a
  // bolinha verde via reload().
  const restartProject = async (p) => {
    if (!p) return;
    if (active?.path === p.path && previewControls.current?.restart) {
      previewControls.current.restart();
      return;
    }
    await window.api.stopPreview(p.path);
    await window.api.startPreview(p.path);
    reload();
  };
  const stopProject = async (p) => {
    if (!p) return;
    if (active?.path === p.path && previewControls.current?.stop) {
      previewControls.current.stop();
      return;
    }
    await window.api.stopPreview(p.path);
    reload();
  };

  const confirmRemove = async () => {
    const p = pendingRemove;
    setPendingRemove(null);
    if (!p) return;
    await window.api.removeProject(p.path);
    setActive((cur) => (cur?.path === p.path ? null : cur));
    reload();
  };

  // Customização do projeto no rail (nome, cor, ícone). Persiste no main e recarrega a
  // lista pra refletir na hora — inclusive no projeto ativo (o header lê o mesmo `name`).
  const renameProject = async (p, name) => {
    if (!p) return;
    await window.api.renameProject(p.path, name);
    // Nome vazio volta ao basename da pasta — precisa refletir no header do projeto
    // ativo na hora (não cair no cur.name antigo, senão o rótulo customizado "gruda").
    const clean = (name || '').trim();
    const basename = p.path.split(/[\\/]/).filter(Boolean).pop() || p.path;
    setActive((cur) => (cur?.path === p.path ? { ...cur, name: clean || basename } : cur));
    reload();
  };
  const setProjectColor = async (p, color) => {
    if (!p) return;
    await window.api.setProjectColor(p.path, color);
    reload();
  };
  const setProjectIcon = async (p, dataUrl) => {
    if (!p) return;
    const res = await window.api.setProjectIcon(p.path, dataUrl);
    if (res && res.error === 'too_large') {
      toast.error(t('rail.image_too_large'));
      return;
    }
    if (res && res.ok === false) {
      toast.error(t('rail.image_invalid'));
      return;
    }
    if (dataUrl) toast.success(t('rail.image_updated')); // sucesso só ao definir (não ao remover)
    reload();
  };
  const resetProjectCustom = async (p) => {
    if (!p) return;
    await window.api.resetProjectCustom(p.path);
    // Restaurar padrão volta ao basename — atualiza o header do projeto ativo na hora.
    const basename = p.path.split(/[\\/]/).filter(Boolean).pop() || p.path;
    setActive((cur) => (cur?.path === p.path ? { ...cur, name: basename } : cur));
    reload();
  };

  // Realce de onde vai encostar: uma FAIXA do tamanho real do que está sendo movido
  // (largura do rail pro rail; ~largura do painel do Claude pro painel), no lado-alvo —
  // não a metade inteira da tela. O painel encosta depois do rail, se o rail estiver
  // desse mesmo lado, então a faixa é deslocada por railWidth nesse caso.
  let dropStyle = null;
  if (dragMode && dragZone) {
    if (dragMode === 'rail') {
      dropStyle =
        dragZone === 'left'
          ? { left: 0, top: 0, bottom: 0, width: railWidth }
          : { right: 0, top: 0, bottom: 0, width: railWidth };
    } else {
      // Largura REAL do painel do Claude agora (respeita o resize do usuário): a API do
      // react-resizable-panels dá o tamanho em % do grupo; o grupo ocupa a janela menos
      // o rail. Cai pra 34% se o ref ainda não existir.
      const pct = chatPanelRef.current?.getSize?.() || 34;
      const band = Math.round((pct / 100) * (window.innerWidth - railWidth));
      const railOnLeft = eff.railSide === 'left';
      dropStyle =
        dragZone === 'left'
          ? { left: railOnLeft ? railWidth : 0, top: 0, bottom: 0, width: band }
          : { right: railOnLeft ? 0 : railWidth, top: 0, bottom: 0, width: band };
    }
  }

  const railEl = (
    <Rail
      projects={projects}
      rail={rail}
      projectByPath={projectByPath}
      active={active}
      activity={activity}
      onOpen={setActive}
      onAdd={addProjects}
      onAddRemote={() => setRemoteOpen(true)}
      onRemove={setPendingRemove}
      onRestart={restartProject}
      onStop={stopProject}
      onReorder={reorderProjects}
      onAddFolder={() => persistRail(addFolder(rail))}
      onToggleFolder={(id) => persistRail(toggleCollapse(rail, id))}
      onApplyDrop={(ctx) =>
        persistRail(applyDrop(rail, { ...ctx, newFolderName: t('rail.folder_default') }))
      }
      onRenameFolder={(id, name) => persistRail(renameFolder(rail, id, name))}
      onDissolveFolder={(id) => persistRail(dissolveFolder(rail, id))}
      onRename={renameProject}
      onSetColor={setProjectColor}
      onSetIcon={setProjectIcon}
      onResetCustom={resetProjectCustom}
      onOpenSettings={() => setSettingsOpen(true)}
      onSearch={() => setPaletteOpen(true)}
      onRailGrab={(e) => startLayoutDrag('rail', e)}
      width={railWidth}
      version={appVersion}
      update={update}
      onOpenAbout={() => {
        setSettingsTab('about');
        setSettingsOpen(true);
      }}
    />
  );
  const barEl = <ResizeBar onMouseDown={startRailResize} />;

  const chatPanel = (
    <ResizablePanel
      key="chat"
      ref={chatPanelRef}
      id="chat"
      order={claudeLeft ? 1 : 2}
      defaultSize={34}
      minSize={22}
      collapsible
      collapsedSize={0}
      onCollapse={() => setChatCollapsed(true)}
      onExpand={() => setChatCollapsed(false)}
      className={'flex flex-col ' + (claudeLeft ? 'border-r' : 'border-l')}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        {active && (
          <span
            onMouseDown={(e) => startLayoutDrag('panel', e)}
            title={t('app.move_claude_tooltip')}
            className="grid size-7 shrink-0 cursor-grab place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing [&_svg]:size-[15px]"
          >
            <GripVertical />
          </span>
        )}
        <span className="truncate text-[15px] font-semibold">
          {active ? active.name : t('app.no_project_selected')}
        </span>
        {active?.previewType != null && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => previewControls.current?.restart?.()}
              onMouseEnter={() => restartIcon.current?.startAnimation?.()}
              onMouseLeave={() => restartIcon.current?.stopAnimation?.()}
              title={t('app.restart_server_tooltip')}
              className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground [&_svg]:size-[15px]"
            >
              <RefreshCCWIcon ref={restartIcon} />
              {t('app.restart_server_btn')}
            </button>
            <button
              type="button"
              onClick={() => previewControls.current?.stop?.()}
              onMouseEnter={() => stopIcon.current?.startAnimation?.()}
              onMouseLeave={() => stopIcon.current?.stopAnimation?.()}
              disabled={serverMode !== 'web'}
              title={t('app.stop_server_tooltip')}
              className="flex h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]"
            >
              <XIcon ref={stopIcon} />
              {t('app.stop_server_btn')}
            </button>
          </div>
        )}
      </div>
      <ErrorBoundary label="Chat">
        <ChatPanel
          activeProject={active?.path || null}
          controlsRef={chatControls}
          onActiveSessionChange={setChatSession}
        />
      </ErrorBoundary>
    </ResizablePanel>
  );

  const handleEl = (
    <ResizableHandle key="handle" withHandle>
      {!chatCollapsed && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleChat}
          title={t('app.collapse_chat_tooltip')}
          className="absolute left-1/2 top-1/3 z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          {claudeLeft ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      )}
    </ResizableHandle>
  );

  const previewPanel = (
    <ResizablePanel
      key="preview"
      id="preview"
      order={claudeLeft ? 2 : 1}
      minSize={28}
      className="flex flex-col"
    >
      <ErrorBoundary label="Preview">
        <PreviewPanel
          active={active}
          chatSession={chatSession}
          onProjectsChanged={reload}
          controlsRef={previewControls}
          onModeChange={setServerMode}
        />
      </ErrorBoundary>
    </ResizablePanel>
  );

  return (
    <div className="relative flex h-screen bg-background text-foreground">
      {railFirst && (
        <>
          {railEl}
          {barEl}
        </>
      )}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {claudeLeft ? (
          <>
            {chatPanel}
            {handleEl}
            {previewPanel}
          </>
        ) : (
          <>
            {previewPanel}
            {handleEl}
            {chatPanel}
          </>
        )}
      </ResizablePanelGroup>
      {!railFirst && (
        <>
          {barEl}
          {railEl}
        </>
      )}

      {pendingRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={() => setPendingRemove(null)}
        >
          <div
            className="w-[340px] rounded-lg border bg-background p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">{t('app.remove_project_title')}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t('app.remove_project_message', { name: pendingRemove.name })}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPendingRemove(null)}>
                {t('app.cancel_button')}
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmRemove}>
                {t('app.remove_button')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bolinha de reabrir o chat: colada na borda externa do chat (segue o lado). */}
      {chatCollapsed && (
        <button
          type="button"
          onClick={() => chatPanelRef.current?.expand()}
          style={expandStyle}
          title={t('app.expand_chat_tooltip')}
          className="absolute top-1/3 z-40 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground"
        >
          {claudeLeft ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}

      {!pillDismissed && (
        <UpdatePill
          update={update}
          onDownload={() => window.api.updateDownload()}
          onInstall={() => window.api.updateInstall()}
          onRetry={() => window.api.updateCheck()}
          onDismiss={() => setPillDismissed(true)}
        />
      )}
      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        appVersion={appVersion}
        update={update}
        onUpdateCheck={() => window.api.updateCheck()}
        onUpdateDownload={() => window.api.updateDownload()}
        onUpdateInstall={() => window.api.updateInstall()}
        onClose={() => setSettingsOpen(false)}
      />
      <SetupScreen open={setupOpen} onClose={closeSetup} />
      <RemoteProjectModal
        open={remoteOpen}
        onClose={() => setRemoteOpen(false)}
        onAdded={() => reload()}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        activePath={active?.path || null}
        onOpenFile={openFileFromPalette}
      />
      {/* Overlay durante o arraste: cobre a janela (inclusive o webview do Preview) pra o
          mousemove continuar caindo na host, e mostra o realce da metade onde vai cair. */}
      {dragMode && (
        <div className="fixed inset-0 z-50 cursor-grabbing">
          {dropStyle && (
            <div
              className="pointer-events-none absolute border-2 border-primary bg-primary/15 transition-all duration-75"
              style={dropStyle}
            />
          )}
        </div>
      )}
      {railResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      <Toaster />
    </div>
  );
}
