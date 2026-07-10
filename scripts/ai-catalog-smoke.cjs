// scripts/ai-catalog-smoke.cjs
// Smoke do catálogo de CLIs por SO. Uso: node scripts/ai-catalog-smoke.cjs
const { installSpec, updateSpec, INSTALLABLE_KEYS } = require('../electron/ai-catalog.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

for (const platform of ['win32', 'darwin', 'linux']) {
  for (const key of INSTALLABLE_KEYS) {
    const ins = installSpec(key, platform);
    assert(ins && ins.cmd, `${key}/${platform}: install.cmd ausente`);
    if (platform === 'win32' && key !== 'opencode') {
      assert(/iex/.test(ins.cmd), `${key}/win32 deveria usar irm|iex`);
    } else {
      assert(/curl/.test(ins.cmd), `${key}/${platform} deveria usar curl`);
    }
    assert(updateSpec(key, platform), `${key}/${platform}: updateSpec ausente`);
  }
  assert(updateSpec('opencode', platform).builtin === true, 'opencode update é builtin');
  assert(updateSpec('claude', platform).builtin === true, 'claude update é builtin');
  assert(installSpec('claude', platform) === null, 'claude não instala pelo catálogo');
}

console.log('ai-catalog smoke OK');
