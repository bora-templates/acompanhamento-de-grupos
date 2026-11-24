-- =============================================================================
-- grupos · 04 · funções só da chave de serviço (as Edge Functions gr-api e gr-entrada)
-- -----------------------------------------------------------------------------
-- Nenhuma confere quem chama: quem confere é a Edge Function, antes de chamar. Por isso
-- todas ficam fechadas para public, anon e authenticated e abertas só para service_role.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

-- ── entrada das mensagens ───────────────────────────────────────────────────

-- o grupo deste jid, se ele é acompanhado e está ativo (nulo se não acompanha ou está pausado)
create or replace function hub.gr_grupo_jid_ativo(p_jid text)
returns uuid
language sql stable security definer
set search_path = hub, public
as $$
  select g.id from hub.gr_grupos g where g.jid = p_jid and g.ativo and not g.exemplo limit 1
$$;

-- o tipo da mensagem dentro da lista da tabela
create or replace function hub.gr_mensagem_tipo(p_tipo text)
returns text
language sql immutable
set search_path = hub, public
as $$
  select case when p_tipo in ('texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'outro') then p_tipo else 'outro' end
$$;

-- o estado da transcrição: só áudio tem; estado desconhecido vira sem_servico
create or replace function hub.gr_transcricao_inicial(p_tipo text, p_estado text)
returns text
language sql immutable
set search_path = hub, public
as $$
  select case
    when p_tipo is distinct from 'audio' then 'nao_se_aplica'
    when p_estado in ('pendente', 'feita', 'falhou', 'sem_servico', 'nao_transcrito') then p_estado
    else 'sem_servico'
  end
$$;

-- o momento da mensagem (texto ISO); valor estranho vira agora
create or replace function hub.gr_momento(p_valor text)
returns timestamptz
language plpgsql stable
set search_path = hub, public
as $$
begin
  return coalesce(nullif(btrim(coalesce(p_valor, '')), '')::timestamptz, now());
exception when others then
  return now();
end $$;

-- grava UMA mensagem. A repetida (mesmo whatsapp_id no grupo) é ignorada e devolve nulo.
-- Atualiza a última mensagem do grupo e o nome dele, quando a uazapi manda o nome.
create or replace function hub.gr_mensagem_gravar(p_grupo uuid, p_dados jsonb)
returns bigint
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_id        bigint;
  v_tipo      text;
  v_momento   timestamptz;
  v_nome      text;
begin
  if jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'A mensagem veio num formato que a solução não entende.';
  end if;
  if not exists (select 1 from hub.gr_grupos where id = p_grupo) then
    raise exception 'Este grupo não existe mais.';
  end if;
  v_tipo    := hub.gr_mensagem_tipo(p_dados ->> 'tipo');
  v_momento := hub.gr_momento(p_dados ->> 'momento');
  insert into hub.gr_mensagens (grupo_id, whatsapp_id, autor_jid, autor_nome, do_time, tipo, texto, arquivo_nome,
                                transcricao, citada_id, momento)
  values (p_grupo,
          nullif(left(p_dados ->> 'whatsapp_id', 200), ''),
          nullif(left(regexp_replace(p_dados ->> 'autor_jid', ':\d+@', '@'), 200), ''),
          nullif(left(btrim(coalesce(p_dados ->> 'autor_nome', '')), 200), ''),
          coalesce((p_dados -> 'do_time') = to_jsonb(true), false),
          v_tipo,
          left(p_dados ->> 'texto', 20000),
          nullif(left(p_dados ->> 'arquivo_nome', 300), ''),
          hub.gr_transcricao_inicial(v_tipo, p_dados ->> 'transcricao'),
          nullif(left(p_dados ->> 'citada_id', 200), ''),
          v_momento)
  on conflict (grupo_id, whatsapp_id) do nothing
  returning id into v_id;

  if v_id is not null then
    v_nome := nullif(left(btrim(coalesce(p_dados ->> 'grupo_nome', '')), 200), '');
    update hub.gr_grupos
       set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_momento), v_momento),
           nome = coalesce(v_nome, nome)
     where id = p_grupo;
  end if;
  return v_id;
end $$;

