<p align="center">
  <img src="logo.svg" alt="Carcará Code" width="110">
</p>

<h1 align="center">Carcará Code</h1>

<p align="center">
  <strong>Infinitos projetos, um único voo.</strong><br>
  IDE minimalista para o <a href="https://claude.ai/code">Claude Code</a> (ou qualquer IA com CLI). Um ícone por projeto, chat e preview lado a lado.
</p>

<p align="center">
  <a href="../../releases"><img src="https://img.shields.io/github/v/release/Yg0rAndrade/carcara-code?style=flat-square&color=D99748&label=download" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licença-MIT-D99748?style=flat-square" alt="MIT"></a>
  <img src="https://img.shields.io/badge/plataforma-Windows-D99748?style=flat-square" alt="Windows">
  <img src="https://img.shields.io/badge/feito%20com-Electron%20%2B%20React-D99748?style=flat-square" alt="Electron + React">
  <a href="../../stargazers"><img src="https://img.shields.io/github/stars/Yg0rAndrade/carcara-code?style=flat-square&color=D99748" alt="Stars"></a>
</p>

<p align="center">
  <img src="imgs/hero.png" alt="Carcará Code: chat com o Claude Code à esquerda e preview do projeto rodando à direita" width="100%">
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=TZSSrXYWrYU">
    <img src="https://img.youtube.com/vi/TZSSrXYWrYU/maxresdefault.jpg" alt="Assista à demonstração do Carcará Code" width="70%">
  </a>
  <br>
  <a href="https://www.youtube.com/watch?v=TZSSrXYWrYU"><strong>&#9654;&nbsp; Assista à demonstração no YouTube</strong></a>
</p>

---

## O que é

Eu costumo tocar vários projetos ao mesmo tempo, e trabalhar com IA nisso virava um caos de janelas: uma instância do VS Code por projeto, um terminal em cada, o preview no navegador, o Git noutro canto.

O **Carcará Code** junta tudo num lugar só. Três painéis, zero firula:

1. **Rail** — um ícone por projeto (varre a sua pasta raiz). Cada ícone tem a sua sessão de IA viva; dá pra ter o Claude trabalhando em três projetos em paralelo e voar entre eles num clique.
2. **Chat** — conversa com o Claude Code naquele projeto (usa a **sua assinatura**, não a API: não precisa de API key e a conta não passa por ninguém).
3. **Preview** — detecta o script `dev`/`start`, sobe o servidor e mostra o site embutido. Se já estiver rodando, não sobe de novo.

## Recursos

**Preview automático ao selecionar o projeto**

Clicou no ícone, o preview sobe sozinho. Chat de um lado, site do outro, e a mudança aparece na hora.

<img src="imgs/preview-site.png" alt="Preview do site rodando embutido, ao lado do chat" width="100%">

**Editor de código com árvore de arquivos**

Quando precisa pôr a mão no código, o editor (CodeMirror) e a árvore de arquivos estão ali, sem trocar de janela.

<img src="imgs/code.png" alt="Editor de código com árvore de arquivos" width="100%">

**Qualquer IA com CLI, por projeto**

Cada projeto escolhe qual CLI usar: Claude Code, Codex, OpenCode, Antigravity ou um comando personalizado.

<img src="imgs/ai-per-project.png" alt="Tela de configuração: escolher a CLI de IA por projeto" width="100%">

**E ainda:** chamadas de API (aba REST), conexão MCP, subir pro GitHub e checkpoints para "voltar no tempo" — sem sujar o Git do seu projeto (o histórico vive num repositório-sombra separado).

## Baixar

Pegue a versão mais recente na página de **[Releases](../../releases)**.

**Windows** — baixe o `CarcaraCode-Setup-*.exe`, execute e pronto.

> Na primeira execução o Windows pode mostrar um aviso do SmartScreen ("O Windows protegeu seu PC"), porque o instalador ainda não é assinado. Clique em **Mais informações → Executar assim mesmo**. É seguro — o código é aberto, dá pra auditar tudo aqui.

**Linux** — baixe o `CarcaraCode-*.AppImage`, dê permissão de execução e abra:

```bash
chmod +x CarcaraCode-*.AppImage
./CarcaraCode-*.AppImage
```

> É um arquivo único e portátil — não precisa instalar. No gerenciador de arquivos, dá também pra marcar "Permitir execução" nas propriedades e abrir com duplo-clique.

## Como rodar (a partir do código)

```bash
npm install
npm start
```

Na primeira vez, clique no **+** do rail pra escolher a pasta onde ficam seus projetos (padrão: `~/Documents/github`). Cada subpasta vira um ícone.

## Requisitos

- **Node.js** instalado.
- **Claude Code** instalado e logado (`claude` no terminal funcionando) — o chat usa a mesma autenticação.

## Notas (MVP)

- O chat roda em modo `bypassPermissions` pra ter o fluxo "Lovable" (sem pedir confirmação a cada passo).
- O preview detecta a porta lendo a saída do dev server (`http://localhost:PORT`).
- Estado por projeto (chat/preview) vive em memória enquanto o app está aberto.
- Se for abrir de dentro de um terminal do Claude Code, limpe `ELECTRON_RUN_AS_NODE` antes (`$env:ELECTRON_RUN_AS_NODE=$null; npm start`) — essa variável faz o Electron rodar como Node puro. Num terminal normal não precisa.

## Como contribuir

Toda ajuda é bem-vinda — bug, ideia, tradução, ou código.

1. Abra uma **[issue](../../issues)** descrevendo o bug ou a ideia (ou pegue uma que já exista).
2. Faça um **fork**, crie uma branch (`git checkout -b minha-melhoria`).
3. Rode local com `npm install && npm start` pra testar.
4. Lembre: edições em `src/` só aparecem depois de `npm run build` (o app carrega de `dist/`).
5. Abra um **pull request** explicando o que mudou e por quê.

Não precisa ser perfeito — PRs pequenos e focados são os mais fáceis de revisar e aceitar.

## Stack

Electron + React + Vite, CodeMirror (editor), xterm + node-pty (terminal), Tailwind. O chat conversa com o **Claude Code** que você já tem instalado.

## Licença

[MIT](LICENSE) © Ygor Andrade — use, modifique e distribua à vontade.
