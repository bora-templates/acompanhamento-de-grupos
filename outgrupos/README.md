# Acompanhamento de Grupos no WhatsApp com IA

A solução **acompanha os grupos de WhatsApp que a empresa escolher**: guarda as mensagens, transcreve os áudios e usa a IA para contar o que aconteceu num período, apontar o que ficou pendente e responder perguntas sobre cada grupo. O resumo pode ir para o próprio grupo, a pedido ou todo dia num horário escolhido. No menu do Hub ela aparece como **Grupos**, no endereço `/outgrupos/`.

> **Para instalar, use a tela de instalação** (README.md da raiz do pacote): ela cria o banco, publica as funções do servidor e configura tudo sozinha, pela Vercel. Os comandos de terminal deste README continuam valendo para quem prefere instalar à mão. Nesse caso, publique **as duas** funções com `--no-verify-jwt`: cada uma confere por dentro quem está chamando, e o portão de JWT antigo do Supabase recusa o login dos projetos novos.

- **Tudo se liga pela tela:** quem administra a solução informa o servidor da uazapi e o token da instância, escolhe a IA e o serviço de transcrição. Tokens e chaves vão para o cofre do Supabase (Vault) e nunca voltam para o navegador. Nenhuma variável de ambiente é obrigatória.
- **Escolher os grupos:** a solução lista os grupos do número conectado; os grupos marcados passam a ser acompanhados, e as mensagens dos últimos 7 dias que a uazapi já guardou entram em segundo plano.
- **A conversa de cada grupo** fica na tela da mais nova para a mais antiga, com busca por palavra, filtro por pessoa, a mensagem citada e o áudio com a transcrição, e a mensagem nova aparece na hora (tempo real do Supabase).
- **O resumo de um período** (últimas 24 horas, hoje, ontem, últimos 7 dias ou entre duas datas) traz o panorama, os assuntos resolvidos e em aberto, os combinados, as pendências com quem pediu e quando, os links, os arquivos, quem mais participou, o clima do grupo e números que a solução calcula sem IA.
- **Mandar o resumo para o grupo:** o texto sai pronto no formato do WhatsApp (até 3.500 caracteres), a pessoa edita se quiser e envia pela uazapi.
- **Perguntar à IA** sobre o grupo ("quem pediu o material ontem?"): a resposta cita quem disse e quando, e avisa quando a resposta não está nas mensagens.
- **Orientações e materiais de apoio por grupo**, que entram no resumo e nas respostas (a busca nos materiais é por palavras, no próprio banco).
- **O resumo automático** sai todo dia na hora escolhida e pode ir sozinho para o grupo.
- **O grupo de exemplo** é fictício e mostra tudo funcionando antes de ligar o WhatsApp.

> **Linguagem:** as telas de hoje são HTML com Alpine.js, mas **alteração, correção ou tela nova se faz em TypeScript** (Next.js + React, e NestJS quando precisar de servidor). HTML só quando for realmente necessário. As telas em HTML vão sendo trocadas aos poucos, uma por vez, nunca todas de uma vez.

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `index.html` + `index-partes/` + `outgrupos.css` + `img/` | a tela `/outgrupos/` (Grupos, o grupo com as abas Conversa, Resumos, Perguntar à IA, Orientações e materiais, Participantes e Ajustes do grupo, e os Ajustes da solução) |
| `supabase/functions/og-api/` | a Edge Function das telas e da agenda (Deno): as ações da tabela "As ações da og-api", abaixo |
| `supabase/functions/og-entrada/` | a Edge Function que a uazapi chama a cada mensagem (o webhook) |
| `supabase/functions/_shared/` | o que as duas usam: a trava de quem chama (`acesso.ts`), as travas de toda chamada para fora (`rede.ts`), o texto pronto para o banco (`texto.ts`), a uazapi (`uazapi.ts`), a IA com os quatro provedores (`ia.ts`), a transcrição (`transcricao.ts`), o resumo e a pergunta (`resumo.ts`), a configuração (`config.ts`) e o resto comum (`comum.ts`). Vai junto com cada função na publicação |
| `banco/` | `estrutura.sql` (o índice) + `estrutura/` (as partes): estrutura do banco, **sem nenhum dado de empresa** |