-- grava um LOTE de mensagens (a importação das recentes). Ignora as repetidas pelo
-- whatsapp_id, atualiza a última mensagem do grupo com a mais nova e devolve quantas entraram.
-- Se o lote inteiro falhar (uma mensagem que o banco recusa), grava item a item: a mensagem
-- recusada fica de fora, as outras entram e o registro de falhas conta quantas ficaram de fora.
create or replace function hub.gr_mensagens_gravar_lote(p_grupo uuid, p_itens jsonb)
returns int
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_n         int;
  v_mais_nova timestamptz;
  v_item      jsonb;
  v_recusadas int := 0;
  v_codigo    text;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'O lote de mensagens precisa ser uma lista.';
  end if;
  if not exists (select 1 from hub.gr_grupos where id = p_grupo) then
    raise exception 'Este grupo não existe mais.';
  end if;
  begin
  with itens as (
    select distinct on (left(e ->> 'whatsapp_id', 200))
           e, left(e ->> 'whatsapp_id', 200) as wid, hub.gr_mensagem_tipo(e ->> 'tipo') as tipo
      from jsonb_array_elements(p_itens) e
     where jsonb_typeof(e) = 'object' and coalesce(e ->> 'whatsapp_id', '') <> ''
  ), novos as (
    insert into hub.gr_mensagens (grupo_id, whatsapp_id, autor_jid, autor_nome, do_time, tipo, texto, arquivo_nome,
                                  transcricao, citada_id, momento)
    select p_grupo, i.wid,
           nullif(left(regexp_replace(i.e ->> 'autor_jid', ':\d+@', '@'), 200), ''),
           nullif(left(btrim(coalesce(i.e ->> 'autor_nome', '')), 200), ''),
           coalesce((i.e -> 'do_time') = to_jsonb(true), false),
           i.tipo,
           left(i.e ->> 'texto', 20000),
           nullif(left(i.e ->> 'arquivo_nome', 300), ''),
           hub.gr_transcricao_inicial(i.tipo, i.e ->> 'transcricao'),
           nullif(left(i.e ->> 'citada_id', 200), ''),
           hub.gr_momento(i.e ->> 'momento')
      from itens i
    on conflict (grupo_id, whatsapp_id) do nothing
    returning momento
  )
  select count(*)::int, max(momento) into v_n, v_mais_nova from novos;
  exception when others then
    -- o lote voltou atrás inteiro: agora vai uma mensagem por vez
    v_n := 0;
    for v_item in
      select e from jsonb_array_elements(p_itens) e
       where jsonb_typeof(e) = 'object' and coalesce(e ->> 'whatsapp_id', '') <> ''
    loop
      begin
        if hub.gr_mensagem_gravar(p_grupo, v_item - 'grupo_nome') is not null then
          v_n := v_n + 1;
        end if;
      exception when others then
        v_recusadas := v_recusadas + 1;
        v_codigo := sqlstate;
      end;
    end loop;
    if v_recusadas > 0 then
      perform hub.gr_registro_gravar('importacao', 'O banco recusou algumas mensagens da importação, e elas ficaram de fora.',
        jsonb_build_object('grupo', p_grupo, 'recusadas', v_recusadas, 'codigo', v_codigo));
    end if;
    return v_n;
  end;

  if coalesce(v_n, 0) > 0 then
    update hub.gr_grupos
       set ultima_mensagem_em = greatest(coalesce(ultima_mensagem_em, v_mais_nova), v_mais_nova)
     where id = p_grupo;
  end if;
  return coalesce(v_n, 0);
end $$;

-- grava o resultado da transcrição de um áudio (feita com o texto, falhou ou sem_servico)
create or replace function hub.gr_transcricao_gravar(p_mensagem bigint, p_estado text, p_texto text default null)
returns void
language plpgsql security definer
set search_path = hub, public
as $$
begin
  if coalesce(p_estado, '') not in ('pendente', 'feita', 'falhou', 'sem_servico', 'nao_transcrito') then
    raise exception 'A solução não conhece o estado de transcrição "%".', coalesce(p_estado, '');
  end if;
  update hub.gr_mensagens
     set transcricao = p_estado,
         texto = case when p_estado = 'feita' then left(coalesce(p_texto, ''), 20000) else texto end,
         transcricao_tentativas = transcricao_tentativas + case when p_estado = 'falhou' then 1 else 0 end
   where id = p_mensagem and tipo = 'audio';
end $$;

-- Devolve os áudios que esperam transcrição: os de um grupo (logo depois da importação) ou os de
-- todos (a agenda pega os que ficaram para trás há mais de p_idade_min minutos). Com p_com_falhas,
-- vêm também os que falharam há menos de 24 horas, até 3 novas tentativas (a agenda).
drop function if exists hub.gr_audios_pendentes(uuid, int, int);
create or replace function hub.gr_audios_pendentes(p_grupo uuid default null, p_idade_min int default 0, p_limite int default 30,
                                                   p_com_falhas boolean default false)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'grupo_id', m.grupo_id, 'whatsapp_id', m.whatsapp_id)
                            order by m.momento desc), '[]'::jsonb)
    from (
      select m0.id, m0.grupo_id, m0.whatsapp_id, m0.momento
        from hub.gr_mensagens m0
        join hub.gr_grupos g on g.id = m0.grupo_id and not g.exemplo
       where m0.tipo = 'audio'
         and (p_grupo is null or m0.grupo_id = p_grupo)
         and ((m0.transcricao = 'pendente'
               and m0.recebida_em <= now() - make_interval(mins => greatest(coalesce(p_idade_min, 0), 0)))
              or (coalesce(p_com_falhas, false) and m0.transcricao = 'falhou'
                  and m0.recebida_em > now() - interval '24 hours'
                  and m0.transcricao_tentativas between 1 and 3))
       order by m0.momento desc
       limit least(greatest(coalesce(p_limite, 30), 1), 100)) m;
