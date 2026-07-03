'use strict';

// Gerenciador de conexões ssh2, uma por hostKey, reusada entre canais.
function makeConnections(deps) {
  const {
    Client, getProfile, getSecret, readKey, knownHosts,
    confirmHostKey, onStatus, agentFor,
  } = deps;
  const conns = new Map(); // hostKey -> { client, status, endTimer }

  function buildConnectConfig(hostKey, profile) {
    const cfg = {
      host: profile.host,
      port: profile.port || 22,
      username: profile.user,
      keepaliveInterval: 15000,
      hostVerifier: (keyBuf, verify) => {
        const state = knownHosts.check(hostKey, keyBuf);
        if (state === 'trusted') return verify(true);
        Promise.resolve(confirmHostKey(hostKey, knownHosts.fingerprint(keyBuf), state))
          .then((ok) => { if (ok) knownHosts.trust(hostKey, keyBuf); verify(!!ok); })
          .catch(() => verify(false));
      },
    };
    if (profile.authType === 'key') {
      cfg.privateKey = readKey(profile.keyPath);
      const pass = getSecret(hostKey);
      if (pass) cfg.passphrase = pass;
    } else if (profile.authType === 'password') {
      cfg.password = getSecret(hostKey);
    } else if (profile.authType === 'agent') {
      cfg.agent = agentFor();
    }
    return cfg;
  }

  function connFor(hostKey) {
    const existing = conns.get(hostKey);
    if (existing && existing.status === 'connected') {
      if (existing.endTimer) { clearTimeout(existing.endTimer); existing.endTimer = null; }
      return Promise.resolve(existing.client);
    }
    const profile = getProfile(hostKey);
    if (!profile) return Promise.reject(new Error('Perfil remoto não encontrado: ' + hostKey));

    const client = new Client();
    const rec = { client, status: 'connecting', endTimer: null };
    conns.set(hostKey, rec);
    onStatus(hostKey, 'connecting');

    return new Promise((resolve, reject) => {
      let settled = false;
      client.on('ready', () => {
        rec.status = 'connected';
        onStatus(hostKey, 'connected');
        settled = true; resolve(client);
      });
      client.on('error', (err) => {
        rec.status = 'error';
        onStatus(hostKey, 'error');
        if (!settled) { settled = true; reject(err); }
      });
      client.on('close', () => {
        if (conns.get(hostKey) === rec) {
          if (rec.status === 'connected') { rec.status = 'disconnected'; onStatus(hostKey, 'disconnected'); }
          conns.delete(hostKey);
        }
        if (!settled) { settled = true; reject(new Error('conexão fechada antes de conectar')); }
      });
      try { client.connect(buildConnectConfig(hostKey, profile)); }
      catch (err) { if (!settled) { settled = true; reject(err); } }
    });
  }

  return {
    connFor,
    status: (hostKey) => (conns.get(hostKey) || {}).status || 'idle',
    reconnect(hostKey) { const r = conns.get(hostKey); if (r) { try { r.client.removeAllListeners('close'); } catch {} try { r.client.end(); } catch {} conns.delete(hostKey); } return connFor(hostKey); },
    end(hostKey) {
      const r = conns.get(hostKey);
      if (!r) return;
      r.endTimer = setTimeout(() => { try { r.client.end(); } catch {} if (conns.get(hostKey) === r) conns.delete(hostKey); }, 3000);
    },
    endAll() { for (const [, r] of conns) { try { r.client.end(); } catch {} } conns.clear(); },
  };
}

module.exports = { makeConnections };
