// Cores da "pele" do celular no Preview: num iPhone/Android de verdade a barra de status
// (hora, sinal, bateria) pega a cor do topo do site, e a barra de baixo a do rodapé visível.
// O Preview lê isso da página de tempos em tempos (PAGE_CHROME_SCRIPT, roda DENTRO do
// webview) e o DeviceFrame pinta as barras. Também traz o scroll (a barra do Safari encolhe
// quando a página rola) e o host (escrito na barra de endereço).

// Roda na página. Ordem igual à do Safari: <meta name="theme-color"> vence; sem ela, a cor
// de fundo do que está no topo da tela (sobe pelos pais até achar uma cor não transparente).
export const PAGE_CHROME_SCRIPT = `(() => {
  const solid = (c) => c && c !== 'transparent' && !/rgba\\([^)]*,\\s*0\\)$/.test(c);
  const bgAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      if (solid(c)) return c;
      el = el.parentElement;
    }
    return null;
  };
  const body = getComputedStyle(document.body || document.documentElement).backgroundColor;
  const meta = document.querySelector('meta[name="theme-color"]');
  const x = Math.round(innerWidth / 2);
  const top = (meta && meta.content) || bgAt(x, 1) || (solid(body) ? body : '#ffffff');
  const bottom = bgAt(x, innerHeight - 2) || (solid(body) ? body : '#ffffff');
  return { top, bottom, y: scrollY, host: location.host };
})()`;

// Cor CSS qualquer (hex, rgb, nome) → [r, g, b], resolvida pelo próprio navegador.
let probe = null;
export function toRgb(color) {
  if (typeof document === 'undefined' || !color) return null;
  if (!probe) {
    probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);
  }
  probe.style.color = '';
  probe.style.color = color;
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(getComputedStyle(probe).color);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// Fundo claro? (luminância relativa) → ícones escuros por cima, como o iOS faz.
export function isLightRgb(rgb) {
  if (!rgb) return false;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}
