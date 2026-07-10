# Onboarding: Scaffold Wizard para pasta nova

**Data:** 2026-07-10
**Status:** Design aprovado (aguardando revisão do usuário antes do plano)
**Escopo do v1:** apenas o **scaffold da stack**. Quiz "não sei escolher" e camada de
skills/rules/integrações (Supabase) ficam para versões futuras — o design não fecha a
porta para elas, mas elas **não** fazem parte deste v1.

---

## 1. Problema e objetivo

Quando o usuário abre um projeto cuja pasta está vazia (ou só tem lixo inicial tipo
`README.md`/`.git`), o Preview mostra hoje um `EmptyState` com "Nenhum servidor de
preview" + botão "Copiar prompt" ([PreviewPanel.jsx:1897-1915](../../src/components/PreviewPanel.jsx#L1897-L1915)).
Para começar um projeto, a pessoa precisa pedir ao Claude Code (gastando tokens, com
resultado variável) ou saber rodar `npm create ...` na mão.

**Objetivo:** substituir esse vazio, **só quando a pasta é vazia/só-lixo**, por uns
"quadradinhos" (cards) de stack. A pessoa clica em uma stack web, o app roda o CLI
oficial não-interativo, instala as dependências e sobe o preview — sem terminal cru e
sem gastar tokens.

**Não-objetivos do v1:**

- Quiz de recomendação ("é interno ou público?", "precisa aparecer no Google?").
- Instalar skills / escrever CLAUDE.md / configurar Supabase.
- Stacks não-web (backend/API, mobile/desktop): o Preview é um webview e não as mostra.
- Cards configuráveis pelo usuário: o catálogo é fixo/hardcoded no v1.

---

## 2. Decisões travadas (do brainstorming)

| Tema                | Decisão                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| Núcleo do v1        | Só o **scaffold da stack**                                                |
| Gatilho             | Pasta **vazia OU só-lixo** (`.git`, `README.md`, `.gitignore`, `LICENSE`) |
| Catálogo            | **Só web**: Vite+React, Next.js, Astro, HTML/CSS puro                     |
| Motor               | **CLI oficial** de cada stack, rodado não-interativo                      |
| Durante             | **Barra de progresso** no wizard (por etapa), esconde o terminal cru      |
| Sair no meio        | Scaffold **continua em background** (rastreado por-projeto)               |
| Conflito de arquivo | **Nunca deletar**; mover para `_backup/`                                  |
| Cards               | Fixos/hardcoded, não configuráveis no v1                                  |

---

## 3. Arquitetura

Três responsabilidades separadas (regra do CLAUDE.md: decisão pura testável separada de
execução com `fs`/`child_process`).

### 3.1 `electron/scaffold-core.cjs` — decisão pura (novo)

Sem `fs`, sem `child_process`. Coberto por `scripts/platform-smoke.cjs`.

- `CATALOG` — tabela dos 4 stacks:
  `{ id, label, icon, kind: 'cli' | 'files', needsInstall: bool }`.
- `commandFor(stackId, dir)` → devolve o argv exato (array), já com todas as flags
  anti-prompt. Para o stack `html` (kind `'files'`) devolve `null` (não é CLI).
- `filesFor(stackId)` → para stacks `kind: 'files'`, devolve `{ 'index.html': '...',
'style.css': '...' }`. Para stacks CLI, `null`.
- `SCAFFOLD_JUNK` — conjunto de nomes tolerados: `.git`, `.gitignore`, `README.md`,
  `LICENSE` (case-insensitive; `.git` casa como diretório).
- `isScaffoldable(entries)` → `true` se **todo** nome em `entries` estiver em
  `SCAFFOLD_JUNK` (inclui o caso lista vazia). `false` se houver qualquer coisa fora
  disso (ex.: `package.json`, `src/`, `index.html`, `composer.json`).

### 3.2 `main.js` — execução (novos handlers IPC)

Único lugar com spawn. Espelha o padrão já existente de `runningServers` (Map por
`projectPath`), `needsInstall`, `hasNodeModules`, `detectDevCommand`, `preview:start`.