$$;

-- A imagem ou o vídeo de uma mensagem, para a gr-api pedir o arquivo à uazapi e a conversa mostrar
-- (versão 1.0.5): o identificador da mensagem no WhatsApp, o tipo e se o grupo é o de exemplo.
-- Nulo quando a mensagem não existe. Quem confere o acesso de quem pede é a gr-api (nível ver).
create or replace function hub.gr_midia_da_mensagem(p_mensagem bigint)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select jsonb_build_object('id', m.id, 'grupo_id', m.grupo_id, 'whatsapp_id', m.whatsapp_id, 'tipo', m.tipo,
                            'exemplo', g.exemplo)
    from hub.gr_mensagens m
    join hub.gr_grupos g on g.id = m.grupo_id
   where m.id = p_mensagem
$$;

-- ── ajustes ─────────────────────────────────────────────────────────────────

-- os ajustes para a Edge Function: o formato completo mais o endereço das funções. Só a
-- gr-api chama (service_role), e ela só devolve o completo a quem configura a solução.
create or replace function hub.gr_ajustes_ler()
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select hub.gr_ajustes_json(true)
         || jsonb_build_object('funcoes_url', (select a.funcoes_url from hub.gr_ajustes a where a.id = 1))
$$;

-- grava só as chaves que vierem (chave presente com valor nulo apaga o campo)
create or replace function hub.gr_ajustes_gravar(p_dados jsonb, p_user uuid default null)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  d jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
begin
  insert into hub.gr_ajustes (id) values (1) on conflict (id) do nothing;
  update hub.gr_ajustes a set
    whatsapp_servidor     = case when d ? 'whatsapp_servidor' then nullif(btrim(coalesce(d ->> 'whatsapp_servidor', '')), '') else a.whatsapp_servidor end,
    whatsapp_estado       = case when d ? 'whatsapp_estado' then coalesce(nullif(d ->> 'whatsapp_estado', ''), 'desligado') else a.whatsapp_estado end,
    whatsapp_numero       = case when d ? 'whatsapp_numero' then nullif(btrim(coalesce(d ->> 'whatsapp_numero', '')), '') else a.whatsapp_numero end,
    whatsapp_erro         = case when d ? 'whatsapp_erro' then nullif(left(d ->> 'whatsapp_erro', 500), '') else a.whatsapp_erro end,
    whatsapp_conferido_em = case when d ? 'whatsapp_estado' then now() else a.whatsapp_conferido_em end,
    ia_provedor           = case when d ? 'ia_provedor' then nullif(d ->> 'ia_provedor', '') else a.ia_provedor end,
    ia_modelo             = case when d ? 'ia_modelo' then nullif(btrim(coalesce(d ->> 'ia_modelo', '')), '') else a.ia_modelo end,
    ia_url                = case when d ? 'ia_url' then nullif(btrim(coalesce(d ->> 'ia_url', '')), '') else a.ia_url end,
    transcricao_provedor  = case when d ? 'transcricao_provedor' then nullif(d ->> 'transcricao_provedor', '') else a.transcricao_provedor end,
    transcricao_modelo    = case when d ? 'transcricao_modelo' then nullif(btrim(coalesce(d ->> 'transcricao_modelo', '')), '') else a.transcricao_modelo end,
    transcricao_chave_da_ia = case when d ? 'transcricao_chave_da_ia' then coalesce((d ->> 'transcricao_chave_da_ia')::boolean, false) else a.transcricao_chave_da_ia end,
    funcoes_url           = case when d ? 'funcoes_url' then nullif(btrim(coalesce(d ->> 'funcoes_url', '')), '') else a.funcoes_url end,
    atualizado_em         = now(),
    atualizado_por        = coalesce(p_user, a.atualizado_por)
  where a.id = 1;
  return hub.gr_ajustes_json(true);
end $$;

-- ── grupos e participantes ──────────────────────────────────────────────────

-- os jids que a solução já acompanha (para a lista da uazapi marcar "acompanhando")
create or replace function hub.gr_grupos_jids()
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'jid', g.jid, 'ativo', g.ativo, 'exemplo', g.exemplo)), '[]'::jsonb)
    from hub.gr_grupos g
$$;

