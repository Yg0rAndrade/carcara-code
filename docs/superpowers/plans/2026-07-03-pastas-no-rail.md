# Pastas no Rail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar pastas de um nível (estilo springboard do iOS) ao Rail do Carcará Code, com criação por drag-and-drop (borda reordena, centro cria/entra) e por um menu no botão "+".

**Architecture:** O layout do Rail passa a ser um array ordenado `cfg.rail` (itens `project` ou `folder`), separado da lista canônica `cfg.projects`. A **normalização/reconciliação** vive num módulo puro `rail-core.cjs` (CJS, `require`d pelo `main.js`, testado por smoke node — mesmo padrão de `csv-core.cjs`/`mcp-core.cjs`). As **transformações de layout do renderer** (reordenar, criar/entrar/sair de pasta, recolher, renomear, desfazer) vivem num módulo ESM puro `src/lib/railTree.js`, testado por vitest. O `Rail.jsx` renderiza as linhas achatadas por `buildRows` e anima com `motion` (`layout`).

**Tech Stack:** Electron (main CJS) + React (Vite, ESM) + Tailwind + `motion` (framer-motion v12, já instalado) + vitest (`environment: node`, já configurado).

## Global Constraints

- **i18n obrigatório:** nenhum texto visível hardcoded no JSX. Toda string nova entra em `src/lib/locales/pt.json` **e** `src/lib/locales/en.json`. Rodar `node scripts/i18n-parity.smoke.cjs` antes de fechar tarefa que mexa em texto. Jargão consagrado idêntico nos dois idiomas.
- **Build para ver mudança:** edições em `src/` só aparecem após `npm run build` (o app carrega de `dist/`). Não forçar relaunch do app sem confirmar — pode ter sessão viva do Claude.
- **Isolamento:** todo o trabalho acontece no worktree `.claude/worktrees/rail-folders` (branch `feat/rail-folders`). O usuário roda várias sessões do Claude em paralelo; não tocar no working copy principal.
- **Modelo de dados canônico:** `cfg.projects` (array de paths) continua a fonte de verdade dos projetos que existem; `projects:add`/`projects:remove` só mexem nela. `cfg.rail` é **apenas layout**. `cfg.projectMeta[path]` (nome/cor/ícone) não muda.
- **Item shapes** (idênticos em `cfg.rail`, `rail-core.cjs` e `railTree.js`):
  - `{ type: 'project', path: string }`
  - `{ type: 'folder', id: string, name: string, collapsed: boolean, children: string[] }`
- **IDs de pasta:** `"f" + N` (N = maior número existente + 1). Contador determinístico (não `Date.now`/`Math.random`) para os testes serem estáveis.
- **Regra de pasta vazia:** `reconcile` **remove pastas sem filhos** (invariante: config nunca guarda pasta vazia). A criação por "+" usa uma **pasta-rascunho só no renderer**, persistida apenas quando ganha o primeiro filho.

---

## File Structure

**Novos:**
- `rail-core.cjs` (raiz, CJS) — `reconcile(rail, projects)`. Autoridade de normalização usada pelo main em toda leitura/escrita.
- `scripts/rail-smoke.cjs` — smoke node de `rail-core.cjs`. Novo script `test:rail` no `package.json`.
- `src/lib/railTree.js` (ESM puro) — `buildRows`, `nextFolderId`, `applyDrop`, `toggleCollapse`, `renameFolder`, `dissolveFolder`.
- `src/lib/railTree.test.js` — testes vitest de `railTree.js`.
- `src/components/RailFolder.jsx` — o ícone de pasta fechada (mini-grid 2×2) e o cabeçalho da pasta aberta. Mantém o `Rail.jsx` focado.

**Modificados:**
- `main.js` — `require('./rail-core.cjs')`; `projects:list` passa a devolver `{ projects, rail }`; novo handler `rail:set`.
- `preload.js` — expor `listProjects` (novo formato) e `setRail`.
- `src/App.jsx` — consumir `{ projects, rail }`; estado `rail`; handler `setRail`; passar `rail`/handlers ao `Rail`.
- `src/components/Rail.jsx` — renderizar linhas de `buildRows` (projetos soltos + pastas + filhos indentados), drag borda-vs-centro, menu do "+", menu de contexto de pasta, animações `motion`.
- `src/lib/locales/pt.json` + `src/lib/locales/en.json` — strings novas.
- `AGENTS.md` — seção sobre sessões paralelas.

---

## Task 1: `rail-core.cjs` — reconciliação (modelo de dados)

**Files:**
- Create: `rail-core.cjs`
- Create: `scripts/rail-smoke.cjs`
- Modify: `package.json` (adicionar script `test:rail`)

**Interfaces:**
- Produces:
  - `reconcile(rail, projects) -> Item[]` — recebe `rail` (array possivelmente `undefined`/sujo) e `projects` (`string[]` canônico); devolve um `rail` novo, normalizado: só paths existentes, sem duplicatas, projetos novos anexados soltos no fim, pastas sem filhos removidas, shapes com defaults (`collapsed:false`, `name` string, `children` array).

- [ ] **Step 1: Escrever o smoke que falha**

Create `scripts/rail-smoke.cjs`:

