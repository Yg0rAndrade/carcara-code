import { useCallback, useEffect, useState } from 'react';
import { Check, Download, RefreshCw, GitBranch, Hexagon, Loader2 } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { useT } from '@/lib/i18n';

// Ferramentas externas que o Carcará usa. O app abre sem elas (o Electron traz o próprio
// runtime) e a gente só guia a instalação — sem instalar nada escondido, sem pedir admin.
// Nota: o CLI de IA (Claude Code, Codex, OpenCode, Antigravity…) NÃO entra aqui — cada um
// instala o seu, e nem todo mundo usa o Claude. Aqui ficam só as dependências comuns a todos.
const LEVELS = {
  essential: { labelKey: 'setup.level_essential', cls: 'bg-primary/10 text-primary' },
  recommended: {
    labelKey: 'setup.level_recommended',
    cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
};

export const DEPENDENCIES = [
  {
    key: 'node',
    name: 'Node.js',
    Icon: Hexagon,
    level: 'essential',
    descKey: 'setup.node_desc',
    noteKey: 'setup.node_note',
    url: 'https://nodejs.org/en/download',
  },
  {
    key: 'git',
    name: 'Git',
    Icon: GitBranch,
    level: 'recommended',
    descKey: 'setup.git_desc',
    url: 'https://git-scm.com/download/win',
  },
];

function StatusPill({ state }) {
  const t = useT();
  if (state === 'loading') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {t('setup.pill_checking')}
      </span>
    );
  }
  if (state === true) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" /> {t('setup.pill_installed')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
      {t('setup.pill_not_found')}
    </span>
  );
}

// Hook compartilhado: detecta as ferramentas (sem cache) quando 'active' liga, e diz se as
// essenciais estão prontas. Usado pela tela de preparo (1º uso) e pela aba Dependências.
export function useDependencyStatus(active) {
  const [status, setStatus] = useState(null); // { git, node, npm, claude } | null
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const r = await window.api.checkTools();
      if (r?.ok) setStatus(r);
    } catch {
      /* ignora: a tela mostra "não encontrado" e o botão de baixar */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (active) check();
  }, [active, check]);

  const essentialsReady =
    !!status && DEPENDENCIES.filter((t) => t.level === 'essential').every((t) => status[t.key]);

  return { status, loading, check, essentialsReady };
}

// Lista visual dos cartões de dependência (compartilhada pela tela de preparo e pelas Configurações).
export function DependencyCards({ status, loading }) {
  const t = useT();
  const stateOf = (key) => (loading && !status ? 'loading' : status ? !!status[key] : false);
  return (
    <div className="flex flex-col gap-3">
      {DEPENDENCIES.map((dep) => {
        const st = stateOf(dep.key);
        const installed = st === true;
        const lvl = LEVELS[dep.level];
        return (
          <div
            key={dep.key}
            className={
              'flex items-start gap-3.5 rounded-xl border p-4 transition-colors ' +
              (installed ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : '')
            }
          >
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
              <dep.Icon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium">{dep.name}</span>
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ' +
                    lvl.cls
                  }
                >
                  {t(lvl.labelKey)}
                </span>
                <StatusPill state={st} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(dep.descKey)}</p>
              {dep.noteKey && !installed && (
                <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">
                  {t(dep.noteKey)}
                </p>
              )}
            </div>
            {!installed && (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5"
                onClick={() => window.api.openExternal(dep.url)}
              >
                <Download className="size-3.5" /> {t('setup.install')}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SetupScreen({ open, onClose }) {
  const t = useT();
  const { status, loading, check, essentialsReady } = useDependencyStatus(open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="eyebrow text-primary">{t('setup.badge')}</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('setup.title_main')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t('setup.description')}
        </p>

        <div className="mt-7">
          <DependencyCards status={status} loading={loading} />
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={check}
          >
            <RefreshCw className={'size-3.5 ' + (loading ? 'animate-spin' : '')} />{' '}
            {t('setup.check_again')}
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={onClose}>
            {essentialsReady ? t('setup.ready_enter') : t('setup.continue_anyway')}
          </Button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t('setup.footer')}</p>
      </div>
    </div>
  );
}
