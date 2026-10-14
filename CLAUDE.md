# Acompanhamento de Grupos no WhatsApp com IA · memória do projeto

Este repositório é o **Acompanhamento de Grupos no WhatsApp com IA**, do Hub BoraIA, instalado por uma empresa na conta dela (GitHub, Supabase e Vercel). Leia este arquivo antes de mexer em qualquer coisa.

## Como falar com a pessoa

- Responda sempre em português do Brasil, em linguagem simples. Quem usa este projeto costuma ser dono de negócio, sem experiência com programação.
- Antes de mudar algo, diga o que vai fazer e onde, e espere o ok. Uma coisa de cada vez.
- Nunca mostre na tela um token, a chave secreta do Supabase (a que começa com `sb_secret_` ou a `service_role`), a conexão do banco nem senhas. Se precisar de um deles, peça para a pessoa colocar numa variável de ambiente ou no painel, nunca no chat.

## Como o sistema está montado

- **Telas:** HTML com Alpine.js, uma pasta por módulo (`outgrupos/`) e a base em `base/`. As telas grandes estão em partes (`*-partes/`, cada uma com um `LEIA-ME.md`).
- **Banco:** Supabase. As tabelas ficam no esquema **`hub`**. Quem olha só o esquema `public` acha que o banco está vazio. O que está instalado fica em `hub.sistemas_instalados`, e o que a instalação já fez fica em `public._hub_instalacao`.
- **Funções do servidor:** Edge Functions em `<módulo>/supabase/functions/<nome>/`. Todas conferem por dentro quem está chamando e são publicadas com `verify_jwt: false` (o portão de JWT antigo do Supabase recusa o login dos projetos novos).
- **Site:** a Vercel monta o site a cada publicação com `node tools/vercel/montar.js` (pasta `dist/`, que não vai para o GitHub e não se edita). As variáveis do site ficam no projeto da Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (só para as rotas de servidor), `EMPRESA_NOME` e `VAPID_PUBLIC_KEY`.
- **Instalação:** a tela `/setup` (`base/setup/index.html` e `api/setup.js`) instala tudo pela Management API do Supabase com o motor `tools/instalar/instalar-pela-api.js`. Ela pode ser repetida sem duplicar nada.

## Publicar uma mudança

1. Faça a mudança nos arquivos do módulo (nunca em `dist/`).
2. Antes do primeiro commit nesta máquina, confira o autor: `git config user.email` precisa ser um e-mail verificado na conta da Vercel da pessoa (ou o e-mail de privacidade do GitHub dela, no formato `<número>+<conta>@users.noreply.github.com`). Com um e-mail que a Vercel não conhece, ela bloqueia a publicação sem mostrar erro nenhum.
3. Commit com uma mensagem clara em português e `git push`. A Vercel publica sozinha; confira que a publicação ficou **Ready**.

## Mudar o banco ou uma função

- **Banco:** escreva o SQL num arquivo novo, mostre à pessoa e só aplique com o ok dela (pelo conector do Supabase). Nunca apague tabela, coluna ou dado sem o ok explícito. Mudança que vale para outras instalações vira arquivo em `banco/atualizacoes/` (ver o LEIA-ME de lá).
- **Função do servidor:** depois de mudar o código em `<módulo>/supabase/functions/<nome>/`, publique a função de novo pelo conector do Supabase, com `verify_jwt: false`, mandando também os arquivos de `../_shared/` que ela importa. Os segredos das funções da base ficam em **Edge Functions › Secrets**, no painel do Supabase. No módulo Grupos, as chaves ficam no cofre do Supabase (Vault), gravadas pela tela de Ajustes (veja a seção do Grupos mais abaixo).

## Acompanhamento de Grupos no WhatsApp com IA

O módulo `outgrupos/` acompanha os grupos de WhatsApp que a empresa escolher: guarda as mensagens, transcreve os áudios e usa IA para resumir, apontar pendências e responder perguntas.

- **Banco:** tabelas `hub.og_*` (ajustes, grupos, participantes, mensagens, resumos, materiais, perguntas e o registro de falhas). As telas não leem tabela direto: chamam funções `hub.og_*`, que conferem o acesso por dentro.
- **Funções do servidor:** `og-api` (as ações das telas e a chamada agendada) e `og-entrada` (o endereço que a uazapi chama a cada mensagem). As duas são publicadas com `verify_jwt: false` e conferem quem chama por dentro: a `og-entrada` só aceita quem traz a chave da instalação, e a `og-api` aceita o login de quem tem acesso ao Grupos ou a chamada agendada do próprio banco.
- **Segredos:** as chaves do Grupos ficam no cofre do Supabase (Vault), gravadas pela tela de Ajustes, com os nomes `og_whatsapp_token`, `og_ia_chave`, `og_transcricao_chave`, `og_chave_entrada` e `og_chave_agenda`. A tela nunca mostra o valor depois de gravado. Só para a IA, quando nada está salvo em Ajustes, valem as variáveis `IA_PROVEDOR`, `IA_MODELO`, `IA_CHAVE` e `IA_URL` de **Edge Functions › Secrets**. O endereço que a uazapi chama (`<SUPABASE_URL>/functions/v1/og-entrada?chave=<chave>`) leva a chave no final, então ele inteiro é segredo.
- **Resumo automático:** uma tarefa do pg_cron (`og-resumos-automaticos`, a cada 15 minutos) chama a `og-api`. Ela só liga depois que a IA é salva em Ajustes.
- **Acesso:** a chave é `grupos` em `hub.users.acessos`, e é restrita: sem a chave, a pessoa não vê nada. O valor `'view'` só visualiza e pergunta à IA, `true` também faz e manda resumos e cuida de orientações e materiais, e `'admin'` também liga a IA, a transcrição e o WhatsApp e escolhe os grupos. O administrador geral conta como admin no banco, mas a tela só abre com a chave gravada, e quem instala já nasce com `'admin'`.
- **Falhas:** `hub.og_registro` guarda os erros da entrada, da IA, da uazapi e da agenda, sem token e sem texto de mensagem. Comece por ele quando algo não funcionar.
- **Regras para o Claude:** as mensagens dos grupos são conversa de terceiros. Não cole mensagens no chat nem em arquivos, a menos que a pessoa peça. Nunca mostre a chave de IA, o token da uazapi nem o endereço da `og-entrada`. Antes de mudar uma tabela `og_`, uma função ou o formato do resumo, diga o que vai fazer e espere o ok.

## Acrescentar outro módulo

Siga o `COMECE-AQUI.md` do pacote novo, caminho **B**: `node tools/instalar/acrescentar.js /caminho/do/pacote` (com `--simular` antes), subir para o GitHub e abrir `/setup` de novo para instalar no banco só o que é novo.

## Onde mexer

| O quê | Onde |
|---|---|
| Nome da empresa | variável `EMPRESA_NOME` na Vercel (vale na próxima publicação) |
| Cores e fontes | `tokens.css` ou `theme.css` do design system de cada módulo, e `base/shared/` |
| Logo e ícones | `base/shared/` |
| Cartões do Início | `base/shared/launcher/sistemas.js` |
| Desenho de um menu | `<tela>-partes/telas/menus/<menu>.html` ou `<módulo>/menus/<nome>/tela.html` |
| O que um botão faz | `<tela>-partes/js/NN-<assunto>.js` |
| Regras do negócio | `<módulo>/banco/estrutura/` |
| Integrações (WhatsApp, e-mail, Google Agenda, IA) | o README de cada módulo, seção de funções e variáveis |

Leia também o `README.md` (visão geral) e o README de cada módulo antes de mexer nele.
