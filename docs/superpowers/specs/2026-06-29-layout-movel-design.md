# Layout móvel — mover o painel do Claude Code e o rail de lado

**Data:** 2026-06-29
**Status:** Design aprovado, aguardando revisão do spec

## Problema

Hoje o layout do app é fixo: o **rail** (barra vertical de ícones de projetos) fica
sempre à esquerda, depois o painel do **Claude Code** (chat), depois o **Preview**.
O usuário quer poder **mover o painel do Claude Code para o outro lado** (trocar com o
Preview) e **mover o rail para o outro lado**, com o mesmo gesto de arrastar-e-soltar
que já existe para as sessões do Claude dentro do `ChatPanel`.

Além do gesto na própria tela, quer **templates de layout** prontos na aba
Configurações › Aparência.

## Decisões de escopo (já validadas)

1. **Lado do painel do Claude:** padrão **global** + **override por projeto**.
   - Arrastar o painel na tela → grava no **projeto** ativo.
   - Escolher um preset em Configurações → grava o **padrão global**.
2. **Lado do rail:** **global** (uma barra única pra todos os projetos).
   - Arrastar o rail → muda o lado global.
   - Os presets de Configurações também definem o lado do rail.
3. **Gatilhos:** os dois — **drag and drop** na tela (gesto principal) **e** os
   4 presets visuais em Configurações › Aparência.
4. **Testes:** o usuário valida manualmente usando o app. Cobertura automatizada
   fica na função pura de resolução de layout (ver abaixo).

## Modelo de estado

Dois níveis, espelhando o padrão `projectCli` que já existe no `config.json`.

- **Global** (`config.json` → `layout`):
  ```json
  { "railSide": "left" | "right", "claudeSide": "left" | "right" }
  ```
  Padrões: ambos `"left"` (= o layout atual de hoje).

- **Por projeto** (`config.json` → `projectLayout[projectPath]`):
  ```json
  { "claudeSide": "left" | "right" }
  ```
  Opcional. Só o lado do Claude é por projeto (o rail é global).

### Função pura de resolução

```js
// lib/layout.js
export function resolveLayout(global, projectOverride) {
  return {
    railSide: global?.railSide === 'right' ? 'right' : 'left',
    claudeSide:
      projectOverride?.claudeSide === 'left' || projectOverride?.claudeSide === 'right'
        ? projectOverride.claudeSide
        : (global?.claudeSide === 'right' ? 'right' : 'left'),
  };
}
```

- Override do projeto vence o global.
- Ausência de override (ou valor inválido) cai no global.
- Global ausente/inválido cai em `'left'`.

Essa função é o ponto testável por unidade.

## Persistência e ponte (IPC)

Novos handlers no `main.js`, no mesmo molde de `ai:get` / `ai:set`
([main.js:372-379](../../../main.js)):

| Canal IPC            | Faz                                          |
|----------------------|----------------------------------------------|
| `layout:get`         | retorna o objeto global `layout`             |
| `layout:set`         | grava `{ railSide, claudeSide }` global      |
| `layout:getProject`  | retorna `projectLayout[path]` (ou `null`)    |
| `layout:setProject`  | grava `projectLayout[path] = { claudeSide }` |

Expostos no `preload.js` como `window.api.getLayout()`, `setLayout(obj)`,
`getProjectLayout(path)`, `setProjectLayout(path, obj)`.

### Boot instantâneo (sem piscar)

- O **layout global** é espelhado em `localStorage` (igual a `appZoom`, `railWidth`,
  tema) e lido **síncrono** no primeiro render, pra não haver salto visual. O
  `config.json` continua a fonte da verdade — ao montar, o App lê do main e
  re-sincroniza o espelho.
- O **override por projeto** é lido ao trocar de projeto ativo (como o `SettingsModal`
  já faz com `getAi`), com um cache em `localStorage` por caminho
  (`projectLayout:v1:<path>`) pra evitar piscada ao abrir o projeto.

## Estado no renderer

Um `LayoutProvider` (contexto React, no estilo do `useTheme`) compartilha o layout
global entre `App` e `SettingsModal`:

- `railSide`, `claudeSide` (global) + setters que persistem (main + espelho local).
- O App calcula o **efetivo** do projeto ativo com `resolveLayout(global, override)`,
  onde `override` vem do estado `projectClaudeSide` (carregado por projeto).

## Renderização no App

Estrutura atual em [App.jsx:275-359](../../../src/App.jsx): `<Rail>` → `<ResizeBar>` →
`<ResizablePanelGroup>` com `chat` (order 1) e `preview` (order 2).

Mudanças, dirigidas pelo layout efetivo:

- **`railSide === 'right'`:** o `<Rail>` + `<ResizeBar>` são renderizados **depois** do
  grupo de painéis (o container pai já é `flex`, então é só ordem condicional do JSX).
- **`claudeSide === 'right'`:** dentro do `ResizablePanelGroup`, o painel de `preview`
  vem antes do `chat`; trocam-se os valores de `order` e a ordem do JSX dos dois
  `ResizablePanel`.
