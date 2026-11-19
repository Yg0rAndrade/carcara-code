// Oclusão do Preview (motor 'view'). A WebContentsView desenha POR CIMA de todo o DOM do
// app: um menu, modal, toast ou camada de arraste que cubra o site ficaria ESCONDIDO atrás
// dele. Quando algo do app cobre a área da view, o PreviewPanel troca a view por uma foto
// (capturePage) e a esconde; quando descobre, a view volta.
//
// Como saber se algo cobre, sem cadastrar cada menu do app: teste de clique
// (`document.elementFromPoint`) numa grade de pontos sobre a área da view. A área da view no
// DOM é o painel vazio do Preview; se em algum ponto o elemento do topo NÃO é o painel (nem
// algo dele), tem coisa do app por cima. Pega qualquer menu/modal/popover/toast novo, Radix
// ou feito à mão, sem precisar lembrar de marcar.
//
// Fica de fora (não conta como cobrir):
//  - elementos `pointer-events: none` (o elementFromPoint os atravessa) — decoração;
//  - quem tiver `data-preview-passthrough` (ou estiver dentro de um).
// Conta sempre: arraste de divisória do react-resizable-panels (`data-resize-handle-active`),
// que não põe camada nenhuma por cima mas precisa do mouse passando sobre a view.
// SÓ o valor "pointer" (arraste de verdade). A biblioteca também põe "keyboard" quando a
// divisória só está com FOCO — e clicar nas bolinhas de recolher (que moram dentro dela)
// dá esse foco. Contar "keyboard" deixava o Preview em foto pra sempre (DESAFIOS, 18/11).
const DRAGGING = '[data-resize-handle-active="pointer"]';

// Grade de pontos dentro de `rect` (px CSS), recuada `inset` das bordas, com passo `step`.
// Sempre inclui as quatro bordas (um menu que encosta só na beirada é pego).
export function samplePoints(rect, step = 28, inset = 3) {
  if (!rect || rect.width <= inset * 2 || rect.height <= inset * 2) return [];
  const x0 = rect.x + inset;
  const y0 = rect.y + inset;
  const x1 = rect.x + rect.width - inset;
  const y1 = rect.y + rect.height - inset;
  const axis = (a, b) => {
    const out = [];
    for (let v = a; v < b; v += step) out.push(v);
    out.push(b);
    return out;
  };
  const xs = axis(x0, x1);
  const ys = axis(y0, y1);
  const pts = [];
  for (const y of ys) for (const x of xs) pts.push([x, y]);
  return pts;
}

// true se algum ponto cai num elemento que não é "nosso".
//  hitTest(x, y) → elemento do topo (ou null); isOwn(el) → é o painel/foto do preview.
export function isCovered(points, hitTest, isOwn) {
  return !!findCover(points, hitTest, isOwn);
}

// O primeiro ponto coberto e quem cobre ({ x, y, el }), ou null. Serve pro diagnóstico:
// "o Preview sumiu" quase sempre é um elemento do app encostando na view (DESAFIOS).
export function findCover(points, hitTest, isOwn) {
  for (const [x, y] of points) {
    const el = hitTest(x, y);
    if (el && !isOwn(el)) return { x, y, el };
  }
  return null;
}

// Rótulo curto de um elemento pra log: TAG.classes (cortado) + title, se houver.
export function describeEl(el) {
  if (!el) return '';
  const cls =
    el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className;
  const title = el.getAttribute && el.getAttribute('title');
  return `${el.tagName}.${String(cls || '').slice(0, 80)}${title ? ` [title=${title}]` : ''}`;
}

// Observa o documento e chama onChange(covered) quando muda. Reavalia em qualquer mutação
// do DOM (coalescido por quadro), no resize da janela e num relógio de segurança (animação
// CSS que não muta o DOM). Devolve a função de parar.
//  onChange(covered, info): info diz quem cobre (pra log), null ao descobrir
//  getRects(): retângulos (px CSS) das views à mostra
//  ownRoots(): elementos cujo conteúdo é "do preview" (painel, slot do DevTools)
export function watchOcclusion({ getRects, ownRoots, onChange, doc = document, win = window }) {
  let last = null;
  let raf = 0;
  const isOwn = (el) => {
    if (el.closest && el.closest('[data-preview-passthrough]')) return true;
    for (const root of ownRoots()) if (root && (root === el || root.contains(el))) return true;
    return false;
  };
  const check = () => {
    raf = 0;
    let info = doc.querySelector(DRAGGING) ? 'arrastando divisória' : null;
    if (!info) {
      for (const r of getRects()) {
        const hit = findCover(samplePoints(r), (x, y) => doc.elementFromPoint(x, y), isOwn);
        if (hit) {
          info = `${describeEl(hit.el)} em (${Math.round(hit.x)},${Math.round(hit.y)})`;
          break;
        }
      }
    }
    const covered = !!info;
    if (covered !== last) {
      last = covered;
      onChange(covered, info);
    }
  };
  const schedule = () => {
    if (!raf) raf = win.requestAnimationFrame(check);
  };
  const mo = new win.MutationObserver(schedule);
  mo.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-state', 'open', 'data-resize-handle-active'],
  });
  win.addEventListener('resize', schedule);
  const timer = win.setInterval(schedule, 300);
  schedule();
  return () => {
    mo.disconnect();
    win.removeEventListener('resize', schedule);
    win.clearInterval(timer);
    if (raf) win.cancelAnimationFrame(raf);
  };
}
