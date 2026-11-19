-- =============================================================================
-- grupos · 06 · o grupo de exemplo
-- -----------------------------------------------------------------------------
-- Para ver o resumo e as perguntas funcionando antes de ligar o WhatsApp. O grupo é
-- fictício e fica marcado como exemplo: a clínica Contorno Estética, de Sorocaba, com a
-- equipe (Paula Andrade, fundadora; Nina, recepção e WhatsApp; Otávio, biomédico das
-- avaliações e pacotes; Camila, terapeuta corporal) e 8 clientes. Os horários são
-- relativos ao momento em que o exemplo é carregado: um bloco de conversa entre 29 e 19
-- horas atrás e outro nas últimas 8 horas. Nenhum dado é real.
-- O exemplo nasce com um resumo pronto (origem "exemplo", escrito à mão a partir dessas mensagens),
-- para a aba Resumos aparecer completa antes de ligar a IA. Apagar o exemplo apaga o resumo junto
-- (a chave estrangeira de gr_resumos é on delete cascade), e carregar de novo recria os dois.
-- O número da Nina é o número conectado (do_time); a equipe toda administra o grupo.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

create or replace function hub.gr_exemplo_carregar()
returns uuid
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_grupo uuid;
  v_agora timestamptz := now();
begin
  perform hub.gr_exige('administrar');

  -- o endereço do exemplo é reservado (gr_grupos_criar recusa), mas se um grupo de verdade
  -- estiver com ele, o exemplo para aqui e o grupo de verdade fica como está
  if exists (select 1 from hub.gr_grupos where jid = 'exemplo-contorno@g.us' and not exemplo) then
    raise exception 'Um grupo acompanhado já usa o endereço reservado ao exemplo, por isso o exemplo não foi carregado.';
  end if;

  -- recria do zero: o exemplo antigo sai com tudo dele (só o grupo marcado como exemplo)
  delete from hub.gr_grupos where exemplo and jid = 'exemplo-contorno@g.us';

  insert into hub.gr_grupos (jid, nome, pessoas, ativo, exemplo, orientacoes, resumo_hora, importado_em, criado_por)
  values ('exemplo-contorno@g.us', 'Clientes da Contorno Estética (exemplo)', 12, true, true,
          'Observe com atenção as reclamações de atraso e os pedidos de material, porque são os pontos que mais incomodam as clientes. '
          || 'Chame a equipe pelo primeiro nome (Paula, Nina, Otávio e Camila). '
          || 'Trate como urgente qualquer reclamação sem resposta há mais de duas horas e qualquer pedido de desconto acima de 10%.',
          20, v_agora, auth.uid())
  returning id into v_grupo;

  insert into hub.gr_participantes (grupo_id, jid, nome, telefone, admin)
  select v_grupo, '55159990000' || p.fim || '@s.whatsapp.net', p.nome, '55159990000' || p.fim, p.admin
    from (values
      ('01', 'Paula Andrade',   true),
      ('02', 'Nina',            true),
      ('03', 'Otávio',          true),
      ('04', 'Camila',          true),
      ('11', 'Juliana Prado',   false),
      ('12', 'Marcos Vieira',   false),
      ('13', 'Fernanda Lopes',  false),
      ('14', 'Patrícia Gomes',  false),
      ('15', 'Renata Oliveira', false),
      ('16', 'Aline Costa',     false),
      ('17', 'Beatriz Santos',  false),
      ('18', 'Carla Mendes',    false)
    ) as p(fim, nome, admin);

  -- (ordem, minutos atrás, final do telefone de quem escreveu, tipo, texto, arquivo, transcrição, ordem da citada)
  insert into hub.gr_mensagens (grupo_id, whatsapp_id, autor_jid, autor_nome, do_time, tipo, texto, arquivo_nome,
                                transcricao, citada_id, momento)
  select v_grupo,
         'exemplo-' || lpad(m.ordem::text, 3, '0'),
         p.jid, p.nome, (m.autor = '02'),
         m.tipo, m.texto, m.arquivo, m.transcricao,
         case when m.cita is not null then 'exemplo-' || lpad(m.cita::text, 3, '0') end,
         v_agora - make_interval(mins => m.minutos)
    from (values
      ( 1, 1740, '02', 'texto', 'Bom dia, pessoal, a agenda desta semana já está aberta e vocês podem marcar comigo por aqui.'::text, null::text, 'nao_se_aplica', null::int),
      ( 2, 1722, '11', 'texto', 'Nina, vocês atendem até que horas durante a semana? Eu só consigo ir depois do trabalho.', null, 'nao_se_aplica', null),
      ( 3, 1715, '02', 'texto', 'Juliana, nós atendemos de segunda a sexta das 8h às 20h, e o último horário começa às 19h.', null, 'nao_se_aplica', 2),
      ( 4, 1709, '11', 'texto', 'Então eu quero marcar uma limpeza de pele para hoje às 19h, se ainda tiver vaga.', null, 'nao_se_aplica', null),
      ( 5, 1702, '02', 'texto', 'Tem vaga, sim, e eu já reservei o horário das 19h para você com o Otávio. A limpeza de pele custa R$ 190 e você paga no dia.', null, 'nao_se_aplica', 4),
      ( 6, 1690, '11', 'texto', 'Combinado, eu chego uns minutos antes para não atrasar.', null, 'nao_se_aplica', null),
      ( 7, 1655, '14', 'texto', 'Gente, eu preciso remarcar a minha drenagem de amanhã às 10h porque surgiu uma reunião no trabalho. Isso tem algum custo?', null, 'nao_se_aplica', null),
      ( 8, 1648, '02', 'texto', 'Patrícia, a remarcação é gratuita quando você avisa até 24 horas antes do horário, então no seu caso não tem custo nenhum. Eu posso passar a sua sessão para depois de amanhã, também às 10h?', null, 'nao_se_aplica', 7),
      ( 9, 1641, '14', 'texto', 'Pode passar, sim, esse horário fica ótimo para mim.', null, 'nao_se_aplica', null),
      (10, 1636, '02', 'texto', 'Pronto, a sua drenagem ficou para depois de amanhã às 10h.', null, 'nao_se_aplica', null),
      (11, 1610, '15', 'texto', 'Vocês fazem algum desconto no pacote de massagem modeladora se eu pagar à vista?', null, 'nao_se_aplica', null),
      (12, 1602, '02', 'texto', 'Renata, no Pix à vista nós damos 10% de desconto, que é o máximo que conseguimos oferecer. Com o desconto, o pacote de 10 sessões sai de R$ 1.200 por R$ 1.080.', null, 'nao_se_aplica', 11),
      (13, 1590, '15', 'texto', 'Vocês conseguem fazer por R$ 1.000 se eu fechar hoje?', null, 'nao_se_aplica', null),
      (14, 1581, '02', 'texto', 'Infelizmente o máximo que eu posso dar é 10%, mas eu seguro esse valor até sexta para você pensar com calma.', null, 'nao_se_aplica', 13),
      (15, 1570, '15', 'texto', 'Tudo bem, eu vou pensar e te aviso até sexta.', null, 'nao_se_aplica', null),
      (16, 1530, '13', 'audio', 'Oi, gente, aqui é a Fernanda. Eu fiz a avaliação com o Otávio na semana passada e queria saber se posso fazer a drenagem na mesma semana da criolipólise, porque ele comentou que as duas combinam bem. Eu também queria saber quanto fica a criolipólise em duas áreas.', null, 'feita', null),
      (17, 1512, '03', 'texto', 'Fernanda, pode sim, e eu até recomendo, porque a drenagem ajuda o corpo a eliminar a gordura que a criolipólise destruiu. O ideal é começar a drenagem uns três dias depois da aplicação.', null, 'nao_se_aplica', 16),
      (18, 1505, '03', 'texto', 'A criolipólise custa R$ 690 por área, então as duas áreas ficam em R$ 1.380. A drenagem pode ser avulsa ou no pacote de 10 sessões, que sai por R$ 1.350.', null, 'nao_se_aplica', null),
      (19, 1490, '13', 'texto', 'Ficou bem claro, obrigada, Otávio. Eu vou falar com a Nina para marcar as duas coisas.', null, 'nao_se_aplica', null),
      (20, 1440, '17', 'texto', 'Nina, você consegue me mandar a lista de cuidados depois da criolipólise que a Camila comentou na minha sessão? Eu procurei no meu e-mail e não encontrei.', null, 'nao_se_aplica', null),
      (21, 1431, '02', 'texto', 'Consigo, sim, Beatriz. Eu vou separar o material com a Camila e te mando até o fim do dia.', null, 'nao_se_aplica', 20),
      (22, 1400, '01', 'texto', 'Pessoal, publicamos hoje no Instagram o antes e depois de uma cliente que fez criolipólise com a gente, com as dicas de cuidado no final. Vale a pena dar uma olhada: https://www.instagram.com/p/ContornoEsteticaExemplo/', null, 'nao_se_aplica', null),
      (23, 1392, '16', 'texto', 'Que resultado lindo, dá para ver a diferença na barriga dela.', null, 'nao_se_aplica', 22),
      (24, 1385, '18', 'figurinha', null, null, 'nao_se_aplica', null),
      (25, 1360, '12', 'texto', 'Pessoal, ontem eu esperei 40 minutos para ser atendido no horário das 18h e ninguém me avisou do atraso.', null, 'nao_se_aplica', null),
      (26, 1358, '12', 'texto', 'Eu saí mais cedo do trabalho para chegar a tempo e fiquei bem chateado. Eu gostaria de entender o que aconteceu, porque não quero que isso se repita.', null, 'nao_se_aplica', null),
      (27, 1330, '04', 'video', 'Gravei um vídeo curto com o alongamento que eu ensino nas sessões de modeladora, para vocês fazerem em casa.', null, 'nao_se_aplica', null),
      (28, 1322, '14', 'texto', 'Que ótimo, Camila, eu vou fazer hoje à noite.', null, 'nao_se_aplica', 27),
      (29, 1290, '02', 'documento', 'Deixei aqui o modelo do contrato dos pacotes para quem pediu, e qualquer dúvida vocês podem me chamar.', 'Contrato do pacote de drenagem (modelo).pdf', 'nao_se_aplica', null),
      (30, 1282, '13', 'texto', 'Obrigada, Nina, eu vou ler com calma hoje à noite e te devolvo assinado amanhã.', null, 'nao_se_aplica', 29),
      (31, 1250, '18', 'texto', 'Vocês abrem aos sábados? Durante a semana fica difícil para mim.', null, 'nao_se_aplica', null),
      (32, 1244, '02', 'texto', 'Carla, por enquanto nós não abrimos aos sábados, mas a Paula está avaliando isso com a equipe e eu te aviso assim que tivermos uma resposta.', null, 'nao_se_aplica', 31),
      (33, 1230, '16', 'texto', 'Eu também teria interesse num horário no sábado de manhã, se vocês abrirem.', null, 'nao_se_aplica', null),
      (34, 1205, '15', 'texto', 'A Camila tem uma mão ótima, eu saí da massagem de hoje renovada. Eu recomendo muito para quem está em dúvida.', null, 'nao_se_aplica', null),
      (35, 1172, '04', 'texto', 'Que bom que você gostou, Renata, eu fico muito feliz em saber disso.', null, 'nao_se_aplica', 34),
      (36,  480, '02', 'texto', 'Bom dia, pessoal, hoje a clínica abre às 8h e ainda temos horários livres à tarde.', null, 'nao_se_aplica', null),
      (37,  470, '01', 'texto', 'Pessoal, eu tenho uma novidade: decidimos abrir a clínica aos sábados das 9h às 13h a partir deste mês, porque muita gente pediu esse horário.', null, 'nao_se_aplica', null),
      (38,  465, '01', 'texto', 'A Nina já abriu a agenda de sábado, então quem quiser marcar pode falar direto com ela aqui no grupo.', null, 'nao_se_aplica', null),
      (39,  458, '18', 'texto', 'Que notícia boa, eu quero o primeiro horário de sábado, às 9h.', null, 'nao_se_aplica', 37),
      (40,  452, '02', 'texto', 'Carla, eu reservei para você o sábado às 9h com a Camila, para a massagem modeladora.', null, 'nao_se_aplica', 39),
      (41,  447, '16', 'texto', 'Nina, eu também quero sábado. Pode ser às 10h para uma limpeza de pele?', null, 'nao_se_aplica', null),
      (42,  440, '02', 'texto', 'Aline, o sábado às 10h está reservado para você com o Otávio.', null, 'nao_se_aplica', 41),
      (43,  420, '11', 'texto', 'Eu passei aqui para contar que a limpeza de pele com o Otávio ontem foi maravilhosa e a minha pele está outra.', null, 'nao_se_aplica', null),
      (44,  412, '03', 'texto', 'Fico feliz em ler isso, Juliana. Use o protetor solar todos os dias nesta semana para manter o resultado.', null, 'nao_se_aplica', 43),
      (45,  395, '11', 'imagem', 'Minha pele ficou um pouco vermelha perto do nariz depois da limpeza. Isso é normal?', null, 'nao_se_aplica', null),
      (46,  380, '03', 'texto', 'É normal ficar um pouco vermelho por até 48 horas, Juliana. Use a água termal que eu te passei e evite maquiagem hoje, e se continuar amanhã me manda outra foto.', null, 'nao_se_aplica', 45),
      (47,  360, '12', 'texto', 'Eu ainda estou esperando uma resposta sobre o atraso de anteontem. Alguém da equipe pode me explicar o que aconteceu?', null, 'nao_se_aplica', null),
      (48,  345, '17', 'texto', 'Nina, a lista de cuidados da criolipólise ainda não chegou para mim.', null, 'nao_se_aplica', null),
      (49,  338, '02', 'texto', 'Desculpa, Beatriz, eu vou ver com a Camila agora de manhã e já te mando.', null, 'nao_se_aplica', 48),
      (50,  320, '14', 'texto', 'Gente, o estacionamento da frente vai continuar gratuito para as clientes?', null, 'nao_se_aplica', null),
      (51,  312, '02', 'texto', 'Vai, sim, Patrícia. É só apresentar o tíquete na recepção que a gente valida.', null, 'nao_se_aplica', 50),
      (52,  290, '13', 'texto', 'Nina, eu assinei o contrato do pacote de drenagem e vou levar impresso na sessão de amanhã.', null, 'nao_se_aplica', null),
      (53,  284, '02', 'texto', 'Fernanda, eu já deixei a sua criolipólise marcada para a semana que vem e a primeira drenagem três dias depois, como o Otávio orientou.', null, 'nao_se_aplica', 52),
      (54,  260, '15', 'texto', 'Nina, eu pensei melhor e quero fechar o pacote de massagem modeladora com os 10% no Pix.', null, 'nao_se_aplica', null),
      (55,  254, '02', 'texto', 'Renata, o valor fica em R$ 1.080 e eu te mando a chave Pix no privado agora.', null, 'nao_se_aplica', 54),
      (56,  248, '15', 'texto', 'Recebi a chave e já fiz o pagamento.', null, 'nao_se_aplica', null),
      (57,  230, '16', 'texto', 'Vocês vendem o protetor solar que o Otávio usa na limpeza de pele?', null, 'nao_se_aplica', null),
      (58,  221, '03', 'texto', 'Vendemos, sim, Aline, e a Nina pode separar um para você levar no sábado.', null, 'nao_se_aplica', 57),
      (59,  200, '18', 'texto', 'Alguém sabe se a criolipólise dói? Eu estou com um pouco de medo de fazer.', null, 'nao_se_aplica', null),
      (60,  188, '13', 'texto', 'Eu fiz na semana passada e senti só um frio forte nos primeiros minutos, depois ficou tranquilo.', null, 'nao_se_aplica', 59),
      (61,  182, '03', 'texto', 'Carla, a Fernanda descreveu bem, e na avaliação eu te explico cada etapa antes de começar.', null, 'nao_se_aplica', 59),
      (62,  150, '12', 'texto', 'Eu vou esperar até o fim do dia por uma resposta sobre o atraso, porque estou pensando em cancelar o meu pacote.', null, 'nao_se_aplica', null),
      (63,  140, '14', 'texto', 'A Camila arrasou na drenagem de hoje e eu saí bem mais leve.', null, 'nao_se_aplica', null),
      (64,  120, '04', 'texto', 'Fico feliz, Patrícia. Continue bebendo bastante água nos próximos dias para ajudar no resultado.', null, 'nao_se_aplica', 63),
      (65,   95, '17', 'texto', 'Gente, alguém mais recebeu a lista de cuidados da criolipólise? Eu ainda estou sem.', null, 'nao_se_aplica', null),
      (66,   80, '11', 'texto', 'Otávio, a vermelhidão já diminuiu bastante depois da água termal.', null, 'nao_se_aplica', 46),
      (67,   60, '01', 'texto', 'Gente, as vagas de sábado estão saindo rápido e ainda restam três horários para este fim de semana.', null, 'nao_se_aplica', null),
      (68,   45, '16', 'audio', 'Paula, eu queria saber se no sábado também vai ter drenagem ou só limpeza de pele e massagem, porque eu queria levar a minha mãe junto.', null, 'feita', null),
      (69,   30, '01', 'texto', 'Aline, no sábado vamos ter drenagem também, e a Nina consegue encaixar vocês duas no mesmo horário.', null, 'nao_se_aplica', 68),
      (70,   12, '16', 'texto', 'Maravilha, eu vou falar com a Nina agora.', null, 'nao_se_aplica', 69),
      (71,    6, '18', 'texto', 'Eu marquei a minha avaliação de criolipólise com o Otávio e agradeço a ajuda de vocês.', null, 'nao_se_aplica', null)
    ) as m(ordem, minutos, autor, tipo, texto, arquivo, transcricao, cita)
    join hub.gr_participantes p on p.grupo_id = v_grupo and p.telefone = '55159990000' || m.autor;

  update hub.gr_grupos
     set ultima_mensagem_em = (select max(x.momento) from hub.gr_mensagens x where x.grupo_id = v_grupo)
   where id = v_grupo;

  insert into hub.gr_materiais (grupo_id, titulo, texto, criado_por)
  values (v_grupo, 'Regras e preços da Contorno Estética (exemplo)',
          'A Contorno Estética é uma clínica fictícia de Sorocaba, criada só para este exemplo.'
          || E'\n\n' || 'Horários: a clínica atende de segunda a sexta das 8h às 20h, e o último horário começa às 19h. A partir deste mês, a clínica também abre aos sábados das 9h às 13h.'
          || E'\n\n' || 'Remarcação: a cliente pode remarcar sem custo quando avisa até 24 horas antes do horário marcado.'
          || E'\n\n' || 'Descontos: o desconto máximo é de 10% para pagamento à vista no Pix. Pacote pago no cartão não tem desconto.'
          || E'\n\n' || 'Preços: a limpeza de pele custa R$ 190. A drenagem linfática em pacote de 10 sessões custa R$ 1.350. A massagem modeladora em pacote de 10 sessões custa R$ 1.200. A criolipólise custa R$ 690 por área.'
          || E'\n\n' || 'Equipe: a Paula Andrade é a fundadora, a Nina cuida da recepção e do WhatsApp, o Otávio é o biomédico das avaliações e dos pacotes, e a Camila é a terapeuta corporal.',
          auth.uid());

  perform hub.gr_exemplo_resumo_gravar(v_grupo, v_agora);

  return v_grupo;
