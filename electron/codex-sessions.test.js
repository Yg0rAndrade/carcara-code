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
// FORMATO REAL capturado do Codex 0.153.3: o turno do usuário deixou de ser um
// `user_message` e virou um `item_completed` com `item.type === 'UserMessage'`.
function userLineNovo(message) {
  return JSON.stringify({
    timestamp: '2026-09-04T21:31:14.076Z',
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      thread_id: '01a06e55-2e5d-7330-834a-ea8e1498d568',
      item: {
        type: 'UserMessage',
        id: '01a06e55-391c-7092-a134-02dd54f53c36',
        content: [{ type: 'text', text: message, text_elements: [] }],
      },
    },
  });
}
// O `<environment_context>` que o Codex injeta também é `role: "user"`. Está aqui pra
// provar que ele NÃO pode virar o título da aba.
function envContextLine(cwd) {
  return JSON.stringify({
    timestamp: '2026-09-04T21:31:13.990Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: `<environment_context>\n  <cwd>${cwd}</cwd>\n` }],
    },
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

// ---------------------------------------------------------------------------
// Camada app-server: as partes de DECISÃO, puras, sem subir processo nenhum.
// São elas que corrigem os dois modos de falha do leitor de rollout: o id trocado
// (rollout id ≠ thread id a partir do Codex 0.148) e o travamento por candidato duplo.
// ---------------------------------------------------------------------------
const THREAD_A = '019ffbcf-d74a-7343-a084-00e15399d30d';
const THREAD_B = '019ffbd0-4cfb-7252-957b-afdb26a52690';

function row(over = {}) {
  return {
    id: THREAD_A,
    title: 'oi codex',
    cwd: PROJ,
    path: null,
    ephemeral: false,
    parentThreadId: null,
    forkedFromId: null,
    recencyAt: 1,
    ...over,
  };
}

describe('idFromPath', () => {
  it('tira o uuid do caminho de um rollout', () => {
    expect(
      codex.idFromPath(
        'C:\\x\\sessions\\2026\\08\\13\\rollout-2026-08-13T12-48-50-' + ID_A + '.jsonl',
      ),
    ).toBe(ID_A);
  });

  it('caminho que não é rollout, ou vazio, → null', () => {
    expect(codex.idFromPath('C:\\x\\state_5.sqlite')).toBeNull();
    expect(codex.idFromPath(null)).toBeNull();
  });
});

describe('pickNewThread', () => {
  it('acha a thread que nasceu depois do snapshot', () => {
    const rows = [row({ id: THREAD_B }), row({ id: THREAD_A })];
    expect(codex.pickNewThread(rows, new Set([THREAD_A]))).toBe(THREAD_B);
  });

  it('REGRESSÃO: subagente e fork não contam como candidato', () => {
    // Com `multi_agent` ligado eles nascem junto com a conversa principal. Antes disso
    // o "exatamente um candidato" via dois, devolvia null pra sempre, e a aba nunca
    // ganhava id — a conversa se perdia mesmo com o histórico intacto no disco.
    const rows = [
      row({ id: THREAD_B }),
      row({ id: 'sub-1', parentThreadId: THREAD_B }),
      row({ id: 'fork-1', forkedFromId: THREAD_B }),
    ];
    expect(codex.pickNewThread(rows, new Set())).toBe(THREAD_B);
  });

  it('thread sem turno de usuário ainda não conta (espera o próximo tick)', () => {
    expect(codex.pickNewThread([row({ id: THREAD_B, title: null })], new Set())).toBeNull();
  });

  it('duas conversas de verdade ao mesmo tempo → espera, não chuta', () => {
    const rows = [row({ id: THREAD_A }), row({ id: THREAD_B })];
    expect(codex.pickNewThread(rows, new Set())).toBeNull();
  });

  it('nada novo → null', () => {
    expect(codex.pickNewThread([row()], new Set([THREAD_A]))).toBeNull();
    expect(codex.pickNewThread(null, new Set())).toBeNull();
  });
});

describe('pickResolvedId', () => {
  it('REGRESSÃO: id salvo pelo 0.1.13 (rollout id) vira o thread id da mesma conversa', () => {
    // O config antigo guardou o uuid do NOME do arquivo. No Codex 0.148+ o
    // `codex resume` não aceita mais esse id (PR #38127). O caminho do rollout que o
    // thread/list devolve é o que liga um ao outro.
    const rows = [
      row({
        id: THREAD_B,
        path: 'C:\\x\\sessions\\2026\\08\\13\\rollout-2026-08-13T12-48-50-' + ID_A + '.jsonl',
      }),
    ];
    expect(codex.pickResolvedId(rows, ID_A)).toBe(THREAD_B);
  });

  it('id que já é thread id fica como está', () => {
    expect(codex.pickResolvedId([row({ id: THREAD_A })], THREAD_A)).toBe(THREAD_A);
  });

  it('sem app-server (rows null) devolve o id salvo, pro plano B decidir', () => {
    expect(codex.pickResolvedId(null, ID_A)).toBe(ID_A);
  });

  it('sem correspondência devolve o id salvo (quem descarta é o threadExists)', () => {
    expect(codex.pickResolvedId([row({ id: THREAD_B })], ID_A)).toBe(ID_A);
    expect(codex.pickResolvedId([row()], null)).toBeNull();
  });
});

// O bug que fazia a aba de Codex voltar em branco no Codex novo: o leitor procurava a
// string "user_message", que sumiu do rollout na 0.153.3. O arquivo estava lá, com a
// conversa, e o Carcará achava que a aba estava vazia. Ver CODEX-SESSAO-DIAGNOSTICO.md.
describe('userText: os dois formatos de turno do usuário', () => {
  it('formato 0.144.6 (event_msg/user_message)', () => {
    expect(codex.userText(userLine('arrumar o menu'))).toBe('arrumar o menu');
  });

  it('REGRESSÃO: formato 0.153.3 (item_completed/UserMessage)', () => {
    expect(codex.userText(userLineNovo('arrumar o menu'))).toBe('arrumar o menu');
  });

  it('junta os pedaços de content do formato novo', () => {
    const ln = JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        item: {
          type: 'UserMessage',
          content: [
            { type: 'text', text: 'ola ' },
            { type: 'text', text: 'mundo' },
          ],
        },
      },
    });
    expect(codex.userText(ln)).toBe('ola mundo');
  });

  it('o <environment_context> injetado pelo Codex não conta como turno do usuário', () => {
    expect(codex.userText(envContextLine(PROJ))).toBeNull();
  });

  it('resposta do agente, linha quebrada e item de outro tipo não contam', () => {
    expect(codex.userText(agentLine('pronto'))).toBeNull();
    expect(codex.userText('{ nao e json')).toBeNull();
    expect(
      codex.userText(
        JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'item_completed',
            item: { type: 'AgentMessage', content: [{ type: 'text', text: 'x' }] },
          },
        }),
      ),
    ).toBeNull();
  });

  it('turno do usuário vazio não vira título', () => {
    expect(codex.userText(userLineNovo('   '))).toBeNull();
  });
});