## Instalar

```bash
DATABASE_URL="<conexão do banco>" bash tools/instalar/instalar-banco.sh outgrupos            # numa base nova (a base vai junto)
DATABASE_URL="<conexão do banco>" bash tools/instalar/instalar-banco.sh --sem-base outgrupos # num banco que já tem a base e outros módulos
cd outgrupos && supabase functions deploy og-api --project-ref SEU_PROJETO --no-verify-jwt
supabase functions deploy og-entrada --project-ref SEU_PROJETO --no-verify-jwt
```

`--no-verify-jwt` porque a uazapi e a agenda do banco não mandam o login de ninguém. **A trava de cada porta é conferida dentro da função:** a `og-api` aceita uma pessoa logada e ativa no time com o acesso `grupos` (ou um robô com a chave de serviço), e a ação `agendado` só entra com o cabeçalho `x-og-agenda`; a `og-entrada` só aceita quem traz a chave da entrada no endereço. A chave publicável do site é recusada nas duas.

A instalação pela tela troca o texto `https://SEU_PROJETO.supabase.co` do SQL pelo endereço do projeto (é ali que a agenda chama a `og-api`). Instalando pelo `psql`, esse texto fica como está, e a agenda passa a funcionar quando quem administra salva os ajustes da IA: a `og-api` grava o endereço do projeto em `hub.og_ajustes.funcoes_url`, e a agenda usa esse.

Esta solução tem pacote próprio (`boraia-outgrupos`) e não entra no `boraia-hub-completo` (`"fora_do_completo": true` no `sistema.json`).

## Quem pode o quê

A chave do módulo em `hub.users.acessos` é **`grupos`**, e ela é **restrita**: sem a chave marcada na tela Usuários, a pessoa não tem acesso.

| Na tela Usuários | Valor gravado | O que a pessoa faz |
|---|---|---|
| Sem acesso (ou sem marcação) | `false` ou ausente | nada: a solução não abre |
| Só visualizar | `'view'` | vê grupos, conversa, resumos, participantes e materiais, e pergunta à IA |
| Editar | `true` | também faz e manda resumos, escreve orientações, cuida dos materiais, atualiza os participantes, liga o resumo automático e carrega ou apaga o grupo de exemplo |
| Admin do sistema | `'admin'` | também liga a IA, a transcrição e o WhatsApp, escolhe os grupos, pausa, retoma e deixa de acompanhar |

A chave vale para todos, inclusive para o admin geral do Hub (`access_level = 'admin'`): sem a chave marcada, nem ele entra, do mesmo jeito que a tela Usuários e a trava das telas já mostram. O convidado vê no máximo, mesmo com a chave marcada como admin. Pessoa inativa não tem acesso. Quem decide é o banco: `hub.og_acesso_de(pessoa)` devolve `nenhum`, `ver`, `editar` ou `admin`, e as funções `hub.og_pode_ver()`, `hub.og_pode_administrar()` e `hub.og_pode_configurar()` são as que as telas, as regras de leitura e a `og-api` usam. O painel da primeira tela (`hub.og_painel()`) devolve `pode_administrar` e `pode_configurar`.

## Ajustes feitos pela tela

Tudo fica em **Ajustes** (só quem administra). Os ajustes sem segredo ficam em `hub.og_ajustes` (uma linha só, que só a chave de serviço lê); tokens e chaves ficam no cofre do Supabase, com estes nomes e nenhum outro:

