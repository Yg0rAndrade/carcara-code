import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { cachePath, readCache, writeCache, isFresh } from './ai-installer.cjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aiinst-'));

describe('cache de versões', () => {
  it('escreve e relê o cache', () => {
    const dir = tmp();
    writeCache(dir, { codex: { version: '1.0.0', checkedAt: 111 } });
    expect(readCache(dir)).toEqual({ codex: { version: '1.0.0', checkedAt: 111 } });
    expect(cachePath(dir)).toBe(path.join(dir, 'ai-versions.json'));
  });
  it('readCache tolera arquivo ausente/corrompido → {}', () => {
    const dir = tmp();
    expect(readCache(dir)).toEqual({});
    fs.writeFileSync(path.join(dir, 'ai-versions.json'), '{corrompido');
    expect(readCache(dir)).toEqual({});
  });
  it('readCache tolera JSON válido mas não-objeto (ex.: número) → {}', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'ai-versions.json'), '42');
    expect(readCache(dir)).toEqual({});
  });
  it('isFresh respeita a janela de 24h', () => {
    expect(isFresh({ version: '1', checkedAt: 1000 }, 1000 + 1000, 86400000)).toBe(true);
    expect(isFresh({ version: '1', checkedAt: 1000 }, 1000 + 86400001, 86400000)).toBe(false);
    expect(isFresh(null, 5, 10)).toBe(false);
  });
});
