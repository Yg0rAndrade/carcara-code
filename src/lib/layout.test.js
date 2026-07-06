import { describe, it, expect } from 'vitest';
import { resolveLayout } from './layout.js';

describe('resolveLayout', () => {
  it('usa o global quando não há override', () => {
    expect(resolveLayout({ railSide: 'right', claudeSide: 'right' }, null)).toEqual({
      railSide: 'right',
      claudeSide: 'right',
    });
  });

  it('override vence o global no lado do Claude', () => {
    expect(
      resolveLayout({ railSide: 'left', claudeSide: 'left' }, { claudeSide: 'right' }),
    ).toEqual({ railSide: 'left', claudeSide: 'right' });
  });

  it('override não afeta o lado do rail', () => {
    expect(
      resolveLayout({ railSide: 'right', claudeSide: 'left' }, { claudeSide: 'right' }).railSide,
    ).toBe('right');
  });

  it('valor inválido no override cai no global', () => {
    expect(
      resolveLayout({ railSide: 'left', claudeSide: 'right' }, { claudeSide: 'banana' }).claudeSide,
    ).toBe('right');
  });

  it('global ausente/inválido cai em left', () => {
    expect(resolveLayout(null, null)).toEqual({ railSide: 'left', claudeSide: 'left' });
    expect(resolveLayout({ railSide: 'x', claudeSide: 'y' }, null)).toEqual({
      railSide: 'left',
      claudeSide: 'left',
    });
  });
});
