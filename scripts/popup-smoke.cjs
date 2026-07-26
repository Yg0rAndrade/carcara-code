// Smoke do caminho "página do preview pede janela nova → vira aba interna".
// Uso: npm run test:popup   (precisa do Electron: sobe uma janela oculta de verdade)
//
// Por que um smoke de Electron e não só um teste puro: o bug que originou isto era
// invisível pra teste de unidade. O `setWindowOpenHandler` do main estava certo e
// jamais rodava, porque o <webview> das abas não tinha `allowpopups` — o Chromium
// matava o popup dentro do guest. Só um webview REAL prova que o handler dispara.
//
// O smoke monta o webview com o MESMO código do app (src/lib/previewWebview.js) e
// decide com a MESMA política do main (electron/window-open.cjs).
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { decideWindowOpen } = require('../electron/window-open.cjs');

const PARTITION = 'persist:popup-smoke';
let fail = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}`);
  if (!cond) fail++;
};

// PDF mínimo válido (xref calculado) — imita o que um app gera com pdf-lib.
const PDF_JS = `function makePdf(){
  const objs=['<</Type/Catalog/Pages 2 0 R>>','<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '<</Length 45>>\\nstream\\nBT /F1 24 Tf 20 100 Td (HELLO PDF) Tj ET\\nendstream',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let out='%PDF-1.4\\n'; const offs=[];
  objs.forEach((o,i)=>{offs.push(out.length); out+=(i+1)+' 0 obj\\n'+o+'\\nendobj\\n';});
  const x=out.length;
  out+='xref\\n0 '+(objs.length+1)+'\\n0000000000 65535 f \\n';
  for(const o of offs) out+=String(o).padStart(10,'0')+' 00000 n \\n';
  out+='trailer\\n<</Size '+(objs.length+1)+'/Root 1 0 R>>\\nstartxref\\n'+x+'\\n%%EOF';
  return new Uint8Array([...out].map(c=>c.charCodeAt(0)));
}`;

// Página "do usuário": exatamente o que um app faz pra mostrar um PDF que ele gerou.
const PAGE = `<!doctype html><meta charset="utf-8"><title>site</title><body>
<a id="lnk" href="http://127.0.0.1:1/alvo" target="_blank">alvo</a>
<script>
${PDF_JS}
const pdfUrl = URL.createObjectURL(new Blob([makePdf()],{type:'application/pdf'}));
console.log('SMOKE_BLOB ' + pdfUrl);
window.open('http://127.0.0.1:1/aberto-por-window-open','_blank');
window.open(pdfUrl,'_blank','noopener');
document.getElementById('lnk').click();
</script></body>`;

// Host: monta o webview da aba com os atributos REAIS do app (import do módulo do src).
const HOST = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<div id="root" style="position:relative;width:100%;height:400px"></div>
<script type="module">
import { applyTabWebviewAttrs } from '/lib/previewWebview.js';
const mk = (url) => {
  const w = document.createElement('webview');
  applyTabWebviewAttrs(w, ${JSON.stringify(PARTITION)});
  w.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  w.setAttribute('src', url);
  document.getElementById('root').appendChild(w);
  return w;
};
window.mk = mk;
// Abre a "aba interna": é o que o preview:new-tab faz quando o handler manda 'tab'.
window.abrirAba = (url) => new Promise((resolve) => {
  const w = mk(url);
  const fim = (r) => { w.remove(); resolve(r); };
  w.addEventListener('did-finish-load', () => fim('carregou'));
  w.addEventListener('did-fail-load', (e) => fim('falhou:' + e.errorCode + ' ' + e.errorDescription));
  setTimeout(() => fim('timeout'), 8000);
});
</script></body>`;

const firedUrls = [];
let blobUrl = null;
let baixou = false;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/lib/previewWebview.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'previewWebview.js'), 'utf8'));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(u === '/host.html' ? HOST : PAGE);
});

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (decideWindowOpen(url).action === 'tab') firedUrls.push(url);
    return { action: 'deny' };
  });
  contents.on('console-message', (...a) => {
    const msg = typeof a[2] === 'string' ? a[2] : a[0] && a[0].message;
    if (msg && String(msg).startsWith('SMOKE_BLOB ')) blobUrl = String(msg).slice(11);
  });
});

app.whenReady().then(() => {
  // Um PDF que o Chromium não sabe renderizar vira DOWNLOAD — o usuário veria "não fez
  // nada" do mesmo jeito. Marca se algum download começar.
  session.fromPartition(PARTITION).on('will-download', () => {
    baixou = true;
  });
  server.listen(0, '127.0.0.1', () => {
    const porta = server.address().port;
    const win = new BrowserWindow({
      show: false,
      webPreferences: { webviewTag: true, plugins: true },
    });
    win.loadURL(`http://127.0.0.1:${porta}/host.html`);
    win.webContents.once('did-finish-load', async () => {
      await win.webContents.executeJavaScript(`window.mk("http://127.0.0.1:${porta}/page.html")`);
      await new Promise((r) => setTimeout(r, 4000));

      console.log('--- popup vira aba interna ---');
      const temHttp = firedUrls.filter((u) => /^http:/.test(u)).length;
      assert(
        temHttp >= 2,
        `window.open(http) e <a target=_blank> chegam no handler (${temHttp}/2)`,
      );
      assert(
        firedUrls.some((u) => u.startsWith('blob:')),
        'window.open(blob:) chega no handler',
      );
      assert(!!blobUrl, 'a página conseguiu criar o blob');

      console.log('--- a aba interna abre o blob que a outra aba criou ---');
      if (blobUrl) {
        const r = await win.webContents.executeJavaScript(
          `window.abrirAba(${JSON.stringify(blobUrl)})`,
        );
        assert(r === 'carregou', `webview novo na mesma partition carrega o blob (${r})`);
        assert(!baixou, 'o PDF é renderizado no preview, não baixado');
      }

      if (fail) {
        console.error(`\n${fail} falha(s).`);
        app.exit(1);
        return;
      }
      console.log('popup smoke OK');
      app.exit(0);
    });
  });
});

setTimeout(() => {
  console.error('popup smoke: TIMEOUT global');
  app.exit(1);
}, 40000);
