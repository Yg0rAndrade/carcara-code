import { describe, it, expect } from 'vitest';
import { parseSshConfig } from './sshConfig.cjs';

const SAMPLE = `
Host meuvps
  HostName 203.0.113.10
  User ygor
  Port 2222
  IdentityFile ~/.ssh/id_ed25519

Host *
  ServerAliveInterval 60

Host outro
  HostName example.com
`;

describe('parseSshConfig', () => {
  it('extrai blocos Host com seus campos', () => {
    const hosts = parseSshConfig(SAMPLE);
    expect(hosts).toEqual([
      {
        host: 'meuvps',
        hostName: '203.0.113.10',
        user: 'ygor',
        port: 2222,
        identityFile: '~/.ssh/id_ed25519',
      },
      { host: 'outro', hostName: 'example.com', user: null, port: null, identityFile: null },
    ]);
  });
  it('ignora curingas e devolve [] pra texto vazio', () => {
    expect(parseSshConfig('')).toEqual([]);
    expect(parseSshConfig('Host *\n  User x')).toEqual([]);
  });
});
