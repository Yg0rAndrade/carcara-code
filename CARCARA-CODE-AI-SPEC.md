# Carcará Code AI — Design (spec)

**Data:** 2026-07-08
**Autor:** Ygor Andrade (+ Claude)
**Status:** Rascunho para aprovação

## 0. Posicionamento (ler primeiro)

O **principal do Carcará Code é o Claude Code** (terminal + assinatura). O próprio dono usa **só o
Claude Code**. A **Carcará Code AI é um charme**: um recurso **secundário, opcional e 100%
isolado**, pensado para o **público que não usa/não quer a CLI** (nem tem assinatura do Claude).
Regras inegociáveis deste design:

- **Aditivo:** não remove, não sobrescreve, não altera o comportamento de **nada** que já existe
  (terminal, chat atual, adapters de CLI, `chatMode`, sessões). Tudo fica.
- **Isolado:** componente próprio, namespace de IPC próprio (`carcaraAi:*`), entra só como **mais
  uma opção** na lista de IAs. Ligar/desligar não afeta o resto.
- **Zero-fricção pro público-alvo:** funciona "de fábrica", sem instalar binário externo, sem o
  usuário precisar de chave.
- **Escopo enxuto:** por ser secundário (e o dono nem o usa no dia a dia), é um MVP charmoso — sem
  gold-plating.

## 1. Objetivo

Uma IA de código embutida, a **"Carcará Code AI"**, que funciona como o agente do
**Cursor/Copilot/Antigravity**: você conversa, ela **lê o projeto**, **edita os arquivos** (com
diff + aprovação), suporta **vários modelos** (inclusive **grátis**) e responde em markdown.

**Motor (decisão C — agente próprio):** um agente **minimalista, nosso**, dentro do app. Ele
**empresta a lógica de edição** ("copiar/colocar código") do **OpenCode** (open source, com
atribuição) — sem depender do binário do OpenCode instalado. Multi-modelo/grátis vêm da
**OpenRouter**, acessada por um **gateway (Edge Function no Supabase)** que guarda a chave e
controla custo. Grátis pra todo mundo, uma chave só.

### Paridade-alvo

Cursor/Copilot "Agent": chat com contexto do repo, ferramentas em loop (ler/buscar/editar),
diffs aplicáveis com aceitar/rejeitar, multi-arquivo, seletor de modelo, markdown com código,
anexar imagem.

## 2. Escopo

**Dentro (v1, em fases):**

- Chat com a Carcará Code AI (streaming, markdown) — **componente novo e isolado**.
- **Agente próprio**: ler/listar/buscar + **editar** arquivos (diff + aprovação), emprestando a
  lógica de aplicar edição do OpenCode.
- **Multi-modelo** via OpenRouter (seletor; default = modelo **grátis**).
- **Imagem** (modelos de visão da OpenRouter).
- **Gateway Supabase** (Edge Function): chave OpenRouter, **login anônimo**, **quota por
  usuário** e **teto global diário**.

**Fora (não-metas):**

- Não substitui nem toca no Claude Code / terminal / chat atual (é paralelo).
- Não depende de instalar OpenCode nem outro binário (auto-contido).
- Agente **não** roda na nuvem: edita seus arquivos **locais**, então roda local.
- Sem shell arbitrário pela IA no v1 (só arquivos).

## 3. Arquitetura

```
┌────────────────────────────────────┐        ┌──────────────────────────┐        ┌───────────────┐
│  Carcará Code (Electron)           │        │  Supabase Edge Function  │        │  OpenRouter   │
│  (Claude Code segue sendo o main)  │        │  "carcara-gateway"       │        │  300+ modelos │
│                                    │        │                          │  HTTP  │  (grátis/pago)│
│  ┌──────────────────────────────┐  │  HTTPS │ • CHAVE OpenRouter (secret)      ├───────────────┤
│  │ CarcaraChat (UI, assistant-ui)│ │ (JWT)  │ • auth anônima (JWT)     │───────►│ free models / │
│  │  ▲ renderiza                  │ │        │ • quota + teto global    │◄───────│ deepseek /    │
│  │  │                            │ │        │ • rate limit + whitelist │  SSE   │ claude/gpt... │
│  │  ▼                            │ │        │ • proxy OpenAI-compat.   │        └───────────────┘
│  │ Agente Carcará (NOSSO, local) │─┼───────►│                          │
│  │ • loop de tools               │ │  SSE   └──────────────────────────┘
│  │ • edição (lógica do OpenCode) │◄┼─────────
│  │ • edita SEUS arquivos (fs)    │ │
│  └──────────────────────────────┘ │
│  [terminal, chat atual, etc.: INTACTOS ao lado] │
└────────────────────────────────────┘
```

**Camadas:**

- **App (local), módulo isolado:** a UI (`CarcaraChat`) + o **agente próprio** (loop de tools +
  execução no filesystem via os IPCs de fs que já existem). É onde estão os arquivos — por isso
  o agente é local (agente estilo Cursor edita código local).
