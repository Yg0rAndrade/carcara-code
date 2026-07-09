# Changelog

Notas de versão do Carcará Code. As versões seguem versionamento semântico
(`MAJOR.MINOR.PATCH`), da mais nova para a mais antiga.

## [0.1.8] — 2026-07-08

### Features

- Preview: **anotar o print antes de copiar** — capturar uma região abre um editor (Fabric.js) com caneta, seta, retângulo e texto; só depois copia a imagem anotada pro clipboard (antes copiava direto). Carregado sob demanda pra não pesar o boot
- Preview: **atalhos de print** — `Ctrl+P` seleciona área e `Ctrl+Shift+P` captura a tela toda (funcionam com o foco na app ou dentro do site, barrando o "imprimir" do navegador); o menu da câmera mostra os atalhos em cada linha
- Preview: **hard reload** — `Ctrl+F5`, `Ctrl+Shift+R` e `Ctrl+Click` no botão recarregam ignorando o cache; segurar `Ctrl` deixa a setinha laranja avisando
- Preview: **cursor de "toque" no modo celular** — no preview de iPhone o cursor vira uma bolinha de dedo e o clique mostra o marcador de tap, espelhando o seletor de elementos (injeção na página)
- Preview: **sem `:hover` em celular/tablet** — esses modos agora emulam toque de verdade (via CDP, igual ao "device mode" do Chrome/Brave): o mouse vira toque, então nenhum efeito de hover dispara (telas de toque não têm hover). Convive com o DevTools embutido (solta e reata o debugger sozinho)
- Código: **"Abrir no Explorador"** também no menu de contexto dos resultados da busca de arquivos (antes só na árvore)
- Código: **seleção por arrastar (marquee)** — clicar e arrastar na área vazia da árvore seleciona vários arquivos de uma vez, estilo Chrome/desktop
- Configurações: aba **"Novidades"** com as notas de versão (este arquivo) renderizadas no app; abre sozinha na primeira vez após atualizar
- Configurações → IA por projeto: **barra de busca**, **ordenação por nome** (padrão/A→Z/Z→A) e ícone dos projetos maior, pra achar o projeto rápido numa lista longa
- Sobre: seção **"Contribuir"** com link pro repositório público, convidando a abrir Pull Requests
- Erros: **copiar o erro** de forma consistente (código + mensagem + stack) — payload compartilhado no card de erro e ação "Copiar" nos avisos de erro

### Correções

- Preview → anotador do print: **o recorte aparecia dobrado no canto** — só ~1/4 da captura (o quadrante inferior-direito) era mostrado no canto superior-esquerdo do canvas, o resto em branco. Causa: o Fabric.js 6+ trocou o `origin` padrão dos objetos de canto (`left`/`top`) para centro (`center`), então a imagem de fundo entrava centrada em (0,0). Corrigido fixando o `origin` no canto (também alinha retângulo e texto ao cursor)
- Código → editor de `.env`: **uma variável sumia ao colar uma chave com espaço/símbolo** (ex.: colar "Token value" no campo da chave virava `Token value=`, que o parser tratava como linha crua e escondia no editor mascarado). Agora a chave é normalizada pro formato válido (`Token_value`) e a linha continua visível; valores multilinha colados também não quebram mais em linhas extras
- Git: `push`/`pull` falhavam com **"Use of GIT_ASKPASS is not permitted"** quando o app subia de um terminal que injeta `GIT_ASKPASS` (ex.: Claude Code) — o git 2.54+ passou a recusar. Removido do ambiente do git (como já era feito com `GIT_EDITOR`/`GIT_CONFIG_*`); o app usa o credential manager do sistema
- Sessões: **trocar a IA do projeto nas Configurações não valia pra próxima aba nova** até reabrir o projeto — o painel de chat guardava a IA em cache e só relia ao trocar de projeto. Agora o `ai:set` avisa o renderer (`ai:changed`) e o cache é atualizado na hora. O tooltip do botão "+" deixou de citar "Claude Code" (agora "Nova sessão", já que pode ser qualquer IA)

### Interno

- macOS: distribuição em **dois `.dmg` nativos** — Intel (`x64`) e Apple Silicon (`arm64`) — em vez de um "universal". Cada um builda no runner nativo da sua arquitetura; o universal com `npmRebuild:false` deixava os módulos nativos (node-pty/canvas/cpu-features) idênticos nas duas metades e o `@electron/universal` quebrava um a um
- Robustez: se um painel lazy (Git/API/MCP/Quadro/Código) falha ao carregar o chunk porque o `dist/` foi reconstruído embaixo da janela aberta (hash mudou), o app **recarrega sozinho uma vez** (via `vite:preloadError`) em vez de mostrar "Failed to fetch dynamically imported module". Throttle evita loop
- Lógica pura extraída e testada (vitest): `errorReport`, `projectFilter`, `changelog`, `marquee`
- i18n em paridade (pt/en) para todos os textos novos, incluindo o fluxo de anotação
- Fabric.js isolado em chunk próprio (code-split), fora do bundle de boot

## [0.1.7] — 2026-07-08

### Features

- macOS: suporte a build (`dmg` universal) e camada de plataforma canônica — login shell no pty e `fix-path` no boot pra herdar o PATH, menu nativo e reabrir janela pelo dock, runtime PHP aditivo (Windows intacto)
- Preview: mostra o favicon da página nas abas do WebView (cai no globo se faltar)

### Fixes

- Terminal: o PTY passa a adotar a grade do xterm recriado (reload/janela nova) — some o conteúdo cortado/empurrado pra baixo em janela estreita (PR #9)
- Código: abas isoladas por projeto (não vazam entre projetos)
- Terminal: soltar um arquivo cola o caminho (drag-and-drop com `copyMove`)

### Interno

- Módulos do processo main reorganizados em `electron/`; raiz enxuta

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
