// Carcará Code AI: chat HTML por cima do motor headless OpenCode. Isolado do
// AssistantChat (chat:* / Claude Code) — usa os canais carcara:* e o contrato de
// eventos { kind } normalizado ({text|reasoning|tool|diff|permission|idle|error|phase}).
// Mesmo padrão de ExternalStoreRuntime do assistant-ui usado no AssistantChat.jsx
// (imports/primitives espelhados de lá, que é a fonte da verdade da versão instalada).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react';
import { ArrowUp, Square, Wrench, Brain, Check, X, Loader2, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

let _id = 0;
const nextId = () => 'm' + ++_id;

// Aplica um evento normalizado ({kind}) no modelo de mensagens local.
// Modelo interno: { id, ocId, role, parts:[{ pid, type:'text'|'reasoning'|'tool'|'permission', ... }] }.
// Cada mensagem do assistente é indexada pelo messageId do OpenCode (ocId); cada parte
// pelo partId (pid). delta ANEXA ao texto da parte; text/reasoning updated SUBSTITUI (é o
// estado cheio). Partes de mensagens 'user' são filtradas (senão o eco da pergunta cai aqui).
// `roleByMsg` é um objeto mutável { messageId: 'user'|'assistant' } (vive num ref).
function applyEvent(prev, event, roleByMsg) {
  // message.updated: só registra o papel da mensagem (sem mudar a timeline).
  if (event.kind === 'message') {
    if (event.messageId) roleByMsg[event.messageId] = event.role;
    return prev;
  }
  const msgId = event.messageId;
  if (msgId && roleByMsg[msgId] === 'user') return prev; // filtra eco do usuário
  if (!['delta', 'text', 'reasoning', 'tool', 'permission', 'error'].includes(event.kind)) {
    return prev; // idle/phase/diff tratados fora
  }

  const next = prev.slice();
  // Acha/cria a bolha do assistente desta mensagem do OpenCode. 'error' pode não ter
  // messageId → usa a última bolha do assistente (ou cria uma).
  let idx;
  if (msgId) {
    idx = next.findIndex((m) => m.ocId === msgId);
    if (idx === -1) {
      next.push({ id: nextId(), ocId: msgId, role: 'assistant', parts: [] });
      idx = next.length - 1;
    } else {
      next[idx] = { ...next[idx], parts: next[idx].parts.slice() };
    }
  } else {
    idx = next.map((m) => m.role).lastIndexOf('assistant');
    if (idx === -1) {
      next.push({ id: nextId(), ocId: null, role: 'assistant', parts: [] });
      idx = next.length - 1;
    } else {
      next[idx] = { ...next[idx], parts: next[idx].parts.slice() };
    }
  }
  const parts = next[idx].parts;
  const findPart = (pid) => (pid ? parts.findIndex((p) => p.pid === pid) : -1);

  switch (event.kind) {
    case 'delta': {
      const pi = findPart(event.partId);
      if (pi === -1) parts.push({ pid: event.partId, type: 'text', text: event.delta });
      else parts[pi] = { ...parts[pi], text: (parts[pi].text || '') + event.delta };
      break;
    }
    case 'text':
    case 'reasoning': {
      const pi = findPart(event.partId);
      const patch = { pid: event.partId, type: event.kind, text: event.text };
      if (pi === -1) parts.push(patch);
      else parts[pi] = { ...parts[pi], ...patch }; // substitui (estado cheio)
      break;
    }
    case 'tool': {
      const pi = findPart(event.partId);
      const patch = {
        pid: event.partId,
        type: 'tool',
        toolCallId: event.partId || nextId(),
        toolName: event.tool,
        status: event.status,
      };
      if (pi === -1) parts.push(patch);
      else parts[pi] = { ...parts[pi], ...patch };
      break;
    }
    case 'permission':
      parts.push({ type: 'permission', permissionId: event.permissionId, title: event.title });
      break;
    case 'error':
      parts.push({ type: 'text', text: '⚠️ ' + (event.message || 'erro') });
      break;
  }
  return next;
}

export function CarcaraChat({ sessionId, projectPath }) {
  const t = useT();
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('');
  const [pending, setPending] = useState(null); // {permissionId, title}
  const roleByMsgRef = useRef({}); // { messageId: 'user' | 'assistant' } — filtra eco
  const sessionRef = useRef(sessionId);
  const projectRef = useRef(projectPath);
  sessionRef.current = sessionId;
  projectRef.current = projectPath;

  // Zera a timeline ao trocar de sessão.
  useEffect(() => {
    setMessages([]);
    setBusy(false);
    setPending(null);
    roleByMsgRef.current = {};
  }, [sessionId]);

  // Sobe o motor headless para esta sessão.
  useEffect(() => {
    if (!sessionId || !projectPath) return;
    setReady(false);
    setPhase('');
    window.api.carcaraEnsure?.(sessionId, projectPath).then((r) => {
      if (r && r.error) setPhase('Erro: ' + r.error);
      else setReady(true);
    });
    return () => window.api.carcaraDispose?.(sessionId);
  }, [sessionId, projectPath]);

  // Assina o stream de eventos da sessão.
  useEffect(() => {
    if (!sessionId) return;
    const off = window.api.on?.('carcara:event', ({ sessionId: sid, event }) => {
      if (sid !== sessionId || !event) return;
      if (event.kind === 'phase') return setPhase(event.text);
      if (event.kind === 'idle') return setBusy(false);
      if (event.kind === 'permission')
        setPending({ permissionId: event.permissionId, title: event.title, diff: event.diff });
      setMessages((prev) => applyEvent(prev, event, roleByMsgRef.current));
    });
    return () => off?.();
  }, [sessionId]);

  // Novo turno do usuário (disparado pelo composer do assistant-ui).
  const onNew = useCallback(
    async (message) => {
      const text = (message.content || [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
        .trim();
      const sid = sessionRef.current;
      if (!text || !sid) return;
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', parts: [{ type: 'text', text }] },
      ]);
      setBusy(true);
      const r = await window.api.carcaraSend?.(sid, text);
      if (r && r.error) {
        setBusy(false);
        setPhase(t('carcara.error', { error: r.error }));
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', parts: [{ type: 'text', text: '⚠️ ' + r.error }] },
        ]);
      }
    },
    [t],
  );

  const onCancel = useCallback(() => {
    const sid = sessionRef.current;
    if (sid) window.api.carcaraAbort?.(sid);
    setBusy(false);
  }, []);

  const decide = useCallback(
    async (ok) => {
      const sid = sessionRef.current;
      if (!pending || !sid) return;
      await window.api.carcaraApprove?.(sid, pending.permissionId, ok);
      setPending(null);
    },
    [pending],
  );

  const convertMessage = useCallback(
    (m) => ({
      role: m.role,
      content: m.parts
        .filter((p) => p.type !== 'permission')
        .map((p) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : p.type === 'reasoning'
              ? { type: 'reasoning', text: p.text }
              : {
                  type: 'tool-call',
                  toolCallId: p.toolCallId,
                  toolName: p.toolName,
                  args: {},
                  result: p.status,
                },
        ),
    }),
    [],
  );

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: busy,
    convertMessage,
    onNew,
    onCancel,
  });

  const composerPlaceholder = useMemo(
    () => (ready ? t('carcara.composerPlaceholder') : phase || t('carcara.starting')),
    [ready, phase, t],
  );

  if (!sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {t('carcara.selectProject')}
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        {!ready && (
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {phase || t('carcara.starting')}
          </div>
        )}
        <ThreadPrimitive.Viewport
          autoScroll
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          <ThreadPrimitive.Empty>
            <EmptyState />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          {busy && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {phase || t('carcara.working')}
            </div>
          )}
        </ThreadPrimitive.Viewport>

        {pending && (
          <div className="mx-3 mb-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-2 text-sm">{pending.title || t('carcara.approveTitle')}</div>
            {pending.diff && <DiffView diff={pending.diff} />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decide(true)}
                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
              >
                <Check className="size-4" /> {t('carcara.accept')}
              </button>
              <button
                type="button"
                onClick={() => decide(false)}
                className="inline-flex items-center gap-1 rounded border border-border px-3 py-1 text-sm"
              >
                <X className="size-4" /> {t('carcara.reject')}
              </button>
            </div>
          </div>
        )}

        <Composer placeholder={composerPlaceholder} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

