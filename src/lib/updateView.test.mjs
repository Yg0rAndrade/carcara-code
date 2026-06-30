import { describe, it, expect } from 'vitest';
import { updateView, hasPendingUpdate } from './updateView.js';

const t = (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k);

describe('updateView', () => {
  it('idle/desconhecido fica invisível', () => {
    expect(updateView({ state: 'idle' }, t).visible).toBe(false);
    expect(updateView(undefined, t).visible).toBe(false);
  });
  it('available → ação download', () => {
    const v = updateView({ state: 'available', version: '0.1.3' }, t);
    expect(v.visible).toBe(true);
    expect(v.action).toBe('download');
    expect(v.title).toContain('0.1.3');
  });
  it('downloading → progresso', () => {
    const v = updateView({ state: 'downloading', percent: 42 }, t);
    expect(v.showProgress).toBe(true);
    expect(v.percent).toBe(42);
  });
  it('downloaded → ação install', () => {
    expect(updateView({ state: 'downloaded' }, t).action).toBe('install');
  });
  it('error → ação retry', () => {
    expect(updateView({ state: 'error', message: 'x' }, t).action).toBe('retry');
  });
  it('dev fica invisível', () => {
    expect(updateView({ state: 'dev' }, t).visible).toBe(false);
  });
});

describe('hasPendingUpdate', () => {
  it('true só em available/downloaded', () => {
    expect(hasPendingUpdate({ state: 'available' })).toBe(true);
    expect(hasPendingUpdate({ state: 'downloaded' })).toBe(true);
    expect(hasPendingUpdate({ state: 'downloading' })).toBe(false);
    expect(hasPendingUpdate({ state: 'idle' })).toBe(false);
    expect(hasPendingUpdate(undefined)).toBe(false);
  });
});
