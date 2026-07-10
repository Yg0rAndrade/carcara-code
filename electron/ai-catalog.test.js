import { describe, it, expect } from 'vitest';
import {
  catalogFor,
  installSpec,
  updateSpec,
  parseVersion,
  cmpVersions,
  computeUpdateAvailable,
  INSTALLABLE_KEYS,
} from './ai-catalog.cjs';

describe('installSpec', () => {
  it('codex usa powershell no win32 e sh no resto', () => {
    expect(installSpec('codex', 'win32')).toEqual({
      shell: 'powershell',
      cmd: 'irm https://chatgpt.com/codex/install.ps1 | iex',
      postInstall: null,
    });
    expect(installSpec('codex', 'darwin')).toEqual({
      shell: 'sh',
      cmd: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      postInstall: null,
    });
  });
  it('agy tem postInstall "agy install"', () => {
    expect(installSpec('agy', 'linux').postInstall).toBe('agy install');
  });
  it('desconhecido/custom → null', () => {
    expect(installSpec('custom', 'linux')).toBeNull();
    expect(installSpec('zzz', 'linux')).toBeNull();
  });
});

describe('updateSpec', () => {
  it('opencode é builtin (opencode upgrade)', () => {
    expect(updateSpec('opencode', 'linux')).toEqual({
      shell: 'sh',
      cmd: 'opencode upgrade',
      builtin: true,
    });
  });
  it('codex reexecuta o instalador', () => {
    expect(updateSpec('codex', 'win32').cmd).toBe(
      'irm https://chatgpt.com/codex/install.ps1 | iex',
    );
  });
});

describe('parseVersion', () => {
  it('extrai x.y.z de saídas variadas', () => {
    expect(parseVersion('codex', 'codex-cli 0.9.1')).toBe('0.9.1');
    expect(parseVersion('agy', 'agy version 1.4.2 (build 9)')).toBe('1.4.2');
  });
  it('sem número → null', () => {
    expect(parseVersion('codex', 'not installed')).toBeNull();
  });
});

describe('cmpVersions / computeUpdateAvailable', () => {
  it('compara semver simples', () => {
    expect(cmpVersions('1.2.0', '1.2.1')).toBe(-1);
    expect(cmpVersions('2.0.0', '1.9.9')).toBe(1);
    expect(cmpVersions('1.4', '1.4.0')).toBe(0);
  });
  it('update disponível só quando latest > installed', () => {
    expect(computeUpdateAvailable('1.0.0', '1.1.0')).toBe(true);
    expect(computeUpdateAvailable('1.1.0', '1.1.0')).toBe(false);
    expect(computeUpdateAvailable('1.1.0', null)).toBe(false);
    expect(computeUpdateAvailable(null, '1.1.0')).toBe(false);
  });
});

describe('catalogFor / INSTALLABLE_KEYS', () => {
  it('inclui os 3 instaláveis, não inclui custom', () => {
    expect(INSTALLABLE_KEYS).toEqual(['codex', 'opencode', 'agy']);
    const keys = catalogFor('linux').map((e) => e.key);
    expect(keys).toContain('codex');
    expect(keys).not.toContain('custom');
  });
});
