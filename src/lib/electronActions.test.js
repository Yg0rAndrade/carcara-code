import { describe, it, expect } from 'vitest';
import { classifyScript, electronActions } from './electronActions.js';

describe('classifyScript', () => {
  it('nomes comuns viram ações', () => {
    expect(classifyScript('start').kind).toBe('open');
    expect(classifyScript('dev').kind).toBe('dev');
    expect(classifyScript('build').kind).toBe('build');
    expect(classifyScript('lint').kind).toBe('other');
  });
  it('instalador por sistema', () => {
    expect(classifyScript('pack:exe')).toEqual({ kind: 'package', os: 'windows' });
    expect(classifyScript('pack:dmg')).toEqual({ kind: 'package', os: 'mac' });
    expect(classifyScript('pack:appimage')).toEqual({ kind: 'package', os: 'linux' });
    expect(classifyScript('dist')).toEqual({ kind: 'package', os: null });
  });
});

describe('electronActions', () => {
  it('abrir o app vira o botão principal, mesmo fora da primeira posição', () => {
    const { primary, rest } = electronActions([
      { name: 'dev', command: 'vite' },
      { name: 'start', command: 'electron .' },
    ]);
    expect(primary.name).toBe('start');
    expect(rest.map((a) => a.name)).toEqual(['dev']);
  });
  it('sem start: o primeiro script é o principal; vazio: nada', () => {
    expect(electronActions([{ name: 'build', command: 'x' }]).primary.name).toBe('build');
    expect(electronActions([]).primary).toBeNull();
  });
});
