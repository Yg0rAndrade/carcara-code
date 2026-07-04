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
