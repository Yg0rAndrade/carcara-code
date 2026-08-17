#!/usr/bin/env node

// Audita o .app gerado pelo electron-builder. O objetivo é impedir que um job
// rotulado como x64 publique Electron/addons arm64 (ou vice-versa).
//
// Uso:
//   node scripts/verify-macos-architecture.cjs arm64
//   node scripts/verify-macos-architecture.cjs x64 release

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const expected = process.argv[2];
const defaultAppDir =
  expected === 'x64' ? path.join('release', 'mac') : path.join('release', 'mac-arm64');
const releaseDir = path.resolve(process.argv[3] || defaultAppDir);
const MACH_ARCH = { arm64: 'arm64', x64: 'x86_64' };

function fail(message) {
  console.error(`macOS arch check: ${message}`);
  process.exit(1);
}

function errorDetail(error) {
  const raw = String(error.stderr || error.stdout || error.message).trim();
  return raw.length > 4000 ? raw.slice(-4000) : raw;
}

if (process.platform !== 'darwin') fail('este smoke precisa rodar no macOS');
if (!MACH_ARCH[expected]) fail('arquitetura esperada deve ser arm64 ou x64');
if (!fs.existsSync(releaseDir)) fail(`diretório não encontrado: ${releaseDir}`);

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, visit);
    else if (entry.isFile()) visit(target, fs.statSync(target));
  }
}

const apps = [];
walk(releaseDir, (file) => {
  const marker = `${path.sep}Contents${path.sep}Info.plist`;
  if (file.endsWith(marker)) apps.push(file.slice(0, -marker.length));
});

// Apps auxiliares do Electron também têm Info.plist. O pacote principal é o
// único .app que fica diretamente sob release/mac-<arch>/.
const topLevelApps = apps.filter((appPath) => {
  const relative = path.relative(releaseDir, appPath).split(path.sep);
  return relative.length === 1 && relative[0].endsWith('.app');
});
if (topLevelApps.length !== 1) {
  fail(`esperava um .app principal em ${releaseDir}; encontrei ${topLevelApps.length}`);
}

const appPath = topLevelApps[0];
if (/[^\x20-\x7e]/.test(path.basename(appPath))) {
  fail(`o nome técnico do bundle precisa ser ASCII: ${path.basename(appPath)}`);
}
const candidates = [];
walk(appPath, (file, stat) => {
  if ((stat.mode & 0o111) !== 0 || /\.(node|dylib)$/i.test(file)) candidates.push(file);
});

const expectedMach = MACH_ARCH[expected];
const wrong = [];
const checked = [];
const skippedForeignPrebuilds = [];

for (const file of candidates) {
  let description;
  try {
    description = execFileSync('file', ['-b', file], { encoding: 'utf8' }).trim();
  } catch (error) {
    fail(`não foi possível inspecionar ${file}: ${error.message}`);
  }
  if (!description.includes('Mach-O')) continue;

  const relative = path.relative(appPath, file);
  const normalized = relative.split(path.sep).join('/');
  const scopedPrebuild = normalized.match(/\/prebuilds\/darwin-(arm64|x64)\//);
  if (scopedPrebuild && scopedPrebuild[1] !== expected) {
    skippedForeignPrebuilds.push(relative);
    continue;
  }

  checked.push({ relative, description });
  if (!description.includes(expectedMach)) wrong.push({ relative, description });
}

if (checked.length === 0) fail('nenhum binário Mach-O foi encontrado no pacote');

const mainExecutables = checked.filter(({ relative }) =>
  relative.startsWith(`Contents${path.sep}MacOS${path.sep}`),
);
if (mainExecutables.length !== 1) {
  fail(`esperava um executável principal Mach-O; encontrei ${mainExecutables.length}`);
}

const nativeModules = checked.filter(({ relative }) => relative.endsWith('.node'));
if (nativeModules.length === 0) fail('nenhum addon nativo .node foi auditado');

const ptyPrebuild = nativeModules.find(({ relative }) =>
  relative.split(path.sep).join('/').includes(`/node-pty/prebuilds/darwin-${expected}/pty.node`),
);
if (!ptyPrebuild) fail(`node-pty não contém o prebuild darwin-${expected}/pty.node`);

if (wrong.length > 0) {
  for (const item of wrong) console.error(`- ${item.relative}: ${item.description}`);
  fail(`${wrong.length} binário(s) não contêm a arquitetura ${expectedMach}`);
}

try {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
} catch (error) {
  const detail = errorDetail(error);
  fail(`assinatura do bundle inválida${detail ? `: ${detail}` : ''}`);
}

// Arquitetura correta não basta: um addon arm64 pode ter sido compilado para a ABI
// do Node do sistema e ainda assim quebrar no Electron com NODE_MODULE_VERSION errado.
// Executa os pacotes que possuem addons com o Node embutido no próprio app. Carregar
// o pacote (em vez do .node bruto) respeita fallbacks intencionais, como o do ssh2.
const mainExecutable = path.join(appPath, mainExecutables[0].relative);
if (/[^\x20-\x7e]/.test(path.basename(mainExecutable))) {
  fail(`o nome técnico do executável precisa ser ASCII: ${path.basename(mainExecutable)}`);
}
const nativePackageNames = new Set();
for (const { relative } of nativeModules) {
  const normalized = relative.split(path.sep).join('/');
  const marker = '/app.asar.unpacked/node_modules/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) continue;
  const parts = normalized.slice(markerIndex + marker.length).split('/');
  const packageName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  nativePackageNames.add(packageName);
}
if (nativePackageNames.size === 0) fail('nenhum pacote com addon nativo foi localizado');

const appAsar = path.join(appPath, 'Contents', 'Resources', 'app.asar');
const nativePackagePaths = [...nativePackageNames].map((packageName) =>
  path.join(appAsar, 'node_modules', ...packageName.split('/')),
);
try {
  execFileSync(
    mainExecutable,
    [
      '-e',
      'for (const packagePath of JSON.parse(process.env.CARCARA_NATIVE_PACKAGES)) require(packagePath);',
    ],
    {
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        CARCARA_NATIVE_PACKAGES: JSON.stringify(nativePackagePaths),
      },
    },
  );
} catch (error) {
  const detail = errorDetail(error);
  fail(`addon nativo incompatível com a ABI do Electron${detail ? `: ${detail}` : ''}`);
}

function smokeLaunch(executable) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(executable, ['--disable-gpu', '--remote-debugging-port=0'], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let settled = false;
    let browserStarted = false;
    let timer;

    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
      if (stderr.includes('DevTools listening on ws://')) browserStarted = true;
    });

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      finish(
        new Error(
          `processo encerrou antes de abrir (code=${code}, signal=${signal})${stderr ? `\n${stderr}` : ''}`,
        ),
      );
    });

    timer = setTimeout(() => {
      child.removeAllListeners('exit');
      child.kill('SIGTERM');
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 2000).unref();
      finish(
        browserStarted
          ? null
          : new Error(`Chromium não confirmou a abertura da janela${stderr ? `\n${stderr}` : ''}`),
      );
    }, 8000);
  });
}

smokeLaunch(mainExecutable)
  .then(() => {
    console.log(`macOS arch check OK — ${expected}`);
    console.log(`app: ${path.relative(process.cwd(), appPath)}`);
    console.log(`Mach-O auditados: ${checked.length} (${nativeModules.length} addons .node)`);
    console.log(`prebuilds da outra arquitetura ignorados: ${skippedForeignPrebuilds.length}`);
    console.log('assinatura, ABI dos addons e abertura do app: OK');
  })
  .catch((error) => fail(`o app empacotado não abriu: ${error.message}`));
