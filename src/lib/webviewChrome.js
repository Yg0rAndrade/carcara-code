// Regras da "chrome de navegador" que o Preview do projeto e o visualizador de HTML
// da aba Código compartilham: tamanho de tela (dispositivo) e zoom da página.
// Tudo função pura / manipulação de estilo, sem React — dá pra testar sem Electron.

import { resolveDevice, fitDevice } from './devices.js';

// Aplica o modo de visualização ao <webview>. Computador: ocupa a área inteira. Aparelho
// (src/lib/devices.js): a página é montada no tamanho REAL do aparelho (largura × altura em
// px CSS) e encolhida com scale() pra caber no painel, centralizada — a moldura
// (DeviceFrame) é desenhada por cima com a mesma geometria (fitDevice). O tamanho do painel
// vem do pai do webview; quem redimensiona o painel chama de novo.
export function applyViewport(w, value, custom) {
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
  const g = fitDevice(dev, box);
  Object.assign(st, {
    width: dev.w + 'px',
    height: dev.h + 'px',
    left: g.screen.x + 'px',
    top: g.screen.y + 'px',
    right: 'auto',
    bottom: 'auto',
    transform: `scale(${g.scale})`,
    transformOrigin: '0 0',
    borderRadius: dev.radius + 'px',
    // O border-radius NÃO recorta a página de dentro do webview (é outro processo): sem o
    // clip-path, as quinas retas da página vazavam por fora dos cantos da moldura.
    clipPath: `inset(0 round ${dev.radius}px)`,
  });
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
