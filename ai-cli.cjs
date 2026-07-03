// Lógica pura das CLIs de IA (sem Electron), testável por unidade. Cobre a migração
// do config por projeto, a escolha da CLI efetiva de uma aba e o comando de resume
// das CLIs que não são o claude (o --resume do claude depende do filesystem e fica
// no main.js). Ver docs/superpowers/specs/2026-07-03-multiplas-ias-por-projeto-design.md.

const AI_CLIS = { claude: 'claude', opencode: 'opencode', agy: 'agy', codex: 'codex' };
const VALID_CLIS = ['claude', 'codex', 'opencode', 'agy', 'custom'];

// { projectCli[path] } pode estar em 3 formatos: novo { ais, custom }, antigo por
// projeto { cli, custom } e global legado (cfg.cli / cfg.cliCustom). Sempre devolve
// { ais, custom } com ao menos uma IA válida.
function resolveProjectAis(cfg, projectPath) {
  const c = cfg || {};
  const pc = c.projectCli && c.projectCli[projectPath];
  if (pc && Array.isArray(pc.ais)) {
    const ais = pc.ais.filter((k) => VALID_CLIS.includes(k));
    if (ais.length) return { ais, custom: pc.custom || '' };
  }
  if (pc && pc.cli) return { ais: [pc.cli], custom: pc.custom || '' };
  if (c.cli) return { ais: [c.cli], custom: c.cliCustom || '' };
  return { ais: ['claude'], custom: '' };
}

// CLI que a aba deve subir: a gravada na sessão vence; senão a 1ª IA do projeto.
function effectiveCli(sessionMeta, ais) {
  const cli = sessionMeta && sessionMeta.cli;
  if (cli) return cli;
  return (ais && ais[0]) || 'claude';
}

// Comando das CLIs não-claude (com resume quando há id salvo em sessionMeta.resume).
function buildResumeCommand(cli, sessionMeta, custom) {
  const s = sessionMeta || {};
  const r = s.resume || {};
  if (cli === 'opencode') return r.opencode ? `opencode --session ${r.opencode}` : 'opencode';
  if (cli === 'agy') return r.agy ? `agy --conversation=${r.agy}` : 'agy';
  if (cli === 'codex') return r.codex ? `codex resume ${r.codex}` : 'codex';
  if (cli === 'custom') return (custom || '').trim() || 'claude';
  return AI_CLIS[cli] || 'claude';
}

module.exports = { AI_CLIS, VALID_CLIS, resolveProjectAis, effectiveCli, buildResumeCommand };
