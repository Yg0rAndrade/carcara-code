import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RUN,
  normalizeRun,
  isCustom,
  applyPort,
  customCommandFor,
} from './run-command.cjs';

describe('normalizeRun', () => {
  it('projeto nunca configurado abre no automático, com abrir sozinho ligado', () => {
    expect(normalizeRun(undefined)).toEqual(DEFAULT_RUN);
    expect(normalizeRun(null)).toEqual({ mode: 'auto', command: '', autoStart: true });
    expect(normalizeRun('lixo')).toEqual(DEFAULT_RUN);
  });

  it('modo personalizado sem comando cai no automático', () => {
    expect(normalizeRun({ mode: 'custom', command: '   ' }).mode).toBe('auto');
    expect(normalizeRun({ mode: 'custom' }).mode).toBe('auto');
  });

  it('apara o comando e mantém o modo personalizado', () => {
    expect(normalizeRun({ mode: 'custom', command: '  npm run web  ' })).toEqual({
      mode: 'custom',
      command: 'npm run web',
      autoStart: true,
    });
  });

  it('abrir sozinho só desliga com false explícito', () => {
    expect(normalizeRun({ autoStart: false }).autoStart).toBe(false);
    expect(normalizeRun({ autoStart: undefined }).autoStart).toBe(true);
  });

  it('comando guardado sobrevive ao modo automático', () => {
    // Voltar pro automático não pode apagar o que a pessoa digitou: ela alterna e volta.
    expect(normalizeRun({ mode: 'auto', command: 'npm run web' }).command).toBe('npm run web');
  });
});

describe('isCustom', () => {
  it('só quando há modo personalizado E comando', () => {
    expect(isCustom({ mode: 'custom', command: 'npm run web' })).toBe(true);
    expect(isCustom({ mode: 'custom', command: '' })).toBe(false);
    expect(isCustom({ mode: 'auto', command: 'npm run web' })).toBe(false);
    expect(isCustom(undefined)).toBe(false);
  });
});

describe('applyPort', () => {
  it('troca o {port} pela porta escolhida', () => {
    expect(applyPort('php -S localhost:{port}', 8123)).toBe('php -S localhost:8123');
  });

  it('troca todas as ocorrências, em qualquer caixa', () => {
    expect(applyPort('serve -p {port} --url http://localhost:{PORT}', 80)).toBe(
      'serve -p 80 --url http://localhost:80',
    );
  });

  it('comando sem {port} passa intacto', () => {
    expect(applyPort('npm run web', 8080)).toBe('npm run web');
  });

  it('entrada vazia não quebra', () => {
    expect(applyPort('', 1)).toBe('');
    expect(applyPort(null, 1)).toBe('');
  });
});

describe('customCommandFor', () => {
  it('devolve a linha pronta pro shell', () => {
    expect(customCommandFor({ mode: 'custom', command: 'serve -p {port}' }, 9000)).toBe(
      'serve -p 9000',
    );
  });

  it('null quando o automático está valendo', () => {
    expect(customCommandFor({ mode: 'auto', command: 'serve' }, 9000)).toBe(null);
    expect(customCommandFor(undefined, 9000)).toBe(null);
  });
});
