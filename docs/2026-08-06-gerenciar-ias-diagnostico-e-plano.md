# Gerenciar IAs — diagnóstico (0.1.11) e plano de simplificação

Investigação dos dois bugs reportados em 2026-08-06. As duas causas raízes foram
**medidas na máquina real**, não inferidas. Este documento é o contexto suficiente
para implementar a Parte 2 numa sessão nova.

---

## Bug 1 — "o OpenCode não está mais instalado"

### O que o usuário viu

Estava numa aba do OpenCode (projeto `ferramentas`), não digitou nada, apertou
Ctrl+C, e a partir daí o app passou a dizer que o OpenCode não está instalado —
e não dá mais para abri-lo dentro do Carcará.

### O que realmente aconteceu (medido)

O Ctrl+C **não** é a causa; é coincidência de horário (a saída da CLI dispara a
re-detecção, que só então mostrou uma quebra que já existia).

Cadeia real:

1. O OpenCode **se auto-atualizou** rodando `npm install --global opencode-ai@1.18.14`.
   Prova: `%LOCALAPPDATA%\npm-cache\_logs\2026-08-06T18_23_58_915Z-debug-0.log`,
   `verbose argv "install" "--global" "opencode-ai@1.18.14"`,
   `verbose cwd C:\Users\...\github\ferramentas` (o cwd é o do projeto, ou seja, veio
   do terminal da aba — **não** do nosso instalador, que roda com `cwd = home`).

2. **npm 12 bloqueia scripts de ciclo de vida por padrão** (`allow-scripts`, novidade
   da versão; a máquina está em npm 12.0.1 / node 24.18.0). O fim do log:

   ```
   94 warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
   94 warn install-scripts   opencode-ai@1.18.14 (postinstall: node ./postinstall.mjs)
   99 verbose exit 0
   100 info ok
   ```

   Repare: **`exit 0` / `info ok`**. Para o npm, deu certo.

3. Só que o `opencode-ai` entrega o binário real _no postinstall_: o pacote publica um
   `bin/opencode.exe` de **479 bytes** que é um script de aviso —

   > `echo "Error: opencode-ai's postinstall script was not run." >&2`

   — e o `postinstall.mjs` é quem copia o executável de verdade
   (`node_modules/opencode-windows-x64/bin/opencode.exe`, **175 MB**) por cima dele.
   Com o script bloqueado, o stub ficou no PATH.

4. Resultado: `opencode --version` → exit 1 com
   _"Esta versão de ...\opencode.exe não é compatível com a versão do Windows sendo
   executada"_ (o Windows tentando executar um shell script como PE). Nosso
   `aiInstaller.detect()` faz `spawnSync(bin, ['--version'])` e trata `status !== 0`
   como não instalado — ou seja, **a detecção estava certa**: o OpenCode estava
   genuinamente quebrado.

### Reparo aplicado (nesta sessão, na máquina do usuário)

O binário de 175 MB já estava baixado; faltava só a cópia. Rodado o passo que o próprio
stub instrui:

```
cd "$APPDATA/npm/node_modules/opencode-ai" && node postinstall.mjs
```

Verificado: `opencode --version` → `1.18.14`, exit 0. **Resolvido.**

### O que ainda precisa mudar no app

`electron/ai-catalog.cjs` define `opencode.update = { builtin: 'opencode upgrade' }`.
`opencode upgrade` é justamente o caminho que dispara o `npm install -g` acima quando o
OpenCode foi instalado via npm. Ou seja: **o nosso botão "Atualizar" reproduz o bug**,
para qualquer usuário com npm ≥ 12. Mesma armadilha vale para qualquer CLI que entregue
binário por `postinstall` (o `@anthropic-ai/claude-code` também tem script de install).

Regra a adotar: comando de instalação/atualização que passe por `npm i -g` precisa de
`--allow-scripts=<pacote>`, ou não deve ser oferecido pelo app.

---

## Bug 2 — a tela "Gerenciar IAs" (botões automáticos)

### 2a. `settings.aiTerminalClear` vazando cru na tela — CORRIGIDO

`AiManager.jsx:470` chama `t('settings.aiTerminalClear')` e a chave **não existia em
nenhum dos 18 locales** — então o `t()` devolvia a própria chave e o botão exibia
literalmente `settings.aiTerminalClear`.

Por que passou pelo CI: `scripts/i18n-parity.smoke.cjs` compara os locales **entre si**
(referência `en`). Chave que falta em _todos_ tem paridade perfeita e passa batido.

Correção:

- chave adicionada nos 18 locales (splice na string, 1 linha por arquivo, zero
  reformatação — receita do `DESAFIOS.md`);
- `i18n-parity.smoke.cjs` ganhou uma terceira checagem: varre `t('chave.literal')` em
  `src/**` e exige que exista em `en.json` (787 chamadas conferidas). Concatenações
  (`t('rail.ssh_' + status)`) e chaves dinâmicas (`t(uninstall.note_key)`) ficam de fora
  de propósito. Provado por regressão: removendo a chave do `en.json`, o teste falha
  apontando `AiManager.jsx`.

