import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react';
import { ArrowUp, Square, Wrench, Brain, TerminalSquare, MessageSquare } from 'lucide-react';
import { useChatMode } from '@/lib/chatModeContext.jsx';
import { OPT } from '@/lib/aiOptions.jsx';
import { MarkdownText } from '@/components/ChatMarkdown.jsx';

// Miolo de UMA sessão renderizada como chat em HTML/CSS — ALTERNATIVA ao terminal xterm
// da mesma sessão. Fica DENTRO do ChatPanel (que mantém abas, seletor de IA, layout);
// aqui é só o conteúdo de uma sessão. Fala com a ponte headless do main (`chat:*`,
// `claude -p` em stream-json) pela MESMA `sessionId` da aba, e usa o RUNTIME do
// assistant-ui (ExternalStoreRuntime: streaming, threading, cancelar, auto-scroll),
// estilizado com o Tailwind do app (sem a config/CSS gerada pela CLI do assistant-ui).
// Só é montado quando o modo 'chat' está ligado E a IA da sessão é o `claude` (a ponte
// fala o protocolo do Claude Code; outras CLIs caem no terminal). Ver CHAT-UI-PLAN.md.
//
// Modelo de mensagem interno: { id, role, parts:[{type:'text'|'reasoning'|'tool', ...}] }.
// convertMessage() traduz pro ThreadMessageLike do assistant-ui.
export function AssistantChat({ sessionId, projectPath, cli }) {
  const { setChatMode } = useChatMode();
  const aiLabel = OPT[cli]?.label || 'IA';

  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const assistantIdRef = useRef(null); // id da bolha do assistant no turno atual
  const sessionRef = useRef(sessionId);
  const projectRef = useRef(projectPath);
  const cliRef = useRef(cli);
  sessionRef.current = sessionId;
  projectRef.current = projectPath;
  cliRef.current = cli;
  const nextId = () => 'm' + ++idRef.current;

  // Zera a timeline ao trocar de sessão.
  useEffect(() => {
    setMessages([]);
    setBusy(false);
    assistantIdRef.current = null;
  }, [sessionId]);

  const pushSystem = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: 'm' + ++idRef.current, role: 'system', parts: [{ type: 'text', text }] },
    ]);
  }, []);

  // Assina os eventos da ponte e vai montando a timeline no modelo interno.
  useEffect(() => {
    if (!sessionId) return;
    const off = window.api.on?.('chat:event', ({ sessionId: sid, event }) => {
      if (sid !== sessionId || !event) return;
      if (event.kind === 'result' || event.kind === 'error' || event.kind === 'exit')
        setBusy(false);
      setMessages((prev) => applyEvent(prev, event, assistantIdRef, nextId));
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
        { id: 'm' + ++idRef.current, role: 'user', parts: [{ type: 'text', text }] },
      ]);
      assistantIdRef.current = null;
      setBusy(true);
      const r = await window.api.chatSend?.(sid, projectRef.current, text, cliRef.current);
      if (r?.error) {
        pushSystem(r.error);
        setBusy(false);
      }
    },
    [pushSystem],
  );

  const onCancel = useCallback(async () => {
    const sid = sessionRef.current;
    if (sid) window.api.chatAbort?.(sid);
    setBusy(false);
  }, []);

  const convertMessage = useCallback(
    (m) => ({
      role: m.role,
      content: m.parts.map((p) =>
        p.type === 'text'
          ? { type: 'text', text: p.text }
          : p.type === 'reasoning'
            ? { type: 'reasoning', text: p.text }
            : {
                type: 'tool-call',
                toolCallId: p.toolCallId || p.id || 'tool',
                toolName: p.toolName,
                args: p.args || {},
                result: p.result,
                isError: p.isError,
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

  if (!sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Selecione um projeto para conversar.
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport
          autoScroll
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          <ThreadPrimitive.Empty>
            <EmptyState label={aiLabel} onBack={() => setChatMode('cli')} />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage, SystemMessage }} />
          {busy && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {aiLabel} está pensando…
            </div>
          )}
        </ThreadPrimitive.Viewport>
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

// Junta um evento da ponte no modelo interno. Texto do assistant é agregado na bolha do
// turno; thinking/tool_use viram parts; tool_result casa pelo toolCallId.
function applyEvent(prev, event, assistantIdRef, nextId) {
  const next = prev.slice();
  const ensureAssistant = () => {
    let idx = next.findIndex((m) => m.id === assistantIdRef.current);
    if (idx === -1) {
      const id = nextId();
      assistantIdRef.current = id;
      next.push({ id, role: 'assistant', parts: [] });
      idx = next.length - 1;
    } else {
      next[idx] = { ...next[idx], parts: next[idx].parts.slice() };
    }
    return idx;
  };

  switch (event.kind) {
    case 'text': {
      const i = ensureAssistant();
      const parts = next[i].parts;
      const last = parts[parts.length - 1];
      if (last && last.type === 'text')
        parts[parts.length - 1] = { ...last, text: last.text + event.text };
      else parts.push({ type: 'text', text: event.text });
      return next;
    }
    case 'thinking': {
      const i = ensureAssistant();
      next[i].parts.push({ type: 'reasoning', text: event.text });
      return next;
    }
    case 'tool_use': {
      const i = ensureAssistant();
      next[i].parts.push({
        type: 'tool',
        toolCallId: event.id,
        toolName: event.name,
        args: event.input,
      });
      return next;
    }
    case 'tool_result': {
      for (let j = next.length - 1; j >= 0; j--) {
        const m = next[j];
        const k = m.parts.findIndex(
          (p) => p.type === 'tool' && p.toolCallId === event.toolUseId && p.result === undefined,
        );
        if (k !== -1) {
          const parts = m.parts.slice();
          parts[k] = { ...parts[k], result: event.content, isError: event.isError };
          next[j] = { ...m, parts };
          break;
        }
      }
      return next;
    }
    case 'stderr':
    case 'error': {
      next.push({ id: nextId(), role: 'system', parts: [{ type: 'text', text: event.text }] });
      return next;
    }
    case 'exit': {
      if (event.code && event.code !== 0)
        next.push({
          id: nextId(),
          role: 'system',
          parts: [{ type: 'text', text: `Processo saiu (código ${event.code}).` }],
        });
      return next;
    }
    default:
      return next; // system/result não têm bolha própria
  }
}

// ---- Componentes de render (Tailwind do app) ----

function EmptyState({ label, onBack }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary [&_svg]:size-6">
        <MessageSquare />
      </div>
      <div className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        Chat conectado ao {label}{' '}
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          beta
        </span>
        . Manda uma mensagem — usa a sua assinatura, igual ao terminal.
      </div>
      <button
        type="button"
        onClick={onBack}
        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[14px]"
      >
        <TerminalSquare />
        Voltar ao terminal
      </button>
    </div>
  );
}

const PlainText = ({ text }) => <span className="whitespace-pre-wrap">{text}</span>;

const Reasoning = ({ text }) => (
  <div className="flex items-start gap-2 text-xs italic text-muted-foreground">
    <Brain className="mt-0.5 size-3.5 shrink-0" />
    <span className="whitespace-pre-wrap">{text}</span>
  </div>
);

function ToolCall({ toolName, args, result, isError }) {
  return (
    <div className="rounded-lg border bg-card/60 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <Wrench className="size-3.5 shrink-0 text-primary" />
        <span className="font-medium text-foreground">{toolName}</span>
      </div>
      {args != null && Object.keys(args || {}).length > 0 && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 pb-2 text-[11px] text-muted-foreground">
          {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
        </pre>
      )}
      {result != null && result !== '' && (
        <pre
          className={
            'overflow-x-auto whitespace-pre-wrap break-words border-t px-3 py-2 text-[11px] ' +
            (isError ? 'text-destructive' : 'text-muted-foreground')
          }
        >
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
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
          components={{ Text: MarkdownText, Reasoning, tools: { Fallback: ToolCall } }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function SystemMessage() {
  return (
    <MessagePrimitive.Root className="flex">
      <div className="rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive">
        <MessagePrimitive.Parts components={{ Text: PlainText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <div className="shrink-0 border-t p-3">
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:border-primary/60">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Fale com o Claude…  (Enter envia, Shift+Enter quebra linha)"
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
