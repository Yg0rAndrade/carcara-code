#!/usr/bin/env node
/**
 * Hook UserPromptSubmit — backup diário.
 *
 * Verifica se já existe um commit feito HOJE neste repositório. Se não houver,
 * injeta um lembrete no contexto do Claude Code para que ele faça um commit de
 * backup (e push) do estado atual. Assim o projeto sempre tem um backup do dia.
 *
 * Silencioso (saída vazia) quando já há commit de hoje ou quando não é um repo git.
 */
const { execSync } = require('child_process');
const path = require('path');

const repo = path.resolve(__dirname, '..');

function git(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

// É um repositório git?
if (git('rev-parse --is-inside-work-tree') !== 'true') process.exit(0);

// Já existe commit hoje (desde a meia-noite local)?
const commitHoje = git('log -1 --since="midnight" --format=%h');
if (commitHoje) process.exit(0); // backup do dia já feito

// Sem commit hoje: descobrir o que há para salvar.
const status = git('status --porcelain');
const branch = git('rev-parse --abbrev-ref HEAD') || 'main';
const naoEnviados =
  git('log --oneline @{u}.. 2>/dev/null') || git(`log --oneline origin/${branch}.. 2>/dev/null`);

let estado;
if (status) {
  estado = 'Há alterações não commitadas no diretório de trabalho.';
} else if (naoEnviados) {
  estado = 'Working tree limpo, mas há commits locais ainda não enviados (push pendente).';
} else {
  estado = 'Working tree limpo e nada pendente — nenhum backup necessário hoje.';
}

if (!status && !naoEnviados) process.exit(0); // nada a fazer

const msg = [
  '[BACKUP DIÁRIO] Ainda não há commit de hoje neste repositório (carcara-code).',
  estado,
  'Antes de prosseguir com o pedido do usuário, faça o backup do dia:',
  '1. Se houver alterações, faça `git add -A` e um commit com mensagem descritiva do dia.',
  '2. Faça `git push` para o GitHub (origin/' + branch + ').',
  'Faça isso uma vez por dia, de forma silenciosa, e então atenda o pedido normalmente.',
].join(' ');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: msg,
    },
  }),
);
