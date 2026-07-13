// Resolve o executável do OpenCode. Puro nas decisões de caminho (testável),
// impuro só no resolveOpencode (checa PATH / instala via npm).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tableFor } = require('../platform.cjs');

function binaryName(platform = process.platform) {
  return tableFor(platform).opencodeBin;
}

function prefixBinaryPath(prefixDir, platform = process.platform) {
  return path.join(prefixDir, 'node_modules', '.bin', binaryName(platform));
}

// opencode já no PATH? (power user). Devolve 'opencode' se `opencode --version` responde.
function opencodeOnPath(platform = process.platform) {
  const probe = platform === 'win32' ? 'opencode.cmd' : 'opencode';
  const r = spawnSync(probe, ['--version'], {
    stdio: 'ignore',
    shell: platform === 'win32',
  });
  return r.status === 0 ? probe : null;
}

// Instala opencode-ai no prefixo do app (sem -g), sem o usuário digitar nada.
function installToPrefix(prefixDir, onPhase) {
  fs.mkdirSync(prefixDir, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (onPhase) onPhase('Baixando o motor (primeira vez)…');
  const r = spawnSync(npm, ['i', 'opencode-ai', '--prefix', prefixDir], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) throw new Error('Falha ao instalar o OpenCode (npm status ' + r.status + ')');
}

async function resolveOpencode({ prefixDir, platform = process.platform, onPhase } = {}) {
  const onPath = opencodeOnPath(platform);
  if (onPath) return onPath;
  const local = prefixBinaryPath(prefixDir, platform);
  if (!fs.existsSync(local)) installToPrefix(prefixDir, onPhase);
  if (!fs.existsSync(local)) throw new Error('OpenCode não encontrado após instalar: ' + local);
  return local;
}

module.exports = { binaryName, prefixBinaryPath, opencodeOnPath, resolveOpencode };
