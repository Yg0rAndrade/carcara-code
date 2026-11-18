import { describe, it, expect } from 'vitest';
import { routeTerminalLink } from './terminalLink.js';

describe('routeTerminalLink', () => {
  it('http(s) vira aba no preview', () => {
    expect(routeTerminalLink('https://joiamisticalaroye.com.br/blog/sonhar-com-rato/')).toBe('tab');
    expect(routeTerminalLink('http://localhost:4321/')).toBe('tab');
    expect(routeTerminalLink('  HTTPS://exemplo.com  ')).toBe('tab');
  });

  it('mailto sai pro sistema', () => {
    expect(routeTerminalLink('mailto:alguem@exemplo.com')).toBe('external');
  });

  it('esquemas do SO e lixo são ignorados', () => {
    for (const u of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-msdt:/id',
      'data:text/html,oi',
      'https://',
      '',
      null,
      undefined,
    ]) {
      expect(routeTerminalLink(u)).toBe('deny');
    }
  });
});
