// scripts/theme-scope-smoke.cjs
// Prova que uma SUBÁRVORE consegue declarar a própria família de cores, nas duas
// direções. Uso: electron scripts/theme-scope-smoke.cjs  (npm run test:themescope)
//
// Por que existe: a área do terminal tem tema próprio (Configurações › aparência do
// terminal) e é pintada com o fundo dele, mas o conteúdo por cima — abas, estado vazio,
// seletor de IA — é UI do app e resolvia as cores pelo tema do ROOT. Com "terminal
// escuro + app claro" saía texto claro sobre fundo quase preto, ilegível (reportado em
// 2026-08-06). O conserto é `terminalSurface()` (src/lib/xtermShared.js) marcando a
// subárvore com `.light`/`.dark`. Isto aqui garante que o CSS sustenta o mecanismo —
// se alguém transformar `.light` de volta em `:root` puro, este teste quebra.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function fail(msg) {
  console.error('ASSERT: ' + msg);
  app.exit(1);
}

const distAssets = path.join(__dirname, '..', 'dist', 'assets');
let cssFile;
try {
  cssFile = fs
    .readdirSync(distAssets)
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(distAssets, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
} catch {
  /* tratado abaixo */
}
if (!cssFile) {
  console.error('ASSERT: nenhum CSS em dist/assets — rode `npm run build` antes.');
  process.exit(1);
}

const css = fs.readFileSync(cssFile, 'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div id="root-dark" class="dark">
  <span id="a">herda do root escuro</span>
  <div id="scoped-light" class="light"><span id="b">subárvore clara</span></div>
</div>
<div id="root-light" class="light">
  <span id="c">herda do root claro</span>
  <div id="scoped-dark" class="dark"><span id="d">subárvore escura</span></div>
</div>`;

const tmp = path.join(os.tmpdir(), `carcara-theme-scope-${process.pid}.html`);
fs.writeFileSync(tmp, html, 'utf8');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 });
  await win.loadFile(tmp);
  const read = await win.webContents.executeJavaScript(`
    (() => {
      const fg = (id) => getComputedStyle(document.getElementById(id))
        .getPropertyValue('--foreground').trim();
      return { a: fg('a'), b: fg('b'), c: fg('c'), d: fg('d') };
    })()
  `);
  try {
    fs.unlinkSync(tmp);
  } catch {}

  console.log('--foreground herdado por nó:', JSON.stringify(read, null, 0));

  const values = new Set(Object.values(read));
  if (values.has('')) return fail('algum nó não resolveu --foreground (CSS não aplicou)');

  // As duas famílias têm de dar valores DIFERENTES, senão o teste não prova nada.
  if (read.a === read.c)
    return fail(`root escuro e root claro deram o mesmo --foreground (${read.a})`);

  // O que o bug quebrava: a subárvore tem de vencer o root, nas DUAS direções.
  if (read.b !== read.c) {
    return fail(`.light dentro de .dark deveria dar o valor claro (${read.c}), deu "${read.b}"`);
  }
  if (read.d !== read.a) {
    return fail(`.dark dentro de .light deveria dar o valor escuro (${read.a}), deu "${read.d}"`);
  }

  console.log('theme-scope smoke OK — subárvore .light/.dark vence o root nas duas direções');
  app.exit(0);
});
