import { describe, it, expect } from 'vitest';
import {
  nextFolderId, buildRows, toggleCollapse, renameFolder, dissolveFolder, applyDrop,
} from './railTree.js';

const P = (path) => ({ type: 'project', path });
const F = (id, children, extra = {}) => ({ type: 'folder', id, name: 'P', collapsed: false, children, ...extra });
const mapOf = (...paths) => new Map(paths.map((p) => [p, { path: p, name: p }]));

describe('nextFolderId', () => {
  it('começa em f1 sem pastas', () => {
    expect(nextFolderId([P('/a')])).toBe('f1');
  });
  it('é max+1 sem colidir', () => {
    expect(nextFolderId([F('f1', ['/a']), F('f3', ['/b'])])).toBe('f4');
  });
});

describe('buildRows', () => {
  it('projeto solto vira linha project', () => {
    const rows = buildRows([P('/a')], mapOf('/a'));
    expect(rows).toEqual([{ kind: 'project', key: '/a', project: { path: '/a', name: '/a' } }]);
  });
  it('pasta fechada não emite filhos; aberta emite child indentado', () => {
    const rail = [F('f1', ['/a', '/b'], { collapsed: true })];
    const closed = buildRows(rail, mapOf('/a', '/b'));
    expect(closed.map((r) => r.kind)).toEqual(['folder']);
    expect(closed[0].previews.length).toBe(2);
    expect(closed[0].count).toBe(2);

    const open = buildRows([F('f1', ['/a', '/b'], { collapsed: false })], mapOf('/a', '/b'));
    expect(open.map((r) => r.kind)).toEqual(['folder', 'child', 'child']);
    expect(open[1]).toMatchObject({ kind: 'child', key: '/a', folderId: 'f1' });
  });
});

describe('toggleCollapse', () => {
  it('inverte collapsed sem mutar', () => {
    const rail = [F('f1', ['/a'], { collapsed: false })];
    const out = toggleCollapse(rail, 'f1');
    expect(out[0].collapsed).toBe(true);
    expect(rail[0].collapsed).toBe(false); // imutável
  });
});

describe('renameFolder', () => {
  it('troca o nome da pasta certa', () => {
    const out = renameFolder([F('f1', ['/a'])], 'f1', 'Clientes');
    expect(out[0].name).toBe('Clientes');
  });
});

describe('dissolveFolder', () => {
  it('troca a pasta pelos filhos soltos na posição', () => {
    const rail = [P('/x'), F('f1', ['/a', '/b']), P('/y')];
    const out = dissolveFolder(rail, 'f1');
    expect(out).toEqual([P('/x'), P('/a'), P('/b'), P('/y')]);
  });
});

describe('applyDrop', () => {
  it('merge em projeto do topo cria pasta com [alvo, arrastado]', () => {
    const rail = [P('/a'), P('/b')];
    const out = applyDrop(rail, { dragPath: '/a', targetKind: 'project', targetPath: '/b', zone: 'merge', newFolderName: 'Nova' });
    expect(out).toEqual([{ type: 'folder', id: 'f1', name: 'Nova', collapsed: false, children: ['/b', '/a'] }]);
  });
  it('merge em pasta move pra dentro dela', () => {
    const rail = [F('f1', ['/a']), P('/b')];
    const out = applyDrop(rail, { dragPath: '/b', targetKind: 'folder', targetFolderId: 'f1', zone: 'merge' });
    expect(out).toEqual([F('f1', ['/a', '/b'])]);
  });
  it('reorder no topo move o item para a posição do alvo', () => {
    const rail = [P('/a'), P('/b'), P('/c')];
    const out = applyDrop(rail, { dragPath: '/c', targetKind: 'project', targetPath: '/a', zone: 'reorder' });
    expect(out.map((i) => i.path)).toEqual(['/c', '/a', '/b']);
  });
  it('arrastar filho pra fora (reorder no topo) esvazia e remove a pasta', () => {
    const rail = [F('f1', ['/a']), P('/b')];
    const out = applyDrop(rail, { dragPath: '/a', targetKind: 'project', targetPath: '/b', zone: 'reorder' });
    expect(out).toEqual([P('/a'), P('/b')]); // pasta f1 sumiu ao esvaziar
  });
});