-- cria os grupos que faltam ([{ jid, nome, pessoas }]) e atualiza nome e pessoas dos que já existem.
-- O endereço exemplo-contorno@g.us é reservado ao grupo de exemplo, então a lista nunca cria nem
-- devolve um grupo com ele.
-- Devolve { criados, novos: [{ id, jid }], grupos: [{ id, jid, nome, pessoas, ativo, novo, importando }] }
create or replace function hub.gr_grupos_criar(p_lista jsonb, p_user uuid default null)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_novos  jsonb;
  v_grupos jsonb;
begin
  if jsonb_typeof(p_lista) is distinct from 'array' then
    raise exception 'A lista de grupos precisa ser uma lista.';
  end if;
  with itens as (
    select distinct on (e ->> 'jid')
           e ->> 'jid' as jid,
           left(coalesce(nullif(btrim(coalesce(e ->> 'nome', '')), ''), 'Grupo sem nome'), 200) as nome,
           greatest(coalesce(case when jsonb_typeof(e -> 'pessoas') = 'number' then floor((e ->> 'pessoas')::numeric)::int end, 0), 0) as pessoas
      from jsonb_array_elements(p_lista) e
     where jsonb_typeof(e) = 'object' and coalesce(e ->> 'jid', '') ~ '@g\.us$'
       and e ->> 'jid' <> 'exemplo-contorno@g.us'
  ), novos as (
    insert into hub.gr_grupos (jid, nome, pessoas, criado_por)
    select i.jid, i.nome, i.pessoas, p_user from itens i
    on conflict (jid) do nothing
    returning id, jid
  ), atualizados as (
    update hub.gr_grupos g
       set nome = i.nome,
           pessoas = case when i.pessoas > 0 then i.pessoas else g.pessoas end,
           atualizado_em = now()
      from itens i
     where g.jid = i.jid and not g.exemplo
       and not exists (select 1 from novos n where n.jid = i.jid)
    returning g.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'jid', n.jid)), '[]'::jsonb) into v_novos from novos n;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'jid', g.jid, 'nome', g.nome, 'pessoas', g.pessoas, 'ativo', g.ativo,
           'novo', exists (select 1 from jsonb_array_elements(v_novos) x where x ->> 'id' = g.id::text),
           'importando', hub.gr_importando(g.importado_em, g.criado_em))
         order by lower(g.nome)), '[]'::jsonb)
    into v_grupos
    from hub.gr_grupos g
   where g.jid in (select e ->> 'jid' from jsonb_array_elements(p_lista) e where jsonb_typeof(e) = 'object')
     and not g.exemplo and g.jid <> 'exemplo-contorno@g.us';

  return jsonb_build_object('criados', jsonb_array_length(v_novos), 'novos', v_novos, 'grupos', v_grupos);
end $$;

-- troca a lista de participantes de um grupo ([{ jid, nome, telefone, admin }]) e atualiza
-- o número de pessoas (e o nome do grupo, quando vier). Devolve a lista no formato das telas.
create or replace function hub.gr_participantes_gravar(p_grupo uuid, p_lista jsonb, p_nome text default null)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
begin
  if jsonb_typeof(p_lista) is distinct from 'array' then
    raise exception 'A lista de participantes precisa ser uma lista.';
  end if;
  if not exists (select 1 from hub.gr_grupos where id = p_grupo) then
    raise exception 'Este grupo não existe mais.';
  end if;
  -- lista nova sem ninguém (resposta incompleta da uazapi) não apaga a lista que já existe
  if not exists (select 1 from jsonb_array_elements(p_lista) e where jsonb_typeof(e) = 'object' and coalesce(e ->> 'jid', '') <> '')
     and exists (select 1 from hub.gr_participantes p where p.grupo_id = p_grupo) then
    update hub.gr_grupos g
       set nome = coalesce(nullif(left(btrim(coalesce(p_nome, '')), 200), ''), g.nome), atualizado_em = now()
     where g.id = p_grupo;
    return hub.gr_participantes_json(p_grupo);
  end if;
  with itens as (
    select distinct on (left(e ->> 'jid', 200))
           left(e ->> 'jid', 200) as jid,
           nullif(left(btrim(coalesce(e ->> 'nome', '')), 200), '') as nome,
           nullif(left(regexp_replace(coalesce(e ->> 'telefone', ''), '\D', '', 'g'), 30), '') as telefone,
           coalesce((e -> 'admin') = to_jsonb(true), false) as admin
      from jsonb_array_elements(p_lista) e
     where jsonb_typeof(e) = 'object' and coalesce(e ->> 'jid', '') <> ''
  ), saiu as (
    delete from hub.gr_participantes p
     where p.grupo_id = p_grupo and p.jid not in (select i.jid from itens i)
  )
  insert into hub.gr_participantes (grupo_id, jid, nome, telefone, admin, atualizado_em)
  select p_grupo, i.jid, i.nome, i.telefone, i.admin, now() from itens i
  on conflict (grupo_id, jid) do update
     set nome = coalesce(excluded.nome, hub.gr_participantes.nome),
         telefone = coalesce(excluded.telefone, hub.gr_participantes.telefone),
         admin = excluded.admin,
         atualizado_em = now();

  update hub.gr_grupos g
     set pessoas = (select count(*) from hub.gr_participantes p where p.grupo_id = p_grupo),
         nome = coalesce(nullif(left(btrim(coalesce(p_nome, '')), 200), ''), g.nome),
         atualizado_em = now()
   where g.id = p_grupo;
  return hub.gr_participantes_json(p_grupo);
