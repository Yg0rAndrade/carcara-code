'use strict';

function parseSshConfig(text) {
  const hosts = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sp = line.indexOf(' ');
    const key = (sp === -1 ? line : line.slice(0, sp)).toLowerCase();
    const val = sp === -1 ? '' : line.slice(sp + 1).trim();
    if (key === 'host') {
      if (cur) hosts.push(cur);
      cur = val.includes('*')
        ? null
        : { host: val, hostName: null, user: null, port: null, identityFile: null };
    } else if (cur) {
      if (key === 'hostname') cur.hostName = val;
      else if (key === 'user') cur.user = val;
      else if (key === 'port') cur.port = parseInt(val, 10) || null;
      else if (key === 'identityfile') cur.identityFile = val;
    }
  }
  if (cur) hosts.push(cur);
  return hosts;
}

module.exports = { parseSshConfig };
