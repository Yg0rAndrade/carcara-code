'use strict';

// Partes PURAS da ponte "chat" (assistant-ui ↔ Claude Code headless). Sem fs nem
// child_process — só montagem de comando e normalização de mensagens, pra ser testável
// em qualquer SO via scripts/chat-cli-smoke.cjs (estilo platform.cjs).
//
// O spawn de verdade (com cleanEnv/PATH/IPC) mora no main.js. Aqui fica só a decisão:
// quais flags passar e como traduzir cada linha do stream-json do Claude num evento
// simples que o renderer entende.

// Flags do Claude Code headless em modo streaming bidirecional.
// `--input-format`/`--output-format stream-json` SÓ funcionam com `-p/--print` (verificado
// no `claude --help`), e `--output-format stream-json` exige `--verbose`.
function buildChatArgs({ resumeId, model, permissionMode, yolo } = {}) {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
  ];
  if (resumeId) args.push('--resume', String(resumeId));
  if (model) args.push('--model', String(model));
  if (permissionMode) args.push('--permission-mode', String(permissionMode));
  if (yolo) args.push('--dangerously-skip-permissions');
  return args;
}

// Uma linha de entrada (turno do usuário) pro stdin do Claude, no formato stream-json.
// `content` é um array: texto e/ou imagens em base64 ({type:'image', source:{...}}).
function buildUserMessage(text, sessionId, images = []) {
  const content = [];
  if (text) content.push({ type: 'text', text: String(text) });
  for (const img of images || []) {
    if (img && img.data && img.mediaType) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      });
    }
  }
  return {
    type: 'user',
    session_id: sessionId || '',
    message: { role: 'user', content },
    parent_tool_use_id: null,
  };
}

// content pode vir como string ou array de blocos — normaliza pra string legível.
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('');
  }
  return '';
}

// Traduz UMA linha JSON do stream-json num array de eventos simples pro renderer.
// Um `assistant` pode ter vários blocos (texto + thinking + tool_use), por isso array.
// Desconhecido → [] (ignora sem quebrar).
function normalizeStreamEvent(msg) {
  if (!msg || typeof msg !== 'object') return [];
  const sessionId = msg.session_id || undefined;

  if (msg.type === 'system') {
    return [
      {
        kind: 'system',
        subtype: msg.subtype || undefined,
        sessionId,
        model: msg.model,
        tools: msg.tools,
        mcpServers: msg.mcp_servers,
      },
    ];
  }

  if (msg.type === 'assistant') {
    const blocks = (msg.message && msg.message.content) || [];
    const out = [];
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && b.text) out.push({ kind: 'text', text: b.text, sessionId });
      else if (b.type === 'thinking' && b.thinking)
        out.push({ kind: 'thinking', text: b.thinking, sessionId });
      else if (b.type === 'tool_use')
        out.push({ kind: 'tool_use', id: b.id, name: b.name, input: b.input, sessionId });
    }
    return out;
  }

  if (msg.type === 'user') {
    const blocks = (msg.message && msg.message.content) || [];
    const out = [];
    for (const b of Array.isArray(blocks) ? blocks : []) {
      if (b && b.type === 'tool_result')
        out.push({
          kind: 'tool_result',
          toolUseId: b.tool_use_id,
          content: contentToText(b.content),
          isError: !!b.is_error,
          sessionId,
        });
    }
    return out;
  }

  if (msg.type === 'result') {
    return [
      {
        kind: 'result',
        subtype: msg.subtype || undefined,
        sessionId,
        cost: msg.total_cost_usd,
        durationMs: msg.duration_ms,
        numTurns: msg.num_turns,
        text: typeof msg.result === 'string' ? msg.result : undefined,
        isError: msg.subtype && msg.subtype !== 'success',
      },
    ];
  }

  return [];
}

