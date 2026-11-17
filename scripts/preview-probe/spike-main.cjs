// Harness isolado da etapa 0 (docs/plano-webcontentsview.md): Electron puro, uma janela
// com um "app" de mentira à esquerda e o site à direita, num WebContentsView OU num
// <webview> (controle). Não carrega nada do Carcará.
//
//   electron scripts/preview-probe/spike-main.cjs --engine=view|webview --url=http://localhost:8081/
//            [--no-occlusion] --user-data-dir=<pasta> --remote-debugging-port=<porta>
//
// --no-occlusion liga o disable-features=CalculateNativeWinOcclusion (o remendo da branch
// reserva/remendo-oclusao-windows), pra medir com e sem.
const { app, BrowserWindow, WebContentsView, webContents } = require('electron');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const ENGINE = arg('engine', 'view');
const URL_ = arg('url', 'http://localhost:8081/');
if (process.argv.includes('--no-occlusion')) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

// Área do site dentro da janela (DIP). A faixa da esquerda é o "app".
const SIDE = 420;
const TOP = 48;

const HOST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>spike-host</title>
<style>
  html,body{margin:0;height:100%;background:#1d1f24;color:#ddd;font:13px system-ui;overflow:hidden}
  #side{position:absolute;left:0;top:0;bottom:0;width:${SIDE}px;padding:12px;box-sizing:border-box}
  #bar{position:absolute;left:${SIDE}px;right:0;top:0;height:${TOP}px;background:#2a2d33}
  #slot{position:absolute;left:${SIDE}px;right:0;top:${TOP}px;bottom:0;background:#333}
  webview{position:absolute;inset:0}
</style></head><body>
<div id="side">app (spike, motor ${ENGINE})<br><span id="mm">mousemove: 0</span></div>
<div id="bar"></div><div id="slot"></div>
<script>
  // Conta mousemove do documento do app (R2.c / P26: o arraste e o toque emulado
  // passando por cima da view ainda chegam aqui?).
  window.__mm = 0; window.__mmLast = null; window.__downs = 0; window.__ups = 0;
  addEventListener('mousemove', (e) => { window.__mm++; window.__mmLast = [e.clientX, e.clientY, e.buttons]; document.getElementById('mm').textContent = 'mousemove: ' + window.__mm; });
  addEventListener('mousedown', () => window.__downs++);
  addEventListener('mouseup', () => window.__ups++);
  if (${JSON.stringify(ENGINE)} === 'webview') {
    const w = document.createElement('webview');
    w.setAttribute('partition', 'persist:spike');
    w.setAttribute('allowpopups', '');
    w.src = ${JSON.stringify(URL_)};
    document.getElementById('slot').appendChild(w);
  }
</script></body></html>`;

let win;
let view;

function layout() {
  if (!view) return;
  const [w, h] = win.getContentSize();
  view.setBounds({ x: SIDE, y: TOP, width: w - SIDE, height: h - TOP });
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    x: 80,
    y: 60,
    width: 1400,
    height: 860,
    backgroundColor: '#1d1f24',
    webPreferences: {
      webviewTag: ENGINE === 'webview',
      contextIsolation: false,
      nodeIntegration: false,
    },
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HOST_HTML));
  if (ENGINE === 'view') {
    view = new WebContentsView({
      webPreferences: {
        partition: 'persist:spike',
        sandbox: true,
        contextIsolation: true,
        plugins: true,
      },
    });
    view.setBackgroundColor('#333333');
    win.contentView.addChildView(view);
    layout();
    win.on('resize', layout);
    view.webContents.loadURL(URL_);
  }
  // Canal de comando da sonda: POST JSON em 127.0.0.1:<--cmd-port>. (stdin/stdout do
  // electron.exe no Windows não serve: é app de GUI e o stdin não chega no main.)
  require('node:http')
    .createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let reply;
        try {
          reply = { ok: true, value: await command(JSON.parse(body)) };
        } catch (e) {
          reply = { ok: false, error: String(e && e.stack ? e.stack : e) };
        }
        res.end(JSON.stringify(reply));
      });
    })
    .listen(Number(arg('cmd-port', 9299)), '127.0.0.1');
});

function siteContents() {
  if (view) return view.webContents;
  return webContents.getAllWebContents().find((c) => c.getType() === 'webview');
}

async function command(c) {
  const wc = siteContents();
  switch (c.cmd) {
    case 'info':
      return {
        engine: ENGINE,
        type: wc && wc.getType(),
        hwnd: win.getNativeWindowHandle().readBigUInt64LE().toString(),
        content: win.getContentBounds(),
        view: view ? view.getBounds() : null,
        zoom: wc && wc.getZoomFactor(),
      };
    case 'setVisible':
      view.setVisible(!!c.value);
      return view.getVisible();
    case 'emulate':
      // P24: o modo dispositivo do Chrome. viewSize = aparelho, scale = encolher no painel.
      wc.enableDeviceEmulation({
        screenPosition: 'mobile',
        screenSize: { width: c.w, height: c.h },
        viewSize: { width: c.w, height: c.h },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: 0,
        scale: c.scale,
      });
      if (view && c.bounds) view.setBounds(c.bounds);
      return true;
    case 'noEmulate':
      wc.disableDeviceEmulation();
      layout();
      return true;
    case 'capture': {
      const img = await wc.capturePage(c.rect);
      return img.getSize();
    }
    case 'zoom':
      wc.setZoomFactor(c.value);
      return wc.getZoomFactor();
    case 'touch': {
      // P26: emulação de toque pelo debugger, igual main.js previewEmulateTouch.
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: !!c.value,
        maxTouchPoints: 5,
      });
      await wc.debugger.sendCommand('Emulation.setEmitTouchEventsForMouse', {
        enabled: !!c.value,
        configuration: 'mobile',
      });
      return true;
    }
    case 'eval':
      return wc.executeJavaScript(c.code);
    default:
      throw new Error('comando desconhecido: ' + c.cmd);
  }
}
