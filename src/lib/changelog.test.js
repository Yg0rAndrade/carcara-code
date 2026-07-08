import { describe, it, expect } from 'vitest';
import { shouldShowChangelog } from './changelog.js';

describe('shouldShowChangelog', () => {
  it('mostra quando a versão mudou', () => {
    expect(shouldShowChangelog('0.1.8', '0.1.7')).toBe(true);
  });
  it('não mostra quando é igual', () => {
    expect(shouldShowChangelog('0.1.8', '0.1.8')).toBe(false);
  });
  it('não mostra na primeira execução sem versão salva (evita popup no 1º uso)', () => {
    expect(shouldShowChangelog('0.1.8', null)).toBe(false);
  });
  it('não mostra sem versão atual', () => {
    expect(shouldShowChangelog('', '0.1.7')).toBe(false);
  });
});
