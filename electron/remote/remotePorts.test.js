import { describe, it, expect } from 'vitest';
import { parseListening, portOf, addrOf, procOf } from './remotePorts.cjs';

// Saída real de `ss -Hltnp` (Debian 12). Repare no par IPv4/IPv6 da porta 80.
const SS = `
LISTEN 0      4096       127.0.0.1:6379       0.0.0.0:*    users:(("redis-server",pid=612,fd=6))
LISTEN 0      511          0.0.0.0:80          0.0.0.0:*    users:(("nginx",pid=1234,fd=6),("nginx",pid=1235,fd=7))
LISTEN 0      511             [::]:80             [::]:*    users:(("nginx",pid=1234,fd=7))
LISTEN 0      128          0.0.0.0:22          0.0.0.0:*    users:(("sshd",pid=700,fd=3))
LISTEN 0      128        127.0.0.1:3000       0.0.0.0:*    users:(("node",pid=9001,fd=20))
`;

// Saída real de `netstat -ltnp` (imagem antiga, sem ss).
const NETSTAT = `
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      1234/nginx: master
tcp        0      0 127.0.0.1:5432          0.0.0.0:*               LISTEN      800/postgres
tcp6       0      0 :::80                   :::*                    LISTEN      1234/nginx: master
tcp6       0      0 :::22                   :::*                    LISTEN      -
`;

describe('remotePorts.parseListening (ss)', () => {
  it('extrai porta, endereço e processo', () => {
    const list = parseListening(SS);
    expect(list.map((p) => p.port)).toEqual([22, 80, 3000, 6379]);
    expect(list.find((p) => p.port === 3000)).toMatchObject({
      addr: '127.0.0.1',
      proc: 'node',
      loopback: true,
    });
    expect(list.find((p) => p.port === 6379)).toMatchObject({ proc: 'redis-server' });
  });

  it('funde IPv4 e IPv6 da mesma porta num registro só, sem loopback falso', () => {
    const p80 = parseListening(SS).find((p) => p.port === 80);
    expect(p80).toMatchObject({ addr: '0.0.0.0', proc: 'nginx', loopback: false });
    expect(parseListening(SS).filter((p) => p.port === 80)).toHaveLength(1);
  });
});

describe('remotePorts.parseListening (netstat)', () => {
  it('entende o formato antigo, inclusive o cabeçalho e o "-" sem processo', () => {
    const list = parseListening(NETSTAT);
    expect(list.map((p) => p.port)).toEqual([22, 80, 5432]);
    expect(list.find((p) => p.port === 5432)).toMatchObject({
      addr: '127.0.0.1',
      proc: 'postgres',
      loopback: true,
    });
    expect(list.find((p) => p.port === 80)).toMatchObject({ proc: 'nginx: master' });
    expect(list.find((p) => p.port === 22).proc).toBe('');
  });

  it('ignora linhas que não são de escuta e saída vazia', () => {
    expect(parseListening('')).toEqual([]);
    expect(parseListening(null)).toEqual([]);
    expect(parseListening('tcp 0 0 10.0.0.1:443 200.1.1.1:5555 ESTABLISHED 12/curl')).toEqual([]);
  });
});

describe('remotePorts — auxiliares', () => {
  it('portOf lida com IPv6, curinga e lixo', () => {
    expect(portOf('[::]:80')).toBe(80);
    expect(portOf('*:3000')).toBe(3000);
    expect(portOf('127.0.0.1:6379')).toBe(6379);
    expect(portOf('sem-porta')).toBe(null);
    expect(portOf('1.2.3.4:0')).toBe(null);
  });
  it('addrOf corta só a porta', () => {
    expect(addrOf('[::1]:8080')).toBe('[::1]');
    expect(addrOf('0.0.0.0:80')).toBe('0.0.0.0');
  });
  it('procOf prefere o formato do ss e cai no do netstat', () => {
    expect(procOf('LISTEN 0 1 *:1 *:* users:(("vite",pid=1,fd=2))')).toBe('vite');
    expect(procOf('tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN 9/nginx: master')).toBe('nginx: master');
    expect(procOf('tcp 0 0 0.0.0.0:80 0.0.0.0:* LISTEN -')).toBe('');
  });
});
