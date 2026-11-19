# Comece aqui · Acompanhamento de Grupos no WhatsApp com IA

> **Para o Claude (ou quem estiver instalando):** leia este arquivo inteiro antes de mexer em qualquer coisa. Ele diz como instalar do zero e o que fazer se esta solução já estiver instalada. Antes de qualquer coisa que mexa no Supabase ou na Vercel, diga à pessoa o que vai fazer e espere o ok. Nunca mostre na tela um token, a chave secreta (a que começa com `sb_secret_` ou a `service_role`) nem a conexão do banco.

Quem usa este pacote costuma ser dono de negócio, sem experiência com programação. Fale em português simples, um passo de cada vez, e explique cada termo técnico na primeira vez que ele aparecer.

## O que veio neste pacote

| Módulo | Versão | O que faz |
|---|---|---|
| **Acompanhamento de Grupos no WhatsApp com IA** | 1.0.0 | Acompanha os grupos de WhatsApp que a empresa escolher: guarda as mensagens, transcreve os áudios e usa a IA para contar o que aconteceu em cada período, apontar o que ficou pendente e responder perguntas sobre cada grupo. O resumo pode ir para o próprio grupo, a pedido ou todo dia num horário escolhido. Funciona com Claude, DeepSeek, OpenAI ou qualquer IA compatível. |

A base (versão **1.1.0**), só com as peças que este módulo usa:

| Peça da base | O que é |
|---|---|
| `essencial` | Essencial (login, pessoas e acessos, o menu lateral, avisos gravados) |

Também vêm a tela de instalação (`base/setup/` e `api/setup.js`), as ferramentas de instalar (`tools/instalar/`), a montagem do site na Vercel (`tools/vercel/montar.js`), o `pacote.json` (esta lista, com as versões) e o `LICENSE`.

## Primeiro: esta solução já está instalada?

Esta solução é instalada sozinha, numa instalação só dela: um repositório no GitHub, um projeto no Supabase e um projeto na Vercel, todos na conta da pessoa. Ela não entra numa instalação que já existe.

Pergunte à pessoa se ela já pôs esta solução no ar. Se tiver o Supabase conectado, confira no projeto dela: *"Confira no Supabase se existe a tabela hub.sistemas_instalados e o que tem nela."*

- **Não está instalada** → siga **Instalar do zero**, logo abaixo, num projeto novo do Supabase.
- **Já está instalada** → não instale de novo. Se a instalação parou no meio ou se falta conferir alguma coisa, abra o site em `/setup` e clique em **Refazer a instalação**: ela vê o que já está no banco e não duplica nada.
- **O projeto do Supabase já tem outro sistema instalado** → não use esse projeto. Crie um projeto novo no Supabase para esta solução.

## Instalar do zero

O caminho recomendado é pela tela de instalação, sem terminal (README.md, "Colocar no ar"). A pessoa tem o guia de instalação que ela recebeu junto com a compra, com cada clique do GitHub, do Supabase e da Vercel: peça que ela siga o guia e acompanhe cada etapa com ela. Os passos são estes:

1. GitHub: **Use this template** neste repositório, na conta da pessoa, sempre **Private**.
2. Supabase: crie um projeto novo na região **South America (São Paulo)**.
3. Vercel: importar o repositório novo e clicar em **Deploy**, sem mudar nada. O `vercel.json` já diz como montar o site.
4. Abrir o site: ele leva sozinho para `/setup`. A pessoa cola o Project URL do Supabase, um token do Supabase com **Full access** ao projeto e um token da Vercel com **All Projects** e **No Expiration**, preenche empresa, nome, e-mail e senha e clica em **Instalar**.
5. Quando a tela disser **Instalação concluída**, entrar com o e-mail e a senha criados.

