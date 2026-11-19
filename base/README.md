# Base compartilhada

A base de todos os módulos vai em **toda** instalação e não é vendida à parte: a porta de entrada com **login único**, a camada que fala com o banco (`shared/os-core.js`), o controle de **acessos por módulo**, o cadastro de **usuários, cargos e áreas** (a tela **Usuários**, em `/usuarios/`: convidar, liberar e tirar acessos, desligar), os **avisos** na tela e no celular (PWA), a página de novidades, o **catálogo de produtos** (`/produtos/`, com a base de conhecimento por produto) e o **envio de e-mail** de todos os módulos. O **assistente de IA** (o botão ✦) pertence ao módulo **Assistente**, e sem ele o ✦ não aparece. Também mora aqui o que **toda tela** usa: o medidor de tempo de uso (`os_pulso`), o estado compartilhado (`os_estado`) e a lista do que foi instalado (`OS.instalado()`), que põe o **aviso de módulo ausente** no lugar do que é de um módulo que a empresa não comprou.

> **Para instalar, use a tela de instalação** (README.md da raiz do pacote): ela cria o banco, publica as funções do servidor e configura tudo sozinha, pela Vercel. Os comandos de terminal deste README continuam valendo para quem prefere instalar à mão. Nesse caso, publique **toda** função com `--no-verify-jwt`: cada uma confere por dentro quem está chamando, e o portão de JWT antigo do Supabase recusa o login dos projetos novos.

É instalada primeiro e uma vez só; nenhum módulo funciona sem ela.

> **Linguagem:** as telas de hoje são HTML com Alpine.js, mas **alteração, correção ou tela nova se faz em TypeScript** (Next.js + React, e NestJS quando precisar de servidor). HTML só quando for realmente necessário. As telas em HTML vão sendo trocadas aos poucos, uma por vez, nunca todas de uma vez.

## As peças da base

A base vai **em partes**: cada pacote leva o **essencial** e só as outras peças que os módulos dele usam (o `base_pecas` do `sistema.json` de cada módulo). A lista de cada peça (arquivos, Edge Functions e banco) mora no [`sistema.json`](sistema.json) → `pecas` (uma lista no manifesto, e não subpastas, para nenhuma tela mudar de endereço: o essencial é "tudo da pasta que não está numa das outras peças").

| Peça | Arquivos | Edge Functions | Banco |
|---|---|---|---|
| **essencial** (sempre) | o resto da pasta: `index.html`, `entrar/`, `primeiro-acesso/`, `conta/`, `usuarios/`, `novidades/`, `instalar/`, `shared/` (menos o `os-avisos.js`), `sw.js`, `manifest.webmanifest`, `modelo-pagina.html`, os modelos de e-mail do login | `primeiro-acesso`, `admin-usuarios`, `admin-reset-password`, `admin-generate-link`, `app-convite` | `banco/estrutura.sql` (o índice das partes de `banco/estrutura/`, menos a 11 e a 12) |
| **avisos** | `shared/os-avisos.js` (o sino) | `app-push` (aviso no celular) | nada próprio, porque a fila (`hub.notificacoes`, `hub.avisar`) é do essencial |
| **email** | nenhum | `email-envio` | nada próprio, porque a fila (`hub.email_outbox`) é do essencial |
| **produtos** | `produtos/` (e `/produto/`, a ficha do parceiro) | nenhuma | `banco/pecas/produtos.sql` (→ `estrutura/11-produtos-catalogo.sql`) |
| **comercial** | nenhum | nenhuma | `banco/pecas/comercial.sql` (→ `estrutura/12-comercial-catalogos.sql`) |

**Por que as filas de avisos e de e-mail ficam no essencial:** quase todo módulo grava um aviso (`hub.avisar`) ou põe um e-mail na fila dentro das próprias regras do banco. Se a fila não existisse, a gravação do módulo falharia. Com a fila no essencial, um módulo instalado sem a peça **degrada com elegância**: sem a peça avisos, não aparece o sino (o `OS.temPeca('avisos')` do `os-core.js` esconde o botão, e a montagem não pendura o `os-avisos.js`) e os avisos ficam guardados até a peça chegar; sem a peça email, os e-mails ficam na fila. Sem a peça produtos, o cartão do catálogo some do Início e da tela Usuários (o catálogo fica fora da venda de módulos, então não leva o aviso de "adquira").

