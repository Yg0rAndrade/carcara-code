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
  function remotePathOf(uri) { return parseSshUri(uri).remoteDir; }
  async function sftpOf(uri) { return getSftp(hostKey(uri)); }

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
    } catch (err) { return { error: String((err && err.message) || err) }; }
  }

  return { listDir, readFile };
}

module.exports = { makeRemoteFs };
