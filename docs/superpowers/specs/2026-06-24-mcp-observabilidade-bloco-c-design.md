# MCP — Bloco C: Observabilidade / Debug (design)

Data: 2026-06-24
Status: aprovado para implementação

## Contexto

O Carcará Code já tem uma aba **MCP** funcional ([src/components/MCPPanel.jsx](../../../src/components/MCPPanel.jsx) + [mcp-core.cjs](../../../mcp-core.cjs)) que fala MCP direto do main process do Electron (sem o proxy server do Inspector oficial), com transportes stdio e HTTP/SSE, conexão/desconexão, servidores salvos por projeto, e navegação de **Tools / Resources / Prompts** (listar + invocar/ler/obter).

O objetivo macro é **paridade total com o [MCP Inspector oficial](https://github.com/modelcontextprotocol/inspector)**, decomposto em 4 sub-projetos independentes (cada um com seu spec → plano → implementação):

- **Bloco A** — Navegação de features do servidor: resource templates, subscribe, completions (autocomplete de argumentos), paginação (`nextCursor`).
- **Bloco B** — Capacidades fornecidas pelo *cliente*: sampling, roots, elicitation (o cliente responde a requisições do servidor).
- **Bloco C** — *Este spec.* Observabilidade/debug: history de JSON-RPC, logging com níveis, progress, ping.
- **Bloco D** — Conexão/auth: env vars, bearer, headers, OAuth 2.0, timeouts.

Ordem de execução acordada: **C → A → B → D**. C primeiro porque dá visibilidade pra debugar todo o resto e é barato.

Princípio de portabilidade: **não** copiar os arquivos do Inspector literalmente — a arquitetura dele (proxy Node + cliente web sobre WebSocket/SSE) é mais pesada e traria a complexidade/erros dele. Copiamos a **lógica de cada feature e o UX**, encaixando na arquitetura já mais limpa do Carcará.

## Objetivo do Bloco C

Transformar a aba MCP num inspector de verdade: ver todo o tráfego JSON-RPC cru entrando/saindo, as notificações de logging do servidor (com controle de nível), o progresso de operações longas, e poder dar ping. Sem isso, debugar os Blocos B/D depois seria às cegas.

## Decisão técnica central: captura de tráfego

**Abordagem escolhida: interceptar o transport (Abordagem 1) + `setLevel` por cima.**

Depois de `client.connect(tp)`, embrulhamos `tp.send` e `tp.onmessage` para emitir cada mensagem JSON-RPC (saída/entrada) num **único** hook `onTraffic`. Um só mecanismo captura tudo — requests, responses, notificações de logging e progress — no mesmo fluxo cru. É o equivalente, em ~8 linhas no core, ao que o proxy do Inspector faz com um servidor separado.

Alternativas descartadas:
- *Só API pública* (`setNotificationHandler` + instrumentar cada chamada à mão): não captura o fluxo cru genérico, exige encanamento por método e perde qualquer coisa não-fiada manualmente — caminho de mais erro.
- *Híbrida explícita*: usar handlers públicos para logging/progress além da interceptação — mais código sem ganho real, já que a interceptação já entrega esses tipos. Mantemos só o `setLevel` público (que precisa de chamada semântica, não é captura).

## Arquitetura e fluxo de dados

```
servidor MCP ⇄ transport (stdio/http)
                   │  tp.send / tp.onmessage   ← wrap aqui (mcp-core)
                   ▼
            mcp-core.cjs  → hooks.onTraffic({ dir, message })
                   ▼
              main.js  → webContents.send('mcp:traffic', { dir, message, ts })
                   ▼
            MCPPanel  → histórico em memória (ring buffer, cap 500)
                   ▼
        Drawer inferior "Inspector"  (History · Logging · Progress)
```

Fluxo único `mcp:traffic`. `ts` é carimbado no **main** com `Date.now()` (permitido lá; não é workflow script). O renderer classifica cada mensagem pela forma do objeto JSON-RPC:

- tem `method` **e** `id` → **request**
- tem `id` **e** (`result` ou `error`) → **response** (erro se `error`)
- tem `method` **sem** `id` → **notification**
  - `method === 'notifications/message'` → **log** (subtipo de notification)
  - `method === 'notifications/progress'` → **progress** (subtipo de notification)

Direção (`dir`): `'out'` (cliente→servidor) ou `'in'` (servidor→cliente).

## Mudanças por arquivo

### `mcp-core.cjs`

1. **Wrap do transport** dentro de `mcpConnect`, logo após o `client.connect(tp)` ter sucesso (tanto no ramo stdio quanto no HTTP/SSE — fazer numa função `instrumentTransport(tp, hooks)` chamada nos dois lugares, após connect, para cobrir o caso do fallback SSE):

   ```js
   function instrumentTransport(tp, hooks) {
     if (!hooks.onTraffic || !tp) return;
     try {
       const origSend = tp.send?.bind(tp);
       if (origSend) tp.send = (m, o) => { try { hooks.onTraffic({ dir: 'out', message: m }); } catch {} return origSend(m, o); };
       const origOnMsg = tp.onmessage;
       tp.onmessage = (m, extra) => { try { hooks.onTraffic({ dir: 'in', message: m }); } catch {} return origOnMsg?.(m, extra); };
     } catch {}
   }
   ```
   Degrada sem quebrar: se `tp.send`/`onmessage` não existirem, segue sem traffic.

2. **`mcpPing(connId)`** → `await mcpClient(connId).ping()`.
3. **`mcpSetLogLevel(connId, level)`** → `await mcpClient(connId).setLoggingLevel(level)`.
4. Exportar as novas funções.

### `main.js`

1. No handler `mcp:connect`, adicionar o hook ao objeto de hooks já passado:
   ```js
   onTraffic: ({ dir, message }) => mainWindow?.webContents.send('mcp:traffic', { dir, message, ts: Date.now() }),
   ```
2. Handlers novos seguindo o padrão `try { return { ok: true, ... } } catch (e) { return { ok: false, error: e.message } }`:
   - `mcp:ping` → `mcpCore.mcpPing(connId)`; retorna `{ ok, ms }` (latência medida com `Date.now()` antes/depois).
   - `mcp:setLogLevel` → `mcpCore.mcpSetLogLevel(connId, level)`.

### `preload.js`

Expor:
```js
mcpPing: (connId) => ipcRenderer.invoke('mcp:ping', { connId }),
mcpSetLogLevel: (connId, level) => ipcRenderer.invoke('mcp:setLogLevel', { connId, level }),
```

### Renderer — novo componente `src/components/McpInspectorDrawer.jsx`

Drawer inferior redimensionável, montado no `MCPPanel` quando `connected`. Substitui o toggle "log" atual (o stderr existente passa a viver na aba **Logging** do drawer). Estado do histórico vive no `MCPPanel` (para sobreviver à navegação entre Tools/Resources/Prompts) e é passado por props; o drawer é apresentacional.

**Estado no MCPPanel:**
- `traffic`: array (ring buffer, cap 500). Listener `mcp:traffic` faz `setTraffic(t => [...t, entry].slice(-500))`. Cada `entry` ganha um `seq` incremental local para key estável.
- Reset de `traffic` ao desconectar e no listener `mcp:closed` (já existe).
- `drawerOpen` / `drawerHeight` (persistido em `localStorage`, padrão ~220px), espelhando o padrão de `sidebarWidth`.

**Abas internas do drawer:**

- **History** — lista cronológica de TODAS as entries. Cada linha: seta `→`/`←`, badge de tipo (request azul / response verde / error vermelho / notification cinza), `method` (ou `result`/`error` para responses), `id`, latência (response casada com request pelo mesmo `id`), timestamp `HH:MM:SS.mmm`. Clique expande o JSON cru num CodeMirror read-only (`json()` + `editorTheme`, já usados no painel). Filtro por tipo (chips) + botão "Limpar".
- **Logging** — só entries `notifications/message`, com badge de nível colorido (debug, info, notice, warning, error, critical, alert, emergency) + o texto/`data`. No topo: dropdown **setLevel** (chama `mcpSetLogLevel`), desabilitado se `!caps.logging`. Inclui também as linhas de **stderr** já capturadas (`mcp:log`) intercaladas por timestamp.
- **Progress** — entries `notifications/progress` agrupadas por `progressToken`, cada grupo com a última `progress`/`total` numa barrinha e o `message` opcional.

**Topo do drawer (barra fixa):** botão **Ping** (mostra `{ms}ms` ou erro inline), contador total de mensagens, badge "+N truncadas" quando o ring buffer descartou entries, e o chevron de recolher.

## Erros e bordas

- **Memória:** ring buffer cap 500; descarta as mais antigas; UI mostra "+N truncadas".
- **Capabilities:** `setLevel` desabilitado se o servidor não anuncia `caps.logging`. Ping é universal (não depende de capability).
- **Reset:** histórico, progress e contadores zeram ao desconectar / `mcp:closed` / trocar de servidor.
- **Monkey-patch defensivo:** toda a instrumentação é `try/catch`; ausência de `send`/`onmessage` degrada para "sem traffic", nunca quebra a conexão.
- **JSON gigante:** entries muito grandes (> ~50KB serializado) mostram só o cabeçalho com aviso "payload grande — clique para expandir"; a expansão renderiza sob demanda.

## Testes

- **Smoke (`mcp-core`)**, no estilo do [scripts/mcp-smoke.cjs](../../../scripts/mcp-smoke.cjs) existente: conectar no `@modelcontextprotocol/server-everything` via stdio passando um `onTraffic` que acumula; disparar um `callTool` simples; asseverar que `onTraffic` recebeu ≥1 `out` e ≥1 `in`, e que pelo menos uma entry tem `method`. Testar `mcpPing` (resolve) e `mcpSetLogLevel('debug')` (resolve, e que chega ao menos uma `notifications/message` depois — o server-everything emite logs).
- **Renderer:** verificação manual via app (build obrigatório — edições em `src/` só aparecem após `npm run build`): conectar no server-everything, abrir o drawer, ver requests/responses fluindo ao invocar uma tool, trocar o nível de log e ver as notificações, dar ping.

## Fora de escopo (YAGNI)

- Sampling / Roots / Elicitation → Bloco B.
- Completions / resource templates / subscribe / paginação → Bloco A.
- Auth (bearer/OAuth) / env vars / timeouts → Bloco D.
- Exportar/salvar histórico em arquivo — adiável; não pedido.
- Replay de requests do history — adiável.
