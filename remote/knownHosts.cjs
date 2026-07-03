'use strict';
const fs = require('fs');
const crypto = require('crypto');

function makeKnownHosts({ filePath }) {
  function readAll() {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
  }
  function writeAll(obj) {
    try { fs.writeFileSync(filePath, JSON.stringify(obj)); return true; }
    catch { return false; }
  }
  const fingerprint = (keyBuf) =>
    'SHA256:' + crypto.createHash('sha256').update(keyBuf).digest('base64').replace(/=+$/, '');
  return {
    fingerprint,
    check(hostKey, keyBuf) {
      const saved = readAll()[hostKey];
      if (!saved) return 'unknown';
      return saved === fingerprint(keyBuf) ? 'trusted' : 'changed';
    },
    trust(hostKey, keyBuf) {
      const all = readAll();
      all[hostKey] = fingerprint(keyBuf);
      return writeAll(all);
    },
  };
}

module.exports = { makeKnownHosts };
