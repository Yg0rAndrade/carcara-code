'use strict';
// Fonte de verdade da MECÂNICA de cada CLI de IA (instalar/atualizar/versão). Puro,
// sem Electron/fs — testável por unidade e por smoke em qualquer SO. Os comandos são
// os instaladores OFICIAIS de cada fornecedor (sem exigir Node). Comportamento que
// precisa de child_process/https vive em ai-installer.cjs. Ver
// docs/superpowers/specs/2026-07-10-gestao-clis-ia-design.md.

// win = comando p/ win32; unix = comando p/ darwin+linux. `shell` é o interpretador
// que o ai-installer usa pra rodar (informativo; o PTY roda no shell do SO).
const CATALOG = {
  codex: {
    key: 'codex',
    bin: 'codex',
    install: {
      win: { shell: 'powershell', cmd: 'irm https://chatgpt.com/codex/install.ps1 | iex' },
      unix: { shell: 'sh', cmd: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' },
    },
    update: 'reinstall', // reexecuta o install
    postInstall: null,
    latest: { type: 'github', repo: 'openai/codex' },
  },
  opencode: {
    key: 'opencode',
    bin: 'opencode',
    install: {
      win: { shell: 'sh', cmd: 'curl -fsSL https://opencode.ai/install | bash' },
      unix: { shell: 'sh', cmd: 'curl -fsSL https://opencode.ai/install | bash' },
    },
    update: { builtin: 'opencode upgrade' },
    postInstall: null,
    latest: { type: 'builtin' },
  },
  agy: {
    key: 'agy',
    bin: 'agy',
    install: {
      win: { shell: 'powershell', cmd: 'irm https://antigravity.google/cli/install.ps1 | iex' },
      unix: { shell: 'sh', cmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' },
    },
    update: 'reinstall',
    postInstall: 'agy install',
    latest: { type: 'github', repo: 'google-antigravity/antigravity-cli' },
  },
  // claude não instala por aqui: já tem instalador nativo/fluxo próprio no app.
  claude: {
    key: 'claude',
    bin: 'claude',
    install: null,
    update: { builtin: 'claude update' },
    postInstall: null,
    latest: { type: 'builtin' },
  },
};

const INSTALLABLE_KEYS = ['codex', 'opencode', 'agy'];

const slot = (platform) => (platform === 'win32' ? 'win' : 'unix');

function installSpec(key, platform = process.platform) {
  const e = CATALOG[key];
  if (!e || !e.install) return null;
  const s = e.install[slot(platform)];
  return { shell: s.shell, cmd: s.cmd, postInstall: e.postInstall || null };
}

function updateSpec(key, platform = process.platform) {
  const e = CATALOG[key];
  if (!e) return null;
  if (e.update && e.update.builtin) {
    const shell = slot(platform) === 'win' ? 'powershell' : 'sh';
    return { shell, cmd: e.update.builtin, builtin: true };
  }
  // 'reinstall' → mesmo comando do install
  const ins = installSpec(key, platform);
  return ins ? { shell: ins.shell, cmd: ins.cmd, builtin: false } : null;
}

function catalogFor(platform = process.platform) {
  return Object.values(CATALOG).map((e) => ({
    key: e.key,
    bin: e.bin,
    install: installSpec(e.key, platform),
    update: updateSpec(e.key, platform),
    postInstall: e.postInstall || null,
    latest: e.latest,
  }));
}

function parseVersion(_key, stdout) {
  const m = String(stdout || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m[0] : null;
}

function cmpVersions(a, b) {
  const pa = String(a)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function computeUpdateAvailable(installed, latest) {
  if (!installed || !latest) return false;
  return cmpVersions(latest, installed) > 0;
}

module.exports = {
  CATALOG,
  INSTALLABLE_KEYS,
  catalogFor,
  installSpec,
  updateSpec,
  parseVersion,
  cmpVersions,
  computeUpdateAvailable,
};
