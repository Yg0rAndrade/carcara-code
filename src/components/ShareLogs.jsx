// Logs do "abrir no celular": o que passa pelo repasse da rede local (electron/lan-share.cjs)
// — cada requisição com status e tempo, as conexões de recarga ao vivo e os erros. Card
// que nasce recolhido embaixo do QR; o cabeçalho já avisa se houve erro.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Radio, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const MAX = 300; // igual ao LAN_LOG_MAX do main

const hhmmss = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

function statusClass(e) {
  if (e.kind === 'error' || e.status >= 500) return 'text-destructive-ink';
  if (e.status >= 400) return 'text-[hsl(var(--warning))]';
  if (e.status >= 300) return 'text-info-ink';
  return 'text-[hsl(var(--success))]';
}

export function ShareLogs({ projectPath, width }) {
  const t = useT();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    setLogs([]);
    if (!projectPath) return;
    let alive = true;
    window.api.lanLogs?.(projectPath).then((l) => alive && setLogs(Array.isArray(l) ? l : []));
    const off = window.api.on('lan:log', (e) => {
      if (e?.projectPath !== projectPath) return;
      setLogs((cur) => {
        const next = [...cur, e.entry];
        return next.length > MAX ? next.slice(next.length - MAX) : next;
      });
    });
    return () => {
      alive = false;
      off?.();
    };
  }, [projectPath]);

  // Aberto: acompanha o fim da lista (como um terminal).
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [logs, open]);

  const errors = logs.filter((e) => e.kind === 'error' || e.status >= 500).length;
  const clear = () => {
    window.api.lanLogsClear?.(projectPath);
    setLogs([]);
  };

  return (
    <div
      className="pointer-events-auto rounded-2xl border bg-background/95 shadow-xl backdrop-blur"
      style={{ width }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-[13px] font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex-1">{t('lan.logs_title')}</span>
        {errors > 0 && (
          <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-destructive-ink">
            {errors}
          </span>
        )}
        <span className="text-[11px] tabular-nums text-muted-foreground">{logs.length}</span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t px-2 pb-2">
          <div
            ref={listRef}
            className="max-h-56 overflow-y-auto py-1.5 font-mono text-[11px] leading-relaxed"
          >
            {logs.length === 0 && (
              <p className="px-2 py-3 font-sans text-[12px] text-muted-foreground">
                {t('lan.logs_empty')}
              </p>
            )}
            {logs.map((e, i) => (
              <div
                key={i}
                title={e.ip ? `${e.ip}${e.message ? ' — ' + e.message : ''}` : e.message}
                className="flex items-center gap-2 rounded px-2 py-0.5 hover:bg-muted/60"
              >
                <span className="shrink-0 text-muted-foreground">{hhmmss(e.t)}</span>
                {e.kind === 'ws' ? (
                  <>
                    <Radio className="size-3 shrink-0 text-info-ink" />
                    <span className="min-w-0 flex-1 truncate text-info-ink">
                      {t('lan.logs_ws')}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={cn('w-7 shrink-0 font-semibold', statusClass(e))}>
                      {e.kind === 'error' ? 'ERR' : e.status}
                    </span>
                    <span className="w-9 shrink-0 text-muted-foreground">{e.method || ''}</span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        e.kind === 'error' && 'text-destructive-ink',
                      )}
                    >
                      {e.kind === 'error' ? `${e.url || ''} · ${e.message || ''}` : e.url}
                    </span>
                    {e.kind === 'http' && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">{e.ms}ms</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3"
            >
              <Trash2 />
              {t('lan.logs_clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
