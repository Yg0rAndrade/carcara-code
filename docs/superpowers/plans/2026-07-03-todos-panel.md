# Painel de Todos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir ao vivo, numa aba do PreviewPanel, a task list que o Claude Code emite (`TodoWrite`/`TaskCreate`) — com sub-agents, tempos por task e uso de tokens — seguindo a aba de chat ativa.

**Architecture:** Parser puro `claude-todos-core.cjs` (irmão do `claude-sessions.cjs`) lê os transcripts JSONL; `main.js` vigia por mtime (1,5s) enquanto houver assinatura e empurra `todos:snapshot` via IPC; a UI React (`TodosPanel.jsx` + `src/components/todos/`) renderiza como aba principal do PreviewPanel.

**Tech Stack:** Node puro (fs/path) no parser; Electron IPC (`ipcMain.handle` + `safeSend`); React 19 + shadcn/Tailwind + lucide no renderer; vitest (environment node).

**Spec:** `docs/superpowers/specs/2026-07-03-todos-panel-design.md`

## Global Constraints

- **JSX puro, sem TypeScript** — o repo não usa TS (`components.json` tem `tsx:false`).
- **Comentários em português** explicando o porquê, como no resto do repo.
- **`npm run build` obrigatório** após editar `src/` (o Electron carrega `dist/`, nota no CLAUDE.md).
- **Paridade i18n pt/en** — toda chave nova entra nos dois JSONs (`npm run test:i18n` cobra).
- **Snapshot serializável por IPC** — objetos simples, sem classes/funções.
- **Só schema Claude** — outros CLIs (`opencode`/`codex`/`agy`) ficam fora; painel mostra estado vazio.
- **Sem push no upstream** — entrega via fork `carlosdealmeida/carcara-code` → PR para `Yg0rAndrade:main`.
- Commits em português no estilo do repo: `feat: …`, `docs: …`, `test: …`.
- Todo caminho abaixo é relativo à raiz `C:\@work\@repos\carcara-code`, branch `feat/todos-panel`.

---

### Task 1: `claude-todos-core.cjs` — schema legado `TodoWrite` (snapshot + timings)

**Files:**
- Create: `claude-todos-core.cjs`
- Test: `claude-todos-core.test.js`

**Interfaces:**
- Consumes: nada (módulo novo; usará `claude-sessions.cjs` só a partir da Task 5).
- Produces: `parseTodos(lines, skipSidechain) -> Todo[] | null` onde `Todo = { content, activeForm, status, startedAt?, completedAt? }` (`status`: `'pending'|'in_progress'|'completed'`; timings em epoch ms). Helpers internos exportados para teste: nenhum além de `parseTodos` nesta task.

- [ ] **Step 1: Escrever os testes que falham**

```js
// claude-todos-core.test.js
import { describe, it, expect } from 'vitest';
import core from './claude-todos-core.cjs';

// Linha de transcript com um tool_use TodoWrite carregando o snapshot completo.
const tw = (iso, todos, extra = {}) => JSON.stringify({
  type: 'assistant', timestamp: iso, ...extra,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'TodoWrite', input: { todos } }] },
});
const todo = (content, status, activeForm = content) => ({ content, activeForm, status });

describe('parseTodos — schema TodoWrite', () => {
  it('devolve o último snapshot', () => {
    const lines = [
      tw('2026-07-03T12:00:00Z', [todo('A', 'pending')]),
      tw('2026-07-03T12:01:00Z', [todo('A', 'completed'), todo('B', 'in_progress')]),
    ];
    const out = core.parseTodos(lines, true);
    expect(out.map((t) => [t.content, t.status])).toEqual([['A', 'completed'], ['B', 'in_progress']]);
  });

  it('extrai timings first-write-wins por content', () => {
    const t0 = Date.parse('2026-07-03T12:00:00Z');
    const t1 = Date.parse('2026-07-03T12:01:00Z');
    const lines = [
      tw('2026-07-03T12:00:00Z', [todo('A', 'in_progress')]),
      tw('2026-07-03T12:01:00Z', [todo('A', 'completed')]),
    ];
    const [a] = core.parseTodos(lines, true);
    expect(a.startedAt).toBe(t0);
    expect(a.completedAt).toBe(t1);
  });

  it('re-entrada em in_progress zera o streak (não herda tempo antigo)', () => {
    const t2 = Date.parse('2026-07-03T12:02:00Z');
    const lines = [
      tw('2026-07-03T12:00:00Z', [todo('A', 'in_progress')]),
      tw('2026-07-03T12:01:00Z', [todo('A', 'pending')]),
      tw('2026-07-03T12:02:00Z', [todo('A', 'in_progress')]),
    ];
    const [a] = core.parseTodos(lines, true);
    expect(a.startedAt).toBe(t2);
  });

  it('ignora entradas isSidechain quando skipSidechain=true', () => {
    const lines = [
      tw('2026-07-03T12:00:00Z', [todo('A', 'pending')]),
      tw('2026-07-03T12:01:00Z', [todo('SUB', 'pending')], { isSidechain: true }),
    ];
    const out = core.parseTodos(lines, true);
    expect(out.map((t) => t.content)).toEqual(['A']);
  });

  it('linha malformada é pulada; sem eventos devolve null', () => {
    expect(core.parseTodos(['{lixo', ''], true)).toBeNull();
    const lines = ['{nao é json "name":"TodoWrite"', tw('2026-07-03T12:00:00Z', [todo('A', 'pending')])];
    expect(core.parseTodos(lines, true).map((t) => t.content)).toEqual(['A']);
  });

  it('descarta itens sem content/activeForm/status válidos', () => {
    const lines = [tw('2026-07-03T12:00:00Z', [todo('A', 'pending'), { content: 'B' }, { content: 'C', activeForm: 'C', status: 'weird' }])];
    expect(core.parseTodos(lines, true).map((t) => t.content)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run claude-todos-core.test.js`
Expected: FAIL — `Cannot find module './claude-todos-core.cjs'`

- [ ] **Step 3: Implementação mínima**

```js
// claude-todos-core.cjs
// Parser puro dos "todos" (tasks) que o Claude Code grava no transcript
// (~/.claude/projects/<projeto>/<id>.jsonl) — irmão do claude-sessions.cjs:
// só fs/path, sem electron, testável em node puro (vitest).
//
// Dois schemas convivem no Claude Code:
//   - legado TodoWrite: cada tool_use carrega o snapshot COMPLETO da lista;
//   - novo TaskCreate/TaskUpdate (flag CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS):
//     stream de eventos — create adiciona (o id sai no tool_result), update
//     muta por taskId.
// O schema vigente é o do ÚLTIMO evento relevante do transcript.
const fs = require('fs');
const path = require('path');

const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

function parseEpoch(ts) {
  if (!ts) return undefined;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : undefined;
}

function isValidTodo(item) {
  return !!item && typeof item === 'object'
    && typeof item.content === 'string'
    && typeof item.activeForm === 'string'
    && VALID_STATUSES.includes(item.status);
}

// Monta um Todo omitindo timings indefinidos — snapshot menor e serializável.
function makeTodo(content, activeForm, status, startedAt, completedAt) {
  const t = { content, activeForm, status };
  if (startedAt !== undefined) t.startedAt = startedAt;
  if (completedAt !== undefined) t.completedAt = completedAt;
  return t;
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

// Qual schema vale: o do último evento de todos do transcript (um resume pode
// misturar os dois; vence o mais recente).
function detectSchema(lines, skipSidechain) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    const hasTodoWrite = line.indexOf('"name":"TodoWrite"') >= 0;
    const hasTask = line.indexOf('"name":"TaskCreate"') >= 0 || line.indexOf('"name":"TaskUpdate"') >= 0;
    if (!hasTodoWrite && !hasTask) continue;
    const entry = parseLine(line);
    if (!entry || (skipSidechain && entry.isSidechain)) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || block.type !== 'tool_use') continue;
      if (block.name === 'TodoWrite') return 'TodoWrite';
      if (block.name === 'TaskCreate' || block.name === 'TaskUpdate') return 'Task';
    }
  }
  return null;
}

// Último snapshot do TodoWrite: varre do fim pro começo e devolve o primeiro
// tool_use válido que encontrar.
function readLastTodoWriteSnapshot(lines, skipSidechain) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line.indexOf('"name":"TodoWrite"') < 0) continue;
    const entry = parseLine(line);
    if (!entry || (skipSidechain && entry.isSidechain)) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j];
      if (block && block.type === 'tool_use' && block.name === 'TodoWrite') {
        const raw = block.input && block.input.todos;
        if (Array.isArray(raw)) return raw.filter(isValidTodo);
      }
    }
  }
  return null;
}

// Varre os snapshots em ordem cronológica e registra, por content, o primeiro
// instante em que a task apareceu in_progress e completed (first-write-wins).
// prevStatus detecta a TRANSIÇÃO pra in_progress: reaparecer em in_progress
// vindo de outro estado zera o streak — uma rodada que reutiliza a mesma
// descrição não herda o tempo da anterior. 'absent' = sumiu do snapshot.
function extractTodoWriteTimings(lines, skipSidechain) {
  const timings = new Map();
  const prevStatus = new Map();
  for (const line of lines) {
    if (!line || line.indexOf('"name":"TodoWrite"') < 0) continue;
    const entry = parseLine(line);
    if (!entry || (skipSidechain && entry.isSidechain)) continue;
    const ts = parseEpoch(entry.timestamp);
    if (ts === undefined) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || block.name !== 'TodoWrite') continue;
      const raw = block.input && block.input.todos;
      if (!Array.isArray(raw)) continue;
      const seen = new Set();
      for (const item of raw) {
        if (!isValidTodo(item)) continue;
        seen.add(item.content);
        const prev = prevStatus.get(item.content);
        if (item.status === 'in_progress') {
          if (prev !== 'in_progress') timings.set(item.content, { startedAt: ts });
        } else if (item.status === 'completed') {
          const rec = timings.get(item.content) || {};
          if (rec.completedAt === undefined) rec.completedAt = ts;
          timings.set(item.content, rec);
        } else {
          timings.set(item.content, {}); // pending = ainda não começou nesta rodada
        }
        prevStatus.set(item.content, item.status);
      }
      for (const key of prevStatus.keys()) {
        if (!seen.has(key)) prevStatus.set(key, 'absent');
      }
    }
  }
  return timings;
}

// Task list atual do transcript, no schema que estiver em uso. null = o
// transcript nunca emitiu evento de todos (UI mostra "aguardando").
function parseTodos(lines, skipSidechain) {
  const schema = detectSchema(lines, skipSidechain);
  if (schema === 'TodoWrite') {
    const todos = readLastTodoWriteSnapshot(lines, skipSidechain);
    if (!todos) return null;
    const timings = extractTodoWriteTimings(lines, skipSidechain);
    return todos.map((t) => {
      const tm = timings.get(t.content);
      return tm ? makeTodo(t.content, t.activeForm, t.status, tm.startedAt, tm.completedAt) : makeTodo(t.content, t.activeForm, t.status);
    });
  }
  return null; // schema 'Task' entra na Task 2
}

module.exports = { parseTodos };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run claude-todos-core.test.js`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add claude-todos-core.cjs claude-todos-core.test.js
git commit -m "feat: parser puro dos todos do Claude (schema TodoWrite + timings)"
```

---

### Task 2: `claude-todos-core.cjs` — schema novo `TaskCreate`/`TaskUpdate`

**Files:**
- Modify: `claude-todos-core.cjs`
- Test: `claude-todos-core.test.js`

**Interfaces:**
- Consumes: `parseTodos`, `detectSchema`, `makeTodo`, `parseEpoch`, `parseLine` da Task 1.
- Produces: `parseTodos` passa a cobrir o schema Task (stream de eventos). Assinatura inalterada.

- [ ] **Step 1: Acrescentar os testes que falham**

```js
// Acrescentar ao claude-todos-core.test.js:
const tc = (iso, toolUseId, subject, activeForm) => JSON.stringify({
  type: 'assistant', timestamp: iso,
  message: { content: [{ type: 'tool_use', id: toolUseId, name: 'TaskCreate', input: { subject, activeForm } }] },
});
const tcr = (toolUseId, taskId, text) => JSON.stringify({
  type: 'user', toolUseResult: taskId ? { task: { id: taskId } } : undefined,
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text || 'ok' }] },
});
const tu = (iso, taskId, status) => JSON.stringify({
  type: 'assistant', timestamp: iso,
  message: { content: [{ type: 'tool_use', id: 'u-' + taskId + '-' + status, name: 'TaskUpdate', input: { taskId, status } }] },
});

