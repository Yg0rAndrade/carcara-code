// Regras da "chrome de navegador" que o Preview do projeto e o visualizador de HTML
// da aba Código compartilham: tamanho de tela (dispositivo) e zoom da página.
// Tudo função pura / manipulação de estilo, sem React — dá pra testar sem Electron.

// Larguras dos modos de visualização. `null` = desktop (ocupa tudo). Os demais
// fixam a largura e centralizam o webview, simulando tablet/celular pra testar
// o layout responsivo sem precisar redimensionar a janela toda.
export const VIEWPORTS = { desktop: null, tablet: 820, mobile: 390 };

// Aplica o modo de visualização ao <webview>: no desktop ele volta a ocupar a
// área inteira; nos outros vira uma "moldura" centralizada de largura fixa.
export function applyViewport(w, vp) {
  const width = VIEWPORTS[vp];
  if (!width) {
    w.style.width = '100%';
    w.style.left = '0';
    w.style.right = '0';
    w.style.transform = 'none';
  } else {
    // Largura fixa e centralizado. Sem borda/sombra: a calha cinza ao redor já
    // separa o "dispositivo" do fundo (mesma ideia do Lovable), e o site fica limpo.
    w.style.width = width + 'px';
    w.style.left = '50%';
    w.style.right = 'auto';
    w.style.transform = 'translateX(-50%)';
  }
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
