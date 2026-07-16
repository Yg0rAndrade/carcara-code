# Changelog

Notas de versão do Carcará Code. As versões seguem versionamento semântico
(`MAJOR.MINOR.PATCH`), da mais nova para a mais antiga.

## [0.1.9] — 2026-07-16

### Adicionado

- **Carcará Code AI** — uma IA embutida, **isolada e aditiva**, com **visualização amigável (chat HTML, não-terminal)** por cima do motor **OpenCode** rodando headless (`opencode serve`, dirigido por HTTP/SSE). Entra como **mais uma opção na escolha de IA** (não altera o Claude Code nem o terminal). Fase 1 validada ponta a ponta no app:
  - **Chat com streaming** (texto em tempo real, sem eco da pergunta) e **cards de ferramenta**;
  - **Edição de arquivo com aprovação** — card "Editar &lt;arquivo&gt;" com **diff visual** (linhas verdes/vermelhas, rolável) → Aceitar/Rejeitar, cravando um **checkpoint** antes de gravar;
  - Config do modelo em `~/.carcara/provider.json` (arquivo > env > default, **não depende de variável de ambiente herdada**);
  - Skills/MCP herdados da config do OpenCode; registrada como CLI de 1ª classe (sem terminal Claude oculto), com ícone próprio e tratada como sempre disponível nas Configurações.
  - _Ainda pendente (próximas fases):_ modelo real de fábrica (o teste usa um modelo local), gateway da Fase 2.
- Chat em HTML: **respostas renderizadas em markdown** (títulos, listas, tabelas, `código inline`, blocos de código com realce de sintaxe, citações, links) nos dois chats — o da Carcará e o do Claude Code. As mensagens do usuário continuam em texto puro. Reusa o mesmo renderizador do "Novidades" (GFM + highlight), carregado sob demanda pra não pesar o boot
- **Seletor de shell do terminal:** escolha qual shell as novas sessões usam em Configurações → Terminal — no Windows, PowerShell, PowerShell 7, Prompt de Comando, Git Bash e WSL (só aparecem os que você tem instalado); no Mac/Linux, zsh, bash, fish e sh. Contribuição de [@Korinku](https://github.com/Korinku) ([#10](https://github.com/Yg0rAndrade/carcara-code/pull/10))
- **Carcará Code AI — anexar imagem:** cole (Ctrl+V), arraste-e-solte ou use o botão de clipe para
  enviar imagens no chat; múltiplas por mensagem, com miniaturas e remoção. As imagens grandes são
  reduzidas automaticamente antes do envio.
- **Recolher o Preview:** além de recolher o chat, agora dá pra recolher o webview (Preview) e ficar
  só com o chat/Código — útil em projetos que são só pasta, sem app pra servir. Botão na divisória e
  bolinha pra reabrir, simétrico ao colapso do chat que já existia.
- **WhatsApp em "Sobre & créditos":** mais um jeito de falar comigo, ao lado das outras redes.

### Alterado

- **Carcará Code AI temporariamente oculto:** a IA embutida saiu da escolha de IA por ora — o motor
  precisa de uma chave de API pra funcionar e, sem ela, o chat quebraria. O código continua no app;
  a opção volta assim que a chave estiver disponível.
- **Configurações → aba "IA por projeto" virou "Projetos":** o rótulo agora reflete que a aba faz
  mais que escolher IA (tem também a porta fixa por projeto e cia.). Renomeada nos 18 idiomas e com
  ícone de pasta no lugar do robô.

### Corrigido

- **Bolinha de reabrir o Preview no lugar certo:** o Preview é recolhido pela bolinha **de baixo** da
  divisória, mas a bolinha de reabrir aparecia no **topo**; agora reabre embaixo, simétrico à do chat.
- **Print não recortava no modo celular/tablet:** arrastar pra selecionar a área não fazia nada e a
  foto saía sempre com a tela inteira. A emulação de toque continuava ligada durante o print e o
  Electron convertia mouse→toque, então o arraste virava um toque sem movimento.
- **Rolar a página durante o print:** a camada que captura o recorte cobria o site e engolia a
  rodinha do mouse — agora dá pra rolar e enquadrar antes de recortar. Valia para todos os modos,
  computador incluído.
- **Bolinha do modo celular ficava grudada:** ao tirar o ponteiro do site (indo pro rail, para a
  barra de endereço ou para a moldura cinza), a bolinha de "dedo" continuava aparecendo na borda.
  Agora ela some assim que o ponteiro sai e volta quando ele entra de novo.
- Editor: abas locais **não-sujas recarregam do disco** quando o arquivo muda por fora (ex.: a Carcará grava um arquivo) — antes o editor mostrava o conteúdo em cache mesmo com o `dist` novo no disco (edições não salvas são preservadas).

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
- Idiomas: **16 novos idiomas na interface** além de português e inglês — espanhol, francês, alemão, italiano, chinês, japonês, coreano, tailandês, russo, árabe, hindi, indonésio, turco, vietnamita, holandês e polonês. Seletor em Configurações → Idioma com **bandeira (SVG inline, renderiza em qualquer SO)** e nome nativo; o idioma inicial segue o do sistema. Só pt/en entram no bundle de boot; os outros idiomas são **chunks carregados sob demanda** (só o idioma escolhido), mantendo a inicialização leve. Fonte única em `src/lib/languages.js` — adicionar idioma = uma entrada + um `locales/<code>.json` + o bloco nativo do processo main

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
