import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Sun,
  Moon,
  X,
  Check,
  Paintbrush,
  FolderKanban,
  Monitor,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Bell,
  Sparkles,
  Heart,
  Globe,
  Mail,
  ExternalLink,
  Code2,
  Download,
  Save,
  HardDrive,
  RefreshCw,
  WrapText,
  Search,
  ArrowDownAZ,
  ArrowUpAZ,
} from 'lucide-react';
import { useTheme } from '@/lib/theme.jsx';
import { Input } from './ui/input.jsx';
import { Switch } from './ui/switch.jsx';
import { Button } from './ui/button.jsx';
import { useDependencyStatus, DependencyCards } from './SetupScreen.jsx';
import { cn } from '@/lib/utils';
import { AI_OPTIONS, OPT, CliBadge } from '@/lib/aiOptions.jsx';
import { filterAndSortProjects } from '@/lib/projectFilter.js';
import ygorPhoto from '@/assets/ygor/ygor-andrade.jpg';
import { useT, useLang } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/languages';
import { Flag } from '@/lib/flags.jsx';
import { updateView } from '@/lib/updateView';
import { useLayout } from '@/lib/layoutContext.jsx';
import { useChatMode } from '@/lib/chatModeContext.jsx';
// Notas de versão (aba "Novidades"): o CHANGELOG.md da raiz vira texto em build-time via
// import ?raw do Vite — sem IPC, sem duplicar o arquivo. Markdown.jsx é lazy (mesmo padrão
// do ChatPanel) pra não puxar react-markdown/highlight.js pro bundle inicial do app.
import changelogText from '../../CHANGELOG.md?raw';

const Markdown = lazy(() => import('./Markdown.jsx'));
// AiManager só aparece na aba "Gerenciar IAs" — lazy pra não pesar o boot do app
// (o SettingsModal é importado no caminho inicial). Mesmo padrão do Markdown.
const AiManager = lazy(() => import('./AiManager.jsx'));

// Ícones de marca em SVG inline — o lucide removeu os logos de marca (questão de trademark),
// então desenhamos aqui. Herdam currentColor e tamanho via className do <span> que os envolve.
function GithubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.62 8.21 11.18.6.11.82-.25.82-.56v-2.1c-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.33-1.72-1.33-1.72-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.49.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.3-5.47-5.79 0-1.28.47-2.33 1.24-3.15-.13-.3-.54-1.5.11-3.13 0 0 1.01-.32 3.3 1.2a11.6 11.6 0 0 1 6 0c2.29-1.52 3.3-1.2 3.3-1.2.65 1.63.24 2.83.12 3.13.77.82 1.23 1.87 1.23 3.15 0 4.5-2.81 5.49-5.49 5.78.43.37.81 1.1.81 2.22v3.29c0 .31.22.68.83.56C20.57 21.9 24 17.5 24 12.29 24 5.78 18.63.5 12 .5Z" />
    </svg>
  );
}
function LinkedinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}
function InstagramIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.5 6.5a3 3 0 0 0-2.12-2.13C19.5 3.86 12 3.86 12 3.86s-7.5 0-9.38.51A3 3 0 0 0 .5 6.5C0 8.38 0 12 0 12s0 3.62.5 5.5a3 3 0 0 0 2.12 2.13c1.88.51 9.38.51 9.38.51s7.5 0 9.38-.51a3 3 0 0 0 2.12-2.13C24 15.62 24 12 24 12s0-3.62-.5-5.5ZM9.6 15.6V8.4l6.25 3.6L9.6 15.6Z" />
    </svg>
  );
}

// Quem fez o Carcará Code. Adicione/remova redes aqui — a tela "Sobre" se monta sozinha.
// 'href' pode ser https://… (abre no navegador) ou mailto:… (abre o e-mail).
// 'sub' é uma CHAVE de tradução (resolvida com t(link.sub) no render).
const AUTHOR = {
  name: 'Ygor Andrade',
  role: 'settings.aboutRole',
  blurb: 'settings.aboutBlurb',
  links: [
    {
      key: 'site',
      label: 'ygorandrade.work',
      sub: 'settings.linkSite',
      href: 'https://www.ygorandrade.work/',
      Icon: Globe,
    },
    {
      key: 'email',
      label: 'ygormartinsandrade@gmail.com',
      sub: 'settings.linkEmail',
      href: 'mailto:ygormartinsandrade@gmail.com',
      Icon: Mail,
    },
    {
      key: 'github',
      label: '@Yg0rAndrade',
      sub: 'settings.linkGithub',
      href: 'https://github.com/Yg0rAndrade',
      Icon: GithubIcon,
    },
    {
      key: 'linkedin',
      label: 'Ygor Andrade',
      sub: 'settings.linkLinkedin',
      href: 'https://www.linkedin.com/in/ygor-andrade-8979a026a/',
      Icon: LinkedinIcon,
    },
    {
      key: 'instagram',
      label: '@ygor_andr4de',
      sub: 'settings.linkInstagram',
      href: 'https://www.instagram.com/ygor_andr4de/',
      Icon: InstagramIcon,
    },
    {
      key: 'youtube',
      label: '@ygor_andrade',
      sub: 'settings.linkYoutube',
      href: 'https://www.youtube.com/@ygor_andrade',
      Icon: YoutubeIcon,
    },
  ],
};

