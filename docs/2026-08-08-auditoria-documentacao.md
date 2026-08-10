# Auditoria da documentação (docs-carcara) — lacunas vs. app real

As 24 páginas planejadas em `docs-carcara/_mapa.md` (repo `carcara-code-site`) estão
todas escritas (24/24). Esta auditoria não questiona essa lista — compara o que o
app **realmente faz** (CHANGELOG.md + specs/plans em `docs/superpowers/` + código-fonte)
contra o que essas 24 páginas **explicam de fato**, pra achar recursos que ficaram
invisíveis na documentação.

Fontes: `CHANGELOG.md` (0.1.4–0.1.11 completo), `docs/superpowers/specs/*.md` e
`docs/superpowers/plans/*.md`, as 24 páginas publicadas em
`carcara-code-site/src/content/docs/docs/`, e spot-check no código-fonte
(`RemoteProjectModal.jsx`, `electron/remote/*.cjs`, `SettingsModal.jsx`, `CodeView.jsx`,
`HtmlViewer.jsx`, `electron/updater.cjs`, `CheckpointsPanel.jsx`).

---

## Prioridade alta — recurso existe, não documentado em lugar nenhum

| #   | O que falta                                                                                                   | Por que importa                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Projetos remotos via SSH** (`RemoteProjectModal.jsx`, senha ou chave, import do `~/.ssh/config`)            | Um tipo inteiro de projeto invisível — hoje "Adicionar um projeto que já existe" só fala de pasta local  |
| 2   | **Portas do projeto** (ver/fechar portas abertas, porta fixa por projeto)                                     | Recurso da aba Configurações que ninguém vai achar sozinho                                               |
| 3   | **Visualizadores de HTML/CSV/mídia** no editor (barra de navegador no `.html`, etc.)                          | "Editor de código" hoje só diz que binário "não edita"                                                   |
| 4   | **Abas do Preview e recolher o Preview**                                                                      | Preview é a área com mais mudanças no changelog (0.1.5, 0.1.8, 0.1.9, 0.1.10) e a doc dele é a mais rasa |
| —   | **Página nova: Privacidade / onde ficam meus dados** (projetos, checkpoints, configs — nada vai pra servidor) | Argumento de venda forte pra quem desconfia de IDE com IA; custa pouco documentar                        |

## Prioridade média — itens menores do editor

| #   | Item                                                           |
| --- | -------------------------------------------------------------- |
| 9a  | Seleção por arraste (marquee) na árvore de arquivos            |
| 9b  | "Abrir no Explorador" no menu de contexto da busca de arquivos |
| 9c  | Quebra de linha (word-wrap) no editor                          |

## Backlog — próxima rodada (não priorizado ainda)

| #   | Item                                                                                                | Nota                                                                                            |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 5   | Atalhos de print (`Ctrl+P`, `Ctrl+Shift+P`) e hard reload (`Ctrl+F5`, `Ctrl+Shift+R`, `Ctrl+Click`) | Só o clique no ícone está documentado                                                           |
| 6   | Aba "Novidades" e como funciona o auto-update                                                       | Ninguém explica de onde vêm as notas de versão nem como o app atualiza                          |
| 7   | Arrastar arquivo pro terminal                                                                       | Pequeno, fácil de incluir junto do chat/terminal                                                |
| 8   | Checkpoints = git-sombra separado, e onde tudo fica salvo no disco                                  | Explica o "como restaurar" mas não o "onde isso vive" nem a diferença pro Git/GitHub de verdade |
| —   | FAQ / solução de problemas consolidada                                                              | Hoje só tem caixinhas "Deu errado?" espalhadas por página                                       |
| —   | Contribuir / suporte                                                                                | Repo é MIT público, já recebeu PRs de fora (#9, #11)                                            |

## Corretamente fora da doc (não são lacunas)

- **Carcará Code AI (motor OpenCode)** — escondido de propósito da escolha de IA desde a 0.1.9, até ter chave de API. Certo não documentar.
- **Badge "Copiar erro"** — rejeitado, nunca foi mergeado (fica na branch `feat/erros-servidor`).
- **Mac como download promovido** — Windows é o canal oficial hoje; Mac/Linux são builds de comunidade via CI, não o canal principal. Não é lacuna dado o posicionamento atual — só vale confirmar se essa continua sendo a intenção.

## Qualidade — spot check

`checkpoints.md`, `gerenciar-ias.md` e `conectar-mcp.md` estão claras, bem ritmadas
pra quem não programa, e atualizadas (`gerenciar-ias.md` já reflete o fluxo "comando
editável + colar no terminal" da 0.1.11). `preview.md` é a página mais fraca em
relação ao volume de mudanças que a área recebeu.

---

## Recomendação

Atacar primeiro os itens de **prioridade alta** (1–4 + Privacidade) e depois os de
**prioridade média** (9a–9c). O backlog (5–8 + estrutural) fica pra uma rodada
seguinte.