- **Edge Function (servidor):** o **gateway de controle**. Guarda a chave OpenRouter, faz auth,
  aplica quota + teto + whitelist de modelos, e faz **proxy OpenAI-compatible**. Todo token que
  custa dinheiro passa por aqui → controle total.
- **OpenRouter:** fan-out multi-modelo (uma chave → 300+ modelos, vários grátis).

**Por que C (agente próprio) e não depender do OpenCode:** o charme tem que ser **auto-contido
e isolado** — sem obrigar o usuário a instalar outro binário, e sem acoplar o app a um projeto
externo em outro runtime (OpenCode é TS/Bun; nosso main é Node/Electron). A parte difícil (aplicar
edições com robustez) a gente **empresta** do OpenCode (open source), que é justamente o que você
queria aproveitar.

### Ciclo de um turno

1. Usuário digita no `CarcaraChat` → `carcaraAi:send` pro **main**.
2. Main (agente) monta a conversa + as **tools** e chama o modelo — a request sai pro **gateway**
   (Edge Function), JWT no header.
3. Edge valida JWT + quota + teto + whitelist → repassa pra OpenRouter (com a chave) → **stream**.
4. Se o modelo pediu **ferramenta**: leitura (`read/list/search`) o main executa direto;
   **escrita** (`edit/write`) pede **aprovação** → UI mostra o **diff** → aplica (com **checkpoint**
   antes) ou recusa.
5. Main emite `carcaraAi:event` (text/reasoning/tool/approval/result) → UI renderiza.
6. Repete até a resposta final. Uso medido no edge (tokens/custo).

## 4. App — módulo isolado da Carcará AI

- **Componente próprio `CarcaraChat.jsx`** (usa a lib assistant-ui já instalada, mas é **arquivo
  novo** — **não** mexe no `AssistantChat.jsx` atual nem no resto).
- **Agente no main** (`carcara-agent.cjs`, novo): loop de tool calling OpenAI-compatible, chamando
  o gateway. Partes puras (montar tools, remontar tool_calls do stream, aplicar edição) testáveis
  por smoke, no estilo dos outros `*-smoke.cjs`.
- **Lógica de edição emprestada do OpenCode:** portar (com atribuição) o formato/algoritmo de
  aplicar edição (search-replace / patch) — a peça "copiar/colocar código". Só essa peça, isolada.
- **Ferramentas (v1), confinadas ao diretório do projeto** (bloqueia `..`/absolutos):
  `list_dir`, `read_file`, `search` (reusa `fs:search`), `edit_file` (aprovação), `write_file`
  (aprovação). Mapeiam nos IPCs de fs que já existem.
- **Aprovação:** escrita só grava após o OK no diff (+ toggle "aceitar tudo" = modo fluido).
- **Desfazer:** **checkpoint** (shadow git que o app já tem) antes de cada gravação.
- **IPC próprio (`preload.js`/`main.js`):** `carcaraAi:ensure/send/abort/approve` + push
  `carcaraAi:event`. **Não** reusa `chat:*` (isolamento).

## 5. Servidor — Edge Function `carcara-gateway`

### 5.1 Responsabilidades

- Endpoint **OpenAI-compatible** (`POST /chat/completions`, streaming SSE) — passthrough fino.
- **Auth:** valida o **JWT do Supabase Auth** (login anônimo) → `user_id`.
- **Guardrails** (antes de repassar):
  1. **Teto global diário** (circuit breaker): `ai_budget.spent(hoje) ≥ CAP` → `429 daily_cap`.
     **Blinda a carteira**: gasto ≤ CAP/dia no pior caso.
  2. **Quota por usuário**: `ai_usage(user, hoje) ≥ USER_LIMIT` → `429 user_quota`.
  3. **Rate limit por IP** → `429`.
  4. **Whitelist de modelos** (env): bloqueia modelos fora da lista (evita pedir modelo caro).
- Repassa pra `https://openrouter.ai/api/v1/chat/completions` com a **chave OpenRouter** (secret).
- Mede uso (tokens) e atualiza `ai_usage` + `ai_budget` ao fim do stream.

### 5.2 Dados (Supabase/Postgres)

```sql
create table ai_usage (            -- uso por usuário/dia (RLS: usuário lê só o próprio)
  user_id uuid not null,
  day date not null default (now() at time zone 'utc')::date,
  requests int not null default 0, tokens bigint not null default 0,
  primary key (user_id, day)
);
create table ai_budget (           -- orçamento global/dia (só service role)
  day date primary key default (now() at time zone 'utc')::date,
  spent_usd numeric not null default 0
);
create table ai_ratelimit (        -- rate limit por IP
  ip text not null, window_start timestamptz not null, count int not null default 0,
  primary key (ip, window_start)
);
```

Consumo **atômico** via RPC SQL (evita corrida).

### 5.3 Segredos / config (fora do git)

- `OPENROUTER_API_KEY` → **secret do Supabase**, nunca no app/git.
- Públicos no app (por design): **URL Supabase** + **anon key** (protege RLS + Auth + guardrails).
- Env da função: `CAP` diário, `USER_LIMIT`, whitelist/`DEFAULT_MODEL` (ajustável sem atualizar app).
- **Dupla trava de custo:** teto no edge **+** limite de crédito da própria chave na OpenRouter.

