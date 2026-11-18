'use strict';

// Abas do Preview como `WebContentsView` (e não mais `<webview>`). Plano e motivos em
// docs/plano-webcontentsview.md.
//
// Por que existe: o `<webview>` é uma WebContents INTERNA da página do app (guest). A
// visibilidade dele vem do embedder e, no Windows, depois de minimizar/encobrir a janela
// ele voltava "visível" mas com 0 requestAnimationFrame (o GSAP do site travava). A
// `WebContentsView` é uma WebContents de primeiro nível, igual a uma aba do Chrome: a
// visibilidade vem da janela e do `setVisible`, não de um elemento DOM.
//
// Como funciona: o main é o DONO das views (registro abaixo). O renderer só guarda o id
// (= webContents.id) e conversa por IPC; `src/lib/previewHandle.js` embrulha esse IPC num
// objeto com a MESMA forma do pedaço do `<webview>` que o PreviewPanel usa. Os eventos
// de navegação/título/console voltam num canal só (`preview-view:event`).
//
// Regra de ouro das views: elas desenham POR CIMA de todo o DOM do app. Nada do DOM
// aparece sobre a área delas — por isso o renderer esconde a view (com uma foto no lugar)
// quando um menu/modal cobre o preview (src/lib/previewOcclusion.js).

// Só estas mensagens do console do site atravessam pro renderer: as pontes dos scripts
// injetados (selecionar elemento, recorte do print). O resto do console do site não inunda
// o IPC.
const SENTINEL_PREFIX = '__CARCARA_';
function isBridgeMessage(message) {
  return typeof message === 'string' && message.startsWith(SENTINEL_PREFIX);
}

// Retângulo vindo do renderer (px CSS da página do app, já multiplicado pelo zoom do app)
// → bounds inteiros da view. Arredonda pra fora (floor na origem, ceil no fim) pra não
// sobrar fresta de 1px entre a view e a moldura do painel. Retângulo inválido → null.
function toViewBounds(rect) {
  if (!rect) return null;
  const n = (v) => (Number.isFinite(v) ? v : NaN);
  const x = n(rect.x);
  const y = n(rect.y);
  const w = n(rect.width);
  const h = n(rect.height);
  if ([x, y, w, h].some(Number.isNaN)) return null;
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + w);
  const bottom = Math.ceil(y + h);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

// Métodos do webContents que o renderer pode chamar pelo canal genérico. Lista FECHADA:
// o renderer não ganha acesso arbitrário ao webContents do site.
const CALLABLE = new Set([
  'loadURL',
  'reload',
  'reloadIgnoringCache',
  'stop',
  'focus',
  'findInPage',
  'stopFindInPage',
  'setAudioMuted',
  'getURL',
  'getZoomLevel',
  'setZoomLevel',
  'goBack',
  'goForward',
  'disableDeviceEmulation',
  'enableDeviceEmulation',
]);

// Estado de navegação que viaja junto de todo evento (o handle do renderer guarda em
// cache, pra `canGoBack()` continuar síncrono como no <webview>).
function navState(wc) {
  try {
    const h = wc.navigationHistory;
    return { canBack: h.canGoBack(), canFwd: h.canGoForward(), url: wc.getURL() };
  } catch {
    return { canBack: false, canFwd: false, url: '' };
  }
}

