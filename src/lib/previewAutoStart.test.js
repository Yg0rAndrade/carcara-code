import { describe, it, expect } from 'vitest';
import { decideAutoStart } from './previewAutoStart.js';

// Cenário-base: projeto Next com servidor no ar e página aberta.
const NEXT = { previewType: 'node' };

describe('decideAutoStart', () => {
  it('primeira vez com servidor fora do ar: sobe', () => {
    const d = decideAutoStart({ ...NEXT, running: false, handled: false });
    expect(d.action).toBe('start');
    expect(d.markHandled).toBe(true);
  });

  it('servidor no ar com URL: mostra o site', () => {
    expect(
      decideAutoStart({ ...NEXT, running: true, statusUrl: 'http://localhost:8082' }).action,
    ).toBe('show');
    expect(decideAutoStart({ ...NEXT, hasUrl: true }).action).toBe('show');
  });

  it('servidor no ar sem porta ainda: acompanha, não sobe outro', () => {
    // Sem isto, dois `preview:start` concorrem pela mesma porta durante o boot.
    expect(
      decideAutoStart({ ...NEXT, running: true, statusUrl: null, handled: false }).action,
    ).toBe('attach');
  });

  // === A regressão que este arquivo existe pra impedir ===
  it('REGRESSÃO: clicar em Parar não ressuscita o servidor', () => {
    // Estado logo depois do Parar: o projeto já foi tratado (subiu no boot do app),
    // o main reporta running:false e o efeito re-roda porque o objeto do projeto
    // mudou de identidade (running true→false). Não pode subir de novo.
    const d = decideAutoStart({ ...NEXT, running: false, handled: true, sameProject: true });
    expect(d.action).toBe('keep');
    expect(d.markHandled).toBe(false);
  });

  it('REGRESSÃO: servidor que morre no boot não entra em loop de relançar', () => {
    // exit → reload → efeito → (relançava) → exit → ... Cada re-run cai aqui.
    for (let i = 0; i < 5; i++) {
      expect(
        decideAutoStart({ ...NEXT, running: false, handled: true, sameProject: true }).action,
      ).toBe('keep');
    }
  });

  it('re-run no mesmo projeto NÃO limpa a tela (o log do erro tem que ficar)', () => {
    expect(
      decideAutoStart({ ...NEXT, running: false, handled: true, sameProject: true }).action,
    ).toBe('keep');
  });

  it('voltando de outro projeto com o servidor parado: estado vazio, não sobe', () => {
    expect(
      decideAutoStart({ ...NEXT, running: false, handled: true, sameProject: false }).action,
    ).toBe('empty');
  });

  it('projeto sem servidor pra subir: estado vazio', () => {
    expect(decideAutoStart({ previewType: null, running: false }).action).toBe('empty');
    expect(decideAutoStart({ previewType: null, running: false }).markHandled).toBe(false);
    // Mas se por algum motivo há processo de pé, marca como tratado.
    expect(decideAutoStart({ previewType: null, running: true }).markHandled).toBe(true);
  });

  it('URL viva tem precedência sobre tudo (nem consulta o resto)', () => {
    expect(decideAutoStart({ hasUrl: true, previewType: null, running: false }).action).toBe(
      'show',
    );
  });
});
