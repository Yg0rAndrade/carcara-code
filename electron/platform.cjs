'use strict';
// Camada canônica de plataforma (Win/Mac/Linux). Ver CLAUDE.md › "Diferenças de
// plataforma". Node-free de propósito: só depende de `process`. Comportamento por SO
// que precise de fs/child_process vive nos módulos que já têm Node.

// TABELA = valores puros por SO (o "locale" de plataforma). Adicionar suporte a um
// SO = preencher a coluna dele aqui.
// `shells` = candidatos SELECIONÁVEIS de shell por SO (dados puros). Quais estão de fato
// INSTALADOS é decidido no main.js (tem fs/child_process), que sonda cada `cmd` no PATH e
// os caminhos extras em `probe`. `id` é a chave estável salva no config; `label` é o nome
// exibido (nome próprio, não traduzido); `loginArgs` são os args de shell de login.
const TABLE = {
  win32: {
    shellDefault: 'powershell.exe',
    shellEnv: 'COMSPEC',
    loginArgs: [],
    exeExt: '.exe',
    openCmd: 'start',
    whichCmd: 'where',
    shells: [
      { id: 'powershell', label: 'Windows PowerShell', cmd: 'powershell.exe', loginArgs: [] },
      { id: 'pwsh', label: 'PowerShell 7', cmd: 'pwsh.exe', loginArgs: [] },
      { id: 'cmd', label: 'Command Prompt', cmd: 'cmd.exe', loginArgs: [] },
      {
        // probeOnly: nunca cair no `where bash.exe`, que casaria com o launcher do WSL em
        // System32\bash.exe (mislabel). O main.js deriva o caminho a partir do git.exe.
        id: 'gitbash',
        label: 'Git Bash',
        cmd: 'bash.exe',
        loginArgs: ['-l'],
        probe: ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'],
        probeOnly: true,
      },
      {
        // wsl.exe existe sempre no System32 (mesmo sem distro). `verify` exige que
        // `wsl.exe -l -q` liste ao menos uma distro, senão a opção não aparece.
        id: 'wsl',
        label: 'WSL',
        cmd: 'wsl.exe',
        loginArgs: [],
        verify: ['-l', '-q'],
      },
    ],
  },
  darwin: {
    shellDefault: 'zsh',
    shellEnv: 'SHELL',
    loginArgs: ['-l'],
    exeExt: '',
    openCmd: 'open',
    whichCmd: 'which',
    shells: [
      { id: 'zsh', label: 'zsh', cmd: 'zsh', loginArgs: ['-l'] },
      { id: 'bash', label: 'bash', cmd: 'bash', loginArgs: ['-l'] },
      { id: 'fish', label: 'fish', cmd: 'fish', loginArgs: ['-l'] },
      { id: 'sh', label: 'sh', cmd: 'sh', loginArgs: ['-l'] },
    ],
  },
  linux: {
    shellDefault: 'bash',
    shellEnv: 'SHELL',
    loginArgs: [],
    exeExt: '',
    openCmd: 'xdg-open',
    whichCmd: 'which',
    shells: [
      { id: 'bash', label: 'bash', cmd: 'bash', loginArgs: [] },
      { id: 'zsh', label: 'zsh', cmd: 'zsh', loginArgs: [] },
      { id: 'fish', label: 'fish', cmd: 'fish', loginArgs: [] },
      { id: 'sh', label: 'sh', cmd: 'sh', loginArgs: [] },
    ],
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

// Candidatos de shell selecionáveis no SO (dados puros; a detecção do que está instalado
// mora no main.js). Vazio para SOs sem tabela.
function shellChoicesFor(platform = process.platform) {
  return tableFor(platform).shells || [];
}

// Comando que localiza um executável no PATH: 'where' no Windows, 'which' no resto.
function whichCmdFor(platform = process.platform) {
  return tableFor(platform).whichCmd || 'which';
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
  shellChoicesFor,
  whichCmdFor,
  fixLoginPath,
  macMenuTemplate,
  isWin,
  isMac,
  isLinux,
};
