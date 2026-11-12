// Cores dos botões nativos da janela (overlay da barra de título). O Electron precisa de
// uma cor OPACA: com transparência o Windows pinta o fundo dos botões por conta própria
// (branco). Mesmo cuidado do VS Code (`makeOpaque` no titlebarPart): compõe a cor da barra
// sobre o fundo da página e manda em hex.

// "rgb(1, 2, 3)" / "rgba(1, 2, 3, 0.5)" / "rgb(1 2 3 / 50%)" -> { r, g, b, a } ou null.
export function parseCssColor(str) {
  const m =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(
      String(str || '').trim(),
    );
  if (!m) return null;
  let a = m[4] == null ? 1 : Number(m[4]);
  if (m[5] === '%') a /= 100;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Math.max(0, Math.min(1, a)) };
}

const hex2 = (n) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

// Cor (possivelmente translúcida) composta sobre `behind` (opaca) -> "#rrggbb", ou null.
export function toOpaqueHex(color, behind = 'rgb(255, 255, 255)') {
  const c = parseCssColor(color);
  if (!c) return null;
  const base = parseCssColor(behind) || { r: 255, g: 255, b: 255, a: 1 };
  const mix = (k) => c[k] * c.a + base[k] * (1 - c.a);
  return '#' + hex2(mix('r')) + hex2(mix('g')) + hex2(mix('b'));
}
