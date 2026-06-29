# Visualizador de HTML inline

**Data:** 2026-06-29
**Status:** Aprovado para planejamento

## Problema

Ao abrir um arquivo `.html` no Carcará Code, ele só aparece como código no editor
(CodeMirror). Não há como ver a página renderizada sem sair pro navegador. O usuário
quer um botão de "visualizar" — exatamente como já existe pro Markdown — que troca a
área do editor pela renderização da página, dentro do próprio app.

## Objetivo

Um botão de olhinho 👁 na barra de abas que, com um `.html` aberto, alterna entre
**Código** (editor) e **Visualização** (página renderizada), espelhando o padrão do
Markdown. A renderização deve ser fiel "igual abrir no navegador" — com CSS, JS e
imagens relativos da pasta funcionando — e deve funcionar **sem Chrome instalado**,
usando o Chromium já embutido no app.

## Decisões de desenho

- **Renderização via `<webview src="file://…">`**, não `<iframe srcdoc>`.
  - `webviewTag` já está ligado ([main.js](../../../main.js) `webPreferences`) e o
    PreviewPanel já usa `<webview>` — segue o padrão existente.
  - Apontar o `src` pro arquivo no disco (`file://`) faz os caminhos relativos
    (`./style.css`, `./app.js`, `./img/foo.png`) resolverem sozinhos, igual ao
    navegador. Renderizar conteúdo em memória via `srcdoc` quebraria esses caminhos.
  - `<webview>` é um processo convidado isolado, então carrega `file://` tanto em dev
    (host `http://localhost` do Vite) quanto em produção (host `file://` do `dist/`).
    Um `<iframe src="file://">` seria bloqueado pelo Chromium quando o host é `http`.
  - É o Chromium embutido do Electron que renderiza — nenhum navegador externo é
    necessário.

- **Padrão de abertura = Código.** Diferente do Markdown (que abre renderizado), o HTML
  abre como código (você normalmente edita HTML), e o olhinho leva pra visualização.
  Espelha o mecanismo do Markdown, só invertendo o padrão.

- **Salvar antes de visualizar.** O `webview` lê o arquivo do disco. Ao clicar no
  olhinho, se a aba estiver suja (`dirty`) e sem `notice`, salva primeiro
  (`window.api.writeFile`) e então mostra o preview — garante que a visualização
  reflete exatamente o que foi editado.

- **Estado por aba.** Um `Set` de paths em modo preview (igual ao `mdEdit`), pra que
  alternar entre abas preserve quem está em visualização.

- **Escopo:** read-only viewer. Sem partition, sem "grab"/seletor de elemento, sem
  DevTools — nada da maquinaria do PreviewPanel. Só visualizar.

## Componentes

### `isHtml(name)` — [src/components/CodeView.jsx](../../../src/components/CodeView.jsx)
Helper espelhando `isMarkdown`. Extensões: `html`, `htm`, `xhtml`.

### Estado `htmlPreview` / `toggleHtmlPreview` — CodeView
Espelha `mdEdit` / `toggleMdEdit`, mas como "set de quem está em PREVIEW" (padrão é
código). `toggleHtmlPreview` é assíncrono: ao **entrar** em preview, salva a aba se
estiver suja antes de marcar o path como preview.

```
const [htmlPreview, setHtmlPreview] = useState(() => new Set());
const htmlShown = activeTab && isHtml(activeTab.name) && htmlPreview.has(activeTab.path);
```

### Botão na barra de abas — CodeView (~linha 784, ao lado do botão do Markdown)
Visível quando `activeTab` é HTML e não é notice/image/pdf/xlsx. Em código mostra
`👁 Visualizar`; em preview mostra `‹› Código`. Mesmo visual do botão do Markdown
(ícones `Eye` / `Code2`, já importados).

### Área de preview — CodeView (~linha 800, junto dos outros viewers)
Novo ramo no render: quando `htmlShown`, renderiza `<HtmlViewer path={activeTab.path} />`
em vez do CodeMirror. Ordem dos ramos preserva a precedência atual (image/pdf/xlsx/
notice/mdPreview vêm antes).

### `HtmlViewer` — componente novo (lazy, como `XlsxViewer`)
Monta um `<webview>` ocupando a área, com `src` = file URL do path. Como `<webview>`
não é um elemento React nativo bem comportado, criar via `useRef` + `document
.createElement('webview')` e anexar (mesmo approach do PreviewPanel), ou via JSX
`<webview>` simples se bastar. Recarrega quando o `path` muda.

Conversão path → file URL: helper local que normaliza barras (`\` → `/`), adiciona
prefixo `file:///` e faz `encodeURI` no caminho (espaços → `%20` etc). Caminho Windows
`C:\Users\x\a b.html` → `file:///C:/Users/x/a%20b.html`.

### i18n — [pt.json](../../../src/lib/locales/pt.json) / [en.json](../../../src/lib/locales/en.json)
Novas chaves no grupo `code`, espelhando as do Markdown:
- `code.html_button_preview` = "Visualizar" / "Preview"
- `code.html_button_edit` = "Código" / "Code"
- `code.html_toggle_preview` / `code.html_toggle_edit` (tooltips)

## Fluxo

1. Usuário abre `arquivo.html` → aba abre no editor (CodeMirror) + botão **👁 Visualizar**.
2. Clica no olhinho → se houver edição não salva, salva; o path entra em `htmlPreview`;
   a área vira `<HtmlViewer>` renderizando a página; botão vira **‹› Código**.
3. Clica de novo → path sai de `htmlPreview`; volta o editor.
4. Alternar de aba e voltar preserva o modo (preview/código) de cada `.html`.

## Erros / casos de borda

- **Arquivo com erro de leitura / binário:** já cai no ramo `notice` antes do preview;
  o botão de olhinho fica oculto nesses casos (mesma condição do botão do Markdown).
- **Salvar falha ao entrar em preview:** se `writeFile` retornar erro, não entra em
  preview (mantém o editor com o conteúdo sujo); sem regressão silenciosa.
- **Recursos externos que dependem de servidor (fetch/CORS, módulos ES por http):**
  ficam fora do escopo — pra projetos web "de verdade" o PreviewPanel (servidor de dev)
  já existe. Este viewer é pra abrir e ver um `.html` estático, como abrir no navegador.

## Fora de escopo (YAGNI)

- Abrir no navegador externo (Chrome) — não pedido; o app renderiza tudo embutido.
- Live reload / hot reload do preview.
- Seletor de elemento, DevTools, zoom — são do PreviewPanel.
- Renderizar conteúdo não salvo em memória (decidiu-se salvar antes).
