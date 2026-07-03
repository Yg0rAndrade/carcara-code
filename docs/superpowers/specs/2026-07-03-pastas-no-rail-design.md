# Pastas no Rail — Design

**Data:** 2026-07-03
**Status:** Aprovado (aguardando plano de implementação)
**Branch de trabalho:** `feat/rail-folders` (worktree dedicado)

## Objetivo

Permitir organizar os projetos do Rail em **pastas de um nível** (estilo springboard
do iOS), com criação por drag-and-drop e por menu. O Rail hoje é uma lista plana de
ícones (um por projeto); esta feature adiciona agrupamento sem trazer complexidade de
árvore de diretórios.

Fora de escopo (YAGNI): pastas aninhadas (mais de um nível), pastas dentro de pastas,
cores/ícones customizados para a pasta em si.

## Contexto atual

- Projetos vivem em `config.json` como lista plana de caminhos: `cfg.projects = [path, ...]`.
  A ordem é preservada e o drag-and-drop de reordenação já existe em
  `src/components/Rail.jsx` (estado `dragPath`/`overPath`, handler `projects:reorder`
  em `main.js`).
- Metadados por projeto (nome, cor, ícone) ficam em `cfg.projectMeta[path]`, separados
  da lista de existência.
- O botão "+" do rodapé chama direto o seletor de pastas do SO (`projects:add` em `main.js`).
- `motion` (framer-motion v12) já é dependência do projeto — usaremos o prop `layout`
  para as animações de FLIP (descida na reordenação, abrir/fechar do acordeão).
- **Concorrência:** o `config.json` é do app (uma instância por vez); o risco real das
  múltiplas sessões do usuário é colisão de merge no código-fonte entre sessões do
  Claude — resolvido por isolamento em branch/worktree.

## Modelo de dados

Novo campo `cfg.rail`: array **ordenado** de itens, cada um sendo um projeto solto ou
uma pasta com filhos.

```jsonc
"rail": [
  { "type": "project", "path": "C:/Users/.../a" },
  {
    "type": "folder",
    "id": "f1",
    "name": "Clientes",
    "collapsed": true,
    "children": ["C:/Users/.../b", "C:/Users/.../c"]
  },
  { "type": "project", "path": "C:/Users/.../d" }
]
```

Regras:

- `cfg.projects` **continua a fonte de verdade** dos projetos que existem. `projects:add`
  e `projects:remove` operam nela; o resto do main (sessões, preview, checkpoints, etc.)
  segue lendo `cfg.projects` por path — **nada disso muda**.
- `cfg.rail` é **apenas o layout** (ordem + agrupamento). `projectMeta`, ícones e cores
  continuam indexados por path e não mudam.
- **IDs de pasta:** `"f" + N`, onde `N` é um contador derivado do próprio config
  (ex.: maior id numérico existente + 1). **Não** usar `Math.random`/`Date.now`
  (banidos no ambiente de workflow e desnecessários; o contador evita colisão entre saves).

### Reconciliação `rail` ↔ `projects`

Executada sempre que o rail é lido (`projects:list`) e após qualquer mutação, para
manter `rail` consistente mesmo com mudanças externas:

1. **Migração:** se `cfg.rail` não existir, gerar um a partir de `cfg.projects` (todos os
   projetos soltos, na ordem atual).
2. **Órfãos removidos:** toda referência em `rail` (solta ou dentro de pasta) a um path
   que não está mais em `cfg.projects` é removida.
3. **Novos projetos:** todo path em `cfg.projects` ausente do `rail` entra **solto no fim**
   (rede de segurança, igual o `reorder` atual já faz).
4. **Pastas vazias:** pasta que fica sem filhos é **descartada automaticamente**
   (decisão de produto: pasta vazia some; não há "pasta vazia persistente").

## Visual

- **Projeto:** inalterado — quadrado 42px, inicial ou favicon, badges de running/atividade.
- **Pasta fechada:** quadrado 42px, fundo `secondary`, com **mini-grid 2×2** dos 4
  primeiros filhos (cor + inicial, ou favicon miniatura). Se houver mais de 4 filhos, o
  4º slot mostra `+N`. Visualmente distinto de um projeto (que tem uma inicial única grande).
- **Pasta aberta (acordeão):** clique alterna `collapsed`. Os filhos renderizam **logo
  abaixo** do ícone da pasta, levemente indentados, com um filete/linha vertical
  conectando visualmente os filhos ao ícone da pasta, até o grupo fechar. O **nome** da
  pasta aparece como rótulo pequeno quando aberta.
- **Animações (`motion` `layout`):**
  - descida/rearranjo dos ícones na reordenação;
  - abrir/fechar do acordeão (altura + slide);
  - halo/realce no ícone-alvo quando o arraste está prestes a criar/entrar numa pasta.

## Interações

### Reordenar (borda)
Arrastar um item por **entre** ícones (borda) empurra e reordena com animação — como
hoje, mas agora operando sobre `cfg.rail` (itens = projetos soltos + pastas).

### Criar pasta / entrar em pasta (centro)
Pausar ~**0.4s** com o cursor no **centro** de outro ícone realça o alvo (halo). Ao soltar:
- alvo é **projeto** → cria pasta `Nova pasta` contendo os dois projetos (o arrastado e o alvo);
- alvo é **pasta** → o projeto arrastado **entra** na pasta.

