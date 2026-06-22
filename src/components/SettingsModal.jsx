import { useEffect, useState } from 'react';
import { Sun, Moon, X, Check, Paintbrush, Bot, Wrench, Monitor, Terminal, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ClaudeCodeIcon, CodexIcon, OpenCodeIcon, AntigravityIcon } from '@/lib/cliIcons.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { Input } from './ui/input.jsx';
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

  // Lê o zoom atual ao abrir (mesma fonte do atalho Ctrl +/-: webFrame + localStorage).
  useEffect(() => {
    if (!open) return;
    setZoom(Number(localStorage.getItem('appZoom')) || window.api.getZoom() || 1);
  }, [open]);

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
      </div>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="text-[15px] font-semibold">
            {tab === 'ai' ? 'IA por projeto' : 'Aparência'}
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
