// Puro (sem require de electron): parser de SSE + normalizador de eventos do OpenCode
// pro contrato interno da Carcará AI. Testável por scripts/carcara-events-smoke.cjs.
//
// NOTA (Fase 0): confirmado contra o /event real do OpenCode — objetos vêm como
// { id, type, properties }. Ajustar os `case`/campos se uma versão futura mudar.

// Quebra um buffer text/event-stream em objetos JSON (campo data:) já parseados.
// Devolve os eventos completos e o `rest` (fragmento após o último "\n\n").
function parseSse(buffer) {
  const events = [];
  const chunks = buffer.split('\n\n');
  const rest = chunks.pop(); // último pedaço pode estar incompleto
  for (const chunk of chunks) {
    const line = chunk.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const json = line.slice(5).trim();
    if (!json || json === '[DONE]') continue;
    try {
      events.push(JSON.parse(json));
    } catch {
      /* ignora fragmento inválido */
    }
  }
  return { events, rest };
}

// Traduz um evento do OpenCode pro contrato interno { kind, ... } ou null.
function normalizeEvent(oc) {
  if (!oc || typeof oc !== 'object') return null;
  const p = oc.properties || {};
  switch (oc.type) {
    case 'message.part.updated':
    case 'message.part.delta': {
      const part = p.part || {};
      if (part.type === 'text') return { kind: 'text', text: part.text || '' };
      if (part.type === 'reasoning') return { kind: 'reasoning', text: part.text || '' };
      if (part.type === 'tool')
        return {
          kind: 'tool',
          tool: part.tool || 'tool',
          status: (part.state && part.state.status) || 'running',
          state: part.state || null,
        };
      return null;
    }
    case 'session.diff':
      return { kind: 'diff', files: p.files || p.diff || null };
    case 'permission.asked':
    case 'permission.updated':
      return {
        kind: 'permission',
        permissionId: p.permissionID || p.id,
        title: p.title || '',
        sessionId: p.sessionID,
      };
    case 'session.idle':
      return { kind: 'idle', sessionId: p.sessionID };
    case 'session.error':
      return { kind: 'error', message: (p.error && p.error.message) || 'erro' };
    default:
      return null;
  }
}

module.exports = { parseSse, normalizeEvent };
