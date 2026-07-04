# Explorador de arquivos remoto (SFTP) na aba "Código" — Design

Data: 2026-07-04
Branch alvo: `integracao/tudo` (worktree `.claude/worktrees/integracao`)
Depende de: Camada 1 SSH (terminal remoto) já mergeada — `remote/*`, `connections.cjs`, `parseSshUri`, `hostKey`.

## Problema

Um projeto remoto (`ssh://user@host:port/dir`) hoje só tem **terminal** funcionando
(o SSH sobe o `claude` no VPS). A aba **Código** lê o disco **local**
(`fs:dir` → `fs.readdirSync`), então a árvore de arquivos aparece **vazia** para
projetos remotos. Queremos navegar e editar os arquivos do servidor, como o
"Remote - SSH" do VS Code faz — mas sem instalar um servidor pesado no host:
usando o **SFTP embutido do ssh2** sobre a conexão que já mantemos aberta.

## Escopo

**Enxuto e faseado.**

- **Passo 1 (read-only):** navegar a árvore + abrir arquivos para leitura.
- **Passo 2 (escrita):** salvar (Ctrl+S), criar, renomear e apagar.

**Fora de escopo (por ora):**
- Busca recursiva de arquivos no remoto (`fs:search`) — cara via SFTP.
- Auto-refresh da árvore (`fs:watch`) — SFTP não tem watch nativo.
- `fs:reveal` (abrir no explorer do SO), `fs:paste` (copiar/mover).
- Preview de projeto remoto (precisaria de túnel de porta) — outra feature.
- Autosave no remoto (salvar a cada tecla via SFTP).

## Decisões (do brainstorming)

1. **UX enxuta e focada**, faseada (Passo 1 depois Passo 2).
2. **Conexão sob demanda:** abrir a aba/uma pasta reconecta em silêncio via SFTP;
   erro só aparece se realmente falhar.
3. **Tabs num projeto remoto:** mostrar só **Chat + Código**; esconder Preview,
   Git, História, API, MCP e Quadro (dependem de arquivos/porta locais).
4. **Salvar remoto é manual (Ctrl+S)** — ignora o autosave para não escrever no
   servidor a cada tecla.

## Arquitetura (abordagem C)

Módulo isolado `remote-fs.cjs` + **dispatch de 1 linha** nos handlers `fs:*` do main.
O front não muda (os caminhos são strings opacas `ssh://…`). Segue o padrão do
projeto (`php-runtime.cjs`, `rail-core.cjs`: módulos `.cjs` puros e testáveis).

### 1. Modelo de caminho remoto

- O `path` de um projeto/arquivo remoto é uma **URI completa**:
  `ssh://user@host:port/caminho/abs` (ex.: `ssh://root@5.161.223.77:22/root/.bashrc`).
- `remote-fs` parseia com `parseSshUri` → `{ user, host, port, remoteDir }` e deriva
  `hostKey` (ambos já existem em `remote/sshUri.cjs`) para localizar a conexão.
- **Subcaminhos são devolvidos como URIs completas.** `listDir("ssh://root@h:22/root")`
  retorna filhos com `path: "ssh://root@h:22/root/.bashrc"`. Assim o front continua
  tratando `item.path` como string opaca (a árvore é lazy e usa os paths que o
  backend devolve — ver `CodeView.jsx`, `window.api.listDir(dirPath)`).
