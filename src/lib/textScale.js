import { useEffect, useState } from 'react';

// Tamanho do TEXTO do app, separado do zoom: o zoom aumenta tudo (ícones, espaçamentos,
// botões); isto aumenta só a letra. Assim dá pra ficar com a tela em 100% e ler maior.
//
// Como chega em cada lugar:
// - Classes `text-*` do Tailwind: o plugin em tailwind.config.cjs multiplica o tamanho
//   por `var(--text-scale)`, que `applyTextScale` põe no <html>.
// - Editores CodeMirror: o tema usa `calc(… * var(--text-scale, 1))`.
// - Terminais (xterm) e árvore de arquivos: precisam de número, então leem `scaledPx`
//   e reagem ao evento 'ygc:textscale'.
export const TEXT_SCALE_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.4];
const KEY = 'appTextScale';

export function readTextScale() {
  let v = 1;
  try {
    v = Number(localStorage.getItem(KEY)) || 1; // vazio -> 0 -> 1 (padrão)
  } catch {}
  return TEXT_SCALE_STEPS.includes(v) ? v : 1;
}

export function applyTextScale(s = readTextScale()) {
  document.documentElement.style.setProperty('--text-scale', String(s));
}

// Passo seguinte/anterior da escala ('in' | 'out' | 'reset'). Salva, aplica e avisa.
export function stepTextScale(dir) {
  const cur = readTextScale();
  const i = TEXT_SCALE_STEPS.indexOf(cur);
  let next = 1;
  if (dir === 'in') next = TEXT_SCALE_STEPS[Math.min(i + 1, TEXT_SCALE_STEPS.length - 1)];
  else if (dir === 'out') next = TEXT_SCALE_STEPS[Math.max(i - 1, 0)];
  try {
    localStorage.setItem(KEY, String(next));
  } catch {}
  applyTextScale(next);
  window.dispatchEvent(new CustomEvent('ygc:textscale', { detail: next }));
  return next;
}

// Tamanho em px já escalado, arredondado em meio pixel (xterm e a árvore querem número).
export function scaledPx(px, s = readTextScale()) {
  return Math.round(px * s * 2) / 2;
}

// Chama `fn(scale)` sempre que o tamanho do texto muda. Devolve a função de desligar.
export function onTextScale(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener('ygc:textscale', h);
  return () => window.removeEventListener('ygc:textscale', h);
}

export function useTextScale() {
  const [s, setS] = useState(readTextScale);
  useEffect(() => onTextScale(setS), []);
  return s;
}
