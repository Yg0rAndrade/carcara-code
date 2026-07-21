'use strict';
// Catálogo puro das skills do Claude Code que o Carcará sabe instalar com 1 clique.
// Cada entrada é uma skill publicada no npm com instalador próprio (o pacote cria o
// link em ~/.claude/skills/<dir>). SEM fs, SEM child_process: as decisões (comando,
// onde o link cai, o que precisa estar instalado) ficam testáveis no
// scripts/skill-catalog-smoke.cjs — padrão do CLAUDE.md.

const CATALOG = [
  {
    id: 'start',
    // Pacote npm com o bin `start-skill` (clona o repo e linka em .claude/skills/start).
    pkg: 'start-skill',
    dir: 'start',
    url: 'https://github.com/Yg0rAndrade/start-skill',
    // O instalador clona via git; sem node/git ele falha com erro cru de shell.
    needs: ['node', 'git'],
    // Escopo 'project': o link vai pra <projeto>/.claude/skills/start, não pra home.
    // É o que o CTA precisa — "instalada" tem que falar do projeto aberto; instalação
    // global faria o botão nunca aparecer pra quem já rodou o npx alguma vez.
    scope: 'project',
  },
];

const BY_ID = new Map(CATALOG.map((s) => [s.id, s]));

function listSkills() {
  return CATALOG.map(({ id, pkg, dir, url }) => ({ id, pkg, dir, url }));
}

function find(id) {
  return BY_ID.get(id) || null;
}

// Comando do instalador, já com a flag do escopo da entrada. `--project` é passado
// EXPLÍCITO de propósito: o padrão do start-skill hoje é global, e depender do
// padrão do pacote deixaria o escopo à mercê de uma publicação nova no npm.
function commandFor(id) {
  const s = BY_ID.get(id);
  if (!s) return null;
  const cmd = ['npx', '-y', s.pkg];
  if (scopeFor(id) === 'project') cmd.push('--project');
  return cmd;
}

// 'project' = link dentro da pasta do projeto; 'global' = na home do usuário.
function scopeFor(id) {
  const s = BY_ID.get(id);
  return s ? s.scope || 'global' : null;
}

// Segmentos do caminho do link, a partir da base do escopo (projeto ou home).
// Quem junta com path.join é o main (aqui não há fs).
function linkSegmentsFor(id) {
  const s = BY_ID.get(id);
  return s ? ['.claude', 'skills', s.dir] : null;
}

function requirementsFor(id) {
  const s = BY_ID.get(id);
  return s ? (s.needs || []).slice() : [];
}

module.exports = {
  CATALOG,
  listSkills,
  find,
  commandFor,
  scopeFor,
  linkSegmentsFor,
  requirementsFor,
};
