// scripts/ai-catalog-smoke.cjs
// Smoke das RECEITAS de CLI por SO. Uso: node scripts/ai-catalog-smoke.cjs
// Os dois últimos blocos são testes de REGRESSÃO dos bugs de 2026-08-06 (ver
// docs/2026-08-06-gerenciar-ias-diagnostico-e-plano.md e DESAFIOS.md).
const {
  commandsFor,
  catalogFor,
  uninstallGuide,
  INSTALLABLE_KEYS,
  computeUpdateAvailable,
} = require('../electron/ai-catalog.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

for (const platform of ['win32', 'darwin', 'linux']) {
  for (const key of INSTALLABLE_KEYS) {
    const c = commandsFor(key, platform);
    assert(c, `${key}/${platform}: receita ausente`);
    assert(c.install.length > 0, `${key}/${platform}: sem passo de instalação`);
    assert(
      c.install.every((s) => typeof s === 'string' && s.trim()),
      `${key}/${platform}: passo vazio`,
    );
    assert(c.update.length > 0, `${key}/${platform}: sem passo de atualização`);
    assert(/^https:\/\//.test(c.docs), `${key}/${platform}: doc oficial ausente`);
  }
  const cat = catalogFor(platform);
  assert(cat.length === INSTALLABLE_KEYS.length, `${platform}: catálogo incompleto`);
  assert(
    cat.every((e) => e.docs && e.install.length),
    `${platform}: catalogFor deve propagar docs/install`,
  );
}

// REGRESSÃO — Windows não tem `sh`/`bash` no PATH nem com o Git instalado. Uma receita
// que dependa deles é inexecutável no público-alvo (foi o que travava o "Instalar" do
// OpenCode). Nada de `| bash`, `| sh` ou `sh -c` no slot win32.
for (const key of INSTALLABLE_KEYS) {
  for (const step of commandsFor(key, 'win32').install.concat(commandsFor(key, 'win32').update)) {
    assert(!/\|\s*(bash|sh)\b/.test(step), `${key}/win32 não pode canalizar pra bash/sh: ${step}`);
    assert(!/^\s*(bash|sh)\b/.test(step), `${key}/win32 não pode invocar bash/sh: ${step}`);
  }
}

// REGRESSÃO — npm >= 12 bloqueia postinstall por padrão, e o `opencode-ai` entrega o
// binário justamente no postinstall (sem o flag, sobra um stub de 479 bytes que o
// Windows recusa e a CLI vira "não instalada"). Toda receita via npm install precisa
// liberar os scripts do pacote.
for (const platform of ['win32', 'darwin', 'linux']) {
  for (const key of INSTALLABLE_KEYS) {
    const c = commandsFor(key, platform);
    for (const step of c.install.concat(c.update)) {
      if (/\bnpm\s+(install|i)\b/.test(step)) {
        assert(
          /--allow-scripts=/.test(step),
          `${key}/${platform}: npm install sem --allow-scripts: ${step}`,
        );
      }
    }
  }
}

// Desinstalação guiada: comando reversível ou delegação pros "Apps" do SO.
for (const key of INSTALLABLE_KEYS) {
  const g = uninstallGuide(key);
  assert(g, `${key}: sem guia de desinstalação`);
  assert(g.kind === 'command' ? !!g.run : g.kind === 'os-apps', `${key}: guia inválido`);
}

// Comparador de versão (o que decide o aviso de "atualização disponível").
assert(computeUpdateAvailable('1.2.3', '1.2.4') === true, '1.2.3 < 1.2.4');
assert(computeUpdateAvailable('1.10.0', '1.9.0') === false, '1.10.0 > 1.9.0 (não é string)');
assert(computeUpdateAvailable(null, '1.0.0') === false, 'sem versão instalada = sem update');

console.log('ai-catalog smoke OK');
