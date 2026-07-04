import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Radio,
  Loader2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.jsx';
import { Button } from './ui/button.jsx';
import { ResizeBar } from './ui/resize-bar.jsx';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const LOG_LEVELS = [
  'debug',
  'info',
  'notice',
  'warning',
  'error',
  'critical',
  'alert',
  'emergency',
];

// Cor do badge por nível de log (RFC 5424).
const LEVEL_CLASS = {
  debug: 'text-muted-foreground',
  info: 'text-sky-500',
  notice: 'text-teal-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  critical: 'text-red-500',
  alert: 'text-red-600',
  emergency: 'text-red-600',
};

const MAX_INLINE = 50_000; // payloads maiores só expandem sob demanda

// Classifica uma mensagem JSON-RPC crua pela forma do objeto.
function classify(m) {
  if (!m || typeof m !== 'object') return 'other';
  const hasId = m.id !== undefined && m.id !== null;
  if (m.method && hasId) return 'request';
  if (hasId && (m.result !== undefined || m.error !== undefined))
    return m.error ? 'error' : 'response';
  if (m.method) return 'notification';
  return 'other';
}

const TYPE_BADGE = {
  request: 'text-sky-500',
  response: 'text-green-500',
  error: 'text-red-500',
  notification: 'text-muted-foreground',
  other: 'text-muted-foreground',
};

const fmtTime = (ts) => {
  const d = new Date(ts);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

const pretty = (v) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

// Linha expansível com o JSON cru. Usa <pre> (leve) em vez de editor por linha.
function JsonRow({ children, title, payload, defaultOpen = false }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const str = useMemo(() => pretty(payload), [payload]);
  const big = str.length > MAX_INLINE;
  const [forced, setForced] = useState(false);
  return (
    <li className="rounded bg-muted/40 px-2 py-1 text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-3 shrink-0 -rotate-90 text-muted-foreground" />
        )}
        {children}
      </button>
      {open &&
        (big && !forced ? (
          <button
            type="button"
            onClick={() => setForced(true)}
            className="mt-1 text-[11px] italic text-muted-foreground hover:text-foreground"
          >
            {t('mcp.inspector.payload_large', { size: Math.round(str.length / 1024) })}
          </button>
        ) : (
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
            {str}
          </pre>
        ))}
    </li>
  );
}