| Segredo no cofre | O que é | Quem cria |
|---|---|---|
| `og_whatsapp_token` | o token da instância da uazapi | a pessoa, em Ajustes › WhatsApp |
| `og_ia_chave` | a chave da IA | a pessoa, em Ajustes › IA |
| `og_transcricao_chave` | a chave do serviço de transcrição | a pessoa, em Ajustes › Transcrição de áudio |
| `og_chave_entrada` | a chave que vai no endereço do webhook | a instalação (64 caracteres aleatórios) |
| `og_chave_agenda` | a chave do cabeçalho `x-og-agenda` da agenda | a instalação (64 caracteres aleatórios) |

- **IA:** OpenAI, Claude, DeepSeek ou Compatível (qualquer serviço no formato `/chat/completions`, como OpenRouter, Groq, Mistral e Ollama), o modelo (o Claude usa `claude-sonnet-5-5` e o DeepSeek usa `deepseek-v4-flash` quando o campo fica vazio), o endereço do compatível (endereço público em `https://`, terminando em `/v1`, sem `?` nem `#`, porque a chave tem campo próprio) e a chave. A chave salva só vale para o provedor e o endereço em que foi salva: trocar um deles pede a chave de novo (a `og-api` responde `precisa_chave`). O botão **Testar a IA** faz um pedido curto. Sem nada salvo, valem as variáveis `IA_PROVEDOR`, `IA_CHAVE`, `IA_MODELO` e `IA_URL` da Edge Function (as mesmas do assistente do Hub). `IA_ESFORCO` muda o esforço do Claude, que aqui começa em `low` para o resumo caber no prazo.
- **Transcrição de áudio:** Groq (`whisper-large-v3`) ou OpenAI (`whisper-1`), em português, com a chave. Quando a IA também é da OpenAI, dá para usar a mesma chave. Sem transcrição ligada, o áudio fica guardado sem texto e a tela avisa.
- **WhatsApp:** o endereço do servidor da uazapi (endereço público em `https://`, sem usuário e senha, sem `?` nem `#`) e o token da instância. **Salvar e conectar** confere o estado da instância, lê para onde ela já manda as mensagens, cadastra o endereço da `og-entrada` e só então grava o servidor e o token. O token salvo só vale para o servidor salvo: trocar o servidor pede o token de novo (a `og-api` responde `precisa_token`). Quando algo falha, `whatsapp_erro` guarda a frase da solução, nunca o texto que a uazapi devolveu, e só quem configura a solução vê o servidor, o endereço da IA e esse erro. Se a instância já manda as mensagens para outro endereço, a tela pede confirmação antes de trocar (a uazapi guarda um webhook por instância, e o cadastro troca o que existia). Com o número desconectado, a tela mostra o QR e atualiza a cada 20 segundos; com o número já conectado, conecta direto, sem QR.

## O endereço que recebe as mensagens

```
https://SEU_PROJETO.supabase.co/functions/v1/og-entrada?chave=<og_chave_entrada>
```

A `og-api` cadastra esse endereço sozinha na uazapi (`POST /webhook`, evento `messages`, sem as mensagens enviadas pela própria API e sem conversas individuais, e com `addUrlEvents` desligado para a chave não se perder no fim do endereço). A `og-entrada`:

- só aceita POST com `?chave=` igual à `og_chave_entrada` do cofre (o SHA-256 das duas comparado com `timingSafeEqual`); sem a chave certa, responde 401 e não grava nada;
- com a chave certa, responde 200 sempre, sem esperar a transcrição, inclusive quando descarta (a uazapi não precisa tentar de novo);
- descarta o que não é mensagem de grupo, grupo que não é acompanhado ou está pausado, reação, enquete, voto, edição e mensagem apagada;
- grava o texto como chegou, só sem o que o Postgres recusa (o caractere nulo e a metade solta de um emoji) e cortado sem partir emoji (a tela escapa o HTML na hora de mostrar), e a mesma mensagem que chega duas vezes entra uma vez;
- grava o áudio como `pendente` e transcreve em segundo plano (`EdgeRuntime.waitUntil`): pede à uazapi o link do arquivo (`/message/download`, com 60 segundos e uma nova tentativa), baixa só de endereço `https://` público e até 25 MB (sem link aceitável, pede o áudio em base64) e manda para o Whisper. A resposta 429 do Whisper respeita o `retry-after`.

