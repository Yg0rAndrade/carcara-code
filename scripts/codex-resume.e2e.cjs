// E2E de ponta a ponta da retomada de sessão do Codex, sem GUI.
//
// O smoke `codex-app-server.smoke.cjs` só confere o PROTOCOLO (o `thread/list` responde,
// tem os campos que o Carcará consome). Ele não prova o que o usuário reclama: abrir uma
// aba, conversar, fechar o app e a conversa voltar. Este aqui faz o ciclo inteiro contra
// o `codex` de verdade, num pty, chamando as MESMAS funções que o `main.js` chama:
//
//   snapshotThreads -> (pty: codex + prompt) -> findNewThread -> mata o pty
//     -> resolveThreadId -> threadExists -> threadTitle -> (pty: codex resume <id>)
//
// Isola tudo num CODEX_HOME temporário: o histórico real do usuário não é lido nem
// sujo, e o snapshot inicial nasce vazio, que é o cenário de aba nova.
//
// Custa UM turno pequeno de modelo (o prompt é "responda apenas <marca>"). Pula sozinho
// quando não há `codex` no PATH ou quando não há login (`auth.json`), pra não quebrar CI.
//
// Ruído esperado no Windows: matar um pty faz o node-pty subir um agente auxiliar que
// às vezes cospe "Error: AttachConsole failed". É do node-pty, não do teste — quem manda
// é a última linha ("codex-resume e2e OK") e o código de saída. O pty fica no ConPTY
// padrão de propósito: é o mesmo que o app usa (electron/remote/localPty.cjs).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const log = (...a) => console.log(...a);

function fail(msg) {
  console.error('FALHOU:', msg);
  process.exit(1);
}

function have(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    encoding: 'utf8',
    windowsHide: true,
  });
  return r.status === 0;
}

if (!have('codex')) {
  log('codex nao encontrado no PATH: pulando');
  process.exit(0);
}

const realAuth = path.join(
  process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  'auth.json',
);
if (!fs.existsSync(realAuth)) {
  log('auth.json ausente (sem login no codex): pulando');
  process.exit(0);
}

// ---- ambiente isolado -------------------------------------------------------
// realpath.native porque no Windows o os.tmpdir() volta no formato 8.3
// (C:\Users\YGORAN~1\...) e o Codex resolve o caminho longo. Sem isso a chave
// [projects.<caminho>] do config.toml não casa, a TUI para na pergunta de confiança da
// pasta e nada acontece. Vale a mesma lição pro app: caminho de projeto tem que ser o
// resolvido, senão o `cwd` do thread/list não bate com o do Carcará.
const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-codex-e2e-')));
const codexHome = path.join(root, 'codex-home');
const proj = path.join(root, 'proj');
fs.mkdirSync(codexHome, { recursive: true });
fs.mkdirSync(proj, { recursive: true });
fs.copyFileSync(realAuth, path.join(codexHome, 'auth.json'));
fs.writeFileSync(path.join(proj, 'README.md'), 'e2e\n');
// String literal do TOML (aspas simples) não interpreta escape, então o caminho do
// Windows entra cru. A chave é comparada em minúsculas pelo próprio Codex.
fs.writeFileSync(
  path.join(codexHome, 'config.toml'),
  `[projects.'${proj.toLowerCase()}']\ntrust_level = "trusted"\n`,
  'utf8',
);
process.env.CODEX_HOME = codexHome;
// `--plano-b` roda o mesmo ciclo pelo leitor de rollout em disco, que é o fallback e era
// o único caminho até a 0.1.13. Serve pra medir, contra o Codex instalado, se o plano B
// ainda dá conta sozinho. O padrão é o plano A (app-server), que é o caminho suportado.
const planoB = process.argv.includes('--plano-b');
if (planoB) process.env.CARCARA_CODEX_APP_SERVER = '0';
else delete process.env.CARCARA_CODEX_APP_SERVER;
const viaEsperado = planoB ? 'rollout' : 'app';

log('CODEX_HOME =', codexHome);
log('projeto    =', proj);
log('plano      =', planoB ? 'B (leitor de rollout)' : 'A (app-server)');

const repo = path.join(__dirname, '..');
const codex = require(path.join(repo, 'electron', 'codex-sessions.cjs'));
const appServer = require(path.join(repo, 'electron', 'codex-app-server.cjs'));
const pty = require('node-pty');

