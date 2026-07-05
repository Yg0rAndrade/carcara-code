// Painel de Tarefas: espelha ao vivo a task list que o Claude Code emite
// (TodoWrite/TaskCreate) na sessão da ABA DE CHAT ATIVA — agente principal,
// sub-agents e uso de tokens. Os dados chegam prontos do main (todos:snapshot);
// aqui só assinatura, relógio e render.
import { useEffect, useState } from 'react';
import { EmptyState } from './ui/empty-state.jsx';
import { useT } from '@/lib/i18n';
import { AgentSection } from './todos/AgentSection.jsx';
import { UsageTable } from './todos/UsageTable.jsx';

// Sub-agent "histórico": terminou e nunca teve todos — vale um divisor, não um card cheio.
const isHistory = (a) => !a.isMain && a.status !== 'running' && a.todos.length === 0;
const isFirstHistory = (agents, i) => isHistory(agents[i]) && (i === 0 || !isHistory(agents[i - 1]));

export function TodosPanel({ active, chatSession }) {
  const t = useT();
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const projectPath = active?.path || null;

  // (Re)assina quando muda projeto/aba; desmonta = cancela. O filtro por
  // sessionId descarta um snapshot atrasado da assinatura anterior.
  useEffect(() => {
    setSnapshot(null);
    if (!projectPath || !chatSession) return;
    const off = window.api.on('todos:snapshot', (payload) => {
      if (payload.sessionId === chatSession) setSnapshot(payload.snapshot);
    });
    window.api.todosSubscribe(projectPath, chatSession);
    return () => { off(); window.api.todosUnsubscribe(); };
  }, [projectPath, chatSession]);

  // Relógio de 1s pros tempos ao vivo — só gira se algo está rodando.
  const hasLive = !!snapshot?.agents?.some(
    (a) => a.status === 'running' || a.todos.some((x) => x.status === 'in_progress')
  );
  useEffect(() => {
    if (!hasLive) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasLive]);

  if (!snapshot) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-background">
        <EmptyState>
          <p className="font-medium">{t('todos.no_session_title')}</p>
          <p className="text-xs opacity-80">{t('todos.no_session_body')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background p-2">
      <UsageTable usage={snapshot.usage} />
      {snapshot.agents.length > 0 ? (
        <div className="flex flex-col gap-2 px-1">
          {snapshot.agents.map((agent, i) => (
            <div key={agent.agentId} className="contents">
              {isFirstHistory(snapshot.agents, i) && (
                <div className="flex items-center gap-2 px-1 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  {t('todos.history_divider')}
                </div>
              )}
              <AgentSection agent={agent} defaultExpanded={agent.isMain} history={isHistory(agent)} now={now} />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-muted-foreground">
          <p className="text-sm">{t('todos.awaiting_title')}</p>
          <p className="mt-1 text-xs opacity-85">{t('todos.awaiting_sub')}</p>
        </div>
      )}
    </div>
  );
}
