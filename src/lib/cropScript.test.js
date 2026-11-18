import { describe, it, expect } from 'vitest';
import {
  cropToCapture,
  cropInject,
  CROP_SENTINEL,
  CROP_CANCEL,
  CROP_CLEANUP,
} from './cropScript.js';

describe('cropToCapture', () => {
  it('computador sem zoom: px CSS = DIP', () => {
    expect(cropToCapture({ x: 10, y: 20, width: 100, height: 50, iw: 800 }, 800)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });
  it('aparelho encolhido: o site acha que tem 390px numa view de 195 DIP', () => {
    expect(cropToCapture({ x: 100, y: 200, width: 80, height: 40, iw: 390 }, 195)).toEqual({
      x: 50,
      y: 100,
      width: 40,
      height: 20,
    });
  });
  it('site com zoom (Ctrl +): innerWidth menor que a view', () => {
    expect(cropToCapture({ x: 10, y: 10, width: 100, height: 100, iw: 500 }, 600).width).toBe(120);
  });
  it('recorte minúsculo ou dados faltando: nada', () => {
    expect(cropToCapture({ x: 0, y: 0, width: 1, height: 1, iw: 800 }, 800)).toBe(null);
    expect(cropToCapture(null, 800)).toBe(null);
    expect(cropToCapture({ x: 0, y: 0, width: 50, height: 50 }, 800)).toBe(null);
  });
});

describe('cropInject', () => {
  it('é JS válido, leva os sentinelas e o texto de ajuda escapado', () => {
    const code = cropInject('Arraste "aqui"');
    expect(() => new Function(code)).not.toThrow();
    expect(() => new Function(CROP_CLEANUP)).not.toThrow();
    expect(code).toContain(CROP_SENTINEL);
    expect(code).toContain(CROP_CANCEL);
    expect(code).toContain('Arraste \\"aqui\\"');
  });
  it('os sentinelas passam no filtro do main', () => {
    expect(CROP_SENTINEL.startsWith('__CARCARA_')).toBe(true);
    expect(CROP_CANCEL.startsWith(CROP_SENTINEL)).toBe(false); // o cancel não é lido como recorte
  });
});
