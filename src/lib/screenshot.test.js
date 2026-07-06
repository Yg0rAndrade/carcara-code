import { describe, it, expect } from 'vitest';
import { rectFromDrag, CLICK_THRESHOLD } from './screenshot.js';

const BOUNDS = { width: 1000, height: 800 };

describe('rectFromDrag', () => {
  it('arraste normal → retângulo com canto superior-esquerdo e w/h positivos', () => {
    expect(rectFromDrag(100, 50, 300, 250, BOUNDS)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 200,
    });
  });

  it('arraste da direita-pra-esquerda / baixo-pra-cima → normaliza', () => {
    expect(rectFromDrag(300, 250, 100, 50, BOUNDS)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 200,
    });
  });

  it('arraste menor que o limiar → null (tela toda)', () => {
    expect(
      rectFromDrag(100, 100, 100 + CLICK_THRESHOLD - 1, 100 + CLICK_THRESHOLD - 1, BOUNDS),
    ).toBeNull();
    expect(rectFromDrag(100, 100, 100, 100, BOUNDS)).toBeNull();
  });

  it('arraste logo acima do limiar nos dois eixos → captura recorte (não é clique)', () => {
    const d = CLICK_THRESHOLD + 1;
    expect(rectFromDrag(100, 100, 100 + d, 100 + d, BOUNDS)).toEqual({
      x: 100,
      y: 100,
      width: d,
      height: d,
    });
  });

  it('clamp: começa fora da borda esquerda/topo → corta pro dentro', () => {
    expect(rectFromDrag(-50, -30, 200, 200, BOUNDS)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
    });
  });

  it('clamp: passa da borda direita/baixo → encolhe até o limite', () => {
    expect(rectFromDrag(900, 700, 1200, 1000, BOUNDS)).toEqual({
      x: 900,
      y: 700,
      width: 100,
      height: 100,
    });
  });

  it('seleção só na calha (degenera após clamp) → null', () => {
    // Todo o arraste acontece à direita do webview (x >= width): nada sobra.
    expect(rectFromDrag(1100, 100, 1300, 300, BOUNDS)).toBeNull();
  });

  it('sem bounds → não faz clamp (usa o arraste cru normalizado)', () => {
    expect(rectFromDrag(10, 10, 60, 60, null)).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });

  it('arredonda coords fracionárias', () => {
    expect(rectFromDrag(10.4, 10.6, 60.5, 60.2, BOUNDS)).toEqual({
      x: 10,
      y: 11,
      width: 50,
      height: 50,
    });
  });
});