describe('parseTodos — schema TaskCreate/TaskUpdate', () => {
  it('cria via tool_result e muta por taskId, com timings', () => {
    const t1 = Date.parse('2026-07-03T12:01:00Z');
    const t2 = Date.parse('2026-07-03T12:02:00Z');
    const lines = [
      tc('2026-07-03T12:00:00Z', 'c1', 'Tarefa A', 'Fazendo A'),
      tcr('c1', '1'),
      tc('2026-07-03T12:00:30Z', 'c2', 'Tarefa B', 'Fazendo B'),
      tcr('c2', '2'),
      tu('2026-07-03T12:01:00Z', '1', 'in_progress'),
      tu('2026-07-03T12:02:00Z', '1', 'completed'),
    ];
    const out = core.parseTodos(lines, true);
    expect(out).toEqual([
      { content: 'Tarefa A', activeForm: 'Fazendo A', status: 'completed', startedAt: t1, completedAt: t2 },
      { content: 'Tarefa B', activeForm: 'Fazendo B', status: 'pending' },
    ]);
  });

  it('extrai o taskId do texto "Task #N" quando o toolUseResult não traz', () => {
    const lines = [
      tc('2026-07-03T12:00:00Z', 'c1', 'A', 'A'),
      tcr('c1', null, 'Created Task #7'),
      tu('2026-07-03T12:01:00Z', '7', 'in_progress'),
    ];
    const out = core.parseTodos(lines, true);
    expect(out[0].status).toBe('in_progress');
  });

  it('o schema do ÚLTIMO evento vence quando os dois aparecem', () => {
    const lines = [
      tw('2026-07-03T11:00:00Z', [todo('Velha', 'pending')]),
      tc('2026-07-03T12:00:00Z', 'c1', 'Nova', 'Nova'),
      tcr('c1', '1'),
    ];
    expect(core.parseTodos(lines, true).map((t) => t.content)).toEqual(['Nova']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run claude-todos-core.test.js`
Expected: FAIL — os 3 testes novos (parseTodos devolve null para o schema Task)

- [ ] **Step 3: Implementar o stream de Tasks**

Em `claude-todos-core.cjs`, antes do `module.exports`:

```js
// O id definitivo de um TaskCreate só aparece no tool_result (toolUseResult.task.id
// ou o texto "Task #N"). Guardamos os creates pendentes por tool_use_id até o
// result chegar; updates fora de ordem (task desconhecida) são ignorados.
function resolveCreatedTaskId(entry, block) {
  const fromResult = entry.toolUseResult && entry.toolUseResult.task && entry.toolUseResult.task.id;
  if (typeof fromResult === 'string') return fromResult;
  if (typeof block.content === 'string') {
    const m = block.content.match(/Task #(\d+)/);
    if (m) return m[1];
  }
  return null;
}

function readTaskStream(lines, skipSidechain) {
  const tasks = new Map();          // taskId -> { content, activeForm, status, startedAt?, completedAt? }
  const order = [];
  const pendingCreates = new Map(); // tool_use_id -> { content, activeForm }

  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry || (skipSidechain && entry.isSidechain)) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block && block.type === 'tool_use' && typeof block.id === 'string') {
        if (block.name === 'TaskCreate') {
          const subject = block.input && block.input.subject;
          const activeForm = block.input && block.input.activeForm;
          if (typeof subject === 'string') {
            pendingCreates.set(block.id, { content: subject, activeForm: typeof activeForm === 'string' ? activeForm : subject });
          }
        } else if (block.name === 'TaskUpdate') {
          const taskId = block.input && block.input.taskId;
          const status = block.input && block.input.status;
          if (typeof taskId === 'string' && VALID_STATUSES.includes(status)) {
            const t = tasks.get(taskId);
            if (t) {
              t.status = status;
              const ts = parseEpoch(entry.timestamp);
              if (ts !== undefined) {
                if (status === 'in_progress' && t.startedAt === undefined) t.startedAt = ts;
                if (status === 'completed' && t.completedAt === undefined) t.completedAt = ts;
              }
            }
          }
        }
      } else if (block && block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const pending = pendingCreates.get(block.tool_use_id);
        if (!pending) continue;
        const taskId = resolveCreatedTaskId(entry, block);
        if (taskId && !tasks.has(taskId)) {
          tasks.set(taskId, Object.assign({}, pending, { status: 'pending' }));
          order.push(taskId);
        }
        pendingCreates.delete(block.tool_use_id);
      }
    }
  }
  return order.map((id) => {
    const t = tasks.get(id);
    return makeTodo(t.content, t.activeForm, t.status, t.startedAt, t.completedAt);
  });
}
```

E em `parseTodos`, trocar a última linha (`return null; // schema 'Task' entra na Task 2`) por:

```js
  if (schema === 'Task') return readTaskStream(lines, skipSidechain);
  return null;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run claude-todos-core.test.js`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add claude-todos-core.cjs claude-todos-core.test.js
git commit -m "feat: suporte ao schema novo TaskCreate/TaskUpdate no parser de todos"
```

---

### Task 3: `claude-todos-core.cjs` — sub-agents (invocações + match por prompt)

**Files:**
- Modify: `claude-todos-core.cjs`
- Test: `claude-todos-core.test.js`

**Interfaces:**
- Consumes: `parseTodos`, `parseLine` das tasks anteriores.
- Produces:
  - `readAgentInvocations(lines) -> [{ name, prompt, status }]` (`status`: `'running'|'completed'`; invocações rejeitadas são descartadas).
  - `listSubAgents(mainLines, subagentsDir) -> [{ agentId, name, isMain: false, status, todos, updatedAt }]`, ordenado por grupo (running → com todos → histórico) e recência. `subagentsDir` é um caminho no disco com arquivos `agent-*.jsonl`.

- [ ] **Step 1: Acrescentar os testes que falham**

```js
// Acrescentar ao claude-todos-core.test.js:
import fs from 'fs';
import os from 'os';
import path from 'path';

const agentUse = (toolUseId, input) => JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Agent', input }] },
});
const agentResult = (toolUseId, agentId) => JSON.stringify({
  type: 'user', toolUseResult: agentId ? { agentId } : {},
  message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'done' }] },
});
const subFirstLine = (prompt) => JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } });

describe('readAgentInvocations', () => {
  it('usa name, cai pra description, e deriva status pelo tool_result', () => {
    const lines = [
      agentUse('a1', { name: 'pesquisador', description: 'Pesquisar X', prompt: 'P1' }),
      agentUse('a2', { description: 'Revisar Y', prompt: 'P2' }),
      agentResult('a1', 'abc123'),
    ];
    const out = core.readAgentInvocations(lines);
    expect(out).toEqual([
      { name: 'pesquisador', prompt: 'P1', status: 'completed' },
      { name: 'Revisar Y', prompt: 'P2', status: 'running' },
    ]);
  });

  it('descarta invocação rejeitada (tool_result sem agentId)', () => {
    const lines = [agentUse('a1', { description: 'D', prompt: 'P' }), agentResult('a1', null)];
    expect(core.readAgentInvocations(lines)).toEqual([]);
  });
});

