# Painel de Todos — Design

**Data:** 2026-07-03
**Objetivo:** exibir ao vivo, dentro do Carcará Code, a task list que o Claude Code emite via `TodoWrite`/`TaskCreate` — incluindo sub-agents, tempos por task e uso de tokens — como uma aba do PreviewPanel.

Feature portada da extensão VSCode "Claude Todos" (claude-todos-vscode), reescrita nas convenções deste repo (port idiomático: JS puro, React, shadcn, sem TypeScript/Svelte).

## Contexto

O Carcará roda o CLI real do Claude Code via node-pty e já conhece o `claudeId` de cada aba de sessão (`claude-sessions.cjs` resolve `transcriptPath()` e lê o `.jsonl` para títulos). Os eventos de todos aparecem nesse mesmo transcript como blocos `tool_use`. Hoje nada os parseia — a feature é nova, sem refactor.

Diferença importante versus a extensão original: a bridge de hooks (SessionStart/UserPromptSubmit em `~/.claude/settings.json`) **não é necessária nem portada** — ela só existia para descobrir qual sessão pertence a qual janela do VSCode, e aqui o app já sabe.

## O que o painel mostra

- **Agente principal** e **sub-agents**, cada um em sua seção, com a task list transicionando `pending → in_progress → completed` ao vivo.
- **Tempos por task**: relógio ticando para a task `in_progress` (a partir de `startedAt`), duração final para as concluídas.
- Sub-agents com status `running`/`completed`; concluídos e sem todos vão para uma seção de histórico (divisor visual).
- **Tabela de uso**: tokens input/output/cache por modelo e por agente, indicador de contexto (tokens da última mensagem vs. janela de 200k/1M) e estatísticas de cache.
- Estados vazios: "sem sessão ativa" e "aguardando tasks" (sessão ativa, mas ainda sem eventos de todo).

O painel **segue a aba de chat ativa**: ao trocar de aba, mostra os todos da nova sessão. Sem seletor/pin manual.

## Arquitetura

### 1. Parser puro — `claude-todos-core.cjs` (raiz)

Módulo irmão de `claude-sessions.cjs`: funções puras, só `fs`/`path`, sem Electron, testável em node puro.

- `parseTodos(jsonlText)` — reconstrói a task list suportando **dois schemas**:
  - **Legado `TodoWrite`**: cada `tool_use name:"TodoWrite"` carrega o snapshot completo em `input.todos[]`. O estado atual é o último snapshot; os timings vêm da varredura cronológica de todos os snapshots (first-write-wins por `content`: primeira vez que aparece como `in_progress` ⇒ `startedAt`; primeira vez como `completed` ⇒ `completedAt`).
  - **Novo `TaskCreate`/`TaskUpdate`** (flag `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`): stream de eventos — create adiciona a task (id revelado no `tool_result`), update muta por `taskId`.
  - Detecção automática de schema por transcript.
- `parseSubagents(mainJsonlText, subagentsDir)` — lê `<proj>/<sessionId>/subagents/agent-*.jsonl`; casa cada arquivo com os blocos `tool_use name:"Agent"` do transcript principal por **prompt idêntico** (a 1ª mensagem `user` do subagent = `input.prompt` do bloco Agent); nome do sub-agent vem de `input.name`, com fallback em `input.description`; status `completed` quando o `tool_result` correspondente traz `toolUseResult.agentId`.
- `parseUsage(jsonlText)` — agrega `message.usage` das mensagens `assistant`: input/output/cache-read/cache-write por modelo; contexto = tokens da última mensagem assistant vs. limite (1M quando o modelo/beta indica janela estendida, senão 200k).
- `buildSnapshot({ claudeDir, cwd, sessionId })` — orquestra: resolve caminhos via `transcriptPath()`/`encodeProjectDir()` (reusados de `claude-sessions.cjs`), lê os arquivos e retorna o snapshot completo.

Formato do snapshot (objeto simples, serializável por IPC):

```js
{
  sessionId,
  mainAgent: { name: 'main', todos: [...], usage: {...} },
  subagents: [{ id, name, status, todos: [...], usage: {...} }],
  usage: { byModel: [...], context: { tokens, limit }, cache: {...} },
  updatedAt
}
// todo: { content, activeForm, status, startedAt?, completedAt? }
```

