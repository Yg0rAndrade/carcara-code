// Catálogo de aparelhos do Preview (modo dispositivo) e a conta de encaixe da moldura.
// Tamanhos = viewport CSS de cada aparelho (o que o site "enxerga": largura × altura em px
// CSS, não a resolução física). Aparelhos com o mesmo viewport dividem uma entrada só.
// A moldura é desenhada pelo app (DeviceFrame) a partir de `frame` — sem imagens de
// terceiros. Tudo aqui é puro (sem DOM), testado em devices.test.js.

// Medidas: viewport CSS de cada aparelho conforme webmobilefirst.com/pt-br/devices (13/11/2026).
// Só aparelhos do Galaxy S20 e do iPhone 11 pra frente (os mais antigos não fazem mais
// sentido testar), e sem Huawei.
// cutout: 'island' (ilha dinâmica) | 'notch' | 'punch' (furinho) | 'drop' (gota) | 'none'.
// radius = canto da TELA em px CSS.
const P = (id, name, w, h, cutout, radius = 36) => ({ id, name, w, h, cutout, radius });

export const DEVICE_GROUPS = [
  {
    id: 'android',
    devices: [
      P('galaxy-s26-ultra', 'Galaxy S26 Ultra', 412, 891, 'punch', 18),
      P('galaxy-s24-ultra', 'Galaxy S24 Ultra', 384, 832, 'punch', 18),
      P('galaxy-s24', 'Galaxy S24 / S22 / S22+', 360, 780, 'punch', 34),
      P('galaxy-s22-ultra', 'Galaxy S22 Ultra', 360, 772, 'punch', 18),
      P('galaxy-s21', 'Galaxy S20 / S21 / S21+ / S21 Ultra', 360, 800, 'punch', 30),
      P('galaxy-s20-ultra', 'Galaxy S20 Ultra / Note20', 412, 915, 'punch', 26),
      P('galaxy-note20-ultra', 'Galaxy Note20 Ultra', 412, 883, 'punch', 16),
      P('galaxy-a17', 'Galaxy A17', 412, 892, 'drop', 30),
      P('galaxy-a12', 'Galaxy A12', 360, 800, 'drop', 28),
      P('galaxy-z-flip3', 'Galaxy Z Flip3', 360, 880, 'punch', 30),
      P('galaxy-z-fold8-closed', 'Galaxy Z Fold8 (fechado)', 416, 657, 'punch', 22),
      P('galaxy-z-fold8-open', 'Galaxy Z Fold8 (aberto)', 816, 616, 'punch', 18),
      P('pixel-11-pro-xl', 'Pixel 11 Pro XL', 448, 997, 'punch', 40),
      P('pixel-11-pro', 'Pixel 11 Pro', 410, 914, 'punch', 40),
      P('pixel-10-pro', 'Pixel 10 Pro', 410, 912, 'punch', 40),
      P('pixel-10', 'Pixel 10', 412, 924, 'punch', 40),
      P('pixel-10-pro-fold', 'Pixel 10 Pro Fold (fechado)', 412, 901, 'punch', 30),
      P('pixel-8', 'Pixel 8', 412, 915, 'punch', 36),
      P('pixel-6-pro', 'Pixel 6 Pro', 360, 780, 'punch', 30),
      P('pixel-5', 'Pixel 5', 393, 851, 'punch', 30),
      P('xiaomi-17t-pro', 'Xiaomi 17T Pro', 427, 924, 'punch', 32),
      P('xiaomi-17t', 'Xiaomi 17T', 423, 919, 'punch', 32),
      P('xiaomi-17-ultra', 'Xiaomi 17 Ultra', 400, 869, 'punch', 32),
      P('xiaomi-17', 'Xiaomi 17', 406, 885, 'punch', 32),
      P('redmi-note-17', 'Redmi Note 17', 393, 871, 'punch', 30),
      P('xiaomi-12', 'Xiaomi 12 / Mi 11i', 360, 800, 'punch', 30),
      P('moto-g87', 'Motorola Moto G87', 424, 924, 'punch', 30),
      P('moto-razr-70-ultra', 'Motorola Razr 70 Ultra (aberto)', 412, 1008, 'punch', 30),
      P('oneplus-nord', 'OnePlus Nord / Nord 2', 412, 915, 'punch', 30),
    ],
  },
  {
    id: 'apple',
    devices: [
      P('iphone-17-pro-max', 'iPhone 16 Pro Max / 17 Pro Max / 18 Pro Max', 440, 956, 'island', 55),
      P('iphone-17-pro', 'iPhone 17 Pro / 18 Pro', 402, 873, 'island', 55),
      P('iphone-17', 'iPhone 17', 402, 874, 'island', 55),
      P('iphone-air', 'iPhone Air', 420, 912, 'island', 55),
      P('iphone-duo-closed', 'iPhone Duo (fechado)', 466, 678, 'island', 40),
      P('iphone-duo-open', 'iPhone Duo (aberto)', 890, 626, 'none', 30),
      P('iphone-15-plus', 'iPhone 15 Plus / 15 Pro Max / 16 Plus', 430, 932, 'island', 55),
      P('iphone-15', 'iPhone 15 / 15 Pro / 16', 393, 852, 'island', 55),
      P('iphone-14-pro-max', 'iPhone 14 Pro Max', 428, 928, 'island', 55),
      P('iphone-14-pro', 'iPhone 14 Pro', 390, 844, 'island', 55),
      P('iphone-14', 'iPhone 12 / 13 / 14 (e 12 Pro / 13 Pro)', 390, 844, 'notch', 47),
      P('iphone-14-plus', 'iPhone 12 Pro Max / 13 Pro Max / 14 Plus', 428, 926, 'notch', 47),
      P('iphone-11', 'iPhone 11 / 11 Pro Max', 414, 896, 'notch', 41),
      P('iphone-13-mini', 'iPhone 11 Pro / 13 mini', 375, 812, 'notch', 44),
      P('iphone-12-mini', 'iPhone 12 mini', 360, 780, 'notch', 44),
    ],
  },
  {
    id: 'tablet',
    devices: [
      P('ipad-mini', 'iPad mini', 768, 1024, 'none', 20),
      P('ipad-air', 'iPad (A16) / iPad Air', 820, 1180, 'none', 18),
      P('ipad-pro-11', 'iPad Pro 11"', 834, 1194, 'none', 18),
      P('ipad-pro-13', 'iPad Pro 12.9"', 1024, 1366, 'none', 18),
      P('galaxy-tab-s7', 'Galaxy Tab S7', 800, 1280, 'none', 16),
    ],
  },
];

export const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) =>
  g.devices.map((d) => ({ ...d, group: g.id })),
);

// Valores antigos do seletor (só 3 modos) → aparelho equivalente de hoje.
const LEGACY = { mobile: 'iphone-15', tablet: 'ipad-air' };

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
  if (dev.group === 'tablet') return { side: 18, top: 18, bottom: 18 };
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
  };
}
