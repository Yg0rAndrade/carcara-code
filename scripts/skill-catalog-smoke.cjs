// scripts/skill-catalog-smoke.cjs
// Smoke do catálogo de skills instaláveis. Uso: node scripts/skill-catalog-smoke.cjs
const {
  CATALOG,
  listSkills,
  find,
  commandFor,
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
  assert(cmd[0] === 'npx' && cmd.includes(s.pkg), `${s.id}: comando global errado`);
  assert(!cmd.includes('--project'), `${s.id}: global não pode ter --project`);
  assert(commandFor(s.id, { project: true }).includes('--project'), `${s.id}: falta --project`);

  const segs = linkSegmentsFor(s.id);
  assert(
    segs.join('/') === `.claude/skills/${s.dir}`, // é o caminho que o main testa com existsSync
    `${s.id}: caminho do link errado (${segs.join('/')})`,
  );
  assert(requirementsFor(s.id).includes('node'), `${s.id}: instalador via npx exige node`);
}

// A skill do wizard de projeto novo tem que existir com este id (ScaffoldWizard.jsx).
assert(find('start'), "skill 'start' ausente do catálogo");
assert(find('nao-existe') === null, 'id desconhecido deveria dar null');
assert(commandFor('nao-existe') === null, 'commandFor de id desconhecido deveria dar null');

console.log('skill-catalog smoke OK');
