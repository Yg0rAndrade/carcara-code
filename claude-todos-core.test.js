// claude-todos-core.test.js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import core from './claude-todos-core.cjs';

// Linha de transcript com um tool_use TodoWrite carregando o snapshot completo.
const tw = (iso, todos, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: iso,
    ...extra,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'x', name: 'TodoWrite', input: { todos } }],
    },
  });
const todo = (content, status, activeForm = content) => ({ content, activeForm, status });

describe('parseTodos — schema TodoWrite', () => {
  it('devolve o último snapshot', () => {
    const lines = [
      tw('2026-07-03T12:00:00Z', [todo('A', 'pending')]),
      tw('2026-07-03T12:01:00Z', [todo('A', 'completed'), todo('B', 'in_progress')]),
    ];
    const out = core.parseTodos(lines, true);
    expect(out.map((t) => [t.content, t.status])).toEqual([
      ['A', 'completed'],
      ['B', 'in_progress'],
    ]);
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
    const lines = [
      '{nao é json "name":"TodoWrite"',
      tw('2026-07-03T12:00:00Z', [todo('A', 'pending')]),
    ];
    expect(core.parseTodos(lines, true).map((t) => t.content)).toEqual(['A']);
  });

  it('descarta itens sem content/activeForm/status válidos', () => {
    const lines = [
      tw('2026-07-03T12:00:00Z', [
        todo('A', 'pending'),
        { content: 'B' },
        { content: 'C', activeForm: 'C', status: 'weird' },
      ]),
    ];
    expect(core.parseTodos(lines, true).map((t) => t.content)).toEqual(['A']);
  });
});

const tc = (iso, toolUseId, subject, activeForm) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: iso,
    message: {
      content: [
        { type: 'tool_use', id: toolUseId, name: 'TaskCreate', input: { subject, activeForm } },
      ],
    },
  });
const tcr = (toolUseId, taskId, text) =>
  JSON.stringify({
    type: 'user',
    toolUseResult: taskId ? { task: { id: taskId } } : undefined,
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text || 'ok' }] },
  });
const tu = (iso, taskId, status) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: iso,
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'u-' + taskId + '-' + status,
          name: 'TaskUpdate',
          input: { taskId, status },
        },
      ],
    },
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
      {
        content: 'Tarefa A',
        activeForm: 'Fazendo A',
        status: 'completed',
        startedAt: t1,
        completedAt: t2,
      },
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

// Helpers para testes de sub-agents
const agentUse = (toolUseId, input) =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: toolUseId, name: 'Agent', input }] },
  });
const agentResult = (toolUseId, agentId) =>
  JSON.stringify({
    type: 'user',
    toolUseResult: agentId ? { agentId } : {},
    message: { content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'done' }] },
  });
const subFirstLine = (prompt) =>
  JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } });

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
    fs.writeFileSync(
      path.join(dir, 'agent-done1.jsonl'),
      [subFirstLine('P1'), tw('2026-07-03T12:00:00Z', [todo('S1', 'completed')])].join('\n'),
    );
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

const usageLine = (model, usage, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    ...extra,
    message: { model, usage },
  });

describe('uso de tokens', () => {
  it('agrega por modelo e soma o cache do arquivo', () => {
    const lines = [
      usageLine('claude-opus-4-8', {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
      }),
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
      usageLine('claude-opus-4-8', {
        input_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 1,
      }),
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
    fs.writeFileSync(
      fake.transcript,
      [
        tw('2026-07-03T12:00:00Z', [todo('A', 'in_progress')]),
        usageLine('claude-opus-4-8', { input_tokens: 10, output_tokens: 5 }),
        agentUse('a1', { name: 'sub', prompt: 'PS' }),
        agentResult('a1', 'sub1'),
      ].join('\n'),
    );
    const subDir = path.join(fake.projDir, 'sess1', 'subagents');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'agent-sub1.jsonl'),
      [
        subFirstLine('PS'),
        usageLine('claude-haiku-4-5', { input_tokens: 3, output_tokens: 2 }),
      ].join('\n'),
    );

    const snap = core.buildSnapshot(PROJ, 'sess1');
    expect(snap.claudeId).toBe('sess1');
    expect(snap.agents.map((a) => [a.isMain, a.name])).toEqual([
      [true, 'main'],
      [false, 'sub'],
    ]);
    expect(snap.usage.byAgent.map((a) => a.name)).toEqual(['main', 'sub']);
    expect(snap.usage.byModel.map((m) => m.model)).toEqual(['claude-opus-4-8', 'claude-haiku-4-5']);
    expect(snap.usage.context.tokens).toBe(10);
  });

  it('transcript sem eventos de todos → agents vazio (UI mostra "aguardando")', () => {
    fake = makeFakeClaudeDir(PROJ, 'sess2');
    process.env.CLAUDE_CONFIG_DIR = fake.base;
    fs.writeFileSync(
      fake.transcript,
      usageLine('claude-opus-4-8', { input_tokens: 1, output_tokens: 1 }),
    );
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
    fs.writeFileSync(
      fake.transcript,
      tw('2026-07-03T12:01:00Z', [todo('A', 'completed')]) + '\nextra',
    );
    const st = fs.statSync(fake.transcript);
    fs.utimesSync(fake.transcript, st.atime, new Date(st.mtimeMs + 2000)); // garante mtime distinto em FS de baixa resolução
    expect(core.transcriptStamp(PROJ, 'sess4')).not.toBe(s1);
  });
});
