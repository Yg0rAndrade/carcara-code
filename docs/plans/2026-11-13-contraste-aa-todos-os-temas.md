# Contraste AA em todos os temas (texto e ícone)

Pedido (13/11/2026): todo texto e todo ícone do app com contraste WCAG AA em todos os
15 temas (claros e escuros). Depois, push junto com os commits da outra sessão (0.1.18).

## Critério

- Texto: >= 4.5:1. Ícone/parte gráfica: >= 3:1. Margem de cálculo: 4.6.
- Superfícies medidas: background, card, popover, muted, secondary.
- Botão preenchido: *-foreground sobre a cor de preenchimento.

## Modelo de tokens

- Cor de PREENCHIMENTO (`bg-primary`, `bg-destructive`...) ≠ cor de TEXTO.
- Texto/ícone colorido usa sempre um `*-ink`: `text-primary-ink`, `text-destructive-ink`,
  `text-success-ink`, `text-warning-ink`, `text-info-ink`. Mesmo matiz, luminosidade mínima.
- Cores fixas do Tailwind em TEXTO (`text-red-500`, `text-green-600 dark:text-green-400`...)
  são proibidas: não acompanham o tema. Mapeamento: red/rose → destructive, green/emerald
  → success, amber/yellow/orange → warning, sky/blue → info. `bg-*`/`border-*` fixos ficam.
- `text-muted-foreground/NN` é proibido: o muted já é o cinza mínimo; transparência reprova.

## Passos

1. [x] Barras (commit 8cf782f): primary-ink, destructive-ink, rail sem transparência.
2. [x] Tokens novos: success-ink, warning-ink, info-ink (base clara e escura).
3. [x] Ajustes: muted-foreground (6 claros), --destructive 49%, --primary de céu/menta/coral.
4. [x] Migração das classes em src/ (text-primary, text-destructive, cores fixas, /NN).
5. [x] Teste `src/lib/themeContrast.test.js` cobrindo a matriz inteira + varredura que
       proíbe as classes antigas no src.
6. [x] Build, testes, commit, `git pull --rebase`/merge com a outra sessão, push.
