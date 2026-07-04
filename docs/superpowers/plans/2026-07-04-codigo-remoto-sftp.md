# Explorador de arquivos remoto (SFTP) na aba Código — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a aba "Código" de um projeto remoto (`ssh://…`) navegar e abrir arquivos do servidor via SFTP (Passo 1), e depois salvar/criar/renomear/apagar (Passo 2).

**Architecture:** Módulo isolado `remote/remoteFs.cjs` faz as operações via SFTP sobre URIs `ssh://`. Cada handler `fs:*` do `main.js` ganha um dispatch de 1 linha `isRemote(path) ? remoteFs.x(...) : <local atual>`. O front quase não muda (os caminhos são strings opacas). `connections.cjs` ganha `sftp(hostKey)` que abre/cacheia a sessão SFTP.

**Tech Stack:** Electron (main), ssh2 (SFTP embutido), React (renderer), vitest.

## Global Constraints

- Worktree: `c:/Users/Ygor Andrade/Documents/github/ygor-code/.claude/worktrees/integracao`, branch `integracao/tudo`. Todos os comandos rodam a partir daí.
- Node resolve `node_modules` da raiz do repo (o worktree não tem o seu); `ssh2` já está instalado.
- Módulos `.cjs` isolados e testáveis com dependências injetadas (padrão: `secretStore` recebe `crypto`, `connections` recebe `Client`).
- Caminhos remotos SEMPRE posix (`path.posix`), nunca `path.join`/`path.dirname` do Windows (que usam `\`).
- Testes: `vitest run` (via `npm test`). Arquivos de teste `*.test.js` ao lado do módulo.
- Retornos dos handlers `fs:*` seguem o shape existente: sucesso `{ ... }`, erro `{ error: string }`.
- Não fazer `git push` (regra do projeto: backup é local; push só quando o usuário pedir).
- Passo 1 primeiro (Tasks 1–6) → build → verificação manual; só então Passo 2 (Tasks 7–9).

## File Structure

- Create: `remote/remoteFs.cjs` — ops de arquivo via SFTP sobre URIs `ssh://` (puro, `getSftp`/`isBinaryExt` injetados).
- Create: `remote/remoteFs.test.js` — testes do `remoteFs` com SFTP fake.
- Modify: `remote/connections.cjs` — adiciona `sftp(hostKey)` (abre/cacheia sessão SFTP).
- Modify: `remote/connections.test.js` — teste do `sftp()`.
- Modify: `main.js` — instancia `remoteFs` em `whenReady`; dispatch remoto em `fs:dir`, `fs:read`, `fs:watch`, `fs:search` (Passo 1) e `fs:write`, `fs:create`, `fs:rename`, `fs:trash` (Passo 2); helper `isBinaryExtForRead(ext)`.
- Modify: `src/components/PreviewPanel.jsx` — esconde tabs Preview/Git/MoreTools quando `active.remote`; força `view='code'`.
- Modify: `src/components/CodeView.jsx` — desabilita busca e ignora autosave quando `active.remote`.

---

## PASSO 1 — Navegar + abrir (read-only)

### Task 1: `connections.sftp(hostKey)`

**Files:**
- Modify: `remote/connections.cjs` (dentro de `makeConnections`, adicionar ao objeto retornado ~linha 75)
- Test: `remote/connections.test.js`

**Interfaces:**
- Consumes: `connFor(hostKey): Promise<client>` (já existe; resolve o client ssh2 conectado), `conns: Map<hostKey, { client, status, endTimer }>` (já existe).
- Produces: `sftp(hostKey): Promise<sftpSession>` — resolve a sessão SFTP do ssh2 (API callback), cacheada por conexão em `rec.sftpSession`, limpa no `close`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `remote/connections.test.js` (antes de qualquer `console.log` final, seguindo o estilo do arquivo — usar o mesmo runner de assert que o arquivo já usa; se for vitest, usar `it`/`expect`):

```js
import { describe, it, expect } from 'vitest';
import { makeConnections } from './connections.cjs';

function fakeDeps(sftpImpl) {
  const client = {
    _h: {},
    on(ev, cb) { this._h[ev] = cb; return this; },
    connect() { setTimeout(() => this._h.ready && this._h.ready(), 0); },
    sftp(cb) { sftpImpl(cb); },
    end() {},
    removeAllListeners() {},
  };
  return {
    client,
    deps: {
      Client: function () { return client; },
      getProfile: () => ({ host: 'h', port: 22, user: 'root', authType: 'password' }),
      getSecret: () => 'pw',
      readKey: () => Buffer.from(''),
      knownHosts: { check: () => 'trusted', fingerprint: () => 'fp', trust: () => {} },
      confirmHostKey: () => true,
      onStatus: () => {},
      agentFor: () => '',
    },
  };
}

describe('connections.sftp', () => {
  it('abre a sessão SFTP e reusa a mesma na 2ª chamada', async () => {
    let opened = 0;
    const session = { on() {} };
    const { deps } = fakeDeps((cb) => { opened++; cb(null, session); });
    const conns = makeConnections(deps);
    const s1 = await conns.sftp('root@h:22');
    const s2 = await conns.sftp('root@h:22');
    expect(s1).toBe(session);
    expect(s2).toBe(session);
    expect(opened).toBe(1); // cacheada
  });

  it('propaga erro do client.sftp', async () => {
    const { deps } = fakeDeps((cb) => cb(new Error('sftp falhou')));
    const conns = makeConnections(deps);
    await expect(conns.sftp('root@h:22')).rejects.toThrow('sftp falhou');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- remote/connections.test.js`
Expected: FAIL — `conns.sftp is not a function`.

- [ ] **Step 3: Implementar**

Em `remote/connections.cjs`, no objeto `return { ... }` de `makeConnections` (após `connFor,` ~linha 76), adicionar:

```js
    async sftp(hostKey) {
      const client = await connFor(hostKey);
      const rec = conns.get(hostKey);
      if (rec && rec.sftpSession) return rec.sftpSession;
      const session = await new Promise((resolve, reject) => {
        client.sftp((err, s) => (err ? reject(err) : resolve(s)));
      });
      if (rec) {
        rec.sftpSession = session;
        // Sessão morre junto com a conexão; limpa o cache pra reabrir na próxima.
        try { session.on('close', () => { if (rec.sftpSession === session) rec.sftpSession = null; }); } catch {}
      }
      return session;
    },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- remote/connections.test.js`
Expected: PASS (todos, inclusive os antigos do arquivo).

- [ ] **Step 5: Commit**

```bash
git add remote/connections.cjs remote/connections.test.js
git commit -m "feat: connections.sftp abre e cacheia a sessão SFTP por conexão"
```

---

### Task 2: `remoteFs.listDir` + parsing de caminho

**Files:**
- Create: `remote/remoteFs.cjs`
- Test: `remote/remoteFs.test.js`

**Interfaces:**
- Consumes: `parseSshUri`, `buildSshUri`, `hostKey` de `./sshUri.cjs`; `getSftp(hostKey): Promise<sftp>` injetado; `path.posix`.
- Produces: `makeRemoteFs({ getSftp, isBinaryExt }) → { listDir(uri), readFile(uri), writeFile(uri, content), createFile(uri), mkdir(uri), rename(uri, newName), remove(uri) }`. `listDir(uri): Promise<Array<{ name, path, isDir, isLink:false }>>` — `path` de cada filho é uma URI `ssh://` completa; ordena pastas primeiro, depois `localeCompare`.

- [ ] **Step 1: Escrever o teste que falha**

Create `remote/remoteFs.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { makeRemoteFs } from './remoteFs.cjs';

// SFTP fake: API callback do ssh2. `attrs` tem isDirectory() como o Stats do ssh2.
function fakeSftp(overrides = {}) {
  return {
    readdir: (p, cb) => cb(null, [
      { filename: 'src', attrs: { isDirectory: () => true, size: 0 } },
      { filename: 'b.txt', attrs: { isDirectory: () => false, size: 5 } },
      { filename: 'a.txt', attrs: { isDirectory: () => false, size: 5 } },
    ]),
    ...overrides,
  };
}
const mk = (sftp) => makeRemoteFs({ getSftp: async () => sftp, isBinaryExt: () => false });

describe('remoteFs.listDir', () => {
  it('lista com pastas primeiro e devolve URIs ssh:// completas nos filhos', async () => {
    const rfs = mk(fakeSftp());
    const items = await rfs.listDir('ssh://root@h:22/root');
    expect(items.map((i) => i.name)).toEqual(['src', 'a.txt', 'b.txt']);
    expect(items[0]).toMatchObject({ name: 'src', isDir: true, path: 'ssh://root@h:22/root/src' });
    expect(items[1]).toMatchObject({ name: 'a.txt', isDir: false, path: 'ssh://root@h:22/root/a.txt' });
  });

  it('lê o diretório certo da URI (remoteDir)', async () => {
    let seen = null;
    const rfs = mk(fakeSftp({ readdir: (p, cb) => { seen = p; cb(null, []); } }));
    await rfs.listDir('ssh://root@h:22/home/ygor/app');
    expect(seen).toBe('/home/ygor/app');
  });

  it('propaga erro do readdir como throw', async () => {
    const rfs = mk(fakeSftp({ readdir: (p, cb) => cb(new Error('sem permissão')) }));
    await expect(rfs.listDir('ssh://root@h:22/root')).rejects.toThrow('sem permissão');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: FAIL — não consegue importar `makeRemoteFs`.

- [ ] **Step 3: Implementar**

Create `remote/remoteFs.cjs`:

```js
'use strict';
const path = require('path');
const { parseSshUri, buildSshUri, hostKey } = require('./sshUri.cjs');

// Ops de arquivo remoto via SFTP sobre URIs ssh://user@host:port/dir. Puro: recebe
// `getSftp(hostKey) -> Promise<sftp>` (sessão SFTP do ssh2, API callback) e
// `isBinaryExt(ext) -> bool` (classificação de "não é texto" reusada do main).
function makeRemoteFs({ getSftp, isBinaryExt }) {
  // Reconstrói a URI de um filho/destino trocando só o caminho remoto (posix).
  function withDir(uri, remoteDir) {
    const p = parseSshUri(uri);
    return buildSshUri({ user: p.user, host: p.host, port: p.port, remoteDir });
  }
  function remotePathOf(uri) { return parseSshUri(uri).remoteDir; }
  async function sftpOf(uri) { return getSftp(hostKey(uri)); }

  async function listDir(uri) {
    const sftp = await sftpOf(uri);
    const dir = remotePathOf(uri);
    const list = await new Promise((resolve, reject) => {
      sftp.readdir(dir, (err, l) => (err ? reject(err) : resolve(l || [])));
    });
    return list
      .map((en) => {
        const isDir = !!(en.attrs && en.attrs.isDirectory && en.attrs.isDirectory());
        return {
          name: en.filename,
          path: withDir(uri, path.posix.join(dir, en.filename)),
          isDir,
          isLink: false,
        };
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  }

  return { listDir };
}

module.exports = { makeRemoteFs };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add remote/remoteFs.cjs remote/remoteFs.test.js
git commit -m "feat: remoteFs.listDir (SFTP readdir -> URIs ssh:// dos filhos)"
```

---

### Task 3: `remoteFs.readFile` (texto + guarda de binário/tamanho)

**Files:**
- Modify: `remote/remoteFs.cjs`
- Test: `remote/remoteFs.test.js`

**Interfaces:**
- Consumes: `isBinaryExt(ext): boolean` injetado; `sftp.stat(path, cb)`, `sftp.readFile(path, cb)` (ssh2).
- Produces: `readFile(uri): Promise<{ content: string } | { binary: true } | { error: string }>`. Binário (por extensão) → `{ binary: true }`. Texto acima de 1MB → `{ error }`. Texto → `{ content }` (utf8).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `remote/remoteFs.test.js`:

```js
describe('remoteFs.readFile', () => {
  const withStat = (size, readImpl) => ({
    stat: (p, cb) => cb(null, { size }),
    readFile: readImpl,
  });

  it('devolve o conteúdo de texto', async () => {
    const rfs = makeRemoteFs({
      getSftp: async () => withStat(3, (p, cb) => cb(null, Buffer.from('oi\n'))),
      isBinaryExt: () => false,
    });
    expect(await rfs.readFile('ssh://root@h:22/root/a.txt')).toEqual({ content: 'oi\n' });
  });

  it('marca binário por extensão sem ler o conteúdo', async () => {
    let read = 0;
    const rfs = makeRemoteFs({
      getSftp: async () => withStat(10, (p, cb) => { read++; cb(null, Buffer.from('x')); }),
      isBinaryExt: (ext) => ext === '.png',
    });
    expect(await rfs.readFile('ssh://root@h:22/root/logo.png')).toEqual({ binary: true });
    expect(read).toBe(0);
  });

  it('recusa texto acima de 1MB', async () => {
    const rfs = makeRemoteFs({
      getSftp: async () => withStat(2 * 1024 * 1024, (p, cb) => cb(null, Buffer.from(''))),
      isBinaryExt: () => false,
    });
    const r = await rfs.readFile('ssh://root@h:22/root/big.log');
    expect(r.error).toMatch(/grande/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: FAIL — `rfs.readFile is not a function`.

- [ ] **Step 3: Implementar**

Em `remote/remoteFs.cjs`, dentro de `makeRemoteFs`, adicionar antes do `return`:

```js
  async function readFile(uri) {
    const ext = path.posix.extname(remotePathOf(uri)).toLowerCase();
    // Imagem/PDF/mídia/planilha/binário: preview remoto fica pra depois -> sinaliza binário.
    if (isBinaryExt(ext)) return { binary: true };
    const sftp = await sftpOf(uri);
    const p = remotePathOf(uri);
    try {
      const size = await new Promise((resolve, reject) => {
        sftp.stat(p, (err, st) => (err ? reject(err) : resolve(st.size)));
      });
      if (size > 1024 * 1024) return { error: 'arquivo muito grande (>1MB) pra exibir' };
      const buf = await new Promise((resolve, reject) => {
        sftp.readFile(p, (err, b) => (err ? reject(err) : resolve(b)));
      });
      return { content: buf.toString('utf8') };
    } catch (err) { return { error: String((err && err.message) || err) }; }
  }
```

E incluir `readFile` no `return { listDir, readFile };`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add remote/remoteFs.cjs remote/remoteFs.test.js
git commit -m "feat: remoteFs.readFile (texto utf8 + guarda de binário/1MB)"
```

---

### Task 4: Dispatch remoto nos handlers de leitura (`fs:dir`, `fs:read`, `fs:watch`, `fs:search`)

**Files:**
- Modify: `main.js` (requires no topo ~linha 20; `whenReady` ~linha 277; handlers `fs:dir` ~878, `fs:read` ~1226, `fs:watch` ~909, `fs:search` ~946)

**Interfaces:**
- Consumes: `isRemote` (já importado de `./remote/sshUri.cjs`), `connections.sftp` (Task 1), `makeRemoteFs` (Tasks 2–3).
- Produces: variável de módulo `remoteFs` (instância) usada pelos handlers; helper `isBinaryExtForRead(ext): boolean`.

- [ ] **Step 1: Import + instância do `remoteFs`**

No bloco de requires do `main.js` (junto dos outros `./remote/*`, ~linha 26), adicionar:

```js
const { makeRemoteFs } = require('./remote/remoteFs.cjs');
```

Perto das outras variáveis de módulo (ex.: `let secretStore = null;` ~linha 35), adicionar:

```js
let remoteFs = null;
```

Definir o helper de classificação binária logo acima do handler `fs:read` (reusa os conjuntos que o `fs:read` já usa — `IMAGE_EXT`, `BINARY_EXT`, `.pdf`, planilhas, mídia):

```js
// "Não é texto editável" -> no remoto abrimos como binário (preview remoto fica pra depois).
function isBinaryExtForRead(ext) {
  if (IMAGE_EXT.has(ext) || BINARY_EXT.has(ext)) return true;
  if (ext === '.pdf' || ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') return true;
  if (mediaCore.mediaKindByExt ? mediaCore.mediaKindByExt(ext) : false) return true;
  return false;
}
```

Nota: se `mediaCore` não expõe checagem por extensão, trocar a linha do media por `false` (mídia remota abre como binário mesmo). Verificar a API real de `mediaCore` antes; usar `false` se não houver função por-extensão.

Dentro de `app.whenReady().then(() => { ... })`, DEPOIS de `connections = makeConnections({...})` (~linha 291), adicionar:

```js
  remoteFs = makeRemoteFs({
    getSftp: (hk) => connections.sftp(hk),
    isBinaryExt: isBinaryExtForRead,
  });
```

- [ ] **Step 2: Dispatch no `fs:dir`**

No topo do handler `ipcMain.handle('fs:dir', ...)` (após a linha de abertura, ~879), adicionar:

```js
  if (isRemote(dirPath)) { try { return await remoteFs.listDir(dirPath); } catch { return []; } }
```

Tornar o handler `async` (mudar `(evt, { dirPath }) =>` para `async (evt, { dirPath }) =>`).

- [ ] **Step 3: Dispatch no `fs:read`**

No topo do handler `ipcMain.handle('fs:read', async (evt, { filePath }) => {` (~1226), como primeira linha do corpo:

```js
  if (isRemote(filePath)) return remoteFs.readFile(filePath);
```

- [ ] **Step 4: `fs:watch` e `fs:search` viram no-op/vazio no remoto**

No `ipcMain.handle('fs:watch', (evt, { dirPath }) => {` (~909), primeira linha:

```js
  if (isRemote(dirPath)) return { ok: true }; // sem watch remoto por ora
```

No `ipcMain.handle('fs:search', ...)` (~946), primeira linha do corpo:

```js
  if (isRemote(root)) return []; // busca remota fica pra depois
```

- [ ] **Step 5: Verificar sintaxe**

Run: `node --check main.js`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: dispatch remoto (SFTP) em fs:dir/fs:read; watch/search no-op no remoto"
```

---

### Task 5: Front — tabs só Chat + Código em projeto remoto

**Files:**
- Modify: `src/components/PreviewPanel.jsx` (tab bar ~1116–1126; efeito de auto-start do preview ~900)

**Interfaces:**
- Consumes: prop `active` do `PreviewPanel` (`active.remote: boolean`), estado `view`, `setView`.
- Produces: quando `active.remote`, a barra mostra só o trigger "code" e o `view` fica em `'code'`.

- [ ] **Step 1: Forçar view=code e esconder triggers no remoto**

Localizar `const inPreview = view === 'preview';` / os `const inCode = ...` (~1106). Logo após, adicionar:

```js
  const remote = !!active?.remote;
```

No efeito que reage a `active` (o mesmo que faz auto-start do preview, ~876–905), garantir que projeto remoto não tente subir preview e caia no code. Adicionar, no início desse `useEffect`:

```js
    if (active?.remote) { setView('code'); return; }
```

- [ ] **Step 2: Esconder Preview/Git/MoreTools quando remoto**

No JSX da tab bar (~1117–1126), trocar o bloco por:

```jsx
        <Tabs value={remote ? 'code' : view} onValueChange={setView}>
          <TabsList className="h-8 gap-0.5 p-0.5">
            {!remote && <TabsTrigger value="preview" className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"><HoverIcon as={EarthIcon} />{t('preview.tab')}</TabsTrigger>}
            <TabsTrigger value="code" className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"><HoverIcon as={ChevronsLeftRightIcon} />{t('preview.code')}</TabsTrigger>
            {!remote && <TabsTrigger value="git" className="h-7 gap-1.5 px-2.5 text-[13px] [&_svg]:size-[15px]"><HoverIcon as={GitBranchIcon} />{t('preview.git')}</TabsTrigger>}
          </TabsList>
        </Tabs>

        {!remote && <MoreTools view={view} onPick={setView} />}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/components/PreviewPanel.jsx
git commit -m "feat: projeto remoto mostra só a aba Código (esconde Preview/Git/mais)"
```

---

### Task 6: Front — desabilitar a busca de arquivos no remoto

**Files:**
- Modify: `src/components/CodeView.jsx` (busca ~355; input "Buscar arquivos" ~739)

**Interfaces:**
- Consumes: prop `active` do `CodeView` (`active.remote`).
- Produces: em remoto, o campo de busca fica desabilitado e não dispara `searchFiles`.

- [ ] **Step 1: Não buscar no remoto**

No `useEffect` da busca (~355, `if (!active || !q) { setResults([]); return; }`), trocar a guarda para:

```js
    if (!active || active.remote || !q) { setResults([]); return; }
```

- [ ] **Step 2: Desabilitar o input**

No `<input ... placeholder={t('tree.search_placeholder')} ... />` (~739), adicionar `disabled={!!active?.remote}` e, se houver, um `title` explicando. Exemplo mínimo: adicionar a prop `disabled={!!active?.remote}`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/components/CodeView.jsx
git commit -m "feat: desabilita busca de arquivos em projeto remoto (SFTP sem busca por ora)"
```

- [ ] **Step 5: VERIFICAÇÃO MANUAL DO PASSO 1**

Rebuild + relançar o app (`main.js` mudou):
```bash
rm -rf dist && npm run build
```
Fechar o app e reabrir a partir do worktree (`ELECTRON_RUN_AS_NODE` limpo). Abrir o projeto remoto (`root@5.161.223.77`), aba **Código**:
- A árvore lista `/root` (aparecem `.bashrc`, `portainer.yaml`, etc.).
- Expandir uma pasta (ex.: `.ssh`) lista os filhos.
- Abrir um arquivo de texto (ex.: `.bashrc`) mostra o conteúdo.
- Só as abas **Chat + Código** aparecem; o campo de busca está desabilitado.
- Confirmar que projeto LOCAL continua igual (árvore, abrir, buscar, Preview/Git presentes).

---

## PASSO 2 — Salvar / criar / renomear / apagar

### Task 7: `remoteFs` write/create/mkdir/rename/remove

**Files:**
- Modify: `remote/remoteFs.cjs`
- Test: `remote/remoteFs.test.js`

**Interfaces:**
- Consumes: `sftp.writeFile(path, data, cb)`, `sftp.mkdir(path, cb)`, `sftp.rename(from, to, cb)`, `sftp.unlink(path, cb)`, `sftp.rmdir(path, cb)`, `sftp.stat(path, cb)`.
- Produces: `writeFile(uri, content): Promise<{ok:true}|{error}>`; `createFile(uri): Promise<{ok:true, path}|{error}>`; `mkdir(uri): Promise<{ok:true, path}|{error}>`; `rename(uri, newName): Promise<{ok:true, path}|{error}>`; `remove(uri): Promise<{ok:true}|{error}>` (usa `stat` → `rmdir` se pasta, senão `unlink`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `remote/remoteFs.test.js`:

```js
describe('remoteFs escrita', () => {
  function spySftp() {
    return {
      calls: [],
      writeFile(p, data, cb) { this.calls.push(['writeFile', p, data.toString()]); cb(null); },
      mkdir(p, cb) { this.calls.push(['mkdir', p]); cb(null); },
      rename(a, b, cb) { this.calls.push(['rename', a, b]); cb(null); },
      unlink(p, cb) { this.calls.push(['unlink', p]); cb(null); },
      rmdir(p, cb) { this.calls.push(['rmdir', p]); cb(null); },
      stat(p, cb) { cb(null, { isDirectory: () => this._isDir }); },
      _isDir: false,
    };
  }
  const mk2 = (sftp) => makeRemoteFs({ getSftp: async () => sftp, isBinaryExt: () => false });

  it('writeFile grava no caminho remoto', async () => {
    const s = spySftp();
    expect(await mk2(s).writeFile('ssh://root@h:22/root/a.txt', 'oi')).toEqual({ ok: true });
    expect(s.calls[0]).toEqual(['writeFile', '/root/a.txt', 'oi']);
  });

  it('rename move dentro da mesma pasta e devolve a URI nova', async () => {
    const s = spySftp();
    const r = await mk2(s).rename('ssh://root@h:22/root/a.txt', 'b.txt');
    expect(r).toEqual({ ok: true, path: 'ssh://root@h:22/root/b.txt' });
    expect(s.calls[0]).toEqual(['rename', '/root/a.txt', '/root/b.txt']);
  });

  it('rename recusa nome com barra', async () => {
    const r = await mk2(spySftp()).rename('ssh://root@h:22/root/a.txt', 'x/y');
    expect(r.error).toMatch(/inválido/);
  });

  it('remove usa rmdir em pasta e unlink em arquivo', async () => {
    const s = spySftp(); s._isDir = true;
    await mk2(s).remove('ssh://root@h:22/root/pasta');
    expect(s.calls[0][0]).toBe('rmdir');
    const s2 = spySftp();
    await mk2(s2).remove('ssh://root@h:22/root/a.txt');
    expect(s2.calls[0][0]).toBe('unlink');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: FAIL — `writeFile is not a function`.

- [ ] **Step 3: Implementar**

Em `remote/remoteFs.cjs`, dentro de `makeRemoteFs`, adicionar antes do `return`:

```js
  function call(fn) { return new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v)))); }
  const wrap = async (fn) => { try { return await fn(); } catch (err) { return { error: String((err && err.message) || err) }; } };

  function writeFile(uri, content) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      await call((cb) => sftp.writeFile(remotePathOf(uri), Buffer.from(content, 'utf8'), cb));
      return { ok: true };
    });
  }
  function createFile(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      await call((cb) => sftp.writeFile(remotePathOf(uri), Buffer.from('', 'utf8'), cb));
      return { ok: true, path: uri };
    });
  }
  function mkdir(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      await call((cb) => sftp.mkdir(remotePathOf(uri), cb));
      return { ok: true, path: uri };
    });
  }
  function rename(uri, newName) {
    const name = String(newName || '').trim();
    if (!name || name.includes('/') || name.includes('\\')) return Promise.resolve({ error: 'nome inválido' });
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      const from = remotePathOf(uri);
      const to = path.posix.join(path.posix.dirname(from), name);
      await call((cb) => sftp.rename(from, to, cb));
      return { ok: true, path: withDir(uri, to) };
    });
  }
  function remove(uri) {
    return wrap(async () => {
      const sftp = await sftpOf(uri);
      const p = remotePathOf(uri);
      const isDir = await call((cb) => sftp.stat(p, cb)).then((st) => st.isDirectory());
      await call((cb) => (isDir ? sftp.rmdir(p, cb) : sftp.unlink(p, cb)));
      return { ok: true };
    });
  }
```

Atualizar o `return` para: `return { listDir, readFile, writeFile, createFile, mkdir, rename, remove };`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- remote/remoteFs.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add remote/remoteFs.cjs remote/remoteFs.test.js
git commit -m "feat: remoteFs write/createFile/mkdir/rename/remove via SFTP"
```

---

### Task 8: Dispatch remoto nos handlers de escrita (`fs:write`, `fs:create`, `fs:rename`, `fs:trash`)

**Files:**
- Modify: `main.js` (`fs:write` ~1309, `fs:create` ~1368, `fs:rename` ~1355, `fs:trash` ~1350)

**Interfaces:**
- Consumes: `remoteFs` (instância; Task 4), `isRemote`.
- Produces: os quatro handlers roteiam pro `remoteFs` quando o caminho é `ssh://`.

- [ ] **Step 1: `fs:write`**

Primeira linha do corpo de `ipcMain.handle('fs:write', (evt, { filePath, content }) => {` (~1309):

```js
  if (isRemote(filePath)) return remoteFs.writeFile(filePath, content);
```

- [ ] **Step 2: `fs:trash`**

Primeira linha do corpo de `ipcMain.handle('fs:trash', async (evt, { targetPath }) => {` (~1350). No remoto NÃO há lixeira — apaga direto via SFTP:

```js
  if (isRemote(targetPath)) return remoteFs.remove(targetPath);
```

- [ ] **Step 3: `fs:rename`**

Primeira linha do corpo de `ipcMain.handle('fs:rename', (evt, { targetPath, newName }) => {` (~1355):

```js
  if (isRemote(targetPath)) return remoteFs.rename(targetPath, newName);
```

- [ ] **Step 4: `fs:create`**

Primeira linha do corpo de `ipcMain.handle('fs:create', (evt, { destDir, name, isDir }) => {` (~1368). Monta a URI destino com posix e delega:

```js
  if (isRemote(destDir)) {
    const clean = String(name || '').trim();
    if (!clean || clean.includes('/') || clean.includes('\\')) return { error: 'nome inválido' };
    const p = parseSshUri(destDir);
    const childUri = buildSshUri({ user: p.user, host: p.host, port: p.port, remoteDir: require('path').posix.join(p.remoteDir, clean) });
    return isDir ? remoteFs.mkdir(childUri) : remoteFs.createFile(childUri);
  }
```

Garantir que `parseSshUri` e `buildSshUri` estão importados no `main.js` (já estão — vieram no merge do SSH; confirmar no bloco de requires).

- [ ] **Step 5: Verificar sintaxe**

Run: `node --check main.js`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add main.js
git commit -m "feat: dispatch remoto (SFTP) em fs:write/create/rename/trash"
```

---

### Task 9: Front — salvar remoto é manual (ignora autosave)

**Files:**
- Modify: `src/components/CodeView.jsx` (efeito de autosave ~627)

**Interfaces:**
- Consumes: prop `active` do `CodeView` (`active.remote`).
- Produces: em remoto, o autosave não dispara; salvar só via `Ctrl+S`/botão (`save`, que já existe e usa `writeFile` — que agora roteia pro SFTP).

- [ ] **Step 1: Ignorar autosave no remoto**

No `useEffect` do autosave (~627), trocar a primeira guarda:

```js
    if (!autoSave || active?.remote) return;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/components/CodeView.jsx
git commit -m "feat: em projeto remoto o autosave é ignorado (salvar só no Ctrl+S)"
```

- [ ] **Step 4: VERIFICAÇÃO MANUAL DO PASSO 2**

Rebuild + relançar (`main.js` mudou):
```bash
rm -rf dist && npm run build
```
No projeto remoto, aba **Código**:
- Abrir um arquivo de texto, editar, **Ctrl+S** → salva no servidor (confirmar via terminal `cat` no VPS, ou reabrindo o arquivo).
- Menu de contexto da árvore: **Novo arquivo** / **Nova pasta** → cria no servidor.
- **Renomear** um arquivo → some com o nome antigo, aparece o novo.
- **Apagar** um arquivo → some (lembrar: no remoto é apagar direto, sem lixeira).
- Ligar o autosave nas Configurações e confirmar que, no remoto, ele NÃO salva sozinho (só Ctrl+S).
- Confirmar que o LOCAL continua com lixeira/autosave normais.

---

## Self-Review (feito na escrita)

- **Cobertura do spec:** modelo de caminho (Task 2 `withDir`/posix), `remote-fs` (Tasks 2/3/7), `connections.sftp` (Task 1), dispatch `fs:*` (Tasks 4/8), tab-gating (Task 5), busca desabilitada (Task 6), salvar manual (Task 9), erros → `{error}` + árvore vazia em falha (Task 4 `catch { return [] }`). Watch/search/reveal/paste fora de escopo = no-op (Task 4). ✓
- **Placeholders:** nenhum — todo passo tem código real. A única nota condicional é a API de `mediaCore` por-extensão na Task 4 (usar `false` se não existir). ✓
- **Consistência de tipos:** `listDir` devolve `{name, path, isDir, isLink}` (igual ao `fs:dir` local); `readFile` devolve `{content}|{binary}|{error}` (igual ao `fs:read`); `writeFile`→`{ok}`; `rename`/`create`→`{ok, path}`; nomes `remoteFs.{listDir,readFile,writeFile,createFile,mkdir,rename,remove}` usados de forma consistente entre Tasks 4/8. ✓
