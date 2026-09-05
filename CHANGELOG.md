# Changelog

Notas de versão do Carcará Code. As versões seguem versionamento semântico
(`MAJOR.MINOR.PATCH`), da mais nova para a mais antiga.

## [0.1.14] — 2026-09-04

### Adicionado

- **Comando de run por projeto:** a aba **Projetos** ganhou, por projeto, a escolha entre
  **Automático** e **Personalizado** para o comando que sobe o Preview, mais um interruptor de
  **abrir o Preview automaticamente**. Antes o comando era adivinhado do `package.json` e ninguém
  podia interferir, o que travava todo projeto cujo "rodar" não é um servidor web. O caso gritante
  era abrir o próprio Carcará dentro do Carcará: o comando de dev dele sobe o Electron, não um site,
  e o Preview ficava para sempre procurando a porta. No modo Automático a tela agora mostra qual
  comando a detecção resolveu. No Personalizado você escreve a linha, e pode pôr `{port}` onde a
  porta entra (ela também continua chegando em `PORT`).
- **Escolha da IA ao adicionar um projeto:** depois de selecionar a pasta, o app pergunta quais IAs
  aquele projeto vai usar, já marcando as que estão instaladas na máquina. Antes todo projeto novo
  nascia em Claude Code por padrão, e quem não tem o Claude instalado só descobria isso quando a
  primeira aba tentava subir um comando que não existe.
- **Arrastar uma tarefa do Kanban para o chat:** passar o mouse num card mostra uma alça; arraste
  por ela e solte no terminal do chat que o título e o corpo da tarefa colam no prompt, do mesmo
  jeito que arrastar um arquivo já colava o caminho. Mover o card entre colunas continua igual.
- **Antigravity sem pedir permissão:** um interruptor novo em Configurações › IAs sobe o Antigravity
  com o `--dangerously-skip-permissions` dele. Ligado, o `agy` aprova sozinho cada pedido de
  ferramenta em vez de parar a cada um esperando um sim. Vem desligado e vale para as próximas abas
  que subirem o Antigravity, não para as que já estão abertas.

### Corrigido

- **Arrastar um projeto para dentro do outro virava reordenação:** ao parar no centro de um ícone
  para criar ou entrar numa pasta, a barra deslizava o projeto arrastado para aquela posição antes
  da hora. O ícone de destino saía de baixo do cursor e a pasta nunca abria. Agora, com o cursor no
  centro de um alvo, o deslize espera.
- **Barra de projetos que não rolava durante o arraste:** em lista longa, arrastar um projeto para
  um lugar fora da parte visível era impossível. Encostar no topo ou no fim da barra durante o
  arraste agora rola sozinho. Trocar de projeto pela busca também traz o ícone ativo para o campo de
  visão.
- **Anel do projeto ativo cortado no primeiro ícone:** o anel laranja é desenhado por fora do ícone e
  o primeiro da lista ficava colado no limite da área de rolagem, perdendo um pedaço em cima.
- **Não dava para copiar texto do markdown na aba Código:** ao apertar Ctrl, a seleção sumia e o
  Ctrl+C não copiava nada, obrigando a abrir o arquivo em outro editor. O preview de markdown era
  reconstruído do zero a cada re-render da tela, e o navegador descarta a seleção quando os
  elementos somem. Agora o preview é remendado no lugar, a seleção fica de pé e o Ctrl+C copia.
- **Conversas do Codex voltando em branco para quem atualizou o Codex:** as versões novas do Codex
  mudaram o jeito de anotar a sua mensagem no arquivo de histórico. O Carcará procurava a anotação
  antiga, não achava nenhuma, e concluía que a aba estava vazia. Reabria do zero mesmo com a
  conversa inteira salva no computador. Agora ele pergunta ao próprio Codex qual é a conversa de
  cada aba, e o leitor de reserva, usado quando essa pergunta não é possível, entende as duas
  formas de anotação. Conferido de ponta a ponta contra o Codex 0.153.3, abrindo uma conversa de
  verdade, fechando na marra e reabrindo.
- **Aba de Codex que nunca ganhava nome nem voltava depois de fechada:** quando o Codex abria um
  subagente junto com a conversa principal, o Carcará via duas conversas nascendo ao mesmo tempo,
  não sabia qual era a da aba e desistia de identificar. Agora ele reconhece subagente e cópia de
  conversa, e fica com a principal.
- **"Falha ao atualizar" ao procurar novas versões:** a publicação da 0.1.13 foi interrompida no
  meio por uma instabilidade momentânea do GitHub, e o instalador do Windows acabou não sendo
  anexado à página da versão. Com isso, todo mundo que clicava em **Verificar atualizações** recebia
  um erro — o app procurava um arquivo que não existia. Os arquivos foram republicados: quem está na
  0.1.12 já consegue atualizar normalmente.

### Alterado

