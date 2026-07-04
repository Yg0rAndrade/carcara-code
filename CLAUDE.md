# Carcará Code

IDE minimalista em Electron para o Claude Code (estilo Lovable). Um ícone por projeto,
com chat e preview lado a lado. Usa a assinatura do Claude, nunca a API.

## Projetos relacionados

- **Site de marketing** (repositório separado): `../carcara-code-site`
  Landing em **Astro** publicada em https://carcaracode.net. Mantê-lo em sincronia
  com o app: se o pitch, a versão ou os recursos mudarem aqui, refletir lá também.
  Build: `npm run build` (na pasta do site). Deploy via Cloudflare (`wrangler.jsonc`).

- **Repo do fork:** https://github.com/puppe1990/carcara-code
- **Upstream (original):** https://github.com/Yg0rAndrade/carcara-code

## Notas de desenvolvimento

- Edições em `src/` só aparecem depois de `npm run build` (o app carrega de `dist/`).
- O app pode estar rodando com uma sessão viva do Claude Code — não force relaunch sem confirmar.
- Para abrir o Electron de dentro de um terminal do Claude, limpe `ELECTRON_RUN_AS_NODE`.
