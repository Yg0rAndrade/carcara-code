// Spike Fase 0 (DESCARTÁVEL): prova que dá pra instalar o OpenCode num prefixo e
// subir `opencode serve` no Windows, mandar 1 mensagem e ler o /event.
// Uso: node scripts/carcara-spike.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const PREFIX = path.join(os.tmpdir(), 'carcara-spike-oc');
const PORT = 47121;
const HOST = '127.0.0.1';
const PASSWORD = 'spike-pass';

function log(...a) {
  console.log('[spike]', ...a);
}

function installOpencode() {
  log('instalando opencode-ai em', PREFIX, '(pode demorar na 1ª vez)…');
  fs.mkdirSync(PREFIX, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['i', 'opencode-ai', '--prefix', PREFIX], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error('npm install falhou (status ' + r.status + ')');
}

function binaryPath() {
  // npm põe o bin em <prefix>/node_modules/.bin/opencode(.cmd no Windows)
  const bin = path.join(PREFIX, 'node_modules', '.bin', 'opencode');
  return process.platform === 'win32' ? bin + '.cmd' : bin;
}

async function waitForServer() {
  const auth = 'Basic ' + Buffer.from('opencode:' + PASSWORD).toString('base64');
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/config`, {
        headers: { Authorization: auth },
      });
      if (res.ok) return auth;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('servidor não respondeu em 30s');
}

(async () => {
  try {
    installOpencode();
    const bin = binaryPath();
    log('binário:', bin, fs.existsSync(bin) ? '(existe)' : '(NÃO EXISTE)');

    const env = { ...process.env, OPENCODE_SERVER_PASSWORD: PASSWORD };
    delete env.ELECTRON_RUN_AS_NODE;
    log('subindo `opencode serve`…');
    const srv = spawn(bin, ['serve', '--hostname', HOST, '--port', String(PORT)], {
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    const auth = await waitForServer();
    log('SERVIDOR NO AR ✔  — criando sessão e mandando 1 mensagem…');

    const headers = { 'Content-Type': 'application/json', Authorization: auth };
    const s = await (
      await fetch(`http://${HOST}:${PORT}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'spike' }),
      })
    ).json();
    log('sessão criada:', s && s.id);

    await fetch(`http://${HOST}:${PORT}/session/${s.id}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ parts: [{ type: 'text', text: 'Diga apenas: OK' }] }),
    });
    log('mensagem enviada. Resposta bruta acima (stdout do serve).');

    log('GO ✔  — OpenCode headless funciona neste Windows.');
    srv.kill();
    process.exit(0);
  } catch (e) {
    console.error('[spike] NO-GO ✘ —', e.message);
    process.exit(1);
  }
})();
