'use strict';
const fs = require('fs');

// Persiste { [hostKey]: base64(cifra) } num arquivo. `crypto` é o safeStorage do
// Electron em produção (injetado pra ser testável sem Electron).
function makeSecretStore({ crypto, filePath }) {
  function readAll() {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
  }
  function writeAll(obj) {
    try { fs.writeFileSync(filePath, JSON.stringify(obj)); return true; }
    catch { return false; }
  }
  const available = () => {
    try { return !!crypto.isEncryptionAvailable(); } catch { return false; }
  };
  return {
    available,
    save(hostKey, secret) {
      if (!available()) return false;
      const all = readAll();
      all[hostKey] = crypto.encryptString(secret).toString('base64');
      return writeAll(all);
    },
    load(hostKey) {
      if (!available()) return null;
      const all = readAll();
      if (!all[hostKey]) return null;
      try { return crypto.decryptString(Buffer.from(all[hostKey], 'base64')); }
      catch { return null; }
    },
    remove(hostKey) {
      const all = readAll();
      if (all[hostKey]) { delete all[hostKey]; writeAll(all); }
    },
  };
}

module.exports = { makeSecretStore };
