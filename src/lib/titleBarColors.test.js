import { describe, expect, it } from 'vitest';
import { parseCssColor, toOpaqueHex } from './titleBarColors.js';

describe('parseCssColor', () => {
  it('lê rgb e rgba nas duas sintaxes', () => {
    expect(parseCssColor('rgb(25, 22, 21)')).toEqual({ r: 25, g: 22, b: 21, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseCssColor('rgb(10 20 30 / 25%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
  });
  it('recusa o que não entende', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('oklch(0.5 0.1 20)')).toBeNull();
  });
});

describe('toOpaqueHex', () => {
  it('cor opaca vira hex direto', () => {
    expect(toOpaqueHex('rgb(25, 22, 21)')).toBe('#191615');
  });
  it('cor translúcida é composta sobre o fundo (nunca vai transparente pro Windows)', () => {
    expect(toOpaqueHex('rgba(0, 0, 0, 0)', 'rgb(14, 14, 14)')).toBe('#0e0e0e');
    expect(toOpaqueHex('rgba(255, 255, 255, 0.5)', 'rgb(0, 0, 0)')).toBe('#808080');
  });
  it('null quando não dá pra ler', () => {
    expect(toOpaqueHex('transparent')).toBeNull();
  });
});