**Quem usa o quê** foi levantado lendo o código de cada módulo (quem chama `hub.avisar`/`notificacoes`, `email_outbox`/`email-envio`, `suc_produtos`/`/produtos/`, `agendamentos`/`vendas_funis`) e é conferido sempre pelo `tools/manutencao/conferir-dependencias.py`, pelos `marcadores` de cada peça no `sistema.json`: usar uma peça sem declarar reprova.

**Versões:** a base tem uma versão (`versao` no `sistema.json`), que vale para todas as peças do pacote em que vieram; o mapa da instalação (`instalacao.json`) guarda a versão de cada peça. Mudança no banco da base depois da 1.0.0 vira um arquivo em `banco/atualizacoes/` (`<versão>-<peça>-<assunto>.sql`, que pode rodar mais de uma vez sem estragar nada; ver o [LEIA-ME](banco/atualizacoes/LEIA-ME.md)); o instalador roda sozinho as que faltam quando a base da pasta é mais nova que a do banco.

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| telas (HTML) | 16: `conta/index.html`, `entrar/index.html`, `index.html`, `instalar/index.html`, `modelo-pagina.html`, `novidades/index.html`, `primeiro-acesso/index.html`, `produtos/index.html`, `produtos/publico.html`, `supabase/templates/confirmar-cadastro.html`, `supabase/templates/convite.html`, `supabase/templates/link-magico.html`, `supabase/templates/mudar-email.html`, `supabase/templates/reautenticacao.html`, `supabase/templates/recuperar-senha.html`, `usuarios/index.html` |
| `supabase/functions/` | 7 Edge Functions (Deno): `admin-generate-link`, `admin-reset-password`, `admin-usuarios`, `app-convite`, `app-push`, `email-envio`, `primeiro-acesso` |
| `banco/` | `dados-iniciais.sql`, `estrutura.sql`: a estrutura do banco, **sem nenhum dado** |

### O catálogo de produtos (`/produtos/`), a peça `produtos`
O catálogo mora na base (é a peça **produtos**: vem com os módulos que o usam: Sucesso, Atendimento e CRM): a pasta `produtos/` vira `/produtos/` no site (e `produtos/publico.html`, a ficha que se compartilha com um parceiro, vira `/produto/`). Cada produto tem tipo, degrau na **escada de valor**, família, status, preço, a página pública e a **jornada de entrega** (as etapas que o time executa com cada cliente, guardadas numa coluna do produto). No banco: `hub.suc_produtos` e as tabelas e funções do catálogo (`banco/pecas/produtos.sql` → `banco/estrutura/11-produtos-catalogo.sql`), mais a lista simples `hub.produtos` usada por vendas.
- Quem **executa** a jornada (a fila da CS, publicar a jornada nos clientes, o produto vigente de cada cliente) é o **Sucesso**: renomear um produto e mover uma etapa de lugar só levam junto as fichas dos clientes quando ele está instalado.
- Acesso: a chave **`produtos`** na tela Usuários (sem marcação = liberado).
- O parceiro sobe arquivos pela página pública com uma rota serverless (`produtos/api/produto-share.js`, na Vercel: `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` nas variáveis de ambiente), no balde `produtos` do Supabase.

### O envio de e-mail, a peça `email`
Todos os módulos põem o e-mail numa fila só, `hub.email_outbox` (do essencial) (com o texto e, se houver, o `html` e os anexos). Quem **envia** é a Edge Function **`email-envio`** (pelo Resend):
```bash
supabase secrets set RESEND_API_KEY="<chave do Resend>" --project-ref SEU_PROJETO
supabase functions deploy email-envio --project-ref SEU_PROJETO --use-api
```
O remetente é o `FROM` no começo do `supabase/functions/email-envio/index.ts` (um domínio verificado no Resend). As telas chamam a função logo depois de pôr um e-mail na fila; pra fila andar sozinha (convites, avisos), agende uma chamada de 2 em 2 minutos com a chave de serviço (guarde a chave no cofre do Supabase, nunca no comando):
```sql
select cron.schedule('email-envio', '*/2 * * * *', $$
  select net.http_post(url := 'https://SEU_PROJETO.supabase.co/functions/v1/email-envio',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chave_servico')),
    body := '{}'::jsonb)
$$);
```
A função só aceita a chave de serviço ou gente do time logada.

