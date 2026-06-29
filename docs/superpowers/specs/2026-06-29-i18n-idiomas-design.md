# Sistema de idiomas (PT-BR / Inglês) — Design

**Data:** 2026-06-29
**Status:** Aprovado para planejamento

## Problema

A interface do Carcará Code está hoje em "portunhol" — texto em português misturado com termos
em inglês escritos direto no JSX (ex.: um menu de contexto da árvore de arquivos todo em inglês:
"Reveal in File Explorer", "Cut", "Copy", "Copy Path", "Rename", "Delete"). Não existe nenhum
sistema de internacionalização: cada string está hardcoded espalhada por ~25 componentes.

O objetivo é um app **simples e consistente**: o usuário escolhe um idioma (PT-BR ou inglês) numa
aba de Configurações e **toda a interface** passa a falar aquele idioma — sem mistura.

## Objetivos

- Suporte a dois idiomas: **Português (Brasil)** e **English**.
- Aba "Idioma" nas Configurações com dois cartões de seleção (mesmo estilo do seletor de tema).
- Tradução de **toda a interface**: telas React + menus/diálogos/notificações nativas do Electron.
- Padrão na primeira execução: **seguir o idioma do sistema** (Windows em português → PT-BR;
  qualquer outro → inglês).
- Troca de idioma **na hora**, sem reabrir o app.
- Sem dependência nova: solução caseira leve, espelhando o padrão já existente em `theme.jsx`.

## Fora do escopo

Conteúdo que vem de fora e não dá pra traduzir:
- Saída do Claude Code / do terminal.
- Conteúdo dos arquivos dos projetos do usuário e o código em si.
- Nomes próprios e de marca (mantidos iguais nos dois idiomas): `Claude Code`, `Codex`,
  `OpenCode`, `Antigravity`, `GitHub`.

Nenhuma biblioteca de i18n (react-i18next / react-intl) — avaliadas e descartadas por peso e
cerimônia desproporcionais a um app de 2 idiomas com textos simples.

## Arquitetura

Duas superfícies de texto compartilham **uma mesma escolha de idioma**:

```
src/lib/i18n.jsx          → LanguageProvider + hooks useT() / useLang()
src/lib/locales/pt.js     → dicionário PT-BR (objeto agrupado por área: chave → texto)
src/lib/locales/en.js     → dicionário inglês (mesmas chaves)
main.js (+ mapa próprio)  → strings nativas (menu de contexto, notificações, diálogos)
```

### Contexto do renderer (`src/lib/i18n.jsx`)

Espelha `src/lib/theme.jsx`:

- `LanguageProvider` guarda o idioma atual em estado React e persiste em `localStorage['lang']`.
- **Valor inicial:** lê `localStorage['lang']`; se vazio, detecta pelo sistema —
  `navigator.language` começando com `pt` → `'pt'`, caso contrário `'en'`.
- `useT()` devolve a função `t(chave, vars?)`:
  - resolve a chave (caminho pontilhado, ex.: `'settings.title'`) no dicionário do idioma ativo;
  - **interpolação** simples: `t('chat.greeting', { name })` substitui `{name}` no texto;
  - **fallback** em cascata: idioma ativo → PT → a própria string da chave. Nunca lança nem
    deixa a tela em branco por causa de uma chave faltando.
- `useLang()` devolve `{ lang, setLang }` para a aba de Configurações.
  - `setLang(lang)` atualiza o estado, grava no `localStorage` e chama `window.api.setLang(lang)`
    para o processo main acompanhar.
- O `Provider` envolve o app em `src/main.jsx`, junto do `ThemeProvider`.

### Organização das chaves

Objetos agrupados por área para facilitar manutenção. Exemplo:

```js
// pt.js
export default {
  contextMenu: {
    reveal: 'Abrir no Explorador', cut: 'Cortar', copy: 'Copiar',
    copyPath: 'Copiar caminho', rename: 'Renomear', delete: 'Excluir',
  },
  settings: {
    title: 'Configurações', tabAi: 'IA por projeto', tabAppearance: 'Aparência',
    tabCode: 'Códigos', tabNotify: 'Notificações', tabDeps: 'Dependências',
    tabLanguage: 'Idioma', tabAbout: 'Sobre & créditos', /* … */
  },
  // … rail, chat, code, git, mcp, api, checkpoints, preview, setup, commandPalette …
}
```

