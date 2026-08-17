import { describe, it, expect } from 'vitest';
import { remoteToWebUrl } from './remoteUrl.js';

describe('remoteToWebUrl', () => {
  it('SSH scp-like do GitHub', () => {
    expect(remoteToWebUrl('git@github.com:dono/repo.git')).toBe('https://github.com/dono/repo');
  });

  it('HTTPS com .git', () => {
    expect(remoteToWebUrl('https://github.com/dono/repo.git')).toBe('https://github.com/dono/repo');
  });

  it('HTTPS sem .git', () => {
    expect(remoteToWebUrl('https://github.com/dono/repo')).toBe('https://github.com/dono/repo');
  });

  it('SSH com esquema e porta', () => {
    expect(remoteToWebUrl('ssh://git@github.com:22/dono/repo.git')).toBe(
      'https://github.com/dono/repo',
    );
  });

  it('git:// protocolo', () => {
    expect(remoteToWebUrl('git://github.com/dono/repo.git')).toBe('https://github.com/dono/repo');
  });

  it('GitLab com subgrupo (path com mais de um nível)', () => {
    expect(remoteToWebUrl('git@gitlab.com:grupo/sub/repo.git')).toBe(
      'https://gitlab.com/grupo/sub/repo',
    );
  });

  it('Bitbucket scp-like', () => {
    expect(remoteToWebUrl('git@bitbucket.org:dono/repo.git')).toBe(
      'https://bitbucket.org/dono/repo',
    );
  });

  it('host self-hosted com porta em HTTP', () => {
    expect(remoteToWebUrl('http://git.interno.com:8080/time/repo.git')).toBe(
      'https://git.interno.com/time/repo',
    );
  });

  it('barra final é ignorada', () => {
    expect(remoteToWebUrl('https://github.com/dono/repo/')).toBe('https://github.com/dono/repo');
  });

  it('valores inválidos viram null', () => {
    expect(remoteToWebUrl('')).toBeNull();
    expect(remoteToWebUrl(null)).toBeNull();
    expect(remoteToWebUrl(undefined)).toBeNull();
    expect(remoteToWebUrl('   ')).toBeNull();
  });
});
