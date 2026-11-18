// Smoke do Preview com WebContentsView, no APP DE VERDADE (npm run test:previewview).
//
// Sobe o Carcará deste repositório com um perfil SEPARADO (--user-data-dir temporário: o
// config.json do usuário não é tocado e o app instalado pode estar aberto) e um projeto de
// teste (servidor Node mínimo com `npm run dev`). Pilota tudo pelo DevTools Protocol, com o
// WebSocket nativo do Node 22+ — sem puppeteer. Ver DESAFIOS.md ("Dirigir o app inteiro pelo
// DevTools Protocol").
//
// Prova, nesta ordem: a aba nasce como view (alvo CDP 'page', não 'webview') e anima;
// algo do app por cima vira foto e some; menu de verdade idem; Ctrl+F conta resultados;
// recorte do print abre o anotador; window.open vira aba interna; F12 cria/fecha o host do
// DevTools; fechar aba fecha a view; minimizar/restaurar volta animando; recarregar a página
// do app não deixa view órfã; modo celular dá a largura do aparelho e (hover: none).
//
// Uso: node scripts/preview-view-smoke.cjs [--engine=view|webview] [--keep]
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENGINE = (process.argv.find((a) => a.startsWith('--engine=')) || '').slice(9) || 'view';
const KEEP = process.argv.includes('--keep');
// --hold: para depois da carga e deixa o app aberto 10 min (depurar com CDP na --port).
const HOLD = process.argv.includes('--hold');
// Porta de depuração: livre a cada rodada (uma porta presa por processo morto travava a 9333).
const PORT =
  Number((process.argv.find((a) => a.startsWith('--port=')) || '').slice(7)) ||
  9400 + Math.floor(Math.random() * 500);

let fail = 0;
const ok = (cond, msg, extra) => {
  console.log(
    `  ${cond ? 'ok   ' : 'FALHA'} ${msg}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`,
  );
  if (!cond) fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- projeto de teste ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-pv-'));
const proj = path.join(tmp, 'site');
const ud = path.join(tmp, 'ud');
fs.mkdirSync(proj);
fs.mkdirSync(ud);
fs.writeFileSync(
  path.join(proj, 'package.json'),
  JSON.stringify({ name: 'site', private: true, scripts: { dev: 'node server.js' } }),
);
fs.writeFileSync(
  path.join(proj, 'server.js'),
  `const http = require('http');
const port = Number(process.env.PORT) || 5599;
const page = (title, body) => '<!doctype html><meta charset="utf-8"><title>' + title + '</title>' +
  '<body style="margin:0;font:16px sans-serif;height:3000px">' + body + '</body>';
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url.startsWith('/two')) return res.end(page('two', '<h1>segunda</h1>'));
  res.end(page('one', '<h1 id="h">alfa beta alfa</h1><a id="blank" href="/two" target="_blank">nova</a>' +
    '<script>window.__raf=0;(function f(){window.__raf++;requestAnimationFrame(f)})();</script>'));
}).listen(port, '127.0.0.1', () => console.log('Local: http://localhost:' + port + '/'));
`,
);
fs.writeFileSync(
  path.join(ud, 'config.json'),
  JSON.stringify({ setupDone: true, language: 'pt', projects: [proj], previewEngine: ENGINE }),
);

// ---------- CDP ----------
async function targets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch {
    return [];
  }
}
async function waitTarget(pred, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = (await targets()).find(pred);
    if (t) return t;
    await sleep(250);
  }
  return null;
}
function connect(t) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    let seq = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    ws.onerror = reject;
    ws.onopen = () => {
      const send = (method, params = {}) =>
        new Promise((res) => {
          const id = ++seq;
          pending.set(id, res);
          ws.send(JSON.stringify({ id, method, params }));
        });
      // Avalia com teto de tempo: um alvo congelado nunca responde (DESAFIOS).
      const ev = async (expr, ms = 6000) => {
        const r = await Promise.race([
          send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
          sleep(ms).then(() => ({ timeout: true })),
        ]);
        if (r.timeout) return { __timeout: true };
        return r.result && r.result.result ? r.result.result.value : undefined;
      };
      resolve({ send, ev, close: () => ws.close() });
    };
  });
}
async function until(fn, ms = 8000, step = 150) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(step);
  }
  return v;
}
const siteTarget =
  (pathPart = '/') =>
  (t) =>
    /^http:\/\/(localhost|127\.0\.0\.1)/.test(t.url) &&
    new URL(t.url).pathname.startsWith(pathPart) &&
    (pathPart !== '/' || !t.url.includes('/two'));

