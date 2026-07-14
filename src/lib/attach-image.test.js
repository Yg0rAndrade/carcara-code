import { describe, it, expect } from 'vitest';
import { isImageType, targetDimensions, MAX_EDGE } from './attach-image.js';

describe('isImageType', () => {
  it('aceita image/*', () => {
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('image/jpeg')).toBe(true);
    expect(isImageType('image/webp')).toBe(true);
  });
  it('rejeita não-imagem e lixo', () => {
    expect(isImageType('text/plain')).toBe(false);
    expect(isImageType('application/pdf')).toBe(false);
    expect(isImageType('')).toBe(false);
    expect(isImageType(undefined)).toBe(false);
  });
});

describe('targetDimensions', () => {
  it('imagem menor que maxEdge passa intacta', () => {
    expect(targetDimensions(800, 600, 1568)).toEqual({ width: 800, height: 600 });
  });
  it('reduz mantendo proporção quando a borda longa (largura) excede', () => {
    // 3136x1000 → escala 0.5 → 1568x500
    expect(targetDimensions(3136, 1000, 1568)).toEqual({ width: 1568, height: 500 });
  });
  it('reduz quando a borda longa é a altura', () => {
    // 1000x2000 → maxEdge/2000=0.784 → 784x1568
    expect(targetDimensions(1000, 2000, 1568)).toEqual({ width: 784, height: 1568 });
  });
  it('usa MAX_EDGE=1568 como default do módulo', () => {
    expect(MAX_EDGE).toBe(1568);
  });
});
