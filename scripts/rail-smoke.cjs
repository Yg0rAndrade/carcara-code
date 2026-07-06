// Smoke da reconciliação do Rail fora do Electron. Usa o MESMO rail-core.cjs do main.js.
// Uso: node scripts/rail-smoke.cjs
const { reconcile } = require('../rail-core.cjs');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('  ASSERT: ' + msg);
    fail++;
  }
}
function eq(a, b, msg) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg} :: got ${JSON.stringify(a)}`);
}

// 1) Migração: sem rail -> tudo solto na ordem de projects.
eq(
  reconcile(undefined, ['/a', '/b']),
  [
    { type: 'project', path: '/a' },
    { type: 'project', path: '/b' },
  ],
  'migra rail ausente para projetos soltos',
);

// 2) Órfão no topo é removido.
eq(
  reconcile(
    [
      { type: 'project', path: '/x' },
      { type: 'project', path: '/a' },
    ],
    ['/a'],
  ),
  [{ type: 'project', path: '/a' }],
  'remove projeto solto órfão',
);

// 3) Órfão dentro da pasta é removido; pasta continua com os válidos.
eq(
  reconcile(
    [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a', '/gone'] }],
    ['/a'],
  ),
  [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a'] }],
  'remove filho órfão da pasta',
);

// 4) Pasta vazia PERSISTE (o "+" cria pasta vazia; só o drag-out via applyDrop dissolve).
eq(
  reconcile([{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/gone'] }], []),
  [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: [] }],
  'mantém pasta vazia (filhos órfãos removidos, pasta fica)',
);

// 5) Projeto novo (em projects, ausente do rail) entra solto no fim.
eq(
  reconcile([{ type: 'project', path: '/a' }], ['/a', '/b']),
  [
    { type: 'project', path: '/a' },
    { type: 'project', path: '/b' },
  ],
  'anexa projeto novo no fim',
);

// 6) Projeto dentro de pasta NÃO é reanexado no topo (já está coberto).
eq(
  reconcile(
    [{ type: 'folder', id: 'f1', name: 'P', collapsed: true, children: ['/a'] }],
    ['/a', '/b'],
  ),
  [
    { type: 'folder', id: 'f1', name: 'P', collapsed: true, children: ['/a'] },
    { type: 'project', path: '/b' },
  ],
  'projeto em pasta conta como coberto; só o novo /b entra solto',
);

// 7) Deduplica: mesmo path solto e dentro de pasta -> mantém 1 (o primeiro encontrado).
eq(
  reconcile(
    [
      { type: 'project', path: '/a' },
      { type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a', '/b'] },
    ],
    ['/a', '/b'],
  ),
  [
    { type: 'project', path: '/a' },
    { type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/b'] },
  ],
  'deduplica path repetido mantendo a primeira ocorrência',
);

// 8) Defaults de shape: folder sem collapsed/name/children vira válido.
eq(
  reconcile([{ type: 'folder', id: 'f1', children: ['/a'] }], ['/a']),
  [{ type: 'folder', id: 'f1', name: '', collapsed: false, children: ['/a'] }],
  'aplica defaults de shape na pasta',
);

if (fail) {
  console.error(`\n${fail} asserção(ões) falharam.`);
  process.exit(1);
}
console.log('rail-core smoke ok');
