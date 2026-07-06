// Card de um agente (principal ou sub-agent): cabeçalho recolhível com nome,
// bolinha de estado (pulsa rodando, verde concluído), fração X/Y e badge de
// ativas; corpo com os tempos (decorrido/estimativa) e a lista de tasks.
import { useState } from 'react';
import { ChevronRight, Clock, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { formatDuration, summarizeTiming, completedTaskDurations } from '@/lib/todosFormat';
import { TodoItem } from './TodoItem.jsx';

export function AgentSection({ agent, defaultExpanded = true, history = false, now }) {
  const t = useT();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const total = agent.todos.length;
  const completed = agent.todos.filter((x) => x.status === 'completed').length;
  const inProgress = agent.todos.filter((x) => x.status === 'in_progress').length;
  // Estado visual: ativo (pulsa), concluído (verde) ou ocioso.
  const state =
    inProgress > 0 || agent.status === 'running'
      ? 'active'
      : total > 0 && completed === total
        ? 'done'
        : 'idle';
  const timing = summarizeTiming(agent.todos, now);
  const durations = completedTaskDurations(agent.todos);
  const name = agent.isMain ? t('todos.main_agent') : agent.name;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border',
        !agent.isMain && 'ml-3',
        history && 'opacity-50',
        state === 'active' && 'shadow-[inset_2px_0_0_theme(colors.primary.DEFAULT)]',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )}
        />
        {state !== 'idle' && (
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              state === 'active' ? 'animate-pulse bg-primary' : 'bg-emerald-500',
            )}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <span className="tabular-nums text-muted-foreground">
            {completed}/{total}
          </span>
          {inProgress > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-px font-semibold text-primary">
              {inProgress === 1
                ? t('todos.active_badge_one')
                : t('todos.active_badge', { count: inProgress })}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <>
          {(timing.elapsedMs > 0 || timing.hasEstimate) && (
            <div className="flex gap-2 px-3 pb-1 tabular-nums">
              {timing.elapsedMs > 0 && (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-muted/60 p-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {t('todos.elapsed')}
                  </span>
                  <span className="text-sm font-semibold">{formatDuration(timing.elapsedMs)}</span>
                </div>
              )}
              {timing.hasEstimate && (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-muted/60 p-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Hourglass className="size-3" />
                    {t('todos.remaining')}
                  </span>
                  <span className="text-sm font-semibold">
                    ~{formatDuration(timing.estimateMs)}
                  </span>
                  <span
                    className="text-[10px] italic text-muted-foreground/75"
                    title={t('todos.estimate_tooltip')}
                  >
                    {t('todos.estimate_label')}
                  </span>
                </div>
              )}
            </div>
          )}
          <ul className="m-0 list-none px-1 pb-2">
            {agent.todos.map((todo, i) => (
              <TodoItem key={i} todo={todo} completedMs={durations[i]} now={now} />
            ))}
            {agent.todos.length === 0 && (
              <li className="px-3 py-1.5 text-[13px] italic text-muted-foreground/70">
                {t('todos.no_todos')}
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
