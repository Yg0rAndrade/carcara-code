import { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  ChevronRight,
  Info,
  Sparkles,
  Download,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button } from './ui/button.jsx';
import { ReactLogo, NextLogo, AstroLogo } from './scaffoldLogos.jsx';
import { useT } from '@/lib/i18n';

// Logo oficial por stack (fallback: ChevronRight se surgir id novo sem logo).
const STACK_LOGOS = { 'vite-react': ReactLogo, next: NextLogo, astro: AstroLogo };
// Texto do "i" de informação por stack (linguagem simples, sem jargão).
const INFO_KEY = { 'vite-react': 'info_react', next: 'info_next', astro: 'info_astro' };

// CTA da skill `start` (github.com/Yg0rAndrade/start-skill): pra quem abriu uma pasta
// vazia e não sabe qual dos três cards escolher. Instala com 1 clique (npx no main) e,
// depois, oferece abrir uma sessão nova — o Claude só enxerga a skill numa sessão nova.
// Estados: 'idle' | 'installing' | 'installed' | 'error'.
function StartSkillCta({ projectPath, onNewSession }) {
  const t = useT();
  const [state, setState] = useState('idle');
  const [url, setUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let alive = true;
    const p = window.api.skillDetect?.('start', projectPath);
    if (!p || !p.then) return;
    p.then((r) => {
      if (!alive || !r) return;
      if (r.url) setUrl(r.url);
      if (r.installed) setState('installed');
    });
    return () => {
      alive = false;
    };
  }, [projectPath]);

  const install = async () => {
    setErrorMsg('');
    setState('installing');
    const res = await window.api.skillInstall?.('start', projectPath);
    if (res && res.ok) {
      setState('installed');
      return;
    }
    const code = res?.error;
    setErrorMsg(
      code === 'missing-git'
        ? t('scaffold.skill_missing_git')
        : code === 'missing-node'
          ? t('scaffold.missing_node')
          : t('scaffold.skill_error'),
    );
    setState('error');
  };

  const installed = state === 'installed';
  const Icon = installed ? Check : Sparkles;

  return (
    <div className="w-full max-w-xl rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-transparent p-4 text-left">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="text-sm font-semibold">
            {installed ? t('scaffold.skill_installed') : t('scaffold.skill_title')}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {installed ? t('scaffold.skill_ready_hint') : t('scaffold.skill_desc')}
          </p>
          {state === 'error' && <p className="mt-1 text-xs text-destructive">{errorMsg}</p>}
          {!installed && url && (
            <button
              onClick={() => window.api.openExternal(url)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('scaffold.skill_learn_more')}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="shrink-0">
          {installed ? (
            onNewSession ? (
              <Button size="sm" variant="secondary" onClick={onNewSession}>
                {t('scaffold.skill_new_session')}
              </Button>
            ) : null
          ) : (
            <Button size="sm" onClick={install} disabled={state === 'installing'}>
              {state === 'installing' ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t('scaffold.skill_installing')}
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {state === 'error' ? t('scaffold.retry') : t('scaffold.skill_install')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Estados: 'pick' | 'confirm' | 'running' | 'error'
export function ScaffoldWizard({ projectPath, junk, onNewSession }) {
  const t = useT();
  const [stacks, setStacks] = useState([]);
  const [view, setView] = useState('pick');
  const [pending, setPending] = useState(null); // stackId escolhido, aguardando confirm
  const [phase, setPhase] = useState('scaffolding'); // 'scaffolding' | 'starting'
  const [error, setError] = useState(null); // { message, log }
  const [showLog, setShowLog] = useState(false);
  const junkCount = Array.isArray(junk) ? junk.length : 0;

  // Carrega catálogo e reconecta a um scaffold que já esteja rodando (background).
  useEffect(() => {
    let alive = true;
    window.api.scaffoldStacks().then((s) => alive && setStacks(s || []));
    window.api.scaffoldStatus(projectPath).then((st) => {
      if (alive && st && st.phase) {
        setView('running');
        setPhase(st.phase);
      }
    });
    return () => {
      alive = false;
    };
  }, [projectPath]);

  // Listeners dos eventos do motor (só do NOSSO projeto).
  const startPreviewRef = useRef(false);
  useEffect(() => {
    const offs = [];
    offs.push(
      window.api.on('scaffold:progress', ({ projectPath: p, phase: ph }) => {
        if (p !== projectPath) return;
        setPhase(ph || 'scaffolding');
      }),
    );
    offs.push(
      window.api.on('scaffold:done', async ({ projectPath: p }) => {
        if (p !== projectPath) return;
        setPhase('starting');
        if (startPreviewRef.current) return;
        startPreviewRef.current = true;
        const res = await window.api.startPreview(projectPath);
        // Se não há dev server pra subir, mostra erro amigável em vez de travar.
        if (res && res.error) {
          setError({ message: res.error, log: '' });
          setView('error');
        }
        // Sucesso: o PreviewPanel troca o modo pra 'web' no preview:ready e
        // este componente se desmonta. Nada mais a fazer aqui.
      }),
    );
    offs.push(
      window.api.on('scaffold:error', ({ projectPath: p, message, log }) => {
        if (p !== projectPath) return;
        setError({ message, log });
        setView('error');
      }),
    );
    return () => offs.forEach((off) => off && off());
  }, [projectPath]);

  const choose = (stackId) => {
    if (junkCount > 0) {
      setPending(stackId);
      setView('confirm');
    } else {
      run(stackId);
    }
  };

  const run = async (stackId) => {
    setError(null);
    setView('running');
    setPhase('scaffolding');
    startPreviewRef.current = false;
    const res = await window.api.scaffoldRun(projectPath, stackId);
    if (res && res.error) {
      const msg =
        res.error === 'missing-node'
          ? t('scaffold.missing_node')
          : res.error === 'not-scaffoldable'
            ? t('scaffold.not_scaffoldable')
            : res.message || t('scaffold.error_title');
      setError({ message: msg, log: '' });
      setView('error');
    }
  };

  if (view === 'error') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="text-destructive" />
        <div className="font-medium">{t('scaffold.error_title')}</div>
        <div className="max-w-md text-sm text-muted-foreground">{error?.message}</div>
        {error?.log ? (
          <>
            <button
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowLog((v) => !v)}
            >
              {t('scaffold.error_details')}
            </button>
            {showLog && (
              <pre className="max-h-40 max-w-lg overflow-auto rounded bg-muted p-2 text-left font-mono text-[11px]">
                {error.log}
              </pre>
            )}
          </>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => setView('pick')}>
          {t('scaffold.retry')}
        </Button>
      </div>
    );
  }

  if (view === 'running') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          {phase === 'starting' ? t('scaffold.starting') : t('scaffold.creating')}
        </div>
      </div>
    );
  }

  if (view === 'confirm') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="max-w-md text-sm text-muted-foreground">
          {t('scaffold.junk_notice', { count: junkCount })}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setView('pick')}>
            {t('scaffold.cancel')}
          </Button>
          <Button size="sm" onClick={() => run(pending)}>
            {t('scaffold.confirm')}
          </Button>
        </div>
      </div>
    );
  }

  // view === 'pick'
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 overflow-auto p-6">
      <div className="max-w-md text-center">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {t('scaffold.eyebrow')}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('scaffold.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('scaffold.subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {stacks.map((s) => {
          const Logo = STACK_LOGOS[s.id] || ChevronRight;
          const infoKey = INFO_KEY[s.id];
          return (
            <button
              key={s.id}
              onClick={() => choose(s.id)}
              className="group relative flex w-44 flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-6 text-center transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg hover:shadow-primary/10"
            >
              {infoKey && (
                <span
                  className="group/info absolute right-2.5 top-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info
                    className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover/info:text-foreground"
                    aria-label={t('scaffold.info')}
                  />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 hidden w-56 rounded-lg border border-border bg-popover p-2.5 text-left text-xs leading-relaxed text-popover-foreground shadow-xl group-hover/info:block"
                  >
                    {t(`scaffold.${infoKey}`)}
                  </span>
                </span>
              )}
              <Logo className="h-10 w-10 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">{s.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
      <StartSkillCta projectPath={projectPath} onNewSession={onNewSession} />
    </div>
  );
}
