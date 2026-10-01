# Plano: legibilidade e posição da árvore de arquivos (aba Código)

Status: **implementado (26/09/2026), 2ª rodada após feedback. Falta conferir no app e commitar.**

## Pedidos do Ygor

1. Poder colocar a árvore de arquivos do lado direito.
2. A árvore é difícil de ler, comparada ao Explorer do VS Code.
3. (2ª rodada) Manter a Hanken Grotesk e os ícones coloridos das pastas; mover a árvore
   pela alça de seis pontinhos (igual ao chat/rail), não por botão; "Atualizar" só no
   botão direito; tamanho do TEXTO nas Configurações, separado do zoom.

## Estado final

- **Lado:** alça `GripVertical` no cabeçalho da árvore; arrastar mostra a zona de
  destino (metade esquerda/direita do painel), soltar grava `codeTreeSide`.
  Layout com `flex-row-reverse`; borda, sombra e resize trocam de lado.
- **Tamanho do texto (global):** Configurações > Aparência, 90–140%, `src/lib/textScale.js`.
  - Classes `text-*` do Tailwind: `corePlugins.fontSize: false` + plugin `scaledFontSize`
    em `tailwind.config.cjs` que gera `calc(<tamanho> * var(--text-scale, 1))` (só px/rem;
    em/% não, já herdam). Nenhuma classe do app precisou mudar.
  - CodeMirror (CodeView, Git, API, MCP): `fontSize: calc(... * var(--text-scale, 1))`.
  - xterm (chat, shell, gerenciar IAs): `scaledPx(13)` + `followTextScale` refaz o fit.
  - Árvore: 14px base × escala; linha/ícone/seta/recuo derivam (`treeMetrics`).
- **Cinza no que o git ignora:** `electron/git-ignored.cjs` (`git check-ignore --stdin -z`),
  `fs:dir` devolve `ignored`; filhos de pasta ignorada herdam. Remoto: sem cinza.
- **Guias de indentação:** linha vertical por pasta aberta, alinhada com a seta.
- **Atualizar:** 1º item do menu do botão direito (árvore, área vazia e busca).
- Ícones coloridos das pastas: mantidos (sem opção de desligar).

## Bug da 1ª rodada

`Number(localStorage.getItem(x))` com chave vazia dá 0, e o clamp mandava pro mínimo
(12px) — a letra ficou MENOR que antes. `readTextScale` trata 0 como padrão.