// ---------- Codex (`codex exec --json`, JSONL) ----------
// Modelo por-turno: cada mensagem é um `codex exec [resume <thread_id>] --json <prompt>`.
// Eventos: thread.started (id), item.started/completed (agent_message/reasoning/
// command_execution/file_change/mcp_tool_call), turn.completed, turn.failed/error.
function normalizeCodexEvent(msg) {
  if (!msg || typeof msg !== 'object') return [];
  const t = msg.type;
  if (t === 'thread.started') return [{ kind: 'system', sessionId: msg.thread_id }];
  if (t === 'turn.completed') return [{ kind: 'result' }];
  if (t === 'turn.failed' || t === 'error') {
    const m = (msg.error && (msg.error.message || msg.error)) || msg.message || 'Erro no Codex';
    return [{ kind: 'error', text: String(m) }];
  }
  const it = msg.item || {};
  if (t === 'item.completed') {
    if (it.type === 'agent_message' && it.text) return [{ kind: 'text', text: it.text }];
    if (it.type === 'reasoning' && it.text) return [{ kind: 'thinking', text: it.text }];
    if (it.type === 'command_execution')
      return [
        {
          kind: 'tool_result',
          toolUseId: it.id,
          content: it.aggregated_output || it.output || '',
          isError: typeof it.exit_code === 'number' ? it.exit_code !== 0 : false,
        },
      ];
    if (it.type === 'mcp_tool_call')
      return [
        {
          kind: 'tool_result',
          toolUseId: it.id,
          content: typeof it.result === 'string' ? it.result : JSON.stringify(it.result ?? ''),
          isError: it.status === 'failed',
        },
      ];
    return [];
  }
  if (t === 'item.started') {
    if (it.type === 'command_execution')
      return [{ kind: 'tool_use', id: it.id, name: 'shell', input: it.command }];
    if (it.type === 'file_change' || it.type === 'file_changes')
      return [{ kind: 'tool_use', id: it.id, name: 'edit', input: it.changes || it.files }];
    if (it.type === 'mcp_tool_call')
      return [
        {
          kind: 'tool_use',
          id: it.id,
          name: it.tool || it.name || 'mcp',
          input: it.arguments || it.input,
        },
      ];
    return [];
  }
  return [];
}

// ---------- Registro de adapters por CLI ----------
// mode 'persistent' = 1 processo, stdin aberto, vários turnos (claude).
// mode 'perTurn'    = 1 processo por mensagem (codex/agy). `text:true` = stdout é texto puro.
// buildArgs recebe { resumeId, prompt, hasHistory }. parseLine (não-texto) → eventos.
const ADAPTERS = {
  claude: {
    cli: 'claude',
    bin: 'claude',
    mode: 'persistent',
    buildArgs: ({ resumeId } = {}) => buildChatArgs({ resumeId }),
    buildInput: (text, sessionId, images) =>
      JSON.stringify(buildUserMessage(text, sessionId, images)) + '\n',
    parseLine: (line) => {
      try {
        return normalizeStreamEvent(JSON.parse(line));
      } catch {
        return [];
      }
    },
  },
  codex: {
    cli: 'codex',
    bin: 'codex',
    mode: 'perTurn',
    buildArgs: ({ resumeId, prompt } = {}) => {
      const a = ['exec'];
      if (resumeId) a.push('resume', String(resumeId));
      a.push('--json', String(prompt ?? ''));
      return a;
    },
    parseLine: (line) => {
      try {
        return normalizeCodexEvent(JSON.parse(line));
      } catch {
        return [];
      }
    },
  },
  agy: {
    cli: 'agy',
    bin: 'agy',
    mode: 'perTurn',
    text: true, // agy só tem `-p` (texto puro), sem JSON — stdout vira eventos de texto
    buildArgs: ({ prompt, hasHistory, yolo } = {}) => {
      const a = [];
      if (hasHistory) a.push('--continue'); // retoma a conversa mais recente
      // Mesma preferência do modo terminal (Configurações › IAs): sem ela o agy pararia
      // pedindo permissão num processo que não tem para onde perguntar.
      if (yolo) a.push('--dangerously-skip-permissions');
      a.push('-p', String(prompt ?? ''));
      return a;
    },
  },
};

function getAdapter(cli) {
  return ADAPTERS[cli] || null;
}

module.exports = {
  buildChatArgs,
  buildUserMessage,
  contentToText,
  normalizeStreamEvent,
  normalizeCodexEvent,
  ADAPTERS,
  getAdapter,
};