### Os e-mails do login em português
O convite, a recuperação de senha, a troca de e-mail e o link de acesso são enviados pelo próprio **Supabase Auth**, e o padrão dele é em inglês ("You have been invited"). Os modelos em português estão em `supabase/templates/`:

| Arquivo | E-mail do Supabase | Assunto |
|---|---|---|
| `convite.html` | *Invite user* | Você foi convidado para o %EMPRESA_NOME% |
| `recuperar-senha.html` | *Reset password* | Crie uma nova senha · %EMPRESA_NOME% |
| `mudar-email.html` | *Change email address* | Confirme o seu novo e-mail · %EMPRESA_NOME% |
| `link-magico.html` | *Magic link* | Seu link de acesso · %EMPRESA_NOME% |
| `confirmar-cadastro.html` | *Confirm signup* | Confirme o seu e-mail · %EMPRESA_NOME% |
| `reautenticacao.html` | *Reauthentication* | Seu código de confirmação · %EMPRESA_NOME% |

**É automático:** a ferramenta `tools/instalar/emails-portugues.js` troca `%EMPRESA_NOME%` pelo nome do `empresa.json` e aplica os 6 modelos **e os assuntos** de uma vez (o `instalar.sh` oferece no fim da instalação):
- **No projeto hospedado**, pela Management API do Supabase (`PATCH /v1/projects/{ref}/config/auth`, campos `mailer_subjects_<tipo>` e `mailer_templates_<tipo>_content`):
  ```bash
  SUPABASE_ACCESS_TOKEN="<token>" node tools/instalar/emails-portugues.js --config empresa.json --projeto SEU_PROJETO
  ```
  O token é o *Personal access token* da conta (supabase.com → *Account → Access Tokens*). Ele é lido **só** da variável: nunca é gravado nem mostrado (pode apagá-lo depois). `--simular` mostra o pedido (o endereço e o JSON, com os modelos encurtados) sem mandar nada; `--salvar pedido.json` grava o JSON completo, sem o token.
- **No Supabase local** (`supabase start`): `node tools/instalar/emails-portugues.js --config empresa.json --local PASTA-DO-PROJETO-LOCAL` copia os modelos para `supabase/templates/` e liga cada um no `supabase/config.toml` (`[auth.email.template.<tipo>]`, com `subject` e `content_path`); vale depois de `supabase stop && supabase start`.
- **Alternativa, colando no painel:** `node tools/instalar/emails-portugues.js --config empresa.json --para PASTA` gera os 6 arquivos com o nome trocado e um `ASSUNTOS.txt`; no painel do Supabase → *Authentication → Emails* (*Email Templates*), em cada e-mail da tabela, cole o assunto e o conteúdo e salve.

O remetente desses e-mails é o do Supabase (no plano gratuito ele manda poucos por hora). Para valer, ligue um SMTP próprio em *Authentication → Emails → SMTP Settings* (pode ser o mesmo Resend do `email-envio`).

### Os baldes de arquivo (Storage)
Cada módulo cria, na instalação, os baldes que usa, no arquivo de baldes **dele** (`banco/estrutura/*-baldes.sql`), com a peça da base `hub.storage_balde_garante` (`banco/estrutura/14-baldes.sql`). A regra:
- **foto, capa e logo = PÚBLICO** (abre pelo link): `avatars` e `produtos` (base), `hub-logos` e `banner` (Início), `portal-banner` (Sucesso);
- **anexo, contrato, documento, mídia de conversa e histórico = PRIVADO**: a tela pede um link assinado de poucos minutos (`createSignedUrl`) ou uma Edge Function entrega o arquivo. São eles: `atendimentos`, `contratos`, `portal-anexos` e `boas-vindas` (Sucesso), `atendimento-midia` e `wpp-historico` (Atendimento), `pj-anexos` (Projetos), `rh-anexos` (RH), `processos-anexos` (Processos), `contratos` (Contratos), `calls-arquivos` (Calls) e `financeiro` (Metas).

Subir, trocar e apagar é de quem é do time (`hub.e_do_time()`) ou da regra do módulo; ler o privado também. Rodar a instalação de novo não duplica nada, e um balde privado que tenha nascido público volta a ser privado.

