// Catálogo de aparelhos do Preview (modo dispositivo) e a conta de encaixe da moldura.
// Tamanhos = viewport CSS de cada aparelho (o que o site "enxerga": largura × altura em px
// CSS, não a resolução física).
// A moldura é desenhada pelo app (DeviceFrame) a partir de `frame` — sem imagens de
// terceiros. Tudo aqui é puro (sem DOM), testado em devices.test.js.

// Medidas: tela CSS de cada aparelho (largura × altura em px CSS), dados públicos de ficha
// técnica. Só aparelhos do Galaxy S20 e do iPhone 11 pra frente, e sem Huawei.
// cutout: 'island' (ilha dinâmica) | 'notch' | 'punch' (furinho) | 'drop' (gota) | 'none'.
// radius = canto da TELA em px CSS. Um modelo por item (mesmo quando a medida se repete),
// pra pessoa achar o aparelho que ela tem pelo nome.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\+/g, '-plus')
    .replace(/[()"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const M = (names, w, h, cutout, radius = 36) =>
  names.map((name) => ({ id: slug(name), name, w, h, cutout, radius }));

export const DEVICE_GROUPS = [
  {
    id: 'android',
    devices: [
      ...M(['Galaxy S26 Ultra'], 412, 891, 'punch', 18),
      ...M(['Galaxy S24 Ultra'], 384, 832, 'punch', 18),
      ...M(['Galaxy S24', 'Galaxy S22', 'Galaxy S22+'], 360, 780, 'punch', 34),
      ...M(['Galaxy S22 Ultra'], 360, 772, 'punch', 18),
      ...M(['Galaxy S21', 'Galaxy S21+', 'Galaxy S21 Ultra', 'Galaxy S20'], 360, 800, 'punch', 30),
      ...M(['Galaxy S20 Ultra', 'Galaxy Note20'], 412, 915, 'punch', 26),
      ...M(['Galaxy Note20 Ultra'], 412, 883, 'punch', 16),
      ...M(['Galaxy A17'], 412, 892, 'drop', 30),
      ...M(['Galaxy A12'], 360, 800, 'drop', 28),
      ...M(['Galaxy Z Flip3'], 360, 880, 'punch', 30),
      ...M(['Galaxy Z Fold8 (fechado)'], 416, 657, 'punch', 22),
      ...M(['Galaxy Z Fold8 (aberto)'], 816, 616, 'punch', 18),
      ...M(['Pixel 11 Pro XL'], 448, 997, 'punch', 40),
      ...M(['Pixel 11 Pro'], 410, 914, 'punch', 40),
      ...M(['Pixel 10 Pro'], 410, 912, 'punch', 40),
      ...M(['Pixel 10'], 412, 924, 'punch', 40),
      ...M(['Pixel 10 Pro Fold (fechado)'], 412, 901, 'punch', 30),
      ...M(['Pixel 8'], 412, 915, 'punch', 36),
      ...M(['Pixel 6 Pro'], 360, 780, 'punch', 30),
      ...M(['Pixel 5'], 393, 851, 'punch', 30),
      ...M(['Xiaomi 17T Pro'], 427, 924, 'punch', 32),
      ...M(['Xiaomi 17T'], 423, 919, 'punch', 32),
      ...M(['Xiaomi 17 Ultra'], 400, 869, 'punch', 32),
      ...M(['Xiaomi 17'], 406, 885, 'punch', 32),
      ...M(['Redmi Note 17'], 393, 871, 'punch', 30),
      ...M(['Xiaomi 12', 'Xiaomi Mi 11i'], 360, 800, 'punch', 30),
      ...M(['Motorola Moto G87'], 424, 924, 'punch', 30),
      ...M(['Motorola Razr 70 Ultra (aberto)'], 412, 1008, 'punch', 30),
      ...M(['OnePlus Nord', 'OnePlus Nord 2'], 412, 915, 'punch', 30),
    ],
  },
  {
    id: 'apple',
    devices: [
      ...M(['iPhone 18 Pro Max', 'iPhone 17 Pro Max', 'iPhone 16 Pro Max'], 440, 956, 'island', 55),
      ...M(['iPhone 18 Pro', 'iPhone 17 Pro'], 402, 873, 'island', 55),
      ...M(['iPhone 17'], 402, 874, 'island', 55),
      ...M(['iPhone Air'], 420, 912, 'island', 55),
      ...M(['iPhone Duo (fechado)'], 466, 678, 'island', 40),
      ...M(['iPhone Duo (aberto)'], 890, 626, 'none', 30),
      ...M(['iPhone 16 Plus', 'iPhone 15 Pro Max', 'iPhone 15 Plus'], 430, 932, 'island', 55),
      ...M(['iPhone 16', 'iPhone 15 Pro', 'iPhone 15'], 393, 852, 'island', 55),
      ...M(['iPhone 14 Pro Max'], 428, 928, 'island', 55),
      ...M(['iPhone 14 Pro'], 390, 844, 'island', 55),
      ...M(
        ['iPhone 14', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 12', 'iPhone 12 Pro'],
        390,
        844,
        'notch',
        47,
      ),
      ...M(['iPhone 14 Plus', 'iPhone 13 Pro Max', 'iPhone 12 Pro Max'], 428, 926, 'notch', 47),
      ...M(['iPhone 13 mini', 'iPhone 11 Pro'], 375, 812, 'notch', 44),
      ...M(['iPhone 12 mini'], 360, 780, 'notch', 44),
      ...M(['iPhone 11', 'iPhone 11 Pro Max'], 414, 896, 'notch', 41),
    ],
  },
];

export const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) =>
  g.devices.map((d) => ({ ...d, group: g.id })),
);

// Barras do sistema que ficam FORA da área do site: em cima a barra de status (hora,
// sinal, Wi-Fi, bateria) e embaixo o indicador de gestos. O site enxerga só o miolo — é
// isso que o 100vh e o env(safe-area) de verdade dão num celular. Personalizado não tem.
export function chromeOf(dev) {
  if (dev.group === 'custom') return { top: 0, bottom: 0 };
  if (dev.group === 'apple') {
    if (dev.cutout === 'island') return { top: 54, bottom: 34 };
    if (dev.cutout === 'notch') return { top: 47, bottom: 34 };
    return { top: 24, bottom: 20 };
  }
  return { top: 28, bottom: 20 };
}

// Valores antigos do seletor (só 3 modos) → aparelho equivalente de hoje.
// Aparelho que o "Celular" abre quando ainda não há escolha salva.
export const DEFAULT_PHONE = 'iphone-17-pro';
const LEGACY = { mobile: DEFAULT_PHONE, tablet: DEFAULT_PHONE };

export const CUSTOM_MIN = 200;
export const CUSTOM_MAX = 3000;
export const DEFAULT_CUSTOM = { w: 390, h: 844 };

export function normalizeViewport(value) {
  if (!value || value === 'desktop') return 'desktop';
  if (LEGACY[value]) return LEGACY[value];
  if (value === 'custom' || ALL_DEVICES.some((d) => d.id === value)) return value;
  return 'desktop';
}

export function clampCustom(size) {
  const c = (n, d) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) ? Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, v)) : d;
  };
  return { w: c(size?.w, DEFAULT_CUSTOM.w), h: c(size?.h, DEFAULT_CUSTOM.h) };
}

