// Garante que pt.json e en.json têm exatamente as mesmas chaves (recursivo).
// Rode com: node scripts/i18n-parity.smoke.cjs
const pt = require('../src/lib/locales/pt.json');
const en = require('../src/lib/locales/en.json');

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.push(key);
  }
  return out;
}

let fail = 0;
function compare(label, a, b) {
  const ka = new Set(flatten(a));
  const kb = new Set(flatten(b));
  for (const k of ka)
    if (!kb.has(k)) {
      console.error(`  FALTA no ${label} (en): ${k}`);
      fail++;
    }
  for (const k of kb)
    if (!ka.has(k)) {
      console.error(`  FALTA no ${label} (pt): ${k}`);
      fail++;
    }
}

compare('renderer', pt, en);
const native = require('../main.i18n.cjs');
compare('native', native.pt, native.en);

if (fail) {
  console.error(`\n${fail} chave(s) divergente(s).`);
  process.exit(1);
}
console.log('i18n parity ok');
