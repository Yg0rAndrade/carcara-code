// Geometria do "print do preview". Fica fora do componente pra dar pra testar sem
// DOM. Converte o gesto do overlay (arraste do mouse) no retângulo que o main manda
// pro `webContents.capturePage(rect)` — ou `null` quando é pra capturar a tela toda.
//
// Coords de ENTRADA já vêm no espaço LOCAL do <webview> (topo-esquerda do webview =
// 0,0), porque nos modos tablet/celular o webview é centralizado e o topo-esquerda
// dele não coincide com o do container. Quem faz essa conversão é o componente
// (subtraindo o getBoundingClientRect do webview ativo); aqui só tratamos números.

// Arraste menor que isto (em px) vira "clique" → captura a tela toda.
export const CLICK_THRESHOLD = 5;

// startX/startY..endX/endY: coords do mouse relativas ao topo-esquerda do webview.
// bounds: { width, height } do webview (pra fazer clamp e não vazar pra fora).
// Retorna { x, y, width, height } inteiros, ou null (= tela toda / seleção inválida).
export function rectFromDrag(startX, startY, endX, endY, bounds) {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  if (dx < CLICK_THRESHOLD && dy < CLICK_THRESHOLD) return null; // clique = tela toda

  // Normaliza: aceita arraste em qualquer direção (canto superior-esquerdo primeiro).
  let x = Math.min(startX, endX);
  let y = Math.min(startY, endY);
  let w = dx;
  let h = dy;

  // Clamp aos limites do webview (recorte sobre a calha cinza dos modos tablet/celular
  // é cortado pro dentro do site).
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (bounds) {
    if (x + w > bounds.width) w = bounds.width - x;
    if (y + h > bounds.height) h = bounds.height - y;
  }

  if (w < 1 || h < 1) return null; // seleção degenerada (só na calha, p.ex.)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