```js
// Smoke da reconciliação do Rail fora do Electron. Usa o MESMO rail-core.cjs do main.js.
// Uso: node scripts/rail-smoke.cjs
const { reconcile } = require('../rail-core.cjs');

let fail = 0;
function assert(cond, msg) { if (!cond) { console.error('  ASSERT: ' + msg); fail++; } }
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), `${msg} :: got ${JSON.stringify(a)}`); }

// 1) Migração: sem rail -> tudo solto na ordem de projects.
eq(
  reconcile(undefined, ['/a', '/b']),
  [{ type: 'project', path: '/a' }, { type: 'project', path: '/b' }],
  'migra rail ausente para projetos soltos'
);

// 2) Órfão no topo é removido.
eq(
  reconcile([{ type: 'project', path: '/x' }, { type: 'project', path: '/a' }], ['/a']),
  [{ type: 'project', path: '/a' }],
  'remove projeto solto órfão'
);

// 3) Órfão dentro da pasta é removido; pasta continua com os válidos.
eq(
  reconcile(
    [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a', '/gone'] }],
    ['/a']
  ),
  [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a'] }],
  'remove filho órfão da pasta'
);

// 4) Pasta que fica sem filhos é descartada.
eq(
  reconcile(
    [{ type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/gone'] }],
    []
  ),
  [],
  'descarta pasta sem filhos'
);

// 5) Projeto novo (em projects, ausente do rail) entra solto no fim.
eq(
  reconcile([{ type: 'project', path: '/a' }], ['/a', '/b']),
  [{ type: 'project', path: '/a' }, { type: 'project', path: '/b' }],
  'anexa projeto novo no fim'
);

// 6) Projeto dentro de pasta NÃO é reanexado no topo (já está coberto).
eq(
  reconcile(
    [{ type: 'folder', id: 'f1', name: 'P', collapsed: true, children: ['/a'] }],
    ['/a', '/b']
  ),
  [
    { type: 'folder', id: 'f1', name: 'P', collapsed: true, children: ['/a'] },
    { type: 'project', path: '/b' },
  ],
  'projeto em pasta conta como coberto; só o novo /b entra solto'
);

// 7) Deduplica: mesmo path solto e dentro de pasta -> mantém 1 (o primeiro encontrado).
eq(
  reconcile(
    [{ type: 'project', path: '/a' }, { type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/a', '/b'] }],
    ['/a', '/b']
  ),
  [
    { type: 'project', path: '/a' },
    { type: 'folder', id: 'f1', name: 'P', collapsed: false, children: ['/b'] },
  ],
  'deduplica path repetido mantendo a primeira ocorrência'
);

// 8) Defaults de shape: folder sem collapsed/name/children vira válido.
eq(
  reconcile([{ type: 'folder', id: 'f1', children: ['/a'] }], ['/a']),
  [{ type: 'folder', id: 'f1', name: '', collapsed: false, children: ['/a'] }],
  'aplica defaults de shape na pasta'
);

if (fail) { console.error(`\n${fail} asserção(ões) falharam.`); process.exit(1); }
console.log('rail-core smoke ok');
```

- [ ] **Step 2: Rodar o smoke e ver falhar**

Run: `cd .claude/worktrees/rail-folders && node scripts/rail-smoke.cjs`
Expected: FAIL com `Cannot find module '../rail-core.cjs'`.

- [ ] **Step 3: Implementar `rail-core.cjs`**

Create `rail-core.cjs`:

```js
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
```

- [ ] **Step 4: Rodar o smoke e ver passar**

Run: `node scripts/rail-smoke.cjs`
Expected: `rail-core smoke ok`

- [ ] **Step 5: Adicionar script npm**

Modify `package.json`, dentro de `"scripts"`, após `"test:csv"`:

```json
    "test:rail": "node scripts/rail-smoke.cjs"
```

(Lembrar da vírgula na linha anterior.)

- [ ] **Step 6: Commit**

```bash
git add rail-core.cjs scripts/rail-smoke.cjs package.json
git commit -m "feat: rail-core.cjs — reconciliação do layout de pastas do Rail"
```

---

## Task 2: Backend — `main.js` + `preload.js`

**Files:**
- Modify: `main.js` (região `projects:list` ~L644-660; `projects:reorder` ~L584-593)
- Modify: `preload.js` (~L46-53)

**Interfaces:**
- Consumes: `reconcile` de `rail-core.cjs` (Task 1).
- Produces (IPC):
  - `projects:list` → `{ projects: ProjectView[], rail: Item[] }` onde `ProjectView` é o objeto atual (`{ name, path, hasPkg, running, icon, color }`) e `rail` é o layout já reconciliado. **Persiste** o rail reconciliado no config (auto-heal).
  - `rail:set({ rail })` → salva `reconcile(rail, cfg.projects)`; retorna `{ ok: true, rail }`.
- Bridge (`window.api`):
  - `listProjects() -> Promise<{ projects, rail }>`
  - `setRail(rail) -> Promise<{ ok, rail }>`

- [ ] **Step 1: `require` do rail-core no topo do main.js**

Modify `main.js` — junto dos outros `require` de módulos core (ex.: perto de `const mcpCore = require('./mcp-core.cjs')`; procure por `require('./` para achar o bloco):

```js
const { reconcile: reconcileRail } = require('./rail-core.cjs');
```

- [ ] **Step 2: `projects:list` devolve `{ projects, rail }` e faz auto-heal**

Modify `main.js` — o handler `ipcMain.handle('projects:list', () => { ... })`. Envolver o retorno atual: manter o `.map(...)` que produz os `ProjectView` numa const `views`, reconciliar o rail contra `cfg.projects`, salvar se mudou, e retornar os dois.

Substituir o corpo do handler por:

```js
ipcMain.handle('projects:list', () => {
  const cfg = loadConfig();
  const meta = cfg.projectMeta || {};
  const existing = cfg.projects.filter((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
  const views = existing.map((p) => {
    let hasPkg = false;
    try { fs.accessSync(path.join(p, 'package.json')); hasPkg = true; } catch {}
    const m = meta[p] || {};
    return {
      name: m.name || path.basename(p),
      path: p,
      hasPkg,
      running: runningServers.has(p),
      icon: m.icon || findFavicon(p),
      color: m.color || null,
    };
  });
  // Reconcilia o layout contra os projetos que realmente existem no disco.
  const rail = reconcileRail(cfg.rail, views.map((v) => v.path));
  if (JSON.stringify(rail) !== JSON.stringify(cfg.rail || [])) { cfg.rail = rail; saveConfig(cfg); }
  return { projects: views, rail };
});
```

Nota: `existing` filtra por diretório real (como antes), e o rail é reconciliado contra esses paths — projeto cuja pasta sumiu do disco cai fora do rail também.

- [ ] **Step 3: Novo handler `rail:set`**

Modify `main.js` — logo após o handler `projects:reorder` (deixe o `projects:reorder` como está, por compatibilidade):

```js
// Persiste o layout do Rail (ordem + pastas) vindo do renderer. Reconcilia contra a
// lista canônica de projetos antes de salvar (rede de segurança contra estado sujo).
ipcMain.handle('rail:set', (evt, { rail }) => {
  const cfg = loadConfig();
  cfg.rail = reconcileRail(rail, cfg.projects);
  saveConfig(cfg);
  return { ok: true, rail: cfg.rail };
});
```

- [ ] **Step 4: Expor no preload**

Modify `preload.js` — no objeto exposto (junto de `listProjects`/`reorderProjects`):

```js
  listProjects: () => ipcRenderer.invoke('projects:list'),
  setRail: (rail) => ipcRenderer.invoke('rail:set', { rail }),
```

