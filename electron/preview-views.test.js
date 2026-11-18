import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const { makePreviewViews, toViewBounds, isBridgeMessage } = require('./preview-views.cjs');

describe('toViewBounds', () => {
  it('arredonda pra fora (sem fresta de 1px)', () => {
    expect(toViewBounds({ x: 10.4, y: 20.6, width: 100.2, height: 50.1 })).toEqual({
      x: 10,
      y: 20,
      width: 101,
      height: 51,
    });
  });
  it('retângulo inválido vira null', () => {
    expect(toViewBounds(null)).toBe(null);
    expect(toViewBounds({ x: 0, y: 0, width: NaN, height: 1 })).toBe(null);
  });
  it('tamanho negativo vira 0', () => {
    expect(toViewBounds({ x: 5, y: 5, width: -3, height: 2 }).width).toBe(0);
  });
});

describe('isBridgeMessage', () => {
  it('só as pontes dos scripts injetados atravessam', () => {
    expect(isBridgeMessage('__CARCARA_GRAB__{"md":"x"}')).toBe(true);
    expect(isBridgeMessage('__CARCARA_CROP__{}')).toBe(true);
    expect(isBridgeMessage('erro qualquer do site')).toBe(false);
    expect(isBridgeMessage(undefined)).toBe(false);
  });
});

// Dublês mínimos do Electron.
let nextId = 100;
class FakeWc extends EventEmitter {
  constructor() {
    super();
    this.id = nextId++;
    this.closed = false;
    this.loaded = null;
    this.navigationHistory = {
      canGoBack: () => true,
      canGoForward: () => false,
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
  }
  isDestroyed() {
    return this.closed;
  }
  isDevToolsOpened() {
    return false;
  }
  close() {
    this.closed = true;
    this.emit('destroyed');
  }
  getURL() {
    return this.loaded || '';
  }
  loadURL(u) {
    this.loaded = u;
    return Promise.resolve();
  }
  reload() {}
  executeJavaScript(code) {
    return Promise.resolve('ran:' + code);
  }
}
class FakeView {
  constructor(opts) {
    this.opts = opts;
    this.webContents = new FakeWc();
    this.visible = true;
    this.bounds = null;
  }
  setBackgroundColor() {}
  setVisible(v) {
    this.visible = v;
  }
  setBounds(b) {
    this.bounds = b;
  }
  setBorderRadius(r) {
    this.radius = r;
  }
}
function makeWin() {
  const children = new Set();
  return {
    children,
    isDestroyed: () => false,
    contentView: {
      addChildView: (v) => children.add(v),
      removeChildView: (v) => children.delete(v),
    },
  };
}

function setup() {
  const win = makeWin();
  const sent = [];
  const attachChrome = vi.fn();
  const views = makePreviewViews({
    WebContentsView: FakeView,
    getWindow: () => win,
    send: (ch, p) => sent.push([ch, p]),
    attachChrome,
  });
  return { win, sent, attachChrome, views };
}

describe('makePreviewViews', () => {
  it('cria escondida, com partition e plugins, e navega', () => {
    const { win, views, attachChrome } = setup();
    const id = views.create({ projectPath: '/p', partition: 'persist:x', url: 'http://a/' });
    const { view } = views.get(id);
    expect(win.children.has(view)).toBe(true);
    expect(view.visible).toBe(false);
    expect(view.opts.webPreferences.partition).toBe('persist:x');
    expect(view.opts.webPreferences.plugins).toBe(true);
    expect(view.webContents.loaded).toBe('http://a/');
    expect(attachChrome).toHaveBeenCalledWith(view.webContents);
  });

  it('host do DevTools não navega nem ganha a cara de navegador', () => {
    const { views, attachChrome } = setup();
    const id = views.create({ kind: 'devtools', url: 'http://nao/' });
    expect(views.get(id).view.webContents.loaded).toBe(null);
    expect(attachChrome).not.toHaveBeenCalled();
  });

  it('destroy tira da janela e FECHA a webContents (senão o processo fica vivo)', () => {
    const { win, views } = setup();
    const id = views.create({ url: 'http://a/' });
    const { view } = views.get(id);
    expect(views.destroy(id)).toBe(true);
    expect(win.children.has(view)).toBe(false);
    expect(view.webContents.closed).toBe(true);
    expect(views.count()).toBe(0);
    expect(views.destroy(id)).toBe(false);
  });

  it('destroyAll limpa tudo (renderer recarregou)', () => {
    const { views } = setup();
    views.create({ url: 'http://a/' });
    views.create({ url: 'http://b/' });
    views.destroyAll();
    expect(views.count()).toBe(0);
  });

  it('repassa eventos com o estado de navegação; console só as pontes', () => {
    const { views, sent } = setup();
    const id = views.create({ url: 'http://a/' });
    const wc = views.get(id).view.webContents;
    wc.emit('did-navigate', {}, 'http://a/b');
    wc.emit('console-message', {}, 0, 'barulho do site', 1, 'x');
    wc.emit('console-message', {}, 0, '__CARCARA_GRAB__{}', 1, 'x');
    wc.emit('did-fail-load', {}, -105, 'x', 'http://sub/', false); // subframe: ignora
    const evs = sent.filter(([ch]) => ch === 'preview-view:event').map(([, p]) => p);
    expect(evs[0]).toMatchObject({ id, type: 'did-navigate', url: 'http://a/b', canBack: true });
    expect(evs.filter((e) => e.type === 'console-message')).toHaveLength(1);
    expect(evs.some((e) => e.type === 'did-fail-load')).toBe(false);
  });

  it('call só aceita a lista fechada de métodos', async () => {
    const { views } = setup();
    const id = views.create({ url: 'http://a/' });
    expect(await views.call(id, 'executeJavaScript', ['x'])).toEqual({ error: 'not-allowed' });
    expect(await views.call(id, 'getURL')).toMatchObject({ value: 'http://a/' });
    await views.call(id, 'goBack');
    expect(views.get(id).view.webContents.navigationHistory.goBack).toHaveBeenCalled();
  });

  it('bounds, visibilidade e raio chegam na view', () => {
    const { views } = setup();
    const id = views.create({ url: 'http://a/' });
    views.setBounds(id, { x: 1.5, y: 2, width: 10, height: 10 });
    views.setVisible(id, true);
    views.setRadius(id, 12.4);
    const { view } = views.get(id);
    expect(view.bounds).toEqual({ x: 1, y: 2, width: 11, height: 10 });
    expect(view.visible).toBe(true);
    expect(view.radius).toBe(12);
  });
});
