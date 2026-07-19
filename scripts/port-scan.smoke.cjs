// Smoke das funções PURAS do motor de portas. Uso: node scripts/port-scan.smoke.cjs
const {
  parseNetstatListening,
  parseLsofListening,
  parseCimProcesses,
  parsePsProcesses,
  portsForRoots,
  cmdFor,
} = require('../electron/port-scan.cjs');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('  FALHA: ' + msg);
    fail++;
  }
}

// --- netstat (Windows): pega só LISTENING, v4 e v6, ignora o resto ---
const NETSTAT = [
  '',
  'Conexões ativas',
  '  Proto  Endereço local         Endereço externo       Estado          PID',
  '  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       12345',
  '  TCP    [::]:5173              [::]:0                 LISTENING       12345',
  '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       6789',
  '  TCP    127.0.0.1:52000        127.0.0.1:5173         ESTABLISHED     999',
  '  UDP    0.0.0.0:1900           *:*                                    111',
].join('\n');
const nm = parseNetstatListening(NETSTAT);
assert(nm.get(5173) === 12345, 'netstat: 5173 -> 12345');
assert(nm.get(8080) === 6789, 'netstat: 8080 -> 6789');
assert(!nm.has(52000), 'netstat: ignora ESTABLISHED');
assert(!nm.has(1900), 'netstat: ignora UDP');

// --- lsof (POSIX) ---
const LSOF = [
  'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
  'node    12345 ygor   23u  IPv4 0x1      0t0  TCP *:5173 (LISTEN)',
  'node    12345 ygor   24u  IPv6 0x2      0t0  TCP *:5173 (LISTEN)',
  'python   6789 ygor    5u  IPv4 0x3      0t0  TCP 127.0.0.1:8080 (LISTEN)',
].join('\n');
const lm = parseLsofListening(LSOF);
assert(lm.get(5173) === 12345, 'lsof: 5173 -> 12345');
assert(lm.get(8080) === 6789, 'lsof: 8080 -> 6789');

// --- CIM (Windows): pid|ppid|name ---
const CIM = ['12345|12000|node.exe', '12000|4000|powershell.exe', '6789|12345|python.exe'].join(
  '\n',
);
const cim = parseCimProcesses(CIM);
assert(cim.parent.get(12345) === 12000, 'cim: parent de 12345');
assert(cim.name.get(6789) === 'python.exe', 'cim: nome de 6789');

// --- ps (POSIX): pid ppid comm ---
const PS = ['12345 12000 node', '12000  4000 zsh', ' 6789 12345 python3'].join('\n');
const ps = parsePsProcesses(PS);
assert(ps.parent.get(12345) === 12000, 'ps: parent de 12345');
assert(ps.name.get(6789) === 'python3', 'ps: nome de 6789');

// --- portsForRoots: sobe a árvore até um root ---
const portMap = new Map([
  [5173, 12345],
  [8080, 6789],
  [3000, 55555],
]);
const parentMap = new Map([
  [12345, 12000],
  [12000, 4000],
  [6789, 12345],
  [55555, 1],
]);
const nameMap = new Map([
  [12345, 'node'],
  [6789, 'python'],
  [55555, 'chrome'],
]);
const found = portsForRoots([12000], portMap, parentMap, nameMap);
const ports = found.map((f) => f.port).sort((a, b) => a - b);
assert(JSON.stringify(ports) === '[5173,8080]', 'portsForRoots: 5173 e 8080 (root 12000)');
assert(!ports.includes(3000), 'portsForRoots: 3000 (dono externo) fora');
assert(found.find((f) => f.port === 8080).name === 'python', 'portsForRoots: nome vem do nameMap');

// --- portsForRoots: anti-ciclo não trava ---
const cyc = portsForRoots(
  [9],
  new Map([[1234, 100]]),
  new Map([
    [100, 200],
    [200, 100],
  ]),
);
assert(Array.isArray(cyc) && cyc.length === 0, 'portsForRoots: ciclo não trava e não acha');

// --- cmdFor: comandos por SO ---
assert(cmdFor('win32').portList[0] === 'netstat', 'cmdFor win32 usa netstat');
assert(cmdFor('linux').portList[0] === 'lsof', 'cmdFor linux usa lsof');
assert(cmdFor('darwin').procList[0] === 'ps', 'cmdFor darwin usa ps');

if (fail) {
  console.error(`\n${fail} falha(s).`);
  process.exit(1);
}
console.log('port-scan smoke OK');