// rAF por segundo + visibilidade, medidos no site.
const RAF_EXPR = `new Promise(r=>{const a=window.__raf;setTimeout(()=>r({raf:window.__raf-a,vis:document.visibilityState}),1000)})`;

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const electron = require(path.join(ROOT, 'node_modules', 'electron'));
  const proc = spawn(electron, ['.', `--user-data-dir=${ud}`, `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));

  try {
    console.log(`motor: ${ENGINE}`);
    const appT = await waitTarget(
      (t) => t.type === 'page' && /index\.html|localhost:5173/.test(t.url),
    );
    ok(!!appT, 'app abriu');
    if (!appT) throw new Error('sem app');
    const app = await connect(appT);
    await until(() => app.ev(`!!document.querySelector('[data-rail-key]')`), 20000);
    await app.ev(`document.querySelector('[data-rail-key]').click()`);

    // 1. a aba nasce e anima
    const siteT = await waitTarget(siteTarget('/'), 60000);
    ok(!!siteT, 'site abriu no preview', siteT && siteT.type);
    if (!siteT) throw new Error('sem site\n' + log.slice(-2000));
    if (ENGINE === 'view') ok(siteT.type === 'page', "alvo CDP é 'page' (view), não 'webview'");
    const site = await connect(siteT);
    await until(() => site.ev(`document.readyState === 'complete'`));
    await sleep(800);
    if (HOLD) {
      console.log(`segurando o app aberto (porta ${PORT})...`);
      await sleep(600000);
    }
    const r1 = await site.ev(RAF_EXPR);
    ok(r1 && r1.raf > 20 && r1.vis === 'visible', 'anima na carga', r1);
    if (ENGINE === 'view') {
      ok((await app.ev(`window.api.previewView.count()`)) === 1, '1 view no registro');
      const wh = await site.ev(`[innerWidth, innerHeight]`);
      const box = await app.ev(
        `(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.className==='absolute inset-0'&&d.parentElement&&d.parentElement.className.includes('isolate'));const r=c.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()`,
      );
      ok(
        Math.abs(wh[0] - box[0]) <= 3 && Math.abs(wh[1] - box[1]) <= 3,
        'view ocupa o painel (innerWidth/Height = painel)',
        { site: wh, painel: box },
      );
    }

    // 2. oclusão genérica: uma camada do app por cima
    if (ENGINE === 'view') {
      await app.ev(
        `(()=>{const d=document.createElement('div');d.id='__cover';d.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4)';document.body.appendChild(d)})()`,
      );
      const hid = await until(async () => (await site.ev(`document.visibilityState`)) === 'hidden');
      ok(hid, 'camada do app por cima → view escondida');
      ok(
        await app.ev(`!!document.querySelector('img[src^="data:image"]')`),
        'foto no lugar da view',
      );
      await app.ev(`document.getElementById('__cover').remove()`);
      const back = await until(
        async () => (await site.ev(`document.visibilityState`)) === 'visible',
      );
      ok(back, 'camada saiu → view volta');
      await sleep(500);
      const r2 = await site.ev(RAF_EXPR);
      ok(r2 && r2.raf > 20, 'volta animando', r2);

      // menu de verdade (câmera)
      await app.ev(`document.querySelector('[aria-haspopup="menu"]').click()`);
      const hid2 = await until(
        async () => (await site.ev(`document.visibilityState`)) === 'hidden',
      );
      ok(hid2, 'menu da câmera aberto → view escondida');
      await app.ev(`document.querySelector('[aria-haspopup="menu"]').click()`);
      ok(
        await until(async () => (await site.ev(`document.visibilityState`)) === 'visible'),
        'menu fechou → view volta',
      );
    }

    // 3. Ctrl+F (foco no app)
    await app.ev(
      `window.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true}))`,
    );
    const findIn = await until(() =>
      app.ev(
        `!!document.activeElement && document.activeElement.tagName==='INPUT' && document.activeElement.placeholder!==''`,
      ),
    );
    ok(findIn, 'Ctrl+F abre a busca');
    await app.ev(
      `(()=>{const i=document.activeElement;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'alfa');i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
    const count = await until(async () => {
      const t = await app.ev(
        `(()=>{const i=document.activeElement;const s=i&&i.parentElement&&i.parentElement.querySelector('span');return s?s.textContent:''})()`,
      );
      return /\/2$/.test(t || '') ? t : null;
    });
    ok(!!count, 'busca acha 2 "alfa"', count);
    if (ENGINE === 'view') {
      const vis = await site.ev(`document.visibilityState`);
      ok(vis === 'visible', 'a busca NÃO cobre o site (fica na barra de URL)', vis);
    }
    await app.ev(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
    );

    // 4. recorte do print → anotador
    await app.ev(
      `window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true}))`,
    );
    const cropOn = await until(() => site.ev(`!!document.querySelector('[data-carcara-crop]')`));
    ok(cropOn, 'Ctrl+P põe a camada de recorte DENTRO da página');
    const M = (type, x, y) =>
      site.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await M('mousePressed', 30, 30);
    await M('mouseMoved', 120, 100);
    await M('mouseReleased', 120, 100);
    const annot = await until(() => app.ev(`!!document.querySelector('.z-\\\\[200\\\\]')`), 8000);
    ok(annot, 'soltar o recorte abre o anotador');
    ok(
      !(await site.ev(`!!document.querySelector('[data-carcara-crop]')`)),
      'camada saiu da página',
    );
    await app.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(400);

    // 5. window.open → aba interna
    await site.ev(`document.getElementById('blank').click()`);
    const twoT = await waitTarget(siteTarget('/two'), 10000);
    ok(!!twoT, 'link target=_blank vira aba interna');
    if (ENGINE === 'view') {
      ok((await app.ev(`window.api.previewView.count()`)) === 2, '2 views no registro');
      ok(
        (await targets()).filter(
          (t) => t.type === 'page' && !/index\.html/.test(t.url) && /two/.test(t.url),
        ).length === 1,
        'nenhuma janela nativa nova',
      );
    }
    // fecha a aba "two" com o botão do meio na tira
    await app.ev(
      `(()=>{const c=document.querySelector('[title="two"]');c.dispatchEvent(new MouseEvent('auxclick',{button:1,bubbles:true}))})()`,
    );
    const closed = await until(async () => !(await targets()).some(siteTarget('/two')));
    ok(closed, 'fechar a aba fecha a webContents dela');
    if (ENGINE === 'view')
      ok((await app.ev(`window.api.previewView.count()`)) === 1, 'registro volta a 1');

    // 6. F12 com o foco no site → DevTools encaixado
    if (ENGINE === 'view') {
      await site.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'F12',
        code: 'F12',
        windowsVirtualKeyCode: 123,
      });
      const dt = await until(async () => (await app.ev(`window.api.previewView.count()`)) === 2);
      ok(dt, 'F12 cria o host do DevTools (2ª view)');
      await sleep(800);
      const site2 = await connect(await waitTarget(siteTarget('/')));
      await site2.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'F12',
        code: 'F12',
        windowsVirtualKeyCode: 123,
      });
      const dtClosed = await until(
        async () => (await app.ev(`window.api.previewView.count()`)) === 1,
      );
      ok(dtClosed, 'F12 de novo fecha e destrói o host');
      site2.close();
    }

    // 7. minimizar / restaurar
    const browser = await connect({
      webSocketDebuggerUrl: (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json())
        .webSocketDebuggerUrl,
    });
    const win = await browser.send('Browser.getWindowForTarget', { targetId: appT.id });
    const windowId = win.result && win.result.windowId;
    for (let i = 1; i <= 3; i++) {
      await browser.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'minimized' },
      });
      await sleep(2500);
      await browser.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'normal' },
      });
      await sleep(1200);
      const s3 = await connect(await waitTarget(siteTarget('/')));
      const r3 = await s3.ev(RAF_EXPR);
      ok(r3 && r3.raf > 20 && r3.vis === 'visible', `minimizar/restaurar #${i}: anima`, r3);
      s3.close();
    }
    browser.close();

    // 8. recarregar a página do app não deixa view órfã; modo celular
    if (ENGINE === 'view') {
      await app.ev(`localStorage.setItem('previewViewport','iphone-15'); location.reload()`, 3000);
      app.close();
      await sleep(2500);
      const orphan = (await targets()).filter(siteTarget('/')).length;
      ok(orphan === 0, 'recarregar o app fecha as views (sem órfã)', orphan);
      const app2 = await connect(
        await waitTarget((t) => t.type === 'page' && /index\.html/.test(t.url)),
      );
      await until(() => app2.ev(`!!document.querySelector('[data-rail-key]')`), 20000);
      await app2.ev(`document.querySelector('[data-rail-key]').click()`);
      const s4t = await waitTarget(siteTarget('/'), 30000);
      const s4 = await connect(s4t);
      await until(() => s4.ev(`document.readyState === 'complete'`));
      const dev = await until(async () => {
        const v = await s4.ev(`({w: innerWidth, hover: matchMedia('(hover: none)').matches})`);
        return v && v.w === 393 && v.hover ? v : null;
      }, 8000);
      ok(!!dev, 'modo celular: site com 393px e (hover: none)', dev);
      const r4 = await s4.ev(RAF_EXPR);
      ok(r4 && r4.raf > 20 && r4.vis === 'visible', 'modo celular anima', r4);
      s4.close();
      app2.close();
    }
    site.close();
  } catch (e) {
    ok(false, 'exceção: ' + (e && e.message));
  } finally {
    // Mata a ÁRVORE: no Windows `proc.kill()` deixa os filhos do Electron (e a porta de
    // depuração) vivos — a próxima rodada não consegue abrir a 9333 (DESAFIOS, killTree).
    if (process.platform === 'win32') {
      require('child_process').spawnSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)]);
    } else proc.kill('SIGKILL');
    await sleep(800);
    if (!KEEP) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
      } catch {
        /* o Windows ainda segura algum arquivo do perfil; a pasta é temporária */
      }
    }
    console.log(fail ? `\n${fail} FALHA(S)` : '\ntudo ok');
    if (fail && log) console.log('--- log do app (fim) ---\n' + log.slice(-1500));
    process.exit(fail ? 1 : 0);
  }
})();
