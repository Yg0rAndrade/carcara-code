// Normalização do layout do Rail (cfg.rail). Puro e sem dependências, pra ser testável
// fora do Electron (scripts/rail-smoke.cjs) e usado pelo main.js em toda leitura/escrita.
//
// Item shapes:
//   { type: 'project', path: string }
//   { type: 'folder', id: string, name: string, collapsed: boolean, children: string[] }
//
// Invariantes garantidas por reconcile():
//   - só paths que existem em `projects`;
//   - sem duplicatas (1ª ocorrência vence, solta ou em pasta);
//   - projetos novos (em projects, ausentes do rail) entram soltos no fim;
//   - pastas sem filhos são removidas (config nunca guarda pasta vazia);
//   - shapes com defaults.

function reconcile(rail, projects) {
  const exists = new Set(Array.isArray(projects) ? projects : []);
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(rail) ? rail : []) {
    if (!raw || typeof raw !== 'object') continue;

    if (raw.type === 'folder') {
      const children = [];
      for (const c of Array.isArray(raw.children) ? raw.children : []) {
        if (typeof c === 'string' && exists.has(c) && !seen.has(c)) {
          seen.add(c);
          children.push(c);
        }
      }
      if (children.length === 0) continue; // pasta vazia não persiste
      out.push({
        type: 'folder',
        id: String(raw.id || ''),
        name: typeof raw.name === 'string' ? raw.name : '',
        collapsed: raw.collapsed === true,
        children,
      });
    } else {
      // trata qualquer coisa não-folder como projeto
      const p = raw.path;
      if (typeof p === 'string' && exists.has(p) && !seen.has(p)) {
        seen.add(p);
        out.push({ type: 'project', path: p });
      }
    }
  }

  // Projetos que existem mas não apareceram em lugar nenhum: soltos no fim, na ordem de projects.
  for (const p of exists) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push({ type: 'project', path: p });
    }
  }

  return out;
}

module.exports = { reconcile };
