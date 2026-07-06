import { describe, it, expect } from 'vitest';
import { makeRemoteFs } from './remoteFs.cjs';

// SFTP fake: API callback do ssh2. `attrs` tem isDirectory() como o Stats do ssh2.
function fakeSftp(overrides = {}) {
  return {
    readdir: (p, cb) =>
      cb(null, [
        { filename: 'src', attrs: { isDirectory: () => true, size: 0 } },
        { filename: 'b.txt', attrs: { isDirectory: () => false, size: 5 } },
        { filename: 'a.txt', attrs: { isDirectory: () => false, size: 5 } },
      ]),
    ...overrides,
  };
}
const mk = (sftp) => makeRemoteFs({ getSftp: async () => sftp, isBinaryExt: () => false });

describe('remoteFs.listDir', () => {
  it('lista com pastas primeiro e devolve URIs ssh:// completas nos filhos', async () => {
    const rfs = mk(fakeSftp());
    const items = await rfs.listDir('ssh://root@h:22/root');
    expect(items.map((i) => i.name)).toEqual(['src', 'a.txt', 'b.txt']);
    expect(items[0]).toMatchObject({ name: 'src', isDir: true, path: 'ssh://root@h:22/root/src' });
    expect(items[1]).toMatchObject({
      name: 'a.txt',
      isDir: false,
      path: 'ssh://root@h:22/root/a.txt',
    });
  });

  it('lê o diretório certo da URI (remoteDir)', async () => {
    let seen = null;
    const rfs = mk(
      fakeSftp({
        readdir: (p, cb) => {
          seen = p;
          cb(null, []);
        },
      }),
    );
    await rfs.listDir('ssh://root@h:22/home/ygor/app');
    expect(seen).toBe('/home/ygor/app');
  });

  it('propaga erro do readdir como throw', async () => {
    const rfs = mk(fakeSftp({ readdir: (p, cb) => cb(new Error('sem permissão')) }));
    await expect(rfs.listDir('ssh://root@h:22/root')).rejects.toThrow('sem permissão');
  });
});

describe('remoteFs.readFile', () => {
  const withStat = (size, readImpl) => ({
    stat: (p, cb) => cb(null, { size }),
    readFile: readImpl,
  });

  it('devolve o conteúdo de texto', async () => {
    const rfs = makeRemoteFs({
      getSftp: async () => withStat(3, (p, cb) => cb(null, Buffer.from('oi\n'))),
      isBinaryExt: () => false,
    });
    expect(await rfs.readFile('ssh://root@h:22/root/a.txt')).toEqual({ content: 'oi\n' });
  });

  it('marca binário por extensão sem ler o conteúdo', async () => {
    let read = 0;
    const rfs = makeRemoteFs({
      getSftp: async () =>
        withStat(10, (p, cb) => {
          read++;
          cb(null, Buffer.from('x'));
        }),
      isBinaryExt: (ext) => ext === '.png',
    });
    expect(await rfs.readFile('ssh://root@h:22/root/logo.png')).toEqual({ binary: true });
    expect(read).toBe(0);
  });

  it('recusa texto acima de 1MB', async () => {
    const rfs = makeRemoteFs({
      getSftp: async () => withStat(2 * 1024 * 1024, (p, cb) => cb(null, Buffer.from(''))),
      isBinaryExt: () => false,
    });
    const r = await rfs.readFile('ssh://root@h:22/root/big.log');
    expect(r.error).toMatch(/grande/);
  });
});

describe('remoteFs escrita', () => {
  function spySftp() {
    return {
      calls: [],
      writeFile(p, data, cb) {
        this.calls.push(['writeFile', p, data.toString()]);
        cb(null);
      },
      mkdir(p, cb) {
        this.calls.push(['mkdir', p]);
        cb(null);
      },
      rename(a, b, cb) {
        this.calls.push(['rename', a, b]);
        cb(null);
      },
      unlink(p, cb) {
        this.calls.push(['unlink', p]);
        cb(null);
      },
      rmdir(p, cb) {
        this.calls.push(['rmdir', p]);
        cb(null);
      },
      stat(p, cb) {
        cb(null, { isDirectory: () => this._isDir });
      },
      _isDir: false,
    };
  }
  const mk2 = (sftp) => makeRemoteFs({ getSftp: async () => sftp, isBinaryExt: () => false });

  it('writeFile grava no caminho remoto', async () => {
    const s = spySftp();
    expect(await mk2(s).writeFile('ssh://root@h:22/root/a.txt', 'oi')).toEqual({ ok: true });
    expect(s.calls[0]).toEqual(['writeFile', '/root/a.txt', 'oi']);
  });

  it('rename move dentro da mesma pasta e devolve a URI nova', async () => {
    const s = spySftp();
    const r = await mk2(s).rename('ssh://root@h:22/root/a.txt', 'b.txt');
    expect(r).toEqual({ ok: true, path: 'ssh://root@h:22/root/b.txt' });
    expect(s.calls[0]).toEqual(['rename', '/root/a.txt', '/root/b.txt']);
  });

  it('rename recusa nome com barra', async () => {
    const r = await mk2(spySftp()).rename('ssh://root@h:22/root/a.txt', 'x/y');
    expect(r.error).toMatch(/inválido/);
  });

  it('remove usa rmdir em pasta e unlink em arquivo', async () => {
    const s = spySftp();
    s._isDir = true;
    await mk2(s).remove('ssh://root@h:22/root/pasta');
    expect(s.calls[0][0]).toBe('rmdir');
    const s2 = spySftp();
    await mk2(s2).remove('ssh://root@h:22/root/a.txt');
    expect(s2.calls[0][0]).toBe('unlink');
  });
});
