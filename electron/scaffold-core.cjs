'use strict';
// Decisão pura do onboarding: catálogo de stacks web, comando de scaffold e
// regras de "pasta scaffoldável". SEM fs, SEM child_process — testável no
// scripts/platform-smoke.cjs (padrão do CLAUDE.md).

// Nomes tolerados numa pasta "vazia ou só-lixo" (case-insensitive).
const SCAFFOLD_JUNK = new Set(['.git', '.gitignore', 'readme.md', 'license']);

// Tempdir da própria ferramenta (criado durante o scaffold). Nome canônico:
// main.js usa SCAFFOLD_TEMP_DIR pra montar o caminho, então nunca diverge.
// NÃO pode começar com ponto: o create-next-app deriva o nome do pacote npm do
// basename da pasta e o npm rejeita nome começando com '.' (o create-vite/astro
// não validam, por isso só o Next quebrava).
const SCAFFOLD_TEMP_DIR = 'carcara-scaffold-tmp';

// isScaffoldable tolera o nosso tempdir (senão o re-probe durante o scaffold
// desmontaria o wizard e um tempdir órfão de crash bloquearia pra sempre).
// junkPresent continua em SCAFFOLD_JUNK -> o tempdir nunca aparece pro usuário.
const SCAFFOLD_IGNORE = new Set([...SCAFFOLD_JUNK, SCAFFOLD_TEMP_DIR.toLowerCase()]);

// Catálogo fixo (v1: só web). Ordem = ordem dos cards.
// Todos 'cli': rodam o create-* oficial SEM instalar (o install roda depois,
// no preview:start, no diretório final — DRY).
const CATALOG = [
  {
    id: 'vite-react',
    label: 'React',
    sub: 'Aplicativos web',
    icon: 'Atom',
    command: ['npm', 'create', 'vite@latest', '.', '--', '--template', 'react'],
  },
  {
    id: 'next',
    label: 'Next.js',
    sub: 'Aplicativos web com SEO',
    icon: 'Triangle',
    command: [
      'npx',
      'create-next-app@latest',
      '.',
      '--ts',
      '--tailwind',
      '--eslint',
      '--app',
      '--src-dir',
      '--import-alias',
      '@/*',
      '--use-npm',
      '--skip-install',
      '--yes',
    ],
  },
  {
    id: 'astro',
    label: 'Astro',
    sub: 'Sites de conteúdo (landing, blog)',
    icon: 'Rocket',
    command: [
      'npm',
      'create',
      'astro@latest',
      '.',
      '--',
      '--template',
      'basics',
      '--no-install',
      '--no-git',
      '--skip-houston',
      '-y',
    ],
  },
];

const BY_ID = new Map(CATALOG.map((s) => [s.id, s]));

function listStacks() {
  return CATALOG.map(({ id, label, sub, icon }) => ({ id, label, sub, icon }));
}

function commandFor(stackId) {
  const s = BY_ID.get(stackId);
  return s ? s.command.slice() : null;
}

function isScaffoldable(entries) {
  if (!Array.isArray(entries)) return false;
  return entries.every((name) => SCAFFOLD_IGNORE.has(String(name).toLowerCase()));
}

function junkPresent(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((name) => SCAFFOLD_JUNK.has(String(name).toLowerCase()));
}

// Nome de pacote npm válido a partir do nome da pasta do projeto. Os create-*
// derivam o "name" do package.json do basename do tempdir (não do projeto), então
// o motor reescreve o name pós-merge com isto. Regras npm: minúsculo, sem espaço,
// não começa com '.'/'_'.
function sanitizePackageName(name) {
  let s = String(name || '')
    .toLowerCase()
    .trim();
  s = s.replace(/[^a-z0-9._-]+/g, '-'); // espaço/acento/inválido -> '-'
  s = s.replace(/^[._-]+|[._-]+$/g, ''); // sem '.'/'_'/'-' nas pontas
  s = s.replace(/-{2,}/g, '-'); // colapsa hifens repetidos
  return s || 'app';
}

// Plano de merge do tempdir -> projeto. `existing`/`generated` = nomes de topo.
// backup: arquivos do usuário que colidem (vão pra _backup/, e o gerado vence).
// move: tudo que o scaffold gerou.
function mergePlan(existing, generated) {
  const have = new Set((existing || []).map((n) => String(n).toLowerCase()));
  const backup = (generated || []).filter((n) => have.has(String(n).toLowerCase()));
  return { backup, move: (generated || []).slice() };
}

module.exports = {
  SCAFFOLD_JUNK,
  SCAFFOLD_TEMP_DIR,
  CATALOG,
  listStacks,
  commandFor,
  isScaffoldable,
  junkPresent,
  mergePlan,
  sanitizePackageName,
};
