// Smoke do cliente do `codex app-server`: fala com o Codex de VERDADE.
//
// Os testes de unidade cobrem as decisões puras (pickNewThread, pickResolvedId,
// idFromPath) sem subir processo. O que eles não cobrem é o handshake: se o
// `initialize` mudar de forma, ou o `thread/list` sumir, nenhum teste de unidade
// reclama e o app volta a perder conversa de Codex em silêncio. Esse é o papel daqui.
//
// Pula sozinho quando não há `codex` na máquina (CI de outro SO, dev sem Codex).
// Rodar: npm run test:codex
const assert = require('assert');
const appServer = require('../electron/codex-app-server.cjs');

let falhas = 0;
function ok(nome, fn) {
  try {
    fn();
    console.log('  ok  ' + nome);
  } catch (e) {
    falhas++;
    console.log('  FALHOU  ' + nome + ': ' + e.message);
  }
}

async function main() {
  console.log('codex-app-server smoke');

  // 1. O interruptor tem que funcionar sempre, com ou sem Codex instalado: é o que
  //    garante o plano B (leitor de rollout) em campo.
  process.env.CARCARA_CODEX_APP_SERVER = '0';
  const desligado = await appServer.listThreads({ limit: 1 });
  ok('CARCARA_CODEX_APP_SERVER=0 devolve null (cai no plano B)', () =>
    assert.strictEqual(desligado, null),
  );
  delete process.env.CARCARA_CODEX_APP_SERVER;
  appServer._reset();

  // 2. Handshake + thread/list de verdade.
  const rows = await appServer.listThreads({ limit: 5 });
  if (rows === null) {
    console.log('  pulou  sem `codex` utilizável nesta máquina (app-server não respondeu)');
    appServer.shutdown();
    process.exit(falhas ? 1 : 0);
  }

  ok('thread/list devolve array', () => assert.ok(Array.isArray(rows)));
  ok('cada thread tem id e os campos que o Carcará consome', () => {
    for (const t of rows) {
      assert.ok(typeof t.id === 'string' && t.id, 'id ausente');
      assert.ok('title' in t && 'cwd' in t && 'path' in t, 'campo do normalizador ausente');
      assert.strictEqual(typeof t.ephemeral, 'boolean');
      assert.strictEqual(typeof t.recencyAt, 'number');
    }
  });
  ok('ordenado da mais recente pra mais antiga', () => {
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].recencyAt >= rows[i].recencyAt, 'fora de ordem');
    }
  });

  // 3. Filtro por cwd: é o que amarra a conversa ao projeto da aba.
  if (rows.length) {
    const alvo = rows[0].cwd;
    if (alvo) {
      const doProjeto = await appServer.listThreads({ cwd: alvo, limit: 20 });
      ok('filtro por cwd só traz thread daquele projeto', () => {
        assert.ok(Array.isArray(doProjeto), 'cwd filtrado devolveu null');
        for (const t of doProjeto) assert.strictEqual(t.cwd, alvo);
      });
      ok('a thread mais recente aparece no filtro do próprio cwd', () =>
        assert.ok(doProjeto.some((t) => t.id === rows[0].id)),
      );
    }
  }

  // 4. useStateDbOnly: é o modo que o watcher usa a cada 1,5 s.
  const rapido = await appServer.listThreads({ limit: 5, fast: true });
  ok('modo rápido (useStateDbOnly) também responde', () => assert.ok(Array.isArray(rapido)));

  appServer.shutdown();
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok');
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error('erro no smoke:', e);
  appServer.shutdown();
  process.exit(1);
});
