# Diagnóstico: retomada de sessão do Codex

Status: corrigido e validado contra o Codex 0.153.3. Ver "Validação em 0.153.3" no fim.
Data: 2026-08-31, revisto em 2026-09-04. Codex local na primeira rodada: `codex-cli 0.144.6`.
Na validação: `codex-cli 0.153.3`.

> **Aviso ao leitor de 2026-09-04.** A seção "Causa raiz" abaixo aponta o par
> _rollout id_ / _thread id_ como o culpado. Isso foi deduzido das notas de release e
> **não se confirmou**. A causa real está em "Validação em 0.153.3", no fim: o Codex
> trocou a forma como grava o turno do usuário dentro do rollout. As seções antigas
> ficam como registro do raciocínio.

## Sintoma

Abas de Codex voltam em branco depois de fechar e reabrir o Carcará. O `fix(codex)` de
0.1.13 (commit `b334275`, `electron/codex-sessions.cjs`) resolveu isso para quem estava
no Codex 0.144.x, mas usuários em versões novas do Codex continuam reclamando.

## O que o Carcará faz hoje

`electron/codex-sessions.cjs` lê o histórico direto do disco:

1. Varre `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`.
2. Tira o uuid do **nome do arquivo** (`ROLLOUT_RE`) ou do `session_meta.id` / `session_meta.session_id`.
3. Guarda esse uuid em `cfg.sessions[projeto][].resume.codex`.
4. No restart, emite `codex resume <uuid>`.

Testado contra os rollouts reais desta máquina: funciona. Os 5 rollouts em disco são lidos,
o `cwd` bate, o `rolloutHasUser` acha o turno do usuário na linha 9, o título sai certo.
O módulo não tem defeito no formato que ele foi escrito para ler.

## Causa raiz

O formato mudou embaixo dele. A partir do Codex 0.148.0 o histórico saiu do rollout JSONL
e foi para um _thread store_ paginado, com migração automática em segundo plano. Do
release 0.148.0:

- `#37348` "Add rollout migration tooling and background migration"
- `#38127` "**Distinguish rollout IDs from thread IDs**"
- `#38244` "Resolve paginated thread history by rollout ID"
- `#38604` "Avoid paginated resume requests for verified legacy rollouts"

O `#38127` é o que quebra o Carcará: o uuid do nome do arquivo virou _rollout id_, e o
`codex resume` espera um _thread id_. São coisas diferentes agora. Some-se a isso a
migração em segundo plano, que converte a sessão sem o usuário pedir e deixa o JSONL de
ser o registro vivo. O leitor fica cego duas vezes: pega o id errado e olha para um
arquivo que parou de ser atualizado.

Evidências de que existem dois backends convivendo:

- `session_meta.history_mode = "legacy"` nos rollouts desta máquina. O campo só existe
  porque há um modo não-legado.
- O parâmetro `useStateDbOnly` do `thread/list`, descrito como "return from the state DB
  **without scanning JSONL rollouts**".
- `codex migrate-rollouts` existe a partir de 0.148 e não existe em 0.144.6.

Nota de honestidade: a falha em 0.148+ foi deduzida das notas de release e do schema, não
reproduzida numa máquina com Codex novo. O passo de confirmação está na seção de validação.

## Causa secundária (provável, não confirmada)

