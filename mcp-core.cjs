// Núcleo do cliente MCP — sem dependência de Electron, pra ser testável via Node.
// O @modelcontextprotocol/sdk envia build CJS, então usamos require() direto.
const crypto = require('crypto');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const {
  StreamableHTTPClientTransport,
} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');
const {
  ListRootsRequestSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const mcpConns = new Map(); // connId -> { client, transport, info }

function mcpClient(connId) {
  const c = mcpConns.get(connId);
  if (!c) throw new Error('Conexão MCP não encontrada: ' + connId);
  return c.client;
}

// Opções de request (Bloco D): aplica o timeout configurado na conexão, se houver.
function mcpReqOpts(connId) {
  const c = mcpConns.get(connId);
  return c && c.timeoutMs ? { timeout: c.timeoutMs } : undefined;
}

// Embrulha send/onmessage do transport pra emitir cada mensagem JSON-RPC crua
// (saída/entrada) num único hook. Captura tudo: requests, responses, logging,
// progress. Defensivo: ausência de send/onmessage degrada pra "sem traffic".
function instrumentTransport(tp, hooks) {
  if (!hooks.onTraffic || !tp) return;
  try {
    const origSend = tp.send && tp.send.bind(tp);
    if (origSend) {
      tp.send = (m, o) => {
        try {
          hooks.onTraffic({ dir: 'out', message: m });
        } catch {}
        return origSend(m, o);
      };
    }
    const origOnMsg = tp.onmessage;
    tp.onmessage = (m, extra) => {
      try {
        hooks.onTraffic({ dir: 'in', message: m });
      } catch {}
      return origOnMsg && origOnMsg(m, extra);
    };
  } catch {}
}

async function mcpConnect(
  { transport, command, args, env, url, headers, timeoutMs } = {},
  hooks = {},
) {
  // Bloco B — capacidades que o cliente fornece. roots sempre; sampling/elicitation
  // só quando há quem responda (onServerRequest), pra não anunciar o que não atendemos.
  const capabilities = { roots: { listChanged: true } };
  if (hooks.onServerRequest) {
    capabilities.sampling = {};
    capabilities.elicitation = {};
  }
  const client = new Client({ name: 'carcara-code', version: '0.1.0' }, { capabilities });

  // Estado de roots (mutável; atualizável por mcpSetRoots).
  const state = { roots: Array.isArray(hooks.roots) ? hooks.roots : [] };
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: state.roots }));
  if (hooks.onServerRequest) {
    client.setRequestHandler(CreateMessageRequestSchema, (req) =>
      hooks.onServerRequest({ kind: 'sampling', params: req.params }),
    );
    client.setRequestHandler(ElicitRequestSchema, (req) =>
      hooks.onServerRequest({ kind: 'elicitation', params: req.params }),
    );
  }

  let tp;
  if (transport === 'stdio') {
    if (!command) throw new Error('Comando obrigatório para stdio.');
    tp = new StdioClientTransport({
      command,
      args: Array.isArray(args) ? args : [],
      env: { ...process.env, ...(env || {}) },
      stderr: 'pipe',
    });
    if (tp.stderr && hooks.onLog) tp.stderr.on('data', (b) => hooks.onLog(String(b)));
    await client.connect(tp);
  } else {
    if (!url) throw new Error('URL obrigatória para HTTP.');
    const reqInit =
      headers && Object.keys(headers).length ? { requestInit: { headers } } : undefined;
    if (hooks.oauth) {
      // OAuth 2.0 (Bloco D): obtém tokens proativamente (login no navegador na 1ª vez),
      // depois conecta. Reconexões usam o token/refresh já guardado (sem navegador).
      const { authProvider, waitForCode } = hooks.oauth;
      if (!(await authProvider.tokens())) {
        const r = await auth(authProvider, { serverUrl: url });
        if (r === 'REDIRECT') {
          const code = await waitForCode();
          const r2 = await auth(authProvider, { serverUrl: url, authorizationCode: code });
          if (r2 !== 'AUTHORIZED') throw new Error('Autorização OAuth não concluída.');
        }
      }
      tp = new StreamableHTTPClientTransport(new URL(url), { authProvider, ...(reqInit || {}) });
      await client.connect(tp);
    } else {
      try {
        tp = new StreamableHTTPClientTransport(new URL(url), reqInit);
        await client.connect(tp);
      } catch (e) {
        // Servidor legado: cai pra SSE.
        tp = new SSEClientTransport(new URL(url), reqInit);
        await client.connect(tp);
      }
    }
  }

  instrumentTransport(tp, hooks);

  const connId = crypto.randomUUID();
  const info = {
    serverInfo: client.getServerVersion(),
    capabilities: client.getServerCapabilities(),
  };
  if (hooks.onClose)
    client.onclose = () => {
      if (mcpConns.has(connId)) {
        mcpConns.delete(connId);
        hooks.onClose(connId);
      }
    };
  mcpConns.set(connId, { client, transport: tp, info, timeoutMs: Number(timeoutMs) || 0, state });
  return { connId, serverInfo: info.serverInfo, capabilities: info.capabilities };
}

