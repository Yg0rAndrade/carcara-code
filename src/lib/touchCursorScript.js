// Cursor de "toque" do modo celular. Roda DENTRO da página (via webview.executeJavaScript),
// espelhando a mecânica do seletor de elementos (grabScript): monta um DOM próprio, troca o
// cursor e escuta o mouse. A diferença crucial é que aqui NADA é bloqueado — o site continua
// 100% interativo (cliques, scroll, links). É só uma camada visual: uma bolinha de "dedo" que
// segue o ponteiro + um ripple efêmero a cada clique, simulando o toque de um celular.
//
// Precisa injetar na página (não dá pra desenhar do app): o <webview> é outro processo, então
// eventos de mouse sobre o site nunca chegam ao container do app — só o script de dentro vê.
// Injetado quando o viewport é 'mobile' e re-injetado a cada navegação (dom-ready).

export const INJECT = `(() => {
  if (window.__carcaraTouch) return;
  var ACCENT = '#f2792b';

  // Bolinha translúcida de "dedo": segue o ponteiro, centrada nele. pointer-events:none pra
  // deixar o clique real passar pro site por baixo; z-index alto igual ao box do grab.
  var dot = document.createElement('div');
  dot.className = '__carcara-touch-dot';
  dot.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:0;'
    + 'border-radius:50%;pointer-events:none;z-index:2147483646;display:none;'
    + 'background:' + ACCENT + '40;border:2px solid ' + ACCENT + 'cc;'
    + 'box-shadow:0 0 6px 0 ' + ACCENT + '55;'
    + 'transform:translate(-50%,-50%);will-change:left,top;';
  document.documentElement.appendChild(dot);

  // Esconde o cursor do SISTEMA em toda a página. Só trocar o cursor do
  // documentElement não basta: elementos com cursor próprio (botão/link =
  // cursor:pointer) ganham por especificidade e o "dedo" do SO aparece por cima
  // da bolinha. Uma folha de estilo com '*' + !important cala todos eles — no
  // celular real não há cursor pra mostrar.
  var style = document.createElement('style');
  style.className = '__carcara-touch-style';
  style.textContent = '*, *::before, *::after { cursor: none !important; }';
  document.documentElement.appendChild(style);

  var prevCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'none';

  // Ripples vivos (pra limpar no teardown se ainda estiverem animando).
  var ripples = [];

  function move(e){
    dot.style.display = 'block';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  }

  // Ponteiro saiu da página (foco foi pra outra janela/iframe/barra do app): some
  // com a bolinha, senão ela fica "grudada" na última posição fora da área visível.
  function leave(){
    dot.style.display = 'none';
  }

  function tap(e){
    var r = document.createElement('div');
    r.className = '__carcara-touch-ripple';
    r.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:0;'
      + 'border-radius:50%;pointer-events:none;z-index:2147483645;'
      + 'background:' + ACCENT + '4d;border:2px solid ' + ACCENT + 'cc;'
      + 'transform:translate(-50%,-50%) scale(0.4);';
    r.style.left = e.clientX + 'px';
    r.style.top = e.clientY + 'px';
    document.documentElement.appendChild(r);
    ripples.push(r);
    function done(){
      var i = ripples.indexOf(r);
      if (i >= 0) ripples.splice(i, 1);
      try { r.remove(); } catch (err) {}
    }
    try {
      var anim = r.animate([
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0.7 },
        { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }
      ], { duration: 480, easing: 'ease-out' });
      anim.onfinish = done;
      anim.oncancel = done;
    } catch (err) {
      // Sem Web Animations: cai num timeout pra ainda auto-limpar (sem vazar).
      setTimeout(done, 480);
    }
  }

  function teardown(){
    // Observadores passivos e não-capturantes: só olham, nunca bloqueiam o site.
    document.removeEventListener('mousemove', move);
    document.removeEventListener('pointerdown', tap);
    document.removeEventListener('mouseleave', leave);
    document.documentElement.style.cursor = prevCursor;
    try { style.remove(); } catch (e) {}
    for (var i = 0; i < ripples.length; i++) { try { ripples[i].remove(); } catch (e) {} }
    ripples = [];
    try { dot.remove(); } catch (e) {}
    window.__carcaraTouch = null;
  }

  document.addEventListener('mousemove', move, { passive: true });
  document.addEventListener('pointerdown', tap, { passive: true });
  // mouseleave em document (não bubbla, mas dispara quando o ponteiro sai da
  // página inteira) — diferente de documentElement, que dispararia a cada saída
  // de um elemento filho.
  document.addEventListener('mouseleave', leave, { passive: true });
  window.__carcaraTouch = { teardown: teardown };
})();`;

export const CLEANUP = `(() => { if (window.__carcaraTouch && window.__carcaraTouch.teardown) window.__carcaraTouch.teardown(); })();`;
