# Plano — Remoto (VPS): refresh da árvore, preview por túnel SSH e aba de IA

Sessão de 21/09/2026. Três entregas independentes + uma investigação.

## T1 — Refresh da árvore de arquivos

**Problema:** projeto remoto não tem watcher (`fs:watch` devolve `{ ok: true }` sem
observar nada, `main.js:1625`), então a árvore só recarrega quando o `refresh` do
`FileTreeCtx` é incrementado — e nada incrementa fora do `fs:changed` local. Além disso o
cabeçalho da árvore só existe em projeto local (a busca é escondida no remoto), então não
havia onde pôr o botão.

**Solução:** cabeçalho da árvore SEMPRE presente em `CodeView.jsx`.

- Local: campo de busca (como hoje) + botão de recarregar.
- Remoto: caminho remoto (muted, mono, truncado) + botão de recarregar.
- O clique faz `bump()` (recarrega a árvore inteira, inclusive as pastas abertas — cada
  `Tree` refaz o `listDir` porque `refresh` está nas deps) **e** recarrega do servidor as
  abas abertas não-sujas. Isso vale pro remoto também: o `readFile` do `window.api` já
  roteia pro SFTP.
- Extrair `reloadOpenTabs()` — hoje esse corpo está inline no efeito do `fs:changed` e
  tem um `if (active.remote) return` que agora não se aplica ao refresh manual.

i18n: `tree.refresh`.

## T2 — Preview do localhost da VPS (túnel SSH, estilo `ssh -L`)

**Ideia:** o `<webview>` do preview não sabe falar SSH, mas sabe abrir
`http://127.0.0.1:<porta>`. Então o main abre um servidor TCP em `127.0.0.1:0` e liga cada
conexão aceita a um canal `forwardOut` do cliente ssh2 que já está aberto pro projeto. É
exatamente o `-L` do OpenSSH, reusando a conexão/autenticação que já existe.

Peças:

1. `electron/remote/tunnel.cjs` — `makeTunnels({ net, connFor })` com
   `open(hostKey, remotePort) -> { localPort }`, `close`, `closeHost`, `closeAll`, `list`.
   Um túnel por `(hostKey, portaRemota)`, reusado. Bind só em `127.0.0.1` (nunca expor a
   porta da VPS na rede local). `setNoDelay(true)` dos dois lados.
2. `electron/remote/remotePorts.cjs` — parte PURA: `parseListening(stdout)` entende tanto
   `ss -Hltnp` quanto `netstat -ltnp` (distros sem `ss`). Devolve `[{ port, proc }]`
   deduplicado e ordenado. O comando roda por `client.exec`, no main.
3. IPC: `remote:ports`, `remote:tunnel:open`, `remote:tunnel:close`, `remote:tunnel:list`.
4. `preload.js`: `remotePorts`, `openRemoteTunnel`, `closeRemoteTunnel`, `remoteTunnels`.
5. `PreviewPanel.jsx`: liberar a aba Preview no projeto remoto. O estado vazio do remoto
   vira um seletor de porta (lista detectada + campo livre). Ao conectar,
   `showWebFor(path, 'http://127.0.0.1:<localPort>')` — daí pra frente é o preview normal
   (abas, barra de URL, DevTools, print).
   - Aba padrão do projeto remoto continua sendo **Código** (o preview exige escolher uma
     porta); só o gate `!remote` some.
   - Os efeitos exclusivos de projeto local (scaffold probe, auto-start, `previewStatus`)
     passam a ser barrados por `!remote`, não pelo `inPreview`.
6. Limpeza: `closeHost` ao remover o projeto; `closeAll` no shutdown.

## T3 — Aba "IA" nas configurações do projeto

`ProjectSettingsModal.jsx` vira modal com abas **Geral** e **IA**. A aba IA repete o
bloco de chips que já existe em Configurações › IA por projeto e no
`NewProjectAiModal` — três cópias do mesmo desenho.

**DRY:** extrair `src/components/ProjectAiChips.jsx` (chips + campo do comando custom +
aviso de "mínimo uma") e usar nos três lugares. A diferença entre eles é só o que fazer
quando a CLI não está instalada — vira a prop `onMissing` (sem ela, o clique alterna
normalmente, que é o comportamento do NewProjectAiModal).

i18n: `rail.tab_general`, `rail.tab_ai`, `rail.ai_hint`.

## T4 — Input lag no terminal (investigação)

Medido no código: o caminho do teclado já é o mais curto possível
(`term.onData` → `ipcRenderer.send` → `pty.write`), o xterm já usa WebGL nos dois
terminais (ChatPanel e ShellView), e não há batching/throttle no `term:data`.

No remoto o que sobra é RTT: a CLI ecoa o caractere só depois de o pacote ir e voltar da
VPS. Mitigação possível sem reescrever nada: `setNoDelay(true)` no socket do ssh2 (o
ssh2 não faz isso sozinho), que tira o atraso do algoritmo de Nagle em pacotes de 1 byte.
O resto (eco local preditivo, estilo mosh) é projeto à parte.

## Ordem de execução

1. tunnel.cjs + remotePorts.cjs + testes
2. main.js/preload.js
3. PreviewPanel
4. CodeView (T1)
5. ProjectAiChips + ProjectSettingsModal + SettingsModal + NewProjectAiModal (T3)
6. i18n (18 locales) + `npm run build` + bateria de testes
