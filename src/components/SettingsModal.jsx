import { useEffect, useState } from 'react';
import { Sun, Moon, X, Check, Paintbrush, Bot, Wrench, Monitor, Terminal, ZoomIn, ZoomOut, RotateCcw, Bell, Sparkles, Heart, Globe, Mail, ExternalLink, Code2, Save } from 'lucide-react';
import { ClaudeCodeIcon, CodexIcon, OpenCodeIcon, AntigravityIcon } from '@/lib/cliIcons.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { Input } from './ui/input.jsx';
import { Switch } from './ui/switch.jsx';
import { cn } from '@/lib/utils';

// CLIs de IA suportados. O 'cmd' é o que é digitado no terminal ao abrir a sessão.
// 'Icon' = logo da marca (Claude Code/OpenCode reais; Antigravity usa o "G" do Google;
// Codex/OpenAI não tem logo no conjunto CC0, então usa ícone genérico). 'color' = cor da marca.
const AI_OPTIONS = [
  { key: 'claude', label: 'Claude Code', cmd: 'claude', color: '#d97757', Icon: ClaudeCodeIcon, fullColor: true, desc: 'Sua assinatura Claude (não a API).' },
  { key: 'codex', label: 'Codex (OpenAI)', cmd: 'codex', color: '#5b6bff', Icon: CodexIcon, fullColor: true, desc: 'ChatGPT/OpenAI no terminal · npm i -g @openai/codex.' },
  { key: 'opencode', label: 'OpenCode', cmd: 'opencode', color: '#7c5cff', Icon: OpenCodeIcon, fullColor: true, desc: 'Open-source · npm i -g opencode-ai.' },
  { key: 'agy', label: 'Antigravity', cmd: 'agy', color: '#4285f4', Icon: AntigravityIcon, fullColor: true, desc: 'Google · substituiu o Gemini CLI.' },
  { key: 'custom', label: 'Personalizado', cmd: '', color: '#6b7280', Icon: Wrench, desc: 'Defina o comando manualmente.' },
];
const OPT = Object.fromEntries(AI_OPTIONS.map((o) => [o.key, o]));

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
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
const AUTHOR = {
  name: 'Ygor Andrade',
  role: 'Professor de IA e Automações',
  blurb: 'Carcará Code é um projeto independente, feito com carinho por mim. Se te ajudou de alguma forma, vem trocar uma ideia — adoro saber quem está usando.',
  links: [
    { key: 'site', label: 'ygorandrade.work', sub: 'Site pessoal', href: 'https://www.ygorandrade.work/', Icon: Globe },
    { key: 'email', label: 'ygormartinsandrade@gmail.com', sub: 'E-mail', href: 'mailto:ygormartinsandrade@gmail.com', Icon: Mail },
    { key: 'github', label: '@Yg0rAndrade', sub: 'GitHub', href: 'https://github.com/Yg0rAndrade', Icon: GithubIcon },
    { key: 'linkedin', label: 'Ygor Andrade', sub: 'LinkedIn', href: 'https://www.linkedin.com/in/ygor-andrade-8979a026a/', Icon: LinkedinIcon },
    { key: 'instagram', label: '@ygor_andr4de', sub: 'Instagram', href: 'https://www.instagram.com/ygor_andr4de/', Icon: InstagramIcon },
    { key: 'youtube', label: '@ygor_andrade', sub: 'YouTube', href: 'https://www.youtube.com/@ygor_andrade', Icon: YoutubeIcon },
  ],
};

// Abre links externos pela ponte do Electron; mailto: cai no openExternal também (shell resolve o handler).
function openLink(href) {
  if (window.api?.openExternal) window.api.openExternal(href);
  else window.open(href, '_blank');
}

function CliBadge({ optKey, small }) {
  const o = OPT[optKey] || OPT.custom;
  const Icon = o.Icon;
  // Logo colorido (tem fundo próprio) preenche o badge sem o quadrado tingido.
  if (o.fullColor) {
    return <Icon className={cn('shrink-0 rounded', small ? 'size-4' : 'size-5')} />;
  }
  return (
    <span className={cn('grid shrink-0 place-items-center rounded', small ? 'size-4' : 'size-5')} style={{ background: o.color + '22', color: o.color }}>
      <Icon className={small ? 'size-3' : 'size-3.5'} />
    </span>
  );
}

