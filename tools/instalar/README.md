# Ferramentas de instalar (`tools/instalar/`)

As ferramentas que vão **no pacote do cliente**: instalar o banco, montar o site,
acrescentar um módulo comprado depois e pôr os e-mails do login em português. Rodam
com Node 20+, `bash` e o `psql`; nenhuma precisa de `npm install`.

| Ferramenta | Pra quê |
|---|---|
| [`instalar.sh`](instalar.sh) | **O comando de alto nível.** Sem nada: instala do zero o banco da base e de todos os módulos da pasta. `--acrescentar PASTA-DO-PACOTE`: traz um pacote novo para uma instalação que já existe, sem duplicar (copia só o que falta e instala no banco só o que é novo). `--simular` mostra o que faria. No fim, oferece os e-mails em português. |
| [`instalar-banco.sh`](instalar-banco.sh) | **Instala o banco**: o essencial da base, as peças da base que os módulos usam, cada módulo na ordem do `precisa` (o OutChat depois do OutJourney) e, no fim de TODA instalação, as ligações de **todos** os módulos do banco. Num banco em uso ele está sempre no **modo acrescentar**: não reinstala a base nem módulo que já está lá, compara a versão da base da pasta com a do banco (mais nova → roda só as atualizações de `base/banco/atualizacoes/`; igual/mais velha → não mexe), instala as peças que faltam e o módulo novo. Recusa com o motivo: módulo que precisa de outro ausente, base mais velha que a `versao_minima_base`, peça faltando na pasta. `--ligacoes` só refaz as pontes. |
| [`acrescentar.js`](acrescentar.js) | A parte de **arquivos** do acrescentar (o `instalar.sh --acrescentar` chama): compara o pacote novo com o `instalacao.json`, copia a pasta do módulo novo e as peças da base que faltam, nunca substitui módulo que já existe, atualiza a base só se a do pacote for mais nova (guardando a de antes em `_copias/`). `--simular` diz o que faria. |
| [`pecas.js`](pecas.js) | O que a instalação tem e do que cada módulo precisa: as **peças da base**, as **versões**, as atualizações a rodar e o **mapa da instalação** (`instalacao.json`). Biblioteca das outras ferramentas e linha de comando (`node tools/instalar/pecas.js pecas outsign` → as peças que o OutSign usa). |
| [`emails-portugues.js`](emails-portugues.js) | **E-mails do login em português, automático:** os 6 modelos de `base/supabase/templates/` (com o nome da empresa) e os assuntos. No projeto hospedado, pela Management API do Supabase (`PATCH /v1/projects/{ref}/config/auth`, campos `mailer_subjects_*` e `mailer_templates_*_content`), com o token lido só da variável `SUPABASE_ACCESS_TOKEN` (nunca gravado nem mostrado; `--simular` mostra o pedido sem o token). No local, grava o `supabase/config.toml` (`--local PASTA`). Sem token: `--para PASTA` gera os arquivos para colar no painel. |
| [`montar/montar.js`](montar/montar.js) | **Monta o site** para publicar: copia cada sistema (e, da base, só as peças que os módulos usam) para o endereço dele, encaixa os pedaços das telas divididas, cola os menus em pasta (`montar/menus.js`) e troca os marcadores (`%SUPABASE_URL%`…). |

## O mapa da instalação (`instalacao.json`)

Fica na **raiz da instalação** do cliente e é refeito pelo `instalar-banco.sh` (e pelo
`acrescentar.js`, na parte dos arquivos). Diz:

```json
{
  "base": { "versao": "1.0.0", "banco_versao": "1.0.0",
            "pecas": { "essencial": { "versao": "1.0.0", "banco": "instalado" },
                       "avisos":    { "versao": "1.0.0", "banco": "instalado" },
                       "email":     { "versao": "1.0.0", "banco": "instalado" } } },
  "modulos": [ { "id": "outsign", "nome": "OutSign", "versao": "1.0.0", "banco": "instalado" } ],
  "emails_portugues": { "em": "…", "como": "projeto", "empresa": "…" },
  "historico": [ { "em": "…", "o_que": "banco: base 1.0.0 (essencial avisos email) + outsign" } ]
}
```

É ele que o Claude do cliente lê para acrescentar um módulo comprado depois (o
`COMECE-AQUI.md` de cada pacote explica). No repositório de trabalho ele não existe
(o instalador não grava o mapa quando há `tools/manutencao/`; `MAPA_SEMPRE=1` força).

## As peças da base e as versões

A base é dividida em **peças** (lista e arquivos de cada uma em `base/sistema.json` →
`pecas`): `essencial` (vai sempre), `avisos`, `email`, `produtos` e `comercial`. Cada
módulo diz no `sistema.json` dele as que usa (`base_pecas`), a versão dele (`versao`) e
a base mínima de que precisa (`versao_minima_base`). A base tem uma versão só
(`base/sistema.json` → `versao`), que vale para todas as peças do pacote em que vieram;
o mapa guarda a versão de cada peça, porque uma peça pode ter chegado num pacote mais
antigo que outra. Mudança no banco da base depois da 1.0.0 vira um arquivo em
`base/banco/atualizacoes/` (ver o `LEIA-ME.md` de lá).

