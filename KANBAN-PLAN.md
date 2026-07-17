# Kanban em Markdown — plano (0.2.0)

Board estilo Trello cuja **fonte da verdade é o `tarefas.md` da raiz do projeto**.
Substitui a aba "Tarefas" na barra; a aba antiga (TodoWrite do Claude) vai pro dropdown.

Item de origem: `tarefas.md` → "Kanban em Markdown (board que é um arquivo)".

## Decisões travadas (com o usuário, 2026-07-16)

| #   | Decisão                             | Escolha                                                                                            |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Aba "Tarefas" (TodoWrite do Claude) | Vai pro dropdown do acordeão, **1ª opção**                                                         |
| 2   | Kanban                              | **Nova aba na barra, no lugar da Tarefas**                                                         |
| 3   | Arquivo                             | `tarefas.md` na raiz. **Não mexer no `.gitignore`** do projeto do usuário                          |
| 4   | Colunas                             | **Livres**: `## Título` = coluna, na ordem do arquivo                                              |
| 5   | Concluir                            | **Sem coluna "Feito"**: `- [x]` conclui e **oculta** o card; toggle "mostrar concluídas" revela    |
| 6   | Mecanismo p/ o Claude               | **Só o header de instrução** no topo do `tarefas.md` (sem skill, sem CLI)                          |
| 7   | Drag & drop                         | **`@dnd-kit/react` 0.5.0**                                                                         |
| 8   | Serialização                        | **Splice por offset** — nunca round-trip                                                           |
| 9   | `###` dentro de coluna              | Separador **colapsável dentro da coluna** (recomendação minha; usuário não respondeu — reversível) |
| 10  | Card longo                          | **Título no card, corpo ao clicar** (idem #9)                                                      |

## Por que essas decisões (pesquisa, não chute)

**Formato — Obsidian Kanban é a arte prévia** (`obsidian-community/obsidian-kanban` v2.0.51).
Usa `## lane` + `- [ ]`, igual ao que o usuário já escreve à mão. Truque roubado: a coluna
"concluída" não é especial pelo nome, é marcada explicitamente (lá é um `**Complete**`
logo abaixo do heading) — desacopla semântica de nome. **Não** copiar: ele localiza esse
marcador (`t('Complete')`), o que torna o formato dependente de idioma.

**Round-trip de markdown não existe.** Testado empiricamente com remark/mdast: mesmo com
todas as opções tunadas, 5 perdas sobrevivem sem conserto. A pior aqui é **CRLF → LF**
([remark#660](https://github.com/remarkjs/remark/issues/660), fechada wontfix) — num projeto
Windows-first, salvar reescreveria toda linha do arquivo. O readme do `mdast-util-to-markdown`
admite: _"complete roundtripping is impossible"_. mdast é AST, não CST: formatação é
descartada por design.
→ **Solução: parsear só pra localizar** (nós do mdast carregam offset em bytes) e **recortar
a string original**. Linhas não tocadas ficam byte-idênticas. É o que o Obsidian faz nos
cards (guarda `titleRaw` e nunca re-serializa o texto do usuário).

**DnD — armadilha de Electron que decide sozinha.** Pragmatic DnD (Atlassian) e react-dnd
usam a API HTML5 nativa, **quebrada perto de `<webview>`**, e o Electron fechou as 3 issues
como _not planned_ ([#18226](https://github.com/electron/electron/issues/18226),
[#39371](https://github.com/electron/electron/issues/39371),
[#42252](https://github.com/electron/electron/issues/42252)). O Preview do Carcará É um
`<webview>`. Sobram os pointer-based: dnd-kit e @hello-pangea/dnd. `react-beautiful-dnd`
está arquivada e não instala no React 19.

**Ressalva registrada (decisão #6):** todo tool de board markdown feito pra agente
(Backlog.md, kanban-md, Kanban Markdown) convergiu pra _um arquivo por tarefa + CLI/MCP_ —
ninguém faz o LLM editar o markdown do board na mão, porque ele erra o splice. O usuário
optou pelo header mesmo assim; a força do desenho é o board inteiro num `Read` só.
Se der problema na prática, o upgrade natural é uma skill em `.claude/skills/`.

## O arquivo real (já existe!)

`tarefas.md` já está na raiz, **já no `.gitignore` (linha 29)**, com o backlog real e o
histórico de releases. O parser tem que engolir ele **sem reformatar**:

```markdown
# Tarefas

Lista de tarefas do Carcará Code. Quando você me pedir para "colocar na tarefa",
eu adiciono aqui.

## A fazer

- [ ] **Título em negrito** — descrição longa que continua
      na linha seguinte com indentação de 2 espaços.
  - **Sub-bullet:** detalhe aninhado com [link](main.js).
  - Outro sub-bullet.

## Concluídas

### 0.1.9 (lançada em 2026-07-16)

- [x] **Item concluído** — texto.

### 0.1.8

- [x] ...
```

Características que o parser precisa respeitar:

- `#` H1 + parágrafo de intro **antes** da 1ª coluna → não é coluna, é preâmbulo (preservar).
- Cards são **multi-linha e ricos** (negrito, sub-bullets, links). O card = 1º `listItem` de
  topo; título = 1ª linha; corpo = o resto.
- `###` só aparece dentro de `## Concluídas`, agrupando por versão.
- Uma coluna cujos cards são **todos `[x]`** é entendida como arquivo → mostra tudo mesmo
  com o toggle "mostrar concluídas" desligado (senão "Concluídas" renderiza vazia).

## Arquitetura

```
src/lib/kanban.js          parser + splicer (PURO, sem React, sem fs) ← núcleo testável
src/lib/kanban.test.js     vitest (round-trip byte-idêntico é o teste-chave)
src/components/KanbanPanel.jsx   UI (colunas, cards, dnd-kit, modal de card)
src/components/PreviewPanel.jsx  troca de aba + MoreTools + render site
src/lib/locales/*.json     18 idiomas
src/App.jsx                comando na paleta (Ctrl+K)
```

**Zero IPC nova**: `window.api.readFile(p)` / `window.api.writeFile(p, c)` já existem
(`preload.js:249-253`). Watch: `fs:changed` já é emitido pra qualquer escrita no projeto
(`main.js:1474`) — dá pra pegar carona e re-ler; sem `todos:subscribe` novo.

**Guarda do eco (copiado do CodeView.jsx:496-517):** depois de salvar, o `fs.watch` devolve
um `fs:changed`. Não usar flag de supressão — comparar conteúdo e sair se igual
(`x.content !== r.content`). O loop termina por igualdade de conteúdo, não por supressão.

### API de `src/lib/kanban.js`

```js
parseBoard(md) -> {
  preamble: {start, end},
  columns: [{
    name, headingStart, headingEnd, start, end,
    groups: [{name, level:3, start, end}],
    cards: [{id, done, group, titleRaw, bodyRaw, raw, start, end}]
  }]
}
// mutações — todas retornam markdown NOVO via splice, nunca re-serializam o resto:
moveCard(md, cardId, toColumnName, toIndex) -> md
toggleDone(md, cardId)                      -> md
addCard(md, columnName, text)               -> md
removeCard(md, cardId)                      -> md
renameColumn(md, oldName, newName)          -> md
addColumn(md, name) / removeColumn(md, name)-> md
BOARD_TEMPLATES                             // "templates prontos" pedidos no item original
INSTRUCTION_HEADER                          // header p/ o Claude (decisão #6)
```

Regras de implementação:

- Parsear com `mdast-util-from-markdown@2.0.3` (já em node_modules como transitiva do
  react-markdown; promover a dep direta). **Sem extensão GFM**: sem ela o `- [x]` fica no
  texto cru do listItem, que é justamente o que queremos ler/escrever. Menos dep, mais controle.
- `id` do card = hash estável do `raw` (+ contador pra duplicatas). Não usar offset (muda) nem
  `coluna:índice` (muda no move, quebra reconciliação do React durante o drag).
- **Aplicar edits do maior offset pro menor**, senão os offsets anteriores invalidam.
- `readFile`/`writeFile` em utf8, **nunca normalizar quebra de linha**.
- Gate em `!active.remote`: `fs:watch` é no-op remoto (`main.js:1491`) e o join de path
  quebraria em `ssh://`.

## Fases

1. ✅ **`kanban.js` + testes** — 42 testes, incluindo 3 contra o `tarefas.md` real:
   mover um card mantém o multiset de linhas **idêntico**; concluir muda **1 byte**;
   CRLF preservado.
2. ✅ **`KanbanPanel.jsx`** — read/write + colunas + cards + modal + templates.
3. ✅ **dnd-kit** — `useSortable` no card, `useDroppable` na coluna com
   `CollisionPriority.Low` (senão soltar em cima de um card vira "fim da coluna").
4. ✅ **Fiação** — PreviewPanel (aba Kanban + Tarefas no dropdown), i18n × 18, paleta.
5. ⬜ **Smoke manual** — FALTA. `npm run build` verde e 242/242 testes NÃO provam que a tela
   abre (DESAFIOS.md, "TDZ: useEffect no topo": build só compila; erro de render só aparece
   no 1º render real). App já está aberto pra isso.

### Achados que mudaram o plano no caminho

- **O `tarefas.md` já existia** (e já no `.gitignore`), com o backlog real e o histórico por
  versão — o formato não foi inventado, foi lido do que já está lá. Ver DESAFIOS.md.
- **Índice era a abstração errada** pra posição do card: a UI indexa entre os **visíveis** e
  o splice conta **todos** → com concluídas ocultas o card cairia no lugar errado, calado.
  Trocado por `beforeCardId`. Teste dedicado cobre exatamente esse caso.

### Sem fazer (fora do escopo travado)

- Arrastar **colunas** (só cards). Renomear/criar/apagar coluna existe na lib
  (`renameColumn`/`addColumn`/`removeColumn`) mas ainda **não tem UI**.
- Reordenar `###` ou mover card entre separadores.

## Armadilhas conhecidas (DESAFIOS.md)

- **TDZ**: `PreviewPanel.jsx` tem 2200+ linhas. Declarar `inKanban` **junto** dos outros
  `inCode`/`inTodos` (linha ~1847), nunca um `useEffect` no topo citando const de baixo.
- **`npm run build` é obrigatório** pra ver mudança em `src/` (o app carrega de `dist/`).
- **Não relançar o app à força** — pode ter sessão viva do Claude.
- **2 instâncias**: antes de smoke, conferir que só há 1 processo main de electron.
- **PowerShell corrompe UTF-8**: editar locale com acento só via Edit tool, nunca
  Get-Content/Set-Content.
- **i18n**: chave nova = 18 arquivos. Validar com `npm run test:i18n`.

## Modelo por fase

- Fase 1 (parser/splice): **Opus** — é a parte com invariantes sutis.
- Fases 2–4 (UI, fiação, i18n): **Sonnet** basta, o plano está fechado.
- Fase 5 (smoke): humano.