### Módulo que não veio (o aviso padrão)
Onde uma tela mostraria algo de um módulo que não está instalado, aparece no lugar um aviso só, igual em toda tela: *"Este espaço é do módulo X, que não veio nesta instalação. Você pode adquirir o módulo X ou adaptar este espaço para o seu próprio (assunto do módulo)."*. Quem faz é o `shared/os-core.js`:
- quadro (`iframe`) de outro módulo → o aviso no lugar;
- link, menu ou cartão do Início → fica à vista e, no clique, abre o aviso numa janela;
- ação que depende de outro módulo (ex.: mandar WhatsApp é do Atendimento) → `if (!OS.precisaModulo('atendimento')) return;` mostra o aviso;
- item marcado com `data-sistema="x"` (um botão solto, sem lugar pra mensagem) → some.
O catálogo de nomes (`MODULOS`, com o nome e o assunto de cada módulo, inclusive o Financeiro, vendido à parte) mora no mesmo arquivo. Para montar o aviso numa tela: `OS.moduloAusente('financeiro')` (o elemento), `OS.moduloAusenteHtml(...)` (o HTML) ou `OS.moduloAusenteJanela(...)`.

### Cores e fontes (o visual das telas)
As cores, as fontes, os raios e as peças comuns das telas moram em `shared/visual/`, e a direção visual se chama "Carvão e terracota". O `tokens.css` guarda as variáveis de cor e de fonte nos modos claro e escuro, o `componentes.css` guarda as peças com o prefixo `v-` (botão, campo, cartão, selo, aviso, abas, tabela e janela) e o `exemplo.html` mostra cada peça nos dois modos, no site em `/shared/visual/exemplo.html`. As telas da base e as do Grupos carregam os dois arquivos antes do próprio CSS e nunca escrevem cor: usam `var(--ink)`, `var(--surface)` e as outras variáveis. Para trocar as cores pelas da marca da empresa, mude os valores no `tokens.css` (o modo escuro aparece em dois blocos, e os dois mudam juntos), como explica o [`shared/visual/LEIA-ME.md`](shared/visual/LEIA-ME.md). Os outros módulos ainda têm o `tokens.css` e o `theme.css` na pasta `design-system/` de cada um.

### O Início
A porta de entrada (`index.html`) é só a casca; cada assunto mora num arquivo em `shared/launcher/`:
`sistemas.js` (o catálogo dos módulos por área e quem vê cada um; o que esta instalação não tem aparece como "não instalado" e abre o aviso, pelo `OS.instalado()`), `icones.js` (o desenho de cada sistema), `dock.js` (o Dock que cada pessoa monta e a troca de logos), `banner-editor.js` (as notícias do banner) e `inicio.js` (login, computador, celular, busca ⌘K e Dia/Noite).
- **Logo oficial de cada módulo:** quem administra sobe em *sua foto › Logos dos sistemas* (balde `hub-logos`, tabela `hub.hub_logos`). Sem logo, fica o desenho.
- **Consulta rápida** (área Operações): dados da empresa e links úteis, em `hub.consulta_rapida`. As linhas modelo nascem vazias pelo `banco/dados-iniciais.sql` e se preenchem na própria tela (quem administra). O grupo **restrito** (dados do sócio) só aparece pra quem tem a chave `dados_socio` (ou `diretoria`) marcada na tela Usuários, e quem tranca é a regra do banco.
- **Banner:** só quem administra publica (a regra `banner_write`); as artes vão pro balde `banner`.
- O Dock, os abertos por último e o Dia/Noite de cada pessoa ficam em `hub.user_prefs` (chaves `inicio:*`), nunca no navegador.

### A central de avisos
O sino de toda tela abre a mesma gaveta (`shared/os-avisos.js`, pendurada pela montagem em toda tela que carrega o `os-core.js`): **Pra você** (Atrasados · Pra hoje · Chegou pra você) separado das **Novidades**, que não contam no sino. Abrir leva pra uma **aba nova**. **Depois** tira o aviso da frente até amanhã às 9h (`hub.notificacoes.adiada_ate`) e ele volta sozinho, ainda não lido. O número do sino é contado no banco (contagem exata), sem as novidades e sem os adiados.

### Telas de cliente e telas dentro de quadro
Nas telas que o **cliente** abre (`cliente`, `briefing`, `agendar` e `time` do Sucesso) não aparecem a barra do app, o sino nem o ✦ do assistente (módulo Assistente), mesmo que alguém do time esteja logado no mesmo navegador (`OS.telaDoCliente()`). Tela aberta **dentro de outra** (iframe) também não repete ←, sino nem ✦ (`OS.dentroDeQuadro()`). No celular, a barra de baixo some enquanto uma janela está **visível** na tela (janela escondida não conta).

