import { describe, it, expect, vi } from 'vitest';
import { SshShell } from './sshShell.cjs';

function fakeStream() {
  const handlers = {};
  return {
    on(ev, cb) {
      handlers[ev] = cb;
      return this;
    },
    write: vi.fn(),
    setWindow: vi.fn(),
    end: vi.fn(),
    _emit(ev, ...a) {
      handlers[ev] && handlers[ev](...a);
    },
  };
}

describe('SshShell', () => {
  it('abre shell, faz cd no remoteDir e repassa data', () => {
    const stream = fakeStream();
    const client = { shell: vi.fn((opts, cb) => cb(null, stream)) };
    const t = new SshShell(client, { cols: 80, rows: 24, remoteDir: '/srv/app' });

    expect(client.shell).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'xterm-256color', cols: 80, rows: 24 }),
      expect.any(Function),
    );
    // cd inicial no diretório do projeto
    expect(stream.write).toHaveBeenCalledWith("cd '/srv/app'\n");

    const got = [];
    t.onData((d) => got.push(d));
    stream._emit('data', Buffer.from('remoto'));
    expect(got).toEqual(['remoto']);
  });

  it('bufferiza writes até o canal abrir', () => {
    let openCb;
    const stream = fakeStream();
    const client = {
      shell: vi.fn((opts, cb) => {
        openCb = () => cb(null, stream);
      }),
    };
    const t = new SshShell(client, { cols: 80, rows: 24, remoteDir: '/' });
    t.write('echo oi\r'); // canal ainda não abriu
    expect(stream.write).not.toHaveBeenCalledWith('echo oi\r');
    openCb(); // agora abre
    expect(stream.write).toHaveBeenCalledWith('echo oi\r');
  });

  it('resize chama setWindow(rows, cols) e onExit dispara no close', () => {
    const stream = fakeStream();
    const client = { shell: (opts, cb) => cb(null, stream) };
    const t = new SshShell(client, { cols: 80, rows: 24, remoteDir: '/' });
    t.resize(120, 40);
    expect(stream.setWindow).toHaveBeenCalledWith(40, 120, 0, 0);
    const exit = vi.fn();
    t.onExit(exit);
    stream._emit('close');
    expect(exit).toHaveBeenCalled();
  });

  it('aplica o último resize pedido quando o canal abre depois', () => {
    let openCb;
    const stream = fakeStream();
    const client = {
      shell: (opts, cb) => {
        openCb = () => cb(null, stream);
      },
    };
    const t = new SshShell(client, { cols: 80, rows: 24, remoteDir: '/' });
    t.resize(120, 40); // resize antes do canal abrir
    expect(stream.setWindow).not.toHaveBeenCalled();
    openCb(); // canal abre → aplica o último tamanho
    expect(stream.setWindow).toHaveBeenCalledWith(40, 120, 0, 0);
  });
});