// ---- Componentes de render (Tailwind do app, espelhado do AssistantChat) ----

function EmptyState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary [&_svg]:size-6">
        <Sparkles />
      </div>
      <div className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        {t('carcara.emptyState')}
      </div>
    </div>
  );
}

const PlainText = ({ text }) => <span className="whitespace-pre-wrap">{text}</span>;

function ToolCall({ toolName, result }) {
  return (
    <div className="rounded-lg border bg-card/60 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className="size-3.5 shrink-0 text-primary" />
        <span className="font-medium text-foreground">{toolName}</span>
        {result != null && result !== '' && (
          <span className="text-[11px] text-muted-foreground">{String(result)}</span>
        )}
      </div>
    </div>
  );
}

const Reasoning = ({ text }) => (
  <div className="flex items-start gap-2 text-xs italic text-muted-foreground">
    <Brain className="mt-0.5 size-3.5 shrink-0" />
    <span className="whitespace-pre-wrap">{text}</span>
  </div>
);

// Diff unificado do card de aprovação: pula o cabeçalho do patch, colore +/− e os hunks.
// Retorna null quando não há conteúdo real (senão desenha uma caixa vazia).
function DiffView({ diff }) {
  const lines = String(diff || '')
    .split('\n')
    .filter((l) => !/^(Index:|={3,}$|--- |\+\+\+ |\\ )/.test(l));
  if (!lines.some((l) => l.trim() !== '')) return null;
  return (
    <div className="mb-2 max-h-64 overflow-auto rounded border border-border bg-background font-mono text-[11px] leading-relaxed">
      {lines.map((l, i) => {
        const add = l.startsWith('+');
        const del = l.startsWith('-');
        const hunk = l.startsWith('@@');
        return (
          <div
            key={i}
            className={cn(
              'whitespace-pre px-2',
              add && 'bg-green-500/10 text-green-600 dark:text-green-400',
              del && 'bg-red-500/10 text-red-600 dark:text-red-400',
              hunk && 'bg-muted text-muted-foreground',
              !add && !del && !hunk && 'text-muted-foreground',
            )}
          >
            {l || ' '}
          </div>
        );
      })}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[13px] leading-relaxed text-primary-foreground">
        <MessagePrimitive.Parts components={{ Text: PlainText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-2">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-[13px] leading-relaxed text-foreground">
        <MessagePrimitive.Parts
          components={{ Text: PlainText, Reasoning, tools: { Fallback: ToolCall } }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer({ placeholder }) {
  return (
    <div className="shrink-0 border-t p-3">
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:border-primary/60">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder={placeholder}
          className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 [&_svg]:size-[15px]"
            title="Enviar"
          >
            <ArrowUp />
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground [&_svg]:size-[15px]"
            title="Parar"
          >
            <Square />
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </ComposerPrimitive.Root>
    </div>
  );
}
