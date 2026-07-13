// Smoke do normalizador de eventos da Carcará AI. Uso: node scripts/carcara-events-smoke.cjs
const { parseSse, normalizeEvent } = require('../electron/carcara/events.cjs');

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

// normalizeEvent: texto em streaming
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: { part: { type: 'text', text: 'Olá' } },
  });
  assert(n && n.kind === 'text' && n.text === 'Olá', 'text vira kind:text');
}

// normalizeEvent: reasoning
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: { part: { type: 'reasoning', text: 'pensando' } },
  });
  assert(n && n.kind === 'reasoning', 'reasoning vira kind:reasoning');
}

// normalizeEvent: tool call
{
  const n = normalizeEvent({
    type: 'message.part.updated',
    properties: { part: { type: 'tool', tool: 'read', state: { status: 'running' } } },
  });
  assert(n && n.kind === 'tool' && n.tool === 'read' && n.status === 'running', 'tool');
}

// normalizeEvent: permission.asked
{
  const n = normalizeEvent({
    type: 'permission.asked',
    properties: { sessionID: 's1', permissionID: 'p1', title: 'Editar arquivo x' },
  });
  assert(n && n.kind === 'permission' && n.permissionId === 'p1', 'permission');
}

// normalizeEvent: session.idle
{
  const n = normalizeEvent({ type: 'session.idle', properties: { sessionID: 's1' } });
  assert(n && n.kind === 'idle', 'idle');
}

// normalizeEvent: irrelevante → null
{
  assert(normalizeEvent({ type: 'lsp.updated', properties: {} }) === null, 'ignora lsp');
}

console.log('carcara-events-smoke OK');
