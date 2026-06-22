# AGENTS.md

Este arquivo serve para que o **Claude Code** (e qualquer agente de IA) entenda o
propósito deste projeto antes de começar a trabalhar nele.

## O que é o Carcará Code

O **Carcará Code** é uma **IDE minimalista para o Claude Code**, com cara de Lovable.
Ele nasceu para **facilitar o uso do Claude Code em vários projetos ao mesmo tempo**.

A ideia é ser um **simplificador**: o VS Code tem muitas funções que, no dia a dia
de quem só quer conversar com o Claude Code e ver o resultado, não fazem falta e
acabam atrapalhando. Este projeto corta toda essa firula e deixa só o essencial.

## A ideia central

Em vez de uma IDE cheia de painéis, menus e configurações, o **Carcará Code** oferece
três painéis e nada mais:

1. **Rail** — uma barra lateral com um ícone por projeto. Ele varre uma pasta raiz
   (padrão: `~/Documents/github`) e cada subpasta vira um projeto clicável. É assim
   que você alterna entre vários projetos rapidamente.
2. **Chat** — a conversa com o Claude Code naquele projeto, usando o Claude Agent SDK
   com o `cwd` apontando para a pasta do projeto selecionado.
3. **Preview** — detecta o script `dev`/`start` do projeto, sobe o servidor e mostra
   o site embutido na própria IDE. Se já estiver rodando, não sobe de novo.

O objetivo é o fluxo "Lovable": você escolhe o projeto, pede a mudança no chat e vê o
resultado na hora, sem se perder em configurações.

## Pontos importantes para quem for desenvolver

- **Stack:** Electron + React (Vite) + Tailwind. Processo principal em `main.js`,
  preload em `preload.js`, e a UI em `src/`.
- **Autenticação:** o chat usa a **assinatura** do Claude Code (a mesma do `claude`
  no terminal). **Nunca** use chave de API — sempre a assinatura/login existente.
- **Permissões:** o chat roda em modo `bypassPermissions` de propósito, para manter o
  fluxo sem confirmações a cada passo.
- **Como rodar:** `npm install` e depois `npm start`.
- **Atenção (Electron + terminal do Claude Code):** se for abrir de dentro de um
  terminal do Claude Code, limpe a variável `ELECTRON_RUN_AS_NODE` antes
  (`$env:ELECTRON_RUN_AS_NODE=$null; npm start`), senão o Electron roda como Node puro.

## Backup diário automático

Este repositório está no GitHub (`origin`: https://github.com/Yg0rAndrade/carcara-code).
Para garantir que o projeto **sempre tenha um backup do dia**, existe um hook
`UserPromptSubmit` em `.claude/settings.json` que roda `scripts/daily-backup-check.cjs`
a cada mensagem do usuário. O script verifica se já há um commit feito **hoje**:

- Se já houver commit do dia, fica em silêncio.
- Se **não** houver, ele injeta um lembrete no contexto. Ao ver esse lembrete, o
  Claude Code deve, **uma vez por dia** e de forma discreta, fazer `git add -A`, um
  commit com mensagem descritiva e `git push` para o `origin` — e só então atender ao
  pedido do usuário normalmente.

## Em resumo

Quando você (Claude Code) for atuar neste repositório, lembre-se: o foco é **manter as
coisas simples**. Toda contribuição deve preservar a proposta de uma IDE enxuta,
focada em conversar com o Claude Code e visualizar o resultado, sem trazer de volta a
complexidade que justamente este projeto quer evitar.
