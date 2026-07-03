import { describe, it, expect } from 'vitest';
import { isRemote, parseSshUri, buildSshUri, hostKey } from './sshUri.cjs';

describe('isRemote', () => {
  it('detecta ssh:// e ignora caminhos locais', () => {
    expect(isRemote('ssh://ygor@1.2.3.4:22/home/ygor/app')).toBe(true);
    expect(isRemote('C:\\Users\\x\\proj')).toBe(false);
    expect(isRemote('/home/ygor/app')).toBe(false);
    expect(isRemote(null)).toBe(false);
  });
});

describe('parseSshUri', () => {
  it('separa user/host/port/dir', () => {
    expect(parseSshUri('ssh://ygor@1.2.3.4:2222/home/ygor/app')).toEqual({
      user: 'ygor', host: '1.2.3.4', port: 2222, remoteDir: '/home/ygor/app',
    });
  });
  it('assume porta 22 quando ausente', () => {
    expect(parseSshUri('ssh://ygor@host/srv/app')).toEqual({
      user: 'ygor', host: 'host', port: 22, remoteDir: '/srv/app',
    });
  });
  it('devolve null pra entrada inválida', () => {
    expect(parseSshUri('/local/path')).toBe(null);
  });
});

describe('buildSshUri + hostKey', () => {
  it('reconstrói a URI e extrai o hostKey', () => {
    const uri = buildSshUri({ user: 'ygor', host: '1.2.3.4', port: 2222, remoteDir: '/srv/app' });
    expect(uri).toBe('ssh://ygor@1.2.3.4:2222/srv/app');
    expect(hostKey(uri)).toBe('ygor@1.2.3.4:2222');
  });
  it('normaliza remoteDir sem barra inicial', () => {
    expect(buildSshUri({ user: 'a', host: 'h', port: 22, remoteDir: 'srv/app' }))
      .toBe('ssh://a@h:22/srv/app');
  });
});
