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
const claudeSessions = require('./claude-sessions.cjs');

const VALID_STATUSES = ['pending', 'in_progress', 'completed'];

function parseEpoch(ts) {
  if (!ts) return undefined;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : undefined;
}

function isValidTodo(item) {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof item.content === 'string' &&
    typeof item.activeForm === 'string' &&
    VALID_STATUSES.includes(item.status)
  );
}

// Monta um Todo omitindo timings indefinidos — snapshot menor e serializável.
function makeTodo(content, activeForm, status, startedAt, completedAt) {
  const t = { content, activeForm, status };
  if (startedAt !== undefined) t.startedAt = startedAt;
  if (completedAt !== undefined) t.completedAt = completedAt;
  return t;
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Qual schema vale: o do último evento de todos do transcript (um resume pode
// misturar os dois; vence o mais recente).
function detectSchema(lines, skipSidechain) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    const hasTodoWrite = line.indexOf('"name":"TodoWrite"') >= 0;
    const hasTask =
      line.indexOf('"name":"TaskCreate"') >= 0 || line.indexOf('"name":"TaskUpdate"') >= 0;
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
      return tm
        ? makeTodo(t.content, t.activeForm, t.status, tm.startedAt, tm.completedAt)
        : makeTodo(t.content, t.activeForm, t.status);
    });
  }
  if (schema === 'Task') return readTaskStream(lines, skipSidechain);
  return null;
}

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
  const tasks = new Map(); // taskId -> { content, activeForm, status, startedAt?, completedAt? }
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
            pendingCreates.set(block.id, {
              content: subject,
              activeForm: typeof activeForm === 'string' ? activeForm : subject,
            });
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

// Invocações da tool Agent no transcript principal: o nome exibível vem do
// param opcional `name` (a maioria só preenche `description` — cai nela).
// O tool_result diz o destino: com toolUseResult.agentId = concluiu; sem = foi
// rejeitada (não vira card); sem result ainda = está rodando.
function readAgentInvocations(lines) {
  const invocations = new Map(); // tool_use_id -> { name, prompt }
  const resultKind = new Map(); // tool_use_id -> 'completed' | 'rejected'
  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry) continue;
    const content = entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        block.type === 'tool_use' &&
        block.name === 'Agent' &&
        typeof block.id === 'string'
      ) {
        const input = block.input || {};
        const label =
          typeof input.name === 'string'
            ? input.name
            : typeof input.description === 'string'
              ? input.description
              : undefined;
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
    out.push({
      name: inv.name,
      prompt: inv.prompt,
      status: kind === 'completed' ? 'completed' : 'running',
    });
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
  try {
    return fs.readFileSync(fp, 'utf-8').split('\n');
  } catch {
    return null;
  }
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
    files = fs
      .readdirSync(subagentsDir)
      .filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  const byPrompt = new Map();
  for (const file of files) {
    const fp = path.join(subagentsDir, file);
    const lines = readLines(fp);
    if (!lines) continue;
    const prompt = readSubAgentPrompt(lines);
    if (prompt === null) continue;
    let updatedAt = 0;
    try {
      updatedAt = fs.statSync(fp).mtimeMs;
    } catch {}
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
    out.push({
      agentId: match.agentId,
      name: inv.name,
      isMain: false,
      status: inv.status,
      todos: match.todos,
      updatedAt: match.updatedAt,
    });
  }
  out.sort((a, b) => {
    const ga = subAgentGroup(a),
      gb = subAgentGroup(b);
    if (ga !== gb) return ga - gb;
    return b.updatedAt - a.updatedAt;
  });
  return out;
}

// ---- Uso de tokens ----
const DEFAULT_CONTEXT_LIMIT = 200000;
const ONE_MILLION = 1000000;
// opus/sonnet geração 4–19 (opus-4-8, sonnet-4-6…). O (?!\d) impede o id legado
// "claude-3-5-sonnet-20241022" de casar (o "sonnet-20" dele não é [4-9] nem 1\d).
const ONE_M_FAMILY = /(?:opus|sonnet)-(?:[4-9]|1\d)(?!\d)/i;

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Janela de contexto do modelo: 1M quando a família suporta (ou sufixo 1m
// explícito) OU quando o observado já passou de 200k (prova de janela maior).
// Sempre eleva, nunca abaixa.
function contextLimitFor(model, observedTokens) {
  const base = /1m/i.test(model) || ONE_M_FAMILY.test(model) ? ONE_MILLION : DEFAULT_CONTEXT_LIMIT;
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
  const tokens =
    num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
  return { tokens, limit: contextLimitFor(last.model, tokens) };
}

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
  try {
    parts.push('m:' + fs.statSync(fp).mtimeMs);
  } catch {
    return null;
  }
  try {
    const dir = subagentsDirFor(fp, claudeId);
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      try {
        parts.push(f + ':' + fs.statSync(path.join(dir, f)).mtimeMs);
      } catch {}
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
    try {
      mtime = fs.statSync(fp).mtimeMs;
    } catch {}
    agents.push({
      agentId: claudeId,
      isMain: true,
      name: 'main',
      todos: mainTodos,
      updatedAt: mtime,
    });
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
    const lines = a.isMain
      ? mainLines
      : readLines(path.join(subDir, 'agent-' + a.agentId + '.jsonl'));
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
      acc.input += m.input;
      acc.output += m.output;
      acc.cache += m.cache;
      byModel.set(m.model, acc);
    }
  }
  const cacheTotal = cache.input + cache.read + cache.creation;
  const usage =
    byAgent.length > 0
      ? {
          byModel: [...byModel.values()],
          byAgent,
          context: contextForLines(mainLines),
          cache: cacheTotal > 0 ? cache : null,
        }
      : null;

  return { claudeId, agents, usage, updatedAt: Date.now() };
}

module.exports = {
  parseTodos,
  readAgentInvocations,
  listSubAgents,
  modelsAndCacheForLines,
  contextForLines,
  contextLimitFor,
  buildSnapshot,
  transcriptStamp,
};
