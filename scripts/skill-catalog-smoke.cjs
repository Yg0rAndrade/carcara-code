// scripts/skill-catalog-smoke.cjs
// Smoke do catálogo de skills instaláveis. Uso: node scripts/skill-catalog-smoke.cjs
const {
  CATALOG,
  listSkills,
  find,
  commandFor,
  scopeFor,
  linkSegmentsFor,
  requirementsFor,
} = require('../electron/skill-catalog.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

assert(CATALOG.length > 0, 'catálogo vazio');
assert(listSkills().length === CATALOG.length, 'listSkills não bate com o catálogo');

for (const s of CATALOG) {
  assert(s.id && s.pkg && s.dir && s.url, `${s.id}: entrada incompleta`);
  assert(find(s.id) === s, `${s.id}: find não devolve a entrada`);

  const cmd = commandFor(s.id);
  assert(cmd[0] === 'npx' && cmd.includes(s.pkg), `${s.id}: comando errado`);
  // A flag tem que acompanhar o escopo: sem ela, o padrão do pacote npm decide
  // sozinho onde a skill cai (hoje é global) e o CTA passa a mentir.
  assert(
    cmd.includes('--project') === (scopeFor(s.id) === 'project'),
    `${s.id}: --project não bate com o escopo (${scopeFor(s.id)})`,
  );

  const segs = linkSegmentsFor(s.id);
  assert(
    segs.join('/') === `.claude/skills/${s.dir}`, // é o caminho que o main testa com existsSync
    `${s.id}: caminho do link errado (${segs.join('/')})`,
  );
  assert(requirementsFor(s.id).includes('node'), `${s.id}: instalador via npx exige node`);
}

// A skill do wizard de projeto novo tem que existir com este id (ScaffoldWizard.jsx)
// e ser por projeto — global faria o CTA nascer "instalada" em toda pasta nova.
assert(find('start'), "skill 'start' ausente do catálogo");
assert(scopeFor('start') === 'project', "skill 'start' tem que ser de escopo project");
assert(find('nao-existe') === null, 'id desconhecido deveria dar null');
assert(commandFor('nao-existe') === null, 'commandFor de id desconhecido deveria dar null');
assert(scopeFor('nao-existe') === null, 'scopeFor de id desconhecido deveria dar null');

// O .claude criado pela instalação não pode desqualificar a pasta pro wizard
// (senão instalar a skill mataria os três cards de stack).
const sc = require('../electron/scaffold-core.cjs');
assert(sc.isScaffoldable(['.claude']) === true, '.claude não pode bloquear o scaffold');

console.log('skill-catalog smoke OK');