describe('listSubAgents', () => {
  it('casa agent-*.jsonl com a invocação por prompt idêntico e ordena por grupo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagents-'));
    // done-1: concluído COM todos; run-2: rodando; hist-3: concluído sem todos (histórico)
    fs.writeFileSync(path.join(dir, 'agent-done1.jsonl'), [
      subFirstLine('P1'),
      tw('2026-07-03T12:00:00Z', [todo('S1', 'completed')]),
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'agent-run2.jsonl'), [subFirstLine('P2')].join('\n'));
    fs.writeFileSync(path.join(dir, 'agent-hist3.jsonl'), [subFirstLine('P3')].join('\n'));
    const mainLines = [
      agentUse('a1', { name: 'done', prompt: 'P1' }),
      agentUse('a2', { name: 'run', prompt: 'P2' }),
      agentUse('a3', { name: 'hist', prompt: 'P3' }),
      agentResult('a1', 'x1'),
      agentResult('a3', 'x3'),
    ];
    const out = core.listSubAgents(mainLines, dir);
    expect(out.map((a) => [a.agentId, a.status, a.todos.length])).toEqual([
      ['run2', 'running', 0],
      ['done1', 'completed', 1],
      ['hist3', 'completed', 0],
    ]);
    expect(out.every((a) => a.isMain === false)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('dir inexistente ou sem invocações devolve []', () => {
    expect(core.listSubAgents([], 'C:/nao/existe')).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run claude-todos-core.test.js`
Expected: FAIL — `core.readAgentInvocations is not a function`

- [ ] **Step 3: Implementar**

Em `claude-todos-core.cjs`:

```js
// Invocações da tool Agent no transcript principal: o nome exibível vem do
// param opcional `name` (a maioria só preenche `description` — cai nela).
// O tool_result diz o destino: com toolUseResult.agentId = concluiu; sem = foi
// rejeitada (não vira card); sem result ainda = está rodando.
function readAgentInvocations(lines) {
  const invocations = new Map(); // tool_use_id -> { name, prompt }
  const resultKind = new Map();  // tool_use_id -> 'completed' | 'rejected'
  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && block.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
        const input = block.input || {};
        const label = typeof input.name === 'string' ? input.name
          : typeof input.description === 'string' ? input.description : undefined;
        if (typeof label === 'string' && typeof input.prompt === 'string') {
          invocations.set(block.id, { name: label, prompt: input.prompt });
        }
      }
      if (block && block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const agentId = entry.toolUseResult && entry.toolUseResult.agentId;
        resultKind.set(block.tool_use_id, typeof agentId === 'string' ? 'completed' : 'rejected');
      }
    }
  }
  const out = [];
  for (const [toolUseId, inv] of invocations) {
    const kind = resultKind.get(toolUseId);
    if (kind === 'rejected') continue;
    out.push({ name: inv.name, prompt: inv.prompt, status: kind === 'completed' ? 'completed' : 'running' });
  }
  return out;
}

// O prompt de um sub-agent é a primeira mensagem `user` do agent-*.jsonl dele —
// idêntico ao input.prompt da invocação. É essa igualdade que casa arquivo ↔ card.
function readSubAgentPrompt(lines) {
  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (entry && entry.type === 'user') {
      const content = entry.message && entry.message.content;
      if (typeof content === 'string') return content;
    }
  }
  return null;
}

function readLines(fp) {
  try { return fs.readFileSync(fp, 'utf-8').split('\n'); } catch { return null; }
}

// Grupo visual: rodando primeiro, depois concluídos com todos, histórico no fim.
function subAgentGroup(agent) {
  if (agent.status === 'running') return 0;
  if (agent.todos.length > 0) return 1;
  return 2;
}

function listSubAgents(mainLines, subagentsDir) {
  const invocations = readAgentInvocations(mainLines);
  if (invocations.length === 0) return [];
  let files;
  try {
    files = fs.readdirSync(subagentsDir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
  } catch { return []; }

  const byPrompt = new Map();
  for (const file of files) {
    const fp = path.join(subagentsDir, file);
    const lines = readLines(fp);
    if (!lines) continue;
    const prompt = readSubAgentPrompt(lines);
    if (prompt === null) continue;
    let updatedAt = 0;
    try { updatedAt = fs.statSync(fp).mtimeMs; } catch {}
    byPrompt.set(prompt, {
      agentId: file.slice('agent-'.length, -'.jsonl'.length),
      todos: parseTodos(lines, false) || [],
      updatedAt,
    });
  }

  const out = [];
  const seen = new Set();
  for (const inv of invocations) {
    const match = byPrompt.get(inv.prompt);
    if (!match || seen.has(match.agentId)) continue;
    seen.add(match.agentId);
    out.push({ agentId: match.agentId, name: inv.name, isMain: false, status: inv.status, todos: match.todos, updatedAt: match.updatedAt });
  }
  out.sort((a, b) => {
    const ga = subAgentGroup(a), gb = subAgentGroup(b);
    if (ga !== gb) return ga - gb;
    return b.updatedAt - a.updatedAt;
  });
  return out;
}
```

Atualizar o export: `module.exports = { parseTodos, readAgentInvocations, listSubAgents };`

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run claude-todos-core.test.js`
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add claude-todos-core.cjs claude-todos-core.test.js
git commit -m "feat: sub-agents no parser de todos (match por prompt, grupos)"
```

---

### Task 4: `claude-todos-core.cjs` — uso de tokens (modelos, cache, contexto)

**Files:**
- Modify: `claude-todos-core.cjs`
- Test: `claude-todos-core.test.js`

**Interfaces:**
- Consumes: `parseLine`.
- Produces:
  - `modelsAndCacheForLines(lines, skipSidechain) -> { models: [{model,input,output,cache}], cache: {input,read,creation} }`
  - `contextForLines(lines) -> { tokens, limit } | null` (tokens da ÚLTIMA mensagem com usage, sem sidechain)
  - `contextLimitFor(model, observedTokens) -> 200000 | 1000000`

- [ ] **Step 1: Acrescentar os testes que falham**

```js
// Acrescentar ao claude-todos-core.test.js:
const usageLine = (model, usage, extra = {}) => JSON.stringify({
  type: 'assistant', ...extra, message: { model, usage },
});

describe('uso de tokens', () => {
  it('agrega por modelo e soma o cache do arquivo', () => {
    const lines = [
      usageLine('claude-opus-4-8', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 }),
      usageLine('claude-opus-4-8', { input_tokens: 2, output_tokens: 3 }),
      usageLine('claude-haiku-4-5', { input_tokens: 1, output_tokens: 1 }),
      usageLine('claude-opus-4-8', { input_tokens: 99, output_tokens: 99 }, { isSidechain: true }),
    ];
    const { models, cache } = core.modelsAndCacheForLines(lines, true);
    expect(models).toEqual([
      { model: 'claude-opus-4-8', input: 12, output: 8, cache: 150 },
      { model: 'claude-haiku-4-5', input: 1, output: 1, cache: 0 },
    ]);
    expect(cache).toEqual({ input: 13, read: 100, creation: 50 });
  });

  it('contexto = input+cache da última mensagem com usage (sem sidechain)', () => {
    const lines = [
      usageLine('claude-opus-4-8', { input_tokens: 10, cache_read_input_tokens: 5 }),
      usageLine('claude-opus-4-8', { input_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 1 }),
    ];
    expect(core.contextForLines(lines)).toEqual({ tokens: 51, limit: 1000000 });
    expect(core.contextForLines(['{"type":"user"}'])).toBeNull();
  });

  it('contextLimitFor: 1M pra opus/sonnet gen 4+, 200k pro resto, eleva pelo observado', () => {
    expect(core.contextLimitFor('claude-opus-4-8', 0)).toBe(1000000);
    expect(core.contextLimitFor('claude-haiku-4-5', 0)).toBe(200000);
    expect(core.contextLimitFor('claude-3-5-sonnet-20241022', 0)).toBe(200000);
    expect(core.contextLimitFor('claude-haiku-4-5', 250000)).toBe(1000000);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run claude-todos-core.test.js`
Expected: FAIL — `core.modelsAndCacheForLines is not a function`

- [ ] **Step 3: Implementar**

```js
// ---- Uso de tokens ----
const DEFAULT_CONTEXT_LIMIT = 200000;
const ONE_MILLION = 1000000;
// opus/sonnet geração 4–19 (opus-4-8, sonnet-4-6…). O (?!\d) impede o id legado
// "claude-3-5-sonnet-20241022" de casar (o "sonnet-20" dele não é [4-9] nem 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i;

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }

// Janela de contexto do modelo: 1M quando a família suporta (ou sufixo 1m
// explícito) OU quando o observado já passou de 200k (prova de janela maior).
// Sempre eleva, nunca abaixa.
function contextLimitFor(model, observedTokens) {
  const base = (/1m/i.test(model) || ONE_M_FAMILY.test(model)) ? ONE_MILLION : DEFAULT_CONTEXT_LIMIT;
  return (observedTokens || 0) > base ? ONE_MILLION : base;
}

// Uma passada no arquivo: tokens por modelo + quebra de cache. No transcript
// principal os turnos sidechain são pulados (cada sub-agent conta no próprio
// agent-*.jsonl, senão contaria dobrado).
function modelsAndCacheForLines(lines, skipSidechain) {
  const byModel = new Map();
  const cache = { input: 0, read: 0, creation: 0 };
  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry || (skipSidechain && entry.isSidechain)) continue;
    const msg = entry.message;
    if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
    const u = msg.usage;
    const input = num(u.input_tokens);
    const read = num(u.cache_read_input_tokens);
    const creation = num(u.cache_creation_input_tokens);
    const acc = byModel.get(msg.model) || { model: msg.model, input: 0, output: 0, cache: 0 };
    acc.input += input;
    acc.output += num(u.output_tokens);
    acc.cache += creation + read;
    byModel.set(msg.model, acc);
    cache.input += input;
    cache.read += read;
    cache.creation += creation;
  }
  return { models: [...byModel.values()], cache };
}

// Contexto atual = input + cache da ÚLTIMA mensagem com usage do transcript
// principal (output fica fora; sidechain idem). null = sem usage ainda.
function contextForLines(lines) {
  let last = null;
  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry || entry.isSidechain) continue;
    const msg = entry.message;
    if (!msg || !msg.usage || typeof msg.model !== 'string') continue;
    last = msg;
  }
  if (!last) return null;
  const u = last.usage;
  const tokens = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
  return { tokens, limit: contextLimitFor(last.model, tokens) };
}
```

Atualizar o export: `module.exports = { parseTodos, readAgentInvocations, listSubAgents, modelsAndCacheForLines, contextForLines, contextLimitFor };`

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run claude-todos-core.test.js`
Expected: PASS (16 testes)

