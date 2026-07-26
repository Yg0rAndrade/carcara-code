import { describe, it, expect } from 'vitest';
import { decideWindowOpen } from './window-open.cjs';

describe('decideWindowOpen', () => {
  it('link normal (http/https) vira aba interna', () => {
    expect(decideWindowOpen('http://localhost:5173/x').action).toBe('tab');
    expect(decideWindowOpen('https://exemplo.com/').action).toBe('tab');
  });

  it('blob: de página http(s) vira aba interna (PDF/CSV gerado no navegador)', () => {
    // Caso real: um app faz URL.createObjectURL(new Blob([pdf])) e window.open(url).
    // O blob só existe dentro da origem que o criou — negá-lo quebrava o recurso.
    expect(decideWindowOpen('blob:http://localhost:5173/abc-123').action).toBe('tab');
    expect(decideWindowOpen('blob:https://app.exemplo.com/abc-123').action).toBe('tab');
  });

  it('mailto: vai pro sistema', () => {
    expect(decideWindowOpen('mailto:eu@exemplo.com').action).toBe('external');
  });

  it('esquema perigoso é negado sem repasse', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'ms-msdt:/id',
      'smb://servidor/share',
      'data:text/html,<script>alert(1)</script>',
      'javascript:alert(1)',
      'blob:file:///abc-123', // blob de página file: — mesma regra do file:
      'blob:null/abc-123', // blob de origem opaca (sandbox/data:)
      '',
      null,
      undefined,
    ]) {
      expect(decideWindowOpen(url).action).toBe('deny');
    }
  });

  it('não se deixa enganar por espaço/caixa/prefixo', () => {
    expect(decideWindowOpen('  HTTP://exemplo.com').action).toBe('tab');
    expect(decideWindowOpen('BLOB:HTTP://localhost:1/x').action).toBe('tab');
    expect(decideWindowOpen('xblob:http://localhost:1/x').action).toBe('deny');
    expect(decideWindowOpen('nothttp://exemplo.com').action).toBe('deny');
  });
});