end $$;

-- ── o resumo pronto do grupo de exemplo ─────────────────────────────────────
-- Nasce junto com o exemplo, para a pessoa ver a aba Resumos completa antes de ligar a IA. O texto
-- foi escrito à mão a partir das 71 mensagens acima e fica com a origem "exemplo" (sem modelo de IA
-- e sem quem pediu): a tela mostra "Resumo de exemplo" e não deixa mandar para o grupo.
-- O período é "os últimos 7 dias" contados do momento da carga, o mesmo relógio das mensagens, então
-- as 71 entram. Os números, a participação, os links, os arquivos e a hora de cada pendência saem
-- das próprias mensagens, com a mesma conta do servidor (_shared/resumo.ts: calcularNumeros,
-- participacao, extrairLinks, listarArquivos e textoParaWhatsApp com a linha do exemplo), e o texto
-- para o WhatsApp é montado do mesmo jeito. Só gr_exemplo_carregar chama esta função.
create or replace function hub.gr_exemplo_resumo_gravar(p_grupo uuid, p_agora timestamptz)
returns uuid
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_inicio   timestamptz := p_agora - interval '7 days';
  v_fim      timestamptz := p_agora;
  v_fuso     text := 'America/Sao_Paulo';
  v_nome     text;
  v_rotulo   text;
  v_numeros  jsonb;
  v_part     jsonb;
  v_links    jsonb;
  v_links_t  jsonb;
  v_arquivos jsonb;
  v_conteudo jsonb;
  v_texto    text;
  v_id       uuid;
  v_quando   text;
  v_msgs     jsonb;
  x          jsonb;