**Trocar a chave da entrada** (por exemplo, se o endereço vazou): apague o segredo `og_chave_entrada` no cofre (painel do Supabase › Vault) e clique de novo em **Salvar e conectar** em Ajustes › WhatsApp. A solução cria outra chave e cadastra o endereço novo na uazapi.

## O resumo

A solução separa as mensagens do período (no horário de Brasília) e calcula sem IA: quantas mensagens, quantas pessoas escreveram, o horário de mais movimento, o tempo médio até alguém do time responder (o número conectado ou um administrador do grupo, contando só as respostas em até 24 horas), os links, os arquivos e quem mais participou. A IA recebe as orientações do grupo, os trechos dos materiais que combinam com as palavras mais frequentes do período (até 6 mil caracteres) e as mensagens no formato `[dd/mm hh:mm] Nome: texto` (até 120 mil caracteres; passando disso, entram as mais recentes e o resumo avisa quantas ficaram de fora). O nome vai limpo (sem parênteses, colchetes e a palavra "time" entre eles), e quem é do time ganha a marca `[time]` depois do nome, que só o código põe. A IA devolve só um JSON (panorama, até 6 assuntos de no máximo duas frases cada, combinados, pendências e clima), com no máximo 6 mil tokens, e a solução confere o JSON antes de guardar: situação desconhecida vira "em aberto", clima desconhecido vira "atenção" e o item inválido sai da lista. A primeira chamada tem 90 segundos. Resposta fora do formato ganha uma nova tentativa, com o que sobra de 140 segundos; se falhar de novo, a tela mostra um erro claro e nada é guardado. Os resumos ficam em `hub.og_resumos`, por grupo, e podem ser refeitos.

O texto para o WhatsApp sai montado pela solução, com uma linha em itálico que diz que a IA fez o resumo a partir das mensagens do grupo, o nome do grupo e o período no começo, as seções O que aconteceu, Assuntos, Combinados, Ficou em aberto e Links, e no máximo 3.500 caracteres. No que a IA escreveu, todo link e tudo o que parece chave de pagamento (CPF, CNPJ, e-mail, telefone e chave aleatória do Pix) vira "[link removido]", e a seção Links leva só os links que o time mandou (o número conectado e os administradores do grupo). Nas pendências, o nome de quem pediu só aparece quando a pessoa está no grupo. O grupo de exemplo nunca recebe mensagens.

O envio sai uma vez: mandar de novo o mesmo resumo devolve `ja_enviado` com a data, a não ser que venha `reenviar`, e dois cliques ao mesmo tempo não mandam duas vezes. A uazapi ganha até 3 novas tentativas quando responde 429 ou 5xx. Quando o WhatsApp não confirma a tempo (60 segundos), a resposta traz `sem_confirmacao` e o resumo não fica marcado como enviado, porque a mensagem pode ter saído: confira o grupo antes de mandar de novo.

## Resumo automático (pg_cron e pg_net)

A instalação liga no `pg_cron` a tarefa **`og-resumos-automaticos`**, a cada 15 minutos. Ela roda `hub.og_agenda_disparar()`, que chama a `og-api` pelo `pg_net` com `{"acao":"agendado"}` e o cabeçalho `x-og-agenda`, lido do cofre na hora (a chave nunca fica escrita no comando da tarefa). A `og-api` responde na hora (202) e trabalha em segundo plano:

