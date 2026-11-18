// Recorte do print, rodando DENTRO da página do preview (mesmo padrão do grabScript).
//
// Por que dentro da página: com o motor WebContentsView, a view do site desenha por cima de
// TODO o DOM do app, então a camada de recorte do app não aparece sobre o site. Dentro da
// página ela aparece, e de quebra a rodinha rola o site de verdade (antes era repassada na
// mão com sendInputEvent).
//
// Protocolo (console, filtrado no main por isBridgeMessage):
//   CROP_SENTINEL + {x,y,width,height,iw}  retângulo em px CSS da página + innerWidth
//   CROP_CANCEL                            Esc, ou arraste vazio
// A camada sai da página ANTES de avisar (2 quadros), pra não entrar na foto.

export const CROP_SENTINEL = '__CARCARA_CROP__';
export const CROP_CANCEL = '__CARCARA_CROP_CANCEL__';

// Retângulo da página (px CSS) → retângulo de captura (DIP da superfície). `dipWidth` é a
// largura da superfície em DIP; `iw` é o innerWidth que a página reportou. A razão cobre o
// zoom do site (Ctrl +/-), o zoom do app e a escala do aparelho de uma vez.
export function cropToCapture(r, dipWidth) {
  if (!r || !(r.iw > 0) || !(dipWidth > 0)) return null;
  const k = dipWidth / r.iw;
  const x = Math.max(0, Math.round(r.x * k));
  const y = Math.max(0, Math.round(r.y * k));
  const width = Math.round(r.width * k);
  const height = Math.round(r.height * k);
  if (width < 2 || height < 2) return null;
  return { x, y, width, height };
}

export function cropInject(hint) {
  return `(function(){
  if (window.__carcaraCrop) return;
  var HINT = ${JSON.stringify(String(hint || ''))};
  var root = document.createElement('div');
  root.setAttribute('data-carcara-crop', '');
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;' +
    'box-shadow:inset 0 0 0 3px #f2792b;background:transparent;user-select:none;';
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;display:none;border:2px solid #f2792b;' +
    'background:rgba(242,121,43,.18);pointer-events:none;';
  var pill = document.createElement('div');
  pill.textContent = HINT;
  pill.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);' +
    'padding:6px 12px;border-radius:999px;background:rgba(20,20,22,.88);color:#fff;' +
    'font:500 12px system-ui,sans-serif;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  root.appendChild(box);
  if (HINT) root.appendChild(pill);
  var start = null;
  function rect(e){
    var x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
    return { x: x, y: y, width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) };
  }
  function teardown(){
    window.__carcaraCrop = null;
    root.remove();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function emitAfterPaint(msg){
    teardown();
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ console.log(msg); }); });
  }
  function onDown(e){
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    start = { x: e.clientX, y: e.clientY };
    box.style.display = 'block';
    box.style.left = start.x + 'px'; box.style.top = start.y + 'px';
    box.style.width = '0px'; box.style.height = '0px';
    pill.style.display = 'none';
  }
  function onMove(e){
    if (!start) return;
    var r = rect(e);
    box.style.left = r.x + 'px'; box.style.top = r.y + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  }
  function onUp(e){
    if (!start) return;
    e.preventDefault(); e.stopPropagation();
    var r = rect(e); start = null;
    if (r.width < 3 || r.height < 3) { emitAfterPaint('${CROP_CANCEL}'); return; }
    r.iw = window.innerWidth;
    emitAfterPaint('${CROP_SENTINEL}' + JSON.stringify(r));
  }
  function onKey(e){
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); emitAfterPaint('${CROP_CANCEL}'); }
  }
  root.addEventListener('mousedown', onDown, true);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  document.addEventListener('keydown', onKey, true);
  (document.body || document.documentElement).appendChild(root);
  window.__carcaraCrop = { teardown: teardown };
})();`;
}

// Sai do modo recorte sem avisar (o app já sabe: trocou de aba, Esc no app, etc.).
export const CROP_CLEANUP = `(function(){ var c = window.__carcaraCrop; if (c) c.teardown(); })();`;
