'use strict';

function isRemote(projectPath) {
  return typeof projectPath === 'string' && projectPath.startsWith('ssh://');
}

// ssh://user@host[:port]/remote/dir
function parseSshUri(uri) {
  if (!isRemote(uri)) return null;
  const m = /^ssh:\/\/([^@]+)@([^:/]+)(?::(\d+))?(\/.*)?$/.exec(uri);
  if (!m) return null;
  return {
    user: m[1],
    host: m[2],
    port: m[3] ? parseInt(m[3], 10) : 22,
    remoteDir: m[4] || '/',
  };
}

function buildSshUri({ user, host, port, remoteDir }) {
  const p = port || 22;
  let dir = remoteDir || '/';
  if (!dir.startsWith('/')) dir = '/' + dir;
  return `ssh://${user}@${host}:${p}${dir}`;
}

function hostKey(uri) {
  const p = parseSshUri(uri);
  return p ? `${p.user}@${p.host}:${p.port}` : '';
}

module.exports = { isRemote, parseSshUri, buildSshUri, hostKey };
