// Contraste (WCAG 2.1) dos elementos das barras — titlebar, rail, cabeçalhos e abas —
// em TODOS os temas, lido direto do src/index.css. Tema novo sem --primary-ink, ou
// com um ink claro demais, quebra aqui antes de chegar ao usuário.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, themeFamily } from './theme.jsx';

const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

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

// [o que é, token da cor, opacidade, token do fundo, mínimo]
// Texto pede 4.5:1; ícone/parte gráfica pede 3:1 (WCAG 1.4.3 e 1.4.11).
const CHECKS = [
  ['título (text-foreground)', 'foreground', 1, 'card', 4.5],
  ['menus da titlebar (text-foreground/80)', 'foreground', 0.8, 'card', 4.5],
  ['ícones da titlebar (text-foreground/70)', 'foreground', 0.7, 'card', 3],
  ['abas inativas e ícones (text-muted-foreground)', 'muted-foreground', 1, 'card', 4.5],
  ['aba "Preview" ativa (text-primary-ink)', 'primary-ink', 1, 'background', 4.5],
  ['"Reiniciar" (text-primary-ink)', 'primary-ink', 1, 'secondary', 4.5],
  ['ink sobre a barra', 'primary-ink', 1, 'card', 4.5],
  ['"Parar" (text-destructive-ink)', 'destructive-ink', 1, 'secondary', 4.5],
  ['vermelho sobre a barra', 'destructive-ink', 1, 'card', 4.5],
];

describe('contraste das barras em todos os temas', () => {
  for (const name of Object.keys(THEMES)) {
    it(name, () => {
      const t = themeTokens(name);
      const fails = [];
      for (const [label, fg, alpha, bg, min] of CHECKS) {
        const B = hslToRgb(t[bg]);
        const ratio = contrast(mix(hslToRgb(t[fg]), B, alpha), B);
        if (ratio < min) fails.push(`${label}: ${ratio.toFixed(2)} < ${min}`);
      }
      expect(fails).toEqual([]);
    });
  }
});
