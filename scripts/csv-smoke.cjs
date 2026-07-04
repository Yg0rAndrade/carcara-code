// Smoke do parse de CSV fora do Electron. Usa o MESMO csv-core.cjs do main.js
// (parseCsvBuffer) e lê as células igual ao sliceXlsRows. Valida as premissas do
// design da V1.3:
//   - campo entre aspas com vírgula E quebra de linha vira UMA célula só
//   - acentos UTF-8 preservados (decode consciente de encoding)
//   - CSV latin1/ANSI (Excel pt-BR) também decodifica acento certo
//   - zero à esquerda preservado (raw:true, sem virar número)
//   - separador ';' detectado sozinho
//   - CSV > 1MB parseia e bate a contagem de linhas
// Uso: node scripts/csv-smoke.cjs
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { parseCsvBuffer } = require('../csv-core.cjs');

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// Espelha a leitura de célula do sliceXlsRows (main.js): w = formatado, v = cru.
function cellText(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? (cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : '') : '';
}

function parse(buf) {
  const wb = parseCsvBuffer(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const range = XLSX.utils.decode_range(ws['!ref']);
  return { ws, rows: range.e.r + 1, cols: range.e.c + 1 };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-csv-'));
const cleanup = [];
function writeTmp(name, buf) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, buf);
  cleanup.push(p);
  return p;
}

try {
  // 1) Vírgula + campo entre aspas (vírgula e quebra) + acento UTF-8 + zero à esquerda.
  const commaCsv =
    'codigo,nome,obs\r\n' + '007,Ana,"mora em São Paulo, SP\nfone 99"\r\n' + '042,Beto,sem obs\r\n';
  const a = parse(fs.readFileSync(writeTmp('comma.csv', Buffer.from(commaCsv, 'utf8'))));
  assert(a.cols === 3, `comma: esperava 3 colunas, veio ${a.cols}`);
  assert(a.rows === 3, `comma: esperava 3 linhas, veio ${a.rows}`);
  assert(
    cellText(a.ws, 1, 0) === '007',
    `comma: zero à esquerda perdido -> "${cellText(a.ws, 1, 0)}"`,
  );
  const obs = cellText(a.ws, 1, 2);
  assert(
    obs.includes('São Paulo, SP') && obs.includes('fone 99'),
    `comma: campo entre aspas (vírgula+quebra+acento) não bateu -> "${obs}"`,
  );
  console.log('[ok] vírgula: aspas/quebra/acento-UTF8/zero-à-esquerda preservados');

  // 2) Ponto-e-vírgula + acento em latin1/ANSI (Excel pt-BR antigo).
  const semiLatin = Buffer.from('nome;cidade\r\nAna;São Paulo\r\nBeto;Brasília\r\n', 'latin1');
  const b = parse(fs.readFileSync(writeTmp('semi-ansi.csv', semiLatin)));
  assert(b.cols === 2, `semi: esperava 2 colunas (separador ';' detectado), veio ${b.cols}`);
  assert(
    cellText(b.ws, 1, 1) === 'São Paulo' && cellText(b.ws, 2, 1) === 'Brasília',
    `semi: acento latin1 não decodificou -> "${cellText(b.ws, 1, 1)}" / "${cellText(b.ws, 2, 1)}"`,
  );
  console.log('[ok] ponto-e-vírgula + latin1: separador detectado e acento certo');

  // 3) CSV > 1MB: parseia e conta as linhas certas.
  const N = 60000;
  const parts = ['id,valor\r\n'];
  for (let i = 1; i <= N; i++) parts.push(`${i},linha-${i}-xxxxxxxxxxxxxxxxxx\r\n`);
  const bigPath = writeTmp('big.csv', Buffer.from(parts.join(''), 'utf8'));
  const size = fs.statSync(bigPath).size;
  assert(size > 1024 * 1024, `big: esperava > 1MB, veio ${size} bytes`);
  const c = parse(fs.readFileSync(bigPath));
  assert(c.rows === N + 1, `big: esperava ${N + 1} linhas, veio ${c.rows}`);
  assert(cellText(c.ws, N, 1) === `linha-${N}-xxxxxxxxxxxxxxxxxx`, 'big: última linha não bateu');
  console.log(`[ok] CSV grande: ${(size / 1024 / 1024).toFixed(1)}MB, ${c.rows} linhas`);

  console.log('\nSMOKE OK');
} finally {
  for (const p of cleanup) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
  try {
    fs.rmdirSync(tmp);
  } catch {}
}