// A TUI do codex usa OSC (titulo de janela) e CSI (cor, cursor). Montado por codigo
// pra nao ter byte de escape cru no fonte.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const OSC = new RegExp(ESC + `][^${BEL}]*(?:${BEL}|${ESC}${String.fromCharCode(92, 92)})`, `g`);
const CSI = new RegExp(ESC + `[[][0-9;?]*[ -/]*[@-~]`, `g`);
const CHARSET = new RegExp(ESC + `[()][AB012]`, `g`);
const stripAnsi = (s) => String(s).replace(OSC, ``).replace(CSI, ``).replace(CHARSET, ``);

const MARK = 'carcarae2e' + Math.random().toString(36).slice(2, 8);
const PROMPT = `responda apenas ${MARK}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ptys = [];

function openPty(cmd) {
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const args = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // igual ao cleanEnv() do main.js
  const p = pty.spawn(shell, args, { name: 'xterm-256color', cols: 120, rows: 34, cwd: proj, env });
  const state = { out: '' };
  p.onData((d) => {
    state.out += d;
    if (state.out.length > 400000) state.out = state.out.slice(-200000);
  });
  p.write(cmd + '\r');
  ptys.push(p);
  return { p, text: () => stripAnsi(state.out) };
}

function killAll() {
  for (const p of ptys.splice(0)) {
    try {
      p.kill();
    } catch {}
  }
}

async function waitFor(fn, { timeout = 180000, every = 1500, what = 'condicao' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('timeout esperando ' + what);
    await sleep(every);
  }
}

// ---- o ciclo ----------------------------------------------------------------
(async () => {
  // 1. Snapshot ANTES de escrever o comando no pty, como o `term:ensure` faz.
  const snap = await codex.snapshotThreads(proj);
  log('  snapshot via =', snap.via, '| threads antes =', snap.ids.size);
  if (snap.via !== viaEsperado) fail(`esperava snapshot via "${viaEsperado}", veio "${snap.via}"`);
  if (snap.ids.size !== 0) fail('CODEX_HOME novo deveria comecar sem thread');

  // 2. Sobe o codex interativo e manda um prompt.
  const t1 = openPty('codex');
  await waitFor(
    () => {
      const tela = t1.text();
      // CODEX_HOME novo: pode cair na pergunta de confiança da pasta antes do compositor.
      if (/trust the contents|confia no conte/i.test(tela) && !t1.trusted) {
        t1.trusted = true;
        t1.p.write('1\r');
        return false;
      }
      return /shortcuts|Ctrl\+/i.test(tela);
    },
    { timeout: 90000, every: 1000, what: 'a TUI do codex subir' },
  );
  log('  TUI do codex subiu');
  await sleep(1500);
  t1.p.write(PROMPT);
  await sleep(700);
  t1.p.write('\r');
  log('  prompt enviado:', PROMPT);

  // 3. O que o watcher faz a cada 1,5 s enquanto o pty vive.
  const found = await waitFor(() => codex.findNewThread(proj, snap), {
    timeout: 180000,
    what: 'o findNewThread achar a thread',
  });
  log('  findNewThread ->', found);

  // 4. Mata o pty sem deixar o Codex encerrar gracioso: é o "fechar o app".
  t1.p.kill();
  await sleep(2000);

  // 5. O que o buildLaunchCommand faz na reabertura.
  const resolved = await codex.resolveThreadId(found, proj);
  if (resolved !== found) log('  resolveThreadId migrou o id:', found, '->', resolved);
  if (!(await codex.threadExists(resolved, proj))) fail('threadExists false para o id descoberto');
  const title = await codex.threadTitle(proj, resolved);
  log('  titulo da aba =', JSON.stringify(title));
  if (!title || !title.includes(MARK)) fail(`titulo nao veio do primeiro prompt: ${title}`);

  // 6. O comando que o Carcará emite de fato traz a conversa de volta?
  const t2 = openPty(`codex resume ${resolved}`);
  await waitFor(() => t2.text().includes(MARK), {
    timeout: 120000,
    every: 1000,
    what: 'a conversa reaparecer no `codex resume`',
  });
  log('  `codex resume` trouxe a conversa de volta');

  killAll();
  appServer.shutdown();
  log('\ncodex-resume e2e OK');
  process.exit(0);
})().catch((e) => {
  killAll();
  try {
    appServer.shutdown();
  } catch {}
  fail(e && e.stack ? e.stack : String(e));
});
