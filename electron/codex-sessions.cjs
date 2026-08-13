// Leitura dos rollouts do Codex (~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl).
// Espelho do claude-sessions.cjs: funções PURAS (só fs), sem electron, testáveis em
// node puro. Existe porque o id de retomada do Codex era raspado do STDOUT do terminal
// (a dica "codex resume <id>" que a TUI só imprime ao encerrar graciosamente) — fechar
// o app mata o PTY antes disso e a conversa se perdia. O rollout, ao contrário, é
// append-only e é escrito DURANTE a sessão, então sobrevive a kill/crash.
//
// Formato verificado no Codex 0.144.6 (Windows):
//   1ª linha: {"type":"session_meta","payload":{"id":"<uuid>","session_id":"<uuid>",
//              "cwd":"C:\\...\\projeto","originator":"codex-tui",...}}
//   turno do usuário: {"type":"event_msg","payload":{"type":"user_message","message":"..."}}
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
const MAX_LINES = 40;
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

// Tem conversa de verdade? Sem um turno de usuário, `codex resume` retomaria uma
// sessão vazia (mesma razão do transcriptHasUser do Claude).
function rolloutHasUser(file) {
  let found = false;
  scanLines(file, (ln) => {
    if (ln.indexOf('"user_message"') === -1) return true;
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
    if (ln.indexOf('"user_message"') === -1) return true;
    try {
      const o = JSON.parse(ln);
      const p = (o && o.payload) || {};
      if (p.type === 'user_message' && p.message) {
        const t = cleanTitle(p.message);
        if (t) {
          title = t;
          return false;
        }
      }
    } catch {}
    return true;
  });
  return title;
}

module.exports = {
  sessionsBase,
  normPath,
  sameCwd,
  readMeta,
  rolloutHasUser,
  listRollouts,
  rolloutPath,
  historyExists,
  snapshot,
  newRollout,
  sessionTitle,
};