**Alternativa pelo terminal (o Claude roda), sem psql e sem Docker:**
```bash
SUPABASE_ACCESS_TOKEN="<token>" HUB_ADMIN_SENHA="<senha>" node tools/instalar/instalar-pela-api.js \
  --projeto https://SEU_PROJETO.supabase.co --site https://SEU-SITE.vercel.app \
  --empresa "Nome da Empresa" --admin-nome "Nome" --admin-email email@empresa.com
```
Peça para a pessoa colocar o token e a senha nas variáveis ela mesma (nunca peça para colar no chat). Depois grave na Vercel `SUPABASE_URL`, `SUPABASE_ANON_KEY` (a chave anon, da aba Legacy de API Keys), `SUPABASE_SERVICE_KEY` (a service_role) e `EMPRESA_NOME`, e publique de novo.

## Depois de instalar: ligar o Acompanhamento de Grupos no WhatsApp com IA

O Acompanhamento de Grupos no WhatsApp com IA só trabalha com a IA e o WhatsApp ligados. A instalação não pede nada disso: a pessoa liga tudo dentro do sistema, em **Grupos › Ajustes**, depois de entrar. Conduza um passo de cada vez e peça que ela mesma cole cada chave e token nos campos da tela. Nunca peça para colar no chat a chave de IA, o token da instância da uazapi nem o endereço que a uazapi chama (ele leva uma chave no final).

O que a pessoa precisa ter à mão: uma instância da uazapi com o número que está nos grupos (endereço do servidor e token da instância) e uma chave de IA (OpenAI, Anthropic, DeepSeek ou compatível; para transcrever áudio, OpenAI ou Groq).

1. **Entrar.** O login abre direto no Grupos, e quem instalou já nasce com o acesso de admin. Se aparecer a tela "Você ainda não tem acesso ao Grupos", clique em **Abrir Usuários**, clique em **Editar** ao lado do nome da pessoa e escolha **Admin do sistema** no Grupos.
2. **Ajustes › IA.** Escolha o provedor (OpenAI, Claude, DeepSeek ou Compatível com OpenAI), informe o modelo e a chave, clique em **Salvar** e depois em **Testar a IA**. Ao salvar a IA, o sistema também prepara a agenda dos resumos automáticos.
3. **Ajustes › Transcrição de áudio.** Escolha Groq ou OpenAI e informe a chave. Com a IA da OpenAI, a opção **Usar a mesma chave da IA** dispensa uma chave nova. Sem esse serviço, os áudios ficam guardados sem texto.
4. **Ajustes › WhatsApp.** Informe o endereço do servidor da uazapi (começa com https://) e o token da instância, e clique em **Salvar e conectar**. Se a tela mostrar o QR, a pessoa lê com o WhatsApp do celular do número dos grupos (Aparelhos conectados › Conectar um aparelho). Se a instância já mandar as mensagens para outro endereço, a tela avisa e só troca quando a pessoa clica em **Trocar para esta instalação**, porque o sistema que recebia essas mensagens deixa de recebê-las.
5. **Escolher grupos.** Em Grupos, clique em **Escolher grupos**, marque os que a pessoa quer acompanhar e clique em **Acompanhar**. Só as mensagens dos grupos marcados são guardadas.
6. **Grupo de exemplo (opcional).** Em Grupos, **Ver com um grupo de exemplo** mostra uma conversa fictícia de clínica de estética para testar o resumo e as perguntas. O botão **Apagar o grupo de exemplo** fica em **Ajustes › Grupo de exemplo**.

## O que NÃO fazer

- Não rode o `estrutura.sql` à mão, não apague esquema e não "limpe" o banco para instalar de novo. A instalação percebe o banco em uso e só acrescenta.
- Não apague a pasta da instalação nem a troque pela pasta do pacote, porque as personalizações estão nela.
- Não substitua a pasta `base/` inteira nem a pasta de um módulo que já existe (a personalização se perderia).
- Não descompacte nem clone o pacote dentro da instalação.
- Não edite a pasta `dist/`: ela é montada de novo a cada publicação.
- Nunca mostre na tela um token, a chave secreta nem a conexão do banco.

## Com o Claude Code

Abra a pasta da instalação no Claude Code e comece com:

> Leia o COMECE-AQUI.md e o README.md. Veja se já existe uma instalação e me guie, um passo de cada vez. Antes de qualquer coisa que mexa no meu Supabase ou na minha Vercel, me diga o que vai fazer.
