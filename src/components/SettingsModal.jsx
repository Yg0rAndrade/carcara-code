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
  Palette,
  SquareTerminal,
  SquareChevronRight,
  GitBranch,
  Container,
  Fish,
} from 'lucide-react';
import { useTheme, THEME_ORDER } from '@/lib/theme.jsx';
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
// Notas de versão (aba "Novidades"): o CHANGELOG.md da raiz vira texto em build-time via
// import ?raw do Vite — sem IPC, sem duplicar o arquivo. Markdown.jsx é lazy (mesmo padrão
// do ChatPanel) pra não puxar react-markdown/highlight.js pro bundle inicial do app.
import changelogText from '../../CHANGELOG.md?raw';

import { AiManagerSkeleton } from './AiManagerSkeleton.jsx';

const Markdown = lazy(() => import('./Markdown.jsx'));
// AiManager só aparece na aba "Gerenciar IAs" — lazy pra não pesar o boot do app
// (o SettingsModal é importado no caminho inicial). Mesmo padrão do Markdown.
const AiManager = lazy(() => import('./AiManager.jsx'));

// Amostras de cor do seletor de tema (Aparência). Espelham os valores do index.css
// só para o mini-preview — a fonte da verdade das paletas continua sendo o CSS.
// `label` reaproveita as chaves i18n existentes onde dá (light/dark).
const THEME_SWATCH = {
  light: {
    label: 'settings.themeLight',
    family: 'light',
    bg: 'hsl(220 16% 93%)',
    card: '#ffffff',
    line: 'hsl(220 13% 82%)',
    primary: 'hsl(37.7 92% 50%)',
    border: 'hsl(220 13% 88%)',
  },
  dark: {
    label: 'settings.themeDark',
    family: 'dark',
    bg: 'hsl(0 0% 9%)',
    card: 'hsl(0 0% 15%)',
    line: 'hsl(0 0% 34%)',
    primary: 'hsl(25 88% 56%)',
    border: 'hsl(0 0% 26%)',
  },
  brasa: {
    label: 'settings.themeBrasa',
    // Fundo bem mais quente/avermelhado e a brasa "acesa" (glow) pra se distinguir
    // do escuro neutro. É o tema que deve gritar "calor".
    family: 'dark',
    bg: 'hsl(12 40% 8%)',
    card: 'hsl(14 30% 12%)',
    line: 'hsl(16 20% 34%)',
    primary: 'hsl(20 100% 57%)',
    border: 'hsl(16 34% 22%)',
    glow: true,
  },
  carvao: {
    label: 'settings.themeCarvao',
    // Preto absoluto na moldura + card quase preto: lê como "o mais fundo/OLED".
    family: 'dark',
    bg: '#000000',
    card: 'hsl(0 0% 7%)',
    line: 'hsl(0 0% 26%)',
    primary: 'hsl(25 90% 56%)',
    border: 'hsl(0 0% 14%)',
  },
  papel: {
    label: 'settings.themePapel',
    // Creme quente e saturado + linhas sépia: destaca do branco frio do "Claro".
    family: 'light',
    bg: 'hsl(38 44% 88%)',
    card: 'hsl(42 52% 96%)',
    line: 'hsl(34 26% 74%)',
    primary: 'hsl(30 92% 48%)',
    border: 'hsl(36 30% 80%)',
  },
};

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
function WhatsappIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
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
    {
      key: 'whatsapp',
      label: '+55 35 99747-2650',
      sub: 'settings.linkWhatsapp',
      // wa.me abre a conversa direto (no app ou no WhatsApp Web), sem precisar salvar o contato.
      href: 'https://wa.me/5535997472650',
      Icon: WhatsappIcon,
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

// Título do cabeçalho por aba. Tabela em vez da escada de ternários que existia aqui:
// aba nova = uma linha, e não dá pra esquecer um ramo no meio do encadeamento.
const TAB_TITLE = {
  ai: 'settings.tabAi',
  clis: 'settings.tabClis',
  appearance: 'settings.tabAppearance',
  code: 'settings.tabCode',
  terminal: 'settings.tabTerminal',
  deps: 'settings.tabDeps',
  language: 'settings.tabLanguage',
  whatsnew: 'settings.tabWhatsNew',
  about: 'settings.tabAbout',
};

// Cabeçalho de seção das Configurações: ícone + título e, quando faz falta, uma linha de
// ajuda. Um formato só pra todas as seções — é o que faz a aba ler como uma lista, e não
// como um mural de controles soltos de tamanhos variados.
function SectionHead({ icon, title, help, className }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span aria-hidden="true" className="[&_svg]:size-4">
          {icon}
        </span>
        {title}
      </div>
      {help && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  );
}

// Botão de opção das Configurações (shell, aparência do terminal, zoom). Altura ÚNICA de
// 44px: rótulos curtos ("Claro") e longos ("Automático (padrão do sistema)") passavam a
// render botões de alturas diferentes, e a linha ficava serrilhada. Também é o tamanho
// mínimo confortável de alvo de clique.
const OPTION_BTN = {
  base: 'flex h-11 items-center gap-2 rounded-md border text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40',
  icon: 'grid size-11 shrink-0 place-items-center rounded-md border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
  active: 'border-primary bg-muted ring-1 ring-primary',
};

// Ícone por shell — sem logos de marca (o lucide não traz), mas o suficiente pra bater o
// olho e achar o seu. Fallback: o terminalzinho genérico.
const SHELL_ICON = {
  auto: Monitor,
  powershell: Terminal,
  pwsh: Terminal,
  cmd: SquareChevronRight,
  gitbash: GitBranch,
  wsl: Container,
  zsh: SquareTerminal,
  bash: SquareTerminal,
  fish: Fish,
  sh: SquareTerminal,
};

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
  // path -> { loading, scanned, list: [{port,pid,name,isPreview}] }
  const [openPorts, setOpenPorts] = useState({});
  const [killTarget, setKillTarget] = useState(null); // { path, port, name }
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

  // Varre as portas abertas do projeto sob demanda (sem polling); clicar no ✕ de um chip
  // sempre passa por confirmação (killTarget) antes de matar o processo e revarrer.
  const scanPorts = async (path) => {
    setOpenPorts((s) => ({ ...s, [path]: { ...(s[path] || {}), loading: true } }));
    const list = await window.api.listPorts(path);
    setOpenPorts((s) => ({ ...s, [path]: { loading: false, scanned: true, list: list || [] } }));
  };

  const confirmKill = async () => {
    const { path, port } = killTarget;
    setKillTarget(null);
    await window.api.killPort(port);
    await scanPorts(path);
  };

  // Lista visível da aba "IA por projeto": filtro por busca + ordenação por nome (pura, testada
  // em src/lib/projectFilter.js). 'default' preserva a ordem que veio do Rail.
  const visibleProjects = filterAndSortProjects(projects, { query: aiQuery, sort: aiSort });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      className="fixed inset-0 z-50 flex bg-background"
    >
      {/* Navegação lateral */}
      <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-card p-3">
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
      </nav>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="text-[15px] font-semibold">{t(TAB_TITLE[tab] || TAB_TITLE.appearance)}</h1>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            title={t('settings.close')}
            aria-label={t('settings.close')}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-[18px]"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
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

                  {/* O card "Chat em vez do terminal" (beta) saiu daqui: o painel ainda está em
                      construção. A fiação continua no chatModeContext, atrás do flag
                      CHAT_MODE_ENABLED — ligar de novo é devolver este card. */}

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
                            type="search"
                            spellCheck={false}
                            aria-label={t('settings.aiSearchPlaceholder')}
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
                          aria-label={t(
                            aiSort === 'asc'
                              ? 'settings.aiSortAsc'
                              : aiSort === 'desc'
                                ? 'settings.aiSortDesc'
                                : 'settings.aiSortDefault',
                          )}
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-md border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            aiSort !== 'default' && 'border-primary text-primary',
                          )}
                        >
                          {aiSort === 'desc' ? (
                            <ArrowUpAZ aria-hidden="true" className="size-4" />
                          ) : (
                            <ArrowDownAZ aria-hidden="true" className="size-4" />
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
                        <div key={p.path} className="overflow-hidden rounded-lg border">
                          {/* Cabeçalho do card = QUEM é o projeto (fundo próprio e borda
                              embaixo). Sem isso, nome, chips de IA e portas ficavam todos no
                              mesmo peso e o card virava uma lista sem começo. */}
                          <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2.5">
                            {p.icon ? (
                              <img
                                src={p.icon}
                                alt=""
                                width={32}
                                height={32}
                                className="size-8 rounded-md object-contain"
                              />
                            ) : (
                              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold uppercase">
                                {p.name?.[0] || '?'}
                              </span>
                            )}
                            <span
                              className="min-w-0 flex-1 truncate text-sm font-semibold"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {cur.ais.map((k) => (
                                <CliBadge key={k} optKey={k} small />
                              ))}
                            </span>
                          </div>

                          <div className="p-3">
                            <div className="flex flex-wrap gap-2">
                              {AI_OPTIONS.filter((opt) => !opt.hidden).map((opt) => {
                                const active = cur.ais.includes(opt.key);
                                const missing = !isInstalled(opt.key);
                                return (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      missing ? setConfirmInstall(opt.key) : toggle(p.path, opt.key)
                                    }
                                    title={missing ? t('settings.aiClickToInstall') : t(opt.desc)}
                                    className={cn(
                                      // Altura fixa: os chips têm rótulos de tamanhos bem
                                      // diferentes e, sem isso, a linha ficava serrilhada.
                                      'flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
                            {/* O aviso só aparece quando explica algo: com uma IA marcada, ela
                                não desmarca. Antes ele se repetia em TODO card, virando ruído. */}
                            {cur.ais.length === 1 && (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {t('settings.aiMinOne')}
                              </p>
                            )}

                            {/* Portas do projeto: fixa (o que ele VAI usar) e no ar (o que ele
                                está usando agora) — dois assuntos irmãos, lado a lado, em vez de
                                empilhados como se um dependesse do outro. */}
                            <div className="mt-3 grid gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-2">
                              {(() => {
                                const pe = portEntry(p.path);
                                return (
                                  <div>
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
                                          aria-label={t('settings.portFixed')}
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

                              {/* Portas no ar: varredura sob demanda (sem polling); o ✕ de cada
                                  chip sempre passa pela confirmação (killTarget). */}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="flex-1 text-[13px] font-medium">
                                    {t('settings.portsScan')}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => scanPorts(p.path)}
                                    disabled={openPorts[p.path]?.loading}
                                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                                    title={t('settings.portsScan')}
                                    aria-label={t('settings.portsScan')}
                                  >
                                    <RefreshCw
                                      aria-hidden="true"
                                      className={cn(
                                        'h-3.5 w-3.5',
                                        openPorts[p.path]?.loading && 'animate-spin',
                                      )}
                                    />
                                  </button>
                                </div>
                                <div aria-live="polite">
                                  {openPorts[p.path]?.scanned && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {openPorts[p.path].list.length === 0 && (
                                        <span className="text-[11px] text-muted-foreground">
                                          {t('settings.portsEmpty')}
                                        </span>
                                      )}
                                      {openPorts[p.path].list.map((pt) => (
                                        <span
                                          key={pt.port}
                                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                                        >
                                          {pt.port}
                                          {pt.name && (
                                            <span className="text-muted-foreground">{pt.name}</span>
                                          )}
                                          {pt.isPreview && (
                                            <span className="rounded bg-primary/15 px-1 text-[9px] text-primary">
                                              {t('settings.portsAppTag')}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setKillTarget({
                                                path: p.path,
                                                port: pt.port,
                                                name: pt.name || String(pt.port),
                                              })
                                            }
                                            className="text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                            title={t('settings.portsCloseConfirm')}
                                            aria-label={t('settings.portsCloseTitle', {
                                              port: pt.port,
                                              name: pt.name || String(pt.port),
                                            })}
                                          >
                                            <X aria-hidden="true" className="h-3 w-3" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
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

                {/* Confirma o fechamento de uma porta no ar (chip ✕): nunca mata direto. */}
                {killTarget && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55">
                    <div className="w-[330px] rounded-2xl border border-destructive/30 bg-background p-5 text-center shadow-xl">
                      <div className="text-sm font-semibold">
                        {t('settings.portsCloseTitle', {
                          port: killTarget.port,
                          name: killTarget.name,
                        })}
                      </div>
                      <div className="mt-4 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setKillTarget(null)}
                          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          {t('settings.portsCloseCancel')}
                        </button>
                        <button
                          type="button"
                          onClick={confirmKill}
                          className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:opacity-90"
                        >
                          {t('settings.portsCloseConfirm')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'clis' && (
              // Esqueleto no lugar do "…": o chunk do AiManager é grande (xterm) e a
              // sondagem das CLIs leva um tempo — a aba abria em branco e depois pulava.
              <Suspense fallback={<AiManagerSkeleton />}>
                <AiManager initialInstallKey={pendingInstall} />
              </Suspense>
            )}

            {tab === 'appearance' && (
              // Todas as seções desta aba compartilham a MESMA coluna (max-w-2xl) e o mesmo
              // cabeçalho (ícone + título + ajuda): os blocos alinham pela esquerda e pela
              // direita, então dá pra varrer a aba de cima a baixo sem procurar cada controle.
              <div className="mx-auto max-w-2xl">
                <SectionHead icon={<Palette />} title={t('settings.appTheme')} />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {THEME_ORDER.map((key) => {
                    const p = THEME_SWATCH[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={theme === key}
                        onClick={() => setTheme(key)}
                        className={cn(
                          'flex flex-col gap-2 rounded-md border p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          theme === key && 'border-primary ring-1 ring-primary',
                        )}
                      >
                        {/* Mini-janela da IDE: a MOLDURA é o fundo do tema (mostra o
                            matiz — neutro/avermelhado/preto/creme), o painel é o card,
                            as barrinhas são "texto" e a pílula/bolinha é a brasa (com
                            glow no tema Brasa). Dá superfície pra cada tema se distinguir. */}
                        <div
                          className="h-14 overflow-hidden rounded-[5px] border p-1.5"
                          style={{ background: p.bg, borderColor: p.border }}
                        >
                          <div
                            className="flex h-full flex-col justify-center gap-1.5 rounded-[4px] border px-2"
                            style={{ background: p.card, borderColor: p.border }}
                          >
                            <span
                              className="h-1 w-4/5 rounded-full"
                              style={{ background: p.line }}
                            />
                            <span
                              className="h-1 w-3/5 rounded-full"
                              style={{ background: p.line }}
                            />
                            <span
                              className="mt-0.5 h-1.5 rounded-full"
                              style={{
                                width: p.glow ? '2.25rem' : '1.5rem',
                                background: p.primary,
                                boxShadow: p.glow ? `0 0 7px 0 ${p.primary}` : 'none',
                              }}
                            />
                          </div>
                        </div>
                        <span className="flex items-center gap-1.5 px-0.5 text-[13px]">
                          {p.family === 'dark' ? (
                            <Moon className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Sun className="h-3.5 w-3.5 shrink-0" />
                          )}
                          {t(p.label)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <SectionHead
                  className="mt-8"
                  icon={<ZoomIn />}
                  title={t('settings.zoomTitle')}
                  help={
                    <>
                      {t('settings.zoomHelp')}{' '}
                      <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd>{' '}
                      + <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">+</kbd>{' '}
                      / <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">−</kbd>{' '}
                      {t('settings.zoomFocusHint')}
                    </>
                  }
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyZoom('out')}
                    disabled={zoom <= 0.5}
                    title={t('settings.zoomOut')}
                    aria-label={t('settings.zoomOut')}
                    className={OPTION_BTN.icon}
                  >
                    <ZoomOut aria-hidden="true" />
                  </button>
                  <div className="grid h-11 w-16 place-items-center rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                    {Math.round(zoom * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => applyZoom('in')}
                    disabled={zoom >= 2}
                    title={t('settings.zoomIn')}
                    aria-label={t('settings.zoomIn')}
                    className={OPTION_BTN.icon}
                  >
                    <ZoomIn aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyZoom('reset')}
                    disabled={zoom === 1}
                    title={t('settings.zoomReset')}
                    className={cn(OPTION_BTN.base, 'px-3')}
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" />{' '}
                    {t('settings.zoomResetLabel')}
                  </button>
                </div>

                <SectionHead
                  className="mt-8"
                  icon={<Terminal />}
                  title={t('settings.termTitle')}
                  help={t('settings.termHelp')}
                />
                {/* Mesma grade de 3 colunas do seletor de tema: as células caem exatamente
                    sob as de cima, em vez de virarem três botõezinhos de larguras diferentes. */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { key: 'auto', Icon: Monitor, label: t('settings.termAuto') },
                    { key: 'light', Icon: Sun, label: t('settings.themeLight') },
                    { key: 'dark', Icon: Moon, label: t('settings.themeDark') },
                  ].map(({ key, Icon, label }) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={terminalAppearance === key}
                      onClick={() => setTerminalAppearance(key)}
                      title={label}
                      className={cn(
                        OPTION_BTN.base,
                        'justify-center px-3',
                        terminalAppearance === key && OPTION_BTN.active,
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>

                <SectionHead
                  className="mt-8"
                  icon={<Monitor />}
                  title={t('settings.layoutTitle')}
                  help={t('settings.layoutHelp')}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LAYOUT_PRESETS.map((preset) => {
                    const active = railSide === preset.rail && claudeSide === preset.claude;
                    return (
                      <button
                        key={preset.rail + preset.claude}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPreset(preset.rail, preset.claude)}
                        title={t(preset.labelKey)}
                        className={cn(
                          'flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          active && 'border-primary ring-1 ring-primary',
                        )}
                      >
                        <LayoutThumb rail={preset.rail} claude={preset.claude} />
                        <span className="line-clamp-2 text-left text-[11px] leading-tight text-muted-foreground">
                          {t(preset.labelKey)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'code' && (
              // Mesma coluna das abas Aparência/Terminal: trocar de aba não muda a largura
              // do conteúdo (nada "anda" pro lado quando você navega pelo menu).
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
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

                {/* A notificação de "o Claude terminou" morava numa aba só pra ela, com um
                    interruptor único. Virou o terceiro cartão daqui: mesmo formato dos
                    outros e uma entrada a menos no menu lateral. */}
                <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[13px] font-medium">
                      <Bell className="size-3.5 text-primary" /> {t('settings.notifyTitle')}
                    </div>
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

            {tab === 'terminal' && (
              <div className="mx-auto max-w-2xl">
                <div className="flex items-start justify-between gap-3">
                  <SectionHead
                    icon={<Terminal />}
                    title={t('settings.shellTitle')}
                    help={t('settings.shellHelp')}
                  />
                  <button
                    type="button"
                    onClick={rescanShells}
                    title={t('settings.shellRescan')}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-3.5"
                  >
                    <RefreshCw aria-hidden="true" /> {t('settings.shellRescan')}
                  </button>
                </div>
                {/* Um cartão por shell, todos do mesmo tamanho, com ícone à esquerda e o
                    ✓ sempre na mesma quina — antes cada botão tinha a largura do seu
                    rótulo e o "Automático" quebrava em duas linhas, ficando mais alto.
                    A grade cresce com a janela em vez de espremer tudo em 2 colunas. */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {/* Auto = shell padrão do SO ($SHELL / COMSPEC). Sempre a 1ª opção. */}
                  {[{ id: 'auto', label: t('settings.shellAuto') }, ...shells].map((s) => {
                    const Icon = SHELL_ICON[s.id] || Terminal;
                    const active = shellPref === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => pickShell(s.id)}
                        title={s.label}
                        className={cn(OPTION_BTN.base, 'px-3', active && OPTION_BTN.active)}
                      >
                        <Icon
                          aria-hidden="true"
                          className={cn('size-4 shrink-0', active && 'text-primary')}
                        />
                        <span className="min-w-0 flex-1 truncate text-left">{s.label}</span>
                        {active && (
                          <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {t('settings.shellNewHint')}
                </p>
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
                    width={56}
                    height={56}
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
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&_svg]:size-4',
        active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60',
      )}
    >
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
      {children}
    </button>
  );
}
