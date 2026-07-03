# SSH / Remote — Camada 1: Conexão + Terminal remoto

**Data:** 2026-07-03
**Status:** Design aprovado
**Escopo desta camada:** conectar a um VPS por SSH e rodar o terminal (sessão do
Claude e shell livre) nesse servidor, de dentro do Carcará. Ler/editar arquivos
remotos, preview com port-forward e rastreamento remoto de sessão/checkpoints
são **camadas futuras** (ver "Roadmap").

---

## 1. Contexto e motivação

Hoje o terminal do Carcará é sempre local: `main.js` spawna um `node-pty`
(`shellForOS()`) por sessão/projeto e faz stream pro `xterm` via IPC. Há dois
sabores:

- `term:ensure` ([main.js:1470](../../../main.js#L1470)) — sobe o CLI de IA
  (Claude Code por padrão) automaticamente e vigia o transcript pra capturar
  título/id da sessão.
- `shell:ensure` ([main.js:1538](../../../main.js#L1538)) — shell livre por
  projeto, sem subir CLI.

Objetivo: permitir que esse terminal rode num **VPS remoto** por SSH, para
desenvolver no servidor (rodando o próprio Claude Code lá) sem sair da IDE.

**Alvo primário:** VPS remoto de verdade (não WSL — WSL é local e fica fora
desta linha de trabalho).

### Restrição de identidade do app

O Carcará "usa a assinatura do Claude, nunca a API". No VPS isso exige que o
**Claude Code esteja instalado e logado no próprio servidor** (`claude login`
lá). O app não contorna isso — apenas roda `claude` no shell remoto; detecção e
orientação amigável ficam para a Camada 4.

### Decomposição em camadas (o todo maior)

"Remote dev completo" é multi-spec. Camadas, cada uma se apoiando na anterior:

1. **Conexão + Terminal remoto** — este documento.
2. **Arquivos remotos** — árvore + abrir/editar/salvar via SFTP; `CodeView`
   passa a ler/gravar por uma abstração de provider (local vs remoto).
3. **Preview remoto** — port-forward das portas do dev-server remoto pra
   `localhost`, pra o painel de preview funcionar.
4. **Sessão/checkpoints/setup remotos** — vigiar `~/.claude/*.jsonl` remoto por
   SFTP; checkpoints no FS remoto; `system:checkTools` por SSH.

A mesma conexão `ssh2` desta camada hospeda os canais SFTP (2) e de
port-forward (3) — por isso a costura escolhida aqui destrava as próximas.

---

## 2. Biblioteca

**`ssh2`** (npm, pure-JS, sem toolchain nativo pra compilar — diferente do
`node-pty`). Abre conexão + canal de shell remoto que expõe a mesma interface do
PTY local (`data` / `write` / `setWindow` pra resize). Traz SFTP e port-forward
embutidos, usados nas camadas seguintes.

---

## 3. Arquitetura — a costura de transporte

Abordagem escolhida (dentre transporte-abstrato / handlers duplicados / shell no
`ssh` do sistema): **abstração de transporte**. É a única que mantém o caminho
local intacto e faz as Camadas 2–4 saírem da mesma conexão.

Novo módulo no main process (CJS, como os outros `.cjs`):

- **`remote/transport.js`** — contrato de sessão consumido pelos handlers:

  ```
  interface SessionTransport {
    write(data: string): void
    resize(cols: number, rows: number): void
    onData(cb: (data: string) => void): void
    onExit(cb: (info?) => void): void
    kill(): void
  }
  ```

- **`LocalPty`** — embrulho fino do `node-pty` atual. O `pty.spawn(...)` de hoje
  é **extraído pra cá sem mudança de comportamento** (mesmo `shellForOS()`,
  `cleanEnv()`, `cwd`, `name: 'xterm-256color'`).

- **`remote/ssh.js` → `SshShell`** — sobre um `Client` `ssh2` já conectado, abre
  `conn.shell({ term: 'xterm-256color', cols, rows })` e adapta os eventos do
  stream (`data`, `close`) ao contrato. `resize` chama `stream.setWindow(rows,
  cols, ...)`. `cwd` remoto: o shell nasce no diretório do projeto (via `cd
  <remoteDir>` inicial no canal).

### Ponto de bifurcação

Em `term:ensure` e `shell:ensure`, uma única decisão:

```
const transport = isRemote(projectPath)
  ? new SshShell(await connFor(projectPath), { cols, rows, remoteDir })
  : new LocalPty({ cols, rows, cwd: projectPath })
```

`isRemote(projectPath)` testa o prefixo `ssh://`. **Todo o resto fica idêntico**:
buffer, `safeSend('term:data' | 'shell:data')`, `resize`, `onExit`,
`activityOnData`, etc. O renderer (`ShellView.jsx` e a aba de sessão) **não muda
nada** — continua falando `shellInput`/`shellResize`/`shellEnsure` e
`term:*` chaveado por `projectPath`.

---

## 4. Gerenciador de conexão (`ssh2`)

- **Um `Client` por host, reusado.** `Map` `hostKey → { client, status,
  channels, endTimer }` no main. Terminal (sessão), shell livre e, no futuro,
  SFTP/túnel **multiplexam a mesma conexão** (SSH suporta N canais). Abrir a 2ª
  aba do mesmo host não reautentica.
- **Autenticação** (os 4 métodos, montados a partir do perfil salvo; `ssh2`
  aceita lista ordenada de tentativas):
  - **Chave privada (arquivo):** lê `keyPath`, `passphrase` opcional.
  - **Senha:** `password`.
  - **ssh-agent:** `agent` = `process.env.SSH_AUTH_SOCK` (Unix) ou `pageant`
    (Windows).
  - **Importar `~/.ssh/config`:** parser pré-preenche `HostName`/`User`/`Port`/
    `IdentityFile` de um `Host` escolhido.
- **Keepalive + reconexão:** `keepaliveInterval` ligado. Ao cair → status
  `disconnected`, evento pro renderer (aba escreve `[conexão perdida]`),
  **reconexão manual** via botão inline (sem backoff automático agressivo nesta
  camada).
- **Ciclo de vida:** fechar todas as abas de um host → `client.end()` com um
  pequeno grace (`endTimer`), pra não reautenticar se reabrir logo. Encerrar o
  app fecha todas as conexões.

---

## 5. Modelo de dados & segredos

- **Chave do projeto remoto:** `ssh://user@host:porta/caminho/remoto` — string
  única usada como `projectPath` em toda a máquina existente (config, sessões,
  layout, rail). `hostKey` = `user@host:porta` (parte sem o caminho), pra
  agrupar canais/conexão.
- **`config.json`, novo campo `remotes[hostKey]` (não-secreto):**
  `{ host, port, user, authType, keyPath, remoteDir, label }`. Fica ao lado de
  `projects`; é runtime, não vai pro git.
- **Segredos via `safeStorage` do Electron:** `password` e `passphrase`
  criptografados (DPAPI no Windows) em arquivo separado `remotes.secrets` (blob
  por `hostKey`). Se `safeStorage.isEncryptionAvailable()` for falso, o app
  **não grava segredo em texto puro** — cai pra pedir na hora de conectar.
- **Degradações desta camada (documentadas):** para projeto remoto,
  `startClaudeWatcher`/rastreamento de transcript e `applyClaudeTheme` são
  **pulados**; o título da aba usa fallback (label do host / "Sessão remota").
  `system:checkTools` e checkpoints continuam olhando o FS local — ficam
  desligados/ocultos no projeto remoto até a Camada 4.

---

## 6. UX

- **Adicionar:** no fluxo de "novo projeto" do Rail, opção **"Projeto remoto
  (SSH)"** ao lado de "abrir pasta local". Formulário (padrão do
  `ProjectSettingsModal`): host, porta (default 22), usuário, método de auth
  (chave / senha / agent), caminho do projeto no servidor, rótulo opcional. Botão
  **"Importar do ~/.ssh/config"** lista os `Host` e pré-preenche com um clique.
- **Testar conexão:** botão que faz handshake rápido (`ready` + `pwd`/`echo`),
  mostra ✓/✗ com a mensagem de erro real antes de salvar.
- **Rail:** ícone do projeto remoto ganha selo discreto (indicador SSH/nuvem) e
  ponto de status — conectando (âmbar pulsando) / conectado (verde) / caído
  (vermelho). Paleta "carvão + brasa" (âmbar/laranja, não azul).
- **Conectar:** lazy — ao abrir o projeto/primeira aba, **não no boot** (respeita
  o splash instantâneo). Prompt de senha/passphrase só se o segredo não estiver
  salvo.
- **Reconexão:** ao detectar queda, a aba escreve `[conexão perdida]` + botão
  **"Reconectar"** inline (manual, previsível).

---

## 7. Tratamento de erro

Erros do `ssh2` viram mensagem legível **no terminal** (mesma via do `res.error`
que o `ShellView` já pinta em vermelho) e/ou toast:

- **Host inalcançável / timeout / DNS** → "Não foi possível conectar a
  `host:porta`".
- **Auth falhou** → "Autenticação recusada — verifique usuário/chave/senha".
  Nunca loga o segredo.
- **Host key (fingerprint):** `hostVerifier` do `ssh2` entrega a fingerprint. 1ª
  conexão → mostra e pede confirmação (**TOFU**, trust on first use), salva em um
  `known_hosts` do app. Se mudar depois → **bloqueia** e avisa (possível MITM).
  Nada de `accept-all`.
- **Passphrase errada / arquivo de chave inexistente** → mensagem específica.
- **`claude` ausente no VPS** (aba de sessão): o shell remoto imprime o próprio
  `command not found`; a Camada 1 não detecta (isso é Camada 4), mensagem crua é
  aceitável.
- **`safeStorage` indisponível** → conecta pedindo o segredo na hora, sem
  persistir.

---

## 8. Testes

Padrão do repo (Vitest + smokes `.cjs`):

- **Unit (Vitest):** parse/serialize do `ssh://` (montar/desmontar chave do
  projeto e `hostKey`); parser do `~/.ssh/config` (Host/HostName/User/Port/
  IdentityFile); seleção de transporte `isRemote()`. Puro, sem rede.
- **Contrato do transporte:** roda a interface `{ write, resize, onData, onExit
  }` contra um `SshShell` com `Client`/stream do `ssh2` **mockados**, garantindo
  que os handlers funcionam idênticos pros dois transportes.
- **Segredos:** round-trip `safeStorage` (encrypt→decrypt) e fallback quando
  indisponível.
- **Smoke opcional (`scripts/ssh-smoke.cjs`):** conecta em `localhost:22` se
  gateado por env var, roda `echo`, confere o eco. Fora do CI por padrão.
- **Regressão local:** os testes/terminais locais existentes passam intactos após
  extrair o `LocalPty` (comportamento local não muda).

---

## 9. Roadmap (fora desta camada)

- **Camada 2 — Arquivos remotos:** SFTP + provider de arquivos no `CodeView`.
- **Camada 3 — Preview remoto:** port-forward `ssh2` → `localhost`.
- **Camada 4 — Sessão/checkpoints/setup remotos:** transcript por SFTP,
  checkpoints no FS remoto, `checkTools` por SSH, detecção/orientação do
  `claude login` no VPS.

## 10. Definição de pronto (Camada 1)

- [ ] Cadastrar um projeto remoto (formulário + import do `~/.ssh/config`).
- [ ] "Testar conexão" com feedback ✓/✗.
- [ ] Conectar por chave, senha, agent e host importado.
- [ ] Segredos criptografados via `safeStorage`; fallback sem persistir.
- [ ] TOFU de host key + bloqueio em mudança.
- [ ] Abrir a aba de sessão sobe `claude` no VPS; shell livre remoto funciona.
- [ ] Resize, copiar/colar e status no Rail funcionando pro remoto.
- [ ] Reconexão manual inline após queda.
- [ ] Terminal local inalterado; testes existentes verdes.