begin
  select g.nome into v_nome from hub.gr_grupos g where g.id = p_grupo and g.exemplo;
  if v_nome is null then
    raise exception 'O resumo pronto só vale para o grupo de exemplo.';
  end if;

  -- as mensagens do período, com quem é administrador do grupo (por jid ou telefone, como chavesDoTime).
  -- Cada conta abaixo lê esta lista com jsonb_to_recordset (o mesmo formato em todas).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'autor_jid', m.autor_jid, 'autor_nome', m.autor_nome, 'do_time', m.do_time, 'tipo', m.tipo,
           'texto', m.texto, 'arquivo_nome', m.arquivo_nome, 'momento', m.momento,
           'admin', exists (select 1 from hub.gr_participantes p
                             where p.grupo_id = m.grupo_id and p.admin and m.autor_jid is not null
                               and (split_part(split_part(p.jid, '@', 1), ':', 1) = split_part(split_part(m.autor_jid, '@', 1), ':', 1)
                                    or (regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') <> ''
                                        and regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')
                                            = regexp_replace(split_part(split_part(m.autor_jid, '@', 1), ':', 1), '\D', '', 'g'))))
           ) order by m.momento, m.id), '[]'::jsonb)
    into v_msgs
    from hub.gr_mensagens m
   where m.grupo_id = p_grupo and m.momento >= v_inicio and m.momento < v_fim;

  -- os números (calcularNumeros): total, quem escreveu, a hora de Brasília com mais mensagens (no
  -- empate, a mais cedo) e o tempo médio até a próxima mensagem do time, só as respostas em até 24 horas
  select jsonb_build_object(
           'mensagens', (select count(*) from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean))::int,
           'pessoas', (select count(distinct coalesce(autor_jid, 'nome:' || autor_nome)) from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
                        where coalesce(autor_jid, autor_nome) is not null)::int,
           'hora_pico', (select h.hora || 'h' from (
                           select extract(hour from momento at time zone v_fuso)::int as hora, count(*) as n
                             from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean) group by 1) h
                         order by h.n desc, h.hora limit 1),
           'resposta_media_min', (
             select round(avg(extract(epoch from (r.momento - m.momento))) / 60)::int
               from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
               cross join lateral (
                 select t.momento from jsonb_to_recordset(v_msgs) as t(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
                  where (t.do_time or t.admin) and (t.momento, t.id) > (m.momento, m.id)
                  order by t.momento, t.id limit 1) r
              where not (m.do_time or m.admin) and r.momento - m.momento <= interval '24 hours'))
    into v_numeros;

  -- quem mais escreveu (participacao): até 10 pessoas, com os selos de administrador, de 4 a 10
  -- mensagens (participou bastante) e de 11 em diante (mais ativo do período)
  select coalesce(jsonb_agg(jsonb_build_object(
           'nome', p.nome, 'mensagens', p.n, 'admin', p.admin,
           'selos', to_jsonb(array_remove(array[
                      case when p.admin then 'administrador' end,
                      case when p.n >= 11 then 'mais_ativo' when p.n >= 4 then 'participou_bastante' end], null)))
           order by p.n desc, p.nome), '[]'::jsonb)
    into v_part
    from (
      select coalesce((array_agg(autor_nome order by momento desc, id desc) filter (where autor_nome is not null))[1],
                      split_part(split_part(max(autor_jid), '@', 1), ':', 1)) as nome,
             count(*)::int as n, bool_or(admin) as admin
        from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
       where coalesce(autor_jid, autor_nome) is not null
       group by coalesce(autor_jid, 'nome:' || autor_nome)
       order by count(*) desc, 1
       limit 10) p;

  -- os links do texto (extrairLinks), sem repetir, na ordem em que apareceram; v_links_t leva só os do
  -- time (o número conectado e os administradores), que são os que vão na seção Links do WhatsApp
  with achados as (
    select regexp_replace(case when a.u[1] ~* '^www\.' then 'https://' || a.u[1] else a.u[1] end,
                          '[.,;:!?)\]}*_~]+$', '') as url,
           coalesce(m.autor_nome, split_part(split_part(m.autor_jid, '@', 1), ':', 1), 'Alguém') as quem,
           m.momento, m.id, a.ordem, (m.do_time or m.admin) as do_time
      from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
      cross join lateral regexp_matches(coalesce(m.texto, ''), '(?:https?://|www\.)[^\s<>"''`]+', 'gi') with ordinality as a(u, ordem)),
  unicos as (
    select distinct on (url) url, quem, momento, id, ordem, do_time from achados where length(url) >= 12
     order by url, momento, id, ordem)
  select coalesce(jsonb_agg(jsonb_build_object('url', u.url, 'quem', u.quem,
                    'quando', to_char(u.momento at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                  order by u.momento, u.id, u.ordem), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('url', u.url) order by u.momento, u.id, u.ordem) filter (where u.do_time), '[]'::jsonb)
    into v_links, v_links_t
    from unicos u;

  -- os arquivos que circularam (listarArquivos): documentos, imagens e vídeos
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', m.tipo,
           'nome', coalesce(m.arquivo_nome, nullif(left(btrim(regexp_replace(coalesce(m.texto, ''), '\s+', ' ', 'g')), 80), '')),
           'quem', coalesce(m.autor_nome, split_part(split_part(m.autor_jid, '@', 1), ':', 1), 'Alguém'),
           'quando', to_char(m.momento at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           order by m.momento, m.id), '[]'::jsonb)
    into v_arquivos
    from jsonb_to_recordset(v_msgs) as m(id bigint, autor_jid text, autor_nome text, do_time boolean, tipo text, texto text, arquivo_nome text, momento timestamptz, admin boolean)
   where m.tipo in ('documento', 'imagem', 'video');

  -- o que a IA escreveria, escrito à mão a partir da conversa do exemplo. A hora de cada pendência
  -- é a da mensagem do pedido, no horário de Brasília ("dd/mm hh:mm").
  v_conteudo := jsonb_build_object(
    'panorama',
      'O grupo teve um período movimentado, com agendamentos, dúvidas sobre preços e muitos elogios à equipe. '
      || 'A Paula Andrade anunciou a abertura aos sábados das 9h às 13h, e a Nina já reservou os primeiros horários para a Carla e a Aline. '
      || 'A Renata fechou o pacote de massagem modeladora com 10% de desconto no Pix, e a Fernanda acertou a criolipólise com a drenagem e assinou o contrato. '
      || 'Duas cobranças seguem sem resposta: o Marcos Vieira pede uma explicação sobre o atraso no horário das 18h, e a Beatriz Santos ainda espera a lista de cuidados da criolipólise.',
    'destaques', jsonb_build_array(
      'O Marcos Vieira cobrou três vezes uma explicação sobre o atraso no horário das 18h e diz que pode cancelar o pacote.',
      'A Beatriz Santos pediu três vezes a lista de cuidados da criolipólise e ainda está sem o material.',
      'A abertura aos sábados agradou, e a Paula avisou que restam três vagas para este fim de semana.'),
    'assuntos', jsonb_build_array(
      jsonb_build_object('titulo', 'Reclamação de atraso do Marcos', 'situacao', 'em_aberto', 'o_que_foi_dito',
        'O Marcos esperou além do horário das 18h sem aviso e cobrou uma explicação três vezes, sem resposta da equipe.'),
      jsonb_build_object('titulo', 'Lista de cuidados da criolipólise', 'situacao', 'em_aberto', 'o_que_foi_dito',
        'A Nina prometeu mandar a lista para a Beatriz duas vezes, e a Beatriz continua sem o material.'),
      jsonb_build_object('titulo', 'Abertura aos sábados', 'situacao', 'resolvido', 'o_que_foi_dito',
        'A Paula anunciou a abertura das 9h às 13h, e a Nina reservou o sábado às 9h para a Carla e às 10h para a Aline.'),
      jsonb_build_object('titulo', 'Desconto no pacote de massagem modeladora', 'situacao', 'resolvido', 'o_que_foi_dito',
        'A Nina manteve o desconto máximo de 10% no Pix, e a Renata fechou o pacote por R$ 1.080 e já pagou.'),
      jsonb_build_object('titulo', 'Criolipólise com drenagem da Fernanda', 'situacao', 'resolvido', 'o_que_foi_dito',
        'O Otávio explicou que as duas combinam, a Nina marcou as sessões e a Fernanda assinou o contrato.'),
      jsonb_build_object('titulo', 'Cuidados depois da limpeza de pele', 'situacao', 'resolvido', 'o_que_foi_dito',
        'O Otávio orientou o uso da água termal, e a vermelhidão da Juliana já diminuiu bastante.')),
    'combinados', jsonb_build_array(
      'A clínica passa a abrir aos sábados das 9h às 13h, como a Paula Andrade anunciou.',
      'A Carla Mendes tem o sábado às 9h com a Camila, e a Aline Costa tem o sábado às 10h com o Otávio.',
      'A Renata Oliveira fechou o pacote de massagem modeladora por R$ 1.080, com 10% de desconto no Pix.',
      'A criolipólise da Fernanda Lopes ficou para a semana que vem, com a primeira drenagem três dias depois.',
      'A drenagem da Patrícia Gomes foi remarcada sem custo, porque ela avisou com mais de 24 horas de antecedência.',
      'A Nina vai separar um protetor solar para a Aline levar no sábado.'),
    'pendencias', jsonb_build_array(
      jsonb_build_object('pedido', 'Explicar ao Marcos Vieira o atraso no horário das 18h',
        'quem_pediu', 'Marcos Vieira', 'para_quem', 'a equipe da clínica', 'quando', 'exemplo-026'),
      jsonb_build_object('pedido', 'Mandar a lista de cuidados da criolipólise para a Beatriz Santos',
        'quem_pediu', 'Beatriz Santos', 'para_quem', 'Nina', 'quando', 'exemplo-020'),
      jsonb_build_object('pedido', 'Encaixar a Aline Costa e a mãe dela na drenagem de sábado',
        'quem_pediu', 'Aline Costa', 'para_quem', 'Nina', 'quando', 'exemplo-068')),
    'clima', jsonb_build_object('nivel', 'atencao', 'explicacao',
      'A conversa corre bem, com agendamentos e elogios, mas a reclamação do Marcos e a lista da Beatriz continuam sem resposta.'),
    'sentimento', jsonb_build_object('positivo', 38, 'neutro', 49, 'negativo', 13),
    'leitura_do_dia',
      'Responda hoje ao Marcos sobre o atraso e mande a lista de cuidados para a Beatriz, porque as duas cobranças passaram das duas horas das orientações e o Marcos já fala em cancelar o pacote.');

  -- a hora de cada pendência: a da mensagem do pedido, guardada acima pelo whatsapp_id
  v_conteudo := jsonb_set(v_conteudo, '{pendencias}', (
    select jsonb_agg(p.item || jsonb_build_object('quando',
             (select to_char(m.momento at time zone v_fuso, 'DD/MM HH24:MI')
                from hub.gr_mensagens m where m.grupo_id = p_grupo and m.whatsapp_id = p.item ->> 'quando'))
           order by p.ordem)
      from jsonb_array_elements(v_conteudo -> 'pendencias') with ordinality as p(item, ordem)));
  v_conteudo := v_conteudo || jsonb_build_object('links', v_links, 'arquivos', v_arquivos, 'participacao', v_part);

  -- o texto para o WhatsApp, montado como o textoParaWhatsApp (com a linha do exemplo no lugar da linha da IA)
  v_rotulo := 'os últimos 7 dias, de ' || to_char(v_inicio at time zone v_fuso, 'DD/MM')
              || ' a ' || to_char(v_fim at time zone v_fuso, 'DD/MM');
  v_texto := '_Este é um resumo de exemplo, escrito para mostrar como o resumo chega ao grupo._'
    || E'\n*' || v_nome || '*'
    || E'\nEste resumo cobre ' || v_rotulo || ', com '
    || (v_numeros ->> 'mensagens') || case when (v_numeros ->> 'mensagens')::int = 1 then ' mensagem' else ' mensagens' end
    || ' de ' || (v_numeros ->> 'pessoas') || case when (v_numeros ->> 'pessoas')::int = 1 then ' pessoa' else ' pessoas' end || '.'
    || E'\n\n*O que aconteceu*\n' || (v_conteudo ->> 'panorama');
  v_texto := v_texto || E'\n\n*Destaques*';
  for x in select value from jsonb_array_elements(v_conteudo -> 'destaques') loop
    v_texto := v_texto || E'\n• ' || (x #>> '{}');
  end loop;
  v_texto := v_texto || E'\n\n*Assuntos*';
  for x in select value from jsonb_array_elements(v_conteudo -> 'assuntos') loop
    v_texto := v_texto || E'\n• ' || (x ->> 'titulo') || ': ' || (x ->> 'o_que_foi_dito')
      || case when x ->> 'situacao' = 'resolvido' then ' (resolvido)' else ' (em aberto)' end;
  end loop;
  v_texto := v_texto || E'\n\n*Combinados*';
  for x in select value from jsonb_array_elements(v_conteudo -> 'combinados') loop
    v_texto := v_texto || E'\n• ' || (x #>> '{}');
  end loop;
  v_texto := v_texto || E'\n\n*Ficou em aberto*';
  for x in select value from jsonb_array_elements(v_conteudo -> 'pendencias') loop
    v_quando := x ->> 'quando';
    v_texto := v_texto || E'\n• ' || (x ->> 'pedido') || ' (pedido de ' || (x ->> 'quem_pediu') || ' em '
      || split_part(v_quando, ' ', 1) || ' às ' || split_part(split_part(v_quando, ' ', 2), ':', 1)::int || 'h'
      || split_part(split_part(v_quando, ' ', 2), ':', 2) || ')';
  end loop;
  v_texto := v_texto || E'\n\n*Leitura do dia*\n' || (v_conteudo ->> 'leitura_do_dia');
  if jsonb_array_length(v_links_t) > 0 then
    v_texto := v_texto || E'\n\n*Links*';
    for x in select value from jsonb_array_elements(v_links_t) with ordinality as l(value, ordem) where l.ordem <= 8 loop
      v_texto := v_texto || E'\n• ' || (x ->> 'url');
    end loop;
  end if;

  insert into hub.gr_resumos (grupo_id, periodo, inicio, fim, conteudo, numeros, texto_whatsapp, mensagens_usadas,
                              mensagens_fora, origem, pedido_por, modelo, criado_em)
  values (p_grupo, '7d', v_inicio, v_fim, v_conteudo, v_numeros, v_texto, (v_numeros ->> 'mensagens')::int,
          0, 'exemplo', null, null, p_agora)
  returning id into v_id;
  return v_id;
end $$;

-- apaga o grupo de exemplo e tudo dele
create or replace function hub.gr_exemplo_apagar()
returns void
language plpgsql security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('administrar');
  delete from hub.gr_grupos where exemplo and jid = 'exemplo-contorno@g.us';
end $$;

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function hub.gr_exemplo_carregar(), hub.gr_exemplo_apagar() from public, anon, authenticated;
grant execute on function hub.gr_exemplo_carregar(), hub.gr_exemplo_apagar() to authenticated;
-- o resumo pronto só nasce por dentro do gr_exemplo_carregar: ninguém da tela chama direto
revoke execute on function hub.gr_exemplo_resumo_gravar(uuid, timestamptz) from public, anon, authenticated;
grant execute on function hub.gr_exemplo_resumo_gravar(uuid, timestamptz) to service_role;