- `scaffold:probe` `({ projectPath }) → { scaffoldable: bool, junk: string[] }`
  Lê `fs.readdirSync(projectPath)` e aplica `isScaffoldable`. `junk` é a lista de
  arquivos-lixo presentes (para o passo `confirm-clean` avisar "esta pasta tem N arquivos").
- `scaffold:run` `({ projectPath, stackId })` — motor de execução:
  1. Re-checa `isScaffoldable` **imediatamente antes de escrever**. Se mudou (a pasta
     virou não-vazia por fora), aborta com `{ error: 'not-scaffoldable' }`.
  2. Checa Node/npm via o mesmo mecanismo do `system:checkTools`. Se faltar, retorna
     `{ error: 'missing-node' }`.
  3. **Fase `scaffolding`:** se `kind: 'cli'`, spawn do `commandFor()` em `projectPath`;
     se `kind: 'files'`, escreve `filesFor()` no disco. Conflito de arquivo existente →
     move o conflitante para `projectPath/_backup/` antes de escrever (nunca deleta).
  4. **Fase `installing`:** se o stack tem `needsInstall` e há `package.json` com deps
     mas sem `node_modules` (reusa `needsInstall(p, pkg)`), roda `npm install`.
  5. **Fase `starting`:** chama o fluxo interno de `preview:start` para aquele projeto.
  6. Emite progresso por evento (`scaffold:progress` com `{ projectPath, phase, line }`)
     e o resultado final (`scaffold:done` / `scaffold:error`).
  - Rastreamento por-projeto: um `Map` `runningScaffolds` keyed por `projectPath`, para
    o scaffold **continuar em background** se o usuário trocar de projeto. Ao remontar,
    o wizard consulta `scaffold:status({ projectPath })` e reconecta na fase corrente.
- `scaffold:status` `({ projectPath }) → { phase } | null` — estado corrente do scaffold
  daquele projeto (ou `null` se não há um rodando).

### 3.3 `src/components/ScaffoldWizard.jsx` — UI (novo)

Renderizado **dentro do `PreviewPanel`**, no ramo `mode === 'empty'`, substituindo o
texto atual **apenas quando** `scaffold:probe` retorna `scaffoldable: true`. Caso
contrário, o EmptyState de hoje ("Nenhum servidor de preview" + copiar prompt) permanece
intacto.

---

## 4. Catálogo do v1 (comandos exatos)

Rodados **dentro** da pasta do projeto (`cwd = projectPath`); o `.` = pasta atual.

| Card              | kind  | Comando                                                                                                      |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| **Vite + React**  | cli   | `npm create vite@latest . -- --template react`                                                               |
| **Next.js**       | cli   | `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes` |
| **Astro**         | cli   | `npm create astro@latest . -- --template basics --install --no-git --skip-houston -y`                        |
| **HTML/CSS puro** | files | escreve `index.html` + `style.css` mínimos; sem npm                                                          |

**Gotchas confirmados (viram requisito):**

