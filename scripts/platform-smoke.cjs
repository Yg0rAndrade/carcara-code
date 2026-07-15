// Smoke da camada de plataforma. Uso: node scripts/platform-smoke.cjs
const {
  TABLE,
  tableFor,
  shellFor,
  loginArgsFor,
  shellChoicesFor,
  whichCmdFor,
  isWin,
  isMac,
  isLinux,
} = require('../electron/platform.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// tabela cobre os 3 SOs
for (const os of ['win32', 'darwin', 'linux']) {
  assert(TABLE[os], `TABLE tem ${os}`);
  assert(typeof TABLE[os].shellDefault === 'string', `${os}.shellDefault é string`);
  assert(Array.isArray(TABLE[os].loginArgs), `${os}.loginArgs é array`);
}

// tableFor faz fallback para linux em SO desconhecido
assert(tableFor('sunos') === TABLE.linux, 'SO desconhecido cai em linux');
assert(tableFor('win32') === TABLE.win32, 'tableFor win32');

// shellFor preserva o comportamento do antigo shellForOS
assert(shellFor('win32', {}) === 'powershell.exe', 'win sem COMSPEC -> powershell');
assert(shellFor('win32', { COMSPEC: 'cmd.exe' }) === 'cmd.exe', 'win respeita COMSPEC');
assert(shellFor('darwin', {}) === 'zsh', 'mac sem SHELL -> zsh');
assert(shellFor('darwin', { SHELL: '/bin/bash' }) === '/bin/bash', 'mac respeita SHELL');
assert(shellFor('linux', {}) === 'bash', 'linux sem SHELL -> bash');

// loginArgsFor: só o mac usa login shell
assert(JSON.stringify(loginArgsFor('darwin')) === '["-l"]', 'mac -> -l');
assert(JSON.stringify(loginArgsFor('win32')) === '[]', 'win -> sem args');
assert(JSON.stringify(loginArgsFor('linux')) === '[]', 'linux -> sem args');

// shellChoicesFor: candidatos por SO, com shape {id,label,cmd,loginArgs} e ids únicos
for (const os of ['win32', 'darwin', 'linux']) {
  const choices = shellChoicesFor(os);
  assert(Array.isArray(choices) && choices.length > 0, `${os} tem shells`);
  const ids = new Set();
  for (const c of choices) {
    assert(c.id && c.label && c.cmd, `${os} shell tem id/label/cmd`);
    assert(Array.isArray(c.loginArgs), `${os}.${c.id}.loginArgs é array`);
    assert(!ids.has(c.id), `${os} ids de shell únicos`);
    ids.add(c.id);
  }
}
assert(
  shellChoicesFor('win32').some((s) => s.id === 'gitbash'),
  'win oferece Git Bash',
);
assert(shellChoicesFor('sunos').length > 0, 'SO desconhecido cai no fallback (linux)');

// Git Bash é probeOnly (nunca cai no `where bash.exe` = launcher do WSL); WSL tem verify.
const winShells = shellChoicesFor('win32');
assert(winShells.find((s) => s.id === 'gitbash').probeOnly === true, 'gitbash é probeOnly');
assert(Array.isArray(winShells.find((s) => s.id === 'wsl').verify), 'wsl tem verify');

// whichCmdFor: localizador de binário por SO, com fallback 'which'
assert(whichCmdFor('win32') === 'where', 'win -> where');
assert(whichCmdFor('darwin') === 'which', 'mac -> which');
assert(whichCmdFor('linux') === 'which', 'linux -> which');
assert(whichCmdFor('sunos') === 'which', 'SO desconhecido -> which (fallback)');

// booleans batem com o SO atual
assert(isWin === (process.platform === 'win32'), 'isWin');
assert(isMac === (process.platform === 'darwin'), 'isMac');
assert(isLinux === (process.platform === 'linux'), 'isLinux');

// macMenuTemplate: forma mínima esperada
const { macMenuTemplate } = require('../electron/platform.cjs');
const tpl = macMenuTemplate('Carcará Code');
assert(Array.isArray(tpl) && tpl.length >= 2, 'template é array com >=2 menus');
assert(tpl[0].label === 'Carcará Code', 'primeiro menu = nome do app');
const roles = JSON.stringify(tpl);
assert(roles.includes('"quit"'), 'tem role quit (Cmd+Q)');
assert(roles.includes('"copy"') && roles.includes('"paste"'), 'tem copy/paste no Edit');

// fixLoginPath é no-op seguro fora de darwin/linux (não lança, retorna false)
const { fixLoginPath } = require('../electron/platform.cjs');
(async () => {
  const r = await fixLoginPath('win32');
  assert(r === false, 'fixLoginPath no-op em win32 -> false');

  console.log('platform-smoke OK');
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
