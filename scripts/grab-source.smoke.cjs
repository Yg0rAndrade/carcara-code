// Smoke do resolvedor de "fonte" do grabber (src/lib/grabScript.js).
// Injeta o INJECT num DOM stub e confere que a linha "Alvo:" aponta pro arquivo:linha:col
// certo por framework (Astro/Vue/react-dev-inspector/Svelte), herda subindo o DOM, cai fora
// no fallback, e que href longo mantém a cauda (não corta no meio). Sem browser, sem deps.
//
// Roda em qualquer SO: node scripts/grab-source.smoke.cjs  (ver package.json -> test:grab)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'lib', 'grabScript.js');
const text = fs.readFileSync(SRC, 'utf8');
// Vira os `export const` em `const` locais (pro template literal do INJECT interpolar os
// sentinelas) e devolve os exports que interessam.
const { INJECT, GRAB_SENTINEL } = new Function(
  text.replace(/export const /g, 'const ') + '\nreturn { INJECT, GRAB_SENTINEL };',
)();

function makeEl(spec, parent) {
  const attrs = spec.attrs || {};
  const el = {
    nodeType: 1,
    tagName: (spec.tag || 'div').toUpperCase(),
    id: spec.id || '',
    className: spec.className || '',
    classList: Object.assign((spec.classes || []).slice(), { length: (spec.classes || []).length }),
    childNodes: spec.text ? [{ nodeType: 3, textContent: spec.text }] : [],
    textContent: spec.text || '',
    parentElement: parent || null,
    attributes: Object.keys(attrs).map((name) => ({ name, value: attrs[name] })),
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    getBoundingClientRect: () => ({ left: 0, top: 40, width: 100, height: 20 }),
    __svelte_meta: spec.svelteMeta || undefined,
  };
  if (parent) parent.children = (parent.children || []).concat(el);
  return el;
}

function grab(el) {
  const handlers = {};
  const fakeNode = () => ({
    style: { cssText: '', cursor: '', opacity: '' },
    className: '',
    animate: () => ({}),
    remove: () => {},
    appendChild: () => {},
  });
  global.window = {};
  global.requestAnimationFrame = () => {};
  global.location = { pathname: '/', search: '', hash: '' };
  global.document = {
    title: 'Test',
    documentElement: { style: { cursor: '' }, appendChild: () => {} },
    createElement: () => fakeNode(),
    addEventListener: (t, fn) => {
      handlers[t] = fn;
    },
    removeEventListener: () => {},
  };
  let captured = null;
  const origLog = console.log;
  console.log = (s) => {
    if (typeof s === 'string' && s.indexOf(GRAB_SENTINEL) === 0)
      captured = JSON.parse(s.slice(GRAB_SENTINEL.length)).md;
  };
  eval(INJECT);
  handlers.click({ target: el, preventDefault() {}, stopImmediatePropagation() {} });
  console.log = origLog;
  global.window.__carcaraGrab = null;
  return captured;
}

const alvoOf = (md) => {
  const l = md.split('\n').find((x) => x.indexOf('Alvo: ') === 0);
  return l ? l.slice(6) : null;
};
const hasFonteHint = (md) => md.split('\n').some((l) => l.indexOf('Fonte: edite ') === 0);

const cases = [
  {
    name: 'Astro (data-astro-source-*)',
    el: makeEl({
      tag: 'a',
      attrs: {
        'data-astro-source-file': 'C:/proj/src/pages/index.astro',
        'data-astro-source-loc': '12:4',
        href: '/download',
      },
      text: 'Baixar',
    }),
    expect: 'src/pages/index.astro:12:4',
  },
  {
    name: 'Vue (data-v-inspector)',
    el: makeEl({
      tag: 'button',
      attrs: { 'data-v-inspector': 'src/components/Hero.vue:5:3' },
      text: 'Ok',
    }),
    expect: 'src/components/Hero.vue:5:3',
  },
  {
    name: 'react-dev-inspector (col 0-based -> +1)',
    el: makeEl({
      tag: 'div',
      attrs: {
        'data-inspector-relative-path': 'src/App.jsx',
        'data-inspector-line': '10',
        'data-inspector-column': '4',
      },
    }),
    expect: 'src/App.jsx:10:5',
  },
  {
    name: 'Svelte (__svelte_meta, col 0-based -> +1)',
    el: makeEl({
      tag: 'section',
      svelteMeta: { loc: { file: 'src/lib/Foo.svelte', line: 7, column: 2 } },
    }),
    expect: 'src/lib/Foo.svelte:7:3',
  },
  {
    name: 'herda do pai (sobe o DOM)',
    el: (() => {
      const p = makeEl({ tag: 'section', attrs: { 'data-v-inspector': 'src/P.vue:1:1' } });
      return makeEl({ tag: 'span', text: 'x' }, p);
    })(),
    expect: 'src/P.vue:1:1',
  },
  {
    name: 'sem source (fallback, sem Alvo)',
    el: makeEl({ tag: 'div', classes: ['card'], text: 'nada' }),
    expect: null,
  },
];

let ok = 0;
let fail = 0;
for (const c of cases) {
  const md = grab(c.el);
  const alvo = alvoOf(md);
  const pass = alvo === c.expect && (c.expect ? hasFonteHint(md) : !hasFonteHint(md));
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${c.name}  Alvo=${JSON.stringify(alvo)} esperado=${JSON.stringify(c.expect)}`,
  );
  pass ? ok++ : fail++;
}

// href longo não pode ser cortado no meio: truncTail mantém a cauda (com '…' na frente).
const longHref = 'https://carcaracode.net/download/' + 'x'.repeat(300) + '/CarcaraCode-Setup.exe';
const md2 = grab(makeEl({ tag: 'a', attrs: { href: longHref }, text: 'dl' }));
const tagLine = md2.split('\n').find((l) => l.indexOf('<a') === 0) || '';
const keepsTail = tagLine.indexOf('CarcaraCode-Setup.exe') >= 0;
console.log(`${keepsTail ? 'PASS' : 'FAIL'}  href longo mantém a cauda`);
keepsTail ? ok++ : fail++;

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'HAS FAILURES'}  ok=${ok} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
