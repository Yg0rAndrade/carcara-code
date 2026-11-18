# Plano: trocar o `<webview>` do Preview pelo `WebContentsView` (0.1.19)

Data: 16/11/2026. Estado: **pesquisa e plano. Nenhum código foi escrito.**
Regra: o app hoje funciona. Só migramos se ficar **melhor**, sem perder nenhum recurso.

Base: Electron **33.4.11** (instalado). Conferido no `node_modules/electron/electron.d.ts`:
`WebContentsView`, `View.setBounds/setVisible/setBorderRadius/setBackgroundColor`,
`contentView.addChildView/removeChildView`, `webContents.enableDeviceEmulation`,
`webContents.navigationHistory` (o `canGoBack/goBack` direto do webContents já está _deprecated_),
`setDevToolsWebContents`, `capturePage`, `getType()` com o valor `'browserView'`.

> **Estado do git (16/11, 11:42, durante esta sessão):** a `main` foi resetada para
> `origin/main` (537da18). Os commits do remendo de oclusão (5ee5d7b, b956f56) **não estão
> mais na main**: estão na branch `reserva/remendo-oclusao-windows` (local e no origin).
> Ver §7.

---

## 0. Por que trocar (resumo do DESAFIOS.md)

- O `<webview>` é uma WebContents **interna** da janela do app (_guest_). A visibilidade dele
  vem da página do app (o embedder) e da posição do elemento nela. Depois de minimizar ou
  encobrir a janela, o guest fica `hidden`, ou volta `visible` mas com 0 rAF, e o GSAP
  do Digo trava. No Chrome o mesmo site funciona.
- O `disable-features=CalculateNativeWinOcclusion` (5ee5d7b/b956f56) reduziu o problema,
  mas não resolveu: na sonda de 16/11 as animações na tela caíram de ~6 para 1–4 depois de
  minimizar e restaurar, e houve um caso de `hidden` com a janela na frente.
  `backgroundThrottling=no` no `<webview>` não mudou nada.
- O `WebContentsView` é uma WebContents **de primeiro nível**, igual a uma aba do Chrome. A
  visibilidade dela vem da janela e do `setVisible`, não de um elemento DOM. A própria
  documentação do Electron desaconselha o `<webview>`.
- Mais um ganho provável, que precisa ser medido: o `TouchEmulator` é por árvore de
  WebContents (DESAFIOS, "bolinha cinza"). Com o preview fora da árvore do app, o
  `setEmitTouchEventsForMouse` deixaria de sequestrar o mouse da janela inteira. Isso
  devolveria o toque de verdade no modo celular, igual ao device mode do Chrome.

---

## 1. Levantamento completo

`grep -rn -i webview src main.js preload.js electron` (sem `electron/plugins/`) deu **194 linhas
em 26 arquivos**. Todas foram classificadas abaixo. Legenda da última coluna: **WCV** = como
fica com o `WebContentsView`. "Handle" é o objeto do renderer proposto em §4.1, que espelha a
API do elemento.

### 1.1 Preview do projeto: `src/components/PreviewPanel.jsx`

