// Modelo de TESTE local (OpenAI-compatible) pra exercitar o chat da Carcará sem
// depender de IA/chave externa. Faz streaming de texto e, quando você pede uma edição
// ("crie/edite um arquivo…"), emite um tool_call `write` do OpenCode → dispara o card
// de diff + aprovação. Uso: node scripts/carcara-mock-model.cjs  (http://127.0.0.1:8899/v1)
const http = require('http');
const path = require('path');

const PORT = 8899;
const MODEL = 'carcara-mock';

function chatReply(userText) {
  const t = (userText || '').trim();
  // Vitrine de markdown pra validar o render no chat (GFM + highlight de código).
  return (
    `## Olá! 👋 modelo de teste local\n\n` +
    `Aqui é o **modelo de teste** da Carcará (sem IA externa). Você disse: ` +
    `\`${t || '(vazio)'}\`.\n\n` +
    `### O que dá pra ver aqui\n\n` +
    `- **negrito**, *itálico* e ~~riscado~~\n` +
    `- \`código inline\` e [um link](https://carcaracode.net)\n` +
    `- listas ordenadas:\n` +
    `  1. primeiro\n` +
    `  2. segundo\n\n` +
    `> Citação: streaming, bolhas e render de markdown OK.\n\n` +
    `Bloco de código com highlight:\n\n` +
    '```js\n' +
    `function ola(nome) {\n` +
    `  return \`Olá, \${nome}!\`; // Carcará Code AI\n` +
    `}\n` +
    '```\n\n' +
    `| recurso | status |\n` +
    `| --- | --- |\n` +
    `| streaming | ✅ |\n` +
    `| markdown | ✅ |\n\n` +
    `Pra testar **edição de arquivo**, peça algo como "crie um arquivo teste". 🎉`
  );
}

// O usuário quer que a IA edite/crie um arquivo?
function wantsEdit(text) {
  return /\bcri[ae]r?\b|\barquivo\b|\bedit|\bescrev|\bwrite\b|\bfile\b|teste\.txt/i.test(
    text || '',
  );
}

function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content))
        return m.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join(' ');
    }
  }
  return '';
}

function lastRole(messages) {
  const m = (messages || [])[(messages || []).length - 1];
  return m && m.role;
}

// Extrai "Working directory: <path>" do prompt de sistema (é assim que o OpenCode passa o cwd).
function cwdFromMessages(messages) {
  for (const m of messages || []) {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    const mt = c.match(/Working directory:\s*(.+)/i);
    if (mt) return mt[1].trim();
  }
  return null;
}

function sse(res, obj) {
  res.write('data: ' + JSON.stringify(obj) + '\n\n');
}

function streamText(res, text) {
  const id = 'chatcmpl-mock';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  sse(res, {
    id,
    object: 'chat.completion.chunk',
    model: MODEL,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  });
  const toks = text.match(/\s+|\S+/g) || [text];
  let i = 0;
  const tick = () => {
    if (i < toks.length) {
      sse(res, {
        id,
        object: 'chat.completion.chunk',
        model: MODEL,
        choices: [{ index: 0, delta: { content: toks[i] }, finish_reason: null }],
      });
      i++;
      setTimeout(tick, 20);
    } else {
      sse(res, {
        id,
        object: 'chat.completion.chunk',
        model: MODEL,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };
  tick();
}

// Emite um tool_call `write` (formato streaming do OpenAI) pra criar um arquivo de teste.
function streamWriteToolCall(res, filePath, content) {
  const id = 'chatcmpl-mock';
  const args = JSON.stringify({ filePath, content });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  sse(res, {
    id,
    object: 'chat.completion.chunk',
    model: MODEL,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_mock_1',
              type: 'function',
              function: { name: 'write', arguments: '' },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  });
  sse(res, {
    id,
    object: 'chat.completion.chunk',
    model: MODEL,
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: args } }] },
        finish_reason: null,
      },
    ],
  });
  sse(res, {
    id,
    object: 'chat.completion.chunk',
    model: MODEL,
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  if (req.method === 'GET' && req.url.replace(/\/+$/, '').endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
    return res.end(
      JSON.stringify({
        object: 'list',
        data: [{ id: MODEL, object: 'model', owned_by: 'carcara' }],
      }),
    );
  }
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* noop */
      }
      const msgs = body.messages || [];
      const role = lastRole(msgs);
      const userText = lastUserText(msgs);
      const hasTools = Array.isArray(body.tools) && body.tools.length > 0;

      // 2ª rodada: o OpenCode devolveu o resultado da ferramenta → responde texto de conclusão.
      if (role === 'tool') {
        console.log('[mock] tool result recebido → conclusão');
        return streamText(
          res,
          'Pronto! ✅ Criei o arquivo **carcara-teste.txt** com um conteúdo de teste. Isso exercitou o diff + a aprovação. 🎉',
        );
      }

      // 1ª rodada: usuário pediu edição e há ferramentas → emite tool_call `write`.
      if (hasTools && wantsEdit(userText)) {
        const cwd = cwdFromMessages(msgs);
        const filePath = cwd ? path.join(cwd, 'carcara-teste.txt') : 'carcara-teste.txt';
        console.log('[mock] pedido de edição → tool_call write em', filePath);
        return streamWriteToolCall(
          res,
          filePath,
          'Arquivo criado pela Carcará Code AI 🎉\nTeste de edição com diff + aprovação.\n',
        );
      }

      // Chat normal.
      console.log('[mock] chat normal (stream)');
      streamText(res, chatReply(userText));
    });
    return;
  }
  res.writeHead(404, cors);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[mock] modelo de teste em http://127.0.0.1:' + PORT + '/v1 (modelo: ' + MODEL + ')');
});
