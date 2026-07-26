'use strict';

// Política de "abrir nova janela" das páginas do preview.
//
// Uma página do preview pode pedir uma janela nova de três jeitos: `target="_blank"`,
// `window.open(...)` ou Ctrl+clique. Nada disso vira janela flutuante do Chromium aqui:
// o main nega o popup e o renderer abre uma ABA interna do preview (ver `preview:new-tab`).
//
// A regra é lista de permissão, não de bloqueio — uma página aberta no preview NÃO pode
// disparar esquema do SO (`file:`, `smb:`, `ms-msdt:`, `javascript:`, `data:`) por
// `window.open`. Só o que é navegação de verdade (`http(s):` e o `blob:` que a própria
// página gerou) vira aba; só `mailto:` sai pro sistema.
//
// `blob:` está na lista porque é o jeito padrão de um app web entregar um arquivo que ele
// mesmo montou no navegador (PDF de `pdf-lib`, CSV, imagem): `URL.createObjectURL(blob)` +
// `window.open(url)`. A URL carrega a origem de quem criou (`blob:http://host/uuid`) e só
// resolve dentro dessa origem, na mesma sessão — daí só aceitarmos `blob:` de origem
// `http(s)`. `blob:file:///…` e `blob:null/…` (origem opaca) caem no deny, igual aos pais.
//
// - `tab`      → abrir aba interna no projeto dono do webview
// - `external` → entregar ao SO (`shell.openExternal`)
// - `deny`     → engolir, sem repasse
function decideWindowOpen(url) {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) return { action: 'deny' };
  if (/^https?:/i.test(u)) return { action: 'tab' };
  if (/^blob:https?:/i.test(u)) return { action: 'tab' };
  if (/^mailto:/i.test(u)) return { action: 'external' };
  return { action: 'deny' };
}

module.exports = { decideWindowOpen };
