import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pickLanAddress, localTarget, startLanShare } = require('./lan-share.cjs');

const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });

describe('pickLanAddress', () => {
  it('prefere o Wi-Fi ao adaptador virtual do WSL/Hyper-V', () => {
    const ip = pickLanAddress({
      'vEthernet (WSL)': [v4('172.20.0.1')],
      'Wi-Fi': [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('192.168.0.12')],
      Loopback: [v4('127.0.0.1', true)],
    });
    expect(ip).toBe('192.168.0.12');
  });
  it('ignora link-local (169.254) e interno', () => {
    expect(pickLanAddress({ eth0: [v4('169.254.3.4'), v4('127.0.0.1', true)] })).toBeNull();
  });
  it('aceita family numérica (Node 18.0–18.3)', () => {
    expect(pickLanAddress({ en0: [{ family: 4, address: '10.0.0.5', internal: false }] })).toBe(
      '10.0.0.5',
    );
  });
  it('sem nada útil devolve null', () => {
    expect(pickLanAddress({})).toBeNull();
  });
});

describe('localTarget', () => {
  it('extrai porta e caminho de URL local', () => {
    expect(localTarget('http://localhost:5173/app?x=1')).toEqual({ port: 5173, path: '/app?x=1' });
    expect(localTarget('http://127.0.0.1:8000/')).toEqual({ port: 8000, path: '/' });
    expect(localTarget('http://[::1]:3000/')).toEqual({ port: 3000, path: '/' });
  });
  it('recusa host externo, https e lixo', () => {
    expect(localTarget('http://example.com:80/')).toBeNull();
    expect(localTarget('https://localhost:5173/')).toBeNull();
    expect(localTarget('nada')).toBeNull();
  });
});

describe('startLanShare', () => {
  it('repassa a requisição pro servidor local e fecha limpo', async () => {
    const target = http.createServer((req, res) => res.end('ok ' + req.url));
    await new Promise((r) => target.listen(0, '127.0.0.1', r));
    const share = await startLanShare({ targetPort: target.address().port });
    try {
      const body = await fetch(`http://127.0.0.1:${share.port}/oi`).then((r) => r.text());
      expect(body).toBe('ok /oi');
    } finally {
      await share.close();
      await new Promise((r) => target.close(r));
    }
  });
  it('repassa upgrade de WebSocket (HMR) nos dois sentidos', async () => {
    const target = http.createServer();
    const upgraded = [];
    target.on('upgrade', (req, socket) => {
      upgraded.push(socket);
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
      );
      socket.pipe(socket); // eco
    });
    await new Promise((r) => target.listen(0, '127.0.0.1', r));
    const share = await startLanShare({ targetPort: target.address().port });
    try {
      const echoed = await new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1',
          port: share.port,
          headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
        });
        req.on('upgrade', (_res, socket) => {
          socket.once('data', (d) => {
            resolve(String(d));
            socket.destroy();
          });
          socket.write('ping');
        });
        req.on('error', reject);
        req.end();
      });
      expect(echoed).toBe('ping');
    } finally {
      await share.close();
      // Socket que virou WebSocket não entra no close() do servidor: derruba na mão.
      for (const s of upgraded) s.destroy();
      await new Promise((r) => target.close(r));
    }
  });
  it('servidor do projeto fora do ar vira 502 (e loga o erro)', async () => {
    const logs = [];
    const share = await startLanShare({ targetPort: 1, onLog: (e) => logs.push(e) });
    try {
      const res = await fetch(`http://127.0.0.1:${share.port}/x`);
      expect(res.status).toBe(502);
      await new Promise((r) => setTimeout(r, 20));
      expect(logs.some((l) => l.kind === 'error' && l.url === '/x')).toBe(true);
      expect(logs.some((l) => l.kind === 'http' && l.status === 502)).toBe(true);
    } finally {
      await share.close();
    }
  });
});
