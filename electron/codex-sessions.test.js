import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const codex = require('./codex-sessions.cjs');

// Linhas com o FORMATO REAL capturado do Codex 0.144.6 (rollout append-only).
function metaLine(id, cwd) {
  return JSON.stringify({
    timestamp: '2026-07-17T19:10:17.271Z',
    type: 'session_meta',
    payload: { id, session_id: id, cwd, originator: 'codex-tui', cli_version: '0.144.6' },
  });
}
function userLine(message) {
  return JSON.stringify({
    timestamp: '2026-07-17T19:10:17.371Z',
    type: 'event_msg',
    payload: { type: 'user_message', message, images: [] },
  });
}
function agentLine(text) {
  return JSON.stringify({
    timestamp: '2026-07-17T19:10:26.022Z',
    type: 'event_msg',
    payload: { type: 'agent_message', message: text },
  });
}

let home = null;

// Cria ~/.codex/sessions/<day>/rollout-<ts>-<uuid>.jsonl. `day` é 'YYYY/MM/DD'.
function writeRollout({ id, cwd, day = '2026/07/17', lines = [], ts = '2026-07-17T16-09-59' }) {
  const dir = path.join(home, 'sessions', ...day.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${ts}-${id}.jsonl`);
  fs.writeFileSync(file, [metaLine(id, cwd), ...lines].join('\n') + '\n');
  return file;
}

const ID_A = '019f717c-3f0d-7232-89f3-38461f87005c';
const ID_B = '019ee721-3ef6-7a03-91da-a1f89f50fc3f';
const ID_C = '019ee710-38cf-7ae2-9b11-a07985116812';
const PROJ = 'C:\\Users\\dev\\Documents\\github\\meu-projeto';
const OTHER = 'C:\\Users\\dev\\Documents\\github\\outro';

function setup() {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  process.env.CODEX_HOME = home;
}

afterEach(() => {
  delete process.env.CODEX_HOME;
  if (home) fs.rmSync(home, { recursive: true, force: true });
  home = null;
});

describe('sessionsBase', () => {
  it('respeita CODEX_HOME e cai no ~/.codex', () => {
    setup();
    expect(codex.sessionsBase()).toBe(path.join(home, 'sessions'));
    delete process.env.CODEX_HOME;
    expect(codex.sessionsBase()).toBe(path.join(os.homedir(), '.codex', 'sessions'));
  });
});

describe('sameCwd', () => {
  it('ignora o prefixo estendido do Windows, barras e caixa do drive', () => {
    setup();
    expect(codex.sameCwd('\\\\?\\C:\\Users\\dev\\proj', 'C:\\Users\\dev\\proj')).toBe(true);
    expect(codex.sameCwd('C:/Users/dev/proj/', 'C:\\Users\\dev\\proj')).toBe(true);
    // A caixa só é ignorada no Windows (no POSIX o caminho é case-sensitive de verdade).
    expect(codex.sameCwd('c:\\users\\dev\\proj', 'C:\\Users\\dev\\proj')).toBe(
      process.platform === 'win32',
    );
    expect(codex.sameCwd('', 'C:\\x')).toBe(false);
    expect(codex.sameCwd(null, null)).toBe(false);
  });
});

describe('readMeta / rolloutHasUser', () => {
  it('lê id e cwd do session_meta; detecta turno de usuário', () => {
    setup();
    const f = writeRollout({ id: ID_A, cwd: PROJ, lines: [userLine('oi')] });
    expect(codex.readMeta(f)).toEqual({ id: ID_A, cwd: PROJ });
    expect(codex.rolloutHasUser(f)).toBe(true);

    const vazio = writeRollout({ id: ID_B, cwd: PROJ, lines: [agentLine('só o agente')] });
    expect(codex.rolloutHasUser(vazio)).toBe(false);
  });

  it('aceita rollout antigo, que só tem `id` (sem session_id)', () => {
    setup();
    const dir = path.join(home, 'sessions', '2026', '07', '17');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `rollout-2026-07-17T16-09-59-${ID_C}.jsonl`);
    const meta = JSON.stringify({ type: 'session_meta', payload: { id: ID_C, cwd: PROJ } });
    fs.writeFileSync(file, meta + '\n' + userLine('oi') + '\n');
    expect(codex.readMeta(file)).toEqual({ id: ID_C, cwd: PROJ });
  });

  // REGRESSÃO: a 1ª versão lia um "head" fixo de 256 KB e dava has-user=false num
  // rollout REAL do disco — medido, o 1º turno do usuário é a linha 6, mas no byte
  // 852.073, porque o session_meta tem ~22 KB e as linhas de contexto antes dele são
  // enormes. O limite tem de ser em LINHAS, não em bytes.
  it('REGRESSÃO: acha o turno do usuário mesmo bem depois dos primeiros 256 KB', () => {
    setup();
    const gordo = JSON.stringify({
      type: 'response_item',
      payload: { type: 'message', text: 'x'.repeat(500000) },
    });
    const f = writeRollout({
      id: ID_A,
      cwd: PROJ,
      lines: [gordo, gordo, userLine('achou mesmo lá no fundo')],
    });
    expect(fs.statSync(f).size).toBeGreaterThan(1000000);
    expect(codex.rolloutHasUser(f)).toBe(true);
    expect(codex.sessionTitle(f)).toBe('achou mesmo lá no fundo');
    expect(codex.historyExists(ID_A)).toBe(true);
  });

  it('arquivo inexistente ou lixo → null/false, sem lançar', () => {
    setup();
    const naoExiste = path.join(home, 'nada.jsonl');
    expect(codex.readMeta(naoExiste)).toBeNull();
    expect(codex.rolloutHasUser(naoExiste)).toBe(false);
    const lixo = path.join(home, 'lixo.jsonl');
    fs.writeFileSync(lixo, 'isto não é json\n');
    expect(codex.readMeta(lixo)).toBeNull();
  });
});

describe('historyExists', () => {
  it('só confirma com conversa de verdade (senão `codex resume` abriria sessão vazia)', () => {
    setup();
    writeRollout({ id: ID_A, cwd: PROJ, lines: [userLine('oi')] });
    writeRollout({ id: ID_B, cwd: PROJ, lines: [agentLine('sem usuário')] });
    expect(codex.historyExists(ID_A)).toBe(true);
    expect(codex.historyExists(ID_B)).toBe(false);
    expect(codex.historyExists('nao-existe')).toBe(false);
    expect(codex.historyExists(null)).toBe(false);
  });

  it('acha rollout de qualquer dia, não só dos recentes', () => {
    setup();
    writeRollout({
      id: ID_C,
      cwd: PROJ,
      day: '2025/01/02',
      ts: '2025-01-02T10-00-00',
      lines: [userLine('antigo')],
    });
    expect(codex.historyExists(ID_C)).toBe(true);
  });
});

describe('snapshot / newRollout', () => {
  it('acha o rollout que apareceu depois do lançamento', () => {
    setup();
    writeRollout({ id: ID_A, cwd: PROJ, lines: [userLine('conversa velha')] });
    const snap = codex.snapshot(PROJ);
    expect(snap.has(ID_A)).toBe(true);

    expect(codex.newRollout(PROJ, snap)).toBeNull(); // nada novo ainda
    writeRollout({ id: ID_B, cwd: PROJ, lines: [userLine('aba nova')] });
    expect(codex.newRollout(PROJ, snap)).toBe(ID_B);
  });

  it('ignora rollout de OUTRO projeto', () => {
    setup();
    const snap = codex.snapshot(PROJ);
    writeRollout({ id: ID_B, cwd: OTHER, lines: [userLine('outro projeto')] });
    expect(codex.newRollout(PROJ, snap)).toBeNull();
    expect(codex.newRollout(OTHER, snap)).toBe(ID_B);
  });

  it('espera (null) enquanto o rollout novo ainda não tem turno de usuário', () => {
    setup();
    const snap = codex.snapshot(PROJ);
    writeRollout({ id: ID_B, cwd: PROJ, lines: [] });
    expect(codex.newRollout(PROJ, snap)).toBeNull();
  });

  it('AMBIGUIDADE: duas abas novas no mesmo projeto → null (não amarra na errada)', () => {
    setup();
    const snap = codex.snapshot(PROJ);
    writeRollout({ id: ID_A, cwd: PROJ, lines: [userLine('aba 1')] });
    writeRollout({ id: ID_B, cwd: PROJ, ts: '2026-07-17T16-11-00', lines: [userLine('aba 2')] });
    expect(codex.newRollout(PROJ, snap)).toBeNull();
  });

  it('virada de dia: rollout de ontem ainda entra na varredura', () => {
    setup();
    const snap = codex.snapshot(PROJ);
    writeRollout({
      id: ID_B,
      cwd: PROJ,
      day: '2026/07/16',
      ts: '2026-07-16T23-59-00',
      lines: [userLine('começou ontem')],
    });
    expect(codex.newRollout(PROJ, snap)).toBe(ID_B);
  });

  it('casa o cwd mesmo com o prefixo \\\\?\\ do Windows', () => {
    setup();
    writeRollout({ id: ID_A, cwd: '\\\\?\\' + PROJ, lines: [userLine('oi')] });
    expect(codex.newRollout(PROJ, new Set())).toBe(ID_A);
  });

  // O snapshot sai do NOME do arquivo (sem abrir nada) e guarda todos os ids: assim o
  // tique de 1,5 s não relê o histórico dos outros projetos pra descartá-lo depois.
  it('snapshot guarda todos os ids, de qualquer projeto', () => {
    setup();
    writeRollout({ id: ID_A, cwd: PROJ, lines: [userLine('meu')] });
    writeRollout({ id: ID_B, cwd: OTHER, ts: '2026-07-17T16-11-00', lines: [userLine('outro')] });
    expect([...codex.snapshot(PROJ)].sort()).toEqual([ID_A, ID_B].sort());
  });

  it('ignora arquivos que não são rollout', () => {
    setup();
    const dir = path.join(home, 'sessions', '2026', '07', '17');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'notas.txt'), 'nada');
    fs.writeFileSync(path.join(dir, 'rollout-sem-uuid.jsonl'), 'nada');
    expect(codex.listRollouts()).toEqual([]);
  });

  it('base inexistente não lança', () => {
    setup();
    fs.rmSync(home, { recursive: true, force: true });
    expect(codex.listRollouts()).toEqual([]);
    expect(codex.snapshot(PROJ).size).toBe(0);
    expect(codex.newRollout(PROJ, new Set())).toBeNull();
  });
});

describe('sessionTitle', () => {
  it('usa o PRIMEIRO prompt do usuário (o Codex não gera ai-title)', () => {
    setup();
    const f = writeRollout({
      id: ID_A,
      cwd: PROJ,
      lines: [userLine('  Arrumar   o menu\nda home  '), userLine('segundo prompt')],
    });
    expect(codex.sessionTitle(f)).toBe('Arrumar o menu da home');
  });

  it('sem turno de usuário → null', () => {
    setup();
    const f = writeRollout({ id: ID_A, cwd: PROJ, lines: [agentLine('oi')] });
    expect(codex.sessionTitle(f)).toBeNull();
  });
});