- para cada grupo ativo com o resumo automático ligado, cuja hora chegou (horário de Brasília) e que ainda não teve resumo automático hoje: se o período teve mensagem, faz o resumo de **hoje** (com a hora 0, o de **ontem**) e, com "enviar sozinho ao grupo" ligado, manda para o grupo; até 4 grupos por rodada, e os outros ficam para a rodada seguinte. Se o resumo falhar, o grupo volta para a fila e a agenda tenta de novo na rodada seguinte, até 3 vezes no dia;
- transcreve os áudios que ficaram para trás há mais de 10 minutos e tenta de novo os que falharam há menos de 24 horas, no máximo 3 vezes;
- apaga do registro de falhas o que tem mais de 30 dias.

Ao ligar o resumo automático ou mudar a hora dele, se a hora de hoje já passou, o primeiro resumo sai amanhã; o `og_grupo_salvar` devolve `proximo_auto` com o horário do próximo.

Banco sem `pg_cron` ou sem `pg_net`: a instalação segue normalmente, o resumo automático fica desligado e o painel mostra `agenda_pronta: false`. Para conferir a tarefa, no SQL do Supabase:

```sql
select jobname, schedule, command from cron.job where jobname = 'og-resumos-automaticos';
```

## A importação dos últimos 7 dias

A lista para escolher os grupos vem leve (`/group/list` sem os participantes). Quando quem administra escolhe um grupo novo, a solução cria o grupo e responde na hora. Em segundo plano, ela traz os participantes desse grupo (`/group/info`) e as mensagens dos últimos 7 dias que a uazapi já guardou (`POST /message/find`, de 100 em 100, pelo `nextOffset` enquanto houver `hasMore`, ou página cheia sem `hasMore`, e a mensagem mais antiga da página estiver dentro dos 7 dias), até 1.000 mensagens por grupo. A página que passa de 5 MB vem de novo, com 20 mensagens. A leitura é a mesma da `og-entrada`, e a mensagem repetida entra uma vez. Se o lote inteiro falhar no banco, as mensagens entram uma por vez, e a recusada fica de fora. Os 30 áudios mais recentes entram na fila da transcrição; os outros ficam como `nao_transcrito` ("Áudio sem transcrição" na tela). Enquanto a importação corre, o grupo aparece com o selo "importando" (que some sozinho depois de 15 minutos, se a função parar no meio).

No fim, o grupo guarda `importadas` (quantas mensagens entraram) e, quando a importação parou no meio, `importacao_erro`, com a frase da solução que explica (nunca o texto da uazapi). A ação `reimportar` roda a mesma importação de novo para um grupo já acompanhado. Erro na importação não desfaz o acompanhamento: vira uma linha em `hub.og_registro` e o grupo fica com o que deu para trazer. O registro também anota quando a primeira página do histórico não chega aos últimos 7 dias.

## O grupo de exemplo

Em **Ver com um grupo de exemplo** (quem edita), a solução cria o grupo "Clientes da Contorno Estética (exemplo)": uma clínica fictícia de Sorocaba, com a equipe (Paula Andrade, Nina, Otávio e Camila), 8 clientes com telefones fictícios, 71 mensagens nas últimas 30 horas (dúvidas de horário, remarcação, pedido de desconto, uma reclamação de atraso sem resposta, um pedido de material pendente, um link, um contrato, áudios já transcritos, a decisão de abrir aos sábados e elogios), orientações para a IA e um material com as regras e os preços. Dá para fazer resumos e perguntas sobre ele antes de ligar o WhatsApp. Ele fica marcado como exemplo, nunca recebe mensagens e sai com o botão de apagar. Carregar de novo recria o exemplo do zero.

## As ações da og-api

POST com `{ acao }` e os campos da ação, com até 64 KB (o corpo maior é recusado antes de ser lido). A resposta é sempre JSON: `{ ok: true }` com os campos da ação, ou `{ ok: false, erro: "frase em português" }`. Erro de regra, da IA ou da uazapi volta com HTTP 200 e `ok: false`; pedido incompleto (inclusive `precisa_token` e `precisa_chave`) volta 400, sem login 401 e sem o nível de acesso 403.

