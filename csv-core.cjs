// Núcleo do parse de CSV/TSV, compartilhado entre o main (main.js) e o smoke
// (scripts/csv-smoke.cjs) — mesmo padrão do mcp-core.cjs.
//
// Encoding: CSVs vêm em UTF-8 (moderno, às vezes com BOM) OU em CP1252/ANSI (Excel
// pt-BR antigo). Não existe detecção perfeita, então: respeitamos o BOM UTF-8; senão
// tentamos decodificar como UTF-8 e, se aparecer o caractere de substituição (U+FFFD,
// sinal de sequência inválida), caímos pra latin1 (ISO-8859-1, que concorda com o
// CP1252 nas acentuadas comuns do português). Sem isso, "São Paulo" viraria "SÃ£o".
const XLSX = require('xlsx');

function decodeCsv(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8', 3); // UTF-8 com BOM
  }
  const utf8 = buf.toString('utf8');
  const REPLACEMENT = String.fromCharCode(0xfffd);
  if (utf8.includes(REPLACEMENT)) return buf.toString('latin1');
  return utf8;
}

// Parseia um Buffer de CSV/TSV como planilha "só valores". `raw: true` preserva os
// campos como string (não converte "30" pra número nem perde zero à esquerda); o
// separador (vírgula / ; / tab) é detectado pela própria SheetJS.
function parseCsvBuffer(buf) {
  return XLSX.read(decodeCsv(buf), { type: 'string', raw: true });
}

module.exports = { decodeCsv, parseCsvBuffer };
