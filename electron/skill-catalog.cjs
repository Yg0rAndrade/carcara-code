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
  },
];

const BY_ID = new Map(CATALOG.map((s) => [s.id, s]));

function listSkills() {
  return CATALOG.map(({ id, pkg, dir, url }) => ({ id, pkg, dir, url }));
}

function find(id) {
  return BY_ID.get(id) || null;
}

// Comando do instalador. `project: true` instala só no projeto atual (link em
// ./.claude/skills/<dir>); o padrão é global (~/.claude/skills/<dir>).
function commandFor(id, { project = false } = {}) {
  const s = BY_ID.get(id);
  if (!s) return null;
  const cmd = ['npx', '-y', s.pkg];
  if (project) cmd.push('--project');
  return cmd;
}

// Segmentos do caminho do link, a partir da home (global) ou da pasta do projeto.
// Quem junta com path.join é o main (aqui não há fs).
function linkSegmentsFor(id) {
  const s = BY_ID.get(id);
  return s ? ['.claude', 'skills', s.dir] : null;
}

function requirementsFor(id) {
  const s = BY_ID.get(id);
  return s ? (s.needs || []).slice() : [];
}

module.exports = { CATALOG, listSkills, find, commandFor, linkSegmentsFor, requirementsFor };