export function SettingsModal({ open, onClose }) {
  const { theme, setTheme, terminalAppearance, setTerminalAppearance } = useTheme();
  const [tab, setTab] = useState('ai');
  const [projects, setProjects] = useState([]);
  const [sel, setSel] = useState({}); // path -> { cli, custom }
  const [zoom, setZoom] = useState(1); // fator de zoom da janela (1 = 100%)
  const [notify, setNotify] = useState(true); // notificar quando o Claude termina
  const [autoSave, setAutoSave] = useState(false); // salvar arquivos do editor automaticamente

  // Lê o zoom atual ao abrir (mesma fonte do atalho Ctrl +/-: webFrame + localStorage).
  useEffect(() => {
    if (!open) return;
    setZoom(Number(localStorage.getItem('appZoom')) || window.api.getZoom() || 1);
    setAutoSave(localStorage.getItem('codeAutoSave') === '1');
    window.api.getNotify().then((r) => setNotify(r?.enabled !== false)).catch(() => {});
  }, [open]);

  const toggleNotify = () => {
    setNotify((v) => { const next = !v; window.api.setNotify(next); return next; });
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

  const applyZoom = (dir) => {
    const f = window.api.zoom(dir);
    localStorage.setItem('appZoom', String(f));
    setZoom(f);
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const list = await window.api.listProjects();
      setProjects(list);
      const entries = await Promise.all(list.map(async (p) => [p.path, await window.api.getAi(p.path)]));
      setSel(Object.fromEntries(entries));
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const choose = (path, key) => {
    setSel((s) => {
      const next = { ...s, [path]: { cli: key, custom: s[path]?.custom || '' } };
      window.api.setAi(path, key, next[path].custom);
      return next;
    });
  };
  const onCustom = (path, val) => {
    setSel((s) => {
      const cur = s[path] || {};
      const next = { ...s, [path]: { cli: cur.cli || 'custom', custom: val } };
      if (cur.cli === 'custom') window.api.setAi(path, 'custom', val);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-background">
      {/* Navegação lateral */}
      <div className="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-card p-3">
        <div className="px-2 py-2 text-base font-semibold">Configurações</div>
        <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Bot />}>IA por projeto</TabButton>
        <TabButton active={tab === 'appearance'} onClick={() => setTab('appearance')} icon={<Paintbrush />}>Aparência</TabButton>
        <TabButton active={tab === 'code'} onClick={() => setTab('code')} icon={<Code2 />}>Códigos</TabButton>
        <TabButton active={tab === 'notify'} onClick={() => setTab('notify')} icon={<Bell />}>Notificações</TabButton>
        <div className="my-1.5 border-t" />
        <TabButton active={tab === 'about'} onClick={() => setTab('about')} icon={<Heart />}>Sobre & créditos</TabButton>
      </div>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="text-[15px] font-semibold">
            {tab === 'ai' ? 'IA por projeto' : tab === 'code' ? 'Códigos' : tab === 'notify' ? 'Notificações' : tab === 'about' ? 'Sobre & créditos' : 'Aparência'}
          </h1>
          <div className="flex-1" />
          <button type="button" onClick={onClose} title="Fechar (Esc)"
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-[18px]">
            <X />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'ai' && (
            <div className="mx-auto max-w-3xl">
              <p className="text-sm text-muted-foreground">
                Escolha qual CLI de IA cada projeto usa. Vale para as <span className="font-medium text-foreground">novas sessões</span> abertas naquele projeto.
              </p>

              <div className="mt-5 flex flex-col gap-3">
                {projects.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Nenhum projeto ainda. Adicione um projeto na barra lateral.
                  </div>
                )}
                {projects.map((p) => {
                  const cur = sel[p.path] || { cli: 'claude', custom: '' };
                  return (
                    <div key={p.path} className="rounded-lg border p-3">
                      <div className="mb-2.5 flex items-center gap-2">
                        {p.icon
                          ? <img src={p.icon} alt="" className="size-5 rounded-sm object-contain" />
                          : <span className="grid size-5 place-items-center rounded-sm bg-muted text-[11px] font-semibold uppercase">{p.name?.[0] || '?'}</span>}
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        <span className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <CliBadge optKey={cur.cli} small />
                          {OPT[cur.cli]?.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AI_OPTIONS.map((opt) => {
                          const active = cur.cli === opt.key;
                          return (
                            <button key={opt.key} type="button" onClick={() => choose(p.path, opt.key)}
                              title={opt.desc}
                              className={cn(
                                'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted',
                                active && 'border-primary bg-muted ring-1 ring-primary'
                              )}>
                              <CliBadge optKey={opt.key} />
                              {opt.label}
                              {active && <Check className="size-3.5 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                      {cur.cli === 'custom' && (
                        <Input
                          value={cur.custom || ''}
                          onChange={(e) => onCustom(p.path, e.target.value)}
                          placeholder="comando do CLI (ex.: meu-cli --flag)"
                          className="mt-2.5 h-8 font-mono text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="mx-auto max-w-3xl">
              <div className="text-[13px] font-medium">Tema da interface</div>
              <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
                <button type="button" onClick={() => setTheme('light')}
                  className={cn('flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted', theme === 'light' && 'border-primary ring-1 ring-primary')}>
                  <Sun className="h-4 w-4" /> Claro
                </button>
                <button type="button" onClick={() => setTheme('dark')}
                  className={cn('flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted', theme === 'dark' && 'border-primary ring-1 ring-primary')}>
                  <Moon className="h-4 w-4" /> Escuro
                </button>
              </div>

              <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                <ZoomIn className="h-4 w-4" /> Zoom da interface
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Aumenta ou diminui o tamanho de tudo no app (rail, chat, abas…). Também dá pra
                usar <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd> +
                {' '}<kbd className="rounded border bg-muted px-1 font-mono text-[11px]">+</kbd> /
                {' '}<kbd className="rounded border bg-muted px-1 font-mono text-[11px]">−</kbd> com o foco fora do preview.
              </p>
              <div className="mt-3 flex max-w-md items-center gap-2">
                <button type="button" onClick={() => applyZoom('out')} disabled={zoom <= 0.5}
                  title="Diminuir"
                  className="grid size-9 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4">
                  <ZoomOut />
                </button>
                <div className="grid h-9 w-16 place-items-center rounded-md border bg-muted/40 text-sm font-medium tabular-nums">
                  {Math.round(zoom * 100)}%
                </div>
                <button type="button" onClick={() => applyZoom('in')} disabled={zoom >= 2}
                  title="Aumentar"
                  className="grid size-9 place-items-center rounded-md border transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4">
                  <ZoomIn />
                </button>
                <button type="button" onClick={() => applyZoom('reset')} disabled={zoom === 1}
                  title="Resetar para 100%"
                  className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5">
                  <RotateCcw /> Resetar
                </button>
              </div>

              <div className="mt-8 flex items-center gap-2 text-[13px] font-medium">
                <Terminal className="h-4 w-4" /> Aparência do terminal
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cor de fundo do terminal e do Claude Code. Mantemos o tema da CLI casado com o fundo
                pra o texto não ficar ilegível no claro.
              </p>
              <div className="mt-3 grid max-w-md grid-cols-3 gap-2">
                <button type="button" onClick={() => setTerminalAppearance('auto')}
                  className={cn('flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted', terminalAppearance === 'auto' && 'border-primary ring-1 ring-primary')}>
                  <Monitor className="h-4 w-4" /> Acompanhar app
                </button>
                <button type="button" onClick={() => setTerminalAppearance('light')}
                  className={cn('flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted', terminalAppearance === 'light' && 'border-primary ring-1 ring-primary')}>
                  <Sun className="h-4 w-4" /> Claro
                </button>
                <button type="button" onClick={() => setTerminalAppearance('dark')}
                  className={cn('flex items-center justify-center gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted', terminalAppearance === 'dark' && 'border-primary ring-1 ring-primary')}>
                  <Moon className="h-4 w-4" /> Escuro
                </button>
              </div>
            </div>
          )}

          {tab === 'code' && (
            <div className="mx-auto max-w-3xl">
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    <Save className="size-3.5 text-primary" /> Salvar automaticamente
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Salva os arquivos abertos no editor sozinho, pouco depois de você parar de digitar.
                    Com isso ligado você não precisa apertar <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">Ctrl</kbd>
                    {' '}+<kbd className="rounded border bg-muted px-1 font-mono text-[11px]">S</kbd> — e o
                    Preview já recarrega com a última versão.
                  </p>
                </div>
                <Switch checked={autoSave} onCheckedChange={toggleAutoSave}
                  title={autoSave ? 'Autosave ligado' : 'Autosave desligado'}
                  className="mt-0.5" />
              </div>
            </div>
          )}

          {tab === 'notify' && (
            <div className="mx-auto max-w-3xl">
              <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Avisar quando o Claude terminar</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Mostra uma notificação do sistema quando o Claude Code conclui uma tarefa
                    num projeto que você <span className="font-medium text-foreground">não está olhando</span>.
                    Útil pra deixar rodando num projeto e ir mexer em outro. Vale só pra projetos
                    em Claude Code — Codex/OpenCode/Antigravity/personalizado não disparam aviso.
                  </p>
                </div>
                <Switch checked={notify} onCheckedChange={toggleNotify}
                  title={notify ? 'Notificações ligadas' : 'Notificações desligadas'}
                  className="mt-0.5" />
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="mx-auto max-w-3xl">
              {/* Cartão do autor */}
              <div className="flex items-start gap-4 rounded-xl border bg-card p-5">
                <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Heart className="size-7" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-foreground">{AUTHOR.name}</div>
                  <div className="text-xs text-primary">{AUTHOR.role}</div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{AUTHOR.blurb}</p>
                </div>
              </div>

              {/* Links / redes */}
              <div className="mt-5 text-[13px] font-medium">Onde me encontrar</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {AUTHOR.links.map((l) => (
                  <button key={l.key} type="button" onClick={() => openLink(l.href)}
                    className="group flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-muted">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary [&_svg]:size-4">
                      <l.Icon />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{l.sub}</span>
                      <span className="block truncate text-[13px] font-medium text-foreground">{l.label}</span>
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>

              {/* Agradecimento */}
              <div className="mt-5 rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Sparkles className="size-3.5 text-primary" /> Obrigado por usar o Carcará Code
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Feito de forma independente por {AUTHOR.name}. Sugestões, ideias e feedback são muito bem-vindos —
                  é o que faz o projeto melhorar.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors [&_svg]:size-4',
        active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60'
      )}>
      {icon}{children}
    </button>
  );
}
