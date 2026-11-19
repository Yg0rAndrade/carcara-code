// "Superfície" de uma aba do Preview: o que mostra o site. Dois motores com a MESMA forma:
//
//  - 'view'    (padrão): WebContentsView no processo main, por IPC (electron/preview-views.cjs).
//  - 'webview' (reserva): o <webview> de antes, pra rollback sem release nova
//               (`"previewEngine": "webview"` no config.json). Sai na 0.1.20.
//
// A forma é a do pedaço do <webview> que o PreviewPanel sempre usou (addEventListener,
// executeJavaScript, canGoBack, reload, findInPage…), mais três verbos que dependem do motor:
//   show(bool)            mostra/esconde
//   layout(box, vp, …)    encaixa no painel (computador ou aparelho)
//   destroy()             fecha de vez
// Assim o PreviewPanel não sabe qual motor está rodando.

import { applyTabWebviewAttrs } from './previewWebview.js';
import { applyViewport, viewGeometry } from './webviewChrome.js';

export const ENGINES = ['view', 'webview'];
export function normalizeEngine(v) {
  return ENGINES.includes(v) ? v : 'view';
}

// ---------- motor 'view' ----------

// Um listener global de eventos pra todas as views: o main manda { id, type, ... }.
const handles = new Map(); // id -> handle
let wired = false;
function wireEvents(api) {
  if (wired) return;
  wired = true;
  api.on('preview-view:event', (ev) => {
    const h = ev && handles.get(ev.id);
    if (h) h._dispatch(ev);
  });
}

