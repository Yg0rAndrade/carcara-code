// Para onde vai um link clicado no terminal do Claude (hiperlink OSC 8 que a CLI emite).
//
// Sem um `linkHandler` próprio, o xterm usa o padrão dele: `confirm("Do you want to
// navigate to…? WARNING: This link could potentially be dangerous")` + `window.open`,
// que no Electron vira uma JANELA nativa solta por cima do app. Aqui o link vira uma
// ABA nova no preview do projeto (igual ao botão do meio num link do site).
//
// Lista de permissão, mesma ideia de electron/window-open.cjs: só navegação de verdade
// (`http(s):`) vira aba; `mailto:` sai pro sistema; o resto (`file:`, `javascript:`,
// esquemas do SO) é engolido.
//
// - `tab`      → aba nova no preview do projeto ativo
// - `external` → entregar ao SO (window.api.openExternal)
// - `deny`     → ignorar
export function routeTerminalLink(uri) {
  const u = typeof uri === 'string' ? uri.trim() : '';
  if (!u) return 'deny';
  if (/^https?:\/\/\S/i.test(u)) return 'tab';
  if (/^mailto:\S/i.test(u)) return 'external';
  return 'deny';
}
