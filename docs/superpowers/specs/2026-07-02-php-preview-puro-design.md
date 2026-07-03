# PHP puro no Preview (sub-projeto 1 de 2)

**Data:** 2026-07-02 (decisões travadas em 2026-07-03)
**Status:** travado, pronto pra planejamento
**Origem:** e-mail de um usuário que baixou o Carcará e pediu suporte a PHP.
**Branch:** `feat/preview-php-puro`

## Contexto

O Preview de hoje é "Node-only": lê `package.json`, acha o script `dev`/`start`/`serve`,
escolhe uma porta livre, força o framework a subir nela, dá *probe* HTTP até a porta
responder e aponta o webview pra ela (`main.js`, `ipcMain.handle('preview:start', …)`,
por volta da linha 2240).

PHP não é Node, mas **não precisa de Apache/XAMPP/WAMP**: o PHP tem servidor embutido
desde a 5.4 (`php -S host:porta -t docroot`). Isso é exatamente o mesmo formato do que
já fazemos com Node — "sobe um processo que escuta numa porta". O motor de preview atual
serve pros dois; só muda a peça "como o processo sobe".

O problema real **não é o Apache** — é que **PHP não vem instalado no Windows**, então
num PC de não-dev não há `php` no PATH.

## Princípio norteador: isolamento

Node é o foco do projeto e **funciona**. Todo este trabalho é aditivo: o caminho Node
não muda de comportamento, de nome de campo, nem de arquivo. A regra é "encostou no Node,
errou". Duas consequências de design (ver Arquitetura):

- Toda a lógica PHP vive num **módulo separado** (`php-runtime.cjs`), não espalhada no `main.js`.
- A mudança de UI é **aditiva** (`previewType` novo ao lado do `hasPkg` existente), não um rename.

## Decisões travadas

1. **Escopo por sub-projetos.** Este spec cobre só **PHP puro** (arquivos `.php` soltos,
   sites/formulários simples). **Laravel** vira um segundo spec depois. **WordPress fica
   de fora** (exigiria MySQL — "XAMPP completo").
2. **Runtime do PHP: baixar sob demanda.** O instalador continua pequeno. Na 1ª vez que
   um projeto PHP é iniciado e não há PHP em cache, o Carcará baixa o PHP portable de
   Windows (~30MB) pra uma pasta em `userData` e reusa dali. Quem nunca usa PHP nunca baixa.
   (Alternativas descartadas: embutir no instalador — pesa pra todo mundo e vira dívida de
   manutenção de segurança; usar PHP do sistema + SetupScreen — trava o não-dev na
   instalação manual, contra a filosofia "just works".)
