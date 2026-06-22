import { useEffect, useState } from 'react';
import { Sun, Moon, X, Check, Paintbrush, Bot, Wrench, Monitor, Terminal, ZoomIn, ZoomOut, RotateCcw, Bell, Sparkles, Download, Trash2, Heart } from 'lucide-react';
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
  const [llmCfg, setLlmCfg] = useState({ enabled: false, features: { commit: false } });
  const [llmStat, setLlmStat] = useState({ installed: false, sizeBytes: 0 });
  const [dl, setDl] = useState(null); // { done, total } enquanto baixa; null fora disso

  // Lê o zoom atual ao abrir (mesma fonte do atalho Ctrl +/-: webFrame + localStorage).
  useEffect(() => {
    if (!open) return;
    setZoom(Number(localStorage.getItem('appZoom')) || window.api.getZoom() || 1);
    window.api.getNotify().then((r) => setNotify(r?.enabled !== false)).catch(() => {});
  }, [open]);

  const toggleNotify = () => {
    setNotify((v) => { const next = !v; window.api.setNotify(next); return next; });
  };

  const setLlmEnabled = (v) => {
    setLlmCfg((c) => ({ ...c, enabled: v }));
    window.api.llmSetConfig({ enabled: v });
  };
  const setCommitFeature = (v) => {
    setLlmCfg((c) => ({ ...c, features: { ...c.features, commit: v } }));
    window.api.llmSetConfig({ features: { commit: v } });
  };
  const doDownload = async () => {
    setDl({ done: 0, total: 0 });
    const r = await window.api.llmDownload();
    setDl(null);
    if (r?.ok) setLlmStat(r);
  };
  const doRemove = async () => {
    await window.api.llmRemove();
    const r = await window.api.llmStatus();
    if (r?.ok) setLlmStat(r);
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
    window.api.llmGetConfig().then((r) => { if (r?.ok) setLlmCfg(r); }).catch(() => {});
    window.api.llmStatus().then((r) => { if (r?.ok) setLlmStat(r); }).catch(() => {});
    const off = window.api.onLlmDownloadProgress((p) => setDl(p));
    return off;
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
        <TabButton active={tab === 'notify'} onClick={() => setTab('notify')} icon={<Bell />}>Notificações</TabButton>
        <TabButton active={tab === 'llm'} onClick={() => setTab('llm')} icon={<Sparkles />}>Recursos de IA</TabButton>
      </div>

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="text-[15px] font-semibold">
            {tab === 'ai' ? 'IA por projeto' : tab === 'notify' ? 'Notificações' : tab === 'llm' ? 'Recursos de IA' : 'Aparência'}
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

          {tab === 'llm' && (
            <div className="mx-auto max-w-3xl">
              <p className="text-sm text-muted-foreground">
                Uma IA local minúscula, offline, pra tarefas curtas (ex.: sugerir mensagem de commit).
                É opcional: ative, baixe o modelo uma vez (~400&nbsp;MB) e ligue só o que quiser.
                Desligada, o app funciona normalmente.
              </p>

              {/* Master */}
              <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Ativar IA local</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Roda direto no seu computador, sem internet e sem usar sua sessão do Claude.
                  </p>
                </div>
                <Switch checked={llmCfg.enabled} onCheckedChange={setLlmEnabled} className="mt-0.5" />
              </div>

              {/* Modelo */}
              {llmCfg.enabled && (
                <div className="mt-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[13px] font-medium">
                      Modelo local
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {dl ? 'baixando…' : llmStat.installed ? 'pronto' : 'não baixado'}
                      </span>
                    </div>
                    {!dl && (llmStat.installed
                      ? <button type="button" onClick={doRemove}
                          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted [&_svg]:size-3.5">
                          <Trash2 /> Remover
                        </button>
                      : <button type="button" onClick={doDownload}
                          className="flex items-center gap-1.5 rounded-md border border-primary px-2.5 py-1.5 text-[13px] text-primary transition-colors hover:bg-muted [&_svg]:size-3.5">
                          <Download /> Baixar (~400 MB)
                        </button>)}
                  </div>
                  {dl && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all"
                          style={{ width: (dl.total ? Math.round((100 * dl.done) / dl.total) : 0) + '%' }} />
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {dl.total ? Math.round((100 * dl.done) / dl.total) : 0}%
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recursos por toggle */}
              {llmCfg.enabled && (
                <div className="mt-3 rounded-lg border p-4">
                  <div className="text-[13px] font-medium">Recursos</div>
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px]">Botão de sugestão de mensagem de commit</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Mostra um botão "✨ Gerar" na aba Git que escreve a mensagem a partir do que está em stage.
                      </p>
                    </div>
                    <Switch checked={llmCfg.features.commit} onCheckedChange={setCommitFeature}
                      disabled={!llmStat.installed} className="mt-0.5" />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Títulos de histórico e de prompt: em breve.</p>
                </div>
              )}

              {/* Créditos / atribuição open source — respeitando as licenças de quem tornou isso possível */}
              <div className="mt-3 rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Heart className="size-3.5 text-primary" /> Créditos e licenças
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Esta IA local roda no seu computador graças a projetos open source. Nossa gratidão a quem os criou e compartilhou:
                </p>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  <li>
                    <span className="text-foreground">Modelo:</span> Qwen3-0.6B — equipe Qwen (Alibaba), licença{' '}
                    <button type="button" onClick={() => window.api.openExternal('https://www.apache.org/licenses/LICENSE-2.0')}
                      className="text-primary underline-offset-2 hover:underline">Apache 2.0</button>.{' '}
                    <button type="button" onClick={() => window.api.openExternal('https://huggingface.co/Qwen/Qwen3-0.6B')}
                      className="text-primary underline-offset-2 hover:underline">Página do modelo</button>
                  </li>
                  <li>
                    <span className="text-foreground">Quantização GGUF:</span>{' '}
                    <button type="button" onClick={() => window.api.openExternal('https://huggingface.co/unsloth/Qwen3-0.6B-GGUF')}
                      className="text-primary underline-offset-2 hover:underline">unsloth (Hugging Face)</button>
                  </li>
                  <li>
                    <span className="text-foreground">Inferência local:</span>{' '}
                    <button type="button" onClick={() => window.api.openExternal('https://github.com/withcatai/node-llama-cpp')}
                      className="text-primary underline-offset-2 hover:underline">node-llama-cpp</button>{' '}/{' '}
                    <button type="button" onClick={() => window.api.openExternal('https://github.com/ggml-org/llama.cpp')}
                      className="text-primary underline-offset-2 hover:underline">llama.cpp</button> (MIT)
                  </li>
                </ul>
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
