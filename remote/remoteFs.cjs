'use strict';
const path = require('path');
const { parseSshUri, buildSshUri, hostKey } = require('./sshUri.cjs');

// Ops de arquivo remoto via SFTP sobre URIs ssh://user@host:port/dir. Puro: recebe
// `getSftp(hostKey) -> Promise<sftp>` (sessão SFTP do ssh2, API callback) e
// `isBinaryExt(ext) -> bool` (classificação de "não é texto" reusada do main).
function makeRemoteFs({ getSftp, isBinaryExt }) {
  // Reconstrói a URI de um filho/destino trocando só o caminho remoto (posix).
  function withDir(uri, remoteDir) {
    const p = parseSshUri(uri);
    return buildSshUri({ user: p.user, host: p.host, port: p.port, remoteDir });
  }
  function remotePathOf(uri) {
    return parseSshUri(uri).remoteDir;
  }
  async function sftpOf(uri) {
    return getSftp(hostKey(uri));
  }

  async function listDir(uri) {
    const sftp = await sftpOf(uri);
    const dir = remotePathOf(uri);
    const list = await new Promise((resolve, reject) => {
      sftp.readdir(dir, (err, l) => (err ? reject(err) : resolve(l || [])));
    });
    return list
      .map((en) => {
        const isDir = !!(en.attrs && en.attrs.isDirectory && en.attrs.isDirectory());
        return {
          name: en.filename,
          path: withDir(uri, path.posix.join(dir, en.filename)),
          isDir,
          isLink: false,
        };
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  }

  async function readFile(uri) {
    const ext = path.posix.extname(remotePathOf(uri)).toLowerCase();
    // Imagem/PDF/mídia/planilha/binário: preview remoto fica pra depois -> sinaliza binário.
    if (isBinaryExt(ext)) return { binary: true };
    const sftp = await sftpOf(uri);
    const p = remotePathOf(uri);
    try {
      const size = await new Promise((resolve, reject) => {
        sftp.stat(p, (err, st) => (err ? reject(err) : resolve(st.size)));
      });
      if (size > 1024 * 1024) return { error: 'arquivo muito grande (>1MB) pra exibir' };
      const buf = await new Promise((resolve, reject) => {
        sftp.readFile(p, (err, b) => (err ? reject(err) : resolve(b)));
      });
      return { content: buf.toString('utf8') };
    } catch (err) {
      return { error: String((err && err.message) || err) };
    }
  }

  function call(fn) {
    return new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))));
  }
  const wrap = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      return { error: String((err && err.message) || err) };
    }
  };

  function writeFile(uri, content) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      // Texto (string) vira utf8; Buffer (upload de arquivo binário) vai como está.
      const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
      await call((cb) => sftp.writeFile(remotePathOf(uri), data, cb));
      return { ok: true };
    });
  }
  function createFile(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      await call((cb) => sftp.writeFile(remotePathOf(uri), Buffer.from('', 'utf8'), cb));
      return { ok: true, path: uri };
    });
  }
  function mkdir(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      await call((cb) => sftp.mkdir(remotePathOf(uri), cb));
      return { ok: true, path: uri };
    });
  }
  function rename(uri, newName) {
    const name = String(newName || '').trim();
    if (!name || name.includes('/') || name.includes('\\'))
      return Promise.resolve({ error: 'nome inválido' });
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      const from = remotePathOf(uri);
      const to = path.posix.join(path.posix.dirname(from), name);
      await call((cb) => sftp.rename(from, to, cb));
      return { ok: true, path: withDir(uri, to) };
    });
  }
  function remove(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      const p = remotePathOf(uri);
      const isDir = await call((cb) => sftp.stat(p, cb)).then((st) => st.isDirectory());
      await call((cb) => (isDir ? sftp.rmdir(p, cb) : sftp.unlink(p, cb)));
      return { ok: true };
    });
  }

  return { listDir, readFile, writeFile, createFile, mkdir, rename, remove };
}

module.exports = { makeRemoteFs };
