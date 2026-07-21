import { describe, it, expect } from 'vitest';
import {
  VIEWPORTS,
  applyViewport,
  stepZoom,
  zoomPercent,
  ZOOM_MIN,
  ZOOM_MAX,
} from './webviewChrome.js';

// Dublê do <webview>: só o que applyViewport toca.
const fakeWebview = () => ({ style: {} });

describe('applyViewport', () => {
  it('desktop ocupa a área inteira', () => {
    const w = fakeWebview();
    applyViewport(w, 'desktop');
    expect(w.style).toEqual({ width: '100%', left: '0', right: '0', transform: 'none' });
  });

  it('celular/tablet viram moldura centralizada de largura fixa', () => {
    const w = fakeWebview();
    applyViewport(w, 'mobile');
    expect(w.style.width).toBe(VIEWPORTS.mobile + 'px');
    expect(w.style.left).toBe('50%');
    expect(w.style.transform).toBe('translateX(-50%)');
  });

  it('modo desconhecido cai no desktop (nunca some com o webview)', () => {
    const w = fakeWebview();
    applyViewport(w, 'relogio');
    expect(w.style.width).toBe('100%');
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
