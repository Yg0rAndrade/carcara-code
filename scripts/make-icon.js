// A partir do logo.svg original (traçado, com viewBox largo e sobra de branco),
// gera dois artefatos com o carcará CENTRALIZADO num quadrado:
//   - src/assets/logo.svg  -> usado na interface (bolinha da barra lateral)
//   - build/icon.png       -> ícone da janela/taskbar (256px, fundo transparente)
//
// Não há conversor de SVG no sistema, então usamos o próprio Electron (offscreen):
// medimos o desenho com getBBox() e recortamos um viewBox quadrado e justo.
//   uso:  npx electron scripts/make-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZE = 256;
const root = path.join(__dirname, '..');
const srcSvg = fs.readFileSync(path.join(root, 'logo.svg'), 'utf8');
// Conteúdo interno do SVG (o <g>...</g> com o path).
const inner = srcSvg.replace(/[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>[\s\S]*$/i, '');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true },
  });

  // 1) Mede a caixa real do desenho dentro do SVG original.
  const measureHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0">
    <svg id="s" xmlns="http://www.w3.org/2000/svg" width="500" height="500"
      viewBox="0 0 2206 1920">${inner}</svg></body>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(measureHtml));
  await new Promise((r) => setTimeout(r, 400));
  const bbox = await win.webContents.executeJavaScript(
    `(() => { const b = document.getElementById('s').getBBox();
       return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`,
  );

  // 2) Monta um viewBox quadrado e centralizado, com ~14% de respiro.
  const side = Math.max(bbox.w, bbox.h) * 1.16;
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const vb = `${cx - side / 2} ${cy - side / 2} ${side} ${side}`;

  // 3) Salva o logo.svg normalizado (quadrado) pra interface.
  const normSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="#000000">${inner}</svg>\n`;
  fs.mkdirSync(path.join(root, 'src', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'assets', 'logo.svg'), normSvg);

  // 4) Rasteriza esse SVG normalizado pro ícone PNG.
  const iconHtml = `<!doctype html><meta charset="utf-8"><body style="margin:0">
    <div style="width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;background:transparent">
      <svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"
        viewBox="${vb}" fill="#000000">${inner}</svg></div></body>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(iconHtml));
  await new Promise((r) => setTimeout(r, 400));

  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), img.toPNG());
  console.log('ok ->', vb, img.getSize());

  app.quit();
});
