'use strict';

// Descoberta das portas em escuta NA VPS, pra oferecer uma lista em vez de obrigar a
// pessoa a lembrar em que porta o dev server subiu.
//
// A parte que toca a rede é só o `exec` (fica no main); aqui mora o parser, que é puro e
// entende os dois formatos que aparecem num servidor Linux qualquer: o `ss` (padrão nas
// distros atuais) e o `netstat` (máquinas antigas / imagens enxutas).

// Um comando só, com fallback: `ss` primeiro; se não existir (exit 127), `netstat`.
// `-H` tira o cabeçalho do ss; `-p` traz o nome do processo (vazio sem root, tudo bem).
const LIST_CMD =
  'ss -Hltnp 2>/dev/null || netstat -ltnp 2>/dev/null || netstat -ltn 2>/dev/null || true';

// "0.0.0.0:80" → 80 · "[::]:80" → 80 · "*:3000" → 3000 · "127.0.0.1:6379" → 6379
function portOf(localAddr) {
  const s = String(localAddr || '');
  const i = s.lastIndexOf(':');
  if (i === -1) return null;
  const n = Number(s.slice(i + 1));
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

// Endereço sem a porta, normalizado. Serve pra UI dizer "só no loopback" — que é
// justamente o caso em que o túnel é a ÚNICA forma de ver a página.
function addrOf(localAddr) {
  const s = String(localAddr || '');
  const i = s.lastIndexOf(':');
  return i === -1 ? s : s.slice(0, i);
}

const LOOPBACK = new Set(['127.0.0.1', '[::1]', '::1', 'localhost']);

// ss: `users:(("nginx",pid=1234,fd=6),("nginx",pid=1235,fd=7))` → "nginx"
// netstat: `1234/nginx: master` → "nginx: master"
function procOf(line) {
  const ss = line.match(/users:\(\("([^"]+)"/);
  if (ss) return ss[1];
  const ns = line.match(/\s(\d+)\/(\S.*)$/);
  if (ns) return ns[2].trim();
  return '';
}

// Devolve [{ port, addr, proc, loopback }], sem repetir porta e em ordem crescente.
// Quando a mesma porta aparece em IPv4 e IPv6 (o caso comum), fica o registro mais
// informativo: o que tem nome de processo e o que NÃO é só loopback.
function parseListening(stdout) {
  const byPort = new Map();
  for (const raw of String(stdout || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    let local = null;
    if (cols[0] === 'LISTEN') {
      local = cols[3]; // ss -H: State Recv-Q Send-Q Local Peer [users]
    } else if (/^tcp6?$/i.test(cols[0]) && cols.includes('LISTEN')) {
      local = cols[3]; // netstat: Proto Recv-Q Send-Q Local Foreign State [pid/prog]
    } else {
      continue;
    }
    const port = portOf(local);
    if (port == null) continue;
    const addr = addrOf(local);
    const entry = { port, addr, proc: procOf(line), loopback: LOOPBACK.has(addr) };
    const prev = byPort.get(port);
    if (!prev) {
      byPort.set(port, entry);
      continue;
    }
    // Funde: mantém o nome de processo que existir e o "não-loopback" se algum for.
    prev.proc = prev.proc || entry.proc;
    if (!entry.loopback && prev.loopback) {
      prev.addr = entry.addr;
      prev.loopback = false;
    }
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port);
}

module.exports = { LIST_CMD, parseListening, portOf, addrOf, procOf };
