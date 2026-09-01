// Cliente do `codex app-server --stdio` (JSON-RPC 2.0, uma mensagem por linha).
//
// Existe porque ler `~/.codex/sessions/**/rollout-*.jsonl` na mão parou de funcionar.
// A partir do Codex 0.148 o histórico migra sozinho, em segundo plano, para um thread
// store paginado (PR #37348), e o PR #38127 ("Distinguish rollout IDs from thread IDs")
// separou o uuid que está no NOME do arquivo do id que o `codex resume` aceita. Quem
// raspa o nome do arquivo passa a pegar o id errado e a olhar para um arquivo que
// parou de ser atualizado. Ver CODEX-SESSAO-DIAGNOSTICO.md.
//
// O `thread/list` responde nos dois formatos, com o id certo, o `cwd` e o `preview`
// (o primeiro prompt do usuário, que é o título da aba) já prontos, sem abrir rollout
// de 30 MB. Medido nesta máquina: 177 ms com o spawn do processo incluído.
//
// O app-server é `[experimental]` no `codex --help` e não existe em versão antiga, e
// por isso TUDO aqui devolve null quando algo dá errado: quem chama cai no leitor de
// rollout do codex-sessions.cjs.
const { spawn } = require('child_process');

const INIT_TIMEOUT_MS = 10000;
const REQ_TIMEOUT_MS = 10000;
// Depois de uma falha (codex ausente, versão sem app-server, handshake travado) não
// adianta tentar de novo a cada tick do watcher (1,5 s): espera antes de re-tentar.
const COOLDOWN_MS = 60000;
// Trava de segurança no stdout. `thread/list` é paginado, então a resposta é limitada;
// esse teto só protege contra um servidor que despeje notificação sem parar.
const MAX_BUFFER = 32 * 1024 * 1024;

let conn = null; // { proc, pending: Map<id,{resolve,reject,timer}>, nextId, buf, ready }
let cooldownUntil = 0;

// O CLAUDE.md avisa: um filho lançado de dentro do Electron herda ELECTRON_RUN_AS_NODE
// e o `codex` sobe como node puro. As chaves da Anthropic saem junto por higiene, no
// mesmo espírito do cleanEnv() do main.js.
function childEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

function dropConn(err) {
  const c = conn;
  conn = null;
  if (!c) return;
  for (const p of c.pending.values()) {
    clearTimeout(p.timer);
    p.reject(err || new Error('app-server encerrado'));
  }
  c.pending.clear();
  try {
    c.proc.kill();
  } catch {}
}

function handleLine(c, line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // linha de log/ruído: o protocolo é uma mensagem JSON por linha
  }
  if (!msg || msg.id === undefined || msg.id === null) return; // notificação: ignora
  const p = c.pending.get(msg.id);
  if (!p) return;
  c.pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'erro'), msg.error));
  else p.resolve(msg.result);
}

function startProc() {
  const opts = {
    env: childEnv(),
    stdio: ['pipe', 'pipe', 'ignore'], // stderr do app-server não interessa aqui
    windowsHide: true,
  };
  // No Windows o `codex` é .cmd/.ps1 e só roda por shell. Comando numa string só (e não
  // shell + array) porque o array com shell é depreciado no Node: ele concatena sem
  // escapar. Aqui é literal fixo, mas não vale abrir a exceção.
  const proc =
    process.platform === 'win32'
      ? spawn('codex app-server --stdio', { ...opts, shell: true })
      : spawn('codex', ['app-server', '--stdio'], opts);
  const c = { proc, pending: new Map(), nextId: 0, buf: '', ready: null };
  proc.stdout.on('data', (chunk) => {
    c.buf += chunk.toString();
    if (c.buf.length > MAX_BUFFER) c.buf = '';
    const parts = c.buf.split('\n');
    c.buf = parts.pop() || '';
    for (const l of parts) if (l.trim()) handleLine(c, l);
  });
  const die = (err) => {
    if (conn === c) dropConn(err);
  };
  proc.on('error', die);
  proc.on('close', () => die(new Error('app-server saiu')));
  return c;
}