| #   | Onde                                                                   | O que faz                                                                                                                                                                           | API do webview hoje                                                                                                                                        | WCV                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | 537–575 `createTab`                                                    | Cada aba = 1 `<webview>` criado via DOM, `position:absolute; inset:0`, `display:none` até ativar                                                                                    | `document.createElement('webview')`, `appendChild` no `containerRef`                                                                                       | `window.api.previewView.create({projectPath, url, partition})` → main cria `new WebContentsView`, guarda num registro e devolve `id`. O renderer guarda um **handle** no lugar do elemento                                                                                                                                                                                                                                                                                                 |
| P2  | 547 + `src/lib/previewWebview.js:13-21`                                | Atributos `partition` (por projeto, `persist:preview-<hash>`, 373-377) e `allowpopups`                                                                                              | atributos do elemento, antes do attach                                                                                                                     | `webPreferences: { partition, plugins: true, sandbox: true, contextIsolation: true }`. **`allowpopups` deixa de existir**: no WCV o `setWindowOpenHandler` sempre é consultado. A mesma string de partition mantém cookies e storage atuais (nenhum dado se perde). `plugins:true` é **obrigatório**: hoje o PDF de `blob:` renderiza porque o guest herda o `plugins:true` da janela (DESAFIOS, allowpopups)                                                                              |
| P3  | 576–585 `syncNav`                                                      | voltar/avançar habilitados                                                                                                                                                          | `canGoBack()`, `canGoForward()`                                                                                                                            | main lê `wc.navigationHistory.canGoBack()/canGoForward()` e manda junto em cada evento de navegação                                                                                                                                                                                                                                                                                                                                                                                        |
| P4  | 586–602                                                                | URL da barra e da tira de abas                                                                                                                                                      | eventos `did-navigate`, `did-navigate-in-page` (`isMainFrame`)                                                                                             | mesmos eventos no `webContents`, repassados por IPC `preview-view:event` `{id, type, ...}`                                                                                                                                                                                                                                                                                                                                                                                                 |
| P5  | 603–610                                                                | título e favicon da aba                                                                                                                                                             | `page-title-updated`, `page-favicon-updated`                                                                                                               | idem (mesmos nomes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P6  | 611–633                                                                | re-tentativa de carga (servidor subindo), mute após load                                                                                                                            | `did-fail-load` (errorCode −3), `did-finish-load`, `reload()`; usa `w.style.display` pra saber se está escondida                                           | idem; o "está escondida" vira estado do handle (`visible`)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P7  | 635–650                                                                | `dom-ready` injeta `NAV_INJECT` (botões laterais do mouse, 63-72) e, no modo celular, `NO_HOVER_INJECT` + emulação de toque                                                         | `executeJavaScript`, `getWebContentsId()`                                                                                                                  | `dom-ready` vira evento IPC; `executeJavaScript` vira `invoke('preview-view:exec', {id, code})`. **Melhor:** injetar no main, no próprio `dom-ready`, sem ida e volta                                                                                                                                                                                                                                                                                                                      |
| P8  | 652–665                                                                | Ponte do **"selecionar elemento"** (grab): o script injetado manda o pacote pelo console                                                                                            | evento `console-message` com sentinela `GRAB_SENTINEL`/`GRAB_CANCEL`                                                                                       | `wc.on('console-message')` no main, que repassa **só** as mensagens que começam com as sentinelas (não inunda o IPC com todo o console do site)                                                                                                                                                                                                                                                                                                                                            |
| P9  | 666–670, 1283–1293, 1537–1560                                          | navegar (`src`), rede de recuperação "aba em branco"                                                                                                                                | `w.src = url`, `getURL()`, `getAttribute('src')`                                                                                                           | `wc.loadURL(url)`, `wc.getURL()`. A rede de recuperação (falha de timing de attach no build) **some**: o WCV não depende de attach no DOM                                                                                                                                                                                                                                                                                                                                                  |
| P10 | 677–692, 1603–1628                                                     | fechar aba, servidor caiu (`removeAllTabs`)                                                                                                                                         | `t.webview.remove()`                                                                                                                                       | `previewView.destroy(id)` → `removeChildView` + `wc.close()` (o WCV **não** destrói a WebContents sozinho)                                                                                                                                                                                                                                                                                                                                                                                 |
| P11 | 694–713                                                                | borda de foco "o foco está dentro do site"                                                                                                                                          | IPC `webview:focus` vindo do main (`contents.on('focus'/'blur')`, main.js 575-579)                                                                         | mesmo evento no `wc` da view. O desenho da borda muda (ver R1)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P12 | 716–736                                                                | voltar/avançar (barra e botões laterais via `nav:back`/`nav:forward`, main.js 383)                                                                                                  | `goBack()`, `goForward()`                                                                                                                                  | `wc.navigationHistory.goBack()/goForward()`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P13 | 738–811                                                                | **seletor de elemento** liga/desliga, Esc, sai ao trocar de aba                                                                                                                     | `executeJavaScript(INJECT/CLEANUP)` em 1 ou em todos                                                                                                       | `exec` por IPC. Comportamento igual                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P14 | 813–860 + `FindBar.jsx:15-72`                                          | **Ctrl+F**: busca na página                                                                                                                                                         | `findInPage`, `stopFindInPage('clearSelection')`, evento `found-in-page`; Ctrl+F com o foco no site vem do main (`preview:find`, main.js 540-551)          | mesmas chamadas no `wc` por IPC; `found-in-page` repassado. **A FindBar hoje fica POR CIMA do site** (`absolute right-3 top-3 z-30`), ver R1                                                                                                                                                                                                                                                                                                                                               |
| P15 | 862–882 + main.js 2406-2422                                            | **print** (tela toda/recorte) → anotador                                                                                                                                            | `getWebContentsId()` → `preview:capture` → `wc.capturePage(rect)`                                                                                          | igual: o main já trabalha com `webContents.fromId`. Muda só de onde vem o id                                                                                                                                                                                                                                                                                                                                                                                                               |
| P16 | 884–896 + `AnnotatorModal.jsx:282`                                     | esconde a camada dos webviews enquanto o **anotador** está aberto                                                                                                                   | `containerRef.style.visibility='hidden'`                                                                                                                   | `previewView.setVisible(id,false)` enquanto `shot` existe (é o padrão geral de oclusão, R1)                                                                                                                                                                                                                                                                                                                                                                                                |
| P17 | 900–942                                                                | atalhos do print (Ctrl+P / Ctrl+Shift+P); com foco no site vêm do main (`preview:screenshot`, main.js 553-560)                                                                      | idem                                                                                                                                                       | mesmo `before-input-event` no `wc` da view                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P18 | 944–957                                                                | borda laranja no modo print                                                                                                                                                         | `w.style.boxShadow`                                                                                                                                        | desenhar a borda no **container** (em volta da área da view), não no elemento                                                                                                                                                                                                                                                                                                                                                                                                              |
| P19 | 959–1034                                                               | **recorte do print**: overlay DOM captura o arraste; a rodinha é repassada pro site                                                                                                 | overlay `z-30` por cima + `getBoundingClientRect` do webview + `sendInputEvent(mouseWheel)`                                                                | o overlay DOM **não pode** ficar por cima da view. Proposta (R1.d): o recorte vira script **injetado na página** (mesmo padrão do grab). A rodinha rola o site nativamente, o que é melhor que o repasse atual. Sai da página o retângulo em coords locais → `capturePage(rect)` depois de remover o overlay                                                                                                                                                                               |
| P20 | 1063–1093 `showWebFor`                                                 | cria a aba raiz quando o servidor fica pronto; `try/rAF` por causa do timing de attach                                                                                              | —                                                                                                                                                          | mais simples: não há attach no DOM                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P21 | 1096–1120, 1193–1212, 1238–1241 + main.js 603-631                      | **F12 / DevTools encaixado** à direita: um 2º `<webview>` (about:blank) hospeda o DevTools                                                                                          | `setDevToolsWebContents(host)`, `openDevTools()`, `inspectElement(x,y)`, `closeDevTools()`; o host é `<webview>`                                           | o host vira um **2º WebContentsView**, com bounds no `devtoolsHostRef`. Criar um host **novo a cada abertura** (a doc pede um host que não navegou) e destruir no fechar. `inspectElement` igual                                                                                                                                                                                                                                                                                           |
| P22 | 1122–1144, 2321-2322                                                   | arrastar a borda do DevTools                                                                                                                                                        | overlay `fixed inset-0 z-50` pra o webview não "engolir" o mouse                                                                                           | ver R2.c (arraste por cima de view)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P23 | 1268–1296                                                              | mostra só a aba ativa do projeto ativo                                                                                                                                              | `style.display = flex/none`                                                                                                                                | `setVisible(true/false)`. Esconder dispara `visibilitychange=hidden` no site (igual ao `display:none` de hoje)                                                                                                                                                                                                                                                                                                                                                                             |
| P24 | 1298–1305, 1348–1360 + `webviewChrome.js:13-55` + `devices.js:155-190` | **modo dispositivo**: página no tamanho real do aparelho, encolhida com `transform: scale()`, centralizada, `clip-path` nos cantos                                                  | CSS no elemento (`width/height/left/top/transform/clipPath`), `ResizeObserver`                                                                             | não existe CSS numa view. Bounds = retângulo `fitDevice().page` (já em px do painel) e **`wc.enableDeviceEmulation({screenPosition:'mobile', screenSize, viewSize:{w,h do aparelho}, scale})`**, que é o mesmo mecanismo do device mode do Chrome. Cantos: `view.setBorderRadius(r*scale)`, existe no 33. A doc avisa que o canto recortado ainda recebe clique; é irrelevante aqui. `applyViewport` vira função **pura** que devolve `{bounds, emulation, radius}`, testável sem Electron |
| P25 | 1307–1346 + `pageChrome.js`                                            | lê a cor do topo/rodapé e o scroll do site a cada 600 ms (barras do celular)                                                                                                        | `executeJavaScript(PAGE_CHROME_SCRIPT)`                                                                                                                    | `exec` por IPC (ou o main faz o polling e só manda a mudança)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P26 | 1362–1384 + main.js 640-672                                            | **emulação de toque** + desarmar `:hover`                                                                                                                                           | `previewEmulateTouch(getWebContentsId())` → `wc.debugger` `Emulation.setTouchEmulationEnabled`; `executeJavaScript(NO_HOVER_*)`                            | igual (já é por id). **Oportunidade, a medir:** religar `setEmitTouchEventsForMouse` (toque de verdade), agora que o preview é outra árvore de WebContents. Se a medição do DESAFIOS (`GetCursorInfo`, mousemove no app) passar, o `noHoverScript` pode virar só um complemento                                                                                                                                                                                                            |
| P27 | 1386–1406                                                              | só a aba à mostra toca som                                                                                                                                                          | `setAudioMuted`                                                                                                                                            | `wc.setAudioMuted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P28 | 1641–1669 + main.js 586-600 + `electron/window-open.cjs`               | **popup → aba interna** (`target=_blank`, `window.open`, Ctrl+clique, blob PDF)                                                                                                     | `setWindowOpenHandler` no main, que só dispara por causa do `allowpopups`; o renderer acha o projeto dono comparando `getWebContentsId()` de todas as abas | o handler vai no `wc` da view (sem gate). O registro do main **já sabe** o projeto e a aba dona, então a busca por id no renderer some. `decideWindowOpen` fica igual. `scripts/popup-smoke.cjs` precisa ser reescrito pra montar a view                                                                                                                                                                                                                                                   |
| P29 | 1671–1717                                                              | recarregar, hard reload (Ctrl+F5, Ctrl+Shift+R), reload ao trocar de aparelho                                                                                                       | `reload()`, `reloadIgnoringCache()`; atalhos só com o foco **no app**                                                                                      | igual. **Melhoria:** tratar F5/Ctrl+R/Ctrl+Shift+R também no `before-input-event` da view. Hoje, com o foco dentro do site, F5 não faz nada no Windows (o app não tem menu)                                                                                                                                                                                                                                                                                                                |
| P30 | 1836, 2358-2359                                                        | **terminal do preview**: arrastar a borda; abrir e fechar muda a altura do painel                                                                                                   | overlay `fixed z-50` durante o arraste                                                                                                                     | bounds acompanham o `ResizeObserver` (R2); arraste em R2.c. `ShellView onOpenUrl={navigateTo}` (Ctrl+clique num link do terminal) não muda                                                                                                                                                                                                                                                                                                                                                 |
| P31 | 1944–2031                                                              | barra de ferramentas: DevicePicker, ShotPicker, MoreTools, PhoneShare (popovers Radix)                                                                                              | —                                                                                                                                                          | os menus abrem **pra baixo, por cima do site** → R1                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P32 | 2053–2080                                                              | tira de abas com `transition: height 200ms`                                                                                                                                         | —                                                                                                                                                          | a view tem que acompanhar a animação quadro a quadro (R2.a)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P33 | 2093–2110 + `ui/device-frame.jsx:1, 88-92`                             | **moldura do aparelho** desenhada por cima do webview (`pointer-events-none z-[5]`), com os cantos internos cobrindo as quinas do site; `DeviceSwitcher` e `PhoneShareCard` ao lado | DOM por cima                                                                                                                                               | barra de status, notch e Safari **já ficam fora** do retângulo da página (`fitDevice.page` desconta o `chrome`), então não sobrepõem. Os cantos passam a ser o `setBorderRadius`. A moldura não pode mais "invadir" 1 px da tela (o `+1px pra dentro` em device-frame.jsx), então a view recebe bounds encolhidos 1 px. A grade do `DeviceSwitcher` abre por cima → R1                                                                                                                     |
| P34 | 2111–2114                                                              | anel de foco `ring-inset` por cima do site                                                                                                                                          | DOM por cima                                                                                                                                               | R1.b                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P35 | 2115–2128, 2159–2172                                                   | toasts "Selecionar elemento ativo" / "Elemento copiado" / "Print copiado" (`top-3`, centro, por cima do site)                                                                       | DOM por cima                                                                                                                                               | R1.c                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P36 | 2193–2215                                                              | modal de conflito de porta (`absolute inset-0 z-40`)                                                                                                                                | DOM por cima                                                                                                                                               | R1.a (padrão de oclusão)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P37 | 2310–2319                                                              | painel do DevTools (w-0 quando fechado)                                                                                                                                             | div host do webview                                                                                                                                        | div vira só o "slot" medido pros bounds da view do DevTools                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P38 | 1418–1532, 1568–1582                                                   | **preview remoto/SSH**: túnel `ssh -L` → `http://127.0.0.1:<efêmera>` (`RemotePreviewStart.jsx:10`, main.js 1367, `electron/remote/tunnel.cjs:7`)                                   | só a URL                                                                                                                                                   | **nenhuma mudança** além dos comentários. A view navega pra mesma URL                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P39 | 457, 2030, 2108                                                        | **QR code / abrir no celular** (`useLanShare`, `PhoneShare.jsx`, `electron/lan-share.cjs`)                                                                                          | só a URL                                                                                                                                                   | nenhuma mudança. O `PhoneShareCard` fica **ao lado** do aparelho, fora da view                                                                                                                                                                                                                                                                                                                                                                                                             |

### 1.2 Processo main e preload

| #   | Onde                                                                                                 | O que faz                                                                                                                                                          | WCV                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | main.js 370                                                                                          | `webviewTag: true` na janela                                                                                                                                       | continua `true` **se** HtmlViewer e plugins ficarem no webview (§3)                                                                                                                                                                                                                                    |
| M2  | main.js 477-478                                                                                      | `web-contents-created` filtra `getType() === 'webview'` e dá "cara de navegador" a **todo** webview (context menu, F12, Ctrl+F, Ctrl+P, zoom, foco, toque, popups) | extrair para `attachBrowserChrome(contents, {owner})` num módulo (`electron/preview-views.cjs`) e chamar **explicitamente** pra cada view do preview. O webview do HtmlViewer e dos plugins segue recebendo o seu (hoje o F12 dentro do HtmlViewer abre o DevTools **do preview**; corrigir de quebra) |
| M3  | main.js 480-524                                                                                      | menu de contexto (voltar/avançar/recarregar/copiar/colar/abrir em nova aba/inspecionar)                                                                            | igual; `canGoBack` → `navigationHistory`. `params.x/y` já são locais à view → `inspectElement` continua certo                                                                                                                                                                                          |
| M4  | main.js 527-573                                                                                      | `before-input-event`: F12, Ctrl+Shift+I, Ctrl+F, Ctrl+P, Ctrl +/-/0 (zoom do site)                                                                                 | igual + F5/Ctrl+R (P29). **Atenção:** no WCV o zoom do Chromium é **por origem dentro da sessão** (HostZoomMap). Duas abas do mesmo host no mesmo projeto passam a dividir o zoom, como no Chrome. Medir; se incomodar, `wc.setZoomFactor` reaplicado no `did-navigate`                                |
| M5  | main.js 575-579                                                                                      | foco/blur → `webview:focus`                                                                                                                                        | igual (renomear canal pra `preview-view:focus`)                                                                                                                                                                                                                                                        |
| M6  | main.js 581-584, 640-672                                                                             | toque via `wc.debugger`, que solta quando o DevTools abre                                                                                                          | igual                                                                                                                                                                                                                                                                                                  |
| M7  | main.js 586-600                                                                                      | `setWindowOpenHandler` → `preview:new-tab` com `sourceId`                                                                                                          | igual, mas manda `{projectPath, tabId}` do registro                                                                                                                                                                                                                                                    |
| M8  | main.js 603-631                                                                                      | DevTools encaixado (`devtools:dock/undock`)                                                                                                                        | host vira WCV (P21)                                                                                                                                                                                                                                                                                    |
| M9  | main.js 383-385                                                                                      | `app-command` (botões laterais do mouse) na janela                                                                                                                 | igual (vem da janela). Medir se o WM_APPCOMMAND ainda chega com o foco na view                                                                                                                                                                                                                         |
| M10 | main.js 2406-2422                                                                                    | `preview:capture` → `capturePage(rect)`                                                                                                                            | igual. Medir o `rect` com `enableDeviceEmulation` (escala)                                                                                                                                                                                                                                             |
| M11 | main.js 87-90 (e o `disable-features` da branch reserva)                                             | switches do Chromium                                                                                                                                               | ver §7                                                                                                                                                                                                                                                                                                 |
| M12 | preload.js 300-306, 324-326                                                                          | `capturePreview`, `previewEmulateTouch`, `dockDevTools`, `undockDevTools` (todos por `webContentsId`)                                                              | entra `previewView.*` (create/destroy/setBounds/setVisible/exec/nav/find/zoom/on). Os por id continuam valendo                                                                                                                                                                                         |
| M13 | preload.js 30, 179; main.js 101, 1367, 4996; `electron/remote/tunnel.cjs:7`; `electron/platform.cjs` | comentários que citam "webview"                                                                                                                                    | atualizar o texto                                                                                                                                                                                                                                                                                      |
| M14 | **novo**: janela fechando ou **renderer recarregando**                                               | —                                                                                                                                                                  | views vivem no main: se o renderer recarregar (HMR do Vite em dev, crash, ErrorBoundary com reload), elas ficam **órfãs** por cima da tela. Destruir todas no `did-start-navigation`/`render-process-gone` da janela e no `closed`                                                                     |

### 1.3 Outros consumidores

| #   | Onde                                                                                                                       | O que é                                                                                                                             | WCV                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | `HtmlViewer.jsx` (1-110, 130-170) via `CodeView.jsx:90, 323`                                                               | visualizador de `.html` da aba Código: webview `file://`, dispositivo, zoom (`setZoomLevel`, `zoom-changed`), grab, toque           | **pode ficar no webview** (§3). Usa `applyViewport`/`stepZoom` de `webviewChrome.js`, que precisam continuar servindo os dois                                                                                                                     |
| O2  | `PluginChatView.jsx` (60-85) + `PluginViewLayer` (129+) + `ChatPanel.jsx:743-748, 1497, 1566` + `electron/plugin-host.cjs` | chat de plugin local (`claude-vscode`): webview com `preload` do plugin e `ipc-message` (`ipcRenderer.sendToHost('carcara:title')`) | `sendToHost`/`ipc-message` **só existem no `<webview>`**. Migrar quebra o contrato de `electron/plugins/README.md` e o repo do plugin. **Fica no webview** (§3)                                                                                   |
| O3  | `KanbanPanel.jsx:6-7, 207`                                                                                                 | só comentário: HTML5 DnD quebrado perto de `<webview>` → Kanban usa dnd-kit                                                         | nada muda. Com WCV os bugs #18226/#39371/#42252 (específicos do `<webview>`) deixam de valer pro Preview, mas a regra "só lib pointer-based" continua certa: arraste **por cima** da área da view cai no site, não no app. Atualizar o comentário |
| O4  | `App.jsx:135-140`                                                                                                          | recolher o Preview (painel `react-resizable-panels`)                                                                                | container com largura 0 → `setVisible(false)`                                                                                                                                                                                                     |
| O5  | `App.jsx:276-285, 1109-1120`                                                                                               | arrastar o painel do Claude / o rail: overlay `fixed inset-0 z-50` pra o webview não engolir o mousemove                            | R2.c                                                                                                                                                                                                                                              |
| O6  | `App.jsx:424-445, 449`                                                                                                     | Ctrl +/-/0 = zoom do **app** (`webFrame.setZoomFactor`); Ctrl+K paleta                                                              | o zoom do app muda a escala CSS→DIP: os bounds da view têm que multiplicar por `webFrame.getZoomFactor()` (R2.b). A paleta (Ctrl+K) abre por cima do preview → R1                                                                                 |
| O7  | `App.jsx:1122` `<Toaster />` (sonner)                                                                                      | toasts globais                                                                                                                      | se a posição cair sobre o preview → R1.c                                                                                                                                                                                                          |
| O8  | `src/lib/screenshot.js:5-42` (+ test)                                                                                      | converte o arraste em `rect` local do webview                                                                                       | continua servindo se o recorte ficar no app; se for pra dentro da página (P19), vira só um clamp                                                                                                                                                  |
| O9  | `src/lib/grabScript.js`, `noHoverScript.js`, `pageChrome.js`, `htmlPreview.js`                                             | scripts injetados e helpers                                                                                                         | sem mudança de lógica; comentários                                                                                                                                                                                                                |
| O10 | `scripts/popup-smoke.cjs` (`npm run test:popup`)                                                                           | sobe o Electron e monta o **mesmo** webview do app                                                                                  | reescrever pra montar a **mesma** view do app (o módulo do main exporta a fábrica)                                                                                                                                                                |
| O11 | `src/lib/webviewChrome.test.js`                                                                                            | testa o `applyViewport` com um dublê de elemento                                                                                    | ganha casos do novo `viewportGeometry()` puro                                                                                                                                                                                                     |

### 1.4 O que é o "gap"

Não existe nada chamado `gap` no código, além das classes `gap-*` do Tailwind. Busquei em
`src`, `main.js`, `preload.js`, `electron`, nos plugins, nos locales e no `git log`. A
hipótese mais forte é que seja o **"grab"** (transcrição de voz): o "pegar elemento" estilo
react-grab (`src/lib/grabScript.js`, `GRAB_SENTINEL`, `npm run test:grab`), que é o botão
de mira da barra. Ele já está coberto em P8/P13. Se o "gap" for outra coisa (o espaço cinza
em volta do aparelho, que o código chama de **"calha"**, `PreviewPanel.jsx:1018`,
`screenshot.js:27`), também está coberto em P24/P33: a calha é DOM do app atrás da view, sem
problema. **Confirmar com o Ygor.**

---

## 2. Riscos e respostas

### R1. A view desenha POR CIMA de todo o DOM

Com o `<webview>`, o DOM com `z-index` maior cobre o site. Isso funciona hoje (FindBar,
toasts, moldura, overlay do print, anel de foco), mesmo com o comentário do
AnnotatorModal dizendo o contrário. Com WCV, **nada** do DOM aparece por cima da área da view.

Estratégia em 4 camadas, da mais barata pra mais cara:

- **a. Oclusão central (freeze frame).** Um módulo único `previewOcclusion` no renderer conta
  quem pede pra cobrir o preview. Enquanto o contador for > 0, o main faz `capturePage()` da
  view ativa, o renderer mostra a imagem num `<img>` no mesmo retângulo e a view recebe
  `setVisible(false)`. Quando o contador volta a 0, a view reaparece. Quem pede:
  - hook `usePreviewOcclusion(open)` nos componentes Radix (Dialog, Popover, DropdownMenu, Select),
    plugado **uma vez** nos wrappers de `src/components/ui/`, não em cada uso;
  - AnnotatorModal, modal de porta, paleta Ctrl+K, grade do DeviceSwitcher, menus da barra.

  Só oculta se o retângulo do overlay **cruza** o da view (menus da barra de cima, que não
  descem sobre o site, não congelam nada). O site para enquanto o menu está aberto; isso já
  acontece hoje no anotador e é o que o Cursor e o Arc fazem.

- **b. Tirar de cima: o que é "cromo" vira faixa, não sobreposição.**
  - **FindBar** → faixa de 40 px no topo do painel, ou um _slot_ no canto que **encolhe os bounds**
    enquanto aberta. Alternativa melhor: colocá-la na própria barra de ferramentas (a da URL)
    enquanto aberta, sem mexer no layout do site.
  - **Anel de foco** → desenhado **em volta** da área da view (1–2 px de respiro fixo, sempre
    presente), sem encolher a view ao focar (encolher faria o site re-layoutar a cada clique).
  - **Borda laranja do modo print** → idem, no container.
- **c. Toasts** ("Elemento copiado", "Print copiado", "Seletor ativo"): sair de cima do site,
  indo pra barra de ferramentas (chip ao lado do botão) ou pro `<Toaster>` global, desde que a
  posição dele não caia sobre o preview. Congelar o site por 2 s a cada toast seria um
  retrocesso justamente no que queremos consertar.
- **d. Overlays que precisam do mouse em cima do site** (recorte do print): vão **pra dentro da
  página** por script injetado, o mesmo padrão do grab, que já funciona. A rodinha passa a
  rolar o site nativamente, inclusive contêineres internos, sem o `sendInputEvent` de hoje.

### R2. Sincronizar os bounds

- **a. Fonte única:** um `ResizeObserver` no `containerRef` (já existe em 1350), mais um
  `ResizeObserver`/`IntersectionObserver` no slot do DevTools. Cada mudança → `rAF` → **uma**
  chamada `previewView.setBounds(id, rect)` coalescida por quadro. O RO dispara a cada quadro
  durante a `transition` de 200 ms da tira de abas, então a view anima junto. Divisória do
  `react-resizable-panels`, rail, recolher/expandir, terminal e janela passam todos pelo RO.
- **b. Unidades:** `getBoundingClientRect()` está em px CSS da página do app. A view recebe
  **DIP da janela** = `rect × webFrame.getZoomFactor()` (zoom do app, O6). O DPI do monitor
  **não entra**: DIP já é independente de DPI, e o Electron reescala ao trocar de monitor. A
  origem é o canto da `contentView`, que com `titleBarOverlay` é o (0,0) do documento. Arredondar
  com `Math.round` em x/y e `Math.ceil` em w/h pra não sobrar fresta de 1 px.
- **c. Arraste passando por cima da view** (rail, painel do Claude, divisória do terminal, borda do
  DevTools, divisória chat|preview): os overlays `fixed inset-0 z-50` de hoje **não funcionam**
  sobre uma view. Hipótese **a medir na etapa 0**: no framework Views do Chromium, o arraste
  iniciado no app continua entregue ao app (_mouse capture_ do `mouse_pressed_handler`), então
  talvez nada precise mudar. Se não for assim, o fallback é congelar a view no início do
  arraste (R1.a) e soltar no fim.
- **d. Modo dispositivo:** bounds = `fitDevice().page` + emulação (P24). Trocar o aparelho chama
  `enableDeviceEmulation` de novo e recarrega (P29, como hoje).
- **e. Atraso de um quadro:** o DOM e a view são compostos separados. No arraste da divisória a
  view pode ficar 1 quadro atrás. `setBackgroundColor` da view = cor do painel, pra a fresta
  não piscar branco.

### R3. Foco e atalhos

- O clique na view foca a `webContents` dela; o clique no app foca o app. O Views faz isso
  sozinho. `focus`/`blur` da view continuam alimentando a borda (P11).
- **Com o foco na view:** F12, Ctrl+Shift+I, Ctrl+F, Ctrl+P, Ctrl+Shift+P, Ctrl +/-/0 e (novo)
  F5/Ctrl+R/Ctrl+Shift+R/Ctrl+F5 vêm do `before-input-event` do `wc` (M4). Mesmo esquema de hoje.
- **Com o foco no app:** os `window.addEventListener('keydown')` de hoje continuam (só mudam o
  alvo, que vira handle).
- Atalhos do app (Ctrl+K, Ctrl+B…) com o foco no site continuam **não** funcionando, igual
  hoje. Se quiser, entra na lista do `before-input-event` (decisão de produto, fora do escopo).
- Esc do grab/print com o foco no site: o script injetado trata (como hoje).
- Ao fechar a FindBar/modal: devolver o foco à view (`wc.focus()`) se ela tinha foco antes.

### R4. Várias abas e projetos sem vazar memória

- **Registro único no main** (`electron/preview-views.cjs`): `Map<viewId, {view, projectPath, tabId, kind:'tab'|'devtools'}>`.
  O renderer nunca segura o objeto; só o `id`.
- **Esconder** = `setVisible(false)` (a aba de fundo fica `hidden`, igual hoje).
  Alternativa: `removeChildView` das escondidas, pra o compositor nem considerá-las. Medir os dois.
- **Destruir** = `removeChildView(view)` + `view.webContents.close()` + apagar do registro +
  `touchEmuWant.delete`. Pontos de destruição: fechar aba, `preview:exit` (servidor caiu),
  remover projeto, janela `closed`, renderer recarregou (M14).
- **Teste de vazamento** (etapa 6): abrir e fechar 30 abas e trocar 10× de projeto;
  `webContents.getAllWebContents().length` tem que voltar ao valor inicial e o
  `app.getAppMetrics()` não pode acumular processos de renderer.
- **Ordem de empilhamento:** `addChildView` põe por cima. A view do DevTools e as do preview não se
  sobrepõem, então a ordem não importa. Se um dia houver uma view "overlay" (ex.: toasts num
  WCV transparente), ela tem que ser re-adicionada por último.

### R5. Win/Mac/Linux (regras do CLAUDE.md)

- A API `WebContentsView` é a mesma nos três SOs. **Nenhum `process.platform` novo** é esperado no
  módulo de views.
- Diferenças que existem vão pro `electron/platform.cjs`:
  - **Oclusão nativa** (`CalculateNativeWinOcclusion`) é só Windows. Já é a coluna
    `chromiumDisabledFeatures` da TABLE (na branch reserva). Ver §7.
  - **Mac:** `titleBarOverlay`/semáforo (`titleBarFor`) já define o recuo; a origem da
    `contentView` é a mesma do documento. Medir no Mac que a view não cobre o semáforo.
  - **Linux/Wayland:** views filhas sobre a janela funcionam no Electron 33. Medir arraste e foco
    no X11 e no Wayland antes de declarar suporte.
- O caminho Windows não pode regredir: a sonda de aceitação (§5) roda primeiro no Windows.

---

## 3. Decisão: migrar tudo ou só o preview?

| Opção                                                                                       | Prós                                                                                                                                                                                                                                                                       | Contras                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Só o Preview do projeto** (abas + DevTools). HtmlViewer e plugins ficam no `<webview>` | Ataca exatamente o bug (o Preview é onde roda o site com GSAP do usuário). O contrato dos plugins (`sendToHost`/`ipc-message`, preload por atributo) não muda e o repo do plugin não é tocado. Diff menor e revisável. O HtmlViewer é read-only, curto e raramente animado | Dois mecanismos convivendo: `webviewTag: true` continua e o `web-contents-created` precisa atender os dois (M2). `webviewChrome.js` serve os dois (vira 1 função pura de geometria + 2 "aplicadores")                                                                                         |
| **B. Tudo** (Preview + HtmlViewer + plugins)                                                | Um mecanismo só; dá pra desligar `webviewTag` (superfície de ataque menor)                                                                                                                                                                                                 | Quebra o contrato de plugin (tem que virar `ipcRenderer.send` com preload próprio + roteamento no main) e exige mudar o repo do plugin junto. O PluginViewLayer já resolve o "recarrega ao mover" do webview, então o ganho ali é zero. O HtmlViewer ganha pouco. Mais risco na mesma release |
| **C. Preview + HtmlViewer**, plugins no webview                                             | O HtmlViewer reusa a mesma infra e o `webviewChrome` deixa de ter dois aplicadores                                                                                                                                                                                         | O HtmlViewer mora dentro do CodeView (abas de arquivo, modais do editor por cima) e traria todos os problemas de oclusão R1 pra aba Código, sem bug nenhum pra corrigir lá                                                                                                                    |

**Recomendação: A.** Critério técnico: migrar só onde há bug medido. Critério de DRY: a lógica
compartilhada (geometria do aparelho, `stepZoom`, scripts injetados, `decideWindowOpen`,
`attachBrowserChrome`) fica **uma** só, com dois "aplicadores" finos (CSS no elemento, bounds +
emulação na view). Revisitar o HtmlViewer só se aparecer bug de visibilidade nele.

Também recomendo um **interruptor de motor** durante a 0.1.19: `previewEngine: 'view' | 'webview'`
no `config.json` (sem UI, ou escondido em Configurações › Avançado), com `view` como padrão
só depois da aceitação. Prós: rollback sem release nova se algo escapar no uso real.
Contras: dois caminhos no PreviewPanel por uma versão. O handle (§4.1) limita isso a uma
fábrica. Remover o caminho `webview` do Preview na 0.1.20.

---

## 4. Plano em etapas pequenas e testáveis

> Cada etapa termina com `npm test` verde, `npm run build`, e a prova indicada. Commits
> pequenos, um por etapa, com `git add` **nomeando os arquivos** (há sessões paralelas: ver
> DESAFIOS). Modelo sugerido: Opus nas etapas 0, 2, 4 e 7 (medição e decisões de
> arquitetura); Sonnet nas demais (plano claro).

### 4.1 Arquitetura alvo (resumo)

- **main:** `electron/preview-views.cjs`, com o registro (R4), a fábrica `createPreviewView({projectPath, tabId, partition, url})`,
  `attachBrowserChrome(wc, owner)` (o miolo de hoje do `web-contents-created`, compartilhado com os
  webviews), repasse de eventos (`did-navigate`, `page-title-updated`, `found-in-page`,
  `console-message` com sentinela, `focus/blur`…) num canal só `preview-view:event`, e os
  `ipcMain.handle` de comando. Partes puras (decidir bounds, emulação, filtro de sentinela) são
  exportadas e testadas em vitest.
- **preload:** `window.api.previewView = { create, destroy, setBounds, setVisible, exec, nav, find, stopFind, zoom, mute, capture, on }`.
- **renderer:** `src/lib/previewHandle.js` cria um objeto com **a mesma forma** do pedaço do
  `<webview>` que o PreviewPanel usa (`addEventListener`, `executeJavaScript`, `getWebContentsId`,
  `canGoBack`, `goBack`, `reload`, `findInPage`, `setAudioMuted`, `getURL`, `loadURL`) por cima do
  IPC. Assim o PreviewPanel e a FindBar mudam quase só em `tab.webview` → `tab.view`, e o diff
  fica revisável. A geometria (`viewportGeometry`) e a oclusão (`previewOcclusion`) são módulos
  próprios.

### Etapa 0: espiões e harness (sem tocar no app)

1. Trazer a sonda pro repo: `scripts/preview-raf-probe.cjs` (a partir de `digo-probe4.cjs` +
   `moving.js` + `capture.ps1`, que hoje moram num **scratchpad temporário** de outra sessão e
   podem sumir:
   `C:\Users\ygotg_f\AppData\Local\Temp\claude\8747fb90458d4b1a\9cc3784e-c699-451b-b85c-80bf823cfaca\scratchpad\smoke\`).
   Mudança necessária: o alvo CDP da view é `type === 'page'` (não `'webview'`), então casar
   **por URL**. Porta do site por argumento (o Digo em 8081 hoje).
2. Harness mínimo (`scripts/wcv-spike.cjs`, Electron puro, janela + 1 WCV com o Digo) pra medir
   **antes** de mexer no app:
   - rAF/animações depois de minimizar/restaurar/encobrir, **com e sem** o `disable-features`;
   - arraste começando no app e passando por cima da view (R2.c);
   - `enableDeviceEmulation` + `capturePage(rect)` (P24/M10);
   - `setEmitTouchEventsForMouse` na view: o documento do app ainda recebe `mousemove`? Cursor
     (`GetCursorInfo`) na moldura do app? (P26);
   - `getType()` da view (`'browserView'` pelo d.ts), WM_APPCOMMAND com foco na view, zoom por origem.

   **Prova:** relatório em `docs/plano-webcontentsview.md` §8 (anexar números). **Portão:** se o
   harness mostrar rAF parado com WCV após minimizar/restaurar, **parar a migração** e reavaliar.

### Etapa 1: módulo do main + preload, sem uso

`electron/preview-views.cjs` + testes vitest das partes puras + `previewView` no preload.
Extrair `attachBrowserChrome` do `web-contents-created` (M2) **sem mudar comportamento**: o
webview continua chamando ela.
**Prova:** `npm test`, `npm run test:popup` (ainda com webview) verdes; app abre e o preview
de hoje funciona igual (smoke manual de 2 min: abrir projeto, F12, Ctrl+F, print).

### Etapa 2: uma aba, desktop, atrás do interruptor

`previewHandle.js` + caminho `previewEngine: 'view'` no `createTab`/`removeAllTabs`/`showWebFor`:
navegar, barra de URL, voltar/avançar, recarregar, título/favicon, re-tentativa, bounds pelo RO,
`setVisible` ao trocar de projeto ou aba Código, destruição em todos os pontos de R4 + M14.
**Prova:** sonda CDP da §5 passos 1–3 (carga, minimizar/restaurar, trocar de projeto) com o
motor `view`: rAF ≈ 60/s e `mexendo` na tela = valor do Chrome. Com motor `webview`: comportamento
de hoje (controle).

### Etapa 3: oclusão (R1) e foco (R3)

`previewOcclusion` + hook nos wrappers `ui/` (Dialog/Popover/DropdownMenu/Select), FindBar na
barra, anel de foco/borda do print no container, toasts fora de cima, F5/Ctrl+R no main.
**Prova:** checklist visual (print pelo CDP de cada um aberto): DevicePicker, ShotPicker,
MoreTools, PhoneShare, DeviceSwitcher, paleta Ctrl+K, Configurações, modal de porta, anotador,
FindBar. Nada some atrás do site, e o site volta a animar ao fechar (sonda passo 4).

### Etapa 4: abas múltiplas, popups e DevTools

Popups → aba interna pelo registro (sem busca por id), `popup-smoke` reescrito pra view; DevTools
em WCV host novo por abertura, inspecionar elemento pelo menu de contexto, re-encaixe ao trocar
aba/projeto, redimensionar.
**Prova:** `npm run test:popup` (3 casos: `window.open(http)`, `window.open(blob:)`, `target=_blank`)
verde **com a view**; PDF de `blob:` renderiza; F12 abre/fecha e `inspectElement` cai no elemento
certo; sonda passo 5 (trocar de aba) ok.

### Etapa 5: modo dispositivo, toque, grab, print, busca

`viewportGeometry()` pura (testada) + `enableDeviceEmulation` + `setBorderRadius`; moldura sem
invadir; polling do `pageChrome`; emulação de toque (e, se a etapa 0 aprovar, religar
`setEmitTouchEventsForMouse`); grab via sentinela do main; recorte do print injetado na página;
FindBar via IPC.
**Prova:** `window.innerWidth` no site = largura do aparelho em 3 aparelhos + Personalizado;
`matchMedia('(hover:none)').matches === true` no celular e `false` no desktop; `npm run test:grab`;
print de tela toda e recorte batem com o que se vê (tamanho em px conferido); Ctrl+F conta os
resultados certos; troca de aparelho não vaza `:hover`.

### Etapa 6: bordas e limpeza

Arraste (R2.c) conforme a etapa 0; zoom do app (Ctrl +/−) com o preview aberto; recolher o
Preview; terminal abrir/fechar/arrastar; projeto remoto (túnel) e QR; mute; teste de vazamento
(R4); HMR do renderer em dev (M14) sem view órfã. Atualizar comentários (M13, O3) e o
DESAFIOS.md.
**Prova:** checklist manual + contagem de `getAllWebContents()` antes/depois.

### Etapa 7: aceitação, padrão `view` e release

Sonda completa (§5) no `npm start` **e** no app empacotado (`npm run build` + instalador);
decidir o `disable-features` (§7); `previewEngine` padrão = `view`; CHANGELOG 0.1.19; site
(carcaracode.net) se o pitch mencionar o preview.
**Prova:** tabela da §5 preenchida, com números, para os dois motores.

---

## 5. Teste de aceitação: sonda CDP (Digo Festival)

Site: `C:\Users\ygotg_f\OneDrive\Documentos\github\digofestival`. **Um único** `astro dev`
rodando (conferir `netstat -ano | findstr LISTENING` antes; em 16/11 havia dois, em 8081 e 8084).
Nenhuma outra sessão editando o Digo durante a medição (o HMR recarregava o preview no meio).
Perfil isolado (`--user-data-dir` no scratchpad, `projects` = lista de **caminhos**), janela
não minimizada por fora, todo `Runtime.evaluate` com `awaitPromise` dentro de `Promise.race` de 6 s.

Medidas em cada passo, no alvo do site: rAF por segundo (contador de 2 s), `moving.js` (elementos
que mudam transform/opacity em 1,5 s, total e **na tela**) e `document.visibilityState`.

| Passo | Ação                                                                                | Esperado (WCV)                                                          |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | carga do zero, janela na frente                                                     | rAF ≥ 55/s, `visible`, mexendo na tela = Chrome                         |
| 2     | `ShowWindow(h, 6)` (minimizar) 5 s → `ShowWindow(h, 9)` (restaurar), medir após 1 s | idem ao passo 1 (hoje cai pra 1–4 mexendo ou 0 rAF)                     |
| 3     | encobrir com outra janela 5 s → trazer pra frente                                   | idem                                                                    |
| 4     | abrir um modal (Configurações) 3 s → fechar                                         | durante: `hidden` (congelado, esperado); depois de 1 s: idem ao passo 1 |
| 5     | abrir uma 2ª aba (link `target=_blank`), voltar à 1ª                                | 1ª volta ao passo 1                                                     |
| 6     | trocar pra outro projeto e voltar                                                   | idem                                                                    |
| 7     | repetir 2 com o DevTools aberto e com o modo celular                                | idem                                                                    |
| 8     | repetir 2 dez vezes seguidas                                                        | nenhuma rodada abaixo do passo 1                                        |

Rodar a matriz **{motor `webview`, motor `view`} × {com, sem `disable-features=CalculateNativeWinOcclusion`}**.
Critério de "ficou melhor": motor `view` passa todos os passos **sem** o flag (ou com o flag, se
for o caso de §7) e o motor `webview` reproduz a falha (prova de que a sonda mede o bug certo).

---

## 6. Sobre os recursos que "não mudam"

QR/celular, preview remoto (túnel), terminal, log do servidor, scaffold, auto-start, portas: só
dependem da **URL**, não do elemento. Ficam como estão. O teste é o mesmo checklist da etapa 6.

## 7. O remendo `CalculateNativeWinOcclusion` (5ee5d7b + b956f56) ainda é necessário?

**Hoje ele não está na `main`**: a `main` foi resetada para `origin/main` às 11:42 de 16/11, e os
dois commits estão só em `reserva/remendo-oclusao-windows`.

Expectativa técnica: **não será necessário**. A oclusão nativa do Windows é o mesmo mecanismo
que o Chrome usa pras abas (WebContents de primeiro nível). O defeito está na propagação de
visibilidade do _guest_ do `<webview>` através do embedder, e o próprio DESAFIOS mostrou que o
flag não bastava. Desligá-lo tem custo: a janela encoberta deixa de economizar CPU/GPU, e o
Chromium do app inteiro (chat, terminal) segue pintando escondido.

Decisão **por medição**, na etapa 7 (matriz da §5):

- `view` sem o flag passa → **não mergear** a branch reserva; manter só como referência (ou
  apagar depois da 0.1.19).
- `view` só passa com o flag → cherry-pick dos dois commits (já trazem a coluna na TABLE e o
  smoke de plataforma) e registrar no DESAFIOS o porquê.

## 8. Resultados da etapa 0

### 17/11/2026: harness isolado, rAF depois de minimizar/encobrir. **PORTÃO NÃO PASSOU**

Ferramentas (no repo agora): `scripts/preview-raf-probe.cjs` (sonda) + `scripts/preview-probe/`
(`spike-main.cjs` = Electron puro com 1 `WebContentsView` **ou** 1 `<webview>` de controle,
`moving.js`, `win.ps1` com min/restore/cover, `capture.ps1`). Rodar:
`node scripts/preview-raf-probe.cjs --engine=view|webview [--no-occlusion] [--diag]`.
Electron 33.4.11, Windows 11, monitor de 240 Hz (rAF "normal" = 241/s). Digo em
`astro dev --port 8081` (único). Cada rodada: minimizar 5 s → restaurar → medir após 1 s;
encobrir com janela opaca sempre-no-topo 5 s → medir após 1 s. A coluna `win` confere que a
janela estava mesmo restaurada (`iconic=False`).

| Motor   | `disable-features=CalculateNativeWinOcclusion` | Execução                    | Carga            | Depois de min/restore                                        | Depois de encobrir      |
| ------- | ---------------------------------------------- | --------------------------- | ---------------- | ------------------------------------------------------------ | ----------------------- |
| view    | não                                            | 17/11 #1 (sem coluna `win`) | 241 rAF, visible | **0 rAF, hidden** (3/3)                                      | **0 rAF, hidden** (2/2) |
| view    | não                                            | 17/11 #2                    | 241, visible     | **0 rAF, hidden (3/3, com `iconic=False foreground=True`)**  | **0, hidden** (2/2)     |
| view    | não                                            | 17/11 #3                    | 241, visible     | 241, visible (3/3)                                           | 241, visible (2/2)      |
| view    | sim                                            | 17/11 #1                    | 241, visible     | 241 visible (2/2 válidas; #2 inválida: janela não restaurou) | 241, visible (2/2)      |
| webview | não                                            | 17/11 #1                    | 241, visible     | 241, visible (3/3)                                           | 241, visible (2/2)      |
| webview | sim                                            | 17/11 #1                    | 241, visible     | 241, visible (3/3)                                           | 241, visible (2/2)      |

Leitura:

- **O `WebContentsView` também congela** (`visibilityState = 'hidden'` + 0 rAF com a janela
  restaurada e na frente), de forma intermitente, com a oclusão nativa ligada (2 de 3 execuções).
  A hipótese da §0 ("a view herda a visibilidade da janela, então não congela") **não se confirmou**.
- Com o flag, 1 execução limpa só. Amostra pequena: não dá pra concluir que o flag resolve.
- O `<webview>` de controle **não** congelou no harness (2 execuções). O harness ainda não
  reproduz o bug do app com o webview, então ele não serve pra comparar os motores sem mais rodadas.
- `getType()` da view no Electron 33 é **`'window'`**, não `'browserView'` como o d.ts sugere.
  O alvo CDP é `type: 'page'`.

### Achado à parte: o Digo tem um bug PRÓPRIO que mata as animações

Com o rAF a 241/s, o hero e os "revelar" não animavam (`mexendo=0`). `--diag` mostrou que o
`motion.ts` lança na carga, com a janela ≥ 900 px:

```
InvalidCharacterError: Failed to execute 'setAttribute' on 'Element': 'scaleX,scaleY' is not a valid attribute name.
  at arco (motion.ts) ← edicoes(mm) ← início do motion.ts
```

`gsap.quickSetter(e, 'scale')` (em `edicoes()`, desde o commit c3c96bb de 15/11) cai no setter de
**atributo**, porque `scale` é um apelido composto (`scaleX,scaleY`). Como `edicoes(mm)` roda
**antes** de `hero()`, `revelar()` e `pausarForaDaTela()`, a exceção aborta o resto: nada de entrada
anima, e os textos que dependem do GSAP ficam no estado inicial. Isso explica boa parte do
"textos invisíveis" do print do usuário em 17/11, **independente do motor**. Correção no site:
dois setters (`'scaleX'` e `'scaleY'`) ou `gsap.set(e, { scale })`.
Consequência para as medições: a coluna `mexendo` (moving.js) não serve de critério enquanto o
site lançar essa exceção. O critério confiável é **rAF/s + `visibilityState`**.

### 17/11/2026 (tarde): Digo corrigido, matriz interrompida a pedido

O Digo foi corrigido no repo dele (`motion.ts`: `quickSetter` em `scaleX` e `scaleY`, não
commitado). `--diag` confirmou: sem exceção, e o hero completa a entrada com a view visível.
Numa execução de diagnóstico a view **nasceu `hidden`, com 0 rAF, já na carga** (sem minimizar),
com a oclusão nativa ligada e a janela `iconic=False` — defeito do motor, não do site.

Matriz de 5 execuções por célula **interrompida pelo Ygor** ("vamos fazer isso depois com mais
calma"). O parcial abaixo, depois da correção, saiu de `node scripts/preview-probe/summarize.cjs <pasta>`.
Cada fração é medidas congeladas / medidas feitas:

| Motor   | Flag (sem oclusão nativa) | Execuções com congelamento | Carga | Depois de min/restore | Depois de encobrir | Medidas inválidas |
| ------- | ------------------------- | -------------------------- | ----- | --------------------- | ------------------ | ----------------- |
| view    | não                       | 1/2                        | 1/4   | 1/6                   | 2/4                | 0                 |
| view    | sim                       | 0/1                        | 0/2   | 0/3                   | 0/2                | 0                 |
| webview | não                       | 0/1                        | 0/2   | 0/3                   | 0/2                | 0                 |
| webview | sim                       | 0/1                        | 0/2   | 0/3                   | 0/1                | 1                 |

Para retomar: rodar a mesma matriz (laço de 5 × 4 células com `--min-rounds=3 --cover-rounds=2
--json=<pasta>/<célula>-<n>.json`) e resumir com o `summarize.cjs`. A questão em aberto é se a view
**sem** o flag congela com frequência relevante e se o webview reproduz o congelamento. Se a view
congelar tanto quanto o webview, a migração deixa de ser a cura e vira só melhoria de base: o
remendo `disable-features` da branch reserva resolve com menos trabalho.

### Próximo passo (decisão do Ygor)

Ver o bloco PENDENTE da sessão de 17/11: corrigir o Digo primeiro e repetir a matriz com
≥ 5 execuções por célula antes de decidir entre seguir com a view (com o flag), voltar ao remendo da
branch reserva ou investigar a oclusão nativa a fundo.

## 9. Implementação (18/11/2026) — em andamento

Decisão do Ygor (18/11): **implementar a migração inteira na 0.1.19, sem esperar a matriz.**
Base: worktree `../carcara-code-wcv` na branch `feat/webcontentsview`, com `hotfix/recriar-preview`
(0.1.19 ainda não publicada: flag `CalculateNativeWinOcclusion` + recriar no F5) e a `main`
(link do terminal → aba) mergeadas. Opção A (§3): só o Preview; HtmlViewer e plugins seguem no `<webview>`.
A medição de 17/11 mostrou a view só sem congelar **com** o flag → o flag fica (§7).

Sonda de 18/11 (`enableDeviceEmulation` numa view 195×400 com `scale: 0.5`, Electron 33):
`innerWidth` 390 / `screen.width` 390 no site; `capturePage(rect)` usa coords **DIP da view**;
`setVisible(false)` → `visibilityState: hidden`; `setBorderRadius` existe; `getType()` = `'window'`.

Peças (todas com teste vitest):

- `electron/preview-views.cjs` — registro no main, IPC `preview-view:*`, eventos num canal só,
  console só com prefixo `__CARCARA_`, lista fechada de métodos. Criação **síncrona** (`sendSync`),
  pro id existir na hora como no `getWebContentsId()`.
- `main.js` — `attachBrowserChrome(wc)` extraído do `web-contents-created` (vale pros dois motores);
  views destruídas quando a página do app navega/cai/fecha (M14).
- `src/lib/previewSurface.js` — superfície com a forma do `<webview>` + `show/layout/destroy`; motores
  `view` (padrão) e `webview` (reserva via `"previewEngine": "webview"` no config.json).
- `src/lib/webviewChrome.js#viewGeometry` — bounds + emulação + raio (mesma conta do applyViewport).
- `src/lib/previewOcclusion.js` — detecção por `elementFromPoint` em grade; coberto → foto + view escondida.
- `src/lib/cropScript.js` — recorte do print DENTRO da página (os dois motores).

Mudanças de UI que a view força (R1): FindBar vai pra dentro da barra de URL; anel de foco vira
borda na barra de URL; chips "elemento/print copiado" viram toast; toasts vão pro lado oposto ao preview.

**Estado em 18/11, fim do dia: implementado e provado no app real.**

- `npm run test:previewview` (scripts/preview-view-smoke.cjs) — 38 checagens, todas ok no motor
  `view`: carga anima (241 rAF/s); zoom do app 125%; F5 recarrega a mesma view; camada do app e
  menu por cima → foto, e volta animando; Ctrl+F na barra (site segue visível); recorte do print
  na página → anotador; `target=_blank` vira aba sem janela nativa; fechar aba fecha a
  webContents; DevTools em host novo, destruído ao fechar; **minimizar/restaurar 3/3 animando**;
  recarregar o app não deixa view órfã; modo celular 393 px + `(hover: none)` animando.
  Motor `webview` (reserva) também passa o roteiro dele.
- `npm run test:popup` cobre os dois motores (http, `target=_blank`, `blob:` PDF renderizado).
- O flag `CalculateNativeWinOcclusion` (branch reserva) foi trazido por cherry-pick: sem ele a
  view nascia `hidden` com 0 rAF no app (§7 confirmado).
- Fica pra 0.1.20: remover o motor `webview` do Preview; medir `setEmitTouchEventsForMouse`
  na view (toque de verdade, §0); testar Mac/Linux (R5).
