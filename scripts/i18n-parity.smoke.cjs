// Garante que TODOS os locales de src/lib/locales/*.json têm exatamente as mesmas
// chaves (recursivo), usando en.json como referência. Idem para os blocos nativos
// em electron/main.i18n.cjs. E que o conjunto de idiomas bate entre os dois.
// Rode com: node scripts/i18n-parity.smoke.cjs
const fs = require('fs');
const path = require('path');

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.push(key);
  }
  return out;
}

let fail = 0;
function compare(label, ref, other) {
  const kr = new Set(flatten(ref));
  const ko = new Set(flatten(other));
  for (const k of kr)
    if (!ko.has(k)) {
      console.error(`  FALTA em ${label}: ${k}`);
      fail++;
    }
  for (const k of ko)
    if (!kr.has(k)) {
      console.error(`  SOBRA em ${label} (não existe na referência en): ${k}`);
      fail++;
    }
}

// --- Renderer: src/lib/locales/*.json (referência = en) ---
const localesDir = path.join(__dirname, '../src/lib/locales');
const localeCodes = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length));
const locales = {};
for (const code of localeCodes) locales[code] = require(path.join(localesDir, `${code}.json`));
if (!locales.en) {
  console.error('  en.json (referência) não encontrado.');
  fail++;
}
for (const code of localeCodes) {
  if (code === 'en') continue;
  compare(`renderer/${code}`, locales.en, locales[code]);
}

// --- Nativo: electron/main.i18n.cjs (referência = en) ---
const native = require('../electron/main.i18n.cjs');
const nativeCodes = Object.keys(native);
for (const code of nativeCodes) {
  if (code === 'en') continue;
  compare(`native/${code}`, native.en, native[code]);
}

// --- Conjunto de idiomas deve bater entre renderer e nativo ---
const setLocales = new Set(localeCodes);
const setNative = new Set(nativeCodes);
for (const c of setLocales)
  if (!setNative.has(c)) {
    console.error(`  Idioma ${c} tem locale mas falta bloco nativo em main.i18n.cjs`);
    fail++;
  }
for (const c of setNative)
  if (!setLocales.has(c)) {
    console.error(`  Idioma ${c} tem bloco nativo mas falta src/lib/locales/${c}.json`);
    fail++;
  }

if (fail) {
  console.error(`\n${fail} divergência(s).`);
  process.exit(1);
}
console.log(`i18n parity ok — ${localeCodes.length} idiomas: ${localeCodes.sort().join(', ')}`);
