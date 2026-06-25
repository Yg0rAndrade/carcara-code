// Leitura dos transcripts do Claude Code (~/.claude/projects/<projeto>/<id>.jsonl).
// Funções PURAS (só fs), sem electron — por isso testáveis em node puro
// (claude-sessions.smoke.cjs). O main.js usa isto pra: descobrir o id real da
// conversa de uma aba nova (que sobe `claude` puro) e ler o título que o próprio
// Claude gera (linhas {"type":"ai-title"}) pra nomear a aba igual ao Claude Code.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Base dos transcripts (respeita CLAUDE_CONFIG_DIR, igual ao Claude Code).
function projectsBase() {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.join(process.env.CLAUDE_CONFIG_DIR, 'projects')
    : path.join(os.homedir(), '.claude', 'projects');
}

// O Claude nomeia a pasta do projeto trocando todo caractere não-alfanumérico por
// '-' (ex.: "C:\Users\a b\proj" -> "C--Users-a-b-proj"). A caixa da letra do drive
// varia (C:/c:), então quem compara deve normalizar pra minúsculas.
function encodeProjectDir(projectPath) {
  return String(projectPath).replace(/[^A-Za-z0-9]/g, '-');
}

// Pasta(s) de transcript que batem com este projeto (case-insensitive p/ o drive).
function projectDirCandidates(projectPath, base = projectsBase()) {
  const want = encodeProjectDir(projectPath).toLowerCase();
  try {
    return fs.readdirSync(base)
      .filter((d) => d.toLowerCase() === want)
      .map((d) => path.join(base, d));
  } catch { return []; }
}

// Tem conversa de verdade? (pelo menos uma mensagem de usuário no começo do arquivo).
// Sem isso, `--resume` falharia com "no conversation", e a aba não merece título.
function transcriptHasUser(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0) return false;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(Math.min(st.size, 262144)); // 1ª msg aparece logo no início
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8');
    return head.includes('"type":"user"') || head.includes('"role":"user"');
  } catch { return false; }
}

// <id>.jsonl existe (com conversa) em QUALQUER projeto — o id pode ter migrado de
// pasta, então varre tudo, como o Claude faz no --resume.
function historyExists(claudeId, base = projectsBase()) {
  if (!claudeId) return false;
  try {
    for (const d of fs.readdirSync(base)) {
      if (transcriptHasUser(path.join(base, d, claudeId + '.jsonl'))) return true;
    }
  } catch {}
  return false;
}

// Caminho do <id>.jsonl: tenta a(s) pasta(s) do projeto e cai pra varredura global.
function transcriptPath(projectPath, claudeId, base = projectsBase()) {
  if (!claudeId) return null;
  for (const dir of projectDirCandidates(projectPath, base)) {
    const fp = path.join(dir, claudeId + '.jsonl');
    try { if (fs.statSync(fp).isFile()) return fp; } catch {}
  }
  try {
    for (const d of fs.readdirSync(base)) {
      const fp = path.join(base, d, claudeId + '.jsonl');
      try { if (fs.statSync(fp).isFile()) return fp; } catch {}
    }
  } catch {}
  return null;
}

// Ids de transcript já existentes no projeto — tirado ANTES de subir o `claude` puro,
// pra depois (newTranscript) achar qual arquivo apareceu = a conversa desta aba.
function snapshot(projectPath, base = projectsBase()) {
  const set = new Set();
  for (const dir of projectDirCandidates(projectPath, base)) {
    try {
      for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) set.add(f.slice(0, -6));
    } catch {}
  }
  return set;
}

// Transcript NOVO (fora do snapshot) que já tem mensagem de usuário. Só devolve com
// exatamente um candidato — se duas abas novas surgirem juntas no mesmo projeto,
// espera (null) pra não amarrar a aba ao transcript errado.
function newTranscript(projectPath, snap, base = projectsBase()) {
  const fresh = [];
  for (const dir of projectDirCandidates(projectPath, base)) {
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const id = f.slice(0, -6);
      if (snap.has(id)) continue;
      if (transcriptHasUser(path.join(dir, f))) fresh.push(id);
    }
  }
  return fresh.length === 1 ? fresh[0] : null;
}

// Último título gerado pelo Claude: linhas {"type":"ai-title","aiTitle":"…"}. Ele
// reescreve conforme a conversa evolui, então o último vale. Lê só o rabo do arquivo
// (título fica perto do fim); linha parcial no corte só falha o JSON.parse e é pulada.
function latestAiTitle(file) {
  try {
    const st = fs.statSync(file);
    const start = Math.max(0, st.size - 131072);
    const len = st.size - start;
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const ln = lines[i].trim();
      if (!ln || ln.indexOf('"ai-title"') === -1) continue;
      try {
        const o = JSON.parse(ln);
        if (o && o.type === 'ai-title' && o.aiTitle) return String(o.aiTitle);
      } catch {}
    }
  } catch {}
  return null;
}

module.exports = {
  projectsBase, encodeProjectDir, projectDirCandidates, transcriptHasUser,
  historyExists, transcriptPath, snapshot, newTranscript, latestAiTitle,
};