async function mcpDisconnect(connId) {
  const c = mcpConns.get(connId);
  if (!c) return;
  mcpConns.delete(connId);
  try {
    await c.client.close();
  } catch {}
}

function mcpDisconnectAll() {
  for (const id of [...mcpConns.keys()]) mcpDisconnect(id);
}

// Bloco A — navegação de features.
// Esgota todas as páginas de um list* paginado (nextCursor). Cap de segurança contra loop infinito.
async function drainPages(fn, key) {
  const items = [];
  let cursor;
  for (let i = 0; i < 100; i++) {
    const r = await fn(cursor ? { cursor } : {});
    if (Array.isArray(r[key])) items.push(...r[key]);
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  return items;
}
async function mcpListResourceTemplates(connId) {
  const c = mcpClient(connId);
  return {
    resourceTemplates: await drainPages((p) => c.listResourceTemplates(p), 'resourceTemplates'),
  };
}
async function mcpSubscribeResource(connId, uri) {
  await mcpClient(connId).subscribeResource({ uri });
  return { uri };
}
async function mcpUnsubscribeResource(connId, uri) {
  await mcpClient(connId).unsubscribeResource({ uri });
  return { uri };
}
// Completion: autocomplete de argumento de prompt (ref.type 'ref/prompt') ou de
// variável de resource template (ref.type 'ref/resource'). Retorna até 100 valores.
async function mcpComplete(connId, ref, argName, argValue) {
  const r = await mcpClient(connId).complete({
    ref,
    argument: { name: argName, value: argValue || '' },
  });
  return {
    values: (r.completion && r.completion.values) || [],
    total: r.completion && r.completion.total,
    hasMore: r.completion && r.completion.hasMore,
  };
}

// Bloco B — atualiza os roots expostos ao servidor e o notifica.
async function mcpSetRoots(connId, roots) {
  const c = mcpConns.get(connId);
  if (!c) return { roots: [] };
  c.state.roots = Array.isArray(roots) ? roots : [];
  try {
    await c.client.sendRootsListChanged();
  } catch {}
  return { roots: c.state.roots };
}

// Ping: mede latência de ida-e-volta. Universal, não depende de capability.
async function mcpPing(connId) {
  const t0 = Date.now();
  await mcpClient(connId).ping();
  return { ms: Date.now() - t0 };
}

// Pede ao servidor o nível mínimo de logging (debug|info|notice|warning|error|critical|alert|emergency).
async function mcpSetLogLevel(connId, level) {
  await mcpClient(connId).setLoggingLevel(level);
  return { level };
}

module.exports = {
  mcpConns,
  mcpClient,
  mcpReqOpts,
  mcpConnect,
  mcpDisconnect,
  mcpDisconnectAll,
  mcpPing,
  mcpSetLogLevel,
  drainPages,
  mcpListResourceTemplates,
  mcpSubscribeResource,
  mcpUnsubscribeResource,
  mcpComplete,
  mcpSetRoots,
};
