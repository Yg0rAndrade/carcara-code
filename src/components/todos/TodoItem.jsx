// Um item da task list: ícone de status, rótulo (activeForm enquanto roda) e a
// duração — ao vivo (relógio, via `now` injetado) na ativa, medida nas concluídas.
import { Check, Circle, Clock, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/todosFormat';

export function TodoItem({ todo, completedMs, now }) {
  const inProgress = todo.status === 'in_progress';
  const completed = todo.status === 'completed';
  const label = inProgress ? todo.activeForm : todo.content;
  let duration = null;
  if (inProgress && todo.startedAt !== undefined) {
    duration = { live: true, text: formatDuration(now - todo.startedAt) };
  } else if (completed && completedMs !== undefined) {
    duration = { live: false, text: completedMs < 1000 ? '<1s' : formatDuration(completedMs) };
  }
  return (
    <li className={cn(
      'flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug transition-colors hover:bg-muted/60',
      inProgress && 'bg-primary/10'
    )}>
      {completed
        ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        : inProgress
          ? <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary [animation-duration:2.5s]" />
          : <Circle className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />}
      <span className={cn(
        'min-w-0 flex-1 break-words',
        completed && 'text-muted-foreground line-through opacity-70',
        inProgress && 'font-semibold text-primary'
      )}>{label}</span>
      {duration && (
        <span className={cn(
          'flex shrink-0 items-center gap-1 text-xs tabular-nums',
          duration.live ? 'font-semibold text-primary' : 'text-muted-foreground'
        )}>
          {duration.live && <Clock className="size-3" />}{duration.text}
        </span>
      )}
    </li>
  );
}
