# Carcará Code

IDE minimalista para o **Claude Code**, com cara de Lovable. Três painéis, zero firula:

1. **Rail** — um ícone por projeto (varre a pasta raiz).
2. **Chat** — conversa com o Claude Code naquele projeto (via Claude Agent SDK, `cwd` = a pasta).
3. **Preview** — detecta o script `dev`/`start`, sobe o servidor e mostra o site embutido. Se já estiver rodando, não sobe de novo.

## Baixar (Windows)

Pegue o instalador mais recente na página de **[Releases](../../releases)**. Baixe o
`CarcaraCode-Setup-*.exe`, execute e pronto.

> Na primeira execução o Windows pode mostrar um aviso do SmartScreen ("O Windows
> protegeu seu PC"), porque o instalador ainda não é assinado. Clique em **Mais
> informações → Executar assim mesmo**. É seguro — o código é aberto, dá pra auditar tudo aqui.

## Como rodar (a partir do código)

```bash
npm install
npm start
```

Na primeira vez, clique no **+** do rail pra escolher a pasta onde ficam seus projetos
(padrão: `~/Documents/github`). Cada subpasta vira um ícone.

## Requisitos

- **Node.js** instalado.
- **Claude Code** instalado e logado (`claude` no terminal funcionando) — o chat usa a mesma autenticação.

## Notas (MVP)

- O chat roda em modo `bypassPermissions` pra ter o fluxo "Lovable" (sem pedir confirmação a cada passo).
- O preview detecta a porta lendo a saída do dev server (`http://localhost:PORT`).
- Estado por projeto (chat/preview) vive em memória enquanto o app está aberto.
- Se for abrir de dentro de um terminal do Claude Code, limpe `ELECTRON_RUN_AS_NODE`
  antes (`$env:ELECTRON_RUN_AS_NODE=$null; npm start`) — essa variável faz o Electron
  rodar como Node puro. Num terminal normal não precisa.

## Como contribuir

Toda ajuda é bem-vinda — bug, ideia, tradução, ou código. ❤️

1. Abra uma **[issue](../../issues)** descrevendo o bug ou a ideia (ou pegue uma que já exista).
2. Faça um **fork**, crie uma branch (`git checkout -b minha-melhoria`).
3. Rode local com `npm install && npm start` pra testar.
4. Lembre: edições em `src/` só aparecem depois de `npm run build` (o app carrega de `dist/`).
5. Abra um **pull request** explicando o que mudou e por quê.

Não precisa ser perfeito — PRs pequenos e focados são os mais fáceis de revisar e aceitar.

## Stack

Electron + React + Vite, CodeMirror (editor), xterm + node-pty (terminal), Tailwind.
O chat conversa com o **Claude Code** que você já tem instalado.

## Licença

[MIT](LICENSE) © Ygor Andrade — use, modifique e distribua à vontade.
