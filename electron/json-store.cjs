// Leitura/gravação de JSON que NUNCA perde o arquivo bom (config.json e afins).
//
// Por que existe (incidente 19/11/2026): o disco C: lotou. `fs.writeFileSync` TRUNCA o
// arquivo antes de escrever; a escrita falhou por falta de espaço e o config.json ficou
// vazio. No boot seguinte o JSON.parse falhou, o loadConfig caiu em `{}` e o primeiro
// saveConfig gravou esse vazio por cima: todos os projetos e sessões sumiram.
//
// Regras:
//  - Gravar = escrever num `.tmp` (com fsync) e só então renomear por cima. Se faltar
//    espaço, quem falha é o .tmp; o arquivo atual fica intacto.
//  - Antes de trocar, o arquivo atual (se for JSON válido) vira `.bak`.
//  - Ler = arquivo → se quebrado, `.bak`. Um arquivo quebrado NUNCA é sobrescrito antes de
//    ser preservado como `<nome>.corrupt-<timestamp>` (dá pra recuperar à mão).
'use strict';

const fs = require('fs');

function parseFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function tryParse(file) {
  try {
    return { ok: true, value: parseFile(file) };
  } catch (e) {
    return { ok: false, missing: e && e.code === 'ENOENT' };
  }
}

// Lê o JSON. Devolve { value, source } com source = 'file' | 'backup' | 'empty'.
// `fallback` é usado quando nem o arquivo nem o .bak servem.
function readJson(file, fallback = {}) {
  const main = tryParse(file);
  if (main.ok) return { value: main.value, source: 'file' };
  if (!main.missing) {
    // Existe mas não parseia (vazio/truncado): guarda o que sobrou antes de qualquer gravação.
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {}
  }
  const bak = tryParse(`${file}.bak`);
  if (bak.ok) return { value: bak.value, source: 'backup' };
  return { value: fallback, source: 'empty' };
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No Windows o rename por cima falha (EPERM/EBUSY) se outro processo (antivírus, OneDrive,
// indexador) estiver segurando o arquivo por um instante. Tenta de novo um pouco.
function renameWithRetry(from, to, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      if (i >= tries - 1 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      sleepSync(30 * (i + 1));
    }
  }
}

// Grava de forma atômica. Lança erro se não conseguir (o arquivo antigo continua lá).
function writeJson(file, value) {
  const data = JSON.stringify(value, null, 2);
  const tmp = `${file}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } catch (e) {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } catch {}
    fd = undefined;
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw e;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  // Só faz backup de um arquivo atual BOM: um quebrado apagaria o .bak bom.
  if (tryParse(file).ok) {
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch {}
  }
  renameWithRetry(tmp, file);
}

module.exports = { readJson, writeJson };