3. **Origem do binário (Risco #1 resolvido): php.net + detecção de VC redist.** Baixa o
   zip portable oficial (NTS x64) de `windows.php.net` e valida o sha256. Os builds oficiais
   dependem do *Visual C++ Redistributable 2015–2022 x64*, que é MUITO comum já estar
   presente, mas pode faltar num PC de não-dev fresco. Em vez de assumir, **detectamos**:
   se o `php.exe` sobe e sai na hora com o erro característico de `VCRUNTIME140.dll`
   ausente, mostramos orientação clara (link do VC redist da Microsoft).
   (Alternativa descartada: binário estático self-contained via `static-php-cli` — zero
   dependências seria o ideal, mas não há download oficial pronto pra Windows; exigiria
   compilar com VS2022 e hospedar/manter o binário nós mesmos — trabalho de build +
   dívida de segurança recorrente. Alternativa descartada: auto-instalar o VC redist —
   dispara UAC/elevação, atrita com o "just works".)
4. **UI aditiva, não rename.** `projects:list` ganha `previewType: 'node' | 'php' | null`;
   o campo `hasPkg` **continua existindo com o mesmo significado**. A UI deriva
   `canPreview = previewType != null`. O gate Node existente não muda de nome nem de valor.

## Arquitetura

### 1. Módulo isolado `php-runtime.cjs` (a fronteira)
Irmão do `mcp-core.cjs`: Node puro, **sem `require` de Electron/janela**, pra ser testável
por smoke isolado. Expõe funções puras:

```
detectProjectType(projectPath) -> 'node' | 'php' | null
resolvePhpDocroot(projectPath) -> caminho do docroot
buildPhpServeArgs({ phpExe, port, docroot }) -> array de args do `php -S`
ensurePhpRuntime({ onPhase }) -> Promise<phpExePath>   // baixa/cacheia se preciso
```

O `main.js` **não ganha lógica PHP** — só um `if (type === 'php') { …delega ao módulo… }`
no `preview:start`. O ramo Node continua chamando `detectDevCommand` byte por byte.

### 2. Detecção de tipo + docroot
`detectProjectType(projectPath)`:
- tem `package.json` com script `dev`/`start`/`serve` → `'node'` (ganha sempre; fluxo INTOCADO);
- senão, tem algum `.php` (index.php de preferência) → `'php'`;
- senão → `null` (sem preview, como hoje).

`resolvePhpDocroot(projectPath)`:
- se existir `public/index.php`, usa `public/`;
- senão, a raiz do projeto.

### 3. Rodar o PHP puro (ramo novo do `preview:start`)
- Comando: `php -S 127.0.0.1:<porta> -t <docroot>` usando o `php.exe` do cache.
- **Sem etapa de install** (PHP puro não tem dependências). A porta é escolhida com o
  `pickFreePort()` atual e passada direto (`-S` aceita a porta que mandamos).
- Depois de subir: o **mesmo** `markReady` / `probePort` / `preview:ready` /
  `preview:exit` / `runningServers` / `preview:stop` / `preview:status` de hoje.
  **Tudo reusado, zero duplicação do motor.**

### 4. Obter o PHP sob demanda
- Cache: `userData/runtimes/php/<versão>/php.exe`.
- Versão do PHP **fixada no código** (uma 8.x NTS x64), com **sha256 fixado**.
- Fluxo na 1ª vez (sem PHP em cache):
  1. fase **"Baixando PHP (primeira vez)…"** (aparece no log do preview);
  2. baixa o zip portable oficial (NTS x64) de windows.php.net;
  3. **valida o sha256** contra o valor fixado (se não bater, aborta e apaga o parcial —
     não roda binário não verificado);
  4. extrai pra pasta de cache;
  5. projetos seguintes reusam o mesmo binário (sem baixar de novo).

### 5. Integração com a UI (aditiva)
- `projects:list` (`main.js:629`) passa a devolver `previewType: 'node' | 'php' | null`
  (calculado por `detectProjectType`). O campo `hasPkg` **permanece** com o mesmo valor
  e significado (retrocompatível com todo consumo atual).
- Os gates de UI (`active.hasPkg` no `PreviewPanel.jsx` ~723 e ~1062; `active?.hasPkg` no
  `App.jsx` ~447) passam a usar `canPreview = previewType != null` (verdadeiro pra `node`
  **ou** `php`). Como é derivado de um campo novo, o caminho Node não muda de valor.
- **SetupScreen não ganha PHP** — é sob demanda, não pré-requisito de abertura do app.

### 6. Tratamento de erros
- Download falhou (offline/rede) → mensagem clara no log + reusa o caminho de "tentar de
  novo" do preview atual.
- sha256 não confere → aborta, apaga o parcial, mostra erro.
- `php.exe` sobe mas sai na hora por falta de VC redist → detectar o exit imediato +
  stderr característico (`VCRUNTIME140.dll`) e mostrar orientação (link do VC redist).
- Porta ocupada / probe sem resposta → já coberto pelo motor atual.

## Fora de escopo (YAGNI, neste spec)
- MySQL, Composer, `php.ini` customizado, router de front-controller.
- Laravel (→ spec 2), WordPress (descartado).
- macOS / Linux (o build-alvo é Windows).
- Auto-instalar o VC redist (só detectar e orientar).

## Teste
- Smoke test no estilo dos `.cjs` existentes (`scripts/mcp-smoke.cjs`, `scripts/csv-smoke.cjs`),
  novo `scripts/php-smoke.cjs`:
  - `detectProjectType` retorna `'php'` pra fixture com `index.php` e `'node'` pra fixture
    com `package.json`+script;
  - `resolvePhpDocroot` escolhe `public/` quando há `public/index.php`, senão a raiz;
  - `buildPhpServeArgs` monta `php -S 127.0.0.1:<porta> -t <docroot>` corretamente.
- Verificação manual: abrir uma pasta com um `index.php` simples (ex.: `joiamisticalaroye/`),
  clicar em rodar, ver a página no webview. Testar também o 1º download do runtime.

## Sequência sugerida de implementação
1. `php-runtime.cjs` com `detectProjectType` + `resolvePhpDocroot` + `buildPhpServeArgs` + smoke test (testável isolado).
2. `ensurePhpRuntime`: download-sob-demanda + cache + verificação sha256 (fixar versão e hash).
3. Ramo `php` no `preview:start` delegando ao módulo (reusando o motor).
4. `previewType`/`canPreview` na UI (aditivo, sem tocar `hasPkg`).
5. Erros (incl. detecção de VC redist) e verificação manual ponta a ponta.