// Aparelho a desenhar, ou null (computador = ocupa tudo, sem moldura).
export function resolveDevice(value, custom) {
  const v = normalizeViewport(value);
  if (v === 'desktop') return null;
  if (v === 'custom') {
    const { w, h } = clampCustom(custom);
    return { id: 'custom', name: null, w, h, cutout: 'none', radius: 12, group: 'custom' };
  }
  return ALL_DEVICES.find((d) => d.id === v) || null;
}

// Espessura da moldura (px CSS do aparelho, antes da escala).
export function bezelOf(dev) {
  if (dev.group === 'custom') return { side: 8, top: 8, bottom: 8 };
  return { side: 12, top: 12, bottom: 12 };
}

const PAD = 24; // respiro em volta do aparelho no painel
const LABEL = 30; // espaço reservado embaixo pro nome + medidas

// Encaixa o aparelho no painel (box = { width, height } em px): escala pra caber a altura
// E a largura (nunca aumenta além de 100%), centralizado. Devolve a geometria da TELA
// (onde o <webview> fica) e da moldura, já em px do painel.
export function fitDevice(dev, box) {
  const b = bezelOf(dev);
  const c = chromeOf(dev);
  const outerW = dev.w + b.side * 2;
  const outerH = dev.h + b.top + b.bottom;
  const availW = Math.max(1, box.width - PAD * 2);
  const availH = Math.max(1, box.height - PAD * 2 - LABEL);
  const scale = Math.min(1, availW / outerW, availH / outerH);
  const frameW = outerW * scale;
  const frameH = outerH * scale;
  const frameX = (box.width - frameW) / 2;
  const frameY = Math.max(PAD, (box.height - LABEL - frameH) / 2);
  return {
    scale,
    frame: { x: frameX, y: frameY, w: frameW, h: frameH },
    screen: {
      x: frameX + b.side * scale,
      y: frameY + b.top * scale,
      w: dev.w * scale,
      h: dev.h * scale,
    },
    bezel: { side: b.side * scale, top: b.top * scale, bottom: b.bottom * scale },
    // Onde o site fica: a tela menos as barras do sistema (chromeOf).
    page: {
      x: frameX + b.side * scale,
      y: frameY + (b.top + c.top) * scale,
      w: dev.w * scale,
      h: (dev.h - c.top - c.bottom) * scale,
    },
    chrome: { top: c.top * scale, bottom: c.bottom * scale },
    viewport: { w: dev.w, h: dev.h - c.top - c.bottom },
  };
}

// Último aparelho escolhido (o "Celular" do seletor reabre nele). Guardado no aparelho.
const LAST_KEY = 'previewLastDevice';

export function lastDevice() {
  try {
    const v = normalizeViewport(localStorage.getItem(LAST_KEY));
    return v === 'desktop' ? DEFAULT_PHONE : v;
  } catch {
    return DEFAULT_PHONE;
  }
}
export function rememberDevice(v) {
  if (normalizeViewport(v) === 'desktop') return;
  try {
    localStorage.setItem(LAST_KEY, v);
  } catch {}
}