`en.js` tem exatamente as mesmas chaves.

### Regra de tradução (PT-BR ao máximo)

- Traduzir tudo que tem bom equivalente em português (Cortar, Copiar, Renomear, Aparência…).
- Manter o **jargão consagrado** que se usa em inglês mesmo: `Git`, `commit`, `MCP`, `API`,
  `Preview`, `terminal`.
- Manter nomes próprios/marca intactos (ver "Fora do escopo").
- Aproveitar a passada para **normalizar** o PT-BR atual (remover o inglês solto que sobrou).

### Processo main (menus / diálogos / notificações nativas)

- O `main.js` mantém o idioma atual em memória e **persistido no `userData`**, com default vindo
  de `app.getLocale()` no boot (cobre o caso de notificação disparada antes de qualquer janela
  pedir o idioma).
- Ao trocar o idioma na aba, o renderer chama `window.api.setLang(lang)` →
  o main atualiza o valor, persiste e **reconstrói os menus de contexto** que dependem de texto.
- As strings nativas do main ficam num **mapa próprio e enxuto, colocado junto do `main.js`**
  (são poucas e estáveis — ~24 ocorrências). Decisão deliberada: importar de `src/` no app
  empacotado é frágil (só `dist/` + `main.js` vão no pacote), e o risco de divergência é baixo
  porque essas strings raramente mudam.

### Aba "Idioma" nas Configurações

Em `src/components/SettingsModal.jsx`:

- Novo `TabButton` "Idioma" com o ícone `Globe` (já importado no arquivo).
- Conteúdo: dois cartões no mesmo estilo do seletor de tema —
  **Português (Brasil)** e **English** — chamando `setLang('pt' | 'en')`.
- A própria SettingsModal passa a usar `t(...)` em todos os seus rótulos (abas, títulos, textos).

## Fluxo de dados

1. Boot: `LanguageProvider` resolve o idioma (localStorage → sistema). Main resolve o seu
   (userData → `app.getLocale()`).
2. Render: componentes chamam `useT()` e renderizam via `t('area.chave')`.
3. Troca: usuário clica num cartão na aba Idioma → `setLang` grava no localStorage, re-renderiza
   a UI na hora e avisa o main por IPC → main reconstrói menus e passa a notificar no novo idioma.

## Tratamento de erros / robustez

- Chave faltando → fallback (idioma ativo → PT → string da chave). A tela nunca quebra.
- `window.api.setLang` ausente (ex.: contexto sem ponte) → o renderer ainda funciona; só o main
  não acompanha. Chamada protegida com `?.`.

## A migração (trabalho em volume)

Trocar as strings hardcoded por `t(...)`. O plano de implementação vai quebrar em lotes por área,
cada um revisável isoladamente:

- Rail / barra lateral
- ChatPanel (chrome estático; conteúdo do Claude fica de fora)
- CodeView + menu de contexto da árvore (o caso da print)
- GitPanel
- MCPPanel + Inspector/Drawer/Form/Modal
- ApiPanel
- CheckpointsPanel
- PreviewPanel
- SettingsModal (+ nova aba Idioma)
- SetupScreen
- CommandPalette
- Strings nativas do `main.js`

## Testes / verificação

- **Smoke test de paridade de chaves:** garante que todo caminho de `pt.js` existe em `en.js` e
  vice-versa (pega tradução faltando). Roda no mesmo estilo dos outros `*.smoke.cjs`/`.mjs`.
- `npm run build` limpo — lembrando que edições em `src/` só aparecem depois do build (o app
  carrega `dist/`).
- Conferência visual: alternar PT/EN e varrer as telas principais nos dois idiomas, incluindo o
  menu de contexto da árvore e ao menos uma notificação nativa.

## Decisões registradas

| Decisão | Escolha |
|---|---|
| Abordagem | Contexto caseiro leve (sem dependência), espelhando `theme.jsx` |
| Idiomas | PT-BR e English |
| Padrão na 1ª execução | Seguir o idioma do sistema |
| Escopo | Toda a UI, incluindo menus/diálogos/notificações nativas do Electron |
| Jargão | PT-BR ao máximo; mantém Git/commit/MCP/API/Preview/terminal e nomes próprios |
| Persistência | `localStorage['lang']` (renderer) + `userData` (main) |
| Troca de idioma | Imediata, sem reabrir o app |
