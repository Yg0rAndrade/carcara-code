// Regras da "chrome de navegador" que o Preview do projeto e o visualizador de HTML
// da aba Código compartilham: tamanho de tela (dispositivo) e zoom da página.
// Tudo função pura / manipulação de estilo, sem React — dá pra testar sem Electron.

import { resolveDevice, fitDevice } from './devices.js';

// Aplica o modo de visualização ao <webview>. Computador: ocupa a área inteira. Aparelho
// (src/lib/devices.js): a página é montada no tamanho REAL do aparelho (largura × altura em
// px CSS) e encolhida com scale() pra caber no painel, centralizada — a moldura
// (DeviceFrame) é desenhada por cima com a mesma geometria (fitDevice). O tamanho do painel
// vem do pai do webview; quem redimensiona o painel chama de novo.
// opts.expanded: barra do Safari grande (topo da página) ou compacta (rolou).
export function applyViewport(w, value, custom, opts) {
  const dev = resolveDevice(value, custom);
  const st = w.style;
  if (!dev) {
    Object.assign(st, {
      width: '100%',
      height: '100%',
      left: '0',
      top: '0',
      right: '0',
      bottom: '0',
      transform: 'none',
      transformOrigin: '',
      borderRadius: '',
      clipPath: '',
    });
    return;
  }
  const parent = w.parentElement;
  const box = parent
    ? { width: parent.clientWidth, height: parent.clientHeight }
    : { width: dev.w, height: dev.h };
  const g = fitDevice(dev, box, opts);
  // A página é um retângulo, mas a tela do aparelho tem cantos arredondados: onde a barra
  // de cima/baixo é mais baixa que o raio do canto (Android), a quina da página ficava
  // pra fora da curva da moldura ("garrinhas"). Recorta só o que sobra do raio em cada
  // ponta. O border-radius não serve: não recorta a página de dentro do webview.
  const rTop = Math.max(0, dev.radius - g.chromeRaw.top);
  const rBot = Math.max(0, dev.radius - g.chromeRaw.bottom);
  const round = rTop || rBot ? `inset(0 round ${rTop}px ${rTop}px ${rBot}px ${rBot}px)` : '';
  Object.assign(st, {
    width: g.viewport.w + 'px',
    height: g.viewport.h + 'px',
    left: g.page.x + 'px',
    top: g.page.y + 'px',
    right: 'auto',
    bottom: 'auto',
    transform: `scale(${g.scale})`,
    transformOrigin: '0 0',
    borderRadius: '',
    clipPath: round,
  });
}

// Mesmo encaixe do applyViewport, mas pro motor 'view' (WebContentsView): não existe CSS
// numa view, então a conta vira DADOS que o main aplica.
//  - bounds: retângulo da view em DIP da janela (px CSS do app × zoom do app).
//  - emulation: parâmetros do `webContents.enableDeviceEmulation` (null = computador).
//    É o mecanismo do device mode do Chrome: o site é montado no tamanho real do
//    aparelho (viewSize) e encolhido por `scale` pra caber nos bounds. Medido no Electron
//    33: 195×400 DIP com scale 0,5 → `innerWidth` 390 no site.
//  - radius: canto arredondado da view (o que o clip-path fazia no <webview>). A view só
//    aceita UM raio; usa o maior dos dois, já que a quina reta fica sob a barra do sistema.
// box = { x, y, width, height } do painel em px CSS do app (getBoundingClientRect).
export function viewGeometry(box, value, custom, opts = {}) {
  const zoom = Number.isFinite(opts.zoom) && opts.zoom > 0 ? opts.zoom : 1;
  const z = (r) => ({
    x: r.x * zoom,
    y: r.y * zoom,
    width: r.width * zoom,
    height: r.height * zoom,
  });
  const dev = resolveDevice(value, custom);
  if (!dev || !box) {
    return { bounds: box ? z(box) : null, emulation: null, radius: 0 };
  }
  const g = fitDevice(dev, { width: box.width, height: box.height }, opts);
  const rTop = Math.max(0, dev.radius - g.chromeRaw.top);
  const rBot = Math.max(0, dev.radius - g.chromeRaw.bottom);
  return {
    bounds: z({ x: box.x + g.page.x, y: box.y + g.page.y, width: g.page.w, height: g.page.h }),
    emulation: {
      screenPosition: 'mobile',
      screenSize: { width: dev.w, height: dev.h },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 0,
      viewSize: { width: g.viewport.w, height: g.viewport.h },
      scale: g.scale * zoom,
    },
    radius: Math.max(rTop, rBot) * g.scale * zoom,
  };
}

// Zoom da PÁGINA (não da janela do app). Mesmos passos e limites do atalho
// Ctrl +/-/0 tratado no main pra qualquer webview (ver main.js), pra que botão e
// teclado nunca discordem. No Chromium, fator = 1.2 ^ nível.
export const ZOOM_MIN = -3;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.5;

// dir: +1 aumenta, -1 diminui, 0 volta pro 100%.
export function stepZoom(level, dir) {
  const cur = Number.isFinite(level) ? level : 0;
  if (!dir) return 0;
  const next = cur + (dir > 0 ? ZOOM_STEP : -ZOOM_STEP);
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
}

// Rótulo do botão do meio ("100%"): nível → porcentagem inteira.
export function zoomPercent(level) {
  const cur = Number.isFinite(level) ? level : 0;
  return Math.round(Math.pow(1.2, cur) * 100);
}
