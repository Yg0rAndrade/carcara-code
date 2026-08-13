// Seam por CLI: quem sabe ler o histórico de conversa que a CLI deixa NO DISCO.
// Antes só o claude tinha esse caminho (hard-coded no main.js) e as outras dependiam
// de raspar o id do stdout do terminal — o que só funciona se a CLI imprimir a dica e
// o usuário sair dela graciosamente. Fechando o app, o PTY morre e a conversa se perde.
//
// Regra do CLAUDE.md: diferença por CLI vira TABELA, não `if` espalhado. Adicionar
// suporte a uma CLI = preencher uma entrada aqui.
//
// readerFor(cli) devolve null pras CLIs sem histórico legível (opencode/agy seguem no
// regex de stdout; custom/shell/carcara não têm conversa em arquivo), ou:
//   getId(sessionMeta)              -> id de retomada salvo no config, ou null
//   setId(sessionMeta, id)          -> grava o id no config (muta o objeto)
//   legacyId(tabId)                 -> id herdado de esquema antigo, ou null
//   resumeCmd(id)                   -> comando que retoma a conversa
//   cmd                             -> comando de conversa NOVA
//   historyExists(id)               -> o histórico existe e tem conversa de verdade?
//   snapshot(projectPath)           -> Set de ids já existentes (antes de lançar)
//   findNew(projectPath, snap)      -> id que apareceu depois do snapshot (ou null)
//   title(projectPath, id)          -> título da aba a partir do histórico, ou null
const claudeSessions = require('./claude-sessions.cjs');
const codexSessions = require('./codex-sessions.cjs');

const READERS = {
  claude: {
    getId: (s) => (s && s.claudeId) || null,
    setId: (s, id) => {
      s.claudeId = id;
    },
    // Esquema antigo: o id da aba ERA o id da conversa do Claude.
    legacyId: (tabId) => (claudeSessions.historyExists(tabId) ? tabId : null),
    resumeCmd: (id) => `claude --resume ${id}`,
    cmd: 'claude',
    historyExists: (id) => claudeSessions.historyExists(id),
    snapshot: (projectPath) => claudeSessions.snapshot(projectPath),
    findNew: (projectPath, snap) => claudeSessions.newTranscript(projectPath, snap),
    title: (projectPath, id) => {
      const fp = claudeSessions.transcriptPath(projectPath, id);
      return fp ? claudeSessions.sessionTitle(fp) : null;
    },
  },
  codex: {
    // Mesma forma que o ai-cli.buildResumeCommand já lê (cfg.sessions[].resume.codex),
    // então nada de migração de config.
    getId: (s) => (s && s.resume && s.resume.codex) || null,
    setId: (s, id) => {
      s.resume = s.resume || {};
      s.resume.codex = id;
    },
    legacyId: () => null,
    resumeCmd: (id) => `codex resume ${id}`,
    cmd: 'codex',
    historyExists: (id) => codexSessions.historyExists(id),
    snapshot: (projectPath) => codexSessions.snapshot(projectPath),
    findNew: (projectPath, snap) => codexSessions.newRollout(projectPath, snap),
    title: (projectPath, id) => {
      const fp = codexSessions.rolloutPath(id);
      return fp ? codexSessions.sessionTitle(fp) : null;
    },
  },
};

function readerFor(cli) {
  return (cli && READERS[cli]) || null;
}

module.exports = { READERS, readerFor };
