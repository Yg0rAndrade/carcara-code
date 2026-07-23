// Mata o `:hover` do SITE no modo celular/tablet — telas de toque não têm hover.
//
// POR QUE NÃO USAR A EMULAÇÃO DE TOQUE DO CHROMIUM (`Emulation.setEmitTouchEventsForMouse`),
// QUE É O JEITO "CERTO": porque ela não é do <webview>. No Chromium o `TouchEmulator` mora no
// `RenderWidgetHostInputEventRouter`, que é compartilhado por toda a árvore de WebContents —
// e o <webview> é WebContents INTERNO da janela do app. Ligar "no site" convertia mouse→toque
// na JANELA INTEIRA (medido: com ela ligada, o documento do app não recebe nem um mousemove;
// só um clique gera os eventos de mouse de compatibilidade) e instalava o cursor de toque do
// Chromium — a bolinha cinza — por cima do app todo, sem jeito de tirar. No Chrome isso não
// incomoda porque o DevTools é OUTRA WebContents, fora da árvore da página emulada.
//
// O que sobra pra fazer aqui dentro é o que as extensões de "disable hover" fazem: reescrever
// os seletores `:hover` das folhas de estilo da própria página pra que nunca casem. Fica
// contido no site, não toca em input, cursor nem janela. `@media (hover: none)` e
// `(pointer: coarse)` continuam vindo do `Emulation.setTouchEmulationEnabled`, que não mexe
// no cursor nem nos eventos (medido).
//
// Degradação conhecida: folha de estilo de outra origem (CORS) não deixa ler `cssRules` —
// nesses casos o hover continua. Sites de preview (localhost) e <style> injetado são lidos.

export const NO_HOVER_INJECT = `(() => {
  if (window.__carcaraNoHover) return;

  // Seletor que não casa com nada, mas continua sendo seletor válido (o navegador rejeita a
  // regra inteira se a sintaxe quebrar, e aí perderíamos o estilo original ao restaurar).
  var MORTO = ':not(*)';
  var tocadas = []; // [{ regra, original }] pra desfazer no cleanup

  function matarNaLista(regras) {
    if (!regras) return;
    for (var i = 0; i < regras.length; i++) {
      var r = regras[i];
      // Trata a regra ANTES de descer. Cuidado: no Chromium de hoje (CSS aninhado) TODA
      // CSSStyleRule tem cssRules — uma lista vazia, mas truthy. Testar "if (r.cssRules)"
      // primeiro e dar continue fazia o script pular TODA regra de estilo e não desarmar
      // nada (o teste flagrou: 0 regras tocadas). Sem crases aqui: este comentário mora
      // DENTRO do template literal.
      if (r.selectorText && r.selectorText.indexOf(':hover') >= 0) {
        var original = r.selectorText;
        try {
          r.selectorText = original.replace(/:hover/g, MORTO);
          tocadas.push({ regra: r, original: original });
        } catch (e) {
          // Seletor que o navegador não deixa reescrever: deixa quieto (o hover continua).
        }
      }
      // Aninhadas: @media/@supports/@layer/@container e também regras dentro de regras.
      if (r.cssRules && r.cssRules.length) matarNaLista(r.cssRules);
    }
  }

  function varrer() {
    var folhas = [];
    try { folhas = folhas.concat(Array.prototype.slice.call(document.styleSheets)); } catch (e) {}
    try { folhas = folhas.concat(document.adoptedStyleSheets || []); } catch (e) {}
    for (var i = 0; i < folhas.length; i++) {
      var regras = null;
      try {
        regras = folhas[i].cssRules; // folha de outra origem: joga SecurityError
      } catch (e) {
        continue;
      }
      matarNaLista(regras);
    }
  }

  varrer();

  // Estilo que chega depois (HMR do Vite, CSS-in-JS, <link> tardio, rota nova numa SPA).
  // Debounce num rAF pra não varrer a cada nó inserido.
  var agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () {
      agendado = false;
      varrer();
    });
  }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var add = muts[i].addedNodes;
      for (var j = 0; j < add.length; j++) {
        var n = add[j];
        if (n.nodeType === 1 && (n.tagName === 'STYLE' || n.tagName === 'LINK')) {
          agendar();
          return;
        }
      }
    }
  });
  try {
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  window.__carcaraNoHover = {
    teardown: function () {
      try { obs.disconnect(); } catch (e) {}
      for (var i = 0; i < tocadas.length; i++) {
        try { tocadas[i].regra.selectorText = tocadas[i].original; } catch (e) {}
      }
      tocadas = [];
      window.__carcaraNoHover = null;
    },
  };
})();`;

export const NO_HOVER_CLEANUP = `(() => {
  if (window.__carcaraNoHover && window.__carcaraNoHover.teardown) window.__carcaraNoHover.teardown();
})();`;
