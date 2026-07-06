'use strict';

// Embrulha o node-pty no contrato SessionTransport. Comportamento idêntico ao
// pty.spawn que existia inline no main.js.
class LocalPty {
  constructor({ ptyLib, shell, env, cwd, cols, rows }) {
    this.proc = ptyLib.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd,
      env,
    });
  }
  write(data) {
    this.proc.write(data);
  }
  resize(cols, rows) {
    try {
      this.proc.resize(cols, rows);
    } catch {}
  }
  onData(cb) {
    this.proc.onData(cb);
  }
  onExit(cb) {
    this.proc.onExit(cb);
  }
  kill() {
    try {
      this.proc.kill();
    } catch {}
  }
}

module.exports = { LocalPty };
