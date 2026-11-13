// Contraste (WCAG 2.1 AA) de TODO texto e ícone do app, em TODOS os temas, lido direto
// do src/index.css. Duas travas:
//  1. Matriz: cada cor de texto contra cada superfície, e cada botão preenchido.
//  2. Varredura do src/: proíbe as classes que fogem dos tokens (cor fixa do Tailwind em
//     texto, text-primary/text-destructive cru, cinza com transparência).
// Plano e critérios: docs/plans/2026-11-13-contraste-aa-todos-os-temas.md
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, themeFamily } from './theme.jsx';

const SRC = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');

function tokensOf(selectorRe) {
  const m = css.match(new RegExp(selectorRe + String.raw`\s*\{([\s\S]*?)\n  \}`));
  if (!m) throw new Error('bloco não encontrado: ' + selectorRe);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2]]));
}

const LIGHT = tokensOf(String.raw`:root,\s*\.light:where\(\.dark \*\)`);
const DARK = tokensOf(String.raw`\.dark:where\(:root\),\s*\.dark:where\(:root:not\(\.dark\) \*\)`);

function themeTokens(name) {
  const base = themeFamily(name) === 'dark' ? DARK : LIGHT;
  if (name === 'light' || name === 'dark') return { ...base };
  return { ...base, ...tokensOf(String.raw`\[data-theme='${name}'\]`) };
}

function hslToRgb(triplet) {
  const [h, s, l] = triplet.replace(/%/g, '').trim().split(/\s+/).map(Number);
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const mix = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

function luminance([r, g, b]) {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Onde texto e ícone aparecem: fundo, barras (card), menus (popover), hover (muted) e
// botões neutros (secondary).
const SURFACES = ['background', 'card', 'popover', 'muted', 'secondary'];
// [token de texto, opacidade]. Texto pede 4.5:1 — a regra mais dura, vale pros ícones.
const TEXTS = [
  ['foreground', 1],
  ['foreground', 0.9],
  ['foreground', 0.8],
  ['muted-foreground', 1],
  ['primary-ink', 1],
  ['destructive-ink', 1],
  ['success-ink', 1],
  ['warning-ink', 1],
  ['info-ink', 1],
];
// Botões preenchidos: [texto, preenchimento].
const FILLS = [
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['accent-foreground', 'accent'],
  ['secondary-foreground', 'secondary'],
];

describe('contraste AA em todos os temas', () => {
  for (const name of Object.keys(THEMES)) {
    it(name, () => {
      const t = themeTokens(name);
      const fails = [];
      for (const [fg, alpha] of TEXTS) {
        if (!t[fg]) {
          fails.push(`--${fg} não definido`);
          continue;
        }
        for (const bg of SURFACES) {
          const B = hslToRgb(t[bg]);
          const ratio = contrast(mix(hslToRgb(t[fg]), B, alpha), B);
          if (ratio < 4.5) fails.push(`${fg}/${alpha} sobre ${bg}: ${ratio.toFixed(2)}`);
        }
      }
      for (const [fg, bg] of FILLS) {
        const ratio = contrast(hslToRgb(t[fg]), hslToRgb(t[bg]));
        if (ratio < 4.5) fails.push(`${fg} sobre ${bg}: ${ratio.toFixed(2)}`);
      }
      expect(fails).toEqual([]);
    });
  }
});

// Classes que escapam dos tokens acima. O conserto é sempre o *-ink equivalente.
const FORBIDDEN = [
  [
    /(?<![\w-])(?:text|fill)-(?:red|rose|green|emerald|amber|yellow|orange|sky|blue)-\d{2,3}(?![\w/-])/g,
    'cor fixa do Tailwind em texto (use text-*-ink)',
  ],
  [/(?<![\w-])text-primary(?![\w/-])/g, 'text-primary (use text-primary-ink)'],
  [/(?<![\w-])text-destructive(?![\w/-])/g, 'text-destructive (use text-destructive-ink)'],
  [/(?<![\w-])text-muted-foreground\/\d+/g, 'text-muted-foreground com transparência'],
];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe('classes de cor de texto no src/', () => {
  it('só usa tokens que passam no contraste', () => {
    const hits = [];
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [re, why] of FORBIDDEN) {
        for (const m of text.matchAll(re)) {
          const line = text.slice(0, m.index).split('\n').length;
          hits.push(`${path.relative(SRC, file)}:${line} ${m[0]} — ${why}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
