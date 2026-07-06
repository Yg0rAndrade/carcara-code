import { describe, it, expect, vi } from 'vitest';
import { LocalPty } from './localPty.cjs';

function fakePtyLib() {
  const proc = {
    _data: null,
    _exit: null,
    onData(cb) {
      this._data = cb;
    },
    onExit(cb) {
      this._exit = cb;
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return { lib: { spawn: vi.fn(() => proc) }, proc };
}

describe('LocalPty', () => {
  it('spawna com shell/cwd/env e repassa o contrato', () => {
    const { lib, proc } = fakePtyLib();
    const t = new LocalPty({
      ptyLib: lib,
      shell: 'bash',
      env: { A: '1' },
      cwd: '/x',
      cols: 80,
      rows: 24,
    });
    expect(lib.spawn).toHaveBeenCalledWith(
      'bash',
      [],
      expect.objectContaining({ cwd: '/x', cols: 80, rows: 24, env: { A: '1' } }),
    );

    const got = [];
    t.onData((d) => got.push(d));
    proc._data('oi');
    expect(got).toEqual(['oi']);

    t.write('ls\r');
    expect(proc.write).toHaveBeenCalledWith('ls\r');
    t.resize(100, 30);
    expect(proc.resize).toHaveBeenCalledWith(100, 30);
    t.kill();
    expect(proc.kill).toHaveBeenCalled();
  });
});
