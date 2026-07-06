import { describe, it, expect } from 'vitest';
import {
  formatCompact,
  formatDuration,
  completedTaskDurations,
  summarizeTiming,
  shortModel,
  contextLevel,
  cacheLevel,
} from './todosFormat.js';

describe('formatCompact', () => {
  it('formata com vírgula decimal pt-BR', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(7361)).toBe('7,4k');
    expect(formatCompact(24580)).toBe('24,6k');
    expect(formatCompact(2000000)).toBe('2M');
    expect(formatCompact(999999)).toBe('1M');
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
    expect(s.elapsedMs).toBe(100000); // 60s da A + 40s ao vivo da B
    expect(s.hasEstimate).toBe(true);
    expect(s.estimateMs).toBe(80000); // B: max(0, 60s-40s)=20s + C: 60s
  });
  it('sem concluída observada não estima', () => {
    expect(
      summarizeTiming([{ content: 'A', activeForm: 'A', status: 'pending' }], 0).hasEstimate,
    ).toBe(false);
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