O limiar borda-vs-centro é uma zona central do ícone-alvo (ex.: ~50% central) + o dwell
de ~0.4s, para evitar criar pasta sem querer ao só passar por cima.

### Tirar da pasta
Arrastar um filho para fora (região solta do rail / entre itens de raiz) devolve o
projeto ao nível raiz. Se a pasta ficar vazia, ela some (reconciliação).

### Expandir/recolher
Clique na pasta fechada abre o acordeão; clique de novo recolhe. Estado `collapsed`
persiste em `cfg.rail`.

### Renomear / desfazer pasta
- **Duplo-clique** na pasta → renomear inline.
- **Menu de contexto** (botão direito) na pasta: "Renomear" e "Desfazer pasta"
  (dissolve: solta os filhos de volta à raiz, na posição da pasta, e remove a pasta).
  Desfazer/excluir pasta **nunca** apaga projeto nem toca no disco.
- Projetos **dentro** da pasta mantêm o menu de contexto atual (configurações, preview,
  remover projeto).

### Botão "+" → menu
Clicar no "+" do rodapé abre um popover pequeno (reusa o padrão visual do `RailMenu`)
com duas opções:
- **"Adicionar projeto"** — fluxo atual (`projects:add`, seletor de pastas do SO);
- **"Nova pasta"** — cria uma pasta vazia no rail, já em modo renomear inline.

Observação: uma pasta recém-criada vazia é uma exceção temporária à regra "pasta vazia
some" — ela existe até o usuário soltar o primeiro projeto ou sair do modo de criação;
se for descartada sem filhos, some (comportamento a detalhar no plano; o caminho
primário de criação continua sendo o drag-and-drop, que nasce com 2 projetos).

## Backend (`main.js` / `preload.js`)

- **Leitura:** `projects:list` passa a devolver também a estrutura `rail`, com cada
  projeto já resolvido (name/color/icon/running/activity por path), para o renderer montar
  a árvore de um nível sem recomputar.
- **Escrita — generalizar o reorder atual e adicionar handlers de pasta:**
  - `rail:set` (ou `projects:reorder` reaproveitado) — persiste o `rail` inteiro após
    reordenar/mover no renderer;
  - `rail:createFolder` — cria pasta a partir de dois paths (ou vazia);
  - `rail:renameFolder` — renomeia por id;
  - `rail:deleteFolder` — dissolve a pasta (solta filhos, remove pasta);
  - `rail:move` — mover item para dentro/fora de pasta ou entre posições.

  (A divisão exata dos handlers fica a critério do plano; o mínimo é: persistir o `rail`
  completo + criar/renomear/dissolver pasta. Toda escrita roda a reconciliação antes de salvar.)
- `preload.js`: expor os novos canais no bridge, seguindo o padrão dos existentes.
- **Não muda:** `projectMeta`, `setColor`/`setIcon`/`rename`/`resetCustom`, favicon,
  sessões, preview, checkpoints — tudo continua por path.

## Isolamento entre sessões

- Implementar num **worktree/branch dedicado** `feat/rail-folders`, seguindo o padrão de
  `.claude/worktrees/` que o usuário já usa, para não colidir com edições de outras
  sessões do Claude rodando em paralelo.
- Adicionar uma **seção nova ao `AGENTS.md`** avisando que o usuário roda **várias
  sessões do Claude Code em paralelo** (inclusive em worktrees) e que, ao implementar,
  agentes devem manter o trabalho isolado num branch/worktree próprio para evitar
  colisões de merge com outras sessões.

## i18n

Regra obrigatória do projeto: nenhum texto visível fica hardcoded no JSX. Todas as
strings novas entram em `src/lib/locales/pt.json` **e** `src/lib/locales/en.json`:

- menu do "+": "Adicionar projeto" / "Nova pasta";
- pasta: nome padrão "Nova pasta", "Renomear", "Desfazer pasta";
- tooltips do ícone de pasta e do acordeão.

Rodar `node scripts/i18n-parity.smoke.cjs` (ou `npm run test:i18n`) antes de fechar
qualquer tarefa que mexa em texto. Manter jargão consagrado idêntico nos dois idiomas.

## Testes

- **Smoke de reconciliação** (`rail` ↔ `projects`), cobrindo:
  - config sem `rail` → migra para tudo solto na ordem de `projects`;
  - path presente no `rail` mas ausente de `projects` → removido (inclusive de dentro de pasta);
  - path novo em `projects` ausente do `rail` → entra solto no fim;
  - pasta que fica sem filhos → descartada;
  - geração de id de pasta sem colisão (contador).
- **Paridade i18n:** `node scripts/i18n-parity.smoke.cjs`.
- Verificação manual no app (build via `npm run build`, pois `src/` só reflete após build):
  criar pasta por drag (centro), reordenar (borda), entrar/sair de pasta, renomear,
  desfazer, abrir/fechar acordeão, menu do "+".

## Riscos e mitigação

- **Ambiguidade borda-vs-centro no arraste:** mitigado pela zona central + dwell de ~0.4s
  e realce visual do alvo antes de soltar. Ajustar limiares na verificação manual.
- **Consistência do `rail`:** toda leitura/escrita passa pela reconciliação, então
  divergências (projeto removido por fora, config antigo) se auto-corrigem.
- **Rail estreito:** o acordeão inline (sem modal/flyout) mantém tudo numa coluna; o
  mini-grid 2×2 e a indentação precisam de bom contraste — validar no tema claro e escuro.
