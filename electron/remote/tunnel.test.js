import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { makeTunnels } from './tunnel.cjs';

// Servidor de eco: faz o papel do dev server que estaria rodando na VPS.
function echoServer() {
  return new Promise((resolve) => {
    const srv = net.createServer((s) => s.pipe(s));
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

// Cliente ssh2 de mentira: o `forwardOut` abre um TCP de verdade pro alvo, que é
// exatamente o que o canal do SSH faria do outro lado. Assim o teste exercita o
// encanamento inteiro (accept → forwardOut → pipe duplo) sem precisar de um servidor SSH.
function fakeClient(allowedPort) {
  return {
    forwardOut(_srcIp, _srcPort, _dstIp, dstPort, cb) {
      let done = false;
      const once = (err, s) => {
        if (!done) {
          done = true;
          cb(err, s);
        }
      };
      if (dstPort !== allowedPort) return once(new Error('connect ECONNREFUSED'));
      const s = net.connect(dstPort, '127.0.0.1');
      s.on('connect', () => once(null, s));
      s.on('error', (e) => once(e));
    },
  };
}

// Manda `msg` pro túnel e resolve com o que voltar (ou rejeita se a conexão cair).
function roundTrip(port, msg) {
  return new Promise((resolve, reject) => {
    const c = net.connect(port, '127.0.0.1');
    c.on('connect', () => c.write(msg));
    c.on('data', (d) => {
      resolve(d.toString());
      c.end();
    });
    c.on('error', reject);
    c.on('close', () => reject(new Error('fechou sem resposta')));
  });
}

const cleanup = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()();
});

describe('tunnel', () => {
  it('encaminha tráfego da porta local pro alvo remoto', async () => {
    const { srv, port } = await echoServer();
    cleanup.push(() => srv.close());
    const tunnels = makeTunnels({ net, connFor: async () => fakeClient(port) });
    cleanup.push(() => tunnels.closeAll());

    const { localPort, reused } = await tunnels.open('root@vps:22', port);
    expect(reused).toBe(false);
    expect(localPort).toBeGreaterThan(0);
    expect(localPort).not.toBe(port);
    await expect(roundTrip(localPort, 'GET /')).resolves.toBe('GET /');
  });

  it('reusa o mesmo túnel pra (host, porta) repetidos', async () => {
    const { srv, port } = await echoServer();
    cleanup.push(() => srv.close());
    const tunnels = makeTunnels({ net, connFor: async () => fakeClient(port) });
    cleanup.push(() => tunnels.closeAll());

    const a = await tunnels.open('root@vps:22', port);
    const b = await tunnels.open('root@vps:22', port);
    expect(b.localPort).toBe(a.localPort);
    expect(b.reused).toBe(true);
    expect(tunnels.list()).toHaveLength(1);
  });

  it('escuta só no loopback (não expõe a porta da VPS na rede local)', async () => {
    const { srv, port } = await echoServer();
    cleanup.push(() => srv.close());
    const seen = [];
    const fakeNet = {
      createServer: (h) => {
        const s = net.createServer(h);
        const listen = s.listen.bind(s);
        s.listen = (p, host, cb) => {
          seen.push(host);
          return listen(p, host, cb);
        };
        return s;
      },
    };
    const tunnels = makeTunnels({ net: fakeNet, connFor: async () => fakeClient(port) });
    cleanup.push(() => tunnels.closeAll());
    await tunnels.open('root@vps:22', port);
    expect(seen).toEqual(['127.0.0.1']);
  });

  it('close derruba o servidor local e as conexões em curso', async () => {
    const { srv, port } = await echoServer();
    cleanup.push(() => srv.close());
    const tunnels = makeTunnels({ net, connFor: async () => fakeClient(port) });
    cleanup.push(() => tunnels.closeAll());

    const { localPort } = await tunnels.open('root@vps:22', port);
    expect(tunnels.close('root@vps:22', port)).toBe(true);
    expect(tunnels.close('root@vps:22', port)).toBe(false); // já não existe
    expect(tunnels.list()).toEqual([]);
    await expect(roundTrip(localPort, 'oi')).rejects.toBeTruthy();
  });

  it('closeHost fecha todas as portas daquele host e só dele', async () => {
    const { srv, port } = await echoServer();
    cleanup.push(() => srv.close());
    const tunnels = makeTunnels({ net, connFor: async () => fakeClient(port) });
    cleanup.push(() => tunnels.closeAll());

    await tunnels.open('root@a:22', port);
    await tunnels.open('root@a:22', port + 1); // alvo inexistente: o túnel abre mesmo assim
    await tunnels.open('root@b:22', port);
    expect(tunnels.closeHost('root@a:22')).toBe(2);
    expect(tunnels.list().map((t) => t.hostKey)).toEqual(['root@b:22']);
  });

  it('recusa porta inválida antes de tocar na conexão', async () => {
    let conectou = false;
    const tunnels = makeTunnels({
      net,
      connFor: async () => {
        conectou = true;
        return fakeClient(1);
      },
    });
    await expect(tunnels.open('root@vps:22', 0)).rejects.toThrow(/inválida/);
    await expect(tunnels.open('root@vps:22', 'abc')).rejects.toThrow(/inválida/);
    await expect(tunnels.open('root@vps:22', 70000)).rejects.toThrow(/inválida/);
    expect(conectou).toBe(false);
  });

  it('propaga a falha de conexão em vez de deixar um túnel morto de pé', async () => {
    const tunnels = makeTunnels({
      net,
      connFor: async () => {
        throw new Error('autenticação falhou');
      },
    });
    await expect(tunnels.open('root@vps:22', 3000)).rejects.toThrow(/autenticação/);
    expect(tunnels.list()).toEqual([]);
  });
});
