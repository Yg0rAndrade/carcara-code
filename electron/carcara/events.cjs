// Puro (sem require de electron): parser de SSE + normalizador de eventos do OpenCode
// pro contrato interno da Carcará AI. Testável por scripts/carcara-events-smoke.cjs.
//
// Contrato do OpenCode /event (confirmado em runtime com deepseek-v4-flash):
//   - message.updated       → { info: { id, role } }   (role = 'user' | 'assistant')
//   - message.part.delta    → { messageID, partID, field, delta }  (streaming incremental)
//   - message.part.updated  → { part: { id, messageID, type, text, state } } (estado cheio)
//   - session.idle / session.error / permission.asked / session.diff
// A UI indexa partes por partId: delta ANEXA, updated SUBSTITUI. Partes de mensagem
// 'user' são filtradas na UI (senão o eco da pergunta cai na bolha do assistente).

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

// Extrai uma mensagem de erro legível de um objeto de erro variado.
function errorMessage(err) {
  if (!err) return 'erro desconhecido';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.data && err.data.message) return err.data.message;
  try {
    const s = JSON.stringify(err);
    return s && s !== '{}' ? s : 'erro desconhecido';
  } catch {
    return 'erro desconhecido';
  }
}

// Traduz um evento do OpenCode pro contrato interno { kind, ... } ou null.
function normalizeEvent(oc) {
  if (!oc || typeof oc !== 'object') return null;
  const p = oc.properties || {};
  switch (oc.type) {
    case 'message.updated': {
      const info = p.info || {};
      if (!info.id) return null;
      return { kind: 'message', messageId: info.id, role: info.role || 'assistant' };
    }
    case 'message.part.delta': {
      // streaming incremental — reasoning e text ambos chegam com field:'text'.
      if (p.field !== 'text' || !p.partID) return null;
      return { kind: 'delta', messageId: p.messageID, partId: p.partID, delta: p.delta || '' };
    }
    case 'message.part.updated': {
      const part = p.part || {};
      const base = { messageId: part.messageID, partId: part.id };
      if (part.type === 'text') return { ...base, kind: 'text', text: part.text || '' };
      if (part.type === 'reasoning') return { ...base, kind: 'reasoning', text: part.text || '' };
      if (part.type === 'tool')
        return {
          ...base,
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
    case 'permission.updated': {
      // OpenCode manda id (não permissionID), permission (ex.: 'edit') e metadata.filepath.
      const meta = p.metadata || {};
      const fp = meta.filepath || meta.filePath;
      const title =
        p.title ||
        (fp
          ? 'Editar ' + fp.split(/[\\/]/).pop()
          : p.permission
            ? 'Permitir: ' + p.permission
            : '');
      return {
        kind: 'permission',
        permissionId: p.permissionID || p.id,
        title,
        diff: meta.diff || null, // diff unificado (ex.: edição/escrita) pra mostrar no card
        sessionId: p.sessionID,
      };
    }
    case 'session.idle':
      return { kind: 'idle', sessionId: p.sessionID };
    case 'session.error':
      return { kind: 'error', message: errorMessage(p.error) };
    default:
      return null;
  }
}

module.exports = { parseSse, normalizeEvent, errorMessage };
