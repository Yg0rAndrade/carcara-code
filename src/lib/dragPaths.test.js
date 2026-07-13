import { describe, it, expect } from 'vitest';
import {
  formatDroppedPaths,
  MOVE_MIME,
  hasExternalFiles,
  externalPathsFromDrop,
  dropPathsText,
} from './dragPaths.js';

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
    expect(formatDroppedPaths('C:\\proj\\a.js\nC:\\proj\\b.js')).toBe(
      'C:\\proj\\a.js C:\\proj\\b.js ',
    );
  });

  it('descarta linhas vazias e em branco', () => {
    expect(formatDroppedPaths('a\n\n  \nb')).toBe('a b ');
  });

  it('payload vazio ou null vira string vazia', () => {
    expect(formatDroppedPaths('')).toBe('');
    expect(formatDroppedPaths(null)).toBe('');
  });
});

describe('hasExternalFiles', () => {
  it('reconhece o tipo "Files" via DOMStringList (.contains)', () => {
    const dt = { types: { contains: (t) => t === 'Files' } };
    expect(hasExternalFiles(dt)).toBe(true);
  });

  it('reconhece "Files" via array (SyntheticEvent)', () => {
    expect(hasExternalFiles({ types: ['Files'] })).toBe(true);
  });

  it('ignora arrasto interno da árvore (só MOVE_MIME)', () => {
    expect(hasExternalFiles({ types: [MOVE_MIME] })).toBe(false);
  });

  it('null/sem types → false', () => {
    expect(hasExternalFiles(null)).toBe(false);
    expect(hasExternalFiles({})).toBe(false);
  });
});

describe('externalPathsFromDrop', () => {
  const resolve = (f) => f.__path;

  it('resolve os caminhos absolutos dos File via resolvedor', () => {
    const dt = { files: [{ __path: 'C:\\a.png' }, { __path: 'C:\\b.yaml' }] };
    expect(externalPathsFromDrop(dt, resolve)).toEqual(['C:\\a.png', 'C:\\b.yaml']);
  });

  it('descarta vazios e caminhos que o resolvedor não resolveu', () => {
    const dt = { files: [{ __path: 'C:\\a.png' }, { __path: '' }, { __path: '  ' }] };
    expect(externalPathsFromDrop(dt, resolve)).toEqual(['C:\\a.png']);
  });

  it('sem files ou sem resolvedor → []', () => {
    expect(externalPathsFromDrop({ files: [] }, resolve)).toEqual([]);
    expect(externalPathsFromDrop({ files: [{ __path: 'x' }] }, null)).toEqual([]);
  });
});

describe('dropPathsText', () => {
  it('drop interno: usa o MOVE_MIME', () => {
    const dt = { getData: (t) => (t === MOVE_MIME ? 'C:\\a.js\nC:\\b.js' : '') };
    expect(dropPathsText(dt, () => '')).toBe('C:\\a.js C:\\b.js ');
  });

  it('drop externo: cai nos File quando não há MOVE_MIME', () => {
    const dt = { getData: () => '', files: [{ __path: 'C:\\a.png' }] };
    expect(dropPathsText(dt, (f) => f.__path)).toBe('C:\\a.png ');
  });

  it('nada arrastável → string vazia', () => {
    expect(dropPathsText({ getData: () => '', files: [] }, () => '')).toBe('');
  });
});
