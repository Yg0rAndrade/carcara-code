# Carcará Code

IDE minimalista em Electron para o Claude Code (estilo Lovable). Um ícone por projeto,
com chat e preview lado a lado. Usa a assinatura do Claude, nunca a API.

## Projetos relacionados

- **Site de marketing** (repositório separado): `../carcara-code-site`
  Landing em **Astro** publicada em https://carcaracode.net. Mantê-lo em sincronia
  com o app: se o pitch, a versão ou os recursos mudarem aqui, refletir lá também.
  Build: `npm run build` (na pasta do site). Deploy via Cloudflare (`wrangler.jsonc`).

- **Repo público do app:** https://github.com/Yg0rAndrade/carcara-code

## Notas de desenvolvimento

- Edições em `src/` só aparecem depois de `npm run build` (o app carrega de `dist/`).
- O app pode estar rodando com uma sessão viva do Claude Code — não force relaunch sem confirmar.
- Para abrir o Electron de dentro de um terminal do Claude, limpe `ELECTRON_RUN_AS_NODE`.
- Ao lançar uma nova versão, atualizar `CHANGELOG.md` (padrão Keep a Changelog) com o
  diff do que mudou da versão anterior para a atual, antes do commit `chore(release): x.y.z`.

## DIFERENÇAS DE PLATAFORMA (Win/Mac/Linux)

Os módulos do processo main moram em `electron/` (ex.: `electron/platform.cjs`,
`electron/php-runtime.cjs`, `electron/remote/`); só `main.js` e `preload.js` ficam na raiz.

Nunca espalhe `process.platform` pelo código. Diferença de SO vai em `electron/platform.cjs`
(módulo canônico, estilo `platform.ts` do VS Code):

- É um **valor** (nome de shell, extensão de binário, comando de "abrir", URL de asset)?
  → vira chave na tabela `TABLE` de `electron/platform.cjs`. Adicionar suporte a um SO = preencher
  a coluna dele.
- É **comportamento** (resolver PATH, montar menu, escolher login shell)? → vira uma
  função em `electron/platform.cjs` que aceita `platform` como parâmetro (default `process.platform`),
  para ser testável em qualquer SO via `scripts/platform-smoke.cjs`.
- Comportamento que precisa de `fs`/`child_process` (ex.: download/extração por SO) mora
  no módulo que já tem Node (ex.: `electron/php-runtime.cjs`), ramificando por `process.platform`,
  mas com as partes de decisão (asset, nome de binário) como funções puras testáveis.

Regra de ouro: se você escreveu `process.platform === '...'` fora de `electron/platform.cjs`,
provavelmente há um lugar melhor. O caminho Windows nunca deve regredir ao adicionar Mac/Linux.

## AUTO-APRENDIZADO

Ao final de toda sessão, capture todos os desafios e pontos de fricção que você encontrou que podem ocorrer novamente no futuro.

Se é algo que pode ser corrigido, corrija.

Se não é algo que pode ser corrigido, coloque essa informação no arquivo DESAFIOS.md.

Se o aprendizado se refere a uma Skill, modifique a skill ao invés de gravar o desafio.

Leia o DESAFIOS.md desse projeto ao iniciar uma nova sessão.

## GESTÃO DE CONTEXTO

Ao iniciar tarefas multi-step, documente tudo em arquivos .md, para que eu possa ir compactando e iniciando novas sessões sem perder contexto.

Sempre que o contexto da conversa não for mais necessário, me sugira compactar ou iniciar nova sessão, para economizar tokens.

Me diga se o próximo passo precisa ser Opus, ou se pode ser Sonnet (plano claro) ou Haiku (puramente mecânicas).

## DECISÕES MUITO TÉCNICAS

Toda vez que eu precisar tomar uma decisão técnica (escolha de stack, bibliotecas, padrões de código, segurança, manutenibilidade), me ofereça os prós e contras de cada opção.

E a sua recomendação baseada em critérios técnicos, de DRY e código limpo.

## TRABALHO DE PEÃO

Nunca me peça para rodar comandos no terminal ou manipular arquivos diretamente, se é algo que você pode fazer.

## AÇÕES PENDENTES

Tudo que depende da minha decisão vai no final, num bloco separado:

═══ ⚠️ PENDENTE: ═══

<confirmação / decisão / escolha, com sua recomendação em uma linha>

═══

## FINALIZAR SESSÃO

Ao finalizar uma sessão, quando não tiver mais nada pendente e mais nada a ser feito, coloque ao final da resposta:

═══ ✅ SESSÃO FINALIZADA ═══