### O assistente de IA (o ✦) é um módulo
O assistente saiu da base e virou o módulo **Assistente** (`assistente/`): a Edge Function `agente`, o botão ✦ (`/assistente/os-agente.js`) e as tabelas e funções `hub.ag_*` das conversas, pastas, `/ensinar`, permissões e ferramentas. Sem o módulo instalado, o ✦ não aparece em lugar nenhum (o Início, o Dock e a barra do celular escondem o botão pelo `OS.instalado('assistente')`, e a montagem do site só pendura o `os-agente.js` quando ele está na lista).

Ficam na base, porque outros módulos usam: a **base de conhecimento** `hub.ag_conhecimento` (as respostas prontas de suporte de cada produto, do CRM; o assistente lê e grava nela pelo `/ensinar`), as funções `hub.ag_sem_acento` e `hub.ag_pode_ver` (a busca e a regra de leitura dela) e os papéis de banco só-leitura `hub_agente_leitor*` (cada módulo dá a eles o `SELECT` das próprias tabelas; quem os usa é a consulta livre do assistente).

### Primeiro acesso (o primeiro administrador)
Numa instalação nova ninguém precisa convidar ninguém pelo painel do Supabase nem rodar SQL:
1. defina a **chave de instalação**: `supabase secrets set PRIMEIRO_ACESSO_CHAVE="uma-frase-longa-que-só-você-sabe" --project-ref SEU_PROJETO`;
2. publique a função: `supabase functions deploy primeiro-acesso --project-ref SEU_PROJETO --no-verify-jwt` (é pública: quem chama ainda não tem login);
3. abra o site: enquanto não existe administrador, a porta de entrada leva sozinha para **`/primeiro-acesso/`**. Digite a chave, o nome da empresa, o seu nome, o e-mail e a senha. O administrador nasce, a empresa é criada e você já entra.

**Depois disso a tela se fecha pra sempre**: a função e o banco recusam (`hub.primeiro_acesso_concluir` só cria se não existe nenhum admin ativo), e a página passa a dizer que o sistema já tem administrador. Chave errada 10 vezes na mesma hora (ou 50 no total) bloqueia por uma hora; dois pedidos ao mesmo tempo criam um admin só. Os próximos usuários são convidados na Gestão de Usuários (`/usuarios/`).

`banco/dados-iniciais.sql` virou opcional: repõe as linhas modelo da Consulta rápida do Início (o primeiro acesso já põe) e, **só se a empresa ainda não tiver nenhuma área**, cria a estrutura de partida que os sistemas reconhecem pelo slug: 9 áreas (Comercial, Marketing, Sucesso do Cliente, Eventos, RH, Financeiro, Cobrança, Gestão de Projetos, Diretoria) e os cargos comuns (SDR, Social Seller, Inside Sales, Closer, Farmer, Gestor(a) Comercial, Tráfego, Social Media, Customer Success e outros). Renomeie à vontade: o que vale é o slug. Sem rodar, as telas abrem vazias e dizem onde cadastrar.

## Banco de dados

Aplicado **primeiro**, num projeto Supabase novo.

| Tabelas | Views | Funções | Regras de acesso (RLS) | Gatilhos |
|---|---|---|---|---|
| 41 | 5 | 111 | 63 | 15 |

**Precisa de:** só a base.

**Se liga com:** nenhum outro sistema.

Não há robôs agendados: a empresa cria os dela conforme a operação.

### Chaves de acesso restritas
Na tela Usuários, as chaves **restritas** só valem pra quem for marcado ali, uma a uma (nem o administrador geral ganha sozinho): `diretoria`, `pdp`, `dashboard_cs_time` (ver o Dashboard CS do time inteiro, no Sucesso) e `dados_socio` (o grupo restrito da Consulta rápida do Início).

## Integrações

O Web Push (notificação no celular) e o envio de e-mail (Resend, na `email-envio`). A IA do assistente é do módulo Assistente.

## Organização dos arquivos

O banco está em partes por fase em `banco/estrutura/` (funções → tabelas → índices → segurança → permissões → chaves → ligações); `banco/estrutura.sql` é o índice que inclui todas, na ordem, e `psql -f banco/estrutura.sql` instala tudo.