(Se já houver `listProjects`, manter a linha única; só adicionar `setRail`.)

- [ ] **Step 5: Verificar que o main carrega sem erro de sintaxe**

Run: `node -e "require('./rail-core.cjs'); console.log('core ok')"`
Expected: `core ok`

Run: `node --check main.js && node --check preload.js`
Expected: sem saída (sintaxe ok).

- [ ] **Step 6: Commit**

```bash
git add main.js preload.js
git commit -m "feat: backend do Rail — projects:list devolve {projects, rail} + rail:set"
```

---

## Task 3: `railTree.js` — transformações de layout (renderer)

**Files:**
- Create: `src/lib/railTree.js`
- Create: `src/lib/railTree.test.js`

**Interfaces:**
- Produces (todas puras, recebem e devolvem `Item[]` novos; nunca mutam a entrada):
  - `nextFolderId(rail) -> string`
  - `buildRows(rail, projectByPath) -> Row[]` onde `Row` é:
    - `{ kind: 'project', key: path, project }`
    - `{ kind: 'folder', key: 'folder:'+id, folder, previews: project[0..4], count }`
    - `{ kind: 'child', key: path, project, folderId }` (só quando a pasta está aberta)
  - `toggleCollapse(rail, folderId) -> Item[]`
  - `renameFolder(rail, folderId, name) -> Item[]`
  - `dissolveFolder(rail, folderId) -> Item[]` (troca a pasta pelos filhos como projetos soltos, na posição da pasta)
  - `applyDrop(rail, ctx) -> Item[]` — matriz única de drop. `ctx = { dragPath, targetKind, targetPath, targetFolderId, targetIndex, zone }`, `zone ∈ {'reorder','merge'}`. Regras:
    - `zone='merge'`, alvo `project` (topo) → cria pasta `newFolderName` com `[targetPath, dragPath]` na posição do alvo; remove `dragPath` de onde estava; pasta de origem esvaziada é removida.
    - `zone='merge'`, alvo `folder` ou `child` → move `dragPath` para dentro dessa pasta (`targetFolderId`); origem esvaziada é removida.
    - `zone='reorder'`, alvo topo (`project`/`folder`) → move `dragPath` para o topo, inserido na posição do alvo; origem esvaziada removida.
    - `zone='reorder'`, alvo `child` → move `dragPath` para dentro da pasta do alvo, na posição do alvo.
    - Se `dragPath` for uma pasta (ver nota), só reordena no topo.
  - `ctx.newFolderName: string` — nome da pasta nova (o componente passa `t('rail.folder_default')`).

Nota sobre arrastar pasta: o componente passa o **path** para projetos e, para pastas, usa `dragFolderId`. `applyDrop` recebe `dragPath` OU `dragFolderId`. Simplificação v1: pasta só reordena no topo (sem aninhar). Ver Step de código.

- [ ] **Step 1: Escrever os testes que falham**

Create `src/lib/railTree.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  nextFolderId, buildRows, toggleCollapse, renameFolder, dissolveFolder, applyDrop,
} from './railTree.js';

const P = (path) => ({ type: 'project', path });
const F = (id, children, extra = {}) => ({ type: 'folder', id, name: 'P', collapsed: false, children, ...extra });
const mapOf = (...paths) => new Map(paths.map((p) => [p, { path: p, name: p }]));

describe('nextFolderId', () => {
  it('começa em f1 sem pastas', () => {
    expect(nextFolderId([P('/a')])).toBe('f1');
  });
  it('é max+1 sem colidir', () => {
    expect(nextFolderId([F('f1', ['/a']), F('f3', ['/b'])])).toBe('f4');
  });
});

describe('buildRows', () => {
  it('projeto solto vira linha project', () => {
    const rows = buildRows([P('/a')], mapOf('/a'));
    expect(rows).toEqual([{ kind: 'project', key: '/a', project: { path: '/a', name: '/a' } }]);
  });
  it('pasta fechada não emite filhos; abertos emite child indentado', () => {
    const rail = [F('f1', ['/a', '/b'], { collapsed: true })];
    const closed = buildRows(rail, mapOf('/a', '/b'));
    expect(closed.map((r) => r.kind)).toEqual(['folder']);
    expect(closed[0].previews.length).toBe(2);
    expect(closed[0].count).toBe(2);

    const open = buildRows([F('f1', ['/a', '/b'], { collapsed: false })], mapOf('/a', '/b'));
    expect(open.map((r) => r.kind)).toEqual(['folder', 'child', 'child']);
    expect(open[1]).toMatchObject({ kind: 'child', key: '/a', folderId: 'f1' });
  });
});

describe('toggleCollapse', () => {
  it('inverte collapsed sem mutar', () => {
    const rail = [F('f1', ['/a'], { collapsed: false })];
    const out = toggleCollapse(rail, 'f1');
    expect(out[0].collapsed).toBe(true);
    expect(rail[0].collapsed).toBe(false); // imutável
  });
});

describe('renameFolder', () => {
  it('troca o nome da pasta certa', () => {
    const out = renameFolder([F('f1', ['/a'])], 'f1', 'Clientes');
    expect(out[0].name).toBe('Clientes');
  });
});

describe('dissolveFolder', () => {
  it('troca a pasta pelos filhos soltos na posição', () => {
    const rail = [P('/x'), F('f1', ['/a', '/b']), P('/y')];
    const out = dissolveFolder(rail, 'f1');
    expect(out).toEqual([P('/x'), P('/a'), P('/b'), P('/y')]);
  });
});

describe('applyDrop', () => {
  it('merge em projeto do topo cria pasta com [alvo, arrastado]', () => {
    const rail = [P('/a'), P('/b')];
    const out = applyDrop(rail, { dragPath: '/a', targetKind: 'project', targetPath: '/b', zone: 'merge', newFolderName: 'Nova' });
    expect(out).toEqual([{ type: 'folder', id: 'f1', name: 'Nova', collapsed: false, children: ['/b', '/a'] }]);
  });
  it('merge em pasta move pra dentro dela', () => {
    const rail = [F('f1', ['/a']), P('/b')];
    const out = applyDrop(rail, { dragPath: '/b', targetKind: 'folder', targetFolderId: 'f1', zone: 'merge' });
    expect(out).toEqual([F('f1', ['/a', '/b'])]);
  });
  it('reorder no topo move o item para a posição do alvo', () => {
    const rail = [P('/a'), P('/b'), P('/c')];
    const out = applyDrop(rail, { dragPath: '/c', targetKind: 'project', targetPath: '/a', zone: 'reorder' });
    expect(out.map((i) => i.path)).toEqual(['/c', '/a', '/b']);
  });
  it('arrastar filho pra fora (reorder no topo) esvazia e remove a pasta', () => {
    const rail = [F('f1', ['/a']), P('/b')];
    const out = applyDrop(rail, { dragPath: '/a', targetKind: 'project', targetPath: '/b', zone: 'reorder' });
    expect(out).toEqual([P('/a'), P('/b')]); // pasta f1 sumiu ao esvaziar
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `cd .claude/worktrees/rail-folders && npx vitest run src/lib/railTree.test.js`
Expected: FAIL — `Failed to resolve import "./railTree.js"`.

- [ ] **Step 3: Implementar `src/lib/railTree.js`**

Create `src/lib/railTree.js`:

```js
// Transformações puras do layout do Rail (cfg.rail) para o renderer. Sem dependências,
// nunca mutam a entrada — cada função devolve um rail novo. Testado em railTree.test.js.
// Item shapes idênticos a rail-core.cjs.

