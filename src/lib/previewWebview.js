// Atributos do <webview> de cada aba do preview.
//
// Vive fora do componente de propósito: `scripts/popup-smoke.cjs` importa esta função
// e monta o MESMO webview que o app monta, então o smoke testa o webview de verdade,
// não uma cópia que envelhece.
//
// `allowpopups` é o que faz `window.open` / `target="_blank"` / Ctrl+clique chegarem
// no `setWindowOpenHandler` do main. Sem ele o Chromium mata o popup DENTRO do guest:
// `window.open` devolve `null`, o handler do main NUNCA dispara e a aba interna nunca
// nasce (medido: 0 disparos sem o atributo, 3 com ele). Não é um afrouxamento de
// segurança — o handler do main devolve `deny` sempre, então janela nativa nenhuma
// chega a existir; ele só decide qual URL vira aba interna (electron/window-open.cjs).
export function tabWebviewAttrs(partition) {
  return { partition, allowpopups: '' };
}

// Aplica os atributos no elemento. Precisa rodar ANTES de anexar/navegar — tanto
// `partition` quanto `allowpopups` só valem na criação do guest.
export function applyTabWebviewAttrs(el, partition) {
  for (const [k, v] of Object.entries(tabWebviewAttrs(partition))) el.setAttribute(k, v);
  return el;
}
