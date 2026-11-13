import { describe, it, expect } from 'vitest';
import {
  ALL_DEVICES,
  normalizeViewport,
  resolveDevice,
  clampCustom,
  fitDevice,
  bezelOf,
} from './devices.js';

describe('catálogo', () => {
  it('ids únicos e medidas plausíveis', () => {
    const ids = ALL_DEVICES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ALL_DEVICES) {
      expect(d.w).toBeGreaterThan(300);
      // retrato, menos os dobráveis abertos (tela mais larga que alta)
      if (!/aberto/.test(d.name)) expect(d.h).toBeGreaterThan(d.w);
    }
  });
});

describe('normalizeViewport', () => {
  it('migra os 3 modos antigos', () => {
    expect(normalizeViewport('mobile')).toBe('iphone-15');
    expect(normalizeViewport('tablet')).toBe('ipad-air');
    expect(normalizeViewport('desktop')).toBe('desktop');
  });
  it('valor desconhecido vira computador', () => {
    expect(normalizeViewport('relogio')).toBe('desktop');
    expect(normalizeViewport(null)).toBe('desktop');
  });
});

describe('resolveDevice / clampCustom', () => {
  it('computador não tem aparelho', () => {
    expect(resolveDevice('desktop')).toBeNull();
  });
  it('personalizado respeita os limites', () => {
    expect(clampCustom({ w: 50, h: 99999 })).toEqual({ w: 200, h: 3000 });
    expect(clampCustom({ w: 'x' })).toEqual({ w: 390, h: 844 });
    expect(resolveDevice('custom', { w: 500, h: 700 })).toMatchObject({ w: 500, h: 700 });
  });
});

describe('fitDevice', () => {
  const dev = resolveDevice('iphone-15');
  it('cabe em 100% quando sobra espaço, centralizado', () => {
    const g = fitDevice(dev, { width: 2000, height: 1400 });
    expect(g.scale).toBe(1);
    expect(g.screen.w).toBe(393);
    expect(g.frame.x + g.frame.w / 2).toBeCloseTo(1000);
  });
  it('encolhe pra caber na altura do painel', () => {
    const g = fitDevice(dev, { width: 1200, height: 700 });
    expect(g.scale).toBeLessThan(1);
    expect(g.frame.y + g.frame.h).toBeLessThanOrEqual(700);
    // a tela fica dentro da moldura, deslocada pela borda
    const b = bezelOf(dev);
    expect(g.screen.x - g.frame.x).toBeCloseTo(b.side * g.scale);
  });
});
