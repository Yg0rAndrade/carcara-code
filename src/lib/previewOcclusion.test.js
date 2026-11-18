import { describe, it, expect } from 'vitest';
import { samplePoints, isCovered } from './previewOcclusion.js';

describe('samplePoints', () => {
  it('cobre a área inteira, inclusive as bordas', () => {
    const pts = samplePoints({ x: 100, y: 50, width: 200, height: 100 }, 50, 3);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(103);
    expect(Math.max(...xs)).toBe(297);
    expect(Math.min(...ys)).toBe(53);
    expect(Math.max(...ys)).toBe(147);
  });
  it('área minúscula ou ausente: nenhum ponto', () => {
    expect(samplePoints(null)).toEqual([]);
    expect(samplePoints({ x: 0, y: 0, width: 4, height: 100 })).toEqual([]);
  });
});

describe('isCovered', () => {
  const own = { name: 'painel' };
  const menu = { name: 'menu' };
  const isOwn = (el) => el === own;
  const pts = samplePoints({ x: 0, y: 0, width: 300, height: 300 }, 28, 3);

  it('só o painel do preview: descoberto', () => {
    expect(isCovered(pts, () => own, isOwn)).toBe(false);
  });
  it('um menu pequeno numa beirada já cobre', () => {
    const hit = (x, y) => (x > 250 && y < 40 ? menu : own);
    expect(isCovered(pts, hit, isOwn)).toBe(true);
  });
  it('ponto sem elemento (fora da janela) não conta', () => {
    expect(isCovered(pts, () => null, isOwn)).toBe(false);
  });
});