- `create-next-app`: continua perguntando o import-alias mesmo com `--yes` a menos que
  `--import-alias "@/*"` seja passado (issues vercel/next.js #56569, #62494). O conjunto
  completo de flags é **obrigatório**.
- `create-vite`: se a pasta não estiver 100% vazia (ela pode ter `.git`/README pelo
  gatilho), ele pergunta "remover arquivos existentes?". Resolvido pelo motor limpando
  conflitos para `_backup/` **antes** do spawn — não por flag.
- `create-vite` **não** roda `npm install` sozinho (só faz scaffold). Por isso o motor
  sempre executa a fase `installing` separada quando há `package.json` com deps.

Sequência efetiva do motor: **scaffold → (se package.json com deps) npm install → preview:start**.
HTML puro pula install e preview de servidor (abre o `index.html` estático).

---

## 5. Máquina de estados do wizard

```
probing → pick → (confirm-clean?) → scaffolding → installing → starting → done
                                          ↓ (qualquer passo)
                                        error
```

1. **`probing`** — ao entrar no ramo `empty`, chama `scaffold:probe`. `scaffoldable:false`
   → wizard não aparece (EmptyState de hoje). `true` → `pick`.
2. **`pick`** — os 4 cards, no lugar do "Nenhum servidor de preview".
3. **`confirm-clean`** — **condicional**: só se `junk.length > 0`. Aviso curto:
   "Esta pasta tem N arquivo(s). Vou mantê-los e criar o projeto ao redor." Pasta 100%
   vazia pula este passo.
4. **`scaffolding` → `installing` → `starting`** — barra de progresso com as três etapas
   nomeadas ("Criando projeto… / Instalando dependências… / Iniciando preview…"). Como o
   log do npm não dá porcentagem confiável, a barra é **por etapa (3 passos)**, não por
   bytes. O stream de `scaffold:progress` alimenta um "ver saída" opcional (log cru), mas
   por padrão fica escondido.
5. **`done`** — `preview:start` assume, webview mostra o app, wizard se desmonta.
6. **`error`** — ver seção 6.

**Reconexão:** ao montar num projeto, o wizard chama `scaffold:status`. Se houver um
scaffold em `scaffolding`/`installing`/`starting`, ele entra direto nessa fase em vez de
voltar ao `pick` (suporta "continua em background").

---

## 6. Erros e casos de borda

- **Falha no scaffold/install** (sem rede, CLI mudou flag, npm quebrou): estado `error`,
  mensagem amigável ("Não consegui criar o projeto") + **"Ver detalhes"** (expande o log
  cru capturado) + **"Tentar de novo"** (volta ao `pick`).
- **Node/npm ausente:** `scaffold:run` retorna `missing-node`; o wizard reaproveita o
  fluxo `system:checkTools`/`SetupScreen` ("instale o Node"), não um card quebrado.
- **Pasta virou não-vazia por fora:** `scaffold:run` re-checa `isScaffoldable` logo antes
  de escrever; se mudou, aborta com aviso — nunca sobrescreve trabalho.
- **Conflito real de arquivo** no scaffold: move o conflitante para `_backup/`, nunca
  deleta.
- **Preview não sobe após scaffold OK:** cai no EmptyState normal de hoje; o scaffold
  cumpriu seu papel e o resto é o fluxo de preview existente.

---

## 7. Testes

- **`scaffold-core.cjs` (puro), via `scripts/platform-smoke.cjs`:**
  - `commandFor()` devolve o argv esperado para cada stack CLI, e `null` para `html`.
  - `filesFor()` devolve os arquivos para `html`, e `null` para stacks CLI.
  - `isScaffoldable()`: `[]` → true; `['.git']` → true; `['README.md']` → true;
    `['.git','README.md','LICENSE']` → true; `['package.json']` → false; `['src']` →
    false; `['index.html']` → false; `['meus-pdfs']` → false.
- **Execução (spawn):** sem E2E no CI (baixaria a internet toda). Validada por **smoke
  manual**, conforme padrão do projeto (uma instância só — ver DESAFIOS.md).

---

## 8. Arquivos tocados

| Arquivo                             | Mudança                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `electron/scaffold-core.cjs`        | **novo** — catálogo + `commandFor`/`filesFor`/`isScaffoldable`                         |
| `main.js`                           | handlers `scaffold:probe` / `scaffold:run` / `scaffold:status`; `runningScaffolds` Map |
| `preload.js`                        | expor os 3 canais + listener de `scaffold:progress`                                    |
| `src/components/ScaffoldWizard.jsx` | **novo** — UI dos cards + máquina de estados                                           |
| `src/components/PreviewPanel.jsx`   | no ramo `mode === 'empty'`, montar o wizard quando `scaffoldable`                      |
| `scripts/platform-smoke.cjs`        | casos de `scaffold-core`                                                               |
| `src/lib/locales/*`                 | strings i18n do wizard                                                                 |

---

## 9. Ganchos para o futuro (fora do v1)

- **Quiz "não sei escolher":** um passo antes do `pick` que mapeia respostas → `stackId`
  do catálogo. Encaixa sem mexer no motor.
- **Skills + rules:** um passo após `done` que roda o CLI `skills` (o repo já usa
  `skills-lock.json`) e escreve CLAUDE.md/AGENTS.md. Camada independente.
- **Integrações (Supabase):** idem, pós-scaffold, escrevendo config + boas práticas.
