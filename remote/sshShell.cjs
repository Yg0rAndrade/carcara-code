'use strict';

// Escapa um caminho pra uso entre aspas simples no shell POSIX.
function shq(p) {
  return "'" + String(p).replace(/'/g, "'\\''") + "'";
}

// Embrulha um canal de shell do ssh2 no contrato SessionTransport.
class SshShell {
  constructor(client, { cols, rows, remoteDir }) {
    this.stream = null;
    this.pending = []; // writes antes do canal abrir
    this._dataCb = null;
    this._exitCb = null;
    this._lastSize = { cols: cols || 80, rows: rows || 24 };
    client.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, stream) => {
      if (err) {
        if (this._exitCb) this._exitCb({ error: err.message });
        return;
      }
      this.stream = stream;
      stream.on('data', (d) => {
        if (this._dataCb) this._dataCb(d.toString('utf8'));
      });
      stream.on('close', () => {
        if (this._exitCb) this._exitCb();
      });
      if (this._lastSize) {
        try {
          stream.setWindow(this._lastSize.rows, this._lastSize.cols, 0, 0);
        } catch {}
      }
      if (remoteDir && remoteDir !== '/') stream.write('cd ' + shq(remoteDir) + '\n');
      for (const d of this.pending) stream.write(d);
      this.pending = [];
    });
  }
  write(data) {
    if (this.stream) this.stream.write(data);
    else this.pending.push(data);
  }
  resize(cols, rows) {
    this._lastSize = { cols, rows };
    if (this.stream) {
      try {
        this.stream.setWindow(rows, cols, 0, 0);
      } catch {}
    }
  }
  onData(cb) {
    this._dataCb = cb;
  }
  onExit(cb) {
    this._exitCb = cb;
  }
  kill() {
    if (this.stream) {
      try {
        this.stream.end();
      } catch {}
    }
  }
}

module.exports = { SshShell };
