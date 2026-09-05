// Leitura dos rollouts do Codex (~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl).
// Espelho do claude-sessions.cjs: funções PURAS (só fs), sem electron, testáveis em
// node puro. Existe porque o id de retomada do Codex era raspado do STDOUT do terminal
// (a dica "codex resume <id>" que a TUI só imprime ao encerrar graciosamente) — fechar
// o app mata o PTY antes disso e a conversa se perdia. O rollout, ao contrário, é
// append-only e é escrito DURANTE a sessão, então sobrevive a kill/crash.
//
// Formato verificado no Codex 0.144.6 e 0.153.3 (Windows):
//   1ª linha: {"type":"session_meta","payload":{"id":"<uuid>","session_id":"<uuid>",
//              "cwd":"C:\\...\\projeto","originator":"codex-tui",...}}
//   turno do usuário: mudou de forma entre as duas versões — ver `userText` abaixo.
// `codex resume <id>` CONTINUA o mesmo rollout (não cria arquivo novo).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { cleanTitle } = require('./claude-sessions.cjs');

// Rollouts passam de 30 MB — nunca ler o arquivo inteiro. Mas um head de N bytes fixo
// TAMBÉM não serve: medido nos rollouts reais, o 1º turno do usuário é a linha 6~9 e
// mesmo assim cai no byte 38 mil, 86 mil ou **852 mil**, porque o session_meta sozinho
// tem 21-42 KB e as linhas de contexto que vêm antes são enormes. O limite certo é em
// LINHAS (o turno do usuário está sempre nas primeiras), com um teto de bytes só como
// trava de segurança.
// 80 e não 40: nos rollouts medidos o turno do usuário cai na linha 9, com 8 linhas de
// preâmbulo, mas esse preâmbulo cresce com MCP, hooks e plugins carregados no projeto.
const MAX_LINES = 80;
const MAX_BYTES = 8 * 1024 * 1024;
const CHUNK = 65536;

// Nome do arquivo: rollout-<ISO com hifens>-<uuid>.jsonl. O uuid é a parte final.
const ROLLOUT_RE =
  /^rollout-.*?-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/;

// Base dos rollouts (respeita CODEX_HOME, igual ao próprio Codex).
function sessionsBase() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(home, 'sessions');
}

// Percorre as primeiras linhas do arquivo em blocos, sem carregar 30 MB na memória.
// `onLine` devolvendo false interrompe na hora (é o que dá a saída antecipada assim
// que o turno do usuário aparece). StringDecoder porque um caractere UTF-8 pode ficar
// partido entre dois blocos — concatenar toString() cru viraria mojibake.
function scanLines(file, onLine, { maxLines = MAX_LINES, maxBytes = MAX_BYTES } = {}) {
  let fd;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return;
    fd = fs.openSync(file, 'r');
  } catch {
    return;
  }
  try {
    const buf = Buffer.alloc(CHUNK);
    const dec = new StringDecoder('utf8');
    let rest = '';
    let read = 0;
    let lines = 0;
    for (;;) {
      const n = read < maxBytes ? fs.readSync(fd, buf, 0, CHUNK, read) : 0;
      if (n <= 0) {
        rest += dec.end();
        if (rest.trim() && onLine(rest) === false) return;
        return;
      }
      read += n;
      rest += dec.write(buf.subarray(0, n));
      const parts = rest.split('\n');
      rest = parts.pop() || '';
      for (const ln of parts) {
        if (ln.trim() && onLine(ln) === false) return;
        if (++lines >= maxLines) return;
      }
    }
  } catch {
    /* arquivo sumiu/travou no meio da leitura: o que deu pra ler já foi entregue */
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
  }
}