- **Operações de caminho sempre posix** (`/`) dentro do remoto — nunca `path.join`
  do Windows (que usa `\`). Helpers encapsulados: `remoteJoin(uri, name)`,
  `remoteParent(uri)`, `remoteBase(uri)` (em `sshUri.cjs` ou `remote-fs.cjs`).
- Normalização: `remoteDir` com `/` no fim, `.`/`..` → normalizados para caminho
  posix absoluto.

### 2. `remote-fs.cjs`

Módulo isolado. Recebe `getSftp(hostKey)` injetado (Promise → sessão SFTP), para ser
testável sem Electron — mesmo padrão de `secretStore` recebendo `crypto`.

API (todas Promises, recebem/retornam URIs `ssh://`):

- `listDir(uri)` → `sftp.readdir(remotePath)` → `[{ name, path: childUri, isDir, size }]`,
  **pastas primeiro** e depois alfabético (igual à árvore local). `isDir` via `attrs`
  (`stats.isDirectory()` do longname/attrs do readdir).
- `readFile(uri)` → `sftp.readFile(remotePath)`. Reusa os **mesmos guardas** do
  `fs:read` local (limite de tamanho, detecção de binário) — a lógica de guarda é
  extraída/compartilhada para não duplicar regra.
- `writeFile(uri, content)` → `sftp.writeFile(remotePath, content)`.
- `mkdir(uri)`, `rename(uri, newName)`, `remove(uri)` (`unlink`/`rmdir` conforme tipo).

Erros: rejeita com mensagem legível; o handler traduz para o retorno de erro que a
UI já entende.

### 3. Sessão SFTP em `connections.cjs`

Novo helper: `sftp(hostKey)`:
- `connFor(hostKey)` (já conecta sob demanda) → `client.sftp()`.
- **Cache por conexão**: uma sessão SFTP por conexão, reusada; descartada quando a
  conexão cai (mesmo ciclo de vida do `client`).

### 4. Dispatch nos handlers `fs:*` (main.js)

Uma linha no topo de cada handler relevante:
`if (isRemote(<pathArg>)) return remoteFs.<op>(...)`.

- **Passo 1:** `fs:dir` (→ `listDir`), `fs:read` (→ `readFile`).
- **Passo 2:** `fs:write` (→ `writeFile`), `fs:create` (→ `mkdir`/`writeFile`),
  `fs:rename` (→ `rename`), `fs:trash` (→ `remove`).
- **Em remoto viram no-op/desabilitados (por ora):** `fs:watch` (no-op),
  `fs:search` (retorna `[]`), `fs:reveal` (no-op), `fs:paste` (no-op).

### 5. Front (mudanças mínimas)

- **Tab-gating:** quando `active.remote`, a barra de tabs mostra só **Chat + Código**
  (esconde Preview/Git/História/API/MCP/Quadro).
- **Salvar manual:** no `CodeView`, quando `active.remote`, o efeito de autosave é
  ignorado; salvar só via Ctrl+S / botão. O estado "dirty" e o editor são reusados.
- **Busca:** o campo "Buscar arquivos" fica desabilitado quando `active.remote`.
- Nada mais muda: árvore, editor, abas de arquivo, "dirty" — reusados porque os
  caminhos são opacos e o dispatch é no backend.

### 6. Erros e conexão

- Conecta sob demanda via `connFor`. Se falhar (host fora do ar, **senha não salva**,
  fingerprint recusado), a árvore/editor mostra um estado de erro claro
  **"Não foi possível conectar — Reconectar"**, reusando o ponto de status/reconexão
  SSH que já existe (evento `remote:status`, ação de reconectar).
- Operação pontual que falha (permissão negada, arquivo removido) → toast de erro,
  sem quebrar a árvore.
- Caso da senha não salva (safeStorage indisponível): o `remote:test`/conexão já
  lida com pedir/receber o segredo; se não houver segredo, a operação de FS falha
  com mensagem orientando a reconectar/reinformar.

## Componentes e responsabilidades

| Unidade | O que faz | Depende de |
|---|---|---|
| `remote-fs.cjs` | ops de arquivo via SFTP sobre URIs `ssh://` (puro) | `getSftp` injetado, `parseSshUri`, helpers posix |
| `connections.sftp(hostKey)` | abre/cacheia a sessão SFTP da conexão | `connFor`, ssh2 `client.sftp()` |
| dispatch em `fs:*` | roteia local vs remoto por `isRemote(path)` | `remote-fs`, `isRemote` |
| tab-gating (front) | esconde tabs não aplicáveis em `active.remote` | `active.remote` |
| save manual (front) | ignora autosave em remoto | `active.remote` |

## Testes

- `remote/remote-fs.test.js` (vitest) com `getSftp` fake (mock de
  `readdir/readFile/writeFile/mkdir/rename/unlink/rmdir`): cobre parsing de URI,
  montagem de subcaminhos (posix), ordenação pastas-primeiro, propagação de erro.
- Guardas de tamanho/binário do read: teste do helper compartilhado.
- Front sem teste automatizado (padrão do projeto) → **verificação manual**:
  abrir projeto remoto, navegar pastas, abrir arquivo (Passo 1); salvar/criar/
  renomear/apagar (Passo 2); tabs escondidos; erro ao desconectar.

## Riscos / notas

- **Caminhos Windows vs posix:** o maior risco. Toda junção/basename de caminho
  remoto precisa ser posix. Isolado nos helpers e coberto por teste.
- **Performance:** `readdir` por pasta (lazy) é barato; abrir arquivo grande via
  SFTP pode ser lento — os guardas de tamanho já limitam.
- **Reuso de sessão SFTP:** evitar abrir uma sessão por chamada (custo). Cache por
  conexão resolve.
