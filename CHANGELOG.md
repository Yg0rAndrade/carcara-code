# Changelog

Notas de versão do Carcará Code. As versões seguem versionamento semântico
(`MAJOR.MINOR.PATCH`), da mais nova para a mais antiga.

## [0.1.5] — 2026-07-01

### Features

- Preview: múltiplas abas no navegador embutido — tira estilo VS Code que só aparece com 2+ páginas abertas; abas por projeto, botão "+", fechar por ✕/botão do meio, e links que abririam nova janela viram aba interna (68aa34b)
- Editor de código: opção de quebra de linha (word wrap) (cc2ab21)

### Fixes

- Código: o realce da árvore de arquivos não some ao arrastar e soltar no mesmo lugar — o `dragend` e o `onDrop` da linha agora limpam a moldura do painel (81cdb49)
- Preview: abas de fundo voltam a re-tentar carregar quando o load falha, e o estado de voltar/avançar deixa de re-renderizar por navegação de outra aba (37b8125)
- Preview (segurança): aba não abre esquemas perigosos (`file:`, `ms-msdt:`, etc.) via `window.open` (aec4402)

## [0.1.4] — 2026-06-30

### Features

- Preview: seletor de tamanho de tela (computador/tablet/celular) — botão único na barra, com dropdown, que redimensiona a moldura do site pra testar o layout responsivo (0d2b2d0)
- Rail: rodapé fixo com adicionar projeto, configurações e versão sempre visíveis; só a lista de projetos rola (998bbea)