end $$;

-- Começa de novo a importação de um grupo já acompanhado (a ação reimportar). Recusa o grupo
-- de exemplo, o grupo pausado e o grupo que ainda está importando. Devolve { id, jid, nome }.
create or replace function hub.gr_importacao_comecar(p_grupo uuid)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  g hub.gr_grupos;
begin
  select * into g from hub.gr_grupos where id = p_grupo for update;
  if not found then
    raise exception 'Este grupo não existe mais. Ele pode ter sido removido, então volte para a lista de grupos.';
  end if;
  if g.exemplo then
    raise exception 'O grupo de exemplo não está no WhatsApp, então não há mensagens para trazer.';
  end if;
  if not g.ativo then
    raise exception 'Este grupo está pausado. Retome o grupo antes de trazer as mensagens de novo.';
  end if;
  if hub.gr_importando(g.importado_em, coalesce(g.importacao_inicio, g.criado_em)) then
    raise exception 'As mensagens deste grupo ainda estão chegando. Espere a importação terminar para pedir de novo.';
  end if;
  update hub.gr_grupos
     set importado_em = null, importacao_inicio = now(), importadas = null, importacao_erro = null
   where id = p_grupo;
  return jsonb_build_object('id', g.id, 'jid', g.jid, 'nome', g.nome);
end $$;

-- a importação das mensagens recentes terminou (com tudo ou com o que deu para trazer): guarda
-- quantas mensagens entraram e, quando parou no meio, a frase da solução que explica
drop function if exists hub.gr_importacao_concluir(uuid);
create or replace function hub.gr_importacao_concluir(p_grupo uuid, p_importadas int default null, p_erro text default null)
returns void
language sql security definer
set search_path = hub, public
as $$
  update hub.gr_grupos
     set importado_em = now(),
         importadas = coalesce(p_importadas, importadas),
         importacao_erro = nullif(left(btrim(coalesce(p_erro, '')), 500), '')
   where id = p_grupo and importado_em is null
$$;

-- o que o resumo e a pergunta precisam do grupo: dados, orientações e participantes
create or replace function hub.gr_grupo_dados(p_grupo uuid)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select jsonb_build_object(
           'id', g.id, 'jid', g.jid, 'nome', g.nome, 'exemplo', g.exemplo, 'ativo', g.ativo,
           'orientacoes', g.orientacoes, 'pessoas', g.pessoas, 'resumo_envia', g.resumo_envia,
           'participantes', coalesce((select jsonb_agg(jsonb_build_object('jid', p.jid, 'nome', p.nome,
                                                                          'telefone', p.telefone, 'admin', p.admin))
                                        from hub.gr_participantes p where p.grupo_id = g.id), '[]'::jsonb))
    from hub.gr_grupos g
   where g.id = p_grupo
$$;

-- ── resumo e pergunta ───────────────────────────────────────────────────────

-- as mensagens de um período, da mais antiga para a mais nova (as p_limite mais recentes),
-- com a citada de cada uma e o total do período
create or replace function hub.gr_mensagens_periodo(p_grupo uuid, p_inicio timestamptz, p_fim timestamptz, p_limite int default 4000)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  with escolhidas as (
    select m.*
      from hub.gr_mensagens m
     where m.grupo_id = p_grupo and m.momento >= p_inicio and m.momento < p_fim
     order by m.momento desc, m.id desc
     limit least(greatest(coalesce(p_limite, 4000), 1), 6000)
  )
  select jsonb_build_object(
    'total', (select count(*) from hub.gr_mensagens m
               where m.grupo_id = p_grupo and m.momento >= p_inicio and m.momento < p_fim),
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'whatsapp_id', e.whatsapp_id, 'autor_jid', e.autor_jid, 'autor_nome', e.autor_nome,
               'do_time', e.do_time, 'tipo', e.tipo, 'texto', e.texto, 'arquivo_nome', e.arquivo_nome,
               'transcricao', e.transcricao, 'momento', e.momento, 'citada_id', e.citada_id,
               'citada', (select jsonb_build_object('autor_nome', c.autor_nome, 'texto', left(c.texto, 200))
                            from hub.gr_mensagens c
                           where e.citada_id is not null and c.grupo_id = e.grupo_id and c.whatsapp_id = e.citada_id
                           limit 1))
             order by e.momento, e.id)
        from escolhidas e), '[]'::jsonb))