- [ ] **Step 5: Commit**

```bash
git add claude-todos-core.cjs claude-todos-core.test.js
git commit -m "feat: uso de tokens no parser de todos (modelos, cache, contexto)"
```

---

### Task 5: `claude-todos-core.cjs` — `buildSnapshot` + `transcriptStamp`

**Files:**
- Modify: `claude-todos-core.cjs`
- Test: `claude-todos-core.test.js`

**Interfaces:**
- Consumes: tudo das Tasks 1–4 + `claude-sessions.cjs` (`transcriptPath`, `projectsBase` via `CLAUDE_CONFIG_DIR`).
- Produces (é isto que o `main.js` consome na Task 6):
  - `buildSnapshot(projectPath, claudeId) -> snapshot | null` onde
    ```js
    snapshot = {
      claudeId,
      agents: [{ agentId, isMain, name, status?, todos: Todo[], updatedAt }],  // main primeiro (só se já emitiu todos), depois sub-agents
      usage: { byModel, byAgent, context, cache } | null,  // context/cache podem ser null
      updatedAt,  // epoch ms
    }
    ```
  - `transcriptStamp(projectPath, claudeId) -> string | null` — mtimes do transcript + agent-*.jsonl concatenados; se não mudou, não precisa re-parsear.

- [ ] **Step 1: Acrescentar os testes que falham**

```js
// Acrescentar ao claude-todos-core.test.js. Monta um ~/.claude falso via
// CLAUDE_CONFIG_DIR (claude-sessions.projectsBase respeita a env), com a mesma
// codificação de pasta do Claude (não-alfanumérico -> '-').
import { afterEach } from 'vitest';

function makeFakeClaudeDir(projectPath, claudeId) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cfg-'));
  const projDir = path.join(base, 'projects', String(projectPath).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(projDir, { recursive: true });
  return { base, projDir, transcript: path.join(projDir, claudeId + '.jsonl') };
}

describe('buildSnapshot / transcriptStamp', () => {
  const PROJ = 'C:/tmp/proj-x';
  let fake;
  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR;
    if (fake) fs.rmSync(fake.base, { recursive: true, force: true });
    fake = null;
  });

  it('monta o snapshot completo: main + sub-agent + usage', () => {
    fake = makeFakeClaudeDir(PROJ, 'sess1');
    process.env.CLAUDE_CONFIG_DIR = fake.base;
    fs.writeFileSync(fake.transcript, [
      tw('2026-07-03T12:00:00Z', [todo('A', 'in_progress')]),
      usageLine('claude-opus-4-8', { input_tokens: 10, output_tokens: 5 }),
      agentUse('a1', { name: 'sub', prompt: 'PS' }),
      agentResult('a1', 'sub1'),
    ].join('\n'));
    const subDir = path.join(fake.projDir, 'sess1', 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'agent-sub1.jsonl'), [
      subFirstLine('PS'),
      usageLine('claude-haiku-4-5', { input_tokens: 3, output_tokens: 2 }),
    ].join('\n'));

    const snap = core.buildSnapshot(PROJ, 'sess1');
    expect(snap.claudeId).toBe('sess1');
    expect(snap.agents.map((a) => [a.isMain, a.name])).toEqual([[true, 'main'], [false, 'sub']]);
    expect(snap.usage.byAgent.map((a) => a.name)).toEqual(['main', 'sub']);
    expect(snap.usage.byModel.map((m) => m.model)).toEqual(['claude-opus-4-8', 'claude-haiku-4-5']);
    expect(snap.usage.context.tokens).toBe(10);
  });

  it('transcript sem eventos de todos → agents vazio (UI mostra "aguardando")', () => {
    fake = makeFakeClaudeDir(PROJ, 'sess2');
    process.env.CLAUDE_CONFIG_DIR = fake.base;
    fs.writeFileSync(fake.transcript, usageLine('claude-opus-4-8', { input_tokens: 1, output_tokens: 1 }));
    const snap = core.buildSnapshot(PROJ, 'sess2');
    expect(snap.agents).toEqual([]);
    expect(snap.usage).not.toBeNull();
  });

  it('transcript inexistente ou claudeId inseguro → null', () => {
    fake = makeFakeClaudeDir(PROJ, 'sess3');
    process.env.CLAUDE_CONFIG_DIR = fake.base;
    expect(core.buildSnapshot(PROJ, 'nao-existe')).toBeNull();
    expect(core.buildSnapshot(PROJ, '../../etc')).toBeNull();
    expect(core.transcriptStamp(PROJ, '../../etc')).toBeNull();
  });

  it('transcriptStamp muda quando o arquivo muda', () => {
    fake = makeFakeClaudeDir(PROJ, 'sess4');
    process.env.CLAUDE_CONFIG_DIR = fake.base;
    fs.writeFileSync(fake.transcript, tw('2026-07-03T12:00:00Z', [todo('A', 'pending')]));
    const s1 = core.transcriptStamp(PROJ, 'sess4');
    expect(typeof s1).toBe('string');
    fs.writeFileSync(fake.transcript, tw('2026-07-03T12:01:00Z', [todo('A', 'completed')]) + '\nextra');
    const st = fs.statSync(fake.transcript);
    fs.utimesSync(fake.transcript, st.atime, new Date(st.mtimeMs + 2000)); // garante mtime distinto em FS de baixa resolução
    expect(core.transcriptStamp(PROJ, 'sess4')).not.toBe(s1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run claude-todos-core.test.js`
Expected: FAIL — `core.buildSnapshot is not a function`

- [ ] **Step 3: Implementar**

No topo do `claude-todos-core.cjs`, junto dos requires: `const claudeSessions = require('./claude-sessions.cjs');`

```js
// claudeId entra em caminhos de arquivo — restringe a um charset seguro pra um
// id forjado (.., separadores) não escapar da pasta de projects.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

// Sub-agents moram AO LADO do transcript: <projDir>/<claudeId>/subagents/.
// Deriva do caminho já resolvido (cobre transcript achado por varredura global).
function subagentsDirFor(transcriptFile, claudeId) {
  return path.join(path.dirname(transcriptFile), claudeId, 'subagents');
}

// Carimbo barato de mudança: mtime do transcript + de cada agent-*.jsonl.
// O watcher só re-parseia quando isto muda — ler stat é ordens de grandeza mais
// barato que parsear um JSONL de megabytes a cada 1,5s.
function transcriptStamp(projectPath, claudeId) {
  if (!claudeId || !SAFE_ID.test(claudeId)) return null;
  const fp = claudeSessions.transcriptPath(projectPath, claudeId);
  if (!fp) return null;
  const parts = [];
  try { parts.push('m:' + fs.statSync(fp).mtimeMs); } catch { return null; }
  try {
    const dir = subagentsDirFor(fp, claudeId);
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      try { parts.push(f + ':' + fs.statSync(path.join(dir, f)).mtimeMs); } catch {}
    }
  } catch {}
  return parts.join('|');
}

// Snapshot completo da sessão: agentes (main + subs) com seus todos + uso de
// tokens. null = sem transcript (UI mostra "sem sessão"). agents vazio = sessão
// existe mas nunca emitiu todos (UI mostra "aguardando tasks").
function buildSnapshot(projectPath, claudeId) {
  if (!claudeId || !SAFE_ID.test(claudeId)) return null;
  const fp = claudeSessions.transcriptPath(projectPath, claudeId);
  if (!fp) return null;
  const mainLines = readLines(fp);
  if (!mainLines) return null;

  const agents = [];
  const mainTodos = parseTodos(mainLines, true);
  if (mainTodos) {
    let mtime = 0;
    try { mtime = fs.statSync(fp).mtimeMs; } catch {}
    agents.push({ agentId: claudeId, isMain: true, name: 'main', todos: mainTodos, updatedAt: mtime });
  }
  const subDir = subagentsDirFor(fp, claudeId);
  const subs = listSubAgents(mainLines, subDir);
  agents.push(...subs);

  // Uso: principal (sem sidechain) + cada sub-agent no próprio arquivo. Agentes
  // sem linhas de usage ficam fora da tabela (mesma regra da extensão original).
  const byAgent = [];
  const cache = { input: 0, read: 0, creation: 0 };
  const usageAgents = agents.some((a) => a.isMain)
    ? agents
    : [{ agentId: claudeId, isMain: true, name: 'main' }, ...subs]; // usage do main aparece mesmo antes do 1º TodoWrite
  for (const a of usageAgents) {
    const lines = a.isMain ? mainLines : readLines(path.join(subDir, 'agent-' + a.agentId + '.jsonl'));
    if (!lines) continue;
    const r = modelsAndCacheForLines(lines, a.isMain);
    if (r.models.length === 0) continue;
    byAgent.push({ agentId: a.agentId, name: a.name, isMain: a.isMain, models: r.models });
    cache.input += r.cache.input;
    cache.read += r.cache.read;
    cache.creation += r.cache.creation;
  }
  const byModel = new Map();
  for (const a of byAgent) {
    for (const m of a.models) {
      const acc = byModel.get(m.model) || { model: m.model, input: 0, output: 0, cache: 0 };
      acc.input += m.input; acc.output += m.output; acc.cache += m.cache;
      byModel.set(m.model, acc);
    }
  }
  const cacheTotal = cache.input + cache.read + cache.creation;
  const usage = byAgent.length > 0
    ? { byModel: [...byModel.values()], byAgent, context: contextForLines(mainLines), cache: cacheTotal > 0 ? cache : null }
    : null;

  return { claudeId, agents, usage, updatedAt: Date.now() };
}
```

Export final do módulo:

```js
module.exports = {
  parseTodos, readAgentInvocations, listSubAgents,
  modelsAndCacheForLines, contextForLines, contextLimitFor,
  buildSnapshot, transcriptStamp,
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run claude-todos-core.test.js`
Expected: PASS (20 testes)

- [ ] **Step 5: Rodar a suíte inteira (regressão)**

Run: `npm test`
Expected: PASS em todas as suítes

- [ ] **Step 6: Commit**

