# Visual das soluções (design system)

Esta pasta guarda a cara de todas as telas: as cores, as fontes, os raios e as peças comuns. A direção visual se chama
"Carvão e terracota": fundo quente, menu carvão, terracota só como acento e nos botões principais, e verde, âmbar e
vermelho só para mostrar a situação de alguma coisa.

| Arquivo | O que tem |
|---|---|
| `tokens.css` | as variáveis de cor, fonte, raio e sombra, no modo claro e no escuro |
| `componentes.css` | as peças comuns, todas com o prefixo `v-` (botão, campo, cartão, selo, aviso, abas, estado vazio, passos, tabela, janela) |
| `exemplo.html` | a página de referência, com cada peça nos dois modos lado a lado (no site, em `/shared/visual/exemplo.html`, fora do menu) |

## Como uma tela usa

Toda tela carrega os dois arquivos, nesta ordem, antes do CSS próprio dela:

```html
<link rel="stylesheet" href="/shared/visual/tokens.css">
<link rel="stylesheet" href="/shared/visual/componentes.css">
```

A tela nunca escreve cor: ela usa `var(--ink)`, `var(--surface)` e as outras variáveis. Para uma versão translúcida de
uma cor, use `color-mix(in srgb, var(--ink) 12%, transparent)`. O teste `visual.mjs` da fábrica falha se achar cor escrita
num `.html` ou `.css` fora desta pasta (o desenho de ícone dentro de `<svg>` e os modelos de e-mail ficam de fora, porque
programa de e-mail não lê variável de CSS).

## Modo claro e escuro

- Com `data-theme="light"` ou `data-theme="dark"` no `<html>`, vale o tema escolhido. O botão Dia/Noite das telas grava a
  escolha de cada pessoa (no Grupos, a chave `grupos:tema` em `hub.user_prefs`).
- Sem `data-theme`, vale o tema do aparelho (`prefers-color-scheme`). É o caso das telas de entrada: login, definir senha,
  primeiro acesso e instalação.
- O bloco escuro aparece duas vezes no `tokens.css` (no `@media` e no `data-theme="dark"`). Quem mudar um valor muda nos
  dois, e o `visual.mjs` confere se as duas cópias ficaram iguais.

## As cores

| Variável | Para quê |
|---|---|
| `--bg`, `--surface`, `--raised`, `--sunken` | o fundo da página, o fundo do cartão, um fundo um pouco mais escuro (botão secundário, linha da tabela) e o fundo afundado |
| `--ink`, `--ink-2`, `--ink-3` | o texto principal, o texto de apoio e o texto mais apagado (exemplo do campo, data) |
| `--bd`, `--bd-2` | as bordas fina e mais marcada |
| `--acc`, `--acc-soft`, `--acc-ink` | o terracota de acento (link, aba ativa, foco do campo), o fundo suave dele e o texto sobre ele |
| `--btn`, `--btn-ink` | o botão principal, em cor chapada |
| `--ok`, `--warn`, `--risk` e os `-bg` | situação: ligado ou certo, atenção, erro ou desligado |
| `--m`, `--m-tx`, `--m-st`, `--m-mu`, `--m-on`, `--m-mark` | o menu carvão: fundo, texto, texto do item ativo, rótulo, fundo do item ativo e a marca |
| `--hero` | o degradê suave do cabeçalho de cada tela |
| `--foco` | o contorno de quem recebe o teclado |

Os pares de texto e fundo têm contraste de pelo menos 4,5 para 1 nos dois modos, e o `visual.mjs` mede todos. Quatro
valores do claro ficaram um pouco mais escuros que o desenho aprovado para passar nessa conta: `--ink-3` (`#67615A`),
`--acc` (`#A8431A`, o botão continua `#B4481B`), `--ok` (`#1A6E45`) e `--warn` (`#875709`). No escuro, o `--m-mu` ficou
`#857C72`.

## Fontes e raios

Título em Bricolage Grotesque (`--display`) e texto em Inter (`--corpo`), pelo Google Fonts, com as fontes do aparelho de
reserva. Raio de 12 px no cartão (`--raio-cartao`), 9 px no botão e no campo (`--raio-campo`) e 99 px no selo.

## Regras de uso

- Um botão principal (`v-btn`) por cartão. As outras ações usam `v-btn--sec`, e o que apaga usa `v-btn--perigo`.
- Todo campo tem rótulo (`v-rotulo`), um exemplo no placeholder e a mensagem logo abaixo (`v-ajuda`, `v-ajuda--ok` ou
  `v-ajuda--erro`), dizendo o que a pessoa faz em seguida.
- Toda lista tem os estados carregando (`v-carregando`), vazio (`v-vazio`, com título, frase e ação) e erro (`v-aviso
  v-aviso--risco`, com o botão de tentar de novo).
- No celular, botão e aba têm pelo menos 44 px de altura, e tabela larga rola dentro da própria moldura
  (`v-tabela-moldura`).
