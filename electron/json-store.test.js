import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readJson, writeJson } = require('./json-store.cjs');

let dir, file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-store-'));
  file = path.join(dir, 'config.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('json-store', () => {
  it('grava e lê de volta', () => {
    writeJson(file, { projects: ['a'] });
    expect(readJson(file)).toEqual({ value: { projects: ['a'] }, source: 'file' });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('arquivo ausente devolve o fallback', () => {
    expect(readJson(file, { x: 1 })).toEqual({ value: { x: 1 }, source: 'empty' });
  });

  it('a 2ª gravação deixa a anterior no .bak', () => {
    writeJson(file, { v: 1 });
    writeJson(file, { v: 2 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual({ v: 1 });
  });

  // O incidente de 19/11: disco cheio durante a gravação.
  it('disco cheio: a gravação falha e o arquivo antigo fica intacto', () => {
    writeJson(file, { projects: ['a', 'b', 'c'] });
    const err = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    vi.spyOn(fs, 'writeSync').mockImplementation(() => {
      throw err;
    });
    expect(() => writeJson(file, { projects: [] })).toThrow(/ENOSPC/);
    vi.restoreAllMocks();
    expect(readJson(file).value).toEqual({ projects: ['a', 'b', 'c'] });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('arquivo vazio/truncado: recupera do .bak e preserva o quebrado', () => {
    writeJson(file, { projects: ['a'] });
    writeJson(file, { projects: ['a', 'b'] }); // .bak = ['a']
    fs.writeFileSync(file, '{"projects": ["a", "b'); // truncado
    const r = readJson(file);
    expect(r).toEqual({ value: { projects: ['a'] }, source: 'backup' });
    expect(fs.readdirSync(dir).some((f) => f.startsWith('config.json.corrupt-'))).toBe(true);
  });

  it('gravar depois de recuperar não estraga o .bak bom', () => {
    writeJson(file, { v: 1 });
    writeJson(file, { v: 2 }); // .bak = v1
    fs.writeFileSync(file, '');
    const { value } = readJson(file); // v1, arquivo quebrado vai pra .corrupt
    writeJson(file, value);
    expect(readJson(file).value).toEqual({ v: 1 });
    expect(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8'))).toEqual({ v: 1 });
  });
});