```bash
git add claude-todos-core.cjs claude-todos-core.test.js
git commit -m "feat: buildSnapshot e transcriptStamp — snapshot completo da sessão"
```

---

### Task 6: IPC — `todos:subscribe` / `todos:unsubscribe` / push `todos:snapshot`

**Files:**
- Modify: `main.js` (bloco novo após o handler `session:refreshTitle`, ~linha 1340)
- Modify: `preload.js` (após o bloco "Sessões do Claude Code", ~linha 60)

**Interfaces:**
- Consumes: `todosCore.buildSnapshot`/`transcriptStamp` (Task 5); `terminals` (Map sessionId→entry com `.claudeId`), `getSessionMeta(cfg, projectPath, sessionId)`, `loadConfig()`, `safeSend(channel, payload)` — todos já existem no `main.js`.
- Produces (o renderer consome na Task 10):
  - `window.api.todosSubscribe(projectPath, sessionId) -> Promise<{ok}>`
  - `window.api.todosUnsubscribe() -> Promise<{ok}>`
  - push `todos:snapshot` com payload `{ sessionId, snapshot }` (snapshot da Task 5 ou `null`), consumido via `window.api.on('todos:snapshot', cb)`.

- [ ] **Step 1: Adicionar o require no topo do `main.js`**

Junto do `const claudeSessions = require('./claude-sessions.cjs');` existente:

```js
const todosCore = require('./claude-todos-core.cjs');
```

- [ ] **Step 2: Adicionar o bloco de watching + handlers no `main.js`**

Logo após o handler `session:refreshTitle` (mantém o assunto "sessões" junto):

```js
// ---------- Painel de Tasks (todos do Claude ao vivo) ----------
// Uma única assinatura (só existe um painel): o renderer assina a sessão da aba
// de chat ativa e o main vigia o transcript por mtime no mesmo ritmo do
// startClaudeWatcher (1,5s), re-parseando e empurrando 'todos:snapshot' SÓ
// quando algo mudou no disco. Sem assinatura, custo zero.
let todosSub = null; // { projectPath, sessionId, claudeId, timer, lastStamp, lastJson }

function stopTodosWatcher() {
  if (todosSub && todosSub.timer) clearInterval(todosSub.timer);
  todosSub = null;
}

function todosTick() {
  const sub = todosSub;
  if (!sub) return;
  try {
    // O claudeId pode nascer DEPOIS da assinatura (aba nova sobe `claude` puro e
    // o id só existe quando o transcript aparece) — re-resolve enquanto faltar.
    if (!sub.claudeId) {
      const e = terminals.get(sub.sessionId);
      const meta = getSessionMeta(loadConfig(), sub.projectPath, sub.sessionId);
      sub.claudeId = (e && e.claudeId) || (meta && meta.claudeId) || null;
    }
    const stamp = sub.claudeId ? todosCore.transcriptStamp(sub.projectPath, sub.claudeId) : null;
    if (stamp !== null && stamp === sub.lastStamp) return; // nada mudou no disco
    sub.lastStamp = stamp;
    const snap = sub.claudeId ? todosCore.buildSnapshot(sub.projectPath, sub.claudeId) : null;
    const json = JSON.stringify(snap);
    if (json === sub.lastJson) return; // mtime mexeu mas o conteúdo relevante não
    sub.lastJson = json;
    safeSend('todos:snapshot', { sessionId: sub.sessionId, snapshot: snap });
  } catch {}
}

ipcMain.handle('todos:subscribe', (evt, { projectPath, sessionId }) => {
  stopTodosWatcher();
  if (!projectPath || !sessionId) return { ok: false };
  todosSub = { projectPath, sessionId, claudeId: null, timer: null, lastStamp: undefined, lastJson: undefined };
  todosTick(); // primeiro snapshot sem esperar o intervalo
  todosSub.timer = setInterval(todosTick, 1500);
  return { ok: true };
});

ipcMain.handle('todos:unsubscribe', () => { stopTodosWatcher(); return { ok: true }; });
```

- [ ] **Step 3: Expor no `preload.js`**

Após a linha do `sessionRefreshTitle` (fim do bloco "Sessões do Claude Code"):

```js
  // Painel de Tasks: assina a sessão da aba ativa; o snapshot chega pelo push
  // 'todos:snapshot' via on(...). Uma assinatura por vez (o painel é um só).
  todosSubscribe: (projectPath, sessionId) => ipcRenderer.invoke('todos:subscribe', { projectPath, sessionId }),
  todosUnsubscribe: () => ipcRenderer.invoke('todos:unsubscribe'),
```

- [ ] **Step 4: Verificar que o app ainda sobe**

Run: `npm run build && npx electron . & sleep 8; echo ok`
Expected: janela abre sem erro no console do main (feche em seguida). Alternativa sem GUI: `node -e "require('./claude-todos-core.cjs'); console.log('require ok')"` → `require ok`.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat: canais IPC do painel de Tasks (todos:subscribe/unsubscribe/snapshot)"
```

---

### Task 7: Helpers de formatação do renderer — `src/lib/todosFormat.js`

**Files:**
- Create: `src/lib/todosFormat.js`
- Test: `src/lib/todosFormat.test.js`

**Interfaces:**
- Consumes: nada.
- Produces (consumido pelos componentes da Task 9):
  - `formatCompact(n) -> string` (7361 → `"7,4k"`)
  - `formatDuration(ms) -> string` (134000 → `"2m 14s"`)
  - `completedTaskDurations(todos) -> (number|undefined)[]` (alinhado por índice)
  - `summarizeTiming(todos, now) -> { elapsedMs, estimateMs, hasEstimate }`
  - `shortModel(model) -> string` (`"claude-opus-4-8"` → `"opus-4-8"`)
  - `contextLevel(pct) -> 'ok'|'warn'|'danger'` · `cacheLevel(rate) -> 'good'|'mid'|'low'`

- [ ] **Step 1: Escrever os testes que falham**

```js
// src/lib/todosFormat.test.js
import { describe, it, expect } from 'vitest';
import {
  formatCompact, formatDuration, completedTaskDurations,
  summarizeTiming, shortModel, contextLevel, cacheLevel,
} from './todosFormat.js';

describe('formatCompact', () => {
  it('formata com vírgula decimal pt-BR', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(7361)).toBe('7,4k');
    expect(formatCompact(24580)).toBe('24,6k');
    expect(formatCompact(2000000)).toBe('2M');
  });
});

describe('formatDuration', () => {
  it('s / m s / h m', () => {
    expect(formatDuration(500)).toBe('0s');
    expect(formatDuration(45000)).toBe('45s');
    expect(formatDuration(134000)).toBe('2m 14s');
    expect(formatDuration(3900000)).toBe('1h 5m');
  });
});

describe('completedTaskDurations / summarizeTiming', () => {
  const T = Date.parse('2026-07-03T12:00:00Z');
  it('usa início observado; sem ele, herda o fim da anterior (modelo sequencial)', () => {
    const todos = [
      { content: 'A', activeForm: 'A', status: 'completed', startedAt: T, completedAt: T + 60000 },
      { content: 'B', activeForm: 'B', status: 'completed', completedAt: T + 90000 },
      { content: 'C', activeForm: 'C', status: 'pending' },
    ];
    expect(completedTaskDurations(todos)).toEqual([60000, 30000, undefined]);
  });
  it('estimativa em contagem regressiva: pendente custa a média; ativa, o que falta', () => {
    const now = T + 100000;
    const todos = [
      { content: 'A', activeForm: 'A', status: 'completed', startedAt: T, completedAt: T + 60000 },
      { content: 'B', activeForm: 'B', status: 'in_progress', startedAt: T + 60000 },
      { content: 'C', activeForm: 'C', status: 'pending' },
    ];
    const s = summarizeTiming(todos, now);
    expect(s.elapsedMs).toBe(100000);      // 60s da A + 40s ao vivo da B
    expect(s.hasEstimate).toBe(true);
    expect(s.estimateMs).toBe(80000);      // B: max(0, 60s-40s)=20s + C: 60s
  });
  it('sem concluída observada não estima', () => {
    expect(summarizeTiming([{ content: 'A', activeForm: 'A', status: 'pending' }], 0).hasEstimate).toBe(false);
  });
});