| Ação | Quem | O que faz |
|---|---|---|
| `ajustes_ia` | admin | provedor, modelo, endereço e chave da IA (`precisa_chave` quando troca o provedor ou o endereço sem a chave); grava o endereço do projeto e confere a agenda |
| `testar_ia` | admin | um pedido curto à IA configurada |
| `ajustes_transcricao` | admin | Groq ou OpenAI, a chave ou a mesma chave da IA |
| `whatsapp_salvar` | admin | servidor e token (`precisa_token` quando troca o servidor sem o token), o webhook (com `precisa_confirmar` quando há outro endereço), o estado e o QR |
| `whatsapp_estado` | admin | o estado da instância e o QR |
| `whatsapp_grupos` | admin | os grupos do número na uazapi, com "acompanhando" |
| `whatsapp_acompanhar` | admin | acompanha os grupos marcados e começa a importação (`importando`) |
| `participantes` | editar | atualiza os participantes pela uazapi (a lista vazia não apaga a que existe) |
| `reimportar` | editar | traz de novo as mensagens recentes de um grupo acompanhado, em segundo plano (`importando`) |
| `resumo` | editar | o resumo de um período |
| `enviar` | editar | manda o resumo (ou o texto editado) ao grupo, uma vez (`ja_enviado` com `enviado_em`; `reenviar` manda de novo; `sem_confirmacao` quando o WhatsApp não confirma a tempo) |
| `perguntar` | ver | a pergunta à IA sobre o grupo, guardada para quem perguntou (até 30 por pessoa por hora) |
| `agendado` | só a agenda | os resumos automáticos |

Toda chamada para fora passa pelas mesmas travas (`_shared/rede.ts`): só `https://` e endereço público (localhost, nome interno, IP de rede privada, loopback e link-local são recusados antes de conectar), sem seguir redirecionamento (a resposta 3xx é erro, então o token nunca segue para outro endereço), com tempo limite (uazapi 15 segundos, ou 60 para a lista de grupos, o histórico, o download do áudio e o envio; IA 90 segundos) e com teto de leitura (uazapi 5 MB, IA 2 MB, áudio 25 MB). Resposta cortada ou que passa do teto é erro da chamada. Falha da uazapi, da IA, da importação ou da agenda vira uma linha em `hub.og_registro`, sem token e sem texto de mensagem.

## Custo e limites

Cada resumo é uma chamada paga à IA (duas, quando a primeira resposta vem fora do formato), cada pergunta é uma chamada, e cada resumo automático também. Cada áudio transcrito é uma chamada paga ao serviço de transcrição. Os limites: pergunta até 1.000 caracteres e 30 perguntas por pessoa por hora; período entre datas de no máximo 31 dias; texto para o WhatsApp até 3.500 caracteres na montagem e até 6 mil depois de editado; orientações até 4 mil caracteres; materiais até 60 mil caracteres cada, 50 por grupo.

## Como testar

1. **Sem WhatsApp:** em Ajustes › IA, salve o provedor e a chave e clique em **Testar a IA**. Na primeira tela, clique em **Ver com um grupo de exemplo**, abra o grupo e confira a conversa. Em Resumos, escolha "Últimas 24 horas" e clique em **Fazer o resumo**: devem aparecer a reclamação de atraso e a lista de cuidados como pendências e a abertura aos sábados como combinado. Em Perguntar à IA, pergunte "Quem pediu a lista de cuidados da criolipólise?". **Mandar para o grupo** no exemplo deve responder que o grupo de exemplo não recebe mensagens.
2. **Com WhatsApp:** em Ajustes › WhatsApp, informe o servidor e o token e clique em **Salvar e conectar** (leia o QR se o número estiver desconectado). Em **Escolher grupos**, marque um grupo e clique em **Acompanhar**: o selo "importando" aparece e as mensagens dos últimos 7 dias chegam. Mande uma mensagem de texto e um áudio no grupo pelo celular: a mensagem aparece na conversa na hora, e o áudio ganha a transcrição em alguns segundos. Faça um resumo e mande para o grupo.
3. **Resumo automático:** em Ajustes do grupo, ligue o resumo automático com a próxima hora cheia (com a hora de agora, que já começou, o primeiro sai amanhã). Até 15 minutos depois dessa hora, o resumo de hoje aparece na lista com a origem automática.
4. **Quando algo falha:** a tela mostra a frase do erro, e o detalhe fica em `hub.og_registro` (só a chave de serviço lê; no SQL do Supabase: `select origem, mensagem, detalhe, criado_em from hub.og_registro order by criado_em desc limit 20;`).