### 5.4 Login anônimo

- 1º uso: `signInAnonymously()` → JWT persistido no config local. Cada instalação = um `user_id`.
- Farmável → o **teto global** é a proteção real. Evolução: OAuth por cima, sem mexer no resto.

## 6. Modelos (via OpenRouter)

- **Default = modelo grátis** curado, bom pra código (custo zero no caminho feliz).
- **Seletor de modelo** (whitelist do edge): grátis + alguns melhores; DeepSeek V4 entra aqui.
- **Visão:** modelo multimodal da OpenRouter nos turnos com imagem.

## 7. UI / UX

- **Carcará Code AI = mais uma opção de IA** em `src/lib/aiOptions.jsx` (`carcara`), ao lado de
  claude/codex/agy. Aparece na `AiPicker`; escolher ela numa sessão abre o `CarcaraChat`. **Não
  altera** as outras IAs nem o toggle `chatMode` (que continua existindo, intocado).
- **No chat (`CarcaraChat`, assistant-ui):** markdown + código destacado; **seletor de modelo**;
  cartões de tool call; **diff por edição** com Aceitar/Rejeitar (+ "aceitar tudo"); anexar
  imagem; streaming/parar/"pensando"; mensagens de **quota/teto** vindas dos `429`.

## 8. Aditivo — o que NÃO muda (garantia)

Nada é removido nem alterado. Continuam **intactos**: o terminal (`ChatPanel` xterm), o
`AssistantChat.jsx` atual, os adapters `chat-cli.cjs`, os handlers `chat:*`, o `chatModeContext`
e seu toggle, todas as sessões e o `AiPicker`. A Carcará AI **adiciona** arquivos/canais novos e
**uma linha** na lista de IAs — nada mais.

## 9. Interfaces (IPC)

Novos canais isolados: `carcaraAi:ensure(sessionId, projectPath)`,
`carcaraAi:send(sessionId, {text, images, model})`, `carcaraAi:abort(sessionId)`,
`carcaraAi:approve(requestId, ok)`; push `carcaraAi:event {sessionId, event{kind,...}}`. O loop do
agente roda no **main** (tem fs + faz `fetch` no gateway + centraliza streaming).

## 10. Fases (cada uma entrega valor testável; tudo aditivo)

- **Fase 1 — Módulo isolado + agente + UI, com modelo direto.** `CarcaraChat.jsx` + `carcara-agent.cjs`
  - IPC `carcaraAi:*` + opção `carcara` na `AiPicker`. Agente lê/edita com aprovação (lógica de
    edição emprestada do OpenCode) usando um modelo **direto** (chave de dev) só pra validar
    agente+UI+diffs. Nada existente é tocado.
- **Fase 2 — Gateway Supabase + OpenRouter.** Edge Function (chave OpenRouter + auth anônima + teto
  - quota + rate limit + whitelist + tabelas). O agente passa a chamar o gateway. Vira "grátis pra
    todos, uma chave, controlado".
- **Fase 3 — Multi-modelo + imagem.** Seletor de modelo (whitelist) + envio de imagem (visão).
- **Fase 4 — Polimento.** Markdown/realce, painel de uso/quota, "aceitar tudo", @-menção de
  arquivos, OAuth opcional.

## 11. Riscos & decisões abertas

- **Valores dos guardrails (decidir):** `CAP` $/dia (ex.: **$5**?), `USER_LIMIT` (ex.: **30/dia**?),
  rate limit IP + limite de crédito na chave OpenRouter (2ª trava).
- **Portar a edição do OpenCode:** confirmar licença (atribuição) e portar só a peça de patch pra
  Node — mantê-la pequena e testável.
- **Qualidade do agente é nossa** (trade-off do C): manter o loop simples e robusto; é um charme,
  não precisa ser o Cursor inteiro.
- **Limite de tempo da Edge Function** em respostas longas: validar; streaming ajuda.
- **Anônimo é farmável** → teto global é a proteção real.
- **Custo aberto (grátis pra todos):** você banca; teto + whitelist de grátis limitam.
- **Segurança das tools:** confinar ao projeto, sem shell no v1, limitar leitura.
- **Offline:** a Carcará AI exige internet (o Claude Code/terminal não). Deixar claro na UI.

## 12. Testes

- **Puro/unit (Node, `*-smoke.cjs`):** montar tools; remontar tool_calls em streaming; aplicar
  edição (a lógica emprestada); confinamento de path; whitelist.
- **Edge Function (`supabase functions serve`):** teto → 429; quota → 429; JWT inválido → 401;
  modelo fora da whitelist → 400; streaming passthrough.
- **Runtime (app aberto):** turno de texto; tool call de leitura; edição com aprovação →
  checkpoint → desfazer; troca de modelo; imagem; mensagens de limite. **Confirmar que o fluxo
  principal (Claude Code/terminal) segue idêntico.**
