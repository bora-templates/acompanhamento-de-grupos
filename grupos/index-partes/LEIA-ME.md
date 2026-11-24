# Partes da tela do módulo Grupos (`index.html`)

A tela é um app Alpine só (`x-data="grApp()"`), feito de partes, uma por assunto. O `index.html` traz os lugares onde cada
tela entra. O menu lateral, o cabeçalho e o Dia/Noite são a casca da base (`/shared/casca.js` e `/shared/visual/casca.css`),
a mesma de Usuários e de Minha conta, montada com o `"menu"` do `grupos/sistema.json` (Grupos e Ajustes; Usuários aparece
para quem administra o sistema). A tela avisa a casca pelo `Casca.titulo(...)` e pelo `Casca.mostraItem('ajustes', ...)`.
O desenho de cada tela está em `telas/` e o código, em `js/`.

Na montagem do site (`node tools/instalar/montar/montar.js`), cada `<div data-parte="caminho">` do `index.html` e das telas é
trocado pelo conteúdo do arquivo indicado, e a pasta `telas/` não vai ao ar. Abrir o `index.html` direto no navegador não
funciona, como nas outras telas em partes.

## Telas (`telas/`)

| Arquivo | O que tem |
|---|---|
| `grupos.html` | a primeira tela: números, Primeiros passos (IA, WhatsApp e grupos), cartões dos grupos |
| `grupo.html` | o cabeçalho do grupo, as abas e o encaixe do conteúdo de cada aba |
| `aba-conversa.html` | as mensagens da mais nova para a mais antiga, com busca, filtro por pessoa e tempo real |
| `aba-resumos.html` | fazer o resumo, a lista dos anteriores e o resumo aberto (Leitura do dia, Destaques, assuntos resolvidos, sentimento, selos e mensagens por hora) |
| `aba-perguntar.html` | a pergunta à IA, a resposta e as perguntas anteriores |
| `aba-materiais.html` | as orientações para a IA (com as oito sugestões prontas) e os materiais de apoio |
| `aba-participantes.html` | a lista de participantes e o botão de atualizar |
| `aba-ajustes-grupo.html` | resumo automático, pausar e deixar de acompanhar |
| `ajustes.html` | WhatsApp (com QR), IA, transcrição de áudio e grupo de exemplo |
| `janelas.html` | Escolher grupos, mandar o resumo para o grupo, novo material e a confirmação |

## Código (`js/`)

| Arquivo | O que tem |
|---|---|
| `01-base.js` | login e acesso, rotas (`#grupos`, `#grupo/<id>/<aba>`, `#ajustes/<seção>`), avisos, chamadas ao servidor (`edge`, que marca `sem_resposta` quando a resposta não chegou), ajudantes de data, telefone, nome de quem escreveu e foco em campo |
| `02-grupos.js` | o painel, os Primeiros passos, a janela Escolher grupos, o grupo de exemplo e a vigia da importação (painel lido de 5 em 5 segundos enquanto algum grupo traz mensagens) |
| `03-grupo.js` | o grupo aberto, as abas, a conversa, a busca, o tempo real e a mesclagem das mensagens trazidas pela importação |
| `04-resumos.js` | resumos (fazer, abrir, refazer, o gráfico das mensagens por hora, o sentimento e os selos), a janela de envio ao grupo e as perguntas à IA |
| `05-extras.js` | orientações (com as sugestões prontas), materiais, participantes e os ajustes do grupo |
| `06-ajustes.js` | os Ajustes: WhatsApp (QR, estado e troca de endereço), IA, transcrição de áudio e grupo de exemplo |
| `99-monta.js` | junta as partes (`grApp`) |

Função nova vai no arquivo do assunto. Nome repetido entre as partes: vale o de baixo (o `99-monta.js` avisa no console).
Procure o nome antes de criar.

## Regras

- Todo texto que vem do banco entra por `x-text` ou por atributo do Alpine. Nunca monte HTML com texto do banco.
- Chamada ao banco: `OS.getClient().rpc('gr_<nome>', { p_<parâmetro>: valor })`, com o nome escrito por inteiro em cada lugar
  para o teste `telas-x-banco` conferir. Chamada ao servidor: `this.edge({ acao: '<ação>', <campos> })`, que fala com a Edge
  Function `gr-api`.
- Token e chave ficam em campo de senha e nunca são preenchidos de volta.
- Os níveis usam as palavras da tela Usuários. Só visualiza vê tudo. Edita (`pode_administrar` no `gr_painel`) faz resumo,
  envio, orientações, materiais, participantes, resumo automático e grupo de exemplo. Administra (`pode_configurar`) é só do
  admin e também liga o WhatsApp, a IA e a transcrição, escolhe os grupos, pausa e remove grupos. A tela só esconde o botão,
  e o banco e o servidor conferem de novo.
- Texto de tela: português do Brasil com acentos, frases inteiras, sem travessão e sem reticências. Botões começam com verbo.

## Fluxos que a tela trata

- Trocar o endereço do servidor da uazapi exige o token da instância nova. Trocar o provedor da IA exige a chave. A tela abre o campo, não deixa salvar sem ele e põe o cursor nele. Se o servidor
  responder `precisa_token` ou `precisa_chave`, a tela mostra o erro, abre o campo e põe o cursor nele.
- Depois de salvar a IA, a caixa do modelo mostra o que o servidor gravou (`ajustes.ia_modelo`).
- A IA da tela é só Claude ou OpenAI. Com a IA salva, o seletor de modelos mostra a lista do provedor (`ia_modelos`, os mais
  recentes primeiro); sem chave, com outro provedor escolhido ou com falha, mostra a lista fixa `GR_MODELOS`. Instalação antiga
  com DeepSeek ou Compatível salvos continua funcionando, e a aba IA mostra um aviso pedindo para escolher Claude ou OpenAI.
- A transcrição usa só a OpenAI (a Groq saiu em 24/11), com modelo de áudio (`GR_MODELOS_AUDIO`) e chave. A frase "Chave em
  uso" diz se a transcrição usa a mesma chave da IA (`ajustes.transcricao_chave_da_ia`) ou uma chave própria do serviço.
- Envio ao grupo: `enviar` com `ja_enviado` mostra "Este resumo já foi enviado em" mais a data e o botão Mandar de novo, que pede a
  confirmação e manda `reenviar: true`. A tela espera 75 segundos pela resposta. Com `sem_confirmacao` (ou sem resposta), mostra a
  frase de conferir o grupo e não marca o resumo como enviado.
- Refazer um resumo de hoje repete o período. Um resumo de outro dia sai de novo com `periodo: 'datas'` e o `inicio` e o `fim` guardados.
- "Ver mensagens anteriores" manda `p_antes` e `p_antes_id` (o momento e o id da mensagem mais antiga da tela).
- Mensagem ao vivo que chega enquanto a primeira página da conversa carrega espera numa fila e entra depois, sem repetir.
- Grupo com `importacao_erro`: o cartão ganha um selo, e a Conversa mostra a faixa com o botão Tentar de novo (`reimportar`).
- `proximo_auto` (do `gr_grupo_salvar`) vira "O próximo resumo automático sai DD/MM às HHh." na aba Ajustes do grupo.
- Quem não configura não recebe `whatsapp_servidor`, `ia_url` nem `whatsapp_erro`: os Primeiros passos usam uma frase pronta.
- Quem escreve sem nome e sem telefone aparece como "Participante". Identificador que não é número (`@lid`) nunca vira telefone.
