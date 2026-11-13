// Ícones da barra de status do celular, desenhados aqui (SVG próprio) no formato de cada
// sistema — não são os do lucide, que não se parecem com os de um aparelho:
// - iOS: 4 barrinhas de sinal crescendo, Wi-Fi em leque, bateria horizontal com tampinha.
// - Android (Material): sinal em triângulo, Wi-Fi em leque cheio, bateria em pé.
// Todos em currentColor; `h` = altura em px (já na escala do aparelho).

export function IosSignal({ h }) {
  return (
    <svg viewBox="0 0 18 12" style={{ height: h, width: (h * 18) / 12 }} fill="currentColor">
      <rect x="0" y="7.5" width="3" height="4.5" rx="1" />
      <rect x="5" y="5" width="3" height="7" rx="1" />
      <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

export function IosWifi({ h }) {
  return (
    <svg viewBox="0 0 16 12" style={{ height: h, width: (h * 16) / 12 }} fill="currentColor">
      <path d="M8 2.6c2.4 0 4.6.9 6.3 2.5l1.2-1.2C13.5 1.9 10.9.9 8 .9S2.5 1.9.5 3.9l1.2 1.2C3.4 3.5 5.6 2.6 8 2.6z" />
      <path d="M8 5.9c1.5 0 2.9.6 3.9 1.5l1.2-1.2C11.8 5 10 4.2 8 4.2S4.2 5 2.9 6.2l1.2 1.2C5.1 6.5 6.5 5.9 8 5.9z" />
      <path d="M8 9.2c.6 0 1.2.2 1.6.6L8 11.5 6.4 9.8c.4-.4 1-.6 1.6-.6z" />
    </svg>
  );
}

export function IosBattery({ h }) {
  return (
    <svg viewBox="0 0 27 13" style={{ height: h, width: (h * 27) / 13 }} fill="currentColor">
      <rect
        x="0.5"
        y="0.5"
        width="23"
        height="12"
        rx="3.5"
        fill="none"
        stroke="currentColor"
        opacity="0.4"
      />
      <rect x="2" y="2" width="20" height="9" rx="2" />
      <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" opacity="0.4" />
    </svg>
  );
}

export function AndroidWifi({ h }) {
  return (
    <svg viewBox="0 0 24 24" style={{ height: h, width: h }} fill="currentColor">
      <path d="M12 21 .5 8.5C3.6 5.4 7.6 3.8 12 3.8s8.4 1.6 11.5 4.7L12 21z" />
    </svg>
  );
}

export function AndroidSignal({ h }) {
  return (
    <svg viewBox="0 0 24 24" style={{ height: h, width: h }} fill="currentColor">
      <path d="M2 22h20V2L2 22z" />
    </svg>
  );
}

export function AndroidBattery({ h }) {
  return (
    <svg viewBox="0 0 24 24" style={{ height: h, width: h }} fill="currentColor">
      <path d="M15.7 4H14V2h-4v2H8.3C7.6 4 7 4.6 7 5.3v15.3c0 .8.6 1.4 1.3 1.4h7.3c.8 0 1.4-.6 1.4-1.3V5.3C17 4.6 16.4 4 15.7 4z" />
    </svg>
  );
}
