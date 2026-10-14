-- =============================================================================
-- outgrupos · 06 · o grupo de exemplo
-- -----------------------------------------------------------------------------
-- Para ver o resumo e as perguntas funcionando antes de ligar o WhatsApp. O grupo é
-- fictício e fica marcado como exemplo: a clínica Contorno Estética, de Sorocaba, com a
-- equipe (Paula Andrade, fundadora; Nina, recepção e WhatsApp; Otávio, biomédico das
-- avaliações e pacotes; Camila, terapeuta corporal) e 8 clientes. Os horários são
-- relativos ao momento em que o exemplo é carregado: um bloco de conversa entre 29 e 19
-- horas atrás e outro nas últimas 8 horas. Nenhum dado é real.
-- O número da Nina é o número conectado (do_time); a equipe toda administra o grupo.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

create or replace function hub.og_exemplo_carregar()
returns uuid
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_grupo uuid;
  v_agora timestamptz := now();
begin
  perform hub.og_exige('administrar');

  -- o endereço do exemplo é reservado (og_grupos_criar recusa), mas se um grupo de verdade
  -- estiver com ele, o exemplo para aqui e o grupo de verdade fica como está
  if exists (select 1 from hub.og_grupos where jid = 'exemplo-contorno@g.us' and not exemplo) then
    raise exception 'Um grupo acompanhado já usa o endereço reservado ao exemplo, por isso o exemplo não foi carregado.';
  end if;

  -- recria do zero: o exemplo antigo sai com tudo dele (só o grupo marcado como exemplo)
  delete from hub.og_grupos where exemplo and jid = 'exemplo-contorno@g.us';

  insert into hub.og_grupos (jid, nome, pessoas, ativo, exemplo, orientacoes, resumo_hora, importado_em, criado_por)
  values ('exemplo-contorno@g.us', 'Clientes da Contorno Estética (exemplo)', 12, true, true,
          'Observe com atenção as reclamações de atraso e os pedidos de material, porque são os pontos que mais incomodam as clientes. '
          || 'Chame a equipe pelo primeiro nome (Paula, Nina, Otávio e Camila). '
          || 'Trate como urgente qualquer reclamação sem resposta há mais de duas horas e qualquer pedido de desconto acima de 10%.',
          20, v_agora, auth.uid())
  returning id into v_grupo;

  insert into hub.og_participantes (grupo_id, jid, nome, telefone, admin)
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
  insert into hub.og_mensagens (grupo_id, whatsapp_id, autor_jid, autor_nome, do_time, tipo, texto, arquivo_nome,
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
    join hub.og_participantes p on p.grupo_id = v_grupo and p.telefone = '55159990000' || m.autor;

  update hub.og_grupos
     set ultima_mensagem_em = (select max(x.momento) from hub.og_mensagens x where x.grupo_id = v_grupo)
   where id = v_grupo;

  insert into hub.og_materiais (grupo_id, titulo, texto, criado_por)
  values (v_grupo, 'Regras e preços da Contorno Estética (exemplo)',
          'A Contorno Estética é uma clínica fictícia de Sorocaba, criada só para este exemplo.'
          || E'\n\n' || 'Horários: a clínica atende de segunda a sexta das 8h às 20h, e o último horário começa às 19h. A partir deste mês, a clínica também abre aos sábados das 9h às 13h.'
          || E'\n\n' || 'Remarcação: a cliente pode remarcar sem custo quando avisa até 24 horas antes do horário marcado.'
          || E'\n\n' || 'Descontos: o desconto máximo é de 10% para pagamento à vista no Pix. Pacote pago no cartão não tem desconto.'
          || E'\n\n' || 'Preços: a limpeza de pele custa R$ 190. A drenagem linfática em pacote de 10 sessões custa R$ 1.350. A massagem modeladora em pacote de 10 sessões custa R$ 1.200. A criolipólise custa R$ 690 por área.'
          || E'\n\n' || 'Equipe: a Paula Andrade é a fundadora, a Nina cuida da recepção e do WhatsApp, o Otávio é o biomédico das avaliações e dos pacotes, e a Camila é a terapeuta corporal.',
          auth.uid());

  return v_grupo;
end $$;

-- apaga o grupo de exemplo e tudo dele
create or replace function hub.og_exemplo_apagar()
returns void
language plpgsql security definer
set search_path = hub, public
as $$
begin
  perform hub.og_exige('administrar');
  delete from hub.og_grupos where exemplo and jid = 'exemplo-contorno@g.us';
end $$;

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function hub.og_exemplo_carregar(), hub.og_exemplo_apagar() from public, anon, authenticated;
grant execute on function hub.og_exemplo_carregar(), hub.og_exemplo_apagar() to authenticated;