// Compara dois retângulos/objetos simples (evita IPC repetido a cada quadro).
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createViewSurface({ api, partition, projectPath, url, kind = 'tab' }) {
  wireEvents(api);
  const pv = api.previewView;
  const res = pv.create({ projectPath, partition, url, kind }) || {};
  const id = res.id;
  if (id == null) throw new Error('preview-view: falha ao criar a view');

  const listeners = new Map(); // type -> Set<fn>
  const state = {
    url: url || '',
    canBack: false,
    canFwd: false,
    shown: false,
    bounds: null,
    emulation: undefined, // undefined = nunca aplicado; null = computador
    radius: 0,
    destroyed: false,
  };

  const takeNav = (ev) => {
    if (typeof ev.canBack === 'boolean') state.canBack = ev.canBack;
    if (typeof ev.canFwd === 'boolean') state.canFwd = ev.canFwd;
    if (ev.url) state.url = ev.url;
  };
  const call = (method, ...args) => {
    if (state.destroyed) return Promise.resolve(null);
    return pv.call(id, method, args).then((r) => {
      if (r) takeNav(r);
      return r;
    });
  };

  const h = {
    kind: 'view',
    id,
    _dispatch(ev) {
      takeNav(ev);
      // Mesma forma do evento do <webview> (e.url, e.title, e.favicons, e.errorCode, …).
      const set = listeners.get(ev.type);
      if (!set) return;
      for (const fn of [...set]) {
        if (fn._once) set.delete(fn);
        try {
          fn(ev);
        } catch {}
      }
    },
    addEventListener(type, fn, opts) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      if (opts && opts.once) fn._once = true;
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    getWebContentsId: () => id,
    getURL: () => state.url,
    canGoBack: () => state.canBack,
    canGoForward: () => state.canFwd,
    goBack: () => call('goBack'),
    goForward: () => call('goForward'),
    reload: () => call('reload'),
    reloadIgnoringCache: () => call('reloadIgnoringCache'),
    loadURL(u) {
      state.url = u;
      return call('loadURL', u);
    },
    set src(u) {
      h.loadURL(u);
    },
    get src() {
      return state.url;
    },
    focus: () => call('focus'),
    findInPage: (text, opts) => call('findInPage', text, opts || {}),
    stopFindInPage: (action) => call('stopFindInPage', action || 'clearSelection'),
    setAudioMuted: (muted) => call('setAudioMuted', !!muted),
    getZoomLevel: () => call('getZoomLevel').then((r) => (r && r.value) || 0),
    setZoomLevel: (lvl) => call('setZoomLevel', lvl),
    // Promise que REJEITA no erro, igual ao <webview> (os .catch do PreviewPanel contam com isso).
    executeJavaScript(code) {
      if (state.destroyed) return Promise.reject(new Error('destroyed'));
      return pv.exec(id, code).then((r) => {
        if (!r || r.error) throw new Error((r && r.error) || 'exec');
        return r.value;
      });
    },
    isShown: () => state.shown,
    show(on) {
      on = !!on;
      if (state.shown === on || state.destroyed) return;
      state.shown = on;
      pv.setVisible(id, on);
    },
    // box: retângulo do painel em px CSS do app (getBoundingClientRect). Só manda IPC no
    // que mudou, então pode ser chamado a cada quadro.
    layout(box, viewport, custom, opts) {
      if (state.destroyed || !box) return;
      const g = viewGeometry(box, viewport, custom, { ...opts, zoom: pv.zoomFactor() });
      if (g.bounds && !same(g.bounds, state.bounds)) {
        state.bounds = g.bounds;
        pv.setBounds(id, g.bounds);
      }
      if (!same(g.emulation, state.emulation)) {
        const had = state.emulation;
        state.emulation = g.emulation;
        if (g.emulation) call('enableDeviceEmulation', g.emulation);
        else if (had) call('disableDeviceEmulation');
      }
      if (g.radius !== state.radius) {
        state.radius = g.radius;
        pv.setRadius(id, g.radius);
      }
    },
    // Igual ao layout, mas reenvia tudo (bounds, modo celular, cantos) mesmo que pareça
    // igual. Usado pelo Atualizar: crava a geometria atual caso a view tenha ficado fora.
    relayout(box, viewport, custom, opts) {
      state.bounds = null;
      state.emulation = undefined;
      state.radius = -1;
      h.layout(box, viewport, custom, opts);
    },
    // Retângulo atual da view em px CSS do app (pra conta do recorte do print / oclusão).
    cssRect() {
      const b = state.bounds;
      if (!b) return null;
      const z = pv.zoomFactor() || 1;
      return { x: b.x / z, y: b.y / z, width: b.width / z, height: b.height / z };
    },
    // Escala site→view (aparelho encolhido): px CSS do site × isto = DIP da view.
    pageScale() {
      return (state.emulation && state.emulation.scale) || pv.zoomFactor() || 1;
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      handles.delete(id);
      listeners.clear();
      pv.destroy(id);
    },
  };
  handles.set(id, h);
  return h;
}

// ---------- motor 'webview' (reserva) ----------

export function createWebviewSurface({ container, partition, url }) {
  const w = document.createElement('webview');
  // Isola a sessão do projeto e libera os popups pro handler do main (que os transforma
  // em aba interna). Precisa vir ANTES de anexar/navegar.
  applyTabWebviewAttrs(w, partition);
  w.style.position = 'absolute';
  w.style.inset = '0';
  w.style.width = '100%';
  w.style.height = '100%';
  w.style.background = '#fff';
  w.style.display = 'none';
  container.appendChild(w);
  w.kind = 'webview';
  w.isShown = () => w.style.display !== 'none';
  w.show = (on) => {
    w.style.display = on ? 'flex' : 'none';
  };
  // O <webview> mede o próprio pai (applyViewport); o box é ignorado.
  w.layout = (_box, viewport, custom, opts) => applyViewport(w, viewport, custom, opts);
  w.relayout = w.layout;
  w.cssRect = () => {
    const r = w.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };
  w.pageScale = () => {
    const m = /scale\(([\d.]+)\)/.exec(w.style.transform || '');
    return m ? Number(m[1]) : 1;
  };
  w.destroy = () => {
    try {
      w.remove();
    } catch {}
  };
  if (url) {
    try {
      w.src = url;
    } catch {}
  }
  return w;
}

export function createSurface(engine, opts) {
  return normalizeEngine(engine) === 'webview'
    ? createWebviewSurface(opts)
    : createViewSurface(opts);
}