export function McpInspectorDrawer({
  open,
  onToggle,
  height,
  onResizeStart,
  traffic,
  truncated,
  onClear,
  stderr,
  caps,
  onPing,
  onSetLevel,
}) {
  const t = useT();
  const [tab, setTab] = useState('history');
  const [filter, setFilter] = useState('all'); // all | request | response | notification
  const [level, setLevel] = useState('');
  const [pinging, setPinging] = useState(false);
  const [pingMsg, setPingMsg] = useState(null);

  // Casa response→request pelo id pra calcular latência.
  const reqById = useMemo(() => {
    const map = new Map();
    for (const e of traffic) {
      if (e.dir === 'out' && e.message?.id != null) map.set(e.message.id, e.ts);
    }
    return map;
  }, [traffic]);

  const history = useMemo(() => {
    const rows = traffic.map((e) => ({ ...e, type: classify(e.message) }));
    if (filter === 'all') return rows;
    if (filter === 'notification') return rows.filter((r) => r.type === 'notification');
    if (filter === 'response')
      return rows.filter((r) => r.type === 'response' || r.type === 'error');
    return rows.filter((r) => r.type === filter);
  }, [traffic, filter]);

  const logs = useMemo(
    () => traffic.filter((e) => e.message?.method === 'notifications/message'),
    [traffic],
  );

  // Agrupa progress por token; guarda o último valor de cada um.
  const progress = useMemo(() => {
    const groups = new Map();
    for (const e of traffic) {
      if (e.message?.method !== 'notifications/progress') continue;
      const p = e.message.params || {};
      groups.set(p.progressToken, { ...p, ts: e.ts });
    }
    return [...groups.entries()];
  }, [traffic]);

  const doPing = async () => {
    setPinging(true);
    setPingMsg(null);
    const r = await onPing();
    setPinging(false);
    setPingMsg(r?.ok ? `${r.ms}ms` : r?.error || 'falhou');
  };

  const doSetLevel = async (lvl) => {
    setLevel(lvl);
    await onSetLevel(lvl);
  };

  if (!open) {
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 border-t bg-card px-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronUp className="size-3.5" />
          Inspector
        </button>
        <span className="text-[11px] text-muted-foreground">
          {traffic.length} {t('mcp.inspector.msgs')}
        </span>
        {truncated > 0 && (
          <span className="text-[11px] text-amber-500">
            +{truncated} {t('mcp.inspector.truncated')}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <ResizeBar orientation="horizontal" onMouseDown={onResizeStart} />
      <div style={{ height }} className="flex shrink-0 flex-col border-t bg-card">
        {/* Barra de topo */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 text-xs font-medium text-foreground"
          >
            <ChevronDown className="size-3.5 text-muted-foreground" />
            Inspector
          </button>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-7 gap-0.5 p-0.5">
              <TabsTrigger value="history" className="h-6 px-2 text-[11px]">
                History
              </TabsTrigger>
              <TabsTrigger value="logging" className="h-6 px-2 text-[11px]">
                Logging
              </TabsTrigger>
              <TabsTrigger value="progress" className="h-6 px-2 text-[11px]">
                Progress
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex-1" />
          {pingMsg && <span className="text-[11px] text-muted-foreground">ping: {pingMsg}</span>}
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={doPing}
            disabled={pinging}
          >
            {pinging ? <Loader2 className="mr-1 animate-spin" /> : <Radio className="mr-1" />}Ping
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {traffic.length} {t('mcp.inspector.msgs')}
            {truncated > 0 && <span className="text-amber-500"> +{truncated}</span>}
          </span>
        </div>

        {/* Corpo */}
        <div className="min-h-0 flex-1 overflow-auto p-2">
          {tab === 'history' ? (
            <>
              <div className="mb-2 flex items-center gap-1">
                {['all', 'request', 'response', 'notification'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[11px] capitalize',
                      filter === f
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {f}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={onClear}
                  disabled={!traffic.length}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  <Trash2 className="size-3" />
                  {t('mcp.inspector.clear')}
                </button>
              </div>
              {history.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  {t('mcp.inspector.no_traffic')}
                </p>
              ) : (
                <ul className="space-y-1">
                  {history
                    .slice()
                    .reverse()
                    .map((r) => {
                      const lat =
                        r.type === 'response' || r.type === 'error'
                          ? reqById.get(r.message.id)
                          : null;
                      return (
                        <JsonRow key={r.seq} payload={r.message} title={r.type}>
                          {r.dir === 'out' ? (
                            <ArrowRight className="size-3 shrink-0 text-sky-500" />
                          ) : (
                            <ArrowLeft className="size-3 shrink-0 text-green-500" />
                          )}
                          <span
                            className={cn(
                              'shrink-0 font-mono text-[10px] font-semibold uppercase',
                              TYPE_BADGE[r.type],
                            )}
                          >
                            {r.type}
                          </span>
                          <span className="truncate font-mono text-foreground">
                            {r.message?.method || (r.message?.error ? 'error' : 'result')}
                          </span>
                          {r.message?.id != null && (
                            <span className="shrink-0 text-muted-foreground">
                              #{String(r.message.id)}
                            </span>
                          )}
                          <div className="flex-1" />
                          {lat != null && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {r.ts - lat}ms
                            </span>
                          )}
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {fmtTime(r.ts)}
                          </span>
                        </JsonRow>
                      );
                    })}
                </ul>
              )}
            </>
          ) : tab === 'logging' ? (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {t('mcp.inspector.level_label')}
                </span>
                <Select value={level} onValueChange={doSetLevel} disabled={!caps?.logging}>
                  <SelectTrigger className="h-6 w-[120px] text-[11px]">
                    <SelectValue placeholder="setLevel…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOG_LEVELS.map((l) => (
                      <SelectItem key={l} value={l} className="text-[11px]">
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!caps?.logging && (
                  <span className="text-[11px] text-muted-foreground">
                    {t('mcp.inspector.server_no_logging')}
                  </span>
                )}
              </div>
              {logs.length === 0 && !stderr ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  {t('mcp.inspector.no_logs')}
                </p>
              ) : (
                <ul className="space-y-1">
                  {logs
                    .slice()
                    .reverse()
                    .map((e) => {
                      const p = e.message.params || {};
                      return (
                        <JsonRow key={e.seq} payload={p.data ?? p}>
                          <span
                            className={cn(
                              'shrink-0 font-mono text-[10px] font-semibold uppercase',
                              LEVEL_CLASS[p.level] || 'text-muted-foreground',
                            )}
                          >
                            {p.level || 'log'}
                          </span>
                          {p.logger && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {p.logger}
                            </span>
                          )}
                          <span className="truncate font-mono text-foreground">
                            {typeof p.data === 'string' ? p.data : pretty(p.data)}
                          </span>
                          <div className="flex-1" />
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {fmtTime(e.ts)}
                          </span>
                        </JsonRow>
                      );
                    })}
                </ul>
              )}
              {stderr && (
                <div className="mt-2">
                  <div className="eyebrow mb-1">stderr</div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {stderr}
                  </pre>
                </div>
              )}
            </>
          ) : progress.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              {t('mcp.inspector.no_progress')}
            </p>
          ) : (
            <ul className="space-y-2">
              {progress.map(([token, p]) => {
                const pct = p.total
                  ? Math.min(100, Math.round((p.progress / p.total) * 100))
                  : null;
                return (
                  <li key={String(token)} className="rounded bg-muted/40 px-2.5 py-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-foreground">
                        {p.message || `token ${String(token)}`}
                      </span>
                      <div className="flex-1" />
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {p.progress}
                        {p.total != null && ` / ${p.total}`}
                      </span>
                    </div>
                    {pct != null && (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-background">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