$$;

-- os trechos dos materiais de apoio que combinam com as palavras (busca por palavras no
-- próprio banco), dos que mais combinam para os que menos, até p_limite caracteres
create or replace function hub.gr_materiais_trechos(p_grupo uuid, p_termos text, p_limite int default 6000)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v_q      tsquery;
  v_limite int := least(greatest(coalesce(p_limite, 6000), 200), 20000);
  v_total  int := 0;
  v_saida  jsonb := '[]'::jsonb;
  v_pedaco text;
  r        record;
begin
  -- cada palavra vira um termo "ou": basta o trecho ter uma delas
  select to_tsquery('simple', string_agg(quote_literal(l.lexeme), ' | '))
    into v_q
    from unnest(to_tsvector('portuguese', left(coalesce(p_termos, ''), 4000))) l;
  if v_q is null then
    return v_saida;
  end if;
  for r in
    select t.titulo, t.paragrafo,
           ts_rank(to_tsvector('portuguese', t.titulo || ' ' || t.paragrafo), v_q) as nota
      from (
        select m.titulo, btrim(p.paragrafo) as paragrafo, m.criado_em
          from hub.gr_materiais m
          cross join lateral regexp_split_to_table(m.texto, '\n\s*\n') as p(paragrafo)
         where m.grupo_id = p_grupo and m.busca @@ v_q) t
     where t.paragrafo <> '' and to_tsvector('portuguese', t.titulo || ' ' || t.paragrafo) @@ v_q
     order by nota desc, t.criado_em, t.titulo
     limit 60
  loop
    exit when v_total >= v_limite;
    v_pedaco := left(r.paragrafo, v_limite - v_total);
    v_saida := v_saida || jsonb_build_array(jsonb_build_object('titulo', r.titulo, 'trecho', v_pedaco));
    v_total := v_total + length(v_pedaco);
  end loop;
  return v_saida;
end $$;

-- guarda um resumo pronto (o JSON da IA já conferido pela gr-api) e devolve a linha inteira
create or replace function hub.gr_resumo_gravar(p_grupo uuid, p_dados jsonb)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v hub.gr_resumos;
begin
  if jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'O resumo veio num formato que a solução não entende.';
  end if;
  if jsonb_typeof(p_dados -> 'conteudo') is distinct from 'object' or jsonb_typeof(p_dados -> 'numeros') is distinct from 'object' then
    raise exception 'O resumo está sem o conteúdo ou sem os números.';
  end if;
  if coalesce(btrim(p_dados ->> 'texto_whatsapp'), '') = '' then
    raise exception 'O resumo está sem o texto para o WhatsApp.';
  end if;
  if coalesce(p_dados ->> 'periodo', '') not in ('6h', '12h', '24h', 'hoje', 'ontem', '7d', 'datas') then
    raise exception 'O período do resumo é desconhecido.';
  end if;
  insert into hub.gr_resumos (grupo_id, periodo, inicio, fim, conteudo, numeros, texto_whatsapp, mensagens_usadas,
                              mensagens_fora, origem, pedido_por, modelo)
  values (p_grupo, p_dados ->> 'periodo', (p_dados ->> 'inicio')::timestamptz, (p_dados ->> 'fim')::timestamptz,
          p_dados -> 'conteudo', p_dados -> 'numeros', left(p_dados ->> 'texto_whatsapp', 6000),
          coalesce((p_dados ->> 'mensagens_usadas')::int, 0), coalesce((p_dados ->> 'mensagens_fora')::int, 0),
          case when p_dados ->> 'origem' = 'automatico' then 'automatico' else 'pedido' end,
          nullif(p_dados ->> 'pedido_por', '')::uuid, left(p_dados ->> 'modelo', 120))
  returning * into v;
  return to_jsonb(v);
end $$;

-- o que o envio precisa saber do resumo e do grupo
create or replace function hub.gr_resumo_para_envio(p_resumo uuid)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select jsonb_build_object('id', r.id, 'grupo_id', r.grupo_id, 'jid', g.jid, 'nome', g.nome, 'exemplo', g.exemplo,
                            'ativo', g.ativo, 'texto_whatsapp', r.texto_whatsapp, 'enviado_em', r.enviado_em)
    from hub.gr_resumos r
    join hub.gr_grupos g on g.id = r.grupo_id
   where r.id = p_resumo
$$;

