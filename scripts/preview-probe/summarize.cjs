// Resume os JSON da sonda (preview-raf-probe.cjs --json=...) numa tabela markdown por célula
// da matriz {motor} × {oclusão nativa}. Medida "congelada" = rAF 0 ou visibilityState hidden
// com a janela restaurada (iconic=False). Medidas com a janela ainda minimizada são inválidas.
//   node scripts/preview-probe/summarize.cjs <pasta-com-json>
const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2];
const cells = new Map();
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const key = `${r.engine} | ${r.noOcclusion ? 'sim' : 'não'}`;
  if (!cells.has(key))
    cells.set(key, {
      runs: 0,
      runsWithFreeze: 0,
      load: [0, 0],
      min: [0, 0],
      cover: [0, 0],
      invalid: 0,
    });
  const c = cells.get(key);
  c.runs++;
  let froze = false;
  for (const row of r.rows) {
    if (/iconic=True/.test(row.win || '')) {
      c.invalid++;
      continue;
    }
    const bad = row.raf === 0 || row.vis === 'hidden';
    froze ||= bad;
    const bucket = row.label.startsWith('carga')
      ? c.load
      : row.label.startsWith('min')
        ? c.min
        : c.cover;
    bucket[0] += bad ? 1 : 0;
    bucket[1]++;
  }
  if (froze) c.runsWithFreeze++;
}
const fmt = ([bad, total]) => `${bad}/${total}`;
console.log(
  '| Motor | Flag (sem oclusão nativa) | Execuções com congelamento | Carga | Depois de min/restore | Depois de encobrir | Medidas inválidas |',
);
console.log('|---|---|---|---|---|---|---|');
for (const [k, c] of [...cells].sort()) {
  console.log(
    `| ${k} | ${c.runsWithFreeze}/${c.runs} | ${fmt(c.load)} | ${fmt(c.min)} | ${fmt(c.cover)} | ${c.invalid} |`,
  );
}