- **Botões flutuantes** (parte delicada, centralizar num helper de posição):
  - O botão de recolher no divisor ([App.jsx:342-352](../../../src/App.jsx)) vira
    `ChevronRight`/`ChevronLeft` conforme o lado do chat.
  - A "bolinha" de reabrir o chat ([App.jsx:385-395](../../../src/App.jsx)), hoje colada
    na borda do rail via `left: railWidth-14`, passa a ser posicionada conforme o lado
    efetivo do chat **e** do rail (pode ser borda esquerda ou direita da tela).

## Interação: drag and drop (estilo das sessões)

Reusar o mesmo gesto e visual do drag de abas do `ChatPanel`
([ChatPanel.jsx:780-895](../../../src/components/ChatPanel.jsx)): HTML5 nativo
(`draggable` + `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`), com overlay de zona
realçado em `border-primary bg-primary/20`.

### Arrastar o painel do Claude (override por projeto)

- O **cabeçalho do painel do Claude** ([App.jsx:305-334](../../../src/App.jsx)) ganha um
  "punho" arrastável (ícone de grip, `draggable`), como a aba da sessão.
- Ao iniciar, o App entra em modo `panelDrag` e cobre a área de trabalho com **duas
  zonas de drop** (metade esquerda / metade direita). A zona sob o cursor acende
  (mesmo visual do `dropTarget`).
- Soltar à esquerda → `claudeSide = 'left'`; à direita → `'right'`. Persiste no
  override do projeto ativo. Como só há dois painéis, o efeito é trocar de lado.

### Arrastar o rail (global)

- O **rail** vira arrastável (um punho no topo, ou o corpo do rail). Mesmo gesto.
- Soltar à esquerda/direita muda `railSide` **global**.

### Gotcha do webview (obrigatório)

O Preview é um `webview` do Electron e **engole** eventos de mouse/drag. Durante
qualquer arraste, usar um overlay `fixed inset-0 z-50` que recebe `dragover`/`drop`
por cima do webview — mesma técnica do `railResizing`
([App.jsx:406](../../../src/App.jsx)). Sem isso, soltar sobre o Preview não registra.

### Reuso de código

Extrair `computeZone` e `ZONE_STYLE` de `ChatPanel.jsx` pra um módulo compartilhado
(`lib/dropZones.js`) e reusar nos dois lugares. Aqui o uso fica restrito a `left`/`right`.

## UI de controle: presets em Configurações › Aparência

Nova seção "Layout" na aba Aparência do `SettingsModal`
([SettingsModal.jsx:254-320](../../../src/components/SettingsModal.jsx)), abaixo de
tema/zoom/terminal. **4 presets visuais** clicáveis (miniaturas mostrando rail + C + P),
combinando lado do rail + lado do Claude:

| Preset | railSide | claudeSide | Miniatura |
|--------|----------|------------|-----------|
| 1 | left  | left  | `[‖ C P]` |
| 2 | left  | right | `[‖ P C]` |
| 3 | right | left  | `[C P ‖]` |
| 4 | right | right | `[P C ‖]` |

(`‖` = rail). Clicar grava o **global** (`layout:set`). O preset ativo é marcado com o
mesmo `ring-primary` dos outros cartões da aba. Presets definem o padrão; o drag por
projeto sobrescreve só o lado do Claude daquele projeto.

## Arquivos afetados

- **Novos:**
  - `src/lib/layout.js` — `resolveLayout` (pura) + helpers de leitura/escrita do espelho local.
  - `src/lib/dropZones.js` — `computeZone` + `ZONE_STYLE` extraídos (compartilhados).
  - `src/lib/layoutContext.jsx` (ou dentro de `theme.jsx`) — `LayoutProvider`/`useLayout`.
- **Editados:**
  - `main.js` — handlers `layout:get/set/getProject/setProject`.
  - `preload.js` — pontes correspondentes.
  - `src/App.jsx` — ordem condicional de rail/painéis, posição dos botões flutuantes,
    modo `panelDrag` + zonas de drop + overlay anti-webview, punho arrastável no cabeçalho.
  - `src/components/Rail.jsx` — punho/arraste do rail.
  - `src/components/ChatPanel.jsx` — importar `computeZone`/`ZONE_STYLE` do novo módulo.
  - `src/components/SettingsModal.jsx` — seção "Layout" com os 4 presets.

## Testes

- **Unidade:** `resolveLayout` — override vence global; ausência cai no global; valor
  inválido cai em `'left'`.
- **Manual (usuário):**
  - Arrastar o painel do Claude pra direita num projeto; reabrir o projeto → volta à
    direita; outro projeto continua à esquerda.
  - Arrastar o rail pra direita → vale pra todos os projetos e sobrevive ao reload.
  - Clicar um preset em Configurações → muda o padrão global; projeto com override
    mantém o override.
  - Soltar sobre a área do Preview funciona (overlay anti-webview).
  - Recolher/expandir o chat com Claude à direita: botões flutuantes no lado certo.

## Fora de escopo (YAGNI)

- Arrastar o Preview em si (só Claude e rail são arrastáveis; o Preview ocupa o resto).
- Layouts empilhados (cima/baixo) para os painéis principais — só esquerda/direita.
- Override de `railSide` por projeto (rail é global por decisão).