-- Reserva o envio, para o mesmo resumo não sair duas vezes por engano (dois cliques, duas abas,
-- ou a agenda junto com uma pessoa). Devolve { reservado: true }, ou { ja_enviado: true,
-- enviado_em } quando o resumo já foi enviado e p_reenviar não veio, ou { enviando: true }
-- quando outro envio do mesmo resumo começou há menos de 2 minutos. A gr-api libera a reserva
-- se a uazapi falhar (gr_resumo_liberar_envio) e a gr_resumo_marcar_envio fecha quando dá certo.
-- O resumo do grupo de exemplo é recusado com erro, porque o exemplo não está no WhatsApp.
create or replace function hub.gr_resumo_reservar_envio(p_resumo uuid, p_reenviar boolean default false)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_enviado  timestamptz;
  v_enviando timestamptz;
  v_exemplo  boolean;
begin
  select r.enviado_em, r.enviando_em, g.exemplo into v_enviado, v_enviando, v_exemplo
    from hub.gr_resumos r join hub.gr_grupos g on g.id = r.grupo_id
   where r.id = p_resumo for update of r;
  if not found then
    raise exception 'Este resumo não existe mais.';
  end if;
  -- o grupo de exemplo não está no WhatsApp: nenhum resumo dele (nem o resumo pronto) vai para um grupo
  if v_exemplo then
    raise exception 'O grupo de exemplo não recebe mensagens de verdade, então o resumo dele não vai para o grupo.';
  end if;
  if v_enviado is not null and not coalesce(p_reenviar, false) then
    return jsonb_build_object('ja_enviado', true, 'enviado_em', v_enviado);
  end if;
  if v_enviando is not null and v_enviando > now() - interval '2 minutes' then
    return jsonb_build_object('enviando', true);
  end if;
  update hub.gr_resumos set enviando_em = now() where id = p_resumo;
  return jsonb_build_object('reservado', true);
end $$;

-- solta a reserva do envio que não deu certo (o resumo pode ser enviado de novo na hora)
create or replace function hub.gr_resumo_liberar_envio(p_resumo uuid)
returns void
language sql security definer
set search_path = hub, public
as $$ update hub.gr_resumos set enviando_em = null where id = p_resumo $$;

-- marca o resumo como enviado (data, quem mandou e o texto que foi) e solta a reserva
create or replace function hub.gr_resumo_marcar_envio(p_resumo uuid, p_user uuid, p_texto text)
returns timestamptz
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v timestamptz;
begin
  update hub.gr_resumos
     set enviado_em = now(), enviado_por = p_user, enviado_texto = left(p_texto, 6000), enviando_em = null
   where id = p_resumo
  returning enviado_em into v;
  if v is null then
    raise exception 'Este resumo não existe mais.';
  end if;
  return v;
end $$;

-- Começa uma pergunta à IA: confere o limite de 30 perguntas por pessoa por hora e guarda a
-- pergunta com a resposta vazia, antes de a gr-api chamar a IA. Devolve o id, ou nulo quando a
-- pessoa passou do limite. A trava por pessoa (advisory lock) faz duas perguntas ao mesmo tempo
-- contarem uma depois da outra. A pergunta que a IA não respondeu também conta no limite.
create or replace function hub.gr_pergunta_comecar(p_grupo uuid, p_user uuid, p_pergunta text, p_periodo text,
                                                    p_inicio timestamptz, p_fim timestamptz)
