// Smoke do ciclo MCP fora do Electron. Usa o mesmo mcp-core.cjs do main.
// Uso: node scripts/mcp-smoke.cjs            (stdio: server-everything)
//      node scripts/mcp-smoke.cjs <url>      (HTTP)
const {
  mcpConnect,
  mcpDisconnect,
  mcpClient,
  mcpPing,
  mcpSetLogLevel,
  mcpListResourceTemplates,
  mcpSubscribeResource,
  mcpUnsubscribeResource,
  mcpComplete,
  mcpSetRoots,
} = require('../mcp-core.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

async function run() {
  const url = process.argv[2];
  const cfg = url
    ? { transport: 'http', url }
    : {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
      };

  // Bloco C: captura de tráfego via interceptação do transport.
  const traffic = [];
  const { connId, serverInfo, capabilities } = await mcpConnect(cfg, {
    onLog: (t) => process.stderr.write('[server] ' + t),
    onTraffic: (e) => traffic.push(e),
    // Bloco B: expõe um root e responde sampling/elicitation automaticamente no smoke.
    roots: [{ uri: 'file:///tmp/carcara-smoke', name: 'carcara-smoke' }],
    onServerRequest: ({ kind }) =>
      kind === 'sampling'
        ? {
            role: 'assistant',
            content: { type: 'text', text: 'ok' },
            model: 'carcara-manual',
            stopReason: 'endTurn',
          }
        : { action: 'accept', content: {} },
  });
  console.log('conectado:', serverInfo, 'caps:', Object.keys(capabilities || {}));

  const c = mcpClient(connId);
  const tools = await c.listTools();
  console.log('tools:', tools.tools.map((t) => t.name).slice(0, 8));

  const resources = await c.listResources().catch(() => ({ resources: [] }));
  const prompts = await c.listPrompts().catch(() => ({ prompts: [] }));
  console.log('resources:', resources.resources.length, 'prompts:', prompts.prompts.length);

  const echo = await c.callTool({ name: 'echo', arguments: { message: 'oi carcara' } });
  console.log('callTool echo:', JSON.stringify(echo.content));

  // Bloco C: tráfego deve ter capturado saída e entrada, com ao menos um method.
  const out = traffic.filter((e) => e.dir === 'out');
  const inc = traffic.filter((e) => e.dir === 'in');
  assert(out.length >= 1, 'esperava ≥1 mensagem de saída (out)');
  assert(inc.length >= 1, 'esperava ≥1 mensagem de entrada (in)');
  assert(
    traffic.some((e) => e.message && e.message.method),
    'esperava ao menos uma mensagem com method',
  );
  console.log('traffic:', traffic.length, `(out=${out.length}, in=${inc.length})`);

  // Bloco C: ping resolve com latência.
  const p = await mcpPing(connId);
  assert(typeof p.ms === 'number', 'ping deve retornar ms numérico');
  console.log('ping:', p.ms + 'ms');

  // Bloco C: setLevel (server-everything anuncia logging e emite notifications/message).
  if (capabilities && capabilities.logging) {
    await mcpSetLogLevel(connId, 'debug');
    console.log('setLogLevel debug ok');
  }

  // Bloco A: resource templates, subscribe e completions.
  const tmpl = await mcpListResourceTemplates(connId).catch(() => ({ resourceTemplates: [] }));
  console.log(
    'resourceTemplates:',
    tmpl.resourceTemplates.length,
    tmpl.resourceTemplates.map((t) => t.uriTemplate).slice(0, 3),
  );

  if (
    capabilities &&
    capabilities.resources &&
    capabilities.resources.subscribe &&
    resources.resources[0]
  ) {
    const uri = resources.resources[0].uri;
    await mcpSubscribeResource(connId, uri);
    await mcpUnsubscribeResource(connId, uri);
    console.log('subscribe/unsubscribe ok:', uri);
  }

  // Completion num template de resource, se houver (server-everything tem ref/resource).
  if (capabilities && capabilities.completions && tmpl.resourceTemplates[0]) {
    const t = tmpl.resourceTemplates[0];
    const varName = (t.uriTemplate.match(/\{(\w+)\}/) || [])[1];
    if (varName) {
      const comp = await mcpComplete(
        connId,
        { type: 'ref/resource', uri: t.uriTemplate },
        varName,
        '',
      ).catch((e) => ({ values: [], err: e.message }));
      console.log(
        'complete',
        varName + ':',
        comp.values.slice(0, 5),
        comp.err ? '(' + comp.err + ')' : '',
      );
    }
  }

  // Bloco B: roots — o servidor chama roots/list no cliente e deve ver nosso root.
  const rootsRes = await c.callTool({ name: 'get-roots-list', arguments: {} }).catch(() => null);
  if (rootsRes) {
    assert(
      JSON.stringify(rootsRes.content).includes('carcara-smoke'),
      'esperava nosso root em get-roots-list',
    );
    console.log('roots bridge ok');
  }
  const sr = await mcpSetRoots(connId, [{ uri: 'file:///tmp/outro', name: 'outro' }]).catch(
    () => null,
  );
  assert(
    sr && sr.roots && sr.roots[0] && sr.roots[0].name === 'outro',
    'mcpSetRoots deve atualizar os roots',
  );
  console.log('setRoots ok');

  await mcpDisconnect(connId);
  console.log('desconectado ok');
}
run().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