### 2b. "Instalando…" que nunca termina — causa raiz encontrada, NÃO corrigido

O `installSpec('opencode', 'win32')` é:

```json
{ "shell": "sh", "cmd": "curl -fsSL https://opencode.ai/install | bash" }
```

Medido nesta máquina:

| binário | `where`                        |
| ------- | ------------------------------ |
| `sh`    | **não encontrado** (exit 1)    |
| `bash`  | **não encontrado** (exit 1)    |
| `curl`  | `C:\Windows\System32\curl.exe` |

O PATH só tem `C:\Program Files\Git\cmd` — que contém `git.exe`, **não** `sh.exe`/`bash.exe`
(esses moram em `C:\Program Files\Git\usr\bin`, fora do PATH). Ou seja, **o botão
"Instalar" do OpenCode não tem como funcionar em Windows sem Git Bash no PATH** — que é
o caso do público-alvo (PC de não-dev).

E o modo como ele falha é pior que o erro em si. Medido com sonda usando os módulos reais:

```
LocalPty JOGOU SINCRONO -> Error: File not found:
```

O `new LocalPty(...)` **joga de forma síncrona**. Então:

1. `ai-installer.run()` chama `onDone({ok:false, error:'shell indisponível: ...'})`
   ainda **dentro** de `run()`;
2. `main.js` (`aiInstall:start`) cai no ramo `pendingDone`: o `installId` ainda não foi
   registrado, e o `done` sai num `setImmediate`;
3. no renderer, `start()` acabou de fazer `setInstallId(id)` — mas o listener montado
   ainda fecha sobre `installId = null`. O handler começa com
   `if (id !== installId) return;`
4. se o `done` ganhar a corrida do commit do React, o `return` mata o resto do handler —
   **`setBusy(null)` nunca roda**. A linha fica em "Instalando…" para sempre, sem
   nenhuma mensagem de erro.

Isso explica exatamente o print e o "tem vez que funciona, tem vez que não": é uma
corrida. Ganhando a corrida, o usuário vê `shell indisponível: File not found:` — um erro
sobre o qual ele não pode fazer nada.

Medições que **refutaram** hipóteses no caminho (não repetir):

- `ai:status` inteiro (4 CLIs, `force:true`, com rede) leva **1,6 s**, com só 337 ms de
  `spawnSync` bloqueando o main. Não é lentidão.
- o `req.setTimeout(6000, () => req.destroy())` do `getJson` **resolve** a promise
  (repro: 6012 ms) — não é promise pendurada.

---

## Parte 2 — plano: trocar automação por terminal + receita

Pedido do usuário, textual: _"eu quero uma abordagem mais simples, mas à prova de erros e
que eu não fique dependente de atualizar esse código"_ / _"poderia ter só um terminalzinho
para você ir colando os comandos e instalar com o tutorial de como fazer"_.

### Por que a automação atual é estruturalmente frágil

1. Ela embute o comando de instalação de **cada fornecedor** no nosso código
   (`ai-catalog.cjs`). Quando o fornecedor muda o instalador, o app quebra até a
   próxima release nossa — exatamente a dependência que o usuário quer cortar.
2. Ela escolhe um interpretador (`sh`/`powershell`) que pode não existir na máquina,
   e falha **de forma invisível** (2b).
3. Ela dá "sucesso" com base em exit code de terceiros, que mente (o `exit 0` do npm 12
   do Bug 1 é o caso exemplar).

### Desenho proposto

Uma coluna de status + um terminal **de verdade** (o mesmo shell padrão do SO que o
`ShellView` já usa), e por CLI:

- estado (instalada / versão / última publicada) — isso continua útil e é barato;
- o comando oficial **visível como texto**, com botão "Copiar";
- botão "Colar no terminal" que **escreve a linha no terminal e para** — o usuário lê e
  aperta Enter. Nada executa sozinho;
- link "Como instalar" para a documentação oficial do fornecedor;
- o terminal é interativo: se o instalador perguntar algo, o usuário responde ali.

O que isso mata de uma vez:

- sem `sh` inventado → sem `File not found` (usa o shell que a máquina tem);
- sem evento `done` crítico → some a corrida do 2b, e com ela o "Instalando…" eterno;
- comando errado/desatualizado vira algo **editável e visível**, não uma falha opaca;
- o `--allow-scripts` do Bug 1 pode entrar no texto do comando e o usuário enxerga.

### Prós e contras (decisão técnica)

| opção                                                          | prós                                                                                                     | contras                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A. Terminal + comando colável + link oficial** (recomendada) | Simples; falha visível; reaproveita a PTY do `ShellView`; corta as 3 fragilidades; menos código que hoje | Um clique a mais (Enter); o usuário vê um terminal                                            |
| B. Manter automação e só consertar a corrida + o `sh`          | Menor diff                                                                                               | Não resolve a fragilidade 1 e 3; continua dependendo de a gente atualizar comando de terceiro |
| C. Só link para a documentação, sem terminal                   | Zero manutenção                                                                                          | Joga o usuário para fora do app; é o oposto de "IDE para não-dev"                             |

