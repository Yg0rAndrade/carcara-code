// Bandeiras em SVG inline, indexadas pelo código de idioma (ver src/lib/languages.js).
//
// Por que SVG e não emoji 🇧🇷: o Windows não tem glifos de bandeira na fonte de emoji
// (Segoe UI Emoji) — o par de "regional indicators" renderiza como as duas letras do
// país ("BR", "US"…), não como bandeira. SVG inline resolve isso em qualquer SO, sem
// dependência externa e sem requisição de rede (compatível com o empacotamento offline).
//
// São desenhos SIMPLIFICADOS (proporção 3:2), pensados para ~22px — reconhecíveis, não
// heráldicos. Adicionar um idioma = adicionar seu código ao mapa FLAGS abaixo.

// Pontos de uma estrela de 5 pontas (para CN/VN/TR). rot em graus (0 = ponta pra cima).
function star(cx, cy, ro, rot = 0) {
  const ri = ro * 0.382;
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const ao = ((-90 + rot + i * 72) * Math.PI) / 180;
    pts.push(`${(cx + ro * Math.cos(ao)).toFixed(2)},${(cy + ro * Math.sin(ao)).toFixed(2)}`);
    const ai = ((-90 + rot + 36 + i * 72) * Math.PI) / 180;
    pts.push(`${(cx + ri * Math.cos(ai)).toFixed(2)},${(cy + ri * Math.sin(ai)).toFixed(2)}`);
  }
  return pts.join(' ');
}

const FLAGS = {
  // Brasil
  pt: (
    <>
      <rect width="24" height="16" fill="#009c3b" />
      <path d="M12 2 L22 8 L12 14 L2 8 Z" fill="#ffdf00" />
      <circle cx="12" cy="8" r="3.1" fill="#002776" />
    </>
  ),
  // EUA
  en: (
    <>
      <rect width="24" height="16" fill="#b22234" />
      <rect y="2.3" width="24" height="2.3" fill="#fff" />
      <rect y="6.9" width="24" height="2.3" fill="#fff" />
      <rect y="11.5" width="24" height="2.3" fill="#fff" />
      <rect width="10" height="9.2" fill="#3c3b6e" />
      <g fill="#fff">
        <circle cx="2" cy="2" r=".5" />
        <circle cx="5" cy="2" r=".5" />
        <circle cx="8" cy="2" r=".5" />
        <circle cx="3.5" cy="4.5" r=".5" />
        <circle cx="6.5" cy="4.5" r=".5" />
        <circle cx="2" cy="7" r=".5" />
        <circle cx="5" cy="7" r=".5" />
        <circle cx="8" cy="7" r=".5" />
      </g>
    </>
  ),
  // Espanha
  es: (
    <>
      <rect width="24" height="16" fill="#c60b1e" />
      <rect y="4" width="24" height="8" fill="#ffc400" />
    </>
  ),
  // França
  fr: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#0055a4" />
      <rect x="16" width="8" height="16" fill="#ef4135" />
    </>
  ),
  // Alemanha
  de: (
    <>
      <rect width="24" height="16" fill="#000" />
      <rect y="5.33" width="24" height="5.33" fill="#d00" />
      <rect y="10.66" width="24" height="5.34" fill="#ffce00" />
    </>
  ),
  // Itália
  it: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="8" height="16" fill="#009246" />
      <rect x="16" width="8" height="16" fill="#ce2b37" />
    </>
  ),
  // China
  zh: (
    <>
      <rect width="24" height="16" fill="#de2910" />
      <polygon points={star(5, 5, 3)} fill="#ffde00" />
      <polygon points={star(10, 2, 1)} fill="#ffde00" />
      <polygon points={star(11.5, 4.5, 1)} fill="#ffde00" />
      <polygon points={star(11.5, 7.5, 1)} fill="#ffde00" />
      <polygon points={star(10, 10, 1)} fill="#ffde00" />
    </>
  ),
  // Japão
  ja: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <circle cx="12" cy="8" r="4" fill="#bc002d" />
    </>
  ),
  // Coreia do Sul (taegeuk simplificado)
  ko: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <circle cx="12" cy="8" r="3.2" fill="#cd2e3a" />
      <path
        d="M12 4.8 a3.2 3.2 0 0 1 0 6.4 a1.6 1.6 0 0 1 0-3.2 a1.6 1.6 0 0 0 0-3.2 z"
        fill="#0047a0"
      />
    </>
  ),
  // Tailândia
  th: (
    <>
      <rect width="24" height="16" fill="#a51931" />
      <rect y="2.67" width="24" height="10.66" fill="#f4f5f8" />
      <rect y="5.33" width="24" height="5.33" fill="#2d2a4a" />
    </>
  ),
  // Rússia
  ru: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect y="5.33" width="24" height="5.33" fill="#0039a6" />
      <rect y="10.66" width="24" height="5.34" fill="#d52b1e" />
    </>
  ),
  // Arábia Saudita (simplificado)
  ar: (
    <>
      <rect width="24" height="16" fill="#006c35" />
      <rect x="4" y="6.4" width="16" height="1" rx=".4" fill="#fff" />
      <rect x="5" y="9" width="11" height="1.2" rx=".3" fill="#fff" opacity=".9" />
    </>
  ),
  // Índia
  hi: (
    <>
      <rect width="24" height="16" fill="#ff9933" />
      <rect y="5.33" width="24" height="5.33" fill="#fff" />
      <rect y="10.66" width="24" height="5.34" fill="#138808" />
      <circle cx="12" cy="8" r="1.7" fill="none" stroke="#000080" strokeWidth=".5" />
      <circle cx="12" cy="8" r=".4" fill="#000080" />
    </>
  ),
  // Indonésia
  id: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect width="24" height="8" fill="#e70011" />
    </>
  ),
  // Turquia
  tr: (
    <>
      <rect width="24" height="16" fill="#e30a17" />
      <circle cx="9" cy="8" r="3.4" fill="#fff" />
      <circle cx="10.3" cy="8" r="2.7" fill="#e30a17" />
      <polygon points={star(14.4, 8, 1.7, 20)} fill="#fff" />
    </>
  ),
  // Vietnã
  vi: (
    <>
      <rect width="24" height="16" fill="#da251d" />
      <polygon points={star(12, 8, 4)} fill="#ff0" />
    </>
  ),
  // Países Baixos
  nl: (
    <>
      <rect width="24" height="16" fill="#21468b" />
      <rect width="24" height="10.66" fill="#fff" />
      <rect width="24" height="5.33" fill="#ae1c28" />
    </>
  ),
  // Polônia
  pl: (
    <>
      <rect width="24" height="16" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#dc143c" />
    </>
  ),
};

// Bandeira do idioma `code`. Cai numa bandeira neutra (cinza) se o código for desconhecido.
export function Flag({ code, className }) {
  const inner = FLAGS[code];
  const clipId = `flag-clip-${code}`;
  return (
    <svg
      viewBox="0 0 24 16"
      width="22"
      height="15"
      className={className}
      role="img"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="24" height="16" rx="2.2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{inner || <rect width="24" height="16" fill="#cbd5e1" />}</g>
      <rect width="24" height="16" rx="2.2" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
    </svg>
  );
}