## Montar o site

```bash
cp tools/instalar/montar/empresa.exemplo.json empresa.json      # e preencha (fica fora do git)
node tools/instalar/montar/montar.js --saida dist --config empresa.json
# só alguns módulos (a base vai sempre, com as peças que eles usam):
node tools/instalar/montar/montar.js --saida dist --config empresa.json --sistemas outjourney,outsign
```

O `dist/` é o site pronto, para qualquer hospedagem estática com "URLs limpas"
ligadas (`/outjourney/admin` abre `admin.html`). O OutFunnels não entra, porque é uma
aplicação à parte (ver `outfunnels/README.md`).

A montagem também pendura a **central de avisos** (`/shared/os-avisos.js`, da peça
`avisos` da base — sem ela, não há sino) antes do último `</body>` de toda tela que
carrega o `os-core.js` — e, **só quando o
módulo OutAssistenteIA está na lista**, o **assistente** (`/outassistenteia/os-agente.js`,
o botão ✦). Nenhuma tela precisa citar os dois. Sem o OutAssistenteIA, o ✦ não existe
no site (e o Início, o Dock e a barra do celular escondem o botão deles).

> **Por que montar?** Algumas telas foram divididas em pedaços (`<tela>-partes/`).
> No código-fonte, cada pedaço aparece como `<div data-parte="…"></div>`; a
> montagem põe o conteúdo no lugar, e o que vai ao ar é a tela inteira, igual à
> de antes. Abrir o arquivo-fonte direto no navegador não funciona, e nunca
> funcionou: os marcadores do Supabase também só são trocados na montagem.

## Menu novo num sistema: pasta `menus/<nome>/` + a linha `data-os-menu`

Menu novo **não entra** dentro de uma tela grande. Ele mora numa pasta própria, ao
lado da tela que o mostra, com três arquivos:

```
outjourney/
  admin.html                  ← no lugar do menu, UMA linha:
                                 <div data-os-menu="followups" x-show="route === 'followups'"></div>
  menus/followups/
    tela.html                 ← o desenho (a <section> inteira, com o x-data dele)
    followups.js              ← a lógica (a função do x-data, ex.: function followupsManager() {…})
    followups.css             ← o estilo (pode ficar só com um comentário)
```

Quem cola é a **montagem** (`tools/instalar/montar/menus.js`, chamado pelo `montar.js` logo
depois do encaixe dos `data-parte`):

- a `<div data-os-menu>` **fica**, com todos os atributos dela (`x-show`, `class`,
  `hidden`…), e recebe dentro o conteúdo do `tela.html`;
- o `.css` do menu entra no `<head>` da tela; o `.js` entra **logo antes do Alpine**
  (com `defer`, se o Alpine for `defer`): roda depois dos scripts da página e antes
  de o Alpine ligar a tela, então a função do `x-data` já existe. Cada arquivo leva
  `?v=<impressão do conteúdo>`, e o navegador baixa a versão nova depois de publicar;
- o menu enxerga tudo da tela de fora (`route`, `user`…), como se morasse dentro dela;
- tela sem `data-os-menu` sai idêntica; faltou um dos três arquivos, a montagem
  **para** e diz qual; pasta de menu que nenhuma tela usa gera um aviso.

O nome do menu é letras, números e `-`, e é o mesmo na pasta, nos arquivos e na
linha. A função do `x-data` precisa de nome próprio (procure antes com grep: duas
funções com o mesmo nome na mesma tela, a de baixo come a de cima).

## Como as telas grandes estão organizadas

Uma tela que era gigante virou uma **casca** + uma pasta de partes ao lado:

```
outjourney/
  admin.html                ← a casca: cabeçalho, menu e onde cada pedaço entra
  admin-partes/
    LEIA-ME.md              ← o mapa: o que tem em cada arquivo
    estilo.css              ← o CSS da tela
    telas/menus/crm.html    ← o HTML de cada menu, painel e janela (modal)
    telas/painel-cliente/aba-jornada.html
    js/00-base.js           ← o código, um arquivo por assunto, NA ORDEM
    js/14-fetch-cpv-page.js
    js/99-monta-app.js      ← (telas com Alpine) junta as partes do app
```

- **Mudar o desenho de um menu** → `telas/menus/<menu>.html`.
- **Mudar o que um botão faz** → procure o nome da função na pasta (Ctrl+Shift+F)
  e edite o arquivo de `js/` em que ela está.
- **Função nova** → no arquivo de `js/` do assunto. Se duas partes definirem o
  mesmo nome, vale a de número maior (e a outra é código morto: apague).
- **Script `.js` grande** (ex.: `outpeople/data/app.js`) virou a pasta `app-partes/`
  ao lado; a tela carrega os arquivos na ordem.
- **Banco:** `banco/estrutura.sql` virou um **índice**. As partes ficam em
  `banco/estrutura/`, numeradas na ordem em que o banco precisa delas
  (funções → tabelas → índices → segurança → permissões → chaves → ligações).
  `psql -f banco/estrutura.sql` continua funcionando igual.
