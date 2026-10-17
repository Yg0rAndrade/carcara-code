# Plugins locais

Pastas em `electron/plugins/<id>/` são plugins **locais**: ficam fora deste repositório
(`.gitignore`), cada uma costuma ser um repositório git próprio clonado aqui dentro. Sem
nenhum plugin, o Carcará funciona exatamente igual.

Hoje um plugin pode oferecer um **visual de chat** alternativo para as abas do Claude
Code: em vez do terminal, a aba mostra um `<webview>` com a página do plugin. A escolha
fica em Configurações › IAs › "Visual das abas do Claude" (o card só aparece quando há
plugin instalado).

## Instalar um plugin

```bash
git clone <repo-do-plugin> electron/plugins/<id>
cd electron/plugins/<id> && npm install
```

Depois, reinicie o Carcará (os plugins são lidos na inicialização).

## Contrato

`electron/plugins/<id>/index.cjs` exporta:

| Campo           | Tipo                       | Obrigatório | Uso                                                       |
| --------------- | -------------------------- | ----------- | --------------------------------------------------------- |
| `id`            | string (`a-z0-9-`)         | sim         | Igual ao nome da pasta.                                   |
| `label`         | string                     | sim         | Nome mostrado nas Configurações.                          |
| `description`   | string                     | não         | Dica (tooltip) nas Configurações.                         |
| `schemes`       | `[{ scheme, privileges }]` | não         | Somados ao `protocol.registerSchemesAsPrivileged` do app. |
| `activate(ctx)` | função                     | sim         | Chamada no `app.whenReady`. Devolve a instância (abaixo). |

`ctx` (montado em `activatePlugins()` no `main.js`):
`protocol`, `ipcMain`, `net` (do Electron), `shell`, `webContents`, `userDataDir`,
`baseEnv()` (ambiente sem chave de API, o mesmo dos terminais), `log(...)`,
`isProjectPath(p)` (a pasta pertence a um projeto aberto?), `openFileInApp(p)` (abre o
arquivo na aba "Código") e `notify(projectPath, texto)` (notificação nativa, com as mesmas
regras do "Claude terminou").

Instância devolvida por `activate`:

- `chatView({ projectPath, tabId })` → `Promise<{ src, preload }>`: URL da página e preload
  (`file://`) do `<webview>` daquela aba. Pode demorar (ex.: download na primeira vez); o
  renderer mostra "carregando" enquanto isso.
- `setTheme(tokens)` (opcional): tokens do tema atual (`background`, `foreground`,
  `primary`… no formato do shadcn, mais `fontUi`, `fontMono` e `dark`).
- `dispose()` (opcional): chamado ao fechar o app.

O carregador mora em `electron/plugin-host.cjs` (testado em `electron/plugin-host.test.js`).
Plugin com erro ao carregar ou ativar vai para o log e é ignorado; nunca derruba o app.