`~/.claude/todos/` (Claude Code 1.x) é ignorado. `CLAUDE_CONFIG_DIR` é respeitado (como já faz `projectsBase()`).

### 2. IPC e watching (main.js + preload.js)

- **`todos:subscribe` (invoke)** — renderer passa `sessionId` (o `claudeId` da aba ativa); o main inicia o watching e responde/emite o primeiro snapshot. Nova subscription substitui a anterior (só existe um painel).
- **`todos:unsubscribe` (invoke)** — para o watching (painel fechado/oculto).
- **`todos:snapshot` (push)** — main → renderer via `safeSend`, sempre que o snapshot muda; consumido com `window.api.onTodosSnapshot(cb)` (padrão `window.api.on` com função de cleanup).
- **Watching**: polling de mtime a cada 1,5s (mesmo padrão do `startClaudeWatcher`) no transcript principal e na pasta `subagents/` da sessão. Sem `fs.watch` recursivo. Reparse apenas quando algum mtime muda; push apenas quando o snapshot difere do anterior (comparação por JSON).
- O main **só parseia enquanto há subscription ativa** — custo zero com o painel fechado.

### 3. UI (renderer, React)

- `src/components/TodosPanel.jsx` — container: recebe o `sessionId` ativo, gerencia subscribe/re-subscribe/unsubscribe (cleanup no unmount e na troca de aba), distribui o snapshot.
- `src/components/todos/AgentSection.jsx` — seção de um agente (header com nome/status/duração + lista de todos + divisor de histórico).
- `src/components/todos/TodoItem.jsx` — item com ícone de status (lucide: círculo/spinner/check), `activeForm` quando `in_progress`, tempo decorrido/duração.
- `src/components/todos/UsageTable.jsx` — tabela de tokens por modelo/agente + barra de contexto.
- Estados vazios com o primitivo `empty-state` existente.
- Relógio ao vivo: `setInterval` de 1s ativo apenas quando existe task `in_progress` e o painel está montado.
- **Registro no `PreviewPanel.jsx`**: lazy import + `<LazyPanel label="Todos">`, `TabsTrigger value="todos"` como aba principal (junto de Preview/Code/Git), flag `inTodos`, render condicional.
- O `sessionId` ativo chega ao PreviewPanel pelo mesmo caminho que o app já usa para coordenar sessão ativa entre ChatPanel/App (prop/context existente — detalhe fica para o plano de implementação).
- Paleta de comandos: entrada `view:todos` no array `commands` do `App.jsx`.
- Tema claro/escuro herdado dos tokens shadcn/Tailwind; sem CSS custom fora do padrão.

### 4. i18n

- Namespace `todos.*` em `src/lib/locales/pt.json` e `en.json`, com paridade (o `npm run test:i18n` cobra).
- Sem locale `es` (o repo só tem pt/en).

## Tratamento de erros

- Transcript inexistente/ilegível ⇒ estado vazio "sem sessão", nunca crash.
- Linha JSONL malformada ⇒ ignorada (try/catch por linha, como `claude-sessions.cjs` já faz).
- Sessão sem eventos de todo ⇒ estado "aguardando tasks".
- Subagent `.jsonl` sem match no transcript principal ⇒ descartado (sem a invocação não há nome/status confiável — mesmo comportamento da extensão original).

## Testes

- `claude-todos-core.test.js` co-localizado (vitest, `environment: node`) com fixtures JSONL inline/arquivo: os dois schemas, timings, sub-agents (match por prompt, fallback de nome), usage, linhas malformadas, transcript vazio.
- Os testes da extensão original (12 suítes) servem de especificação executável para portar os casos relevantes.
- `npm run test:i18n` para a paridade pt/en.
- Verificação manual: `npm run build` + `npm start` com uma sessão real do Claude, conferindo todos ao vivo, sub-agents e a troca de aba.

## Entrega

- Fork `carlosdealmeida/carcara-code` (sem push no upstream) → branch `feat/todos-panel` → PR para `Yg0rAndrade:main`.
- PR em português, com screenshot do painel e nota sobre os dois schemas suportados.

## Fora do escopo

- Session picker/pin manual (o painel segue a aba ativa).
- Locale `es`.
- Suporte a outros CLIs (`opencode`/`codex`/`agy` não emitem esse formato de transcript).
- Leitura do legado `~/.claude/todos/`.
- Bridge de hooks em `~/.claude/settings.json`.
