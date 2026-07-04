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

## Idiomas (i18n) — PT-BR e Inglês

O Carcará Code é **bilíngue**: o usuário escolhe o idioma na aba **Configurações →
Idioma** e toda a interface troca na hora (`'pt'` ou `'en'`). O padrão na primeira
execução segue o idioma do sistema.

> **REGRA OBRIGATÓRIA:** **nenhum texto visível ao usuário pode ser escrito direto no
> JSX.** Toda string de interface tem que passar pelo sistema de i18n e existir nos
> **dois** idiomas. Se você adicionar um botão, tooltip, placeholder, título, mensagem
> de confirmação, toast, estado vazio etc., adicione a chave em PT **e** EN. Texto em
> um idioma só é um bug.

### Como usar (renderer / React)

1. No componente: `import { useT } from '@/lib/i18n';` e, dentro dele, `const t = useT();`
2. Em vez de `<button>Salvar</button>`, escreva `<button>{t('area.salvar')}</button>`.
3. Adicione a chave nos **dois** dicionários:
   - `src/lib/locales/pt.json` → `"area": { "salvar": "Salvar" }`
   - `src/lib/locales/en.json` → `"area": { "salvar": "Save" }`
4. Texto com variável usa tokens `{nome}`: `t('area.ola', { nome })` e no JSON
   `"ola": "Olá, {nome}"`.
5. Fora de um componente (helpers, class components, arrays de escopo de módulo) não dá
   pra chamar o hook — use `tStatic('area.chave')` (também de `@/lib/i18n`) ou guarde a
   **chave** e resolva no ponto de render.

### Strings nativas do Electron (processo main)

Menus de contexto, diálogos e notificações ficam no `main.js` e **não** leem os JSON do
renderer (o main é empacotado à parte). Suas strings vivem em **`main.i18n.cjs`** (raiz)
e são resolvidas pela função `tn('chave', { vars })`. Ao mexer em texto nativo, atualize
os dois idiomas nesse arquivo.

### Antes de fechar qualquer tarefa que mexa em texto

- Rode o smoke de paridade: **`node scripts/i18n-parity.smoke.cjs`** (ou `npm run
  test:i18n`). Ele falha se uma chave existir num idioma e faltar no outro.
- Lembre que edições em `src/` só aparecem após `npm run build`.

### Tom da tradução

PT-BR ao máximo (Cortar, Copiar, Renomear, Aparência…), mas **mantenha o jargão
consagrado** (`Git`, `commit`, `MCP`, `API`, `Preview`, `terminal`, `DevTools`) e os
**nomes próprios** (`Claude Code`, `Codex`, `OpenCode`, `Antigravity`, `GitHub`,
`Carcará Code`) idênticos nos dois idiomas.

> Detalhes completos: `docs/superpowers/specs/2026-06-29-i18n-idiomas-design.md` (design)
> e `docs/superpowers/plans/2026-06-29-i18n-idiomas.md` (plano de implementação).

## Backup diário automático

Este repositório está no GitHub (`origin`: https://github.com/puppe1990/carcara-code;
`upstream`: https://github.com/Yg0rAndrade/carcara-code).
Para garantir que o projeto **sempre tenha um backup do dia**, existe um hook
`UserPromptSubmit` em `.claude/settings.json` que roda `scripts/daily-backup-check.cjs`
a cada mensagem do usuário. O script verifica se já há um commit feito **hoje**:

- Se já houver commit do dia, fica em silêncio.
- Se **não** houver, ele injeta um lembrete no contexto. Ao ver esse lembrete, o
  Claude Code deve, **uma vez por dia** e de forma discreta, fazer `git add -A`, um
  commit com mensagem descritiva e `git push` para o `origin` — e só então atender ao
  pedido do usuário normalmente.

## Notas de versão (release notes) — obrigatório a cada nova versão

Toda vez que for **lançar uma nova versão** (bump de `version` no `package.json` e tag
`v*`, que dispara o build e publica no GitHub Releases), é **obrigatório** documentar o
que mudou, no estilo do **n8n**: duas seções, **Features** (novas funcionalidades) e
**Bug Fixes** (correções). Versão sem notas é uma entrega incompleta.

### Onde escrever

- **`CHANGELOG.md`** na raiz (crie se ainda não existir): uma seção por versão, da mais
  nova para a mais antiga.
- O **mesmo conteúdo** vai na descrição do **GitHub Release** daquela tag.

### Formato (siga este modelo)

```markdown
## [0.2.0] — 2026-07-01

### Features
- Aba CSV: importar e validar arquivos via `csv-core.cjs` (#NN) (hash)

### Bug Fixes
- Corrige paridade de i18n que faltava chave em EN (#NN) (hash)
```

Regras:
- Use **versionamento semântico** (`MAJOR.MINOR.PATCH`) e a **data** no cabeçalho.
- Cada item: descrição curta no imperativo + (quando houver) número da issue/PR e o
  **hash curto** do commit, como o n8n faz.
- Só **Features** e/ou **Bug Fixes**; se uma seção ficar vazia, omita-a.
- Escreva em **PT-BR** (este projeto é PT-BR primeiro), mantendo o jargão consagrado.

### Como montar a lista

Antes do release, gere a base a partir do git e edite à mão para ficar legível:
`git log <ultima-tag>..HEAD --oneline`. Classifique cada commit em Feature ou Bug Fix
(commits de `chore`/`build`/`docs` normalmente ficam de fora das notas ao usuário).

## Em resumo

Quando você (Claude Code) for atuar neste repositório, lembre-se: o foco é **manter as
coisas simples**. Toda contribuição deve preservar a proposta de uma IDE enxuta,
focada em conversar com o Claude Code e visualizar o resultado, sem trazer de volta a
complexidade que justamente este projeto quer evitar.
