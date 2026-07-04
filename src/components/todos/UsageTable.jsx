// Tabela de uso: barra de contexto (semáforo ok/warn/danger), quebra de cache
// (lido/criado/novo) e tokens por modelo — alternável para "por agente".
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { formatCompact, shortModel, contextLevel, cacheLevel } from '@/lib/todosFormat';

const CTX_COLORS = { ok: 'bg-emerald-500', warn: 'bg-amber-500', danger: 'bg-red-500' };
const CACHE_BADGE = { good: 'text-emerald-500', mid: 'text-amber-500', low: 'text-red-500' };

export function UsageTable({ usage }) {
  const t = useT();
  const [byAgent, setByAgent] = useState(false);
  if (!usage || usage.byModel.length === 0) return null;

  const ctx = usage.context;
  const ctxPct = ctx ? Math.min(ctx.tokens / ctx.limit, 1) : 0;
  const ctxLvl = ctx ? contextLevel(ctx.tokens / ctx.limit) : 'ok';
  const cache = usage.cache;
  const cacheTotal = cache ? cache.input + cache.read + cache.creation : 0;
  const cacheRate = cache && cacheTotal > 0 ? cache.read / cacheTotal : 0;
  const pctOf = (part) => (cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0);
  const totals = usage.byModel.reduce(
    (acc, m) => ({ input: acc.input + m.input, output: acc.output + m.output, cache: acc.cache + m.cache }),
    { input: 0, output: 0, cache: 0 }
  );
  const num = 'px-2 py-1 text-right tabular-nums';

  return (
    <section className="mx-1 mb-2 rounded-lg border px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between py-0.5">
        <span className="flex items-center gap-1.5 font-semibold">
          {t('todos.usage_tokens')}
          {ctx && (
            <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold text-white', CTX_COLORS[ctxLvl])}>
              {t('todos.usage_ctx_badge', { pct: Math.round(ctxPct * 100) })}
            </span>
          )}
        </span>
        <button type="button" onClick={() => setByAgent((b) => !b)} className="text-muted-foreground transition-colors hover:text-foreground">
          {byAgent ? '◂ ' + t('todos.usage_by_model') : t('todos.usage_by_agent') + ' ▸'}
        </button>
      </div>

      {ctx && (
        <div className="flex items-center gap-2 py-1">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn('h-full rounded-full', CTX_COLORS[ctxLvl])} style={{ width: `${Math.round(ctxPct * 100)}%` }} />
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
        </div>
      )}

      {cache && cacheTotal > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <span className="text-muted-foreground">{t('todos.usage_cache')}</span>
            <span className={cn('font-semibold', CACHE_BADGE[cacheLevel(cacheRate)])}>
              {t('todos.usage_cache_reuse', { pct: Math.round(cacheRate * 100) })}
            </span>
          </div>
          <div className="my-1 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="bg-emerald-500" style={{ width: `${pctOf(cache.read)}%` }} />
            <div className="bg-sky-500" style={{ width: `${pctOf(cache.creation)}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${pctOf(cache.input)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pb-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{t('todos.usage_cache_read')} {formatCompact(cache.read)}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-500" />{t('todos.usage_cache_created')} {formatCompact(cache.creation)}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-muted-foreground/40" />{t('todos.usage_cache_new')} {formatCompact(cache.input)}</span>
          </div>
        </>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">{byAgent ? t('todos.usage_col_agent') : t('todos.usage_col_model')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_col_input')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_col_output')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_cache')}</th>
          </tr>
        </thead>
        <tbody>
          {byAgent
            ? usage.byAgent.flatMap((agent) => agent.models.map((m, i) => (
              <tr key={agent.agentId + m.model} title={`${agent.name}\n${m.model}`}>
                <td className="max-w-0 truncate px-2 py-1">{i === 0 ? agent.name + ' ' : ''}<span className="text-muted-foreground">{shortModel(m.model)}</span></td>
                <td className={num} title={String(m.input)}>{formatCompact(m.input)}</td>
                <td className={num} title={String(m.output)}>{formatCompact(m.output)}</td>
                <td className={num} title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            )))
            : usage.byModel.map((m) => (
              <tr key={m.model} title={m.model}>
                <td className="max-w-0 truncate px-2 py-1">{shortModel(m.model)}</td>
                <td className={num} title={String(m.input)}>{formatCompact(m.input)}</td>
                <td className={num} title={String(m.output)}>{formatCompact(m.output)}</td>
                <td className={num} title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="px-2 py-1">{t('todos.usage_total')}</td>
            <td className={num}>{formatCompact(totals.input)}</td>
            <td className={num}>{formatCompact(totals.output)}</td>
            <td className={num}>{formatCompact(totals.cache)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
