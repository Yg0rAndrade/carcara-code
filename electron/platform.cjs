'use strict';
// Camada canônica de plataforma (Win/Mac/Linux). Ver CLAUDE.md › "Diferenças de
// plataforma". Node-free de propósito: só depende de `process`. Comportamento por SO
// que precise de fs/child_process vive nos módulos que já têm Node.

// TABELA = valores puros por SO (o "locale" de plataforma). Adicionar suporte a um
// SO = preencher a coluna dele aqui.
const TABLE = {
  win32: {
    shellDefault: 'powershell.exe',
    shellEnv: 'COMSPEC',
    loginArgs: [],
    exeExt: '.exe',
    openCmd: 'start',
    opencodeBin: 'opencode.cmd',
  },
  darwin: {
    shellDefault: 'zsh',
    shellEnv: 'SHELL',
    loginArgs: ['-l'],
    exeExt: '',
    openCmd: 'open',
    opencodeBin: 'opencode',
  },
  linux: {
    shellDefault: 'bash',
    shellEnv: 'SHELL',
    loginArgs: [],
    exeExt: '',
    openCmd: 'xdg-open',
    opencodeBin: 'opencode',
  },
};

function tableFor(platform = process.platform) {
  return TABLE[platform] || TABLE.linux;
}

// Shell interativo do SO (preserva o antigo shellForOS: win usa COMSPEC, resto usa SHELL).
function shellFor(platform = process.platform, env = process.env) {
  const t = tableFor(platform);
  return env[t.shellEnv] || t.shellDefault;
}

// Args para abrir o shell como login shell (só o macOS precisa, p/ herdar o PATH).
function loginArgsFor(platform = process.platform) {
  return tableFor(platform).loginArgs;
}

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Corrige o PATH do processo em apps GUI no macOS/Linux (que não herdam o PATH do
// shell de login). No-op no Windows. Idempotente. `fix-path` é ESM-only, por isso o
// import dinâmico. Falha em silêncio (retorna false) se a lib não carregar.
let _pathFixed = false;
async function fixLoginPath(platform = process.platform) {
  if (platform !== 'darwin' && platform !== 'linux') return false;
  if (_pathFixed) return true;
  try {
    const mod = await import('fix-path');
    (mod.default || mod)();
    _pathFixed = true;
    return true;
  } catch {
    return false;
  }
}

// Template de menu nativo do macOS. Sem ele (setApplicationMenu(null)), o mac perde
// Cmd+Q/C/V/H e a edição nativa. Só roles padrão — o Electron traduz p/ os itens do SO.
function macMenuTemplate(appName) {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { role: 'window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
  ];
}

module.exports = {
  TABLE,
  tableFor,
  shellFor,
  loginArgsFor,
  fixLoginPath,
  macMenuTemplate,
  isWin,
  isMac,
  isLinux,
};
