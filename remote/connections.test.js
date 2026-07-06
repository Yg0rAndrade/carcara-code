import { describe, it, expect, vi } from 'vitest';
import { makeConnections } from './connections.cjs';

function fakeClient() {
  const h = {};
  return {
    on(ev, cb) {
      h[ev] = cb;
      return this;
    },
    connect: vi.fn(function (cfg) {
      this._cfg = cfg;
    }),
    end: vi.fn(),
    _ready() {
      h.ready && h.ready();
    },
    _error(e) {
      h.error && h.error(e);
    },
    _close() {
      h.close && h.close();
    },
    _cfg: null,
  };
}

const baseDeps = (client) => ({
  Client: vi.fn(function () {
    return client;
  }),
  getProfile: () => ({
    host: 'h',
    port: 22,
    user: 'ygor',
    authType: 'password',
    keyPath: '',
    remoteDir: '/srv',
  }),
  getSecret: () => 'senha',
  readKey: () => Buffer.from('KEY'),
  knownHosts: { check: () => 'trusted', trust: vi.fn(), fingerprint: () => 'SHA256:x' },
  confirmHostKey: vi.fn(async () => true),
  onStatus: vi.fn(),
  agentFor: () => '/tmp/agent.sock',
});

describe('makeConnections', () => {
  it('conecta com senha e emite connecting→connected', async () => {
    const client = fakeClient();
    const deps = baseDeps(client);
    const conns = makeConnections(deps);
    const p = conns.connFor('ygor@h:22');
    expect(deps.onStatus).toHaveBeenCalledWith('ygor@h:22', 'connecting');
    expect(client.connect).toHaveBeenCalled();
    expect(client._cfg).toMatchObject({ host: 'h', port: 22, username: 'ygor', password: 'senha' });
    client._ready();
    await expect(p).resolves.toBe(client);
    expect(deps.onStatus).toHaveBeenCalledWith('ygor@h:22', 'connected');
  });

  it('reusa a conexão já conectada', async () => {
    const client = fakeClient();
    const deps = baseDeps(client);
    const conns = makeConnections(deps);
    const p = conns.connFor('ygor@h:22');
    client._ready();
    await p;
    const again = await conns.connFor('ygor@h:22');
    expect(again).toBe(client);
    expect(deps.Client).toHaveBeenCalledTimes(1); // não recriou
  });

  it('rejeita quando a autenticação falha', async () => {
    const client = fakeClient();
    const deps = baseDeps(client);
    const conns = makeConnections(deps);
    const p = conns.connFor('ygor@h:22');
    client._error(new Error('All authentication methods failed'));
    await expect(p).rejects.toThrow(/authentication/i);
    expect(deps.onStatus).toHaveBeenCalledWith('ygor@h:22', 'error');
  });

  it('monta auth por chave quando authType=key', async () => {
    const client = fakeClient();
    const deps = {
      ...baseDeps(client),
      getProfile: () => ({
        host: 'h',
        port: 22,
        user: 'ygor',
        authType: 'key',
        keyPath: '/k/id',
        remoteDir: '/',
      }),
      getSecret: () => 'frase',
    };
    const conns = makeConnections(deps);
    const p = conns.connFor('ygor@h:22');
    client._ready();
    await p;
    expect(client._cfg).toMatchObject({ privateKey: Buffer.from('KEY'), passphrase: 'frase' });
  });

  it('rejeita se close vier antes de ready/error', async () => {
    const client = fakeClient();
    const conns = makeConnections(baseDeps(client));
    const p = conns.connFor('ygor@h:22');
    client._close();
    await expect(p).rejects.toThrow();
  });

  it('close atrasado do cliente antigo não remove o novo após reconnect', async () => {
    const client1 = fakeClient();
    const client2 = fakeClient();
    let n = 0;
    const deps = {
      ...baseDeps(client1),
      Client: vi.fn(function () {
        return n++ === 0 ? client1 : client2;
      }),
    };
    const conns = makeConnections(deps);
    const p1 = conns.connFor('ygor@h:22');
    client1._ready();
    await p1;
    const p2 = conns.reconnect('ygor@h:22');
    client2._ready();
    await p2;
    client1._close(); // close atrasado do antigo
    expect(conns.status('ygor@h:22')).toBe('connected'); // rec do client2 preservado
  });
});

describe('connections.sftp', () => {
  function fakeDeps(sftpImpl) {
    const client = {
      _h: {},
      on(ev, cb) {
        this._h[ev] = cb;
        return this;
      },
      connect() {
        setTimeout(() => this._h.ready && this._h.ready(), 0);
      },
      sftp(cb) {
        sftpImpl(cb);
      },
      end() {},
      removeAllListeners() {},
    };
    return {
      client,
      deps: {
        Client: function () {
          return client;
        },
        getProfile: () => ({ host: 'h', port: 22, user: 'root', authType: 'password' }),
        getSecret: () => 'pw',
        readKey: () => Buffer.from(''),
        knownHosts: { check: () => 'trusted', fingerprint: () => 'fp', trust: () => {} },
        confirmHostKey: () => true,
        onStatus: () => {},
        agentFor: () => '',
      },
    };
  }

  it('abre a sessão SFTP e reusa a mesma na 2ª chamada', async () => {
    let opened = 0;
    const session = { on() {} };
    const { deps } = fakeDeps((cb) => {
      opened++;
      cb(null, session);
    });
    const conns = makeConnections(deps);
    const s1 = await conns.sftp('root@h:22');
    const s2 = await conns.sftp('root@h:22');
    expect(s1).toBe(session);
    expect(s2).toBe(session);
    expect(opened).toBe(1); // cacheada
  });

  it('propaga erro do client.sftp', async () => {
    const { deps } = fakeDeps((cb) => cb(new Error('sftp falhou')));
    const conns = makeConnections(deps);
    await expect(conns.sftp('root@h:22')).rejects.toThrow('sftp falhou');
  });

  it('chamadas concorrentes abrem o canal só uma vez', async () => {
    let opened = 0;
    const session = { on() {} };
    const { deps } = fakeDeps((cb) => {
      opened++;
      setTimeout(() => cb(null, session), 0);
    });
    const conns = makeConnections(deps);
    await conns.connFor('root@h:22'); // conexão já estabelecida, como no uso real do file browser
    const [a, b] = await Promise.all([conns.sftp('root@h:22'), conns.sftp('root@h:22')]);
    expect(a).toBe(session);
    expect(b).toBe(session);
    expect(opened).toBe(1);
  });
});
