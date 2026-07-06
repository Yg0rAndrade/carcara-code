import { describe, it, expect } from 'vitest';
import { resolveProjectAis, effectiveCli, buildResumeCommand, VALID_CLIS } from './ai-cli.cjs';

describe('resolveProjectAis', () => {
  it('usa o novo formato { ais, custom }', () => {
    const cfg = { projectCli: { '/p': { ais: ['claude', 'codex'], custom: 'x' } } };
    expect(resolveProjectAis(cfg, '/p')).toEqual({ ais: ['claude', 'codex'], custom: 'x' });
  });
  it('migra o formato antigo por projeto { cli, custom } para [cli]', () => {
    const cfg = { projectCli: { '/p': { cli: 'codex', custom: 'meu cmd' } } };
    expect(resolveProjectAis(cfg, '/p')).toEqual({ ais: ['codex'], custom: 'meu cmd' });
  });
  it('migra o global legado cfg.cli / cfg.cliCustom', () => {
    const cfg = { cli: 'opencode', cliCustom: 'oc --x' };
    expect(resolveProjectAis(cfg, '/p')).toEqual({ ais: ['opencode'], custom: 'oc --x' });
  });
  it('cai em [claude] quando não há nada', () => {
    expect(resolveProjectAis({}, '/p')).toEqual({ ais: ['claude'], custom: '' });
    expect(resolveProjectAis(null, '/p')).toEqual({ ais: ['claude'], custom: '' });
  });
  it('filtra chaves inválidas e nunca devolve ais vazio', () => {
    const cfg = { projectCli: { '/p': { ais: ['claude', 'lixo'], custom: '' } } };
    expect(resolveProjectAis(cfg, '/p')).toEqual({ ais: ['claude'], custom: '' });
    const empty = { projectCli: { '/p': { ais: [], custom: '' } } };
    expect(resolveProjectAis(empty, '/p')).toEqual({ ais: ['claude'], custom: '' });
  });
});

describe('effectiveCli', () => {
  it('prefere a cli gravada na sessão', () => {
    expect(effectiveCli({ cli: 'codex' }, ['claude', 'codex'])).toBe('codex');
  });
  it('sem cli na sessão, cai na primeira IA do projeto', () => {
    expect(effectiveCli({}, ['opencode', 'claude'])).toBe('opencode');
    expect(effectiveCli(null, ['agy'])).toBe('agy');
  });
  it('sem cli e sem ais, cai em claude', () => {
    expect(effectiveCli(null, [])).toBe('claude');
  });
});

describe('buildResumeCommand', () => {
  it('sobe o comando puro quando não há id de resume', () => {
    expect(buildResumeCommand('opencode', {}, '')).toBe('opencode');
    expect(buildResumeCommand('agy', {}, '')).toBe('agy');
    expect(buildResumeCommand('codex', {}, '')).toBe('codex');
  });
  it('sobe o comando de resume quando há id salvo', () => {
    expect(buildResumeCommand('opencode', { resume: { opencode: 'ses_ABC' } }, '')).toBe(
      'opencode --session ses_ABC',
    );
    expect(buildResumeCommand('agy', { resume: { agy: 'abc123' } }, '')).toBe(
      'agy --conversation=abc123',
    );
    expect(buildResumeCommand('codex', { resume: { codex: 'xy12' } }, '')).toBe(
      'codex resume xy12',
    );
  });
  it('custom usa a string do projeto (ou claude se vazia)', () => {
    expect(buildResumeCommand('custom', {}, 'gemini')).toBe('gemini');
    expect(buildResumeCommand('custom', {}, '  ')).toBe('claude');
  });
  it('VALID_CLIS contém exatamente as 5 chaves', () => {
    expect(VALID_CLIS).toEqual(['claude', 'codex', 'opencode', 'agy', 'custom']);
  });
});
