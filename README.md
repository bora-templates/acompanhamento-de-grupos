# Acompanhamento de Grupos no WhatsApp com IA

Acompanha os grupos de WhatsApp que a empresa escolher: guarda as mensagens, transcreve os áudios e usa a IA para contar o que aconteceu em cada período, apontar o que ficou pendente e responder perguntas sobre cada grupo. O resumo pode ir para o próprio grupo, a pedido ou todo dia num horário escolhido. Funciona com Claude, DeepSeek, OpenAI ou qualquer IA compatível.

O código é seu: ele fica na sua conta do GitHub, o banco fica no seu Supabase e o site fica na sua Vercel. Você instala, personaliza e muda o que quiser, com a ajuda do Claude.

| Módulo | Versão | O que faz |
|---|---|---|
| **Acompanhamento de Grupos no WhatsApp com IA** | 1.0.0 | Acompanha os grupos de WhatsApp que a empresa escolher: guarda as mensagens, transcreve os áudios e usa a IA para contar o que aconteceu em cada período, apontar o que ficou pendente e responder perguntas sobre cada grupo. O resumo pode ir para o próprio grupo, a pedido ou todo dia num horário escolhido. Funciona com Claude, DeepSeek, OpenAI ou qualquer IA compatível. |

Junto vem a **base**, que todo módulo usa (login, pessoas e acessos, a porta de entrada), só com as peças que este módulo usa:

| Peça da base | O que é |
|---|---|
| `essencial` | Essencial (login, pessoas e acessos, Início, avisos gravados) |

## O que você precisa ter

Separe estas coisas antes de começar:

- Uma conta no **GitHub**, uma no **Supabase** e uma na **Vercel**, todas no plano gratuito. No Supabase, crie o projeto na região **South America (São Paulo)**.
- Uma **instância da uazapi** com o número de WhatsApp que está nos grupos. Você vai informar o endereço do servidor e o token dessa instância.
- Uma **chave de IA** da OpenAI, da Anthropic (Claude), da DeepSeek ou de um serviço compatível com o formato da OpenAI. Para transcrever áudio, use uma chave da OpenAI ou da Groq.

O guia mostra como criar as contas. A instância da uazapi e a chave de IA entram no sistema depois da instalação, na tela de ajustes.

## Colocar no ar, sem terminal

O caminho é o mesmo da Plataforma Comercial com IA. O passo a passo com cada clique está no guia: https://boraia.ai/guia-instalacao-grupos

1. **Copie o código para a sua conta.** No GitHub, abra este repositório, clique em **Use this template** e depois em **Create a new repository**. Deixe a sua conta em Owner e marque **Private**.
2. **Crie o banco.** No Supabase, crie um projeto novo na região **South America (São Paulo)** e guarde a senha do banco.
3. **Publique o site.** Na Vercel, importe o repositório que você acabou de criar e clique em **Deploy**, sem mudar nada. O site sobe em modo de instalação, de propósito.
4. **Abra o site.** Ele leva sozinho para a tela de instalação (`/setup`). Cole o endereço do projeto do Supabase (Project URL), um token do Supabase com acesso total ao projeto e um token da Vercel com acesso a todos os projetos (All Projects). Preencha o nome da empresa e o seu nome, e-mail e senha.
5. **Clique em Instalar** e espere alguns minutos com a aba aberta. A tela cria as tabelas e as regras do banco, publica as funções do servidor, fecha o cadastro aberto, põe os e-mails do login em português, cria você como administrador, grava a configuração do site na Vercel e publica o site de novo, já ligado ao banco.
6. **Entre** com o e-mail e a senha que você criou. As próximas pessoas você convida no cartão **Usuários** do Início (`/usuarios/`).

Se a instalação parar no meio (internet, tempo esgotado), clique em **Tentar de novo**: ela continua do ponto em que parou e não duplica nada.

**O Acompanhamento de Grupos no WhatsApp com IA tem mais passos depois de instalar.** Ele só começa a trabalhar quando a IA e o WhatsApp estão ligados. Entre no sistema, abra **Grupos** e clique em **Ajustes**:

1. Ligue a **IA**: escolha o provedor e o modelo, cole a chave e clique em **Salvar** e depois em **Testar a IA**.
2. Ligue a **Transcrição de áudio**: escolha Groq ou OpenAI e cole a chave (se a IA for a OpenAI, marque **Usar a mesma chave da IA**).
3. Ligue o **WhatsApp pela uazapi**: informe o endereço do servidor e o token da instância, clique em **Salvar e conectar** e leia o QR com o celular.
4. Volte em **Grupos**, clique em **Escolher grupos** e marque os que você quer acompanhar.

Para ver tudo funcionando antes de ligar o WhatsApp, carregue o **grupo de exemplo** (uma conversa fictícia de clínica de estética) e apague quando terminar.

Quem instala já recebe o acesso de admin ao Grupos. As outras pessoas você libera em `/usuarios/`, no bloco **Acesso restrito**, como **Só visualizar**, **Editar** ou **Admin do sistema**. Essas etapas também estão no guia, com cada clique.