function send(c, method, params, timeoutMs) {
  const id = ++c.nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      c.pending.delete(id);
      reject(new Error(`timeout em ${method}`));
    }, timeoutMs);
    c.pending.set(id, { resolve, reject, timer });
    try {
      c.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    } catch (e) {
      c.pending.delete(id);
      clearTimeout(timer);
      reject(e);
    }
  });
}

// Sobe o processo e faz o handshake uma única vez. Devolve a conexão pronta, ou lança.
function ensure() {
  if (conn && conn.ready) return conn.ready;
  if (Date.now() < cooldownUntil) return Promise.reject(new Error('app-server em cooldown'));
  const c = startProc();
  conn = c;
  c.ready = send(
    c,
    'initialize',
    {
      clientInfo: { name: 'carcara-code', title: 'Carcará Code', version: '1' },
      capabilities: { experimentalApi: true },
    },
    INIT_TIMEOUT_MS,
  )
    .then(() => {
      c.proc.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n',
      );
      return c;
    })
    .catch((e) => {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      dropConn(e);
      throw e;
    });
  return c.ready;
}

// Threads de um projeto, da mais recente pra mais antiga. `fast` usa só o state DB
// (sem varrer os JSONL pra reparar metadado): é o certo pro polling do watcher, que
// só quer saber se nasceu uma thread nova. Devolve null se o app-server não servir —
// null e [] são coisas diferentes aqui: [] é "não há thread neste projeto".
async function listThreads({ cwd, limit = 50, fast = false } = {}) {
  // Interruptor: CARCARA_CODEX_APP_SERVER=0 força o plano B (leitor de rollout). Serve
  // pra isolar bug em campo e pra manter os testes longe de subir processo de verdade.
  if (process.env.CARCARA_CODEX_APP_SERVER === '0') return null;
  let c;
  try {
    c = await ensure();
  } catch {
    return null;
  }
  const full = { limit };
  if (cwd) full.cwd = cwd;
  if (fast) full.useStateDbOnly = true;
  let res;
  try {
    res = await send(c, 'thread/list', full, REQ_TIMEOUT_MS);
  } catch (e) {
    // -32600 = o servidor não entendeu algum parâmetro (versão mais velha ou mais
    // nova que o schema que conhecemos). Tenta de novo sem os opcionais e filtra aqui.
    if (e && e.code === -32600) {
      try {
        res = await send(c, 'thread/list', { limit }, REQ_TIMEOUT_MS);
      } catch {
        return null;
      }
    } else {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
  }
  const rows = (res && res.data) || [];
  return (
    rows
      .map((t) => ({
        id: t.id || t.sessionId || null,
        title: t.name || t.preview || null,
        cwd: t.cwd || null,
        path: t.path || null, // rollout legado, quando ainda existe
        ephemeral: !!t.ephemeral,
        parentThreadId: t.parentThreadId || null,
        forkedFromId: t.forkedFromId || null,
        // `recencyAt` primeiro porque é por ele que o Codex ordena. O `updatedAt` do
        // servidor não acompanha essa ordem (medido: a lista vem por recência, e as duas
        // datas divergem), então ordenar por ele bagunçaria a lista.
        recencyAt: Number(t.recencyAt || t.updatedAt || t.createdAt || 0),
      }))
      // A ordem passa a ser nossa, e não a que o servidor devolveu por acaso.
      .sort((a, b) => b.recencyAt - a.recencyAt)
  );
}

// Chamado no cleanup do app: sem isto o app-server fica de pé depois que a janela fecha.
function shutdown() {
  cooldownUntil = 0;
  dropConn(new Error('app encerrando'));
}

// Só pros testes: zera o cooldown e derruba a conexão.
function _reset() {
  cooldownUntil = 0;
  dropConn(new Error('reset'));
}

module.exports = { listThreads, shutdown, _reset };
