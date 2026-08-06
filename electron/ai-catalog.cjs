'use strict';
// Fonte de verdade das RECEITAS de cada CLI de IA: o comando oficial de instalar/
// atualizar e o link da documentação. Puro, sem Electron/fs — testável em qualquer SO.
//
// IMPORTANTE (mudou na 0.1.11): o app NÃO roda mais esses comandos. Ele os MOSTRA num
// terminal de verdade, o usuário lê, edita se quiser e aperta Enter. O motivo está em
// docs/2026-08-06-gerenciar-ias-diagnostico-e-plano.md: rodar comando de terceiro por
// baixo do pano falhava de três jeitos — o interpretador podia não existir na máquina
// (`sh` não está no PATH do Windows, nem com Git instalado), o comando envelhecia junto
// com o instalador do fornecedor, e "deu certo" vinha de exit code alheio, que mente
// (o `npm i -g` do npm 12 sai com 0 mesmo bloqueando o postinstall que instala o binário).
// Comando visível e editável transforma esses três em algo que o usuário resolve sozinho.

// Cada receita tem passos (array — o `agy` precisa de dois) por SO. `update` ausente
// significa "reinstalar" (mesmos passos do install). `note_key` é uma explicação em
// i18n mostrada junto do comando.
const RECIPES = {
  codex: {
    docs: 'https://developers.openai.com/codex/cli/',
    win: {
      // Chamar o powershell explicitamente faz a linha funcionar colada em QUALQUER
      // shell do Windows (cmd, PowerShell, pwsh) — `irm|iex` sozinho só roda no PS.
      install: [
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"',
      ],
    },
    unix: { install: ['curl -fsSL https://chatgpt.com/codex/install.sh | sh'] },
  },
  opencode: {
    docs: 'https://opencode.ai/docs/',
    win: {
      // No Windows a receita oficial (`curl | bash`) é inexecutável: não há bash no PATH
      // nem com o Git instalado. Sobra o npm — e aí entra o `--allow-scripts`, sem o qual
      // o npm 12 bloqueia o postinstall que baixa o binário e deixa um stub quebrado.
      install: ['npm install -g --allow-scripts=opencode-ai opencode-ai'],
      update: ['npm install -g --allow-scripts=opencode-ai opencode-ai@latest'],
      note_key: 'settings.aiNoteOpencodeWin',
    },
    unix: {
      install: ['curl -fsSL https://opencode.ai/install | bash'],
      update: ['opencode upgrade'],
    },
  },
  agy: {
    docs: 'https://antigravity.google/docs/cli-overview',
    win: {
      install: [
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://antigravity.google/cli/install.ps1 | iex"',
        'agy install',
      ],
    },
    unix: {
      install: ['curl -fsSL https://antigravity.google/cli/install.sh | bash', 'agy install'],
    },
  },
  claude: {
    docs: 'https://docs.claude.com/en/docs/claude-code/setup',
    win: {
      install: [
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"',
      ],
      update: ['claude update'],
    },
    unix: {
      install: ['curl -fsSL https://claude.ai/install.sh | bash'],
      update: ['claude update'],
    },
  },
};

const CATALOG = {
  codex: {
    key: 'codex',
    bin: 'codex',
    latest: { type: 'github', repo: 'openai/codex' },
    // Desinstalação GUIADA: mostramos o comando oficial reversível. Nunca apagamos
    // arquivos — quem roda é o usuário, no terminal, vendo o que vai acontecer.
    uninstall: {
      kind: 'command',
      run: 'npm uninstall -g @openai/codex',
      note_key: 'settings.uninstallCodexNote',
    },
  },
  opencode: {
    key: 'opencode',
    bin: 'opencode',
    latest: { type: 'npm', pkg: 'opencode-ai' },
    uninstall: {
      kind: 'command',
      run: 'opencode uninstall',
      note_key: 'settings.uninstallOpencodeNote',
    },
  },
  agy: {
    key: 'agy',
    bin: 'agy',
    latest: { type: 'github', repo: 'google-antigravity/antigravity-cli' },
    // Antigravity é app do Windows: sem comando reversível; delegamos pros "Apps" do SO.
    uninstall: { kind: 'os-apps', note_key: 'settings.uninstallAgyNote' },
  },
  claude: {
    key: 'claude',
    bin: 'claude',
    latest: { type: 'npm', pkg: '@anthropic-ai/claude-code' },
    uninstall: {
      kind: 'command',
      run: 'npm uninstall -g @anthropic-ai/claude-code',
      note_key: 'settings.uninstallClaudeNote',
    },
  },
};

const INSTALLABLE_KEYS = ['codex', 'opencode', 'agy', 'claude'];

const slot = (platform) => (platform === 'win32' ? 'win' : 'unix');

// Receita a MOSTRAR: passos de instalar/atualizar + doc oficial. `update` cai no
// install quando o fornecedor não tem comando próprio (reinstalar é a atualização).
function commandsFor(key, platform = process.platform) {
  const r = RECIPES[key];
  if (!r) return null;
  const s = r[slot(platform)];
  if (!s) return null;
  const install = s.install || [];
  return {
    key,
    docs: r.docs,
    install,
    update: s.update || install,
    note_key: s.note_key || null,
  };
}

// Descritor de desinstalação GUIADA usado pela UI. Não roda nada — descreve o comando
// oficial (kind 'command') ou a instrução de delegar pros "Apps" do SO (kind 'os-apps').
function uninstallGuide(key) {
  const e = CATALOG[key];
  if (!e || !e.uninstall) return null;
  const u = e.uninstall;
  const guide = { key: e.key, bin: e.bin, kind: u.kind, note_key: u.note_key };
  if (u.kind === 'command') guide.run = u.run;
  return guide;
}

function catalogFor(platform = process.platform) {
  return Object.values(CATALOG).map((e) => {
    const cmds = commandsFor(e.key, platform);
    return {
      key: e.key,
      bin: e.bin,
      docs: cmds ? cmds.docs : null,
      install: cmds ? cmds.install : [],
      update: cmds ? cmds.update : [],
      note_key: cmds ? cmds.note_key : null,
      uninstall: uninstallGuide(e.key),
      latest: e.latest,
    };
  });
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
  RECIPES,
  INSTALLABLE_KEYS,
  catalogFor,
  commandsFor,
  uninstallGuide,
  parseVersion,
  cmpVersions,
  computeUpdateAvailable,
};
