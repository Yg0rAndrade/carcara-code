// scripts/ai-console-smoke.cjs
// Smoke do console do "Gerenciar IAs": o shell do SO abre e roda um comando de verdade.
//
// Por que existe: a tela antiga subia o instalador num shell FIXO do catálogo (`sh` no
// Windows) que não existe na máquina — o construtor do PTY lançava e o botão travava em
// "Instalando…" para sempre. Aqui provamos o contrário: o shell é o do SO (platform.cjs),
// abre, aceita entrada e devolve saída. Uso: node scripts/ai-console-smoke.cjs
const os = require('node:os');
const platform = require('../electron/platform.cjs');
const { LocalPty } = require('../electron/remote/localPty.cjs');

const MARK = 'carcara-console-ok';
const TIMEOUT_MS = 20000;

function fail(msg) {
  console.error('ASSERT: ' + msg);
  process.exit(1);
}

let ptyLib;
try {
  ptyLib = require('node-pty');
} catch (e) {
  fail('node-pty não carregou: ' + e.message);
}

const shell = platform.shellFor();
const shellArgs = platform.loginArgsFor();
console.log(`shell do SO: ${shell} ${JSON.stringify(shellArgs)}`);

let proc;
try {
  // Mesmos parâmetros do handler aiConsole:ensure (shell do SO, home do usuário).
  proc = new LocalPty({
    ptyLib,
    shell,
    shellArgs,
    env: process.env,
    cwd: os.homedir(),
    cols: 80,
    rows: 24,
  });
} catch (e) {
  // Este é exatamente o modo de falha do bug antigo — e agora não pode acontecer,
  // porque o shell vem do SO e não de uma tabela nossa.
  fail(`o shell do SO não abriu: ${e.message}`);
}

let out = '';
let done = false;
const timer = setTimeout(() => {
  if (done) return;
  done = true;
  try {
    proc.kill();
  } catch {}
  fail(`o comando não ecoou "${MARK}" em ${TIMEOUT_MS}ms. Saída:\n${out.slice(-600)}`);
}, TIMEOUT_MS);

proc.onData((d) => {
  out += d;
  // O eco do próprio comando também casa; exigimos DUAS ocorrências (eco + resultado)
  // pra provar que o shell realmente EXECUTOU, e não só recebeu o texto.
  if (!done && out.split(MARK).length - 1 >= 2) {
    done = true;
    clearTimeout(timer);
    try {
      proc.kill();
    } catch {}
    console.log('ai-console smoke OK — shell abriu, recebeu entrada e executou o comando');
    process.exit(0);
  }
});

proc.onExit(() => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  fail(`o shell saiu antes de executar. Saída:\n${out.slice(-600)}`);
});

// É o que a tela faz: escreve a linha no terminal. Aqui mandamos o Enter junto porque
// não há usuário pra apertar (na UI o Enter é dele, de propósito).
setTimeout(() => proc.write(`echo ${MARK}\r`), 1500);