Os testes automáticos (o banco num Postgres local, a leitura da uazapi, o resumo e as duas funções de ponta a ponta com a internet imitada) ficam na fábrica da Bora e não vêm no pacote.

## O que vem no pacote deste módulo

O pacote **`boraia-outgrupos`** (um link por módulo) traz só o que o Acompanhamento de Grupos usa:

- **a pasta do módulo** (`outgrupos/`, versão 1.0.0), que pede a base 1.1.0 ou mais nova;
- **da base, só esta peça:** **essencial** (Essencial);
- **as ferramentas de instalar** (`tools/instalar/`): instalar do zero ou **acrescentar** a uma instalação que já existe, sem duplicar a base;
- o `COMECE-AQUI.md` (escrito para o Claude de quem instala), o `pacote.json` (o que veio, com as versões) e o `LICENSE`.

## Banco de dados

| Tabelas | Funções | Regras de acesso (RLS) | Cofre | Agenda |
|---|---|---|---|---|
| 8 (`og_ajustes`, `og_grupos`, `og_participantes`, `og_mensagens`, `og_resumos`, `og_materiais`, `og_perguntas`, `og_registro`) | 65 (`hub.og_*`) | 6 regras de leitura | 5 segredos (`og_*`) | 1 tarefa no `pg_cron` |

- **RLS ligada em todas.** Leitura pela tela: o piso `hub.e_do_time()` mais o acesso `grupos` (`hub.og_pode_ver()`); nas perguntas, cada pessoa lê só as próprias. `og_ajustes` e `og_registro` não têm leitura para a tela: só a chave de serviço lê. **Nenhuma regra de escrita**: quem grava são as funções (security definer) e as Edge Functions.
- **Funções fechadas de `public`, `anon` e `authenticated`** na mesma transação em que nascem, e liberadas por nome: as 16 da tela (`og_painel`, `og_grupo`, `og_mensagens`, `og_autores`, `og_resumos`, `og_resumo`, `og_perguntas`, `og_participantes`, `og_materiais`, `og_grupo_salvar`, `og_grupo_remover`, `og_resumo_texto_salvar`, `og_material_salvar`, `og_material_apagar`, `og_exemplo_carregar` e `og_exemplo_apagar`) para `authenticated`, cada uma conferindo o nível da pessoa por dentro; as do cofre, da entrada, do resumo, do envio, da importação e da agenda só para `service_role`.
- Os papéis da consulta livre do assistente do Hub (`hub_agente_leitor` e os irmãos) não têm acesso a nenhuma das 8 tabelas.
- `hub.og_mensagens` está na publicação `supabase_realtime`, com a mesma regra de leitura.
- Cada parte de `banco/estrutura/` começa com `SET check_function_bodies = false;`, então dá para colar as partes na ordem no painel do Supabase, cada uma numa sessão nova.
- O `90-ligacoes.sql` roda de novo no fim de toda instalação: ele garante as duas chaves que a solução cria no cofre e a tarefa da agenda.

**Precisa de:** só a base (peça essencial). As extensões `pg_cron` e `pg_net` (ligadas pela base) servem só para o resumo automático.

**Se liga com:** nenhum outro módulo.

## Integrações

A solução usa a uazapi (o WhatsApp do número conectado), a IA (qualquer uma das quatro formas acima) e o serviço de transcrição (Groq ou OpenAI, opcional), e nenhuma outra integração.
