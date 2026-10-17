'use strict';

// Plugins LOCAIS do Carcará: pastas em electron/plugins/<id>/ que ficam fora do repo
// (.gitignore). Cada uma pode oferecer um "visual de chat" alternativo pras abas do
// Claude, desenhado num <webview> próprio. Sem plugins instalados, nada disto aparece.
// Contrato em electron/plugins/README.md.
//
// O main.js usa em 3 tempos: discover() no topo (antes do app ficar pronto, porque os
// schemes privilegiados só podem ser registrados ali), activate() no whenReady e as
// chamadas por id (chatView/setTheme) vindas do renderer.

const fs = require('fs');
const path = require('path');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function isValidPlugin(mod, dirName) {
  return (
    mod &&
    typeof mod === 'object' &&
    ID_RE.test(mod.id || '') &&
    mod.id === dirName &&
    typeof mod.label === 'string' &&
    typeof mod.activate === 'function'
  );
}

// Carrega os plugins da pasta. Plugin quebrado não derruba o app: vai pro log e some.
function discover(pluginsDir, log = () => {}) {
  let names = [];
  try {
    names = fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.sort()) {
    const entry = path.join(pluginsDir, name, 'index.cjs');
    if (!fs.existsSync(entry)) continue;
    try {
      const mod = require(entry);
      if (isValidPlugin(mod, name)) out.push({ mod, instance: null });
      else log(`[plugins] ${name}: formato inválido (id, label e activate são obrigatórios)`);
    } catch (err) {
      log(`[plugins] ${name}: falhou ao carregar`, err);
    }
  }
  return out;
}

// Schemes que os plugins pedem, pra somar aos do app no registerSchemesAsPrivileged.
function schemes(plugins) {
  return plugins.flatMap((p) => (Array.isArray(p.mod.schemes) ? p.mod.schemes : []));
}

function activate(plugins, ctx) {
  for (const p of plugins) {
    try {
      p.instance = p.mod.activate(ctx) || {};
    } catch (err) {
      ctx.log(`[plugins] ${p.mod.id}: falhou ao ativar`, err);
      p.instance = null;
    }
  }
}

const active = (plugins) => plugins.filter((p) => p.instance);
const byId = (plugins, id) => active(plugins).find((p) => p.mod.id === id);

// O que o renderer precisa pra listar nas Configurações.
function list(plugins) {
  return active(plugins).map(({ mod }) => ({
    id: mod.id,
    label: mod.label,
    description: mod.description || '',
  }));
}

// Modo do painel de chat: 'cli', 'chat' ou 'plugin:<id>' de um plugin ativo.
function chatModeOf(plugins, v) {
  if (v === 'chat') return 'chat';
  if (typeof v === 'string' && v.startsWith('plugin:') && byId(plugins, v.slice(7))) return v;
  return 'cli';
}

async function chatView(plugins, id, opts) {
  const p = byId(plugins, id);
  if (!p || typeof p.instance.chatView !== 'function') throw new Error(`plugin ${id} indisponível`);
  return p.instance.chatView(opts);
}

function setTheme(plugins, tokens) {
  for (const p of active(plugins)) {
    try {
      p.instance.setTheme?.(tokens);
    } catch {}
  }
}

function dispose(plugins) {
  for (const p of active(plugins)) {
    try {
      p.instance.dispose?.();
    } catch {}
  }
}

module.exports = {
  isValidPlugin,
  discover,
  schemes,
  activate,
  list,
  chatModeOf,
  chatView,
  setTheme,
  dispose,
};
