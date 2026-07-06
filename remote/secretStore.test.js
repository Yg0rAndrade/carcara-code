import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { makeSecretStore } from './secretStore.cjs';

// Fake do safeStorage: "cifra" com base64 (só pra testar o round-trip/persistência).
const fakeCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
  decryptString: (buf) => buf.toString('utf8').replace(/^enc:/, ''),
};
const unavailable = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.alloc(0),
  decryptString: () => '',
};

let filePath;
beforeEach(() => {
  filePath = path.join(
    os.tmpdir(),
    `carcara-secrets-${process.pid}-${Math.round(performance.now())}.json`,
  );
  try {
    fs.unlinkSync(filePath);
  } catch {}
});

describe('makeSecretStore', () => {
  it('round-trip cifra e recupera por hostKey', () => {
    const s = makeSecretStore({ crypto: fakeCrypto, filePath });
    expect(s.save('ygor@h:22', 'senha123')).toBe(true);
    const s2 = makeSecretStore({ crypto: fakeCrypto, filePath }); // relê do disco
    expect(s2.load('ygor@h:22')).toBe('senha123');
  });
  it('remove apaga o segredo', () => {
    const s = makeSecretStore({ crypto: fakeCrypto, filePath });
    s.save('a@h:22', 'x');
    s.remove('a@h:22');
    expect(s.load('a@h:22')).toBe(null);
  });
  it('não persiste quando crypto indisponível', () => {
    const s = makeSecretStore({ crypto: unavailable, filePath });
    expect(s.available()).toBe(false);
    expect(s.save('a@h:22', 'x')).toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
  });
  it('save retorna false quando a escrita falha', () => {
    const dirAsFile = path.join(
      os.tmpdir(),
      `carcara-secrets-dir-${process.pid}-${Math.round(performance.now())}`,
    );
    fs.mkdirSync(dirAsFile, { recursive: true }); // filePath = diretório → writeFileSync lança
    const s = makeSecretStore({ crypto: fakeCrypto, filePath: dirAsFile });
    expect(s.save('a@h:22', 'x')).toBe(false);
  });
});
