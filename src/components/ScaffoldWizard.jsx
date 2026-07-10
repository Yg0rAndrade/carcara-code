import { useEffect, useRef, useState } from 'react';
import {
  Atom,
  Triangle,
  Rocket,
  FileCode,
  Loader2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button.jsx';
import { useT } from '@/lib/i18n';

const ICONS = { Atom, Triangle, Rocket, FileCode };

// Estados: 'pick' | 'confirm' | 'running' | 'error'
export function ScaffoldWizard({ projectPath, junk }) {
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
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-center">
        <div className="text-lg font-semibold">{t('scaffold.title')}</div>
        <div className="mt-1 text-sm text-muted-foreground">{t('scaffold.subtitle')}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stacks.map((s) => {
          const Icon = ICONS[s.icon] || ChevronRight;
          return (
            <button
              key={s.id}
              onClick={() => choose(s.id)}
              className="flex w-44 items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent"
            >
              <Icon className="shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate font-medium">{s.label}</div>
                <div className="truncate text-xs text-muted-foreground">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
