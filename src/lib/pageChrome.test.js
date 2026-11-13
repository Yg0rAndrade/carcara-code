import { describe, it, expect, afterEach } from 'vitest';
import { PAGE_CHROME_SCRIPT } from './pageChrome.js';

// Roda o script da página num DOM falso: só o que ele usa.
function run({ layers, meta = null, y = 0 }) {
  let el = null;
  for (const bg of [...layers].reverse()) el = { bg, parentElement: el };
  globalThis.document = {
    elementFromPoint: () => el,
    querySelector: () => (meta ? { content: meta } : null),
  };
  globalThis.getComputedStyle = (n) => ({ backgroundColor: n.bg });
  Object.assign(globalThis, { innerWidth: 400, innerHeight: 800, scrollY: y });
  globalThis.location = { host: 'localhost:5173' };
  return (0, eval)(PAGE_CHROME_SCRIPT);
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.getComputedStyle;
  delete globalThis.location;
});

describe('PAGE_CHROME_SCRIPT', () => {
  it('estende a cor do topo do site, ignorando theme-color quando há cor na tela', () => {
    const r = run({ layers: ['rgb(37, 99, 235)', 'rgb(255, 255, 255)'], meta: '#ffffff' });
    expect(r.top).toBe('rgb(37,99,235)');
  });
  it('mistura cor translúcida com o fundo de trás', () => {
    const r = run({ layers: ['rgba(251, 191, 36, 0.3)', 'rgb(255, 255, 255)'] });
    expect(r.top).toBe('rgb(254,236,189)');
  });
  it('sem cor nenhuma, cai no theme-color', () => {
    const r = run({ layers: ['rgba(0, 0, 0, 0)'], meta: '#112233' });
    expect(r.top).toBe('#112233');
  });
  it('traz scroll e host', () => {
    expect(run({ layers: ['rgb(0,0,0)'], y: 120 })).toMatchObject({
      y: 120,
      host: 'localhost:5173',
    });
  });
});