returns bigint
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v bigint;
begin
  if p_user is null then
    raise exception 'A pergunta precisa de uma pessoa logada.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gr_perguntas:' || p_user::text, 0));
  if (select count(*) from hub.gr_perguntas q
       where q.user_id = p_user and q.criado_em > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  insert into hub.gr_perguntas (grupo_id, user_id, pergunta, resposta, periodo, inicio, fim)
  values (p_grupo, p_user, left(coalesce(p_pergunta, ''), 1000), '', p_periodo, p_inicio, p_fim)
  returning id into v;
  return v;
end $$;

-- guarda a resposta da IA na pergunta começada em gr_pergunta_comecar
create or replace function hub.gr_pergunta_responder(p_pergunta bigint, p_resposta text, p_modelo text)
returns bigint
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v bigint;
begin
  update hub.gr_perguntas
     set resposta = left(coalesce(p_resposta, ''), 10000), modelo = left(p_modelo, 120)
   where id = p_pergunta
  returning id into v;
  if v is null then
    raise exception 'Esta pergunta não existe mais.';
  end if;
  return v;
end $$;

-- guarda uma pergunta feita à IA e a resposta dela, de uma vez (sem passar pelo limite)
create or replace function hub.gr_pergunta_gravar(p_grupo uuid, p_user uuid, p_pergunta text, p_resposta text,
                                                   p_periodo text, p_inicio timestamptz, p_fim timestamptz, p_modelo text)
returns bigint
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v bigint;
begin
  if p_user is null then
    raise exception 'A pergunta precisa de uma pessoa logada.';
  end if;
  insert into hub.gr_perguntas (grupo_id, user_id, pergunta, resposta, periodo, inicio, fim, modelo)
  values (p_grupo, p_user, left(coalesce(p_pergunta, ''), 1000), left(coalesce(p_resposta, ''), 10000),
          p_periodo, p_inicio, p_fim, left(p_modelo, 120))
  returning id into v;
  return v;
end $$;

-- apaga o registro de falhas com mais de 30 dias e as perguntas que ficaram sem resposta há
-- mais de um dia (a IA falhou e a pergunta já não conta no limite). Devolve quantas linhas do
-- registro saíram.
create or replace function hub.gr_registro_limpar()
returns int
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v int;
begin
  delete from hub.gr_perguntas where resposta = '' and criado_em < now() - interval '1 day';
  delete from hub.gr_registro where criado_em < now() - interval '30 days';
  get diagnostics v = row_count;
  return v;
end $$;

-- O WhatsApp manda o autor com o aparelho no fim ("123:92@lid"). Instalação que guardou mensagens
-- antes de a gravação tirar esse trecho tinha a mesma pessoa duas vezes; aqui as mensagens antigas
-- ficam com o identificador da pessoa. Roda de novo sem efeito.
update hub.gr_mensagens set autor_jid = regexp_replace(autor_jid, ':\d+@', '@') where autor_jid ~ ':\d+@';

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function
  hub.gr_grupo_jid_ativo(text), hub.gr_mensagem_tipo(text), hub.gr_transcricao_inicial(text, text), hub.gr_momento(text),
  hub.gr_mensagem_gravar(uuid, jsonb), hub.gr_mensagens_gravar_lote(uuid, jsonb), hub.gr_transcricao_gravar(bigint, text, text),
  hub.gr_audios_pendentes(uuid, int, int, boolean), hub.gr_midia_da_mensagem(bigint), hub.gr_ajustes_ler(), hub.gr_ajustes_gravar(jsonb, uuid), hub.gr_grupos_jids(),
  hub.gr_grupos_criar(jsonb, uuid), hub.gr_participantes_gravar(uuid, jsonb, text), hub.gr_importacao_comecar(uuid), hub.gr_importacao_concluir(uuid, int, text),
  hub.gr_grupo_dados(uuid), hub.gr_mensagens_periodo(uuid, timestamptz, timestamptz, int),
  hub.gr_materiais_trechos(uuid, text, int), hub.gr_resumo_gravar(uuid, jsonb), hub.gr_resumo_para_envio(uuid),
  hub.gr_resumo_reservar_envio(uuid, boolean), hub.gr_resumo_liberar_envio(uuid), hub.gr_resumo_marcar_envio(uuid, uuid, text),
  hub.gr_pergunta_comecar(uuid, uuid, text, text, timestamptz, timestamptz), hub.gr_pergunta_responder(bigint, text, text),
  hub.gr_pergunta_gravar(uuid, uuid, text, text, text, timestamptz, timestamptz, text), hub.gr_registro_limpar()
from public, anon, authenticated;

grant execute on function
  hub.gr_grupo_jid_ativo(text), hub.gr_mensagem_tipo(text), hub.gr_transcricao_inicial(text, text), hub.gr_momento(text),
  hub.gr_mensagem_gravar(uuid, jsonb), hub.gr_mensagens_gravar_lote(uuid, jsonb), hub.gr_transcricao_gravar(bigint, text, text),
  hub.gr_audios_pendentes(uuid, int, int, boolean), hub.gr_midia_da_mensagem(bigint), hub.gr_ajustes_ler(), hub.gr_ajustes_gravar(jsonb, uuid), hub.gr_grupos_jids(),
  hub.gr_grupos_criar(jsonb, uuid), hub.gr_participantes_gravar(uuid, jsonb, text), hub.gr_importacao_comecar(uuid), hub.gr_importacao_concluir(uuid, int, text),
  hub.gr_grupo_dados(uuid), hub.gr_mensagens_periodo(uuid, timestamptz, timestamptz, int),
  hub.gr_materiais_trechos(uuid, text, int), hub.gr_resumo_gravar(uuid, jsonb), hub.gr_resumo_para_envio(uuid),
  hub.gr_resumo_reservar_envio(uuid, boolean), hub.gr_resumo_liberar_envio(uuid), hub.gr_resumo_marcar_envio(uuid, uuid, text),
  hub.gr_pergunta_comecar(uuid, uuid, text, text, timestamptz, timestamptz), hub.gr_pergunta_responder(bigint, text, text),
  hub.gr_pergunta_gravar(uuid, uuid, text, text, text, timestamptz, timestamptz, text), hub.gr_registro_limpar()
to service_role;
