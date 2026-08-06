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

// --- Chaves USADAS no código existem no locale de referência? ---
// A paridade acima compara os locales ENTRE SI: uma chave que falta em TODOS passa
// batido e vaza crua na tela (foi o que aconteceu com `settings.aiTerminalClear`,
// que aparecia literalmente no botão do Gerenciar IAs). Aqui varremos as chamadas
// `t('chave.literal')` do renderer e exigimos que existam em en.json.
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const refKeys = new Set(flatten(locales.en || {}));
const srcDir = path.join(__dirname, '../src');
// `t('a.b')` / `t("a.b", {...})` — só chaves LITERAIS com ponto, e o literal tem de
// FECHAR o argumento (`)` ou `,`). Chaves montadas em runtime — `t(uninstall.note_key)`
// e concatenações como `t('rail.ssh_' + status)` — não dão pra checar estaticamente e
// ficam de fora (sem o `[),]` a concatenação viraria falso positivo).
const CALL = /\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1\s*[),]/g;
let usedChecked = 0;
for (const file of walk(srcDir)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(CALL)) {
    usedChecked++;
    if (!refKeys.has(m[2])) {
      console.error(`  CHAVE INEXISTENTE em ${path.relative(srcDir, file)}: t('${m[2]}')`);
      fail++;
    }
  }
}

if (fail) {
  console.error(`\n${fail} divergência(s).`);
  process.exit(1);
}
console.log(`i18n parity ok — ${localeCodes.length} idiomas: ${localeCodes.sort().join(', ')}`);
console.log(`i18n uso ok — ${usedChecked} chamadas t('...') literais conferidas contra en.json`);
