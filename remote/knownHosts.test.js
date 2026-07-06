import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { makeKnownHosts } from './knownHosts.cjs';

let filePath;
beforeEach(() => {
  filePath = path.join(
    os.tmpdir(),
    `carcara-kh-${process.pid}-${Math.round(performance.now())}.json`,
  );
  try {
    fs.unlinkSync(filePath);
  } catch {}
});

describe('makeKnownHosts', () => {
  it('unknown → trust → trusted; chave diferente → changed', () => {
    const kh = makeKnownHosts({ filePath });
    const keyA = Buffer.from('chave-A');
    const keyB = Buffer.from('chave-B');
    expect(kh.check('h:22', keyA)).toBe('unknown');
    kh.trust('h:22', keyA);
    expect(kh.check('h:22', keyA)).toBe('trusted');
    expect(kh.check('h:22', keyB)).toBe('changed');
  });
  it('fingerprint é estável e prefixada', () => {
    const kh = makeKnownHosts({ filePath });
    const fp = kh.fingerprint(Buffer.from('x'));
    expect(fp).toMatch(/^SHA256:/);
    expect(kh.fingerprint(Buffer.from('x'))).toBe(fp);
  });
  it('trust retorna false quando a escrita falha', () => {
    const dirAsFile = path.join(
      os.tmpdir(),
      `carcara-kh-dir-${process.pid}-${Math.round(performance.now())}`,
    );
    fs.mkdirSync(dirAsFile, { recursive: true });
    const kh = makeKnownHosts({ filePath: dirAsFile });
    expect(kh.trust('h:22', Buffer.from('x'))).toBe(false);
  });
  it('fingerprint não tem padding base64', () => {
    const kh = makeKnownHosts({ filePath });
    expect(kh.fingerprint(Buffer.from('x'))).not.toMatch(/=/);
  });
});