// Abre links externos pela ponte do Electron; mailto: cai no openExternal também (shell resolve o handler).
function openLink(href) {
  if (window.api?.openExternal) window.api.openExternal(href);
  else window.open(href, '_blank');
}

// Os 4 layouts possíveis (lado do rail x lado do Claude). labelKey = chave i18n.
const LAYOUT_PRESETS = [
  { rail: 'left', claude: 'left', labelKey: 'settings.layoutPresetLL' },
  { rail: 'left', claude: 'right', labelKey: 'settings.layoutPresetLR' },
  { rail: 'right', claude: 'left', labelKey: 'settings.layoutPresetRL' },
  { rail: 'right', claude: 'right', labelKey: 'settings.layoutPresetRR' },
];

// Miniatura do layout: barra fina = rail; bloco com borda = Claude; bloco claro = preview.
function LayoutThumb({ rail, claude }) {
  const railBar = <span key="r" className="h-full w-1.5 rounded-sm bg-primary/70" />;
  const claudeBox = (
    <span key="c" className="h-full flex-1 rounded-sm border border-primary bg-primary/20" />
  );
  const previewBox = <span key="p" className="h-full flex-1 rounded-sm bg-muted-foreground/20" />;
  const panels = claude === 'left' ? [claudeBox, previewBox] : [previewBox, claudeBox];
  const all = rail === 'left' ? [railBar, ...panels] : [...panels, railBar];
  return <span className="flex h-10 w-full items-stretch gap-1">{all}</span>;
}

