// Smoke das funções puras do php-runtime, fora do Electron.
// Uso: node scripts/php-smoke.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
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
} = require('../php-runtime.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}
function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-php-'));
}
function write(dir, rel, content) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}

async function run() {
  // detectProjectType
  const nodeDir = tmp();
  write(nodeDir, 'package.json', JSON.stringify({ scripts: { dev: 'vite' } }));
  assert(detectProjectType(nodeDir) === 'node', 'package.json com dev -> node');

  const phpDir = tmp();
  write(phpDir, 'index.php', '<?php echo "oi";');
  assert(detectProjectType(phpDir) === 'php', 'index.php solto -> php');

  const bothDir = tmp();
  write(bothDir, 'package.json', JSON.stringify({ scripts: { dev: 'vite' } }));
  write(bothDir, 'index.php', '<?php');
  assert(detectProjectType(bothDir) === 'node', 'node vence quando há package.json com script');

  const pkgNoScript = tmp();
  write(pkgNoScript, 'package.json', JSON.stringify({ scripts: { build: 'x' } }));
  write(pkgNoScript, 'app.php', '<?php');
  assert(
    detectProjectType(pkgNoScript) === 'php',
    'package.json sem dev/start/serve mas com .php -> php',
  );

  const emptyDir = tmp();
  assert(detectProjectType(emptyDir) === null, 'pasta vazia -> null');
  console.log('detectProjectType ok');

  // resolvePhpDocroot
  const rootDoc = tmp();
  write(rootDoc, 'index.php', '<?php');
  assert(resolvePhpDocroot(rootDoc) === rootDoc, 'sem public/ -> raiz');

  const pubDoc = tmp();
  write(pubDoc, 'public/index.php', '<?php');
  assert(
    resolvePhpDocroot(pubDoc) === path.join(pubDoc, 'public'),
    'com public/index.php -> public/',
  );
  console.log('resolvePhpDocroot ok');

  // buildPhpServeArgs
  const args = buildPhpServeArgs({ port: 8123, docroot: 'C:\\proj\\public' });
  assert(
    JSON.stringify(args) === JSON.stringify(['-S', '127.0.0.1:8123', '-t', 'C:\\proj\\public']),
    'args do php -S corretos: ' + JSON.stringify(args),
  );
  console.log('buildPhpServeArgs ok');

  // isVcRedistError
  assert(
    isVcRedistError({
      log: 'The code execution cannot proceed VCRUNTIME140.dll was not found',
      elapsedMs: 200,
    }) === true,
    'stderr com VCRUNTIME140.dll e saída rápida -> true',
  );
  assert(
    isVcRedistError({ log: 'PHP 8.5.8 Development Server started', elapsedMs: 200 }) === false,
    'log normal -> false',
  );
  assert(
    isVcRedistError({ log: 'VCRUNTIME140.dll', elapsedMs: 9000 }) === false,
    'saída tardia não é erro de VC redist',
  );
  console.log('isVcRedistError ok');

  // verifySha256
  const hashDir = tmp();
  const buf = Buffer.from('carcara-php-smoke-fixture');
  const f = write(hashDir, 'blob.bin', buf);
  const expected = crypto.createHash('sha256').update(buf).digest('hex');
  assert((await verifySha256(f, expected)) === true, 'sha256 correto -> true');
  assert(
    (await verifySha256(f, expected.toUpperCase())) === true,
    'sha256 case-insensitive -> true',
  );
  assert((await verifySha256(f, '00'.repeat(32))) === false, 'sha256 errado -> false');
  console.log('verifySha256 ok');

  // Constantes do runtime fixadas
  assert(PHP_VERSION === '8.5.8', 'versão fixada 8.5.8');
  assert(PHP_ZIP_NAME === 'php-8.5.8-nts-Win32-vs17-x64.zip', 'nome do zip correto');
  assert(/^[a-f0-9]{64}$/i.test(PHP_SHA256), 'PHP_SHA256 é 64 hex');
  assert(
    Array.isArray(PHP_DOWNLOAD_URLS) &&
      PHP_DOWNLOAD_URLS.length >= 1 &&
      PHP_DOWNLOAD_URLS.every((u) => u.endsWith(PHP_ZIP_NAME)),
    'URLs terminam no zip fixado',
  );
  console.log('constantes ok');

  // resolveSystemPhp: ou null (sem php no PATH) ou caminho de um arquivo real.
  const sysPhp = resolveSystemPhp();
  assert(
    sysPhp === null || (typeof sysPhp === 'string' && fs.existsSync(sysPhp)),
    'resolveSystemPhp retorna null ou caminho existente: ' + sysPhp,
  );
  console.log('resolveSystemPhp ok' + (sysPhp ? ` (${sysPhp})` : ' (sem php no sistema)'));

  console.log('\nphp-smoke OK');
}
run().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
