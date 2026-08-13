import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readerFor } = require('./session-history.cjs');

const PROJ = 'C:\\Users\\dev\\Documents\\github\\meu-projeto';
const CODEX_ID = '019f717c-3f0d-7232-89f3-38461f87005c';
const CLAUDE_ID = 'a5c14242-6a1f-4580-b69b-a072fe97bc7c';

let homes = [];
afterEach(() => {
  delete process.env.CODEX_HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
  homes = [];
});

function fakeCodexHome({ id = CODEX_ID, cwd = PROJ, withUser = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  homes.push(home);
  process.env.CODEX_HOME = home;
  const dir = path.join(home, 'sessions', '2026', '07', '17');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [JSON.stringify({ type: 'session_meta', payload: { id, session_id: id, cwd } })];
  if (withUser) {
    lines.push(
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'oi codex' } }),
    );
  }
  fs.writeFileSync(path.join(dir, `rollout-2026-07-17T16-09-59-${id}.jsonl`), lines.join('\n'));
  return home;
}

function fakeClaudeHome({ id = CLAUDE_ID, projectPath = PROJ } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cfg-'));
  homes.push(home);
  process.env.CLAUDE_CONFIG_DIR = home;
  const dir = path.join(home, 'projects', String(projectPath).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, id + '.jsonl'),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'oi claude' } }) + '\n',
  );
  return home;
}

describe('readerFor', () => {
  it('só claude e codex têm histórico legível em disco', () => {
    expect(readerFor('claude')).toBeTruthy();
    expect(readerFor('codex')).toBeTruthy();
    for (const cli of ['opencode', 'agy', 'custom', 'shell', 'carcara', 'nada', null, undefined]) {
      expect(readerFor(cli)).toBeNull();
    }
  });

  it('comando de retomada de cada CLI', () => {
    expect(readerFor('claude').resumeCmd('abc')).toBe('claude --resume abc');
    expect(readerFor('codex').resumeCmd('abc')).toBe('codex resume abc');
    expect(readerFor('claude').cmd).toBe('claude');
    expect(readerFor('codex').cmd).toBe('codex');
  });
});

describe('getId / setId', () => {
  it('claude guarda em s.claudeId', () => {
    const r = readerFor('claude');
    const s = {};
    expect(r.getId(s)).toBeNull();
    r.setId(s, 'x1');
    expect(s).toEqual({ claudeId: 'x1' });
    expect(r.getId(s)).toBe('x1');
  });

  it('codex guarda em s.resume.codex (forma que o ai-cli já lê, sem migração)', () => {
    const r = readerFor('codex');
    const s = {};
    expect(r.getId(s)).toBeNull();
    r.setId(s, 'x2');
    expect(s).toEqual({ resume: { codex: 'x2' } });
    expect(r.getId(s)).toBe('x2');
    // não pisa nos ids das outras CLIs
    const s2 = { resume: { opencode: 'ses_1' } };
    r.setId(s2, 'x3');
    expect(s2.resume).toEqual({ opencode: 'ses_1', codex: 'x3' });
  });

  it('getId aceita sessão inexistente', () => {
    expect(readerFor('claude').getId(null)).toBeNull();
    expect(readerFor('codex').getId(null)).toBeNull();
  });
});

describe('leitura do histórico em disco', () => {
  it('codex: historyExists + snapshot/findNew + título', () => {
    fakeCodexHome();
    const r = readerFor('codex');
    expect(r.historyExists(CODEX_ID)).toBe(true);
    expect(r.historyExists('nao-existe')).toBe(false);
    expect(r.snapshot(PROJ).has(CODEX_ID)).toBe(true);
    expect(r.findNew(PROJ, new Set())).toBe(CODEX_ID);
    expect(r.title(PROJ, CODEX_ID)).toBe('oi codex');
    expect(r.title(PROJ, null)).toBeNull();
  });

  it('claude: historyExists + título continuam funcionando (não regrediu)', () => {
    fakeClaudeHome();
    const r = readerFor('claude');
    expect(r.historyExists(CLAUDE_ID)).toBe(true);
    expect(r.legacyId(CLAUDE_ID)).toBe(CLAUDE_ID); // esquema antigo: id da aba = id da conversa
    expect(r.legacyId('outra-coisa')).toBeNull();
    expect(r.snapshot(PROJ).has(CLAUDE_ID)).toBe(true);
    expect(r.title(PROJ, CLAUDE_ID)).toBe('oi claude');
  });

  it('REGRESSÃO: rollout do Codex sem turno de usuário não vira resume', () => {
    // Era o que o `codex resume <id>` abriria: uma sessão vazia.
    fakeCodexHome({ withUser: false });
    expect(readerFor('codex').historyExists(CODEX_ID)).toBe(false);
  });

  it('legacyId do codex é sempre null (o id da aba nunca foi o da thread)', () => {
    fakeCodexHome();
    expect(readerFor('codex').legacyId(CODEX_ID)).toBeNull();
  });
});
