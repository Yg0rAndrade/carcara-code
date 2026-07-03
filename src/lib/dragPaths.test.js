import { describe, it, expect } from 'vitest';
import { formatDroppedPaths, MOVE_MIME } from './dragPaths.js';

describe('MOVE_MIME', () => {
  it('é o tipo customizado usado pela árvore', () => {
    expect(MOVE_MIME).toBe('application/x-ygor-move');
  });
});

describe('formatDroppedPaths', () => {
  it('um caminho: devolve o caminho com espaço no fim', () => {
    expect(formatDroppedPaths('C:\\proj\\a.js')).toBe('C:\\proj\\a.js ');
  });

  it('vários caminhos (\\n): junta com espaço e espaço no fim', () => {
    expect(formatDroppedPaths('C:\\proj\\a.js\nC:\\proj\\b.js'))
      .toBe('C:\\proj\\a.js C:\\proj\\b.js ');
  });

  it('descarta linhas vazias e em branco', () => {
    expect(formatDroppedPaths('a\n\n  \nb')).toBe('a b ');
  });

  it('payload vazio ou null vira string vazia', () => {
    expect(formatDroppedPaths('')).toBe('');
    expect(formatDroppedPaths(null)).toBe('');
  });
});