describe('REGRESSÃO: rollout no formato do Codex 0.153.3', () => {
  it('rolloutHasUser e sessionTitle enxergam o turno do usuário', () => {
    setup();
    const f = writeRollout({
      id: ID_A,
      cwd: PROJ,
      lines: [envContextLine(PROJ), userLineNovo('Arrumar o menu da home'), agentLine('feito')],
    });
    expect(codex.rolloutHasUser(f)).toBe(true);
    expect(codex.sessionTitle(f)).toBe('Arrumar o menu da home');
  });

  it('newRollout acha a conversa nova (era aqui que a aba voltava em branco)', () => {
    setup();
    const snap = codex.snapshot(PROJ);
    writeRollout({ id: ID_A, cwd: PROJ, lines: [userLineNovo('conversa nova')] });
    expect(codex.newRollout(PROJ, snap)).toBe(ID_A);
    expect(codex.historyExists(ID_A)).toBe(true);
  });

  it('rollout do formato novo SEM turno do usuário segue sem valer resume', () => {
    setup();
    const f = writeRollout({ id: ID_B, cwd: PROJ, lines: [envContextLine(PROJ)] });
    expect(codex.rolloutHasUser(f)).toBe(false);
    expect(codex.sessionTitle(f)).toBeNull();
  });
});
