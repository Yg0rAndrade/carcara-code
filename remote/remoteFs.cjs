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

  return { listDir };
}

module.exports = { makeRemoteFs };
