import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ignoredNames, parseCheckIgnore, checkIgnoreInput } = require('./git-ignored.cjs');

describe('parseCheckIgnore', () => {
  it('separa por NUL e tira a barra final das pastas', () => {
    expect([...parseCheckIgnore('dist/\0.env\0')]).toEqual(['dist', '.env']);
  });
  it('saída vazia vira conjunto vazio', () => {
    expect(parseCheckIgnore('').size).toBe(0);
  });
});

describe('checkIgnoreInput', () => {
  it('pasta ganha barra final, arquivo não', () => {
    expect(
      checkIgnoreInput([
        { name: 'dist', isDir: true },
        { name: 'a.log', isDir: false },
      ]),
    ).toBe('dist/\0a.log');
  });
});

let hasGit = true;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  hasGit = false;
}

describe.skipIf(!hasGit)('ignoredNames (git de verdade)', () => {
  it('marca o que o .gitignore cobre, pastas inclusive', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ygc-ign-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n*.log\n');
    fs.mkdirSync(path.join(dir, 'out'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'a.log'), '');
    const set = await ignoredNames(dir, [
      { name: 'out', isDir: true },
      { name: 'src', isDir: true },
      { name: 'a.log', isDir: false },
      { name: '.gitignore', isDir: false },
    ]);
    expect([...set].sort()).toEqual(['a.log', 'out']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fora de um repo devolve vazio sem lançar', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ygc-norepo-'));
    const set = await ignoredNames(dir, [{ name: 'x', isDir: false }]);
    expect(set.size).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