export function SettingsModal({
  open,
  onClose,
  initialTab = 'appearance',
  initialInstall = null,
  appVersion = '',
  update = { state: 'idle' },
  onUpdateCheck,
  onUpdateDownload,
  onUpdateInstall,
}) {
  const { theme, setTheme, terminalAppearance, setTerminalAppearance } = useTheme();
  const t = useT();
  const { lang, setLang } = useLang();
  const { railSide, claudeSide, setPreset } = useLayout();
  const { chatMode, setChatMode } = useChatMode();
  const [tab, setTab] = useState(initialTab);
  // Quando reabre apontando pra uma aba específica (ex.: clique na versão do rail).
  // Também guarda o auto-install quando o App abre já pedindo "instalar a CLI X"
  // (clique numa CLI ausente no AiPicker da aba nova) — o initialTab já é 'clis'.
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setPendingInstall(initialInstall);
      // Zera a confirmação de instalação pendente: sem isso, fechar (Esc/X) com o
      // overlay aberto e reabrir na aba de IA reexibe um confirm de uma sessão antiga.
      setConfirmInstall(null);
    }
  }, [open, initialTab, initialInstall]);
  const [projects, setProjects] = useState([]);
  const [sel, setSel] = useState({}); // path -> { ais, custom }
  const [ports, setPorts] = useState({}); // path -> { staticPort, currentPort, draft, error }
  const [aiQuery, setAiQuery] = useState(''); // filtro de busca da lista "IA por projeto"
  const [aiSort, setAiSort] = useState('default'); // 'default' | 'asc' | 'desc'
  const [pendingInstall, setPendingInstall] = useState(null); // key a auto-instalar (Task 8)
  const [installedKeys, setInstalledKeys] = useState(null); // Set|null (null = ainda carregando)
  const [confirmInstall, setConfirmInstall] = useState(null); // key da CLI ausente a confirmar
  const [zoom, setZoom] = useState(1); // fator de zoom da janela (1 = 100%)
  const [notify, setNotify] = useState(true); // notificar quando o Claude termina
  const [autoSave, setAutoSave] = useState(false); // salvar arquivos do editor automaticamente
  const [wordWrap, setWordWrap] = useState(false); // quebrar linhas longas no editor (estilo VS Code)
  const [shells, setShells] = useState([]); // shells instalados detectados no main { id, label }
  const [shellPref, setShellPref] = useState('auto'); // shell escolhido ('auto' = padrão do SO)
  // Detecta as dependências (Node/Git) só quando a aba está aberta — mesmo motor da tela de preparo.
  const deps = useDependencyStatus(open && tab === 'deps');

  // Lê o zoom atual ao abrir (mesma fonte do atalho Ctrl +/-: webFrame + localStorage).
  useEffect(() => {
    if (!open) return;
    setZoom(Number(localStorage.getItem('appZoom')) || window.api.getZoom() || 1);
    setAutoSave(localStorage.getItem('codeAutoSave') === '1');
    setWordWrap(localStorage.getItem('codeWordWrap') === '1');
    window.api
      .getNotify()
      .then((r) => setNotify(r?.enabled !== false))
      .catch(() => {});
    // Shells instalados + escolha atual (detecção roda no main).
    window.api
      .listShells?.()
      .then((r) => {
        if (!r) return;
        setShells(r.choices || []);
        setShellPref(r.current || 'auto');
      })
      .catch(() => {});
  }, [open]);

  const pickShell = (id) => {
    setShellPref(id);
    window.api.setShell?.(id);
  };

  // Re-varre os shells (útil se o usuário instalou um com o app aberto).
  const rescanShells = () => {
    window.api
      .rescanShells?.()
      .then((r) => {
        if (!r) return;
        setShells(r.choices || []);
        setShellPref(r.current || 'auto');
      })
      .catch(() => {});
  };

  const toggleNotify = () => {
    setNotify((v) => {
      const next = !v;
      window.api.setNotify(next);
      return next;
    });
  };

  // Alterna o painel esquerdo entre terminal (cli) e chat assistant-ui (beta). O contexto
  // (chatModeContext) já grava no config.json via preload e atualiza o App ao vivo.
  const toggleChatMode = () => setChatMode(chatMode === 'chat' ? 'cli' : 'chat');

  // Autosave é só do renderer (o CodeView lê e salva). Guarda em localStorage e avisa
  // o CodeView na hora via evento — assim ligar/desligar vale sem reabrir o editor.
  const toggleAutoSave = () => {
    setAutoSave((v) => {
      const next = !v;
      localStorage.setItem('codeAutoSave', next ? '1' : '0');
      window.dispatchEvent(new CustomEvent('ygc:autosave', { detail: next }));
      return next;
    });
  };

  // Quebra de linha também é só do renderer (o CodeView lê e aplica). Mesmo esquema do
  // autosave: localStorage + evento pra valer na hora, sem reabrir o editor.
  const toggleWordWrap = () => {
    setWordWrap((v) => {
      const next = !v;
      localStorage.setItem('codeWordWrap', next ? '1' : '0');
      window.dispatchEvent(new CustomEvent('ygc:wordwrap', { detail: next }));
      return next;
    });
  };

  const applyZoom = (dir) => {
    const f = window.api.zoom(dir);
    localStorage.setItem('appZoom', String(f));
    setZoom(f);
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      // projects:list devolve { projects, rail } (pastas do rail); aqui só a lista importa.
      const res = await window.api.listProjects();
      const list = Array.isArray(res) ? res : res?.projects || [];
      setProjects(list);
      const entries = await Promise.all(
        list.map(async (p) => [p.path, await window.api.getAi(p.path)]),
      );
      setSel(Object.fromEntries(entries));
      const portEntries = await Promise.all(
        list.map(async (p) => {
          const r = (await window.api.getPort(p.path)) || {};
          return [
            p.path,
            {
              on: !!r.staticPort,
              staticPort: r.staticPort || null,
              currentPort: r.currentPort || null,
              draft: r.staticPort ? String(r.staticPort) : '',
              error: '',
            },
          ];
        }),
      );
      setPorts(Object.fromEntries(portEntries));
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Status de instalação das CLIs — pra pintar de cinza as ausentes na aba "Por projeto".
  // Recarrega toda vez que o modal abre (o SettingsModal nunca desmonta, então sem isso
  // ficaria preso no status do início do app, ignorando instalações feitas na sessão).
  // Enquanto for null não pinta nada (evita flicker no primeiro render).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    window.api
      .aiStatus()
      .then(
        (s) => alive && setInstalledKeys(new Set(s.filter((r) => r.installed).map((r) => r.key))),
      )
      .catch(() => alive && setInstalledKeys(new Set()));
    return () => {
      alive = false;
    };
  }, [open]);
  // carcara não é uma CLI do catálogo (o motor OpenCode se auto-instala sob demanda),
  // então é sempre "disponível" — nunca cai no fluxo de instalação. Ver [[carcara-add-ai-integration-points]].
  const isInstalled = (key) =>
    key === 'custom' ||
    key === 'shell' ||
    key === 'carcara' ||
    !installedKeys ||
    installedKeys.has(key);

  if (!open) return null;

  const toggle = (path, key) => {
    setSel((s) => {
      const cur = s[path] || { ais: ['claude'], custom: '' };
      const has = cur.ais.includes(key);
      let ais = has ? cur.ais.filter((k) => k !== key) : [...cur.ais, key];
      if (ais.length === 0) ais = cur.ais; // nunca zera: mantém a seleção anterior
      const next = { ...s, [path]: { ...cur, ais } };
      window.api.setAi(path, ais, next[path].custom);
      return next;
    });
  };
  const onCustom = (path, val) => {
    setSel((s) => {
      const cur = s[path] || { ais: ['claude'], custom: '' };
      const next = { ...s, [path]: { ...cur, custom: val } };
      if (cur.ais.includes('custom')) window.api.setAi(path, cur.ais, val);
      return next;
    });
  };

  // --- Porta fixa por projeto ---
  const portEntry = (path) =>
    ports[path] || { on: false, staticPort: null, currentPort: null, draft: '', error: '' };
  // Liga/desliga o campo. Desligar limpa a preferência no main na hora; ligar só abre o
  // campo (o valor é salvo quando o usuário confirma um número válido).
  const togglePort = (path) => {
    setPorts((s) => {
      const cur = s[path] || {};
      if (cur.on) {
        window.api.setPort(path, null);
        return { ...s, [path]: { ...cur, on: false, staticPort: null, draft: '', error: '' } };
      }
      return { ...s, [path]: { ...cur, on: true, error: '' } };
    });
  };
  const onPortDraft = (path, val) => {
    const clean = val.replace(/[^0-9]/g, '').slice(0, 5);
    setPorts((s) => ({ ...s, [path]: { ...portEntry(path), draft: clean, error: '' } }));
  };
  // Confirma (blur/Enter): valida faixa localmente e persiste via main (unicidade lá).
  const commitPort = async (path) => {
    const cur = portEntry(path);
    const raw = cur.draft.trim();
    if (!raw) {
      // Campo vazio com toggle ligado: apaga a preferência (equivale a desligar o valor).
      window.api.setPort(path, null);
      setPorts((s) => ({ ...s, [path]: { ...cur, staticPort: null, error: '' } }));
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      setPorts((s) => ({ ...s, [path]: { ...cur, error: t('settings.portRange') } }));
      return;
    }
    const res = (await window.api.setPort(path, n)) || {};
    if (!res.ok) {
      const msg = res.error === 'duplicate' ? t('settings.portDuplicate') : t('settings.portRange');
      setPorts((s) => ({ ...s, [path]: { ...portEntry(path), error: msg } }));
      return;
    }
    setPorts((s) => ({
      ...s,
      [path]: {
        ...portEntry(path),
        staticPort: res.staticPort,
        draft: String(res.staticPort),
        error: res.warnWellKnown ? t('settings.portWellKnown') : '',
      },
    }));
  };

  // Lista visível da aba "IA por projeto": filtro por busca + ordenação por nome (pura, testada
  // em src/lib/projectFilter.js). 'default' preserva a ordem que veio do Rail.
  const visibleProjects = filterAndSortProjects(projects, { query: aiQuery, sort: aiSort });

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* Navegação lateral */}
      <div className="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-card p-3">
        <div className="px-2 py-2 text-base font-semibold">{t('settings.title')}</div>
        <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<FolderKanban />}>
          {t('settings.tabAi')}
        </TabButton>
        <TabButton active={tab === 'clis'} onClick={() => setTab('clis')} icon={<Download />}>
          {t('settings.tabClis')}
        </TabButton>
        <TabButton
          active={tab === 'appearance'}
          onClick={() => setTab('appearance')}
          icon={<Paintbrush />}
        >
          {t('settings.tabAppearance')}
        </TabButton>
        <TabButton active={tab === 'code'} onClick={() => setTab('code')} icon={<Code2 />}>
          {t('settings.tabCode')}
        </TabButton>
        <TabButton
          active={tab === 'terminal'}
          onClick={() => setTab('terminal')}
          icon={<Terminal />}
        >
          {t('settings.tabTerminal')}
        </TabButton>
        <TabButton active={tab === 'notify'} onClick={() => setTab('notify')} icon={<Bell />}>
          {t('settings.tabNotify')}
        </TabButton>
        <TabButton active={tab === 'deps'} onClick={() => setTab('deps')} icon={<HardDrive />}>
          {t('settings.tabDeps')}
        </TabButton>
        <TabButton active={tab === 'language'} onClick={() => setTab('language')} icon={<Globe />}>
          {t('settings.tabLanguage')}
        </TabButton>
        <TabButton
          active={tab === 'whatsnew'}
          onClick={() => setTab('whatsnew')}
          icon={<Sparkles />}
        >
          {t('settings.tabWhatsNew')}
        </TabButton>
        <div className="my-1.5 border-t" />
        <TabButton active={tab === 'about'} onClick={() => setTab('about')} icon={<Heart />}>
          {t('settings.tabAbout')}
        </TabButton>
      </div>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="text-[15px] font-semibold">
            {tab === 'ai'
              ? t('settings.tabAi')
              : tab === 'clis'
                ? t('settings.tabClis')
                : tab === 'code'
                  ? t('settings.tabCode')
                  : tab === 'terminal'
                    ? t('settings.tabTerminal')
                    : tab === 'notify'
                      ? t('settings.tabNotify')
                    : tab === 'deps'
                      ? t('settings.tabDeps')
                      : tab === 'language'
                        ? t('settings.tabLanguage')
                        : tab === 'whatsnew'
                          ? t('settings.tabWhatsNew')
                          : tab === 'about'
                            ? t('settings.tabAbout')
                            : t('settings.tabAppearance')}
          </h1>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            title={t('settings.close')}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[18px]"
          >
            <X />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Container compartilhado: largura ~80% da viewport (≈10% de margem branca de
              cada lado), com teto pra telas gigantes. Vale pra TODAS as abas. */}
          <div className="mx-auto w-[82vw] max-w-[1200px]">
            {tab === 'ai' && (
              <div className="relative mx-auto max-w-5xl">
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.aiIntroPre')}
                    <span className="font-medium text-foreground">
                      {t('settings.aiNewSessions')}
                    </span>
                    {t('settings.aiIntroPost')}
                  </p>

                  {/* Modo de chat (beta): terminal cru vs UI assistant-ui. Aditivo — o padrão é o
                      terminal; ligar só troca o painel esquerdo, o resto do app não muda. */}
                  <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        Chat em vez do terminal
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          beta
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Mostra um painel de chat em HTML/CSS no lugar do terminal do Claude Code.
                        Ainda em construção — o terminal continua sendo o modo completo e volta a um
                        clique.
                      </p>
                    </div>
                    <Switch
                      checked={chatMode === 'chat'}
                      onCheckedChange={toggleChatMode}
                      title={chatMode === 'chat' ? 'Usando chat' : 'Usando terminal'}
                      className="mt-0.5"
                    />
                  </div>

                  <div className="mt-5 flex flex-col gap-3">
                    {projects.length === 0 && (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {t('settings.aiEmpty')}
                      </div>
                    )}
                    {projects.length > 1 && (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            value={aiQuery}
                            onChange={(e) => setAiQuery(e.target.value)}
                            placeholder={t('settings.aiSearchPlaceholder')}
                            className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setAiSort((s) =>
                              s === 'asc' ? 'desc' : s === 'desc' ? 'default' : 'asc',
                            )
                          }
                          title={t(
                            aiSort === 'asc'
                              ? 'settings.aiSortAsc'
                              : aiSort === 'desc'
                                ? 'settings.aiSortDesc'
                                : 'settings.aiSortDefault',
                          )}
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-md border transition-colors hover:bg-muted',
                            aiSort !== 'default' && 'border-primary text-primary',
                          )}
                        >
                          {aiSort === 'desc' ? (
                            <ArrowUpAZ className="size-4" />
                          ) : (
                            <ArrowDownAZ className="size-4" />
                          )}
                        </button>
                      </div>
                    )}
                    {visibleProjects.length === 0 && projects.length > 0 && (
                      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                        {t('settings.aiNoResults')}
                      </div>
                    )}
                    {visibleProjects.map((p) => {
                      const cur = sel[p.path] || { ais: ['claude'], custom: '' };
                      return (
                        <div key={p.path} className="rounded-lg border p-3">
                          <div className="mb-2.5 flex items-center gap-2">
                            {p.icon ? (
                              <img
                                src={p.icon}
                                alt=""
                                className="size-8 rounded-md object-contain"
                              />
                            ) : (
                              <span className="grid size-8 place-items-center rounded-md bg-muted text-sm font-semibold uppercase">
                                {p.name?.[0] || '?'}
                              </span>
                            )}
                            <span
                              className="min-w-0 flex-1 truncate text-sm font-medium"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <span className="ml-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              {cur.ais.map((k) => (
                                <CliBadge key={k} optKey={k} small />
                              ))}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {AI_OPTIONS.filter((opt) => !opt.hidden).map((opt) => {
                              const active = cur.ais.includes(opt.key);
                              const missing = !isInstalled(opt.key);
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() =>
                                    missing ? setConfirmInstall(opt.key) : toggle(p.path, opt.key)
                                  }
                                  title={missing ? t('settings.aiClickToInstall') : t(opt.desc)}
                                  className={cn(
                                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted',
                                    active && 'border-primary bg-muted ring-1 ring-primary',
                                    missing && 'border-dashed opacity-60 grayscale',
                                  )}
                                >
                                  <CliBadge optKey={opt.key} />
                                  {opt.key === 'custom' ? t('settings.aiCustomLabel') : opt.label}
                                  {missing && <span className="text-[11px]">⬇</span>}
                                  {active && !missing && (
                                    <Check className="size-3.5 text-primary" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {cur.ais.includes('custom') && (
                            <Input
                              value={cur.custom || ''}
                              onChange={(e) => onCustom(p.path, e.target.value)}
                              placeholder={t('settings.aiCustomPlaceholder')}
                              className="mt-2.5 h-8 font-mono text-xs"
                            />
                          )}
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {t('settings.aiMinOne')}
                          </p>
                          {/* Porta fixa opcional deste projeto. */}
                          {(() => {
                            const pe = portEntry(p.path);
                            return (
                              <div className="mt-3 border-t pt-3">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={pe.on}
                                    onCheckedChange={() => togglePort(p.path)}
                                  />
                                  <span className="flex-1 text-[13px] font-medium">
                                    {t('settings.portFixed')}
                                  </span>
                                  {pe.currentPort && (
                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                      {t('settings.portCurrent', { port: pe.currentPort })}
                                    </span>
                                  )}
                                </div>
                                {pe.on && (
                                  <>
                                    <Input
                                      value={pe.draft}
                                      inputMode="numeric"
                                      onChange={(e) => onPortDraft(p.path, e.target.value)}
                                      onBlur={() => commitPort(p.path)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitPort(p.path);
                                      }}
                                      placeholder={t('settings.portPlaceholder')}
                                      className="mt-2 h-8 w-28 font-mono text-xs"
                                    />
                                    <p
                                      className={cn(
                                        'mt-1.5 text-[11px]',
                                        pe.error ? 'text-destructive' : 'text-muted-foreground',
                                      )}
                                    >
                                      {pe.error || t('settings.portHint')}
                                    </p>
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </>

                {/* Confirmação de instalação sob demanda: clicar numa CLI ausente ("Por projeto")
                  abre este overlay; confirmar leva pra aba "Gerenciar IAs" já instalando. */}
                {confirmInstall && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
                    <div className="w-[330px] rounded-2xl border border-primary/30 bg-background p-5 text-center shadow-xl">
                      <div className="mx-auto mb-3 w-fit">
                        <CliBadge optKey={confirmInstall} />
                      </div>
                      <div className="text-sm font-semibold">
                        {t('settings.aiInstallConfirmTitle', { name: OPT[confirmInstall]?.label })}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {t('settings.aiInstallConfirmBody')}
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmInstall(null)}
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          {t('settings.aiInstallLater')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const key = confirmInstall;
                            setConfirmInstall(null);
                            setPendingInstall(key);
                            setTab('clis');
                          }}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                        >
                          {t('settings.aiInstall')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'clis' && (
              <Suspense
                fallback={<div className="p-8 text-center text-sm text-muted-foreground">…</div>}
              >
                <AiManager initialInstallKey={pendingInstall} />
              </Suspense>
            )}

            {tab === 'appearance' && (
              <div className="mx-auto max-w-3xl">
                <div className="text-[13px] font-medium">{t('settings.appTheme')}</div>
                <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      theme === 'light' && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <Sun className="h-4 w-4" /> {t('settings.themeLight')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      theme === 'dark' && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <Moon className="h-4 w-4" /> {t('settings.themeDark')}
                  </button>
                </div>

                <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                  <ZoomIn className="h-4 w-4" /> {t('settings.zoomTitle')}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('settings.zoomHelp')}{' '}
                  <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd> +{' '}
                  <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">+</kbd> /{' '}
                  <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">−</kbd>{' '}
                  {t('settings.zoomFocusHint')}
                </p>
                <div className="mt-3 flex max-w-md items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyZoom('out')}
                    disabled={zoom <= 0.5}
                    title={t('settings.zoomOut')}
                    className="grid size-9 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
                  >
                    <ZoomOut />
                  </button>
                  <div className="grid h-9 w-16 place-items-center rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                    {Math.round(zoom * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => applyZoom('in')}
                    disabled={zoom >= 2}
                    title={t('settings.zoomIn')}
                    className="grid size-9 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
                  >
                    <ZoomIn />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyZoom('reset')}
                    disabled={zoom === 1}
                    title={t('settings.zoomReset')}
                    className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5"
                  >
                    <RotateCcw /> {t('settings.zoomResetLabel')}
                  </button>
                </div>

                <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                  <Terminal className="h-4 w-4" /> {t('settings.termTitle')}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.termHelp')}</p>
                <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTerminalAppearance('auto')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      terminalAppearance === 'auto' && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <Monitor className="h-4 w-4" /> {t('settings.termAuto')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerminalAppearance('light')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      terminalAppearance === 'light' && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <Sun className="h-4 w-4" /> {t('settings.themeLight')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerminalAppearance('dark')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      terminalAppearance === 'dark' && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <Moon className="h-4 w-4" /> {t('settings.themeDark')}
                  </button>
                </div>

                <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                  <Monitor className="h-4 w-4" /> {t('settings.layoutTitle')}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.layoutHelp')}</p>
                <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                  {LAYOUT_PRESETS.map((preset) => {
                    const active = railSide === preset.rail && claudeSide === preset.claude;
                    return (
                      <button
                        key={preset.rail + preset.claude}
                        type="button"
                        onClick={() => setPreset(preset.rail, preset.claude)}
                        title={t(preset.labelKey)}
                        className={cn(
                          'flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted',
                          active && 'border-primary ring-1 ring-primary',
                        )}
                      >
                        <LayoutThumb rail={preset.rail} claude={preset.claude} />
                        <span className="text-[11px] text-muted-foreground">
                          {t(preset.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'code' && (
              <div className="mx-auto flex max-w-3xl flex-col gap-3">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Save className="size-3.5 text-primary" /> {t('settings.codeAutosaveTitle')}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t('settings.codeAutosaveHelp')}{' '}
                      <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd>{' '}
                      +<kbd className="rounded border bg-muted px-1 font-mono text-[11px]">S</kbd>{' '}
                      {t('settings.codeAutosaveHelp2')}
                    </p>
                  </div>
                  <Switch
                    checked={autoSave}
                    onCheckedChange={toggleAutoSave}
                    title={autoSave ? t('settings.autosaveOn') : t('settings.autosaveOff')}
                    className="mt-0.5"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      <WrapText className="size-3.5 text-primary" /> {t('settings.codeWrapTitle')}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t('settings.codeWrapHelp')}
                    </p>
                  </div>
                  <Switch
                    checked={wordWrap}
                    onCheckedChange={toggleWordWrap}
                    title={wordWrap ? t('settings.wrapOn') : t('settings.wrapOff')}
                    className="mt-0.5"
                  />
                </div>
              </div>
            )}

            {tab === 'terminal' && (
              <div className="mx-auto max-w-3xl">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <Terminal className="h-4 w-4" /> {t('settings.shellTitle')}
                  <button
                    type="button"
                    onClick={rescanShells}
                    title={t('settings.shellRescan')}
                    className="ml-auto flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
                  >
                    <RefreshCw /> {t('settings.shellRescan')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.shellHelp')}</p>
                <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                  {/* Auto = shell padrão do SO ($SHELL / COMSPEC). Sempre a 1ª opção. */}
                  <button
                    type="button"
                    onClick={() => pickShell('auto')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                      shellPref === 'auto' && 'border-primary bg-muted ring-1 ring-primary',
                    )}
                  >
                    <Monitor className="h-4 w-4" /> {t('settings.shellAuto')}
                    {shellPref === 'auto' && <Check className="size-3.5 text-primary" />}
                  </button>
                  {shells.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickShell(s.id)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                        shellPref === s.id && 'border-primary bg-muted ring-1 ring-primary',
                      )}
                    >
                      {s.label}
                      {shellPref === s.id && <Check className="size-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">{t('settings.shellNewHint')}</p>
              </div>
            )}

            {tab === 'notify' && (
              <div className="mx-auto max-w-3xl">
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{t('settings.notifyTitle')}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t('settings.notifyHelp')}{' '}
                      <span className="font-medium text-foreground">
                        {t('settings.notifyHelpNotLooking')}
                      </span>
                      {t('settings.notifyHelp2')}
                    </p>
                  </div>
                  <Switch
                    checked={notify}
                    onCheckedChange={toggleNotify}
                    title={notify ? t('settings.notifyOn') : t('settings.notifyOff')}
                    className="mt-0.5"
                  />
                </div>
              </div>
            )}

            {tab === 'deps' && (
              <div className="mx-auto max-w-3xl">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t('settings.depsIntro')}{' '}
                  <span className="font-medium text-foreground">{t('settings.depsTabRef')}</span>.
                </p>

                <div className="mt-5">
                  <DependencyCards status={deps.status} loading={deps.loading} />
                </div>

                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={deps.loading}
                    onClick={deps.check}
                  >
                    <RefreshCw className={'size-3.5 ' + (deps.loading ? 'animate-spin' : '')} />{' '}
                    {t('settings.depsRecheck')}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'language' && (
              <div className="mx-auto max-w-3xl">
                <div className="text-[13px] font-medium">{t('language.title')}</div>
                <p className="mt-1 text-xs text-muted-foreground">{t('language.subtitle')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setLang(l.code)}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted',
                        lang === l.code && 'border-primary ring-1 ring-primary',
                      )}
                    >
                      <Flag code={l.code} /> {l.native}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'whatsnew' && (
              <div className="mx-auto max-w-3xl">
                <Suspense
                  fallback={
                    <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                      {changelogText}
                    </pre>
                  }
                >
                  <Markdown text={changelogText} />
                </Suspense>
              </div>
            )}

            {tab === 'about' && (
              <div className="mx-auto max-w-3xl">
                {/* Versão atual — o "charme" de produto. */}
                <div className="mb-5 flex items-baseline justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {t('settings.aboutVersionLabel')}
                  </span>
                  <span className="font-mono text-sm font-semibold text-foreground">
                    Carcará Code v{appVersion || '—'}
                  </span>
                </div>
                {/* Contribuir: link pro repo público (PR) */}
                <div className="mb-5 rounded-lg border border-dashed p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.contributeTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('settings.contributeBody')}
                  </p>
                  <button
                    type="button"
                    onClick={() => openLink('https://github.com/Yg0rAndrade/carcara-code')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-muted"
                  >
                    <GithubIcon className="size-4" />
                    {t('settings.contributeButton')}
                  </button>
                </div>
                {/* Atualização: checagem manual + status (espelha a pílula). */}
                {(() => {
                  const v = updateView(update, t);
                  const isDev = update.state === 'dev';
                  const statusText = update.state === 'idle' ? t('update.upToDate') : v.title;
                  return (
                    <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                      <span className="min-w-0 truncate text-sm text-muted-foreground">
                        {statusText}
                      </span>
                      {v.action === 'download' ? (
                        <button
                          onClick={onUpdateDownload}
                          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          {t('update.downloadBtn')}
                        </button>
                      ) : v.action === 'install' ? (
                        <button
                          onClick={onUpdateInstall}
                          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          {t('update.installBtn')}
                        </button>
                      ) : (
                        <button
                          onClick={onUpdateCheck}
                          disabled={isDev || update.state === 'checking'}
                          className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                        >
                          {t('settings.checkUpdates')}
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Cartão do autor */}
                <div className="flex items-start gap-4 rounded-xl border bg-card p-5">
                  <img
                    src={ygorPhoto}
                    alt={AUTHOR.name}
                    className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-primary/20"
                  />
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-foreground">{AUTHOR.name}</div>
                    <div className="text-xs text-primary">{t(AUTHOR.role)}</div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t(AUTHOR.blurb)}
                    </p>
                  </div>
                </div>

                {/* Links / redes */}
                <div className="mt-5 text-[13px] font-medium">{t('settings.aboutWhereToFind')}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {AUTHOR.links.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => openLink(l.href)}
                      className="group flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary [&_svg]:size-4">
                        <l.Icon />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                          {t(l.sub)}
                        </span>
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {l.label}
                        </span>
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                </div>

                {/* Agradecimento */}
                <div className="mt-5 rounded-lg border border-dashed p-4">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <Sparkles className="size-3.5 text-primary" /> {t('settings.aboutThanksTitle')}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {t('settings.aboutThanksBody', { name: AUTHOR.name })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors [&_svg]:size-4',
        active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
