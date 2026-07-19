// Motor de descoberta das portas de um projeto. Parte PURA (parsers + walk-up),
// testável via scripts/port-scan.smoke.cjs; parte que toca o SO (child_process)
// ramifica por process.platform — mesma regra do electron/platform.cjs.
// DRY: o parse do netstat/lsof é a fonte única (o killPortOccupant reusa daqui).

// netstat -ano (Windows): linhas "TCP  end:porta  ...  LISTENING  PID".
function parseNetstatListening(stdout) {
  const map = new Map();
  for (const line of String(stdout || '').split('\n')) {
    const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (m) map.set(Number(m[1]), Number(m[2]));
  }
  return map;
}

// lsof -nP -iTCP -sTCP:LISTEN (POSIX): col 2 = PID, campo NAME termina "...:porta (LISTEN)".
function parseLsofListening(stdout) {
  const map = new Map();
  for (const line of String(stdout || '').split('\n')) {
    if (!/\(LISTEN\)/.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    const pid = Number(cols[1]);
    const nameField = cols[cols.length - 2] || '';
    const pm = nameField.match(/:(\d+)$/);
    if (pid && pm) map.set(Number(pm[1]), pid);
  }
  return map;
}

// Linhas "pid|ppid|name" (do Get-CimInstance formatado no processMaps).
function parseCimProcesses(stdout) {
  const parent = new Map();
  const name = new Map();
  for (const line of String(stdout || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i1 = t.indexOf('|');
    const i2 = t.indexOf('|', i1 + 1);
    if (i1 < 0 || i2 < 0) continue;
    const pid = Number(t.slice(0, i1));
    const ppid = Number(t.slice(i1 + 1, i2));
    const nm = t.slice(i2 + 1);
    if (pid) {
      parent.set(pid, ppid);
      name.set(pid, nm);
    }
  }
  return { parent, name };
}

// ps -eo pid=,ppid=,comm= (POSIX): "  pid  ppid  comm".
function parsePsProcesses(stdout) {
  const parent = new Map();
  const name = new Map();
  for (const line of String(stdout || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (m) {
      const pid = Number(m[1]);
      parent.set(pid, Number(m[2]));
      name.set(pid, m[3]);
    }
  }
  return { parent, name };
}

// Puro: pra cada porta, sobe pid->ppid até bater num root do projeto (acha) ou
// esgotar (ignora). Anti-ciclo (set de visitados) + teto de profundidade.
function portsForRoots(rootPids, portMap, parentMap, nameMap) {
  const roots = rootPids instanceof Set ? rootPids : new Set(rootPids);
  const out = [];
  for (const [port, pid] of portMap) {
    let cur = pid;
    let depth = 0;
    const seen = new Set();
    while (cur && !seen.has(cur) && depth < 64) {
      if (roots.has(cur)) {
        out.push({ port, pid, name: (nameMap && nameMap.get(pid)) || '' });
        break;
      }
      seen.add(cur);
      cur = parentMap.get(cur);
      depth++;
    }
  }
  return out;
}

// Comandos por SO (estilo TABLE do platform.cjs). POSIX default = linux (mac idem).
function cmdFor(platform = process.platform) {
  if (platform === 'win32') {
    return {
      portList: ['netstat', ['-ano']],
      procList: [
        'powershell',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)" }',
        ],
      ],
    };
  }
  return {
    portList: ['lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']],
    procList: ['ps', ['-eo', 'pid=,ppid=,comm=']],
  };
}

const { execFile } = require('child_process');

// Roda um comando com timeout curto; resolve stdout ('' em qualquer erro — nunca lança).
function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) =>
        resolve(err ? '' : String(out || '')),
      );
    } catch {
      resolve('');
    }
  });
}

async function listeningPortMap() {
  const [cmd, args] = cmdFor().portList;
  const out = await run(cmd, args);
  return process.platform === 'win32' ? parseNetstatListening(out) : parseLsofListening(out);
}

async function processMaps() {
  const [cmd, args] = cmdFor().procList;
  const out = await run(cmd, args);
  return process.platform === 'win32' ? parseCimProcesses(out) : parsePsProcesses(out);
}

// Orquestra: descobre porta->pid e a árvore de pais, e devolve só as portas cujo
// dono descende de um dos rootPids. Nunca lança.
async function scanPortsForRoots(rootPids) {
  try {
    const [portMap, maps] = await Promise.all([listeningPortMap(), processMaps()]);
    return portsForRoots(rootPids, portMap, maps.parent, maps.name);
  } catch {
    return [];
  }
}

module.exports = {
  parseNetstatListening,
  parseLsofListening,
  parseCimProcesses,
  parsePsProcesses,
  portsForRoots,
  cmdFor,
  listeningPortMap,
  processMaps,
  scanPortsForRoots,
};
