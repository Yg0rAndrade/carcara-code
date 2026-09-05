import { describe, it, expect } from 'vitest';
import { alwaysAvailable, baseName, missingChosen, preselect } from './newProjectAi.js';

const OPTS = [
  { key: 'claude' },
  { key: 'codex' },
  { key: 'opencode' },
  { key: 'agy' },
  { key: 'shell' },
  { key: 'custom' },
];

describe('baseName', () => {
  it('pega a última pasta em caminho do Windows', () => {
    expect(baseName('C:\\Users\\ygor\\github\\meu-app')).toBe('meu-app');
  });
  it('pega a última pasta em caminho POSIX', () => {
    expect(baseName('/home/ygor/github/meu-app')).toBe('meu-app');
  });
  it('ignora barra sobrando no fim', () => {
    expect(baseName('/home/ygor/meu-app/')).toBe('meu-app');
  });
});

describe('preselect', () => {
  it('marca o Claude quando ele está instalado', () => {
    expect(preselect(OPTS, new Set(['claude', 'codex']))).toEqual(['claude']);
  });
  it('cai na primeira CLI instalada quando não tem Claude', () => {
    expect(preselect(OPTS, new Set(['opencode', 'codex']))).toEqual(['codex']);
  });
  it('não marca nada quando nenhuma CLI está instalada', () => {
    expect(preselect(OPTS, new Set())).toEqual([]);
  });
  it('shell e custom não contam como CLI instalada', () => {
    expect(preselect(OPTS, new Set(['shell', 'custom']))).toEqual([]);
  });
  it('sem resposta do aiStatus ainda, não marca nada', () => {
    expect(preselect(OPTS, null)).toEqual([]);
  });
});

describe('missingChosen', () => {
  it('junta as CLIs escolhidas que faltam, sem repetir', () => {
    const sel = [['claude', 'codex'], ['codex']];
    expect(missingChosen(sel, new Set(['claude']))).toEqual(['codex']);
  });
  it('não avisa sobre shell, custom nem carcara', () => {
    expect(missingChosen([['shell', 'custom', 'carcara']], new Set())).toEqual([]);
  });
  it('lista vazia quando tudo escolhido está instalado', () => {
    expect(missingChosen([['claude']], new Set(['claude']))).toEqual([]);
  });
});

describe('alwaysAvailable', () => {
  it('cobre exatamente shell, custom e carcara', () => {
    expect(['shell', 'custom', 'carcara'].every(alwaysAvailable)).toBe(true);
    expect(['claude', 'codex', 'opencode', 'agy'].some(alwaysAvailable)).toBe(false);
  });
});