`newRollout()` só devolve um id quando encontra **exatamente um** candidato novo no
projeto. O Codex 0.144.6 já tem `multi_agent` estável e ligado, e o config desta máquina
tem `ambient-suggestions-enabled = true`. Subagentes e threads ambientes gravam rollouts
próprios (ver issue #34061, sobre uso de disco por subagentes). Se dois rollouts do mesmo
`cwd` aparecerem juntos, o guard devolve `null` para sempre e a aba nunca ganha id, mesmo
no formato legado.

Um risco menor no mesmo arquivo: `MAX_LINES = 40`. Nos rollouts desta máquina o
`user_message` está na linha 9, com 8 linhas de preâmbulo. Projeto com muito MCP, hooks e
plugins empurra esse preâmbulo para cima e pode passar de 40.

## Como acessar uma sessão do Codex do jeito certo

O caminho suportado é o `app-server`, um JSON-RPC sobre stdio. Ele fala com o thread store,
seja qual for o backend, então não quebra quando o formato muda.

Handshake e chamada, verificados nesta máquina:

```jsonc
// 1. spawn: codex app-server --stdio
{"jsonrpc":"2.0","id":1,"method":"initialize",
 "params":{"clientInfo":{"name":"carcara","title":"Carcará","version":"0.1.13"},
           "capabilities":{"experimentalApi":true}}}
// 2. notificação
{"jsonrpc":"2.0","method":"initialized","params":{}}
// 3. lista as threads do projeto
{"jsonrpc":"2.0","id":2,"method":"thread/list",
 "params":{"limit":5,"cwd":"C:\\Users\\...\\projeto"}}
```

Resposta real obtida (recortada):

```json
{
  "data": [
    {
      "id": "019ffbd0-4cfb-7252-957b-afdb26a52690",
      "preview": "ola tudo bem",
      "cwd": "C:\\Users\\Ygor Andrade\\Documents\\github\\joiamisticalaroye",
      "historyMode": "legacy",
      "ephemeral": false,
      "path": "C:\\Users\\...\\rollout-....jsonl"
    }
  ]
}
```

Custo medido: 177 ms, incluindo o spawn do processo.

Cada item traz tudo que o Carcará hoje extrai na unha:

| Campo                                 | O que resolve no Carcará                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `id`                                  | o id de retomada, já como _thread id_                                            |
| `preview`                             | primeiro prompt do usuário, o título da aba, sem abrir arquivo de 30 MB          |
| `cwd`                                 | filtro por projeto (o servidor filtra, o parâmetro `cwd` aceita string ou lista) |
| `ephemeral`                           | descarta thread descartável antes de amarrar na aba                              |
| `historyMode`                         | diz se aquela thread ainda é legada                                              |
| `forkedFromId`, `parentThreadId`      | permite seguir fork e subagente em vez de tropeçar neles                         |
| `recencyAt`, `createdAt`, `updatedAt` | ordenação, sem depender de `mtime`                                               |
| `path`                                | o rollout, quando ainda existe                                                   |

Outros métodos úteis no mesmo protocolo: `thread/read` (com `includeTurns`), `thread/resume`,
`thread/fork`, `thread/archive`, `thread/name/set`, `thread/metadata/update`.

Para gerar o schema completo numa máquina qualquer:

```
codex app-server generate-json-schema --out <dir>
```

O que **não** existe: uma flag para o Carcará escolher o id da sessão na largada, do jeito
que o `claude --session-id` permite. O `codex --help` de 0.144.6 não tem `--session-id`
nem `--name`. Então o id continua tendo que ser descoberto depois que a thread nasce.

## Correção aplicada

`electron/codex-app-server.cjs` (novo) é um cliente JSON-RPC do `codex app-server --stdio`:
processo único e preguiçoso, handshake uma vez só, timeout por requisição, cooldown de
60 s depois de uma falha, e `shutdown()` engatado no `cleanup()` do `main.js`. Toda função
devolve `null` quando algo dá errado, e aí quem chama cai no leitor de rollout.
`CARCARA_CODEX_APP_SERVER=0` força o plano B (serve pra isolar bug em campo).

`electron/codex-sessions.cjs` ganhou uma camada assíncrona por cima. As funções de fs
antigas continuam exportadas e intactas, como plano B:

| Novo                                 | Faz                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `snapshotThreads`                    | `{ via: 'app' \| 'rollout', ids }`. O `via` existe porque os dois planos falam ids diferentes no 0.148+: tirar o snapshot por um e procurar pelo outro casaria a aba com o id errado. |
| `findNewThread` / `pickNewThread`    | acha a conversa que nasceu depois do snapshot, descartando `parentThreadId` e `forkedFromId` (subagente e fork)                                                                       |
| `resolveThreadId` / `pickResolvedId` | migra o id gravado pelo 0.1.13 (rollout id) pro thread id, casando pelo `path`                                                                                                        |
| `threadExists`, `threadTitle`        | usam o `preview` do `thread/list`, sem abrir rollout                                                                                                                                  |

`electron/session-history.cjs`: o leitor do codex aponta pros novos, e o contrato ganhou
`resolveId(id, projectPath)` (opcional) e um `projectPath` no `historyExists`. O leitor do
claude não mudou.

`main.js`: `buildLaunchCommand`, `startSessionWatcher`, `readSessionTitle(For)` e
`scheduleAutoCheckpoint` viraram `async`, e os handlers `sessions:list`,
`session:refreshTitle` e `sessions:rename` junto. Dois detalhes que não são cosméticos:

- o `term:ensure` dá `await startSessionWatcher(...)` ANTES de escrever o comando no pty.
  Sem isso o snapshot fecha depois de a conversa nascer, ela entra no "o que já existia" e
  o `findNew` nunca a enxerga.
- o tick do watcher tem trava `tickBusy`: agora ele é assíncrono e pode passar de 1,5 s.

Testes: `electron/codex-sessions.test.js` cobre as decisões puras (336 no total, 12 novos),
e `npm run test:codex` (`scripts/codex-app-server.smoke.cjs`) fala com o Codex de verdade e
pula sozinho quando não há `codex` na máquina. Esse smoke já pegou uma coisa: o
`thread/list` devolve ordenado por `recencyAt`, não por `updatedAt`, então a ordenação
passou a ser feita por nós.

Verificado de ponta a ponta pelo reader real, contra o Codex desta máquina: `snapshot`
volta `via: 'app'`, `historyExists` acerta id real e id fantasma, `title` sai do `preview`
sem abrir arquivo, `findNew` acha a conversa certa quando falta uma no snapshot, e
`pickResolvedId` converte o id do nome do rollout no thread id.

O modo chat (experimental) lê o mesmo campo `resume.codex` do config, então herda o id
corrigido assim que a aba de terminal migra.

## Correção proposta (o plano, mantido como registro)

Trocar o miolo de `electron/codex-sessions.cjs` por um cliente de `app-server`, mantendo a
mesma interface que `electron/session-history.cjs` já consome (`snapshot`, `findNew`,
`historyExists`, `title`, `resumeCmd`). Nada muda em `main.js`: o seam por CLI já existe.

Pontos de atenção:

1. **Fallback.** `codex app-server` é marcado `[experimental]` e não existe em Codex muito
   antigo. Se o `initialize` falhar, cair no leitor de rollout atual.
2. **Processo de vida curta.** Subir o app-server por chamada custa ~180 ms. O watcher roda
   a cada 1,5 s, então dá para manter um processo por app e multiplexar por `id` de request.
3. **O guard de candidato único.** Com `ephemeral` e `parentThreadId` na mão, dá para
   filtrar subagente e thread ambiente em vez de desistir quando aparecem dois candidatos.
4. **Reconciliação.** Quem já tem um _rollout id_ salvo em `resume.codex` vindo do 0.1.13
   precisa de uma passada que troque pelo _thread id_ correspondente, usando o `path` que o
   `thread/list` devolve.

## Validação em 0.153.3 (2026-09-04)

Atualizei o Codex desta máquina de 0.144.6 para 0.153.3 e rodei os quatro passos que
estavam pendentes. Dois resultados desmentem o diagnóstico anterior.

### 1. O rollout id NÃO divergiu do thread id

Copiei os 5 rollouts legados pra um `CODEX_HOME` temporário e rodei
`codex migrate-rollouts --apply` lá dentro. Os 5 migraram de `legacy` pra `paginated` e
os arquivos continuaram no disco. O `thread/list` devolveu o mesmo id antes e depois, e
esse id segue igual ao uuid do nome do arquivo:

```
ANTES   019ffbd0-4cfb-7252-957b-afdb26a52690 | arquivo=019ffbd0-...-52690 | IGUAL | legacy
DEPOIS  019ffbd0-4cfb-7252-957b-afdb26a52690 | arquivo=019ffbd0-...-52690 | IGUAL | paginated
```

Thread nova criada no 0.153.3 nasce `paginated` e também mantém id igual ao do arquivo.
O `resolveThreadId` / `pickResolvedId` continua no código como seguro contra uma
divergência futura, mas hoje ele não tem nada pra migrar.

### 2. A causa real: o turno do usuário mudou de forma dentro do rollout

O leitor de disco procurava a string `"user_message"`. Ela sumiu:

```jsonc
// 0.144.6
{"type":"event_msg","payload":{"type":"user_message","message":"oi"}}
// 0.153.3
{"type":"event_msg","payload":{"type":"item_completed",
 "item":{"type":"UserMessage","content":[{"type":"text","text":"oi"}]}}}
```

Sem achar a marca, `rolloutHasUser` devolvia `false` e `sessionTitle` devolvia `null`. O
`newRollout` então descartava o arquivo da conversa que acabara de nascer, o watcher nunca
gravava o id, e no restart a aba subia `codex` puro. É a aba em branco que o usuário
relatou.

O `userText` em `electron/codex-sessions.cjs` passou a entender as duas formas. Não vale
olhar `response_item` com `role: "user"`: o `<environment_context>` que o Codex injeta no
começo da conversa também é `role: "user"` e viraria o título da aba.

Medido com o ciclo completo, num `CODEX_HOME` isolado, contra o Codex 0.153.3:

| Caminho                      | Antes do fix             | Depois |
| ---------------------------- | ------------------------ | ------ |
| plano A (`codex app-server`) | passa                    | passa  |
| plano B (leitor de rollout)  | trava no `findNewThread` | passa  |

O plano A já estava salvo porque o `thread/list` entrega o `preview` pronto. Quem só tinha
o plano B, como a v0.1.13 publicada, ficava sem conversa nenhuma.

### 3. O ciclo inteiro virou teste

`scripts/codex-resume.e2e.cjs` (`npm run test:codex-e2e`) sobe o `codex` de verdade num
pty, manda um prompt, chama as mesmas funções que o `main.js` chama, mata o pty sem
encerrar gracioso e confere que `codex resume <id>` traz a conversa de volta. Com
`--plano-b` ele repete tudo pelo leitor de rollout. Pula sozinho sem `codex` no PATH ou
sem `auth.json`.

Duas armadilhas que o teste documenta:

- `os.tmpdir()` no Windows volta o caminho 8.3 (`C:\Users\YGORAN~1\...`) e o Codex resolve
  o caminho longo. Sem `fs.realpathSync.native`, a chave `[projects.<caminho>]` do
  `config.toml` não casa e a TUI para na pergunta de confiança da pasta.
- `thread/list` sem `sourceKinds` só devolve fontes interativas. Sessão criada por
  `codex exec` não aparece, o que invalida um teste montado em cima do `exec`.

### 4. Suíte

`npm test` (347), `npm run test:codex` e `npm run test:codex-e2e` nos dois planos, todos
verdes no 0.153.3.

## Fontes

- [Release 0.148.0 · openai/codex](https://github.com/openai/codex/releases/tag/rust-v0.148.0)
- [Codex changelog oficial](https://learn.chatgpt.com/docs/changelog)
- [Session Resumption and Forking · DeepWiki](https://deepwiki.com/openai/codex/4.4-session-resumption-and-forking)
- [Issue #38349: resume lento em sessões legadas grandes](https://github.com/openai/codex/issues/38349)
- [Issue #34061: uso de disco por subagentes](https://github.com/openai/codex/issues/34061)
- [Issue #23001: thread antiga não abre quando falta `thread_source`](https://github.com/openai/codex/issues/23001)
- [Issue #20165: `resume --all` não lista sessões que o `resume <id>` abre](https://github.com/openai/codex/issues/20165)
