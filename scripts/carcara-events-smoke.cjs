// Smoke do normalizador de eventos da Carcará AI. Uso: node scripts/carcara-events-smoke.cjs
// Fixtures baseados no /event REAL do OpenCode (deepseek-v4-flash).
const { parseSse, normalizeEvent, errorMessage } = require('../electron/carcara/events.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// parseSse: dois eventos completos + um pedaço incompleto
{
  const buf = 'data: {"type":"a"}\n\n' + 'data: {"type":"b"}\n\n' + 'data: {"type":"inc';
  const { events, rest } = parseSse(buf);
  assert(events.length === 2, 'parseSse deve achar 2 eventos completos');
  assert(events[0].type === 'a' && events[1].type === 'b', 'parseSse ordem/conteúdo');
  assert(rest.startsWith('data: {"type":"inc'), 'parseSse guarda o resto incompleto');
}

// message.updated: mapa de role por messageId (pra filtrar o eco do usuário)
{
  const u = normalizeEvent({
    type: 'message.updated',
    properties: { info: { id: 'msg_user', role: 'user' } },
  });
  assert(
    u && u.kind === 'message' && u.messageId === 'msg_user' && u.role === 'user',
    'message user',
  );
  const a = normalizeEvent({
    type: 'message.updated',
    properties: { info: { id: 'msg_ai', role: 'assistant' } },
  });
  assert(a && a.role === 'assistant', 'message assistant');
}

// message.part.updated (text) carrega partId + messageId (pra indexar/filtrar)
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: { part: { type: 'text', text: 'Olá!', id: 'prt_t', messageID: 'msg_ai' } },
  });
  assert(n && n.kind === 'text' && n.text === 'Olá!', 'text vira kind:text');
  assert(n.partId === 'prt_t' && n.messageId === 'msg_ai', 'text carrega partId+messageId');
}

// message.part.delta: streaming incremental (reasoning e text chegam com field:'text')
{
  const n = normalizeEvent({
    type: 'message.part.delta',
    properties: { messageID: 'msg_ai', partID: 'prt_r', field: 'text', delta: 'The' },
  });
  assert(n && n.kind === 'delta' && n.delta === 'The', 'delta vira kind:delta');
  assert(n.partId === 'prt_r' && n.messageId === 'msg_ai', 'delta carrega partId+messageId');
  // delta sem field text é ignorado
  assert(
    normalizeEvent({ type: 'message.part.delta', properties: { partID: 'x', field: 'other' } }) ===
      null,
    'delta não-text ignorado',
  );
}

// reasoning
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: { part: { type: 'reasoning', text: 'pensando', id: 'prt_r', messageID: 'msg_ai' } },
  });
  assert(n && n.kind === 'reasoning' && n.partId === 'prt_r', 'reasoning vira kind:reasoning');
}

// tool call
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: {
      part: {
        type: 'tool',
        tool: 'read',
        id: 'prt_x',
        messageID: 'msg_ai',
        state: { status: 'running' },
      },
    },
  });
  assert(n && n.kind === 'tool' && n.tool === 'read' && n.status === 'running', 'tool');
}

// permission.asked
{
  const n = normalizeEvent({
    type: 'permission.asked',
    properties: { sessionID: 's1', permissionID: 'p1', title: 'Editar arquivo x' },
  });
  assert(n && n.kind === 'permission' && n.permissionId === 'p1', 'permission');
}

// session.idle
{
  const n = normalizeEvent({ type: 'session.idle', properties: { sessionID: 's1' } });
  assert(n && n.kind === 'idle', 'idle');
}

// session.error: extrai mensagem real (não colapsa pra "erro")
{
  const n = normalizeEvent({
    type: 'session.error',
    properties: { error: { message: 'DeepSeek 402 sem saldo' } },
  });
  assert(n && n.kind === 'error' && n.message === 'DeepSeek 402 sem saldo', 'error message real');
  assert(errorMessage({ data: { message: 'x' } }) === 'x', 'errorMessage lê data.message');
  assert(errorMessage('boom') === 'boom', 'errorMessage lê string');
  assert(errorMessage(null) === 'erro desconhecido', 'errorMessage fallback');
}

// irrelevante → null
{
  assert(normalizeEvent({ type: 'lsp.updated', properties: {} }) === null, 'ignora lsp');
  assert(normalizeEvent({ type: 'plugin.added', properties: {} }) === null, 'ignora plugin.added');
}

console.log('carcara-events-smoke OK');
