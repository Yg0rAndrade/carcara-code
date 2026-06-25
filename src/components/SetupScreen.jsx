import { useCallback, useEffect, useState } from 'react';
import { Check, Download, RefreshCw, GitBranch, Hexagon, Loader2 } from 'lucide-react';
import { ClaudeCodeIcon } from '@/lib/cliIcons.jsx';
import { Button } from './ui/button.jsx';

// Ferramentas externas que o Carcará usa. O app abre sem elas (o Electron traz o
// próprio runtime), e a gente só guia a instalação — sem instalar nada escondido,
// sem pedir admin. Ordem por importância: Claude é o coração; Git ajuda; Node é extra.
const LEVELS = {
  essential: { label: 'Essencial', cls: 'bg-primary/10 text-primary' },
  recommended: { label: 'Recomendado', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  optional: { label: 'Opcional', cls: 'bg-muted text-muted-foreground' },
};

const TOOLS = [
  {
    key: 'claude',
    name: 'Claude Code',
    Icon: ClaudeCodeIcon,
    brandIcon: true,
    level: 'essential',
    desc: 'A IA que conversa no terminal — o coração do Carcará. Instalação nativa, não precisa de Node.',
    note: 'No PowerShell, dá pra instalar com uma linha:  irm https://claude.ai/install.ps1 | iex',
    url: 'https://code.claude.com/docs/en/setup',
  },
  {
    key: 'git',
    name: 'Git',
    Icon: GitBranch,
    level: 'recommended',
    desc: 'Usado pela aba Git (commits, branches, GitHub) e pela ferramenta Bash do Claude. Sem ele, o Claude cai no PowerShell.',
    url: 'https://git-scm.com/download/win',
  },
  {
    key: 'node',
    name: 'Node.js',
    Icon: Hexagon,
    level: 'recommended',
    desc: 'Necessário pra rodar e pré-visualizar os projetos dentro do Carcará (o servidor de dev). O Claude funciona sem ele, mas os projetos não rodam.',
    note: 'Baixe a versão LTS.',
    url: 'https://nodejs.org/en/download',
  },
];

function StatusPill({ state }) {
  if (state === 'loading') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> verificando…
      </span>
    );
  }
  if (state === true) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" /> Instalado
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
      Não encontrado
    </span>
  );
}

export function SetupScreen({ open, onClose }) {
  const [status, setStatus] = useState(null); // { git, node, npm, claude } | null
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.checkTools();
      if (r?.ok) setStatus(r);
    } catch { /* ignora: a tela mostra "não encontrado" e o botão de baixar */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) check(); }, [open, check]);

  if (!open) return null;

  const stateOf = (key) => (loading && !status ? 'loading' : status ? !!status[key] : false);
  const claudeReady = status && status.claude; // o único essencial

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="eyebrow text-primary">Primeiro uso</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Vamos preparar seu PC</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          O Carcará abre sozinho, mas ele trabalha em cima de algumas ferramentas que ficam no seu
          computador. Confira o que já está pronto e instale o que faltar — é uma vez só.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          {TOOLS.map((t) => {
            const st = stateOf(t.key);
            const installed = st === true;
            const lvl = LEVELS[t.level];
            return (
              <div key={t.key}
                className={'flex items-start gap-3.5 rounded-xl border p-4 transition-colors ' + (installed ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : '')}>
                <span className={'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ' + (t.brandIcon ? '' : 'bg-muted text-foreground')}>
                  {t.brandIcon ? <t.Icon className="size-9 rounded-lg" /> : <t.Icon className="size-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium">{t.name}</span>
                    <span className={'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' + lvl.cls}>{lvl.label}</span>
                    <StatusPill state={st} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
                  {t.note && !installed && (
                    <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">{t.note}</p>
                  )}
                </div>
                {!installed && (
                  <Button size="sm" variant="secondary" className="shrink-0 gap-1.5"
                    onClick={() => window.api.openExternal(t.url)}>
                    <Download className="size-3.5" /> Instalar
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={loading} onClick={check}>
            <RefreshCw className={'size-3.5 ' + (loading ? 'animate-spin' : '')} /> Verificar de novo
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={onClose}>
            {claudeReady ? 'Tudo pronto — entrar' : 'Continuar mesmo assim'}
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Pode entrar e instalar o resto quando quiser. Acabou de instalar algo? Clique em
          “Verificar de novo”. Esta tela volta pelo menu de comandos (Ctrl/Cmd+K → “Preparar meu PC”).
        </p>
      </div>
    </div>
  );
}
