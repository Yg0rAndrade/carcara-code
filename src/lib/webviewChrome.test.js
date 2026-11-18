import { describe, it, expect } from 'vitest';
import {
  applyViewport,
  viewGeometry,
  stepZoom,
  zoomPercent,
  ZOOM_MIN,
  ZOOM_MAX,
} from './webviewChrome.js';

// Dublê do <webview>: só o que applyViewport toca.
const fakeWebview = () => ({ style: {} });

describe('applyViewport', () => {
  it('computador ocupa a área inteira', () => {
    const w = fakeWebview();
    applyViewport(w, 'desktop');
    expect(w.style).toMatchObject({ width: '100%', height: '100%', transform: 'none' });
  });

  it('aparelho: tamanho real do viewport, escalado pra caber no painel', () => {
    const w = { style: {}, parentElement: { clientWidth: 1000, clientHeight: 600 } };
    applyViewport(w, 'iphone-15');
    expect(w.style.width).toBe('393px');
    // a barra de status (54) e a barra do Safari (106 no topo da página) ficam fora do site
    expect(w.style.height).toBe(852 - 54 - 106 + 'px');
    const s = Number(/scale\(([\d.]+)\)/.exec(w.style.transform)[1]);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('modo antigo "mobile" vira um aparelho de verdade', () => {
    const w = fakeWebview();
    applyViewport(w, 'mobile');
    expect(w.style.width).toBe('402px');
  });

  it('modo desconhecido cai no computador (nunca some com o webview)', () => {
    const w = fakeWebview();
    applyViewport(w, 'relogio');
    expect(w.style.width).toBe('100%');
  });
});

describe('viewGeometry (motor view)', () => {
  const box = { x: 500, y: 100, width: 1000, height: 600 };

  it('computador: a view ocupa o painel, sem emulação', () => {
    expect(viewGeometry(box, 'desktop')).toEqual({ bounds: box, emulation: null, radius: 0 });
  });

  it('zoom do app multiplica os bounds (px CSS → DIP)', () => {
    expect(viewGeometry(box, 'desktop', null, { zoom: 1.5 }).bounds).toEqual({
      x: 750,
      y: 150,
      width: 1500,
      height: 900,
    });
  });

  it('aparelho: mesma conta do applyViewport (tamanho real + escala)', () => {
    const w = { style: {}, parentElement: { clientWidth: 1000, clientHeight: 600 } };
    applyViewport(w, 'iphone-15');
    const g = viewGeometry(box, 'iphone-15');
    const s = Number(/scale\(([\d.]+)\)/.exec(w.style.transform)[1]);
    expect(g.emulation.viewSize).toEqual({ width: 393, height: 852 - 54 - 106 });
    expect(g.emulation.screenSize).toEqual({ width: 393, height: 852 });
    expect(g.emulation.scale).toBeCloseTo(s, 6);
    expect(g.bounds.x).toBeCloseTo(box.x + parseFloat(w.style.left), 6);
    expect(g.bounds.y).toBeCloseTo(box.y + parseFloat(w.style.top), 6);
    expect(g.bounds.width).toBeCloseTo(393 * s, 6);
  });

  it('zoom do app entra na escala da emulação e no raio', () => {
    const a = viewGeometry(box, 'iphone-15');
    const b = viewGeometry(box, 'iphone-15', null, { zoom: 2 });
    expect(b.emulation.scale).toBeCloseTo(a.emulation.scale * 2, 6);
    expect(b.radius).toBeCloseTo(a.radius * 2, 6);
    expect(b.emulation.viewSize).toEqual(a.emulation.viewSize);
  });

  it('sem painel medido: não inventa bounds', () => {
    expect(viewGeometry(null, 'desktop').bounds).toBe(null);
  });
});

describe('stepZoom', () => {
  it('aumenta e diminui de meio em meio', () => {
    expect(stepZoom(0, 1)).toBe(0.5);
    expect(stepZoom(0.5, -1)).toBe(0);
  });

  it('dir 0 volta pro 100%', () => {
    expect(stepZoom(2.5, 0)).toBe(0);
  });

  it('respeita os limites do Chromium', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it('nível inválido conta como 100%', () => {
    expect(stepZoom(undefined, 1)).toBe(0.5);
  });
});

describe('zoomPercent', () => {
  it('nível 0 é 100%', () => {
    expect(zoomPercent(0)).toBe(100);
  });

  it('acompanha o fator 1.2^nível do Chromium', () => {
    expect(zoomPercent(1)).toBe(120);
    expect(zoomPercent(-1)).toBe(83);
  });
});
