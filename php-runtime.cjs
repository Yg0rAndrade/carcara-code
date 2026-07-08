// Runtime PHP isolado do main.js. Node puro (sem require de electron),
// pra ser testável por scripts/php-smoke.cjs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { spawnSync } = require('child_process');

// --- Detecção de tipo de projeto ---------------------------------------
function hasNodeDevScript(projectPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
    const s = pkg.scripts || {};
    return Boolean(s.dev || s.start || s.serve);
  } catch {
    return false;
  }
}

function hasAnyPhpFile(projectPath) {
  // index.php na raiz ou em public/ é o caso comum; senão qualquer .php no topo.
  if (fs.existsSync(path.join(projectPath, 'index.php'))) return true;
  if (fs.existsSync(path.join(projectPath, 'public', 'index.php'))) return true;
  try {
    return fs.readdirSync(projectPath).some((f) => f.toLowerCase().endsWith('.php'));
  } catch {
    return false;
  }
}

function detectProjectType(projectPath) {
  if (hasNodeDevScript(projectPath)) return 'node'; // Node vence sempre
  if (hasAnyPhpFile(projectPath)) return 'php';
  return null;
}

function resolvePhpDocroot(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'public', 'index.php'))) {
    return path.join(projectPath, 'public');
  }
  return projectPath;
}

function buildPhpServeArgs({ port, docroot }) {
  return ['-S', `127.0.0.1:${port}`, '-t', docroot];
}

// --- Classificador de erro de VC redist --------------------------------
function isVcRedistError({ log, elapsedMs }) {
  const quick = elapsedMs < 4000; // saiu quase na hora
  const dll = /VCRUNTIME140|MSVCP140|vcruntime140/i.test(log || '');
  return quick && dll;
}

// --- Verificação de sha256 ---------------------------------------------
function verifySha256(filePath, expectedHex) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('error', () => resolve(false));
    s.on('data', (d) => hash.update(d));
    s.on('end', () =>
      resolve(hash.digest('hex').toLowerCase() === String(expectedHex).toLowerCase()),
    );
  });
}

// --- Runtime PHP sob demanda -------------------------------------------
const PHP_VERSION = '8.5.8';
const PHP_ZIP_NAME = `php-${PHP_VERSION}-nts-Win32-vs17-x64.zip`;
const PHP_SHA256 = '63a3f6493f37c9ff3e288ec16621222a6cda5167dd1abffec0019e7f18c8e7e9';
const PHP_DOWNLOAD_URLS = [
  `https://windows.php.net/downloads/releases/${PHP_ZIP_NAME}`,
  `https://windows.php.net/downloads/releases/archives/${PHP_ZIP_NAME}`,
];

function downloadTo(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error('excesso de redirects'));
        const next = new URL(headers.location, url).toString();
        return resolve(downloadTo(next, destPath, redirectsLeft - 1));
      }
      if (statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${statusCode} ao baixar ${url}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      res.on('error', (e) => {
        out.destroy();
        reject(e);
      });
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('timeout no download do PHP')));
  });
}

async function downloadFirstAvailable(urls, destPath) {
  let lastErr;
  for (const u of urls) {
    try {
      await downloadTo(u, destPath);
      return u;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('nenhuma URL de download disponível');
}

// Localiza o php já instalado no sistema (Linux/macOS via apt/brew).
// Retorna o caminho absoluto do executável, ou null se não houver.
function resolveSystemPhp() {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['where', ['php']] : ['sh', ['-c', 'command -v php']];
  try {
    const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
    if (r.status === 0 && r.stdout) {
      const first = r.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (first && fs.existsSync(first)) return first;
    }
  } catch {
    /* php não encontrado */
  }
  return null;
}

function extractZip(zipPath, destDir) {
  // Windows: usa o Expand-Archive do PowerShell (sem dependência npm).
  // Aspas simples dobradas = escape literal do PowerShell, evita quebra de
  // string se o caminho tiver aspas (ex.: userData com username "O'Connor").
  const psQuote = (p) => String(p).replace(/'/g, "''");
  const r = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${psQuote(zipPath)}' -DestinationPath '${psQuote(destDir)}' -Force`,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(
      'falha ao extrair o PHP: ' + (r.stderr || r.error?.message || 'erro desconhecido'),
    );
  }
}

async function ensurePhpRuntime({ cacheBaseDir, onPhase }) {
  const phase = (m) => {
    if (onPhase) onPhase(m);
  };

  // Linux/macOS: não existe build portátil oficial de PHP como o do Windows
  // (o zip de windows.php.net é php.exe e só roda no Windows). O caminho padrão
  // nesses sistemas é usar o PHP instalado pelo gerenciador de pacotes.
  if (process.platform !== 'win32') {
    const sysPhp = resolveSystemPhp();
    if (sysPhp) return sysPhp;
    throw new Error(
      'PHP não encontrado no sistema. Instale o PHP para usar o preview de projetos PHP:\n' +
        '  • Debian/Ubuntu/Mint: sudo apt install php-cli\n' +
        '  • Fedora: sudo dnf install php-cli\n' +
        '  • macOS (Homebrew): brew install php',
    );
  }

  const versionDir = path.join(cacheBaseDir, PHP_VERSION);
  const phpExe = path.join(versionDir, 'php.exe');
  if (fs.existsSync(phpExe)) return phpExe; // cache hit

  fs.mkdirSync(versionDir, { recursive: true });
  const zipPath = path.join(versionDir, PHP_ZIP_NAME);

  phase('Baixando PHP (primeira vez)…');
  try {
    await downloadFirstAvailable(PHP_DOWNLOAD_URLS, zipPath);
  } catch (e) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {}
    throw new Error('Não foi possível baixar o PHP (verifique a conexão). ' + e.message);
  }

  phase('Verificando o download…');
  const ok = await verifySha256(zipPath, PHP_SHA256);
  if (!ok) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {}
    throw new Error('Checksum do PHP não confere — download abortado por segurança.');
  }

  phase('Extraindo o PHP…');
  try {
    extractZip(zipPath, versionDir);
  } catch (e) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {}
    throw new Error('Falha ao extrair o PHP: ' + e.message);
  }
  try {
    fs.rmSync(zipPath, { force: true });
  } catch {}

  if (!fs.existsSync(phpExe)) {
    throw new Error('php.exe não encontrado após a extração.');
  }
  return phpExe;
}

module.exports = {
  detectProjectType,
  resolvePhpDocroot,
  buildPhpServeArgs,
  isVcRedistError,
  verifySha256,
  PHP_VERSION,
  PHP_ZIP_NAME,
  PHP_DOWNLOAD_URLS,
  PHP_SHA256,
  resolveSystemPhp,
  ensurePhpRuntime,
};
