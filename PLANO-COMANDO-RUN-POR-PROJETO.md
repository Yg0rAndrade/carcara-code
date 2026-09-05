# Comando de run por projeto

Plano de execução da tarefa "Comando de run por projeto (automático vs. personalizado) +
abrir sozinho ou não", de [tarefas.md](tarefas.md). Documento de trabalho: some quando a
tarefa for lançada e virar linha no CHANGELOG.

## O problema

O comando que sobe o Preview é adivinhado e universal. `detectDevCommand` ([main.js](main.js))
lê o `package.json` e escolhe `dev` → `start` → `serve`, sem o usuário poder interferir.
Isso quebra em qualquer projeto cujo "rodar" não seja um servidor web numa porta. O caso
gritante é abrir o próprio Carcará dentro do Carcará: o `npm run dev` dele sobe o Electron,
não um site, e o Preview fica eternamente procurando a porta.

## Pesquisa (o que os outros fazem)

- **VS Code / Cursor (`tasks.json`)** — o comando de dev não é adivinhado, é declarado por
  workspace. Cada tarefa tem `command`, `args`, `cwd` e `env`, e uma delas pode carregar
  `"group": {"kind": "build", "isDefault": true}` para virar a padrão. Em workspace
  multi-raiz cada pasta tem o seu `tasks.json`. Lição: a configuração é **por projeto**, e o
  comando resolvido aparece inteiro no terminal, sem caixa-preta.
- **Rodar sozinho ao abrir** — existe como `runOptions.runOn: "folderOpen"`, mas é
  **opt-in e travado atrás do Workspace Trust**: `task.allowAutomaticTasks` vem em `off`, o
  editor pergunta uma vez por pasta, e tarefa automática nunca roda em workspace não
  confiável. Lição: rodar comando sozinho ao abrir pasta é tratado como decisão de
  segurança, não como conveniência silenciosa.
- **Vite** — `server.port` mais `strictPort` no config do projeto, e `--port` na linha de
  comando vence o arquivo. É o que o `devPortFlags` já explora.

Onde a gente se afasta de propósito: o padrão do interruptor de abrir sozinho é **ligado**,
não desligado. O Carcará não roda comando arbitrário de um repositório que a pessoa acabou
de clonar sem saber; ele roda o que a própria pessoa cadastrou na tela de Configurações, e
o app inteiro já é um lançador de projetos. O `runOn: folderOpen` do VS Code protege contra
um `tasks.json` que veio dentro do repositório; aqui a fonte é a config local do usuário,
que ninguém injeta por commit.

## Decisões

**Uma chave só, não duas.** `cfg.projectRun[path] = { mode, command, autoStart }`, no mesmo
padrão de `cfg.projectPorts` e `cfg.projectCli`. A tarefa sugeria `cfg.projectCommands`, mas
o interruptor de abrir sozinho não é um comando, e dois mapas separados dobrariam o IPC e a
leitura para alimentar um único card na tela. Um par `run:get` / `run:set` espelha
`port:get` / `port:set`.

**`{port}` no comando personalizado.** O app escolhe a porta antes de subir (fixa ou livre) e
não tem como injetar `--port` num comando arbitrário. Então: `PORT` vai no ambiente, e quem
precisa da porta na linha escreve `{port}` onde ela entra. Sem `{port}`, o de sempre segue
valendo, com a porta real saindo do log.

**Comando explícito vence detecção.** Um projeto com comando personalizado é servível mesmo
sem `package.json` e sem PHP, então ele entra antes do ramo de PHP no `preview:start` e vira
um `previewType` próprio na lista de projetos.

**O automático deixa de ser caixa-preta.** O `run:get` devolve o comando que a detecção
resolve agora, e a tela mostra essa linha embaixo da opção Automático.

## Passos

1. **main.js** — `runConfigFor(path)` e `resolveRunCommand(path)`; IPC `run:get` / `run:set`.
2. **main.js** — extrair de `preview:start` a parte que vigia o processo (probe, `markReady`,
   log, saída) para um `superviseServer(...)`, e usar nos dois caminhos: o de sempre e o novo
   personalizado. O caminho de PHP fica intocado.
3. **main.js** — `previewType` e `autoStart` do projeto passam a considerar a config.
4. **preload.js** — expor `runGet` / `runSet`.
5. **previewAutoStart.js** — nova entrada `autoStart`; desligado, o efeito não sobe nada.
6. **PreviewPanel.jsx** — passar `autoStart` do projeto para a decisão.
7. **SettingsModal.jsx** — seletor Automático/Personalizado, campo do comando e interruptor
   de abrir sozinho, ao lado da porta fixa.
8. **i18n** — chaves novas nos 18 idiomas, com `npm run test:i18n`.

## Testes

- `src/lib/previewAutoStart.test.js` — casos do `autoStart` desligado.
- Módulo puro para a resolução do comando (`{port}`, modo, comando vazio) com teste próprio.
- Smoke manual: projeto com comando personalizado que sobe um servidor de verdade, e o
  Carcará-no-Carcará com o abrir sozinho desligado.
