# Plano: legibilidade e posição da árvore de arquivos (aba Código)

Status: **diagnóstico feito, aguardando decisões do Ygor**. Nada implementado ainda.

## Queixa

1. Poder colocar a árvore de arquivos do lado **direito**.
2. A árvore é difícil de ler/achar arquivo, comparada ao Explorer do VS Code.

## Onde está o código

- Painel da árvore + busca: `src/components/CodeView.jsx` (~linhas 1065–1260)
- Linha da árvore: `TreeNode` em `src/components/CodeView.jsx` (~linha 1881)
  - `text-[13px]`, `py-[3px]`, indent `depth * 12 + 8`, chevron 14px, ícone 16px
- Largura da árvore: `treeWidth` (localStorage `codeTreeWidth`, default 256, arraste pela `ResizeBar`)
- Fonte global: `--font-ui: 'Hanken Grotesk Variable'` em `src/index.css:52`, com
  `letter-spacing: -0.006em` no `body`
- `listDir` não devolve informação de gitignore (não há dimming de ignorados)

## Diagnóstico (por que o VS Code "lê melhor")

A altura das linhas é praticamente a mesma (~22–24px). A diferença está em:

1. **Fonte.** O VS Code no Windows usa Segoe UI 13px. A árvore usa Hanken Grotesk
   13px, que tem x-height menor e é mais estreita, e ainda tem letter-spacing negativo.
   No mesmo "13px" ela parece 1–1,5px menor. Esse é o fator principal.
2. **Hierarquia visual.** O VS Code deixa em cinza o que é ignorado pelo git
   (`node_modules`, `dist`, `.claude`...) e dá destaque ao resto. Aqui tudo tem o mesmo peso.
3. **Ruído de ícone.** Toda pasta tem ícone colorido. No VS Code a pasta não tem ícone
   (só o chevron), então o olho corre pelo nome, não pelo ícone.
4. **Sem guias de indentação.** Em pastas abertas fica difícil saber quem é filho de quem.
5. **Posição.** A árvore fica no meio da tela, espremida entre o chat e o editor vazio.

## Propostas

- **A. Lado da árvore:** botão no cabeçalho da árvore alternando esquerda/direita,
  com persistência (localStorage `codeTreeSide`). O `ResizeBar` troca de lado junto.
- **B. Fonte da árvore:** usar a fonte do sistema (Segoe UI / SF / sistema no Linux) só
  na árvore e na busca, e/ou aumentar para 14px. Tamanho ajustável nas Configurações
  (12–16px).
- **C. Hierarquia:** deixar em cinza (opacity ~0.55) os itens ignorados pelo git e os
  dotfiles. Precisa que o `listDir` marque `ignored` (via `git check-ignore --stdin` por
  diretório, com cache).
- **D. Guias de indentação:** linha vertical fina por nível, mais forte no nível que está
  com hover (como no VS Code).
- **E. Ícones de pasta mínimos (opcional):** pasta só com o chevron, sem ícone colorido.