## Levar o código para o Claude

Daqui em diante, as mudanças você pede ao Claude, no aplicativo do computador.

1. No aplicativo do Claude, abra **Configurações › Conectores**, procure **Integração com o GitHub**, clique em **Vincular** e depois em **Instalar no GitHub**, com todos os repositórios. As duas linhas ficam com o sinal verde.
2. No GitHub, abra o **seu** repositório (o que você criou no passo 1), clique no botão verde **Code** e copie o endereço.
3. No Claude, clique em **Code** e em **Novo**, escolha **Abrir pasta** e crie uma pasta nova em Documentos com o nome do repositório.
4. Mande: *"Clona esse repositório para a gente trabalhar"* e cole o endereço na mesma mensagem. Se ele pedir para instalar o Git ou fazer o login do GitHub no computador, responda *"instala essas coisas pra mim"* e siga o login que ele mostrar.
5. Ligue os conectores da **Vercel** e do **Supabase** no Claude e mande: *"O sistema já está no ar. Eu utilizei a Vercel e o Supabase, e os dois já estão conectados aqui."* Ele confere os dois projetos e lê o `CLAUDE.md`, que é a memória deste projeto.
6. Toda vez que mudar algo, peça no fim: *"sobe as alterações para o GitHub"*. A Vercel publica sozinha em um ou dois minutos.

## Comprou outro módulo depois?

A sua instalação cresce sem duplicar nada. O passo a passo para o Claude está no [COMECE-AQUI.md](COMECE-AQUI.md): ele traz para o seu repositório só a pasta do módulo novo e as peças da base que faltam, sobe para o GitHub e você abre a tela de instalação de novo (`/setup`, botão **Acrescentar um módulo ou refazer a instalação**), que instala no banco só o que é novo. As ligações com o que você já tinha nascem sozinhas.

## O que funciona junto

Neste pacote, cada módulo funciona sozinho. As ligações com outros módulos nascem quando eles forem acrescentados, em qualquer ordem.

## Personalizar

O código é seu. Mexa com o Claude aberto nesta pasta e peça sempre para ele mostrar o que vai mudar antes.

| O quê | Onde |
|---|---|
| Nome da empresa | variável `EMPRESA_NOME` do projeto na Vercel (vale na próxima publicação) |
| Pessoas, acessos, cargo e área de cada uma | o cartão **Usuários** do Início (`/usuarios/`) |
| Cores, fontes e espaçamentos | o `tokens.css` ou o `theme.css` do design system de cada módulo e o `base/shared/` |
| Logo e ícones | `base/shared/` (`favicon.svg`, `app-icone.svg`, `icon-*.png`) |
| A porta de entrada (Início) | `base/shared/launcher/` (`sistemas.js` diz os cartões) |
| O desenho de um menu | `<tela>-partes/telas/menus/<menu>.html` ou `<módulo>/menus/<nome>/tela.html` |
| O que um botão faz | `<tela>-partes/js/NN-<assunto>.js` (o Claude acha pelo nome da função) |
| As regras do negócio | o banco, em `<módulo>/banco/estrutura/` |

As telas grandes estão em partes, uma por assunto, e cada pasta `-partes` tem um `LEIA-ME.md` com o mapa. O site que vai ao ar é montado a partir delas pelo `tools/vercel/montar.js`, na própria Vercel.

## Para quem quer entender por dentro

| Parte | O que é |
|---|---|
| `base/` | a base: login, primeiro acesso, pessoas e acessos, Início, conta, avisos e o `os-core.js` que fala com o banco |
| `outgrupos/` | o módulo, cada um com as telas, o banco (`banco/`), as funções do servidor (`supabase/functions/`) e o README dele |
| `base/setup/` e `api/setup.js` | a tela de instalação e o servidor dela na Vercel |
| `api/[rota].js` | as rotas de servidor dos módulos (`/api/<nome>`), que rodam na Vercel |
| `tools/instalar/` | a instalação: o plano do banco (`plano.js`), a conversa com o Supabase (`supabase-api.js`), a instalação pela internet (`instalar-pela-api.js`), acrescentar módulo (`acrescentar.js`) e a montagem do site (`montar/`) |
| `tools/vercel/montar.js` | a montagem do site na Vercel, com as variáveis gravadas pela instalação |

**Instalar pelo Claude Code, sem a tela.** O mesmo motor roda no computador, sem psql e sem Docker: `SUPABASE_ACCESS_TOKEN="<token>" HUB_ADMIN_SENHA="<senha>" node tools/instalar/instalar-pela-api.js --projeto https://SEU_PROJETO.supabase.co --site https://seu-site.vercel.app --empresa "Sua Empresa" --admin-nome "Seu Nome" --admin-email voce@empresa.com`. O token e a senha vêm só das variáveis e nunca aparecem na tela. Depois, grave na Vercel as variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` e `EMPRESA_NOME` e publique de novo.

Cada módulo tem o README dele, com as telas, o banco, as funções, as integrações (WhatsApp, e-mail, Google Agenda, IA) e os nomes que o sistema reconhece.
