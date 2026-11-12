// Normalização do layout do Rail (cfg.rail). Puro e sem dependências, pra ser testável
// fora do Electron (scripts/rail-smoke.cjs) e usado pelo main.js em toda leitura/escrita.
//
// Item shapes:
//   { type: 'project', path: string }
//   { type: 'folder', id: string, name: string, collapsed: boolean, children: string[],
//     color?: '#rrggbb' }
//
// Invariantes garantidas por reconcile():
//   - só paths que existem em `projects`;
//   - sem duplicatas (1ª ocorrência vence, solta ou em pasta);
//   - projetos novos (em projects, ausentes do rail) entram soltos no fim;
//   - pastas vazias PERSISTEM (o usuário pode criar pasta pelo "+"); quem esvazia via
//     drag-and-drop é o applyDrop, que descarta a pasta ao tirar o último filho;
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
      // Pasta vazia PERSISTE (criada pelo "+"). Só o applyDrop dissolve ao tirar o último filho.
      out.push({
        type: 'folder',
        id: String(raw.id || ''),
        name: typeof raw.name === 'string' ? raw.name : '',
        collapsed: raw.collapsed === true,
        children,
        // Cor opcional da pasta: só #rrggbb (nada de CSS arbitrário vindo do config).
        ...(typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)
          ? { color: raw.color }
          : {}),
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