describe('níveis', () => {
  it('shortModel/contextLevel/cacheLevel', () => {
    expect(shortModel('claude-opus-4-8')).toBe('opus-4-8');
    expect(contextLevel(0.5)).toBe('ok');
    expect(contextLevel(0.7)).toBe('warn');
    expect(contextLevel(0.9)).toBe('danger');
    expect(cacheLevel(0.8)).toBe('good');
    expect(cacheLevel(0.6)).toBe('mid');
    expect(cacheLevel(0.1)).toBe('low');
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run src/lib/todosFormat.test.js`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```js
// src/lib/todosFormat.js
// Formatação e matemática de tempo do painel de Tasks. Funções puras (o `now`
// é injetado, nunca lido de Date.now) — por isso testáveis.

// 7361 -> "7,4k", 24580 -> "24,6k". Vírgula decimal pra casar com pt-BR.
export function formatCompact(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  for (const u of [{ v: 1000000, s: 'M' }, { v: 1000, s: 'k' }]) {
    if (n >= u.v) {
      const rounded = Math.round((n / u.v) * 10) / 10;
      const str = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1).replace('.', ',');
      return str + u.s;
    }
  }
  return String(Math.round(n));
}

// 45000 -> "45s", 134000 -> "2m 14s", 3900000 -> "1h 5m". <1s ou inválido -> "0s".
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 1000) return '0s';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m ${totalSec % 60}s`;
  const hours = Math.floor(totalMin / 60);
  return `${hours}h ${totalMin % 60}m`;
}

// Durações das concluídas com inferência sequencial: usa o início observado
// quando existe; senão assume que a task começou quando a anterior terminou.
// `observed` distingue medição real de inferência (a estimativa só usa reais).
function sequentialCompleted(todos) {
  const out = [];
  let cursor;
  for (const t of todos) {
    if (t.status === 'completed' && t.completedAt !== undefined) {
      if (t.startedAt !== undefined) out.push({ ms: Math.max(0, t.completedAt - t.startedAt), observed: true });
      else if (cursor !== undefined) out.push({ ms: Math.max(0, t.completedAt - cursor), observed: false });
      else out.push({ ms: 0, observed: false });
      cursor = t.completedAt;
    } else {
      out.push(undefined);
      if (t.status === 'in_progress' && t.startedAt !== undefined) cursor = t.startedAt;
    }
  }
  return out;
}

// Duração (ms) de cada concluída, alinhada por índice; undefined nas demais.
export function completedTaskDurations(todos) {
  return sequentialCompleted(todos).map((d) => d && d.ms);
}

// Resumo de tempos: decorrido (concluídas + parte ao vivo da ativa) e estimativa
// regressiva do restante (média das medidas; a ativa custa o que falta dela).
export function summarizeTiming(todos, now) {
  const seq = sequentialCompleted(todos);
  let elapsedMs = 0, observedSum = 0, observedCount = 0, unfinished = 0;
  todos.forEach((t, i) => {
    const d = seq[i];
    if (d) {
      elapsedMs += d.ms;
      if (d.observed) { observedSum += d.ms; observedCount++; }
    } else if (t.status === 'in_progress' && t.startedAt !== undefined) {
      elapsedMs += Math.max(0, now - t.startedAt);
    }
    if (t.status === 'pending' || t.status === 'in_progress') unfinished++;
  });
  const hasEstimate = observedCount >= 1 && unfinished >= 1;
  let estimateMs = 0;
  if (hasEstimate) {
    const avg = observedSum / observedCount;
    for (const t of todos) {
      if (t.status === 'pending') estimateMs += avg;
      else if (t.status === 'in_progress') {
        const elapsed = t.startedAt !== undefined ? Math.max(0, now - t.startedAt) : 0;
        estimateMs += Math.max(0, avg - elapsed);
      }
    }
  }
  return { elapsedMs, estimateMs, hasEstimate };
}

// "claude-opus-4-8" -> "opus-4-8"
export function shortModel(model) {
  return model.startsWith('claude-') ? model.slice('claude-'.length) : model;
}

// Semáforo do contexto: ok < 0.60 <= warn < 0.85 <= danger.
export function contextLevel(pct) {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.60) return 'warn';
  return 'ok';
}

// Semáforo do cache (invertido: reaproveitar mais é melhor): good >= 0.75 > mid >= 0.50 > low.
export function cacheLevel(rate) {
  if (rate >= 0.75) return 'good';
  if (rate >= 0.50) return 'mid';
  return 'low';
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/todosFormat.test.js`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/todosFormat.js src/lib/todosFormat.test.js
git commit -m "feat: helpers de formatação e timing do painel de Tasks"
```

---

### Task 8: i18n — namespace `todos.*` + chaves de aba/comando (pt/en)

**Files:**
- Modify: `src/lib/locales/pt.json`
- Modify: `src/lib/locales/en.json`
- Test: `scripts/i18n-parity.smoke.cjs` (já existe — só rodar)

**Interfaces:**
- Produces: chaves `todos.*`, `preview.todos`, `app.cmd_view_todos` usadas nas Tasks 9–10 via `useT()`.

- [ ] **Step 1: Adicionar em `pt.json`**

Dentro do objeto `"preview"`, adicionar a chave (ordem alfabética não é exigida; colocar junto das outras abas):

```json
"todos": "Tarefas",
```

Dentro do objeto `"app"`, junto dos outros `cmd_view_*`:

```json
"cmd_view_todos": "Tarefas (Claude)",
```

E um namespace novo de topo `"todos"`:

```json
"todos": {
  "main_agent": "Agente principal",
  "no_session_title": "Sem sessão do Claude nesta aba",
  "no_session_body": "Abra uma conversa na aba de chat e as tarefas do Claude aparecem aqui.",
  "awaiting_title": "Sessão ativa — aguardando tarefas",
  "awaiting_sub": "As tarefas aparecem aqui assim que o agente usar o TodoWrite.",
  "history_divider": "histórico",
  "active_badge": "{count} ativas",
  "elapsed": "decorrido",
  "remaining": "restante",
  "estimate_label": "estimativa",
  "estimate_tooltip": "Estimativa: média das tarefas concluídas, descontando o tempo já gasto na tarefa atual",
  "no_todos": "Nenhuma tarefa ainda",
  "usage_tokens": "Tokens",
  "usage_ctx_badge": "{pct}% ctx",
  "usage_by_model": "por modelo",
  "usage_by_agent": "por agente",
  "usage_cache": "Cache",
  "usage_cache_reuse": "{pct}% reaproveitado",
  "usage_cache_read": "lido",
  "usage_cache_created": "criado",
  "usage_cache_new": "novo",
  "usage_col_agent": "Agente",
  "usage_col_model": "Modelo",
  "usage_col_input": "Entrada",
  "usage_col_output": "Saída",
  "usage_total": "Total"
}
```

- [ ] **Step 2: Adicionar em `en.json` (paridade exata de chaves)**

`"preview"`: `"todos": "Tasks",` · `"app"`: `"cmd_view_todos": "Tasks (Claude)",` · namespace de topo:

```json
"todos": {
  "main_agent": "Main agent",
  "no_session_title": "No Claude session in this tab",
  "no_session_body": "Start a conversation in the chat tab and Claude's tasks will show up here.",
  "awaiting_title": "Active session — waiting for tasks",
  "awaiting_sub": "Tasks will show up here as soon as the agent uses TodoWrite.",
  "history_divider": "history",
  "active_badge": "{count} active",
  "elapsed": "elapsed",
  "remaining": "remaining",
  "estimate_label": "estimate",
  "estimate_tooltip": "Estimate: average of completed tasks, minus time already spent on the current task",
  "no_todos": "No tasks yet",
  "usage_tokens": "Tokens",
  "usage_ctx_badge": "{pct}% ctx",
  "usage_by_model": "by model",
  "usage_by_agent": "by agent",
  "usage_cache": "Cache",
  "usage_cache_reuse": "{pct}% reused",
  "usage_cache_read": "read",
  "usage_cache_created": "created",
  "usage_cache_new": "new",
  "usage_col_agent": "Agent",
  "usage_col_model": "Model",
  "usage_col_input": "Input",
  "usage_col_output": "Output",
  "usage_total": "Total"
}
```

- [ ] **Step 3: Rodar o teste de paridade**

Run: `npm run test:i18n`
Expected: PASS (pt/en com o mesmo conjunto de chaves)

- [ ] **Step 4: Commit**

```bash
git add src/lib/locales/pt.json src/lib/locales/en.json
git commit -m "feat: strings i18n do painel de Tarefas (pt/en)"
```

---

### Task 9: Componentes React — `TodoItem`, `AgentSection`, `UsageTable`, `TodosPanel`

**Files:**
- Create: `src/components/todos/TodoItem.jsx`
- Create: `src/components/todos/AgentSection.jsx`
- Create: `src/components/todos/UsageTable.jsx`
- Create: `src/components/TodosPanel.jsx`

**Interfaces:**
- Consumes: `src/lib/todosFormat.js` (Task 7), chaves `todos.*` (Task 8), `window.api.todosSubscribe/todosUnsubscribe/on` (Task 6), `EmptyState` (`src/components/ui/empty-state.jsx`), `cn` (`@/lib/utils`), `useT` (`@/lib/i18n`).
- Produces: `export function TodosPanel({ active, chatSession })` — `active` é o projeto ativo (`{ path, name, ... }` ou null), `chatSession` é o id da ABA de chat ativa (não o claudeId). Registrada no PreviewPanel na Task 10.

Sem teste unitário de UI (o repo não tem infra de teste React; environment é node). Verificação: `npm run build` compila e a Task 11 valida ao vivo.

- [ ] **Step 1: `src/components/todos/TodoItem.jsx`**

```jsx
// Um item da task list: ícone de status, rótulo (activeForm enquanto roda) e a
// duração — ao vivo (relógio, via `now` injetado) na ativa, medida nas concluídas.
import { Check, Circle, Clock, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/todosFormat';

export function TodoItem({ todo, completedMs, now }) {
  const inProgress = todo.status === 'in_progress';
  const completed = todo.status === 'completed';
  const label = inProgress ? todo.activeForm : todo.content;
  let duration = null;
  if (inProgress && todo.startedAt !== undefined) {
    duration = { live: true, text: formatDuration(now - todo.startedAt) };
  } else if (completed && completedMs !== undefined) {
    duration = { live: false, text: completedMs < 1000 ? '<1s' : formatDuration(completedMs) };
  }
  return (
    <li className={cn(
      'flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug transition-colors hover:bg-muted/60',
      inProgress && 'bg-primary/10'
    )}>
      {completed
        ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
        : inProgress
          ? <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary [animation-duration:2.5s]" />
          : <Circle className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />}
      <span className={cn(
        'min-w-0 flex-1 break-words',
        completed && 'text-muted-foreground line-through opacity-70',
        inProgress && 'font-semibold text-primary'
      )}>{label}</span>
      {duration && (
        <span className={cn(
          'flex shrink-0 items-center gap-1 text-xs tabular-nums',
          duration.live ? 'font-semibold text-primary' : 'text-muted-foreground'
        )}>
          {duration.live && <Clock className="size-3" />}{duration.text}
        </span>
      )}
    </li>
  );
}
```

- [ ] **Step 2: `src/components/todos/AgentSection.jsx`**

```jsx
// Card de um agente (principal ou sub-agent): cabeçalho recolhível com nome,
// bolinha de estado (pulsa rodando, verde concluído), fração X/Y e badge de
// ativas; corpo com os tempos (decorrido/estimativa) e a lista de tasks.
import { useState } from 'react';
import { ChevronRight, Clock, Hourglass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { formatDuration, summarizeTiming, completedTaskDurations } from '@/lib/todosFormat';
import { TodoItem } from './TodoItem.jsx';

export function AgentSection({ agent, defaultExpanded = true, history = false, now }) {
  const t = useT();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const total = agent.todos.length;
  const completed = agent.todos.filter((x) => x.status === 'completed').length;
  const inProgress = agent.todos.filter((x) => x.status === 'in_progress').length;
  // Estado visual: ativo (pulsa), concluído (verde) ou ocioso.
  const state = inProgress > 0 || agent.status === 'running'
    ? 'active'
    : total > 0 && completed === total ? 'done' : 'idle';
  const timing = summarizeTiming(agent.todos, now);
  const durations = completedTaskDurations(agent.todos);
  const name = agent.isMain ? t('todos.main_agent') : agent.name;

  return (
    <section className={cn(
      'overflow-hidden rounded-lg border',
      !agent.isMain && 'ml-3',
      history && 'opacity-50',
      state === 'active' && 'shadow-[inset_2px_0_0_theme(colors.primary.DEFAULT)]'
    )}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <ChevronRight className={cn('size-3 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        {state !== 'idle' && (
          <span className={cn(
            'size-2 shrink-0 rounded-full',
            state === 'active' ? 'animate-pulse bg-primary' : 'bg-emerald-500'
          )} />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <span className="tabular-nums text-muted-foreground">{completed}/{total}</span>
          {inProgress > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-px font-semibold text-primary">
              {t('todos.active_badge', { count: inProgress })}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <>
          {(timing.elapsedMs > 0 || timing.hasEstimate) && (
            <div className="flex gap-2 px-3 pb-1 tabular-nums">
              {timing.elapsedMs > 0 && (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-muted/60 p-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="size-3" />{t('todos.elapsed')}</span>
                  <span className="text-sm font-semibold">{formatDuration(timing.elapsedMs)}</span>
                </div>
              )}
              {timing.hasEstimate && (
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-muted/60 p-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Hourglass className="size-3" />{t('todos.remaining')}</span>
                  <span className="text-sm font-semibold">~{formatDuration(timing.estimateMs)}</span>
                  <span className="text-[10px] italic text-muted-foreground/75" title={t('todos.estimate_tooltip')}>{t('todos.estimate_label')}</span>
                </div>
              )}
            </div>
          )}
          <ul className="m-0 list-none px-1 pb-2">
            {agent.todos.map((todo, i) => (
              <TodoItem key={i} todo={todo} completedMs={durations[i]} now={now} />
            ))}
            {agent.todos.length === 0 && (
              <li className="px-3 py-1.5 text-[13px] italic text-muted-foreground/70">{t('todos.no_todos')}</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: `src/components/todos/UsageTable.jsx`**

```jsx
// Tabela de uso: barra de contexto (semáforo ok/warn/danger), quebra de cache
// (lido/criado/novo) e tokens por modelo — alternável para "por agente".
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { formatCompact, shortModel, contextLevel, cacheLevel } from '@/lib/todosFormat';

const CTX_COLORS = { ok: 'bg-emerald-500', warn: 'bg-amber-500', danger: 'bg-red-500' };
const CACHE_BADGE = { good: 'text-emerald-500', mid: 'text-amber-500', low: 'text-red-500' };

export function UsageTable({ usage }) {
  const t = useT();
  const [byAgent, setByAgent] = useState(false);
  if (!usage || usage.byModel.length === 0) return null;

  const ctx = usage.context;
  const ctxPct = ctx ? Math.min(ctx.tokens / ctx.limit, 1) : 0;
  const ctxLvl = ctx ? contextLevel(ctx.tokens / ctx.limit) : 'ok';
  const cache = usage.cache;
  const cacheTotal = cache ? cache.input + cache.read + cache.creation : 0;
  const cacheRate = cache && cacheTotal > 0 ? cache.read / cacheTotal : 0;
  const pctOf = (part) => (cacheTotal > 0 ? Math.round((part / cacheTotal) * 100) : 0);
  const totals = usage.byModel.reduce(
    (acc, m) => ({ input: acc.input + m.input, output: acc.output + m.output, cache: acc.cache + m.cache }),
    { input: 0, output: 0, cache: 0 }
  );
  const num = 'px-2 py-1 text-right tabular-nums';

  return (
    <section className="mx-1 mb-2 rounded-lg border px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between py-0.5">
        <span className="flex items-center gap-1.5 font-semibold">
          {t('todos.usage_tokens')}
          {ctx && (
            <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold text-white', CTX_COLORS[ctxLvl])}>
              {t('todos.usage_ctx_badge', { pct: Math.round(ctxPct * 100) })}
            </span>
          )}
        </span>
        <button type="button" onClick={() => setByAgent((b) => !b)} className="text-muted-foreground transition-colors hover:text-foreground">
          {byAgent ? '◂ ' + t('todos.usage_by_model') : t('todos.usage_by_agent') + ' ▸'}
        </button>
      </div>

      {ctx && (
        <div className="flex items-center gap-2 py-1">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn('h-full rounded-full', CTX_COLORS[ctxLvl])} style={{ width: `${Math.round(ctxPct * 100)}%` }} />
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatCompact(ctx.tokens)}/{formatCompact(ctx.limit)}</span>
        </div>
      )}

      {cache && cacheTotal > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <span className="text-muted-foreground">{t('todos.usage_cache')}</span>
            <span className={cn('font-semibold', CACHE_BADGE[cacheLevel(cacheRate)])}>
              {t('todos.usage_cache_reuse', { pct: Math.round(cacheRate * 100) })}
            </span>
          </div>
          <div className="my-1 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="bg-emerald-500" style={{ width: `${pctOf(cache.read)}%` }} />
            <div className="bg-sky-500" style={{ width: `${pctOf(cache.creation)}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${pctOf(cache.input)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 pb-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500" />{t('todos.usage_cache_read')} {formatCompact(cache.read)}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-sky-500" />{t('todos.usage_cache_created')} {formatCompact(cache.creation)}</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-muted-foreground/40" />{t('todos.usage_cache_new')} {formatCompact(cache.input)}</span>
          </div>
        </>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">{byAgent ? t('todos.usage_col_agent') : t('todos.usage_col_model')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_col_input')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_col_output')}</th>
            <th className={cn(num, 'font-medium')}>{t('todos.usage_cache')}</th>
          </tr>
        </thead>
        <tbody>
          {byAgent
            ? usage.byAgent.flatMap((agent) => agent.models.map((m, i) => (
              <tr key={agent.agentId + m.model} title={`${agent.name}\n${m.model}`}>
                <td className="max-w-0 truncate px-2 py-1">{i === 0 ? agent.name + ' ' : ''}<span className="text-muted-foreground">{shortModel(m.model)}</span></td>
                <td className={num} title={String(m.input)}>{formatCompact(m.input)}</td>
                <td className={num} title={String(m.output)}>{formatCompact(m.output)}</td>
                <td className={num} title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            )))
            : usage.byModel.map((m) => (
              <tr key={m.model} title={m.model}>
                <td className="max-w-0 truncate px-2 py-1">{shortModel(m.model)}</td>
                <td className={num} title={String(m.input)}>{formatCompact(m.input)}</td>
                <td className={num} title={String(m.output)}>{formatCompact(m.output)}</td>
                <td className={num} title={String(m.cache)}>{formatCompact(m.cache)}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="px-2 py-1">{t('todos.usage_total')}</td>
            <td className={num}>{formatCompact(totals.input)}</td>
            <td className={num}>{formatCompact(totals.output)}</td>
            <td className={num}>{formatCompact(totals.cache)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
```

- [ ] **Step 4: `src/components/TodosPanel.jsx`**

```jsx
// Painel de Tarefas: espelha ao vivo a task list que o Claude Code emite
// (TodoWrite/TaskCreate) na sessão da ABA DE CHAT ATIVA — agente principal,
// sub-agents e uso de tokens. Os dados chegam prontos do main (todos:snapshot);
// aqui só assinatura, relógio e render.
import { useEffect, useState } from 'react';
import { EmptyState } from './ui/empty-state.jsx';
import { useT } from '@/lib/i18n';
import { AgentSection } from './todos/AgentSection.jsx';
import { UsageTable } from './todos/UsageTable.jsx';

// Sub-agent "histórico": terminou e nunca teve todos — vale um divisor, não um card cheio.
const isHistory = (a) => !a.isMain && a.status !== 'running' && a.todos.length === 0;
const isFirstHistory = (agents, i) => isHistory(agents[i]) && (i === 0 || !isHistory(agents[i - 1]));

export function TodosPanel({ active, chatSession }) {
  const t = useT();
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const projectPath = active?.path || null;

  // (Re)assina quando muda projeto/aba; desmonta = cancela. O filtro por
  // sessionId descarta um snapshot atrasado da assinatura anterior.
  useEffect(() => {
    setSnapshot(null);
    if (!projectPath || !chatSession) return;
    const off = window.api.on('todos:snapshot', (payload) => {
      if (payload.sessionId === chatSession) setSnapshot(payload.snapshot);
    });
    window.api.todosSubscribe(projectPath, chatSession);
    return () => { off(); window.api.todosUnsubscribe(); };
  }, [projectPath, chatSession]);

  // Relógio de 1s pros tempos ao vivo — só gira se algo está rodando.
  const hasLive = !!snapshot?.agents?.some(
    (a) => a.status === 'running' || a.todos.some((x) => x.status === 'in_progress')
  );
  useEffect(() => {
    if (!hasLive) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasLive]);

  if (!snapshot) {
    return (
      <div className="absolute inset-0 overflow-y-auto bg-background">
        <EmptyState>
          <p className="font-medium">{t('todos.no_session_title')}</p>
          <p className="text-xs opacity-80">{t('todos.no_session_body')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background p-2">
      <UsageTable usage={snapshot.usage} />
      {snapshot.agents.length > 0 ? (
        <div className="flex flex-col gap-2 px-1">
          {snapshot.agents.map((agent, i) => (
            <div key={agent.agentId} className="contents">
              {isFirstHistory(snapshot.agents, i) && (
                <div className="flex items-center gap-2 px-1 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  {t('todos.history_divider')}
                </div>
              )}
              <AgentSection agent={agent} defaultExpanded={agent.isMain} history={isHistory(agent)} now={now} />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-muted-foreground">
          <p className="text-sm">{t('todos.awaiting_title')}</p>
          <p className="mt-1 text-xs opacity-85">{t('todos.awaiting_sub')}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Compilar**

Run: `npm run build`
Expected: build do Vite conclui sem erro (os componentes ainda não são importados — o registro vem na Task 10).

- [ ] **Step 6: Commit**

```bash
git add src/components/todos src/components/TodosPanel.jsx
git commit -m "feat: componentes React do painel de Tarefas"
```

---

### Task 10: Integração — aba no PreviewPanel, plumbing da sessão ativa, paleta

**Files:**
- Modify: `src/components/PreviewPanel.jsx` (~linhas 49-55, 290, 969-975, 981-987, 1039, 1130-1135)
- Modify: `src/components/ChatPanel.jsx` (~linhas 12, 469, 589)
- Modify: `src/App.jsx` (~linhas 287-293, 474, 498)

**Interfaces:**
- Consumes: `TodosPanel` (Task 9), `findPane`/`firstPane` (`src/lib/paneLayout.js`), chaves i18n (Task 8).
- Produces: aba "Tarefas" funcional; `chatSession` (id da aba de chat ativa) fluindo ChatPanel → App → PreviewPanel → TodosPanel; comando `view:todos` na paleta.

- [ ] **Step 1: `ChatPanel.jsx` — publicar a sessão ativa**

Na linha ~12, adicionar `findPane` ao import de `@/lib/paneLayout` (já importa `firstPane` e outros):

```js
import {
  applyDrop, addSessionToPane, setActiveInPane, closeSessionInTree, reconcile,
  firstPane, allSessionIds, paneCount, findPane,
} from '@/lib/paneLayout';
```

(Conferir a lista real do import existente e apenas ACRESCENTAR `findPane` — não remover nada.)

Na assinatura (linha 469): `export function ChatPanel({ activeProject, controlsRef, onActiveSessionChange }) {`

Após o `useEffect` de troca de projeto (linha ~589), adicionar:

```jsx
  // Publica pro App qual sessão de chat está ativa (a do pane focado; senão a do
  // primeiro pane), pra painéis fora do chat — como o de Tarefas — seguirem a aba
  // em foco. Ref pro callback não forçar re-execução quando o App re-renderiza.
  const onActiveSessionRef = useRef(onActiveSessionChange);
  onActiveSessionRef.current = onActiveSessionChange;
  useEffect(() => {
    const pane = (focusedPane && findPane(layout, focusedPane)) || firstPane(layout);
    onActiveSessionRef.current?.(pane?.active ?? null);
  }, [layout, focusedPane]);
```

- [ ] **Step 2: `App.jsx` — estado + repasse**

Junto dos outros `useState` do App, adicionar:

```jsx
  const [chatSession, setChatSession] = useState(null); // aba de chat ativa (painel de Tarefas segue ela)
```

Linha ~474: `<ChatPanel activeProject={active?.path || null} controlsRef={chatControls} onActiveSessionChange={setChatSession} />`

Linha ~498: `<PreviewPanel active={active} chatSession={chatSession} onProjectsChanged={reload} controlsRef={previewControls} onModeChange={setServerMode} />`

No array `commands` (após a linha do `view:git`, ~289):

```jsx
      { id: 'view:todos', group: t('app.cmd_group_panel'), label: t('app.cmd_view_todos'), hint: t('app.cmd_hint_tab'), icon: <ListTodo />, run: view('todos') },
```

E acrescentar `ListTodo` ao import de `lucide-react` no topo do `App.jsx`.

- [ ] **Step 3: `PreviewPanel.jsx` — registrar a aba**

Linha ~2, acrescentar `ListTodo` ao import de `lucide-react`.

Linhas ~49-55, junto dos outros lazy:

```jsx
const TodosPanel = lazy(() => import('./TodosPanel.jsx').then((m) => ({ default: m.TodosPanel })));
```

Linha 290, assinatura: `export function PreviewPanel({ active, chatSession, onProjectsChanged, controlsRef, onModeChange }) {`

Linhas ~969-975, junto das outras flags: `const inTodos = view === 'todos';`

Linhas ~981-987, adicionar a aba após o Git:

```jsx
            <TabsTrigger value="todos" className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"><ListTodo />{t('preview.todos')}</TabsTrigger>
```

Linha ~1039, incluir a flag no espaçador: `{(inCode || inGit || inApi || inMcp || inBoard || inTodos) && <div className="flex-1" />}`

Linhas ~1130-1135, junto dos outros painéis condicionais:

```jsx
          {inTodos && <LazyPanel label="Tarefas"><TodosPanel active={active} chatSession={chatSession} /></LazyPanel>}
```

- [ ] **Step 4: Compilar e rodar todos os testes**

Run: `npm run build && npm test && npm run test:i18n`
Expected: build OK; todas as suítes vitest PASS; paridade i18n PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PreviewPanel.jsx src/components/ChatPanel.jsx src/App.jsx
git commit -m "feat: aba Tarefas no PreviewPanel seguindo a sessão de chat ativa"
```

---

### Task 11: Verificação manual ao vivo + screenshot

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o app**

Run: `npm run build && npm start`

- [ ] **Step 2: Roteiro de verificação**

1. Abrir um projeto e iniciar uma conversa com o Claude na aba de chat.
2. Abrir a aba **Tarefas** no PreviewPanel → deve mostrar "Sessão ativa — aguardando tarefas" (ou "Sem sessão" antes do transcript nascer).
3. Pedir ao Claude algo que gere todos (ex.: "crie um plano com TodoWrite de 3 passos e execute") → a lista deve aparecer e transicionar `pending → in_progress → completed` ao vivo, com o relógio da task ativa ticando.
4. Pedir algo que dispare um sub-agent (ex.: "use um subagent para pesquisar X") → card do sub-agent aparece com status rodando.
5. Conferir a tabela de tokens (valores por modelo, barra de contexto).
6. Abrir uma segunda aba de chat, trocar entre abas → o painel deve trocar de sessão.
7. Alternar tema claro/escuro → painel legível nos dois. Trocar idioma pt/en → strings trocam.

- [ ] **Step 3: Capturar screenshot do painel com dados reais** (para o corpo do PR). Salvar fora do repo (ex.: `%TEMP%\todos-panel.png`) e subir no PR via drag/drop ou `gh` (imagens não entram no git).

- [ ] **Step 4: Se algo falhar** — voltar à task correspondente, corrigir com o ciclo teste→código→commit. Não seguir para a Task 12 com verificação pendente.

---

### Task 12: Entrega — fork, push e PR

**Files:** nenhum (git/GitHub).

- [ ] **Step 1: Criar o fork e o remote**

```bash
gh repo fork Yg0rAndrade/carcara-code --clone=false
git -C . remote add fork https://github.com/carlosdealmeida/carcara-code.git
```

(Se o fork já existir, o primeiro comando apenas avisa — seguir adiante.)

- [ ] **Step 2: Push da branch**

```bash
git push -u fork feat/todos-panel
```

- [ ] **Step 3: Abrir o PR**

```bash
gh pr create --repo Yg0rAndrade/carcara-code --base main --head carlosdealmeida:feat/todos-panel \
  --title "feat: aba Tarefas — task list do Claude ao vivo (todos, sub-agents, tokens)" \
  --body "$(cat <<'EOF'
## O que é

Nova aba **Tarefas** no PreviewPanel que espelha ao vivo a task list que o Claude Code emite (`TodoWrite`), seguindo a aba de chat ativa:

- Agente principal e **sub-agents** (cada um no seu card, com histórico separado);
- Tempos por task (relógio ao vivo na ativa, duração nas concluídas, estimativa do restante);
- **Uso de tokens**: por modelo/por agente, barra de contexto (200k/1M) e reaproveitamento de cache;
- i18n pt/en, tema claro/escuro.

## Como funciona

- `claude-todos-core.cjs` (novo, irmão do `claude-sessions.cjs`): parser puro dos transcripts `~/.claude/projects/**.jsonl`. Suporta os **dois schemas** de tasks do Claude Code — o legado `TodoWrite` (snapshot completo por evento) e o novo `TaskCreate`/`TaskUpdate` (stream, flag `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
- `main.js`: canais `todos:subscribe`/`todos:unsubscribe` + push `todos:snapshot`. Vigia por mtime a cada 1,5s (mesmo ritmo do `startClaudeWatcher`) **somente enquanto o painel está aberto**; re-parseia só quando o disco muda.
- Renderer: `TodosPanel.jsx` + `src/components/todos/` (shadcn/Tailwind/lucide), registrado como aba do PreviewPanel; a sessão ativa flui ChatPanel → App → PreviewPanel.

## Testes

- `claude-todos-core.test.js`: 20 testes (2 schemas, timings, sub-agents, usage, snapshot, caminhos com `CLAUDE_CONFIG_DIR` fake).
- `src/lib/todosFormat.test.js`: formatação/timing.
- `npm test` e `npm run test:i18n` passando; verificação manual com sessão real (screenshot abaixo).

_(screenshot)_

Feature portada da extensão VSCode "Claude Todos", reescrita nas convenções deste repo (JS puro, React, parser `.cjs` testável em node). Specs/plano em `docs/superpowers/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Anexar o screenshot** ao corpo do PR (editar via web ou `gh pr edit`).

- [ ] **Step 5: Informar a URL do PR ao usuário.**

---

## Self-review do plano

- **Cobertura do spec:** parser 2 schemas (T1-T2), sub-agents (T3), usage (T4), snapshot+paths (T5), IPC+watching por assinatura (T6), formatação (T7), i18n pt/en (T8), UI com estados vazios/tema/relógio (T9), aba+aba ativa+paleta (T10), verificação manual (T11), fork+PR (T12). Tratamento de erros: linha malformada/arquivo ausente → skip/null (T1/T3/T5); sem match de prompt → sub-agent fora (comportamento herdado da extensão; o fallback "exibe mesmo sem match" do spec foi simplificado — sem invocação não há nome confiável).
- **Placeholders:** nenhum TBD; todo step de código tem o código.
- **Consistência de tipos:** `snapshot.agents[*]` = `{agentId,isMain,name,status?,todos,updatedAt}` consumido igual em T5/T6/T9; `Todo` = `{content,activeForm,status,startedAt?,completedAt?}` em T1/T7/T9; payload IPC `{sessionId,snapshot}` igual em T6/T9.
