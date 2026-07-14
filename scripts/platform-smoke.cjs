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

// opencodeBin: coluna por SO (usada por electron/carcara/binary.cjs)
assert(tableFor('win32').opencodeBin === 'opencode.cmd', 'opencodeBin win32');
assert(tableFor('linux').opencodeBin === 'opencode', 'opencodeBin linux');
assert(tableFor('darwin').opencodeBin === 'opencode', 'opencodeBin darwin');

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

// --- scaffold-core (onboarding) ---
const sc = require('../electron/scaffold-core.cjs');
assert(sc.isScaffoldable([]) === true, 'pasta vazia é scaffoldável');
assert(sc.isScaffoldable(['.git']) === true, 'só .git é scaffoldável');
assert(sc.isScaffoldable(['README.md']) === true, 'só README é scaffoldável');
assert(
  sc.isScaffoldable(['.git', 'README.md', 'LICENSE', '.gitignore']) === true,
  'só-lixo é scaffoldável',
);
assert(sc.isScaffoldable(['package.json']) === false, 'package.json não é scaffoldável');
assert(sc.isScaffoldable(['src']) === false, 'src não é scaffoldável');
assert(sc.isScaffoldable(['index.html']) === false, 'index.html não é scaffoldável');
assert(sc.isScaffoldable(['meus-pdfs']) === false, 'pasta com conteúdo não é scaffoldável');
assert(
  sc.isScaffoldable(['carcara-scaffold-tmp']) === true,
  'nosso tempdir sozinho é scaffoldável',
);
assert(
  sc.isScaffoldable(['.git', 'carcara-scaffold-tmp']) === true,
  '.git + nosso tempdir é scaffoldável',
);
assert(
  sc.isScaffoldable(['carcara-scaffold-tmp', 'package.json']) === false,
  'tempdir + conteúdo real ainda bloqueia',
);
assert(
  JSON.stringify(sc.junkPresent(['carcara-scaffold-tmp', 'README.md'])) ===
    JSON.stringify(['README.md']),
  'junkPresent não conta o nosso tempdir',
);
assert(
  typeof sc.SCAFFOLD_TEMP_DIR === 'string' && sc.SCAFFOLD_TEMP_DIR === 'carcara-scaffold-tmp',
  'SCAFFOLD_TEMP_DIR exportado = carcara-scaffold-tmp (nome npm-válido, não começa com ponto)',
);
assert(!/^[._]/.test(sc.SCAFFOLD_TEMP_DIR), 'SCAFFOLD_TEMP_DIR não começa com . ou _ (regra npm)');
assert(
  sc.commandFor('vite-react')[0] === 'npm' && sc.commandFor('vite-react').includes('react'),
  'vite-react argv',
);
assert(
  sc.commandFor('next').includes('--import-alias') && sc.commandFor('next').includes('@/*'),
  'next tem import-alias (anti-prompt)',
);
assert(sc.commandFor('next').includes('--skip-install'), 'next não instala no scaffold');
assert(
  sc.commandFor('astro').includes('--no-install') &&
    sc.commandFor('astro').includes('--skip-houston'),
  'astro no-install + skip-houston',
);
assert(sc.commandFor('html') === null, 'html removido do catálogo -> null');
assert(sc.commandFor('inexistente') === null, 'id desconhecido -> null');
assert(sc.listStacks().length === 3, '3 cards (react, next, astro; html removido)');
assert(
  sc
    .listStacks()
    .map((s) => s.id)
    .join(',') === 'vite-react,next,astro',
  'ordem e ids dos cards',
);
assert(
  sc.listStacks().every((s) => !('command' in s)),
  'listStacks não vaza argv',
);
const mp = sc.mergePlan(['README.md', '.git'], ['README.md', 'src', 'package.json']);
assert(
  JSON.stringify(mp.backup) === JSON.stringify(['README.md']),
  'merge: README colide -> backup',
);
assert(mp.move.length === 3, 'merge: move tudo que foi gerado');
// sanitizePackageName: nome de pasta -> nome de pacote npm válido
assert(sc.sanitizePackageName('teste') === 'teste', 'sanitize: simples');
assert(sc.sanitizePackageName('Meu Site') === 'meu-site', 'sanitize: espaço/maiúscula');
assert(sc.sanitizePackageName('.hidden') === 'hidden', 'sanitize: tira ponto do início');
assert(sc.sanitizePackageName('_x_') === 'x', 'sanitize: tira _ das pontas');
assert(sc.sanitizePackageName('a  b') === 'a-b', 'sanitize: colapsa separadores');
assert(sc.sanitizePackageName('') === 'app', 'sanitize: vazio -> app');
// placeholderFiles: substitui a demo por placeholder mínimo, com o nome do projeto
const phReact = sc.placeholderFiles('vite-react', 'teste');
assert(
  'src/App.jsx' in phReact && 'src/index.css' in phReact,
  'placeholder react: App.jsx + index.css',
);
assert(phReact['src/App.jsx'].includes('"teste"'), 'placeholder react: inclui o nome do projeto');
assert('src/app/page.tsx' in sc.placeholderFiles('next', 'x'), 'placeholder next: page.tsx');
assert(
  'src/pages/index.astro' in sc.placeholderFiles('astro', 'x'),
  'placeholder astro: index.astro',
);
const phAstroEsc = sc.placeholderFiles('astro', '<b>')['src/pages/index.astro'];
assert(
  !phAstroEsc.includes('<b>') && phAstroEsc.includes('&lt;b&gt;'),
  'placeholder astro: escapa HTML do nome',
);
assert(
  Object.keys(sc.placeholderFiles('inexistente', 'x')).length === 0,
  'placeholder: stack desconhecido -> {}',
);
console.log('scaffold-core OK');

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