**Recomendação: A.** É a única que ataca a causa estrutural, e é o que o usuário
descreveu. Por DRY, ela ainda _remove_ código (todo o eixo `aiInstall:*` de
install/update/uninstall automático some ou encolhe muito).

### Arquivos que a Parte 2 toca

- `src/components/AiManager.jsx` — reescrita (hoje 562 linhas; o alvo é bem menor)
- `electron/ai-catalog.cjs` — `install/update` deixam de ser "comando que a gente roda" e
  passam a ser "comando que a gente **mostra**" + campo novo `docs` (URL oficial por CLI)
- `electron/ai-installer.cjs` — `run()` (PTY one-shot) sai; `detect`/`latestVersion`/`whichBin` ficam
- `main.js` — handlers `aiInstall:*` saem/encolhem; reaproveitar a PTY de shell
- `src/lib/locales/*.json` — textos novos (tutorial, "Colar no terminal", "Como instalar")
- `scripts/ai-catalog-smoke.cjs` — ajustar ao catálogo novo

### Cuidados

- `SettingsModal.jsx` abre o painel com `initialInstallKey` (o chip ⬇ "clique para
  instalar"). Esse fluxo tem de continuar levando à CLI certa — agora só _selecionando_ a
  linha e colando o comando, sem auto-executar.
- Rodar `npm run test:i18n`, `npm run test:aicatalog` e `npm run build`.
- `npm run build` **só compila** — a tela precisa de smoke manual (lição do TDZ no
  `DESAFIOS.md`). E o app instalado não lê o `dist/` do repositório: testar com
  `npm start`.

---

## Parte 2 — IMPLEMENTADA (opção A)

Aprovada pelo usuário e implementada na mesma data.

### O que a tela virou

Coluna esquerda: as 4 CLIs com estado (não instalada / na versão X / atualização
disponível), um ⋮ por linha (Instalar · Atualizar · Desinstalar) e um "Verificar de
novo". Coluna direita: o título ("Como instalar {CLI}"), o link da **documentação
oficial**, uma nota quando a receita precisa de explicação, os comandos em campos
**editáveis** com "Copiar" e "Colar no terminal", e embaixo o terminal ao vivo.

"Colar no terminal" escreve a linha **sem Enter**. Quem confirma é o usuário — nada
executa sem alguém ter lido.

### Mudanças por arquivo

- `electron/ai-catalog.cjs` — `RECIPES`: passos por SO (array, o `agy` precisa de dois),
  `docs` oficial e `note_key`. `installSpec`/`updateSpec`/`uninstallSpec` (specs de
  execução) saíram; entrou `commandsFor()`. `claude` entrou em `INSTALLABLE_KEYS` (a
  receita dele é mostrável como as outras).
- `electron/ai-installer.cjs` — `run()` e `spawnSpecFor()` removidos (~65 linhas).
  Sobraram `detect`/`whichBin`/`latestVersion` e o cache de 24 h.
- `main.js` — `aiInstall:*` (start/input/resize/cancel + `pendingDone`) trocado por
  `aiConsole:ensure|input|resize`, um shell comum via `resolveLocalShell()` na home.
  **O erro do PTY volta no _retorno_ do `ensure`, não por evento** — é isso que elimina
  a corrida que travava a tela.
- `src/components/AiManager.jsx` — reescrito (562 → ~400 linhas, com mais recurso).
- `src/lib/locales/*.json` — 9 chaves novas × 18 idiomas; `aiInstallConfirmBody`
  reescrito (não prometemos mais "vou rodar o instalador").

### Receitas do Windows: têm de rodar no `cmd.exe`

O smoke mostrou que o shell do SO aqui é `C:\WINDOWS\system32\cmd.exe` (via `COMSPEC`).
Por isso as receitas do Windows chamam `powershell -NoProfile -ExecutionPolicy Bypass
-Command "..."` explicitamente em vez de um `irm | iex` solto — assim a linha funciona
colada em cmd, PowerShell ou pwsh. E o OpenCode no Windows vai por
`npm install -g --allow-scripts=opencode-ai opencode-ai` (validado com `--dry-run`: o
flag é aceito e o aviso de scripts bloqueados some).

### Testes

- `scripts/ai-console-smoke.cjs` (`npm run test:aiconsole`) — **novo**: abre o shell do
  SO como a tela faz, escreve um comando e exige o eco + a execução. É o guardião do modo
  de falha antigo (shell fixo que não existe).
- `electron/ai-catalog.test.js` — reescrito, com dois testes de **regressão nomeados**:
  nenhuma receita de Windows depende de `bash`/`sh`, e todo `npm install` das receitas
  carrega `--allow-scripts`.
- `scripts/ai-catalog-smoke.cjs` — mesmas invariantes no smoke por SO.
- Estado final: 278 testes vitest, 7 smokes, lint 0 erros, build ok.

### Pendente

Smoke **manual** da tela (`npm start`) — build verde não substitui abrir a tela uma vez.