// Normaliza um caminho pra comparação: tira o prefixo estendido do Windows (\\?\),
// uniformiza as barras, remove a barra final e ignora a caixa fora do POSIX (a caixa
// da letra do drive varia entre C: e c:, igual ao caso do Claude).
function normPath(p) {
  if (!p) return '';
  let s = String(p).replace(/^\\\\\?\\/, '');
  s = s.replace(/[\\/]+/g, path.sep);
  s = s.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

function sameCwd(a, b) {
  const x = normPath(a);
  return !!x && x === normPath(b);
}

// { id, cwd } do session_meta (1ª linha). `session_id` só existe nas versões novas;
// `id` está em todas — aceita os dois.
function readMeta(file) {
  let meta = null;
  scanLines(
    file,
    (ln) => {
      try {
        const o = JSON.parse(ln);
        const p = (o && o.payload) || {};
        const id = p.session_id || p.id || null;
        if (id) meta = { id: String(id), cwd: p.cwd || null };
      } catch {}
      return false; // só a 1ª linha (session_meta)
    },
    { maxLines: 1 },
  );
  return meta;
}

// O turno do usuário mudou de forma no rollout. Medido nesta máquina:
//
//   0.144.6 {"type":"event_msg","payload":{"type":"user_message","message":"oi"}}
//   0.153.3 {"type":"event_msg","payload":{"type":"item_completed",
//            "item":{"type":"UserMessage","content":[{"type":"text","text":"oi"}]}}}
//
// As duas convivem: a máquina de um usuário pode estar em qualquer versão, e um rollout
// antigo no disco segue no formato antigo mesmo depois do `codex update`. Procurar só
// pela string "user_message", como antes, deixava o leitor cego no Codex novo — o
// arquivo existia, tinha a conversa, e o Carcará achava que a aba estava vazia.
//
// Não serve olhar `response_item`/`role: "user"`: o `<environment_context>` que o Codex
// injeta no começo da conversa também é `role: "user"`, e viraria o título da aba.
const USER_MARKS = ['"user_message"', '"UserMessage"'];

// Texto do turno do usuário nesta linha, ou null se a linha não for um turno do usuário.
// Um lugar só, porque `rolloutHasUser` e `sessionTitle` precisam da mesma resposta.
function userText(ln) {
  // Pré-filtro barato: o scanLines passa por linhas de contexto de dezenas de KB e não
  // vale parsear todas.
  if (!USER_MARKS.some((m) => ln.indexOf(m) !== -1)) return null;
  let o;
  try {
    o = JSON.parse(ln);
  } catch {
    return null;
  }
  const p = (o && o.payload) || {};
  if (p.type === 'user_message' && typeof p.message === 'string') return p.message;
  if (p.type === 'item_completed' && p.item && p.item.type === 'UserMessage') {
    const parts = Array.isArray(p.item.content) ? p.item.content : [];
    const txt = parts.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join('');
    return txt.trim() || null;
  }
  return null;
}

// Tem conversa de verdade? Sem um turno de usuário, `codex resume` retomaria uma
// sessão vazia (mesma razão do transcriptHasUser do Claude).
function rolloutHasUser(file) {
  let found = false;
  scanLines(file, (ln) => {
    if (!userText(ln)) return true;
    found = true;
    return false;
  });
  return found;
}

// Pastas de dia (YYYY/MM/DD) sob a base, da mais recente pra mais antiga.
function dayDirs(base) {
  const out = [];
  const kids = (dir) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((d) => /^\d{2,4}$/.test(d))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  };
  for (const y of kids(base)) {
    const yd = path.join(base, y);
    for (const m of kids(yd)) {
      const md = path.join(yd, m);
      for (const d of kids(md)) out.push(path.join(md, d));
    }
  }
  return out;
}

