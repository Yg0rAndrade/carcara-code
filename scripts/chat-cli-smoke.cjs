'use strict';

// Smoke test das partes puras da ponte de chat (chat-cli.cjs). Roda em qualquer SO:
//   node scripts/chat-cli-smoke.cjs
// Sai !=0 se algo quebrar. Estilo scripts/platform-smoke.cjs.

const assert = require('assert');
const {
  buildChatArgs,
  buildUserMessage,
  normalizeStreamEvent,
  normalizeCodexEvent,
  getAdapter,
} = require('../electron/chat-cli.cjs');

let n = 0;
const ok = (cond, msg) => {
  n++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  n++;
  assert.deepStrictEqual(a, b, msg);
};

// --- buildChatArgs ---
eq(
  buildChatArgs(),
  ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'],
  'flags base exigem -p + stream-json + verbose',
);
ok(buildChatArgs({ resumeId: 'abc' }).join(' ').includes('--resume abc'), 'resume vira --resume');
ok(buildChatArgs({ model: 'opus' }).join(' ').includes('--model opus'), 'model vira --model');
ok(
  buildChatArgs({ permissionMode: 'plan' }).join(' ').includes('--permission-mode plan'),
  'permissionMode vira --permission-mode',
);
ok(
  buildChatArgs({ yolo: true }).includes('--dangerously-skip-permissions'),
  'yolo vira --dangerously-skip-permissions',
);
ok(!buildChatArgs().includes('--resume'), 'sem resumeId não tem --resume');

// --- buildUserMessage ---
const um = buildUserMessage('oi', 's1');
eq(um.type, 'user', 'mensagem é do tipo user');
eq(um.message.content, [{ type: 'text', text: 'oi' }], 'texto entra no content');
eq(um.session_id, 's1', 'session_id preservado');
const umImg = buildUserMessage('vê', 's1', [{ mediaType: 'image/png', data: 'AAA' }]);
eq(
  umImg.message.content[1],
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
  'imagem base64 vira bloco image',
);

// --- normalizeStreamEvent ---
eq(
  normalizeStreamEvent({ type: 'system', subtype: 'init', session_id: 'S', model: 'm' }),
  [
    {
      kind: 'system',
      subtype: 'init',
      sessionId: 'S',
      model: 'm',
      tools: undefined,
      mcpServers: undefined,
    },
  ],
  'system/init captura sessão + model',
);

const asst = normalizeStreamEvent({
  type: 'assistant',
  session_id: 'S',
  message: {
    content: [
      { type: 'text', text: 'olá' },
      { type: 'thinking', thinking: 'hmm' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { file: 'a' } },
    ],
  },
});
eq(asst.length, 3, 'assistant com 3 blocos vira 3 eventos');
eq(asst[0], { kind: 'text', text: 'olá', sessionId: 'S' }, 'bloco text');
eq(asst[1], { kind: 'thinking', text: 'hmm', sessionId: 'S' }, 'bloco thinking');
eq(
  asst[2],
  { kind: 'tool_use', id: 't1', name: 'Read', input: { file: 'a' }, sessionId: 'S' },
  'bloco tool_use',
);

const tr = normalizeStreamEvent({
  type: 'user',
  session_id: 'S',
  message: {
    content: [{ type: 'tool_result', tool_use_id: 't1', content: 'saída', is_error: false }],
  },
});
eq(
  tr,
  [{ kind: 'tool_result', toolUseId: 't1', content: 'saída', isError: false, sessionId: 'S' }],
  'tool_result',
);

const res = normalizeStreamEvent({
  type: 'result',
  subtype: 'success',
  session_id: 'S',
  total_cost_usd: 0.01,
  duration_ms: 1200,
  num_turns: 2,
  result: 'pronto',
});
eq(res[0].kind, 'result', 'result vira evento result');
eq(res[0].cost, 0.01, 'custo mapeado');
eq(res[0].isError, false, 'success não é erro');

eq(normalizeStreamEvent({ type: 'quetipoéesse' }), [], 'tipo desconhecido → vazio');
eq(normalizeStreamEvent(null), [], 'null → vazio');

// --- Adapters por CLI ---
const claude = getAdapter('claude');
eq(claude.mode, 'persistent', 'claude é persistente');
ok(typeof claude.buildInput === 'function', 'claude tem buildInput (stdin)');
ok(claude.buildArgs({}).includes('stream-json'), 'claude buildArgs usa stream-json');
eq(getAdapter('opencode'), null, 'opencode não tem adapter de chat (cai no terminal)');

// Codex: por-turno, JSONL
const codex = getAdapter('codex');
eq(codex.mode, 'perTurn', 'codex é por-turno');
eq(
  codex.buildArgs({ prompt: 'oi' }),
  ['exec', '--json', 'oi'],
  'codex 1º turno: exec --json <prompt>',
);
eq(
  codex.buildArgs({ resumeId: 'TID', prompt: 'de novo' }),
  ['exec', 'resume', 'TID', '--json', 'de novo'],
  'codex resume: exec resume <id> --json <prompt>',
);
eq(
  normalizeCodexEvent({ type: 'thread.started', thread_id: 'TID' }),
  [{ kind: 'system', sessionId: 'TID' }],
  'codex thread.started captura o id',
);
eq(
  normalizeCodexEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'olá' } }),
  [{ kind: 'text', text: 'olá' }],
  'codex agent_message → text',
);
eq(
  normalizeCodexEvent({
    type: 'item.started',
    item: { id: 'i1', type: 'command_execution', command: 'ls' },
  }),
  [{ kind: 'tool_use', id: 'i1', name: 'shell', input: 'ls' }],
  'codex command_execution started → tool_use',
);
eq(
  normalizeCodexEvent({
    type: 'item.completed',
    item: { id: 'i1', type: 'command_execution', aggregated_output: 'a.txt', exit_code: 0 },
  }),
  [{ kind: 'tool_result', toolUseId: 'i1', content: 'a.txt', isError: false }],
  'codex command_execution completed → tool_result',
);
eq(
  normalizeCodexEvent({ type: 'turn.completed' })[0].kind,
  'result',
  'codex turn.completed → result',
);
eq(
  normalizeCodexEvent({ type: 'turn.failed', error: { message: 'x' } })[0].kind,
  'error',
  'codex turn.failed → error',
);

// Antigravity (agy): por-turno, texto puro
const agy = getAdapter('agy');
eq(agy.mode, 'perTurn', 'agy é por-turno');
ok(agy.text === true, 'agy é modo texto (sem JSON)');
eq(agy.buildArgs({ prompt: 'oi' }), ['-p', 'oi'], 'agy 1º turno: -p <prompt>');
eq(
  agy.buildArgs({ prompt: 'de novo', hasHistory: true }),
  ['--continue', '-p', 'de novo'],
  'agy com histórico: --continue -p <prompt>',
);
eq(
  agy.buildArgs({ prompt: 'oi', yolo: true }),
  ['--dangerously-skip-permissions', '-p', 'oi'],
  'agy com yolo pula as permissões',
);
ok(
  !agy.buildArgs({ prompt: 'oi' }).includes('--dangerously-skip-permissions'),
  'agy sem yolo pede permissão',
);

console.log(`OK — ${n} asserts passaram (chat-cli.cjs)`);
