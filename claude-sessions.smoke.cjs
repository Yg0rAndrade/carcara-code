// Smoke test das funções puras de leitura de transcript do Claude Code.
// Roda em node puro (sem electron): `node claude-sessions.smoke.cjs`.
// Usa fixtures num diretório temporário que imita ~/.claude/projects.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cs = require('./claude-sessions.cjs');

let pass = 0,
  fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('ok   -', name);
  } catch (e) {
    fail++;
    console.log('FAIL -', name, '\n      ', e.message);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-smoke-'));
const projBase = path.join(tmp, 'projects');
const projectPath = 'C:\\Users\\a b\\Documents\\proj';
// caixa do drive trocada de propósito (Claude às vezes grava 'c--', às vezes 'C--')
const encDir = path.join(projBase, 'c--Users-a-b-Documents-proj');
fs.mkdirSync(encDir, { recursive: true });

const idA = '11111111-aaaa';
const idB = '22222222-bbbb';
const idEmpty = '33333333-cccc';

fs.writeFileSync(
  path.join(encDir, idA + '.jsonl'),
  [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'oi' } }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Titulo velho' }),
    JSON.stringify({ type: 'assistant' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'Titulo novo' }),
  ].join('\n') + '\n',
);

t('encodeProjectDir troca não-alfanumérico por hífen', () => {
  assert.strictEqual(cs.encodeProjectDir(projectPath), 'C--Users-a-b-Documents-proj');
});
t('projectDirCandidates acha a pasta ignorando a caixa do drive', () => {
  const c = cs.projectDirCandidates(projectPath, projBase);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(path.basename(c[0]), 'c--Users-a-b-Documents-proj');
});
t('transcriptHasUser true quando há mensagem de usuário', () => {
  assert.strictEqual(cs.transcriptHasUser(path.join(encDir, idA + '.jsonl')), true);
});
t('latestAiTitle pega o ÚLTIMO aiTitle', () => {
  assert.strictEqual(cs.latestAiTitle(path.join(encDir, idA + '.jsonl')), 'Titulo novo');
});
t('historyExists acha por id; falso pra id inexistente', () => {
  assert.strictEqual(cs.historyExists(idA, projBase), true);
  assert.strictEqual(cs.historyExists('nao-existe', projBase), false);
});
t('transcriptPath resolve o caminho do id no projeto', () => {
  assert.strictEqual(
    cs.transcriptPath(projectPath, idA, projBase),
    path.join(encDir, idA + '.jsonl'),
  );
});
t('snapshot + newTranscript detectam o transcript novo com user', () => {
  const snap = cs.snapshot(projectPath, projBase); // só idA
  assert.ok(snap.has(idA));
  fs.writeFileSync(
    path.join(encDir, idB + '.jsonl'),
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'novo' } }) + '\n',
  );
  assert.strictEqual(cs.newTranscript(projectPath, snap, projBase), idB);
});
t('newTranscript NÃO captura quando há 2 novos (ambíguo)', () => {
  assert.strictEqual(cs.newTranscript(projectPath, new Set(), projBase), null);
});
t('newTranscript ignora transcript novo SEM mensagem de usuário', () => {
  const snap = cs.snapshot(projectPath, projBase); // idA + idB
  fs.writeFileSync(
    path.join(encDir, idEmpty + '.jsonl'),
    JSON.stringify({ type: 'system' }) + '\n',
  );
  assert.strictEqual(cs.newTranscript(projectPath, snap, projBase), null);
});

// --- Título por fallback (sessão sem ai-title) ---
const idSlash = '44444444-dddd';
fs.writeFileSync(
  path.join(encDir, idSlash + '.jsonl'),
  [
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content:
          '<command-message>opensquad</command-message>\n<command-name>/opensquad</command-name>\n<command-args>blog-seo-laroye</command-args>',
      },
    }),
    JSON.stringify({ type: 'assistant' }),
    JSON.stringify({ type: 'last-prompt', lastPrompt: '/opensquad blog-seo-laroye' }),
  ].join('\n') + '\n',
);
const idMsg = '55555555-eeee';
fs.writeFileSync(
  path.join(encDir, idMsg + '.jsonl'),
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'corrige o bug do login' } }) +
    '\n',
);

t('firstPromptTitle pega o last-prompt já limpo', () => {
  assert.strictEqual(
    cs.firstPromptTitle(path.join(encDir, idSlash + '.jsonl')),
    '/opensquad blog-seo-laroye',
  );
});
t('firstPromptTitle cai na 1a mensagem do usuário sem last-prompt', () => {
  assert.strictEqual(
    cs.firstPromptTitle(path.join(encDir, idMsg + '.jsonl')),
    'corrige o bug do login',
  );
});
t('sessionTitle usa o prompt quando NÃO há ai-title', () => {
  assert.strictEqual(
    cs.sessionTitle(path.join(encDir, idSlash + '.jsonl')),
    '/opensquad blog-seo-laroye',
  );
});
t('sessionTitle PREFERE o ai-title quando existe', () => {
  assert.strictEqual(cs.sessionTitle(path.join(encDir, idA + '.jsonl')), 'Titulo novo');
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
