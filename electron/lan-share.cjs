// "Abrir no celular": expõe o preview (que só escuta em localhost) pra rede local,
// sem reiniciar o dev server. Um servidor HTTP em 0.0.0.0 repassa tudo, inclusive o
// WebSocket do HMR, pro servidor do projeto via httpxy. Vale pra qualquer stack
// (Vite, Next, PHP...), porque não depende de flag `--host` de cada ferramenta.
//
// As partes de DECISÃO (qual IP mostrar, qual porta repassar) são funções puras,
// testáveis sem rede (lan-share.test.js).
const http = require('http');
const os = require('os');

// Adaptadores que quase nunca são a rede Wi-Fi/cabo do usuário: o celular não alcança
// esses IPs, então só servem de último recurso.
const VIRTUAL_RE =
  /vethernet|virtualbox|vmware|vbox|docker|wsl|hyper-v|loopback|tailscale|zerotier|wireguard|utun|^tun|^tap|^br-|^veth|awdl|llw|bluetooth/i;

function isPrivateV4(a) {
  if (/^10\./.test(a) || /^192\.168\./.test(a)) return true;
  const m = /^172\.(\d+)\./.exec(a);
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}

// IPv4 que o celular na mesma rede consegue abrir, ou null. Prefere IP privado de
// adaptador "de verdade" (Wi-Fi/Ethernet) a adaptadores virtuais.
function pickLanAddress(ifaces = os.networkInterfaces()) {
  let best = null;
  let bestScore = -1;
  for (const [name, list] of Object.entries(ifaces || {})) {
    for (const it of list || []) {
      const v4 = it.family === 'IPv4' || it.family === 4;
      if (!v4 || it.internal || /^169\.254\./.test(it.address)) continue;
      const score = (isPrivateV4(it.address) ? 2 : 0) + (VIRTUAL_RE.test(name) ? 0 : 1);
      if (score > bestScore) {
        best = it.address;
        bestScore = score;
      }
    }
  }
  return best;
}

// Porta local do preview a partir da URL que ele está mostrando. Só aceita o próprio
// computador (localhost/127.0.0.1/::1) — nunca vira repasse pra outro host.
function localTarget(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host)) return null;
  const port = Number(u.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { port, path: u.pathname + u.search };
}

// IP de quem pediu, sem o prefixo IPv4-mapeado ("::ffff:192.168.0.5" -> "192.168.0.5").
function clientIp(req) {
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

// Sobe o repasse 0.0.0.0:<porta livre> -> localhost:<targetPort>. Devolve a porta
// e um close() que derruba também as conexões abertas (celular com HMR conectado).
// onLog (opcional) recebe uma entrada por evento, pro painel de logs do card:
//   { kind: 'http', method, url, status, ms, ip } — requisição respondida
//   { kind: 'ws', url, ip }                       — conexão de recarga ao vivo (HMR)
//   { kind: 'error', url, ip, message }           — o servidor do projeto não respondeu
async function startLanShare({ targetPort, port = 0, onLog }) {
  const log = (entry) => {
    try {
      onLog?.({ t: Date.now(), ...entry });
    } catch {}
  };
  const { createProxyServer } = await import('httpxy');
  // changeOrigin: o dev server recebe Host "localhost:<porta>", como se fosse o
  // próprio preview — evita bloqueio de host desconhecido em alguns frameworks.
  const proxy = createProxyServer({
    target: `http://localhost:${targetPort}`,
    ws: true,
    changeOrigin: true,
  });
  proxy.on('error', (err, req, res) => {
    log({
      kind: 'error',
      url: req?.url,
      ip: req ? clientIp(req) : '',
      message: err?.code || err?.message,
    });
    try {
      if (res && typeof res.writeHead === 'function') {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Carcará: o servidor do projeto não respondeu.');
      } else if (res && typeof res.destroy === 'function') {
        res.destroy();
      }
    } catch {}
  });
  const server = http.createServer((req, res) => {
    const start = Date.now();
    res.on('finish', () =>
      log({
        kind: 'http',
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms: Date.now() - start,
        ip: clientIp(req),
      }),
    );
    proxy.web(req, res).catch(() => {});
  });
  server.on('upgrade', (req, socket, head) => {
    log({ kind: 'ws', url: req.url, ip: clientIp(req) });
    proxy.ws(req, socket, {}, head).catch(() => socket.destroy());
  });
  // Rastreia os sockets na mão: o closeAllConnections não pega os que viraram
  // WebSocket (upgrade), e sem derrubá-los o server.close() nunca termina.
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        for (const s of sockets) s.destroy();
      }),
  };
}

module.exports = { pickLanAddress, localTarget, isPrivateV4, startLanShare };