const clone = (rail) => rail.map((it) =>
  it.type === 'folder' ? { ...it, children: [...it.children] } : { ...it });

export function nextFolderId(rail) {
  let max = 0;
  for (const it of rail) {
    if (it.type === 'folder') {
      const m = /^f(\d+)$/.exec(it.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return 'f' + (max + 1);
}

export function buildRows(rail, projectByPath) {
  const rows = [];
  for (const it of rail) {
    if (it.type === 'folder') {
      const kids = it.children.map((c) => projectByPath.get(c)).filter(Boolean);
      rows.push({ kind: 'folder', key: 'folder:' + it.id, folder: it, previews: kids.slice(0, 4), count: kids.length });
      if (!it.collapsed) {
        for (const c of it.children) {
          const p = projectByPath.get(c);
          if (p) rows.push({ kind: 'child', key: c, project: p, folderId: it.id });
        }
      }
    } else {
      const p = projectByPath.get(it.path);
      if (p) rows.push({ kind: 'project', key: it.path, project: p });
    }
  }
  return rows;
}

export function toggleCollapse(rail, folderId) {
  return rail.map((it) => (it.type === 'folder' && it.id === folderId ? { ...it, collapsed: !it.collapsed } : it));
}

export function renameFolder(rail, folderId, name) {
  return rail.map((it) => (it.type === 'folder' && it.id === folderId ? { ...it, name } : it));
}

export function dissolveFolder(rail, folderId) {
  const out = [];
  for (const it of rail) {
    if (it.type === 'folder' && it.id === folderId) {
      for (const c of it.children) out.push({ type: 'project', path: c });
    } else {
      out.push(it);
    }
  }
  return out;
}

// --- helpers internos de applyDrop ---

// Remove um path de onde quer que esteja (topo ou dentro de pasta). Devolve [rail, removido?].
// Pastas que ficam vazias são descartadas.
function removePath(rail, path) {
  let removed = false;
  const out = [];
  for (const it of rail) {
    if (it.type === 'folder') {
      const before = it.children.length;
      const children = it.children.filter((c) => c !== path);
      if (children.length !== before) removed = true;
      if (children.length > 0) out.push({ ...it, children });
      // pasta vazia é descartada
    } else if (it.type === 'project' && it.path === path) {
      removed = true; // dropa o projeto solto
    } else {
      out.push(it);
    }
  }
  return [out, removed];
}

// Índice do item de topo que contém a "key" alvo (path de projeto solto OU 'folder:id').
function topIndexOfProject(rail, path) {
  return rail.findIndex((it) => it.type === 'project' && it.path === path);
}
function topIndexOfFolder(rail, folderId) {
  return rail.findIndex((it) => it.type === 'folder' && it.id === folderId);
}

export function applyDrop(rail, ctx) {
  const { dragPath, dragFolderId, targetKind, targetPath, targetFolderId, zone, newFolderName } = ctx;
  const base = clone(rail);

  // Arrastar PASTA: só reordena no topo (sem aninhar).
  if (dragFolderId) {
    const from = topIndexOfFolder(base, dragFolderId);
    if (from === -1) return base;
    const [moved] = base.splice(from, 1);
    let to = targetKind === 'folder' ? topIndexOfFolder(base, targetFolderId) : topIndexOfProject(base, targetPath);
    if (to === -1) to = base.length;
    base.splice(to, 0, moved);
    return base;
  }

  // Arrastar PROJETO.
  if (zone === 'merge' && targetKind === 'project') {
    // cria pasta com [alvo, arrastado] na posição do alvo
    let [afterRemove] = removePath(base, dragPath);
    // recomputa índice do alvo APÓS remover o arrastado
    let ti = topIndexOfProject(afterRemove, targetPath);
    if (ti === -1) return base; // alvo sumiu (era o mesmo?) -> no-op
    const folder = { type: 'folder', id: nextFolderId(afterRemove), name: newFolderName || '', collapsed: false, children: [targetPath, dragPath] };
    afterRemove.splice(ti, 1, folder);
    return afterRemove;
  }

  if (zone === 'merge' && (targetKind === 'folder' || targetKind === 'child')) {
    let [afterRemove] = removePath(base, dragPath);
    const fi = topIndexOfFolder(afterRemove, targetFolderId);
    if (fi === -1) return base;
    if (!afterRemove[fi].children.includes(dragPath)) afterRemove[fi].children.push(dragPath);
    return afterRemove;
  }

  if (zone === 'reorder' && targetKind === 'child') {
    // move pra dentro da pasta do filho-alvo, na posição do alvo
    let [afterRemove] = removePath(base, dragPath);
    const fi = topIndexOfFolder(afterRemove, targetFolderId);
    if (fi === -1) return base;
    const idx = afterRemove[fi].children.indexOf(targetPath);
    afterRemove[fi].children.splice(idx === -1 ? afterRemove[fi].children.length : idx, 0, dragPath);
    return afterRemove;
  }

  // zone === 'reorder', alvo no topo (project/folder) -> move pro topo na posição do alvo
  {
    let [afterRemove] = removePath(base, dragPath);
    let ti = targetKind === 'folder' ? topIndexOfFolder(afterRemove, targetFolderId) : topIndexOfProject(afterRemove, targetPath);
    if (ti === -1) ti = afterRemove.length;
    afterRemove.splice(ti, 0, { type: 'project', path: dragPath });
    return afterRemove;
  }
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npx vitest run src/lib/railTree.test.js`
Expected: todos os testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/railTree.js src/lib/railTree.test.js
git commit -m "feat: railTree.js — transformações puras do layout de pastas do Rail"
```

---

## Task 4: i18n — strings novas (pt + en)

**Files:**
- Modify: `src/lib/locales/pt.json` (bloco `"rail"`)
- Modify: `src/lib/locales/en.json` (bloco `"rail"`)

**Interfaces:**
- Produces (chaves consumidas por `Rail.jsx`/`RailFolder.jsx` nas Tasks 5-7):
  - `rail.folder_default`, `rail.add_menu_project`, `rail.add_menu_folder`, `rail.add_open_tooltip`, `rail.folder_open_tooltip`, `rail.folder_more` (`"+{n}"`), `rail.menu_folder_rename`, `rail.menu_folder_dissolve`.

- [ ] **Step 1: Adicionar chaves no pt.json**

Modify `src/lib/locales/pt.json` — dentro do objeto `"rail": { ... }`, adicionar:

```json
    "folder_default": "Nova pasta",
    "folder_more": "+{n}",
    "add_open_tooltip": "Adicionar projeto ou pasta",
    "add_menu_project": "Adicionar projeto",
    "add_menu_folder": "Nova pasta",
    "folder_open_tooltip": "Abrir/recolher pasta",
    "menu_folder_rename": "Renomear pasta",
    "menu_folder_dissolve": "Desfazer pasta"
```

(Cuidar das vírgulas: a chave anterior no bloco precisa terminar com vírgula.)

- [ ] **Step 2: Adicionar as MESMAS chaves no en.json**

Modify `src/lib/locales/en.json` — dentro de `"rail": { ... }`:

```json
    "folder_default": "New folder",
    "folder_more": "+{n}",
    "add_open_tooltip": "Add project or folder",
    "add_menu_project": "Add project",
    "add_menu_folder": "New folder",
    "folder_open_tooltip": "Open/collapse folder",
    "menu_folder_rename": "Rename folder",
    "menu_folder_dissolve": "Ungroup folder"
```

- [ ] **Step 3: Rodar o smoke de paridade e ver passar**

Run: `node scripts/i18n-parity.smoke.cjs`
Expected: `i18n parity ok`

- [ ] **Step 4: Commit**

```bash
git add src/lib/locales/pt.json src/lib/locales/en.json
git commit -m "feat(i18n): strings de pastas do Rail (pt+en)"
```

---

## Task 5: `RailFolder.jsx` + renderização de pastas no Rail

Renderiza pastas fechadas (mini-grid 2×2) e o cabeçalho da pasta aberta + filhos indentados. Ainda **sem** as novas mecânicas de drag/menus (Tasks 6-7): esta task troca a base de renderização de "lista de projetos" para "linhas de `buildRows`", preservando o comportamento atual de projetos soltos (abrir, rename inline, menu de contexto, badges).

**Files:**
- Create: `src/components/RailFolder.jsx`
- Modify: `src/components/Rail.jsx`
- Modify: `src/App.jsx` (passar `rail` + `projectByPath`)

**Interfaces:**
- Consumes: `buildRows`, `toggleCollapse` (Task 3); `rail`, `setRail` (Tasks 2/8).
- `RailFolder` props: `{ folder, previews, count, active, onToggle, onContextMenu, t }`.
- Produces: `Rail` passa a receber `rail` (Item[]) e `projectByPath` (Map) além de `projects`.

- [ ] **Step 1: Criar `RailFolder.jsx`**

Create `src/components/RailFolder.jsx`:

```jsx
import { colorFor, initials } from '@/lib/projectColor';
import { cn } from '@/lib/utils';

// Célula do mini-grid: usa o ícone do projeto se houver, senão cor + inicial.
function Mini({ p }) {
  if (!p) return <span className="rounded-[3px] bg-muted/40" />;
  return p.icon ? (
    <span className="overflow-hidden rounded-[3px] bg-secondary">
      <img src={p.icon} alt="" draggable={false} className="h-full w-full object-contain" />
    </span>
  ) : (
    <span
      className="grid place-items-center rounded-[3px] text-[7px] font-bold leading-none text-white"
      style={{ background: p.color || colorFor(p.name) }}
    >
      {initials(p.name)}
    </span>
  );
}

// Ícone da pasta FECHADA: quadrado 42px com mini-grid 2×2 dos 4 primeiros filhos.
// Se houver mais de 4, o 4º slot mostra "+N".
export function RailFolderIcon({ folder, previews, count, active, moreLabel }) {
  const extra = count - 3; // se >4, o 4º vira +N (mostra 3 + contador)
  const cells = count > 4 ? previews.slice(0, 3) : previews.slice(0, 4);
  return (
    <span
      className={cn(
        'flex h-full w-full flex-col rounded-[inherit] bg-secondary p-1',
        active && 'ring-1 ring-primary/40'
      )}
    >
      <span className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
        {cells.map((p, i) => <Mini key={p?.path || i} p={p} />)}
        {count > 4 && (
          <span className="grid place-items-center rounded-[3px] bg-muted/60 text-[7px] font-bold leading-none text-muted-foreground">
            {moreLabel}
          </span>
        )}
        {count <= 4 && Array.from({ length: Math.max(0, 4 - cells.length) }).map((_, i) => <Mini key={'e' + i} p={null} />)}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: `App.jsx` — estado `rail` e `projectByPath`**

Modify `src/App.jsx`:

`reload` (≈L90) passa a ler o novo formato:

```js
  const [rail, setRail] = useState([]);

  const reload = useCallback(async () => {
    const res = await window.api.listProjects();
    setProjects(res.projects);
    setRail(res.rail);
  }, []);
```

Logo após o estado, derivar o mapa (memo):

```js
  const projectByPath = useMemo(() => new Map(projects.map((p) => [p.path, p])), [projects]);
```

(Garantir `useMemo` no import de `react` no topo do arquivo.)

- [ ] **Step 3: `Rail.jsx` — renderizar por linhas de `buildRows`**

Modify `src/components/Rail.jsx`:

- No topo, importar:

```jsx
import { buildRows } from '@/lib/railTree';
import { RailFolderIcon } from './RailFolder.jsx';
import { ChevronDown } from 'lucide-react';
```

- Alterar a assinatura para receber `rail`, `projectByPath`, `onToggleFolder` (além dos props atuais):

```jsx
export function Rail({ projects, rail = [], projectByPath, onToggleFolder, active, activity = {}, onOpen, onAdd, ... }) {
```

- Substituir a construção de `display` (o array de projetos) por linhas. Enquanto **não** há drag novo (Task 6), renderizar direto de `buildRows(rail, projectByPath)`. Extrair o corpo do botão de projeto atual (o `<button>` com badges) para um render helper `renderProjectButton(p, { indented })` reaproveitando o JSX existente, e adicionar o render de pasta. Trocar o `.map` da lista rolável por:

```jsx
        {buildRows(rail, projectByPath).map((row) => {
          if (row.kind === 'folder') {
            const f = row.folder;
            return (
              <button
                key={row.key}
                onClick={() => onToggleFolder?.(f.id)}
                onContextMenu={(e) => openFolderMenu(e, f)}
                title={f.name || t('rail.folder_default')}
                className={cn(
                  'relative flex h-[42px] w-[42px] items-center justify-center rounded-xl border transition-all hover:-translate-y-0.5',
                  !f.collapsed && 'ring-2 ring-primary/50'
                )}
              >
                <RailFolderIcon folder={f} previews={row.previews} count={row.count} active={!f.collapsed} moreLabel={t('rail.folder_more', { n: row.count - 3 })} />
                {!f.collapsed && <ChevronDown className="absolute -bottom-1 h-3 w-3 text-muted-foreground" />}
              </button>
            );
          }
          const indented = row.kind === 'child';
          return renderProjectButton(row.project, { indented, key: row.key });
        })}
```

- Criar `renderProjectButton` dentro do componente, movendo pra lá **exatamente** o JSX atual do botão/rename-input de projeto (linhas ~99-177), parametrizado por `p` e `{ indented, key }`. Aplicar indentação quando `indented`: adicionar `className` extra `ml-3` e um filete à esquerda. Exemplo do wrapper de indentação:

```jsx
  const renderProjectButton = (p, { indented = false, key } = {}) => {
    const el = ( /* ...JSX atual do renamingPath===p.path ? input : button... */ );
    return indented ? (
      <div key={key || p.path} className="flex w-full items-center justify-center">
        <span className="mr-1 h-[42px] w-px shrink-0 bg-border" />
        {el}
      </div>
    ) : el;
  };
```

Nota de implementação: como o container da lista usa `flex-wrap ... justify-center`, os filhos indentados devem quebrar linha própria; garantir que o wrapper de child tenha `basis-full` para ocupar a largura toda e ficar “abaixo” da pasta. Ajustar visualmente no build.

- Adicionar estado + handler do menu de pasta (usado no Step acima; o menu em si vem na Task 7, aqui só o stub que não quebra):

```jsx
  const [folderMenu, setFolderMenu] = useState(null); // { x, y, folder }
  const openFolderMenu = (e, f) => { e.preventDefault(); setFolderMenu({ x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 120), folder: f }); };
```

- [ ] **Step 4: `App.jsx` — passar props novas + handler de toggle**

Modify `src/App.jsx` — o `reorderProjects` existente vira baseado em `setRail`; por ora adicionar `toggleFolder` e passar props. No `<Rail ...>`:

```jsx
      rail={rail}
      projectByPath={projectByPath}
      onToggleFolder={(id) => persistRail(toggleCollapse(rail, id))}
```

Adicionar, perto de `reorderProjects`:

```js
  // Aplica um novo layout de rail (otimista) e persiste.
  const persistRail = async (nextRail) => {
    setRail(nextRail);
    const res = await window.api.setRail(nextRail);
    if (res?.rail) setRail(res.rail); // usa o reconciliado do main como verdade
  };
```

Importar no topo do App: `import { toggleCollapse } from '@/lib/railTree';`

- [ ] **Step 5: Build e verificação visual**

Run: `npm run build`
Expected: build sem erros.

Verificação manual (pedir ao usuário p/ olhar, sem forçar relaunch): abrir o app, confirmar que projetos soltos aparecem igual antes; se o `config.json` tiver alguma pasta de teste, ela aparece como mini-grid e abre/fecha ao clicar. (Como ainda não dá pra criar pasta pela UI, inserir uma pasta de teste manualmente no `config.json` OU adiar a verificação visual para depois da Task 6.)

- [ ] **Step 6: Commit**

```bash
git add src/components/RailFolder.jsx src/components/Rail.jsx src/App.jsx
git commit -m "feat: renderização de pastas no Rail (mini-grid + acordeão inline)"
```

---

## Task 6: Drag — borda reordena, centro cria/entra pasta (+ animação)

**Files:**
- Modify: `src/components/Rail.jsx`

**Interfaces:**
- Consumes: `applyDrop` (Task 3), `persistRail` via prop `onApplyDrop` (do App).
- Produces: `Rail` chama `onApplyDrop(ctx)` no drop; App faz `persistRail(applyDrop(rail, ctx))`.

- [ ] **Step 1: App passa `onApplyDrop`**

Modify `src/App.jsx` — importar `applyDrop` de `@/lib/railTree` e adicionar prop:

```jsx
      onApplyDrop={(ctx) => persistRail(applyDrop(rail, { ...ctx, newFolderName: t('rail.folder_default') }))}
```

- [ ] **Step 2: Estado de drag e detecção de zona no Rail**

Modify `src/components/Rail.jsx` — substituir o estado antigo `dragPath/overPath` e `commitDrop` por um modelo com zona e dwell:

```jsx
  const [drag, setDrag] = useState(null);      // { path } | { folderId }
  const [over, setOver] = useState(null);      // { key, zone: 'reorder'|'merge' }
  const dwellRef = useRef(null);               // timer do "segurar no centro"

  const clearDwell = () => { if (dwellRef.current) { clearTimeout(dwellRef.current); dwellRef.current = null; } };
  const resetDrag = () => { clearDwell(); setDrag(null); setOver(null); };

  // Decide zona pela posição do cursor dentro do elemento-alvo: 50% central = merge (após
  // dwell), resto = reorder. Só projetos/pastas podem receber merge.
  const onRowDragOver = (e, row) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragKey = drag?.path || (drag?.folderId ? 'folder:' + drag.folderId : null);
    if (!dragKey || row.key === dragKey) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const inCenter = cx > r.width * 0.25 && cx < r.width * 0.75 && cy > r.height * 0.25 && cy < r.height * 0.75;
    const canMerge = !drag?.folderId && (row.kind === 'project' || row.kind === 'folder' || row.kind === 'child');
    if (inCenter && canMerge) {
      if (!dwellRef.current && !(over?.key === row.key && over?.zone === 'merge')) {
        dwellRef.current = setTimeout(() => { setOver({ key: row.key, zone: 'merge' }); dwellRef.current = null; }, 400);
      }
      if (over?.key === row.key && over?.zone === 'merge') return; // já armado
      // enquanto não arma, mostra reorder
      if (over?.key !== row.key || over?.zone !== 'reorder') setOver({ key: row.key, zone: 'reorder' });
    } else {
      clearDwell();
      if (over?.key !== row.key || over?.zone !== 'reorder') setOver({ key: row.key, zone: 'reorder' });
    }
  };
```

- [ ] **Step 3: Montar o `ctx` e chamar `onApplyDrop` no drop**

Modify `src/components/Rail.jsx` — handler de drop por linha:

```jsx
  const onRowDrop = (e, row) => {
    e.preventDefault();
    const zone = over?.zone === 'merge' && over?.key === row.key ? 'merge' : 'reorder';
    if (drag?.path) {
      onApplyDrop?.({
        dragPath: drag.path,
        targetKind: row.kind,
        targetPath: row.kind === 'child' || row.kind === 'project' ? row.project.path : undefined,
        targetFolderId: row.kind === 'folder' ? row.folder.id : (row.kind === 'child' ? row.folderId : undefined),
        zone,
      });
    } else if (drag?.folderId) {
      onApplyDrop?.({
        dragFolderId: drag.folderId,
        targetKind: row.kind,
        targetPath: row.kind === 'project' ? row.project.path : undefined,
        targetFolderId: row.kind === 'folder' ? row.folder.id : undefined,
        zone: 'reorder',
      });
    }
    resetDrag();
  };
```

Fiar nos elementos (botão de projeto, wrapper de child, botão de pasta): `draggable`, `onDragStart={() => setDrag(row.kind==='folder' ? {folderId: row.folder.id} : {path: row.project.path})}`, `onDragOver={(e) => onRowDragOver(e, row)}`, `onDrop={(e) => onRowDrop(e, row)}`, `onDragEnd={resetDrag}`. O container rolável mantém `onDragOver` preventDefault e um `onDrop` que, se soltar fora de qualquer linha, faz reorder pro fim (opcional).

Realce visual: quando `over?.key === row.key && over?.zone === 'merge'`, aplicar no elemento-alvo `ring-2 ring-primary scale-105` (o "halo"); quando `zone === 'reorder'`, o próprio rearranjo com `motion` dá o feedback.

- [ ] **Step 4: Animação com `motion`**

Modify `src/components/Rail.jsx` — importar e envolver as linhas:

```jsx
import { motion, AnimatePresence } from 'motion/react';
```

Trocar o container `.map` por linhas `motion`:
- Cada item vira `<motion.div layout key={row.key} ...>` (o `layout` anima a descida na reordenação e o abrir/fechar do acordeão via FLIP).
- Envolver a lista com `<AnimatePresence>` pra animar entrada/saída de filhos ao abrir/fechar pasta.

Nota: `motion/react` é o entrypoint do pacote `motion` v12 (confirmar no build; se falhar, usar `'framer-motion'`).

- [ ] **Step 5: Build + verificação manual do fluxo completo de drag**

Run: `npm run build`
Expected: sem erros.

Verificação manual (pedir ao usuário): arrastar um projeto sobre a **borda** de outro → reordena com animação; **pausar no centro** (~0.4s) de outro projeto → halo → soltar cria "Nova pasta" com os dois; arrastar projeto sobre uma **pasta** (centro) → entra na pasta; abrir pasta e arrastar um filho pra **fora** → volta pro topo e a pasta some se esvaziar.

- [ ] **Step 6: Commit**

```bash
git add src/components/Rail.jsx src/App.jsx
git commit -m "feat: drag do Rail — borda reordena, centro cria/entra pasta, com animação"
```

---

## Task 7: Menu do "+" e menu de contexto da pasta

**Files:**
- Modify: `src/components/Rail.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `renameFolder`, `dissolveFolder` (Task 3); `onAdd` (fluxo atual de adicionar projeto).
- Produces: props `onNewFolderDraft`, `onRenameFolder`, `onDissolveFolder` no `Rail`.

- [ ] **Step 1: Menu do "+" (projeto vs pasta)**

Modify `src/components/Rail.jsx` — trocar o `onClick={onAdd}` do botão "+" por abrir um popover com duas opções. Estado:

```jsx
  const [addMenu, setAddMenu] = useState(false);
```

No botão "+": `onClick={() => setAddMenu((v) => !v)}`, `title={t('rail.add_open_tooltip')}`. Logo abaixo, o popover (ancorado acima do "+"):

```jsx
      {addMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAddMenu(false)} />
          <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 overflow-hidden rounded-md border bg-background py-1 shadow-md">
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted" onClick={() => { setAddMenu(false); onAdd?.(); }}>
              <FolderPlus className="h-3.5 w-3.5 shrink-0" /><span>{t('rail.add_menu_project')}</span>
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted" onClick={() => { setAddMenu(false); startNewFolderDraft(); }}>
              <FolderIcon className="h-3.5 w-3.5 shrink-0" /><span>{t('rail.add_menu_folder')}</span>
            </button>
          </div>
        </>
      )}
```

Importar ícones: `import { FolderPlus, Folder as FolderIcon } from 'lucide-react';` (o rodapé precisa de `relative` no wrapper pra ancorar o popover).

- [ ] **Step 2: Pasta-rascunho ("Nova pasta" pelo "+")**

Modify `src/components/Rail.jsx` — a pasta-rascunho vive só no renderer até ganhar o 1º filho (invariante: config não guarda pasta vazia). Estado:

```jsx
  const [draft, setDraft] = useState(null); // { name } enquanto cria pasta vazia
  const startNewFolderDraft = () => setDraft({ name: '' });
```

Renderizar o rascunho no fim da lista como um ícone de pasta em modo rename (input central). Ao **soltar um projeto no rascunho** (drop com `over` no rascunho), chamar `onApplyDrop({ dragPath, targetKind: 'draft', zone: 'merge' })` — no App isso vira `createFolder` com o nome do draft. Se o usuário confirmar o rename sem nenhum filho, o rascunho é descartado (só estado local). 

Simplificação aceitável v1: se o produto preferir, "Nova pasta" pelo "+" pode apenas **focar o gesto de arrastar** (mostrar uma dica "arraste um projeto aqui"). Decidir na verificação; o caminho primário de criação continua o drag (Task 6). Documentar a escolha final no commit.

- [ ] **Step 3: Menu de contexto da pasta (renomear / desfazer)**

Modify `src/components/Rail.jsx` — renderizar o `folderMenu` (estado criado na Task 5) com duas ações:

```jsx
      {folderMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFolderMenu(null)} />
          <div className="fixed z-50 min-w-[180px] overflow-hidden rounded-md border bg-background py-1 shadow-md" style={{ left: folderMenu.x, top: folderMenu.y }}>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              onClick={() => { const f = folderMenu.folder; setFolderMenu(null); startFolderRename(f); }}>
              <Pencil className="h-3.5 w-3.5 shrink-0" /><span>{t('rail.menu_folder_rename')}</span>
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-muted"
              onClick={() => { const f = folderMenu.folder; setFolderMenu(null); onDissolveFolder?.(f.id); }}>
              <Undo2 className="h-3.5 w-3.5 shrink-0" /><span>{t('rail.menu_folder_dissolve')}</span>
            </button>
          </div>
        </>
      )}
```

Rename inline da pasta: reaproveitar o padrão do rename de projeto. Estado `renamingFolderId` + `folderDraft`; ao renderizar o ícone de pasta, se `renamingFolderId === f.id`, mostrar input central; Enter/blur → `onRenameFolder(f.id, value)`; Esc cancela. Duplo-clique na pasta também abre o rename.

- [ ] **Step 4: App wiring dos handlers de pasta**

Modify `src/App.jsx` — importar `renameFolder, dissolveFolder` de `@/lib/railTree` e passar:

```jsx
      onRenameFolder={(id, name) => persistRail(renameFolder(rail, id, name))}
      onDissolveFolder={(id) => persistRail(dissolveFolder(rail, id))}
```

(`onApplyDrop` já cobre a criação de pasta pelo drag; se o Step 2 usar o caminho `targetKind:'draft'`, tratar em `applyDrop` como merge criando pasta — senão, deixar a criação só via drag.)

- [ ] **Step 5: Build + verificação manual**

Run: `npm run build && node scripts/i18n-parity.smoke.cjs`
Expected: build ok + `i18n parity ok`.

Verificação manual: clicar no "+" → aparecem "Adicionar projeto" e "Nova pasta"; "Adicionar projeto" abre o seletor de pastas do SO (igual antes); botão direito numa pasta → "Renomear pasta" e "Desfazer pasta"; desfazer solta os filhos no lugar da pasta sem apagar nada.

- [ ] **Step 6: Commit**

```bash
git add src/components/Rail.jsx src/App.jsx
git commit -m "feat: menu do + (projeto/pasta) e menu de contexto de pasta (renomear/desfazer)"
```

---

## Task 8: Integração final — AGENTS.md, suíte e checklist manual

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Seção de sessões paralelas no AGENTS.md**

Modify `AGENTS.md` — adicionar seção após "Pontos importantes para quem for desenvolver":

```markdown
## Sessões paralelas (isolamento)

O autor roda **várias sessões do Claude Code ao mesmo tempo** neste repositório
(inclusive em `git worktree` sob `.claude/worktrees/`). Ao implementar qualquer
mudança, assuma que **outras sessões podem estar editando o mesmo código em paralelo**:

- Trabalhe num **branch/worktree dedicado** à sua tarefa (ex.: `feat/<tarefa>`), nunca
  direto na branch que o working copy principal estiver usando.
- Não force `git checkout`/troca de branch no working copy principal — outra sessão
  pode estar no meio de algo.
- Prefira mudanças **focadas e pequenas**, commits frequentes, para reduzir conflito de merge.
```

- [ ] **Step 2: Rodar toda a suíte de smokes/testes**

Run:
```bash
node scripts/rail-smoke.cjs && node scripts/i18n-parity.smoke.cjs && npx vitest run src/lib/railTree.test.js && npm run build
```
Expected: `rail-core smoke ok`, `i18n parity ok`, vitest PASS, build sem erros.

- [ ] **Step 3: Checklist manual no app** (pedir ao usuário; não forçar relaunch)

- Projetos soltos aparecem e funcionam como antes (abrir, rename, cor, imagem, badges).
- Arrastar borda → reordena com animação.
- Pausar no centro (~0.4s) → halo → cria "Nova pasta" com os dois.
- Arrastar projeto no centro de uma pasta → entra.
- Abrir/fechar pasta (clique) com animação de descida.
- Arrastar filho pra fora → volta ao topo; pasta esvaziada some.
- "+" → "Adicionar projeto" / "Nova pasta".
- Botão direito na pasta → "Renomear pasta" / "Desfazer pasta".
- Tema claro e escuro: mini-grid e indentação legíveis.
- Fechar e reabrir o app → layout de pastas persistiu.

- [ ] **Step 4: Commit final**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md — nota sobre sessões paralelas e isolamento por worktree"
```

---

## Self-Review (feito na escrita)

- **Cobertura do spec:** modelo de dados (Task 1), reconciliação/migração/órfãos/pasta-vazia (Task 1), backend `projects:list`+`rail:set` (Task 2), transformações de layout (Task 3), i18n pt+en (Task 4), visual pasta fechada/aberta (Task 5), drag borda-vs-centro + animação + tirar-da-pasta (Task 6), menu "+" e menu de contexto de pasta (Task 7), isolamento/AGENTS.md + testes (Task 8). ✔
- **Placeholders:** os pontos genuinamente em aberto (pasta-rascunho do "+", entrypoint `motion/react` vs `framer-motion`, detalhes de flex-wrap da indentação) estão marcados como decisões de verificação com um default explícito — não como "TODO" vazio. A criação primária de pasta (drag) está 100% especificada; o "+"→Nova pasta tem caminho definido com fallback aceitável.
- **Consistência de tipos:** `Item`/`Row` shapes idênticos entre `rail-core.cjs`, `railTree.js` e os handlers; `applyDrop`/`buildRows`/`toggleCollapse`/`renameFolder`/`dissolveFolder`/`nextFolderId` com as mesmas assinaturas em todas as tasks; `listProjects()` devolve `{ projects, rail }` de forma consistente do main ao App.
