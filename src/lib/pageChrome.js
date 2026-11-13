// Cores da "pele" do celular no Preview: num iPhone/Android de verdade a barra de status
// (hora, sinal, bateria) pega a cor do topo do site, e a barra de baixo a do rodapé visível.
// O Preview lê isso da página de tempos em tempos (PAGE_CHROME_SCRIPT, roda DENTRO do
// webview) e o DeviceFrame pinta as barras. Também traz o scroll (a barra do Safari encolhe
// quando a página rola) e o host (escrito na barra de endereço).

// Roda na página. Como o Safari 26 e o Chrome: a barra estende a cor do que está no topo
// da tela (o header, um aviso...). Cor translúcida é misturada com o que está atrás dela,
// subindo pelos pais até um fundo opaco (ou o branco da página). <meta theme-color> só
// entra se não der pra ler nada.
export const PAGE_CHROME_SCRIPT = `(() => {
  const parse = (c) => {
    const m = /rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(c || '');
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  };
  const colorAt = (x, y) => {
    let el = document.elementFromPoint(x, y);
    const layers = [];
    while (el) {
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
      el = el.parentElement;
    }
    if (!layers.length) return null;
    let out = layers[layers.length - 1][3] >= 1 ? layers.pop() : [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a), 1];
    }
    return 'rgb(' + out.slice(0, 3).map(Math.round).join(',') + ')';
  };
  const meta = document.querySelector('meta[name="theme-color"]');
  const x = Math.round(innerWidth / 2);
  const top = colorAt(x, 1) || (meta && meta.content) || '#ffffff';
  const bottom = colorAt(x, innerHeight - 2) || top;
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
