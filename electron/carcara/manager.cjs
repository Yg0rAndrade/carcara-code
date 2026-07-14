// Orquestrador da Carcará AI no main. Sobe `opencode serve` por sessão, mantém o
// loop SSE (/event) e expõe send/abort/approve/dispose. Impuro (child_process + fetch).
const { spawn } = require('child_process');
const net = require('net');
const { resolveOpencode } = require('./binary.cjs');
const { buildOpencodeConfig } = require('./config.cjs');
const { parseSse, normalizeEvent } = require('./events.cjs');

const HOST = '127.0.0.1';
const state = new Map(); // sessionId -> { proc, port, auth, ocSessionId, aborter }

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, HOST, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function cleanEnv(password) {
  const env = { ...process.env, OPENCODE_SERVER_PASSWORD: password };
  delete env.ELECTRON_RUN_AS_NODE; // pitfall conhecido
  return env;
}

// Mata a ÁRVORE do processo. No Windows o spawn usa shell:true, então proc.pid é o do
// cmd.exe wrapper e proc.kill() NÃO mata o opencode.exe neto (vaza processo). taskkill /T
// mata a árvore inteira. Comportamento de child_process por SO — ok neste módulo Node.
function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      proc.kill();
    }
  } catch {
    /* noop */
  }
}

async function waitReady(port, auth) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://${HOST}:${port}/config`, {
        headers: { Authorization: auth },
      });
      if (res.ok) return;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('OpenCode não respondeu a tempo');
}

async function ensure({ sessionId, projectPath, prefixDir, provider, emit, onPhase }) {
  if (state.get(sessionId)) return; // já no ar
  const entry = {
    proc: null,
    port: null,
    auth: null,
    ocSessionId: null,
    aborter: new AbortController(),
    disposed: false,
  };
  state.set(sessionId, entry); // registra CEDO pra dispose poder sinalizar
  try {
    const bin = await resolveOpencode({ prefixDir, onPhase });
    if (entry.disposed) return;
    const port = await freePort();
    if (entry.disposed) return;
    const password = 'carcara-' + Math.abs(port) + '-' + sessionId.slice(0, 6);
    const auth = 'Basic ' + Buffer.from('opencode:' + password).toString('base64');

    const config = buildOpencodeConfig({
      providerBaseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    });

    if (onPhase) onPhase('Subindo o motor…');
    const proc = spawn(bin, ['serve', '--hostname', HOST, '--port', String(port)], {
      cwd: projectPath,
      env: { ...cleanEnv(password), OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    // NÃO engolir o stderr do serve: guarda um rabo e loga no console do main (dev),
    // pra erros do OpenCode/DeepSeek pararem de ser invisíveis.
    entry.stderrTail = '';
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      entry.stderrTail = (entry.stderrTail + s).slice(-2000);
      process.stderr.write('[opencode] ' + s);
    });
    proc.on('exit', (code) => {
      if (!entry.disposed && code) {
        const tail = entry.stderrTail ? ': ' + entry.stderrTail.trim().slice(-400) : '';
        emit(sessionId, {
          kind: 'error',
          message: 'OpenCode encerrou (código ' + code + ')' + tail,
        });
      }
    });
    entry.proc = proc;
    entry.port = port;
    entry.auth = auth;
    if (entry.disposed) {
      killTree(proc);
      return;
    }

    await waitReady(port, auth);
    if (entry.disposed) return;

    const headers = { 'Content-Type': 'application/json', Authorization: auth };
    const s = await (
      await fetch(`http://${HOST}:${port}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'Carcará' }),
      })
    ).json();
    if (entry.disposed) return;
    entry.ocSessionId = s.id;

    // Loop SSE: /event → normaliza → emit
    streamEvents(sessionId, entry, emit).catch(() => {
      /* fim do stream */
    });
  } catch (err) {
    dispose({ sessionId });
    throw err;
  }
}

async function streamEvents(sessionId, entry, emit) {
  const res = await fetch(`http://${HOST}:${entry.port}/event`, {
    headers: { Authorization: entry.auth },
    signal: entry.aborter.signal,
  });
  if (!res.ok || !res.body) {
    emit(sessionId, { kind: 'error', message: 'stream /event HTTP ' + res.status });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSse(buffer);
    buffer = rest;
    for (const oc of events) {
      const n = normalizeEvent(oc);
      if (n) emit(sessionId, n);
    }
  }
}

// Monta as partes da mensagem do OpenCode: texto (se houver) + uma parte 'file' por
// imagem (data-URL). Pura e testável (scripts/carcara-message-smoke.cjs).
function buildMessageParts({ text, images = [] }) {
  const parts = [];
  if (text && text.trim()) parts.push({ type: 'text', text: text.trim() });
  for (const img of images) {
    if (!img || !img.dataUrl) continue;
    parts.push({
      type: 'file',
      url: img.dataUrl,
      mime: img.mime,
      filename: img.name,
    });
  }
  return parts;
}

async function send({ sessionId, text, images = [] }) {
  const e = state.get(sessionId);
  if (!e) throw new Error('sessão Carcará não iniciada');
  const parts = buildMessageParts({ text, images });
  if (!parts.length) return; // nada a enviar
  await fetch(`http://${HOST}:${e.port}/session/${e.ocSessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: e.auth },
    body: JSON.stringify({ parts }),
  });
}

function abort({ sessionId }) {
  const e = state.get(sessionId);
  if (!e) return;
  fetch(`http://${HOST}:${e.port}/session/${e.ocSessionId}/abort`, {
    method: 'POST',
    headers: { Authorization: e.auth },
  }).catch(() => {});
}

async function approve({ sessionId, permissionId, ok }) {
  const e = state.get(sessionId);
  if (!e) throw new Error('sessão Carcará não iniciada');
  // OpenCode espera 'once' | 'always' | 'reject' (confirmado em runtime) — NÃO 'allow'.
  await fetch(`http://${HOST}:${e.port}/session/${e.ocSessionId}/permissions/${permissionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: e.auth },
    body: JSON.stringify({ response: ok ? 'once' : 'reject' }),
  }).catch(() => {});
}

function dispose({ sessionId }) {
  const e = state.get(sessionId);
  if (!e) return;
  e.disposed = true;
  try {
    e.aborter.abort();
  } catch {
    /* noop */
  }
  killTree(e.proc);
  state.delete(sessionId);
}

module.exports = { ensure, send, abort, approve, dispose, buildMessageParts };