// Rollouts existentes, do mais novo pro mais velho. `days` limita quantas pastas de dia
// são varridas: uma sessão aberta às 23h59 continua na pasta do dia SEGUINTE, então o
// mínimo seguro pra "o que apareceu agora" é 2.
function listRollouts({ base = sessionsBase(), days = 2 } = {}) {
  const out = [];
  const dirs = dayDirs(base);
  for (const dir of days > 0 ? dirs.slice(0, days) : dirs) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      const m = ROLLOUT_RE.exec(f);
      if (!m) continue;
      const file = path.join(dir, f);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {
        continue;
      }
      out.push({ id: m[1], file, mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// Arquivo do rollout de um id (varre todos os dias — a sessão pode ser antiga).
function rolloutPath(id, base = sessionsBase()) {
  if (!id) return null;
  for (const r of listRollouts({ base, days: 0 })) if (r.id === id) return r.file;
  return null;
}

// O rollout desse id existe E tem conversa? Chamado antes de emitir `codex resume <id>`.
function historyExists(id, base = sessionsBase()) {
  const fp = rolloutPath(id, base);
  return !!fp && rolloutHasUser(fp);
}

// Ids de rollout que JÁ existiam — tirado ANTES de subir o `codex` puro, pra depois
// (newRollout) achar qual arquivo apareceu = a conversa desta aba. Guarda TODOS os ids,
// não só os do projeto: o id sai do nome do arquivo, então o snapshot não abre arquivo
// nenhum, e o newRollout (que roda a cada 1,5 s) já descarta o que é velho sem ler.
// `projectPath` fica na assinatura só por simetria com o leitor do Claude — a filtragem
// por projeto acontece no newRollout, que precisa abrir o arquivo de qualquer jeito.
function snapshot(projectPath, base = sessionsBase()) {
  const set = new Set();
  for (const r of listRollouts({ base })) set.add(r.id);
  return set;
}

// Rollout NOVO (fora do snapshot) deste projeto que já tem turno de usuário. Só devolve
// com exatamente um candidato — se duas abas novas surgirem juntas no mesmo projeto,
// espera (null) pra não amarrar a aba ao rollout errado.
function newRollout(projectPath, snap, base = sessionsBase()) {
  const fresh = [];
  for (const r of listRollouts({ base })) {
    if (snap && snap.has(r.id)) continue;
    const meta = readMeta(r.file);
    if (!meta || !sameCwd(meta.cwd, projectPath)) continue;
    if (rolloutHasUser(r.file)) fresh.push(r.id);
  }
  return fresh.length === 1 ? fresh[0] : null;
}

// Título da aba: o 1º prompt do usuário. O Codex não grava nada equivalente ao
// {"type":"ai-title"} do Claude, então não há título "melhor" pra preferir depois.
function sessionTitle(file) {
  let title = null;
  scanLines(file, (ln) => {
    const msg = userText(ln);
    if (!msg) return true;
    const t = cleanTitle(msg);
    if (!t) return true; // prompt só de espaço/emoji: segue procurando o próximo
    title = t;
    return false;
  });
  return title;
}

// ---------------------------------------------------------------------------
// Camada preferida: o `thread/list` do app-server.
//
// Tudo acima continua valendo como PLANO B. O plano A é perguntar ao próprio Codex,
// porque a partir do 0.148 ele migra o histórico sozinho para um thread store paginado
// e o uuid do nome do arquivo deixa de ser o id que o `codex resume` aceita
// (PR #38127). Ver CODEX-SESSAO-DIAGNOSTICO.md.
// ---------------------------------------------------------------------------
const appServer = require('./codex-app-server.cjs');

// Uuid embutido no caminho de um rollout. É o que liga o id antigo (gravado no config
// pelo 0.1.13, raspado do nome do arquivo) ao thread id novo da mesma conversa.
// Ultimo segmento de um caminho, aceitando os DOIS separadores. Nao usa path.basename
// de proposito: ele so entende o separador do sistema ANFITRIAO, entao um caminho do
// Windows lido no Linux/macOS voltava inteiro e a ancora ^rollout- nunca casava. O
// mesmo cuidado que o normPath ja tinha logo acima.
function lastSegment(p) {
  const parts = String(p).split(/[\\/]+/);
  return parts[parts.length - 1] || '';
}

function idFromPath(p) {
  const m = p ? ROLLOUT_RE.exec(lastSegment(p)) : null;
  return m ? m[1] : null;
}

// Threads do projeto pelo app-server, já sem as descartáveis e sem as que ainda não
// têm conversa. Devolve null (não []) quando o app-server não serve: aí quem chama
// sabe que precisa cair no plano B, em vez de achar que o projeto não tem conversa.
async function threadsVia(projectPath, fast) {
  const rows = await appServer.listThreads({ cwd: projectPath, fast });
  if (!rows) return null;
  return rows.filter((t) => t.id && !t.ephemeral && sameCwd(t.cwd, projectPath));
}

// Ids que JÁ existiam, tirado antes de subir o `codex`. Carrega a origem junto (`via`)
// porque os dois planos falam ids DIFERENTES no Codex 0.148+ (thread id vs rollout id):
// tirar o snapshot por um caminho e procurar o novo pelo outro casaria a aba com o id
// errado. Pra quem chama é valor opaco, só volta no findNewThread.
async function snapshotThreads(projectPath) {
  const rows = await threadsVia(projectPath, true);
  if (rows) return { via: 'app', ids: new Set(rows.map((t) => t.id)) };
  return { via: 'rollout', ids: snapshot(projectPath) };
}

// Thread NOVA (fora do snapshot) deste projeto que já tem turno de usuário.
// Descarta subagente e fork (`parentThreadId`/`forkedFromId`): com `multi_agent` ligado
// eles nascem junto com a conversa principal, e antes disso o "exatamente um candidato"
// travava pra sempre e a aba nunca ganhava id.
// Parte pura (testável sem subir processo): dadas as threads de agora e os ids de antes,
// qual é a conversa desta aba? Segue exigindo candidato ÚNICO, porque casar a aba com a
// conversa errada é pior do que ficar sem título por mais um tick.
function pickNewThread(rows, snapIds) {
  const fresh = (rows || []).filter(
    (t) => t && t.id && !snapIds.has(t.id) && !t.parentThreadId && !t.forkedFromId && t.title,
  );
  return fresh.length === 1 ? fresh[0].id : null;
}

async function findNewThread(projectPath, snap) {
  if (snap && snap.via === 'app') {
    const rows = await threadsVia(projectPath, true);
    if (!rows) return null; // app-server caiu no meio: não arrisca casar id do outro plano
    return pickNewThread(rows, snap.ids);
  }
  return newRollout(projectPath, snap ? snap.ids : null);
}

// Troca o id salvo pelo config antigo (rollout id) pelo thread id da mesma conversa,
// casando pelo caminho do rollout que o thread/list devolve. Sem nada a migrar, ou sem
// app-server, devolve o próprio id — quem decide se presta é o threadExists.
// Parte pura do resolveThreadId.
function pickResolvedId(rows, savedId) {
  if (!savedId) return null;
  if (!rows || rows.some((t) => t.id === savedId)) return savedId;
  const hit = rows.find((t) => idFromPath(t.path) === savedId);
  return hit ? hit.id : savedId;
}

async function resolveThreadId(savedId, projectPath) {
  if (!savedId) return null;
  return pickResolvedId(await threadsVia(projectPath, false), savedId);
}

// A conversa desse id existe E tem turno de usuário? Chamado antes de emitir o resume.
async function threadExists(id, projectPath) {
  if (!id) return false;
  const rows = await threadsVia(projectPath, false);
  if (rows) {
    const hit = rows.find((t) => t.id === id);
    if (hit) return !!hit.title;
  }
  return historyExists(id);
}

// Título da aba: o `preview` do thread/list já é o primeiro prompt do usuário, então
// não precisa abrir rollout de 30 MB. `name` (thread nomeada) vence, e vem antes no
// normalizador do cliente.
async function threadTitle(projectPath, id) {
  if (!id) return null;
  const rows = await threadsVia(projectPath, true);
  if (rows) {
    const hit = rows.find((t) => t.id === id);
    if (hit && hit.title) return cleanTitle(hit.title);
  }
  const fp = rolloutPath(id);
  return fp ? sessionTitle(fp) : null;
}

module.exports = {
  sessionsBase,
  normPath,
  sameCwd,
  readMeta,
  userText,
  rolloutHasUser,
  listRollouts,
  rolloutPath,
  historyExists,
  snapshot,
  newRollout,
  sessionTitle,
  // camada app-server (assíncrona) + suas partes de decisão puras
  idFromPath,
  pickNewThread,
  pickResolvedId,
  threadsVia,
  snapshotThreads,
  findNewThread,
  resolveThreadId,
  threadExists,
  threadTitle,
};