// Fábrica do registro. Dependências injetadas (Electron, janela, envio) pra o módulo não
// importar `electron` direto e as partes puras serem testáveis sem ele.
//  - WebContentsView: classe do Electron
//  - getWindow(): BrowserWindow dona (ou null)
//  - send(channel, payload): manda pro renderer da janela
//  - attachChrome(wc): dá "cara de navegador" (menu, F12, Ctrl+F, popups → aba…)
function makePreviewViews({ WebContentsView, getWindow, send, attachChrome }) {
  const reg = new Map(); // id -> { view, kind, projectPath }

  const emit = (id, type, extra) => send('preview-view:event', { id, type, ...extra });

  function wire(id, wc) {
    const nav = () => navState(wc);
    wc.on('did-navigate', (_e, url) => emit(id, 'did-navigate', { ...nav(), url }));
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) =>
      emit(id, 'did-navigate-in-page', { ...nav(), url, isMainFrame }),
    );
    wc.on('page-title-updated', (_e, title) => emit(id, 'page-title-updated', { title }));
    wc.on('page-favicon-updated', (_e, favicons) => emit(id, 'page-favicon-updated', { favicons }));
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false) return; // subframe que falhou não é falha da aba
      emit(id, 'did-fail-load', { errorCode, errorDescription, validatedURL, ...nav() });
    });
    wc.on('did-finish-load', () => emit(id, 'did-finish-load', nav()));
    wc.on('dom-ready', () => emit(id, 'dom-ready', nav()));
    wc.on('found-in-page', (_e, result) => emit(id, 'found-in-page', { result }));
    wc.on('console-message', (...args) => {
      // Electron 33: (event, level, message, line, sourceId). Versões novas: (event) com
      // event.message. Aceita os dois.
      const message = typeof args[2] === 'string' ? args[2] : args[0] && args[0].message;
      if (isBridgeMessage(message)) emit(id, 'console-message', { message });
    });
    wc.on('render-process-gone', () => emit(id, 'crashed', {}));
  }

  function create({ projectPath, partition, url, kind = 'tab' }) {
    const win = getWindow();
    if (!win || win.isDestroyed()) return null;
    const isDevtools = kind === 'devtools';
    const view = new WebContentsView({
      webPreferences: isDevtools
        ? { sandbox: true, contextIsolation: true }
        : {
            partition,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            // O leitor de PDF do Chromium (PDF de `blob:` que o site gera e abre).
            plugins: true,
          },
    });
    const wc = view.webContents;
    const id = wc.id;
    view.setBackgroundColor(isDevtools ? '#1e1e1e' : '#ffffff');
    view.setVisible(false); // nasce escondida: o renderer mostra depois de dar os bounds
    win.contentView.addChildView(view);
    reg.set(id, { view, kind, projectPath: projectPath || null });
    if (!isDevtools) {
      wire(id, wc);
      try {
        attachChrome && attachChrome(wc);
      } catch {}
    }
    wc.once('destroyed', () => {
      const entry = reg.get(id);
      if (entry && entry.view === view) reg.delete(id);
    });
    if (url && !isDevtools) wc.loadURL(url).catch(() => {});
    return id;
  }

  function destroy(id) {
    const entry = reg.get(id);
    if (!entry) return false;
    reg.delete(id);
    const win = getWindow();
    try {
      if (win && !win.isDestroyed()) win.contentView.removeChildView(entry.view);
    } catch {}
    try {
      const wc = entry.view.webContents;
      if (!wc.isDestroyed()) {
        if (wc.isDevToolsOpened()) wc.closeDevTools();
        // A view NÃO fecha a webContents sozinha: sem isto o processo do site fica vivo.
        wc.close();
      }
    } catch {}
    return true;
  }

  function destroyAll() {
    for (const id of [...reg.keys()]) destroy(id);
  }

  function get(id) {
    return reg.get(id) || null;
  }

  function setBounds(id, rect) {
    const entry = reg.get(id);
    const b = toViewBounds(rect);
    if (!entry || !b) return;
    try {
      entry.view.setBounds(b);
    } catch {}
  }

  function setVisible(id, visible) {
    const entry = reg.get(id);
    if (!entry) return;
    try {
      entry.view.setVisible(!!visible);
    } catch {}
  }

  function setRadius(id, radius) {
    const entry = reg.get(id);
    if (!entry) return;
    try {
      entry.view.setBorderRadius(Math.max(0, Math.round(Number(radius) || 0)));
    } catch {}
  }

  async function call(id, method, args) {
    const entry = reg.get(id);
    if (!entry || !CALLABLE.has(method)) return { error: 'not-allowed' };
    const wc = entry.view.webContents;
    if (wc.isDestroyed()) return { error: 'destroyed' };
    try {
      let value;
      if (method === 'goBack') value = wc.navigationHistory.goBack();
      else if (method === 'goForward') value = wc.navigationHistory.goForward();
      else value = await wc[method](...(Array.isArray(args) ? args : []));
      return { value: value === undefined ? null : value, ...navState(wc) };
    } catch (err) {
      return { error: String(err && err.message ? err.message : err) };
    }
  }

  async function exec(id, code) {
    const entry = reg.get(id);
    if (!entry) return { error: 'no-view' };
    const wc = entry.view.webContents;
    if (wc.isDestroyed()) return { error: 'destroyed' };
    try {
      return { value: await wc.executeJavaScript(String(code)) };
    } catch (err) {
      return { error: String(err && err.message ? err.message : err) };
    }
  }

  function count() {
    return reg.size;
  }

  return {
    create,
    destroy,
    destroyAll,
    get,
    setBounds,
    setVisible,
    setRadius,
    call,
    exec,
    count,
  };
}

// Registra os canais IPC do registro. Separado da fábrica pra o smoke reaproveitar a
// fábrica sem ipcMain.
function registerPreviewViewIpc(ipcMain, views) {
  // Síncrono de propósito: o PreviewPanel cria a aba e já usa o id na mesma volta (igual ao
  // getWebContentsId() do <webview>). Criar a view leva poucos ms.
  ipcMain.on('preview-view:create', (e, opts) => {
    e.returnValue = { id: views.create(opts || {}) };
  });
  ipcMain.on('preview-view:destroy', (_e, { id }) => views.destroy(id));
  ipcMain.on('preview-view:bounds', (_e, { id, rect }) => views.setBounds(id, rect));
  ipcMain.on('preview-view:visible', (_e, { id, visible }) => views.setVisible(id, visible));
  ipcMain.on('preview-view:radius', (_e, { id, radius }) => views.setRadius(id, radius));
  ipcMain.handle('preview-view:call', (_e, { id, method, args }) => views.call(id, method, args));
  ipcMain.handle('preview-view:exec', (_e, { id, code }) => views.exec(id, code));
  ipcMain.handle('preview-view:count', () => views.count());
}

module.exports = {
  makePreviewViews,
  registerPreviewViewIpc,
  toViewBounds,
  isBridgeMessage,
  navState,
  CALLABLE,
};