- **A publicação de uma versão nova agora insiste antes de desistir:** se o GitHub falhar por alguns
  segundos no meio do envio, a automação tenta de novo (até cinco vezes, com espera crescente) em vez
  de parar na primeira tentativa. No fim, ela ainda **confere na própria página da versão** que todos
  os arquivos chegaram; se faltar qualquer um, a publicação falha na hora, em vez de deixar uma versão
  pela metade quebrando a atualização de todo mundo.
- **O erro de atualização agora diz o motivo:** antes a tela mostrava só "Falha ao atualizar". Agora
  aparece embaixo a causa real (arquivo não encontrado, sem conexão, etc.), tanto no aviso do canto
  quanto na aba **Sobre**.

## [0.1.13] — 2026-08-17

### Adicionado

- **Versão para macOS funcionando de verdade:** o Carcará agora sai em `.dmg` nativo por
  processador — um para **Apple Silicon** (M1 em diante) e outro para **Macs Intel** —, com o
  mesmo aplicativo completo do Windows e do Linux, sem versão reduzida. A automação recompila os
  componentes nativos (como o terminal) para o processador certo, confere que o app **abre** e que
  **nenhum binário** ficou com a arquitetura errada; se algo não bater, a publicação é interrompida
  em vez de sair um pacote quebrado. As instruções de instalação (inclusive o "clique com Control →
  Abrir" da primeira vez) estão no README. Contribuição de
  [@manoelnetodev](https://github.com/manoelnetodev) ([#12](https://github.com/Yg0rAndrade/carcara-code/pull/12)).
- **Vários terminais no mesmo projeto:** o terminal livre virou abas, com divisão de tela — dá pra
  deixar o servidor rodando num, os comandos de git noutro, e fechar cada um separadamente.
- **O painel do Git mostra a qual repositório o projeto está ligado:** o endereço aparece como link
  (abre no navegador) e dá pra **trocar** ou **desvincular** o repositório ali mesmo. Desvincular
  mexe só na ligação — histórico e arquivos ficam intactos.
- **"Pegar elemento" no Preview agora aponta o arquivo de origem:** ao capturar um elemento da
  página, o pacote copiado inclui o arquivo e a linha de onde ele veio em projetos Vue, React,
  Astro e Svelte, então a IA já sabe onde mexer.

### Corrigido

- **macOS — app que não abria com acento no caminho:** o nome técnico do pacote passou a ser ASCII
  (`CarcaraCode`); o nome que você vê continua **Carcará Code**.
- **macOS — erro de atualização logo na abertura:** o verificador de novas versões ficava dando erro
  no Mac porque ainda não existe canal de atualização automática para as duas arquiteturas. No Mac
  ele fica desligado por ora (a atualização é baixando o `.dmg` novo); Windows e Linux seguem
  atualizando sozinhos.

## [0.1.12] — 2026-08-13

### Corrigido

- **Conversas do Codex sumindo ao fechar e reabrir o app:** as abas de Codex voltavam em branco
  (as do Claude, não). O Carcará dependia de uma dica que o Codex só escreve na tela quando você
  sai dele pelo teclado — fechando o app, ela nunca aparecia. Agora o Carcará acompanha o próprio
  histórico do Codex no computador, então a aba volta na mesma conversa mesmo se o app for fechado
  no meio, travar ou desligar.
- **Abas de Codex eternamente "Untitled":** a aba agora ganha nome sozinha, a partir do que você
  pediu na conversa — igual às do Claude.
- **Modo chat (bolhas) esquecendo a conversa ao reabrir:** o mesmo problema por outro caminho; o
  ponto de retomada agora é guardado junto com a aba.

## [0.1.11] — 2026-08-06

### Adicionado

- **Um terminal de verdade dentro do "Gerenciar IAs":** a aba agora tem um terminal completo — o
  mesmo shell do seu computador, com **Ctrl+V pra colar**, Ctrl+C pra copiar a seleção, histórico
  de rolagem e links clicáveis. Dá pra rodar qualquer comando ali, não só o da receita.
- **Link pra documentação oficial de cada IA:** ao lado de cada comando, um atalho direto pra
  página do fornecedor — se algo mudar do lado deles, a fonte da verdade está a um clique.

### Alterado

- **Instalar e atualizar IAs virou "rode este comando", não um botão mágico:** em vez de o app
  executar o instalador escondido, ele **mostra o comando oficial** num campo que você pode
  **editar**, com "Copiar" e "Colar no terminal" (a linha entra no terminal e **você** aperta
  Enter). Nada roda sem alguém ter lido. É mais simples, a falha fica visível, e se um fornecedor
  mudar o instalador você ajusta a linha na hora, sem esperar uma atualização do Carcará.

### Corrigido

- **O OpenCode "sumindo" do computador:** atualizar o OpenCode pelo npm podia deixar a instalação
  quebrada — as versões novas do npm bloqueiam a etapa que baixa o programa de verdade, e o
  resultado era o app dizer, corretamente, que a IA não estava instalada. A receita do Carcará
  agora libera essa etapa, então atualizar não quebra mais.
- **Botões de instalar/atualizar que travavam em "Instalando…" pra sempre:** em muitos computadores
  o instalador embutido não tinha como rodar (dependia de um programa que o Windows não traz), e a
  falha acontecia em silêncio, sem mensagem nenhuma. Esse caminho foi removido.
- **Texto ilegível quando o tema do terminal era diferente do tema do app:** com o terminal no
  escuro e o Carcará no claro (ou o contrário), a tela de "Escolha a IA desta aba" e o fundo do
  chat ficavam com texto quase invisível. Agora a área do terminal leva junto as cores certas.
- **Botão do terminal mostrando `settings.aiTerminalClear`:** faltava a tradução do botão "Limpar"
  em todos os idiomas.
- **Preview subindo sozinho depois de você mandar parar:** apertar "Parar" e ver o servidor voltar
  no susto, às vezes em loop. O servidor agora só sobe sozinho na primeira vez que o projeto é
  aberto — depois disso, quem manda é você.
- **Botões do site que abriam nada:** links com `target="_blank"` e telas abertas por
  `window.open` (por exemplo um PDF gerado pelo próprio site) voltaram a abrir como aba interna
  do Preview, em vez de simplesmente não acontecer nada.
- **Linux — ícone solto na dock do GNOME:** o app abria com um ícone genérico e sem nome, em vez
  de mesclar com o ícone fixado na dock. O identificador do app no Linux passou a ser ASCII sem
  espaço, que é o que o GNOME Shell consegue casar. Contribuição de
  [@guelfi](https://github.com/guelfi) ([#11](https://github.com/Yg0rAndrade/carcara-code/pull/11)).

## [0.1.10] — 2026-07-24

### Adicionado

- **Temas novos — Brasa, Carvão e Papel:** além do claro e do escuro, três temas de verdade —
  **Brasa** (escuro com o laranja do carcará em brasa), **Carvão** (preto puro, ideal pra telas
  AMOLED) e **Papel/Sépia** (tom creme, leitura mais suave). O seletor mostra um **preview de cada
  tema** (mini-janela com as cores reais), pra escolher no olho.
- **Kanban em Markdown — um quadro que é um arquivo:** aba **"Kanban"** que transforma o
  `tarefas.md` do projeto num board (colunas = etapas, cartões = tarefas). Arrastar um cartão entre
  colunas reescreve o Markdown na hora — a fonte da verdade continua sendo o arquivo, então o Claude
  Code lê e entende o estado do quadro.
- **Portas abertas do projeto — ver e fechar:** na aba **Projetos**, chips com as portas que o
  projeto está usando (varredura sob demanda) e um **✕ pra encerrar a porta** (com confirmação).
  Motor nativo, sem dependência externa (netstat/lsof + consulta de processos do sistema).
- **Visualizador de HTML com a barra do navegador:** abrir um `.html` na aba **Código** agora traz a
  mesma barra enxuta do Preview — **seletor de elementos (grabber)**, **dispositivo**
  (computador/tablet/celular), **recarregar** e **zoom da página**. Um `.html` é um site, então ganha
  as mesmas ferramentas.
- **Atalho pra começar do zero:** o assistente de projeto novo sugere a skill **/start** pra quem não
  sabe qual tecnologia usar — responde três perguntas simples e o projeto é montado.

### Alterado

- **Configurações mais organizadas:** hierarquia e tamanhos revistos, com **esqueleto de carregamento**
  enquanto a lista de projetos carrega; a aba **Notificações** virou um cartão dentro da aba Código.
- **Kanban saiu da barra:** o acesso ao quadro foi pro **menu de ferramentas** (dropdown), deixando a
  barra principal mais limpa.

### Corrigido

- **A "bolinha" que vazava pra fora do Preview — resolvida de vez:** no modo celular/tablet, um cursor
  de toque (bolinha cinza) escapava do site e ficava por cima da interface do app. Rastreando a fundo,
  a causa era o **emulador de toque do próprio Chromium**, que valia pra janela inteira. A correção
  parou de usar esse emulador; o modo celular continua sem `:hover` (reescrevendo o CSS da página),
  agora sem o efeito colateral.
- **Preview travava em "procurando a porta…" com apps pesados (Next.js):** projetos cujo primeiro
  carregamento demora mais de ~1,5s nunca abriam no Preview — ficava só o terminal repetindo `GET /`.
  Agora a checagem de "está pronto?" é mais leve e paciente (não empilha requisições no servidor e
  espera até 8s), com uma rede de segurança que abre o Preview assim que o servidor anuncia que subiu.
- **Botão "Parar" do Preview não parava (só reiniciava) e sumia durante o boot:** na inicialização o
  botão ficava desabilitado, então só dava pra Reiniciar (que reocupava a porta); e o "parar" retornava
  antes de o servidor morrer de fato. Agora o **Parar fica disponível durante o boot** e **encerra a
  árvore inteira do servidor** (liberando a porta) antes de qualquer relance.

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
