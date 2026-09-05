import { describe, it, expect } from 'vitest';
import {
  formatDroppedPaths,
  formatDroppedTask,
  MOVE_MIME,
  TASK_MIME,
  hasExternalFiles,
  externalPathsFromDrop,
  dropPathsText,
  dropTaskText,
  dropInsertText,
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

describe('TASK_MIME', () => {
  it('é um tipo próprio, separado do da árvore', () => {
    expect(TASK_MIME).toBe('application/x-ygor-task');
    expect(TASK_MIME).not.toBe(MOVE_MIME);
  });
});

describe('formatDroppedTask', () => {
  it('junta título e corpo, tirando a indentação do item de lista', () => {
    const body = '  primeira\n  segunda\n';
    expect(formatDroppedTask('**Titulo**', body)).toBe('**Titulo**\nprimeira\nsegunda ');
  });

  it('mantém o degrau relativo de uma sub-lista', () => {
    const body = '  pai\n    filho\n';
    expect(formatDroppedTask('T', body)).toBe('T\npai\n  filho ');
  });

  it('corpo vazio vira só o título', () => {
    expect(formatDroppedTask('  Só título  ', '')).toBe('Só título ');
    expect(formatDroppedTask('T', '   \n\n')).toBe('T ');
  });

  it('descarta linhas em branco das pontas antes de medir a indentação', () => {
    expect(formatDroppedTask('T', '\n\n    corpo\n\n')).toBe('T\ncorpo ');
  });

  it('aceita CRLF', () => {
    expect(formatDroppedTask('T', '  a\r\n  b')).toBe('T\na\nb ');
  });

  it('sem título nem corpo devolve string vazia', () => {
    expect(formatDroppedTask('', '')).toBe('');
    expect(formatDroppedTask(null, null)).toBe('');
  });
});

describe('dropTaskText', () => {
  it('lê o payload da tarefa', () => {
    const dt = { getData: (t) => (t === TASK_MIME ? 'T\ncorpo ' : '') };
    expect(dropTaskText(dt)).toBe('T\ncorpo ');
  });

  it('drop que não é de tarefa devolve string vazia', () => {
    expect(dropTaskText({ getData: () => '' })).toBe('');
    expect(dropTaskText(null)).toBe('');
    expect(dropTaskText({})).toBe('');
  });

  it('payload só de espaço não conta como tarefa', () => {
    expect(dropTaskText({ getData: () => '   ' })).toBe('');
  });
});

describe('dropInsertText', () => {
  it('a tarefa tem prioridade sobre o caminho', () => {
    const dt = {
      getData: (t) => (t === TASK_MIME ? 'T\ncorpo ' : 'C:\\a.js'),
      files: [],
    };
    expect(dropInsertText(dt, () => '')).toBe('T\ncorpo ');
  });

  it('sem tarefa, cai no caminho da árvore', () => {
    const dt = { getData: (t) => (t === MOVE_MIME ? 'C:\\a.js' : ''), files: [] };
    expect(dropInsertText(dt, () => '')).toBe('C:\\a.js ');
  });

  it('sem tarefa nem MIME interno, cai no arquivo do SO', () => {
    const dt = { getData: () => '', files: [{ __path: 'C:\\a.png' }] };
    expect(dropInsertText(dt, (f) => f.__path)).toBe('C:\\a.png ');
  });

  it('nada arrastável → string vazia', () => {
    expect(dropInsertText({ getData: () => '', files: [] }, () => '')).toBe('');
  });
});
