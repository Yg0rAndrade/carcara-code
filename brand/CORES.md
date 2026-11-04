# Cores do Carcará Code

## Resposta curta

A cor do projeto é **laranja brasa**.

| Onde                            | Hex       | Observação                                                              |
| ------------------------------- | --------- | ----------------------------------------------------------------------- |
| **Logo e site**                 | `#D99748` | Cor da marca. Pinta a logo em `imgs/logo.svg` e o site carcaracode.net. |
| **Acento do app (tema claro)**  | `#F59E0B` | Token `--primary` em `:root` (`src/index.css`).                         |
| **Acento do app (tema escuro)** | `#F2812E` | Token `--primary` em `.dark`.                                           |

Para qualquer uso fora do app (site, slide, post, ícone), use `#D99748`. Os outros
dois valores são o mesmo laranja ajustado para contraste dentro da interface.

## De onde vem

A paleta vem do carcará, ave de rapina do sertão: plumagem escura sobre a terra ocre
da caatinga, e a pele facial alaranjada que marca a cara do bicho. Daí o canvas de
carvão quente no lugar do cinza-azulado genérico de IDE, com o laranja como única cor
saturada do sistema. O comentário de abertura de `src/index.css` conta essa história,
e a regra de uso sai dela: pinte de laranja só a ação principal ou o foco.

## Paleta completa

`src/index.css` declara os valores como variáveis CSS em HSL. `tailwind.config.cjs`
os expõe para as classes na forma `hsl(var(--token))`. Os hex abaixo são conversão.

### Tema claro (`:root`)

| Token                  | HSL                        | Hex       |
| ---------------------- | -------------------------- | --------- |
| `--primary` / `--ring` | `37.6923 92.126% 50.1961%` | `#F59E0B` |
| `--background`         | `0 0% 100%`                | `#FFFFFF` |
| `--foreground`         | `0 0% 14.902%`             | `#262626` |
| `--accent-foreground`  | `22.7273 82.5% 31.3725%`   | `#92400E` |

### Tema escuro (`.dark`)

| Token                  | HSL                         | Hex       |
| ---------------------- | --------------------------- | --------- |
| `--primary`            | `25.4082 88.2883% 56.4706%` | `#F2812E` |
| `--background`         | `0 0% 9.0196%`              | `#171717` |
| `--foreground`         | `0 0% 89.8039%`             | `#E5E5E5` |
| `--card` / `--popover` | `0 0% 14.902%`              | `#262626` |
| `--border` / `--input` | `0 0% 25.098%`              | `#404040` |
| `--accent`             | `22.7273 82.5% 31.3725%`    | `#92400E` |

### Cores de estado (iguais nas duas famílias, com ajuste de luminosidade)

| Token           | Claro     | Escuro    | Para quê                                                                               |
| --------------- | --------- | --------- | -------------------------------------------------------------------------------------- |
| `--warning`     | `#E7B008` | `#FBBD23` | Âmbar de alerta ("Parar"). Mais amarelo que a primary, para separar da ação principal. |
| `--success`     | `#1CA64F` | `#2BC563` | Confirmação positiva, como toast de sucesso.                                           |
| `--destructive` | `#EF4444` | `#EF4444` | Erro e ação destrutiva.                                                                |

## Temas nomeados

O app aplica cada tema por `[data-theme]` em cima da base e sobrescreve só o que muda.

| Tema     | Família | Fundo     | Primary       | Ideia                                                                                    |
| -------- | ------- | --------- | ------------- | ---------------------------------------------------------------------------------------- |
| `brasa`  | escuro  | `#150E0C` | `#FF6D24`     | O escuro turbinado da marca: carvão levemente avermelhado, brasa mais quente e saturada. |
| `carvao` | escuro  | `#000000` | herda `.dark` | AMOLED. Fundo preto real, boa para OLED e bateria.                                       |
| `papel`  | claro   | `#F8F5EF` | herda `:root` | Modo leitura. Papel quente, pouca luz azul, texto marrom-grafite (`#352D27`).            |

## Variantes da logo

| Arquivo                     | Cor            | Uso                                                         |
| --------------------------- | -------------- | ----------------------------------------------------------- |
| `brand/carcara-logo.svg`    | `#D99748`      | Versão de marca. Cópia de `imgs/logo.svg`.                  |
| `brand/carcara-logo.png`    | `#D99748`      | Mesma arte rasterizada em 2754x2560 com fundo transparente. |
| `src/assets/logo.svg`       | `currentColor` | Dentro do app. Herda a cor do contexto.                     |
| `src/assets/logo-light.svg` | `#6B7280`      | Monocromática para fundo claro.                             |
| `src/assets/logo-dark.svg`  | `#A3A3A3`      | Monocromática para fundo escuro.                            |

## Tipografia, de quebra

| Papel                   | Fonte                   |
| ----------------------- | ----------------------- |
| Interface (`--font-ui`) | Hanken Grotesk Variable |
| Código (`--font-mono`)  | JetBrains Mono Variable |

Raio padrão de borda: `--radius: 0.375rem` (6px).
