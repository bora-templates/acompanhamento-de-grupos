-- FUNCTION: app_push_enviar(uuid[], text, text, text, text)
CREATE FUNCTION hub.app_push_enviar(p_users uuid[], p_titulo text, p_corpo text, p_link text, p_tag text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_users uuid[];
begin
  select array_agg(distinct a.user_id) into v_users
    from hub.app_aparelhos a join hub.users u on u.id = a.user_id and u.active
   where a.user_id = any(p_users) and a.desconectado_em is null;
  if v_users is null then return; end if;

  perform net.http_post(
    url     := 'https://SEU_PROJETO.supabase.co/functions/v1/app-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-app-push-token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_app-push')),
    body    := jsonb_build_object('user_ids', to_jsonb(v_users),
                 'titulo', left(coalesce(p_titulo, 'Aviso'), 80),
                 'corpo',  left(coalesce(p_corpo, ''), 200),
                 'link',   coalesce(p_link, '/'),
                 'tag',    p_tag),
    timeout_milliseconds := 10000);
exception when others then
  raise warning '[app_push_enviar] %', sqlerrm;
end $$;

-- FUNCTION: app_registra_uso(text, text)
CREATE FUNCTION hub.app_registra_uso(p_onde text, p_rotulo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if not hub.e_do_time() or p_onde not in ('app', 'navegador') then return; end if;
  insert into hub.app_uso (user_id, onde, rotulo)
  values (auth.uid(), p_onde, left(p_rotulo, 40))
  on conflict (user_id, dia, onde) do update
     set ultimo_em = now(), aberturas = hub.app_uso.aberturas + 1,
         rotulo = coalesce(excluded.rotulo, hub.app_uso.rotulo);
end $$;

-- FUNCTION: app_sou_admin_usuarios()
CREATE FUNCTION hub.app_sou_admin_usuarios() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u
     where u.id = auth.uid() and coalesce(u.active, false)
       and (u.access_level = 'admin' or (u.acessos->>'rh') = 'admin')
  );
$$;

-- FUNCTION: avisa_liberacao_no_sistema()
CREATE FUNCTION hub.avisa_liberacao_no_sistema() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
    v_pessoa text;
    v_cargo  text;
    v_area   uuid;
    v_gestor record;
begin
    select u.full_name into v_pessoa from hub.users u where u.id = new.user_id;
    select r.name, r.area_id into v_cargo, v_area
      from hub.roles r where r.id = new.role_id;

    for v_gestor in
        select u.id
          from hub.users u
         where u.active
           and u.tenant_id = new.tenant_id
           and u.access_level in ('admin', 'manager')
           and coalesce(u.acessos->>'performance', 'true') <> 'false'
           and (
                 -- gestão da área de quem pediu
                 (v_area is not null and u.area_ids @> array[v_area])
                 -- Rede de segurança: área sem nenhum gestor cadastrado avisa
                 -- todo mundo que decide. Pedido parado sem ninguém saber é
                 -- exatamente o que aconteceu em 13/08 — barulho é melhor que
                 -- silêncio aqui.
                 or v_area is null
                 or not exists (
                      select 1 from hub.users g
                       where g.active and g.tenant_id = new.tenant_id
                         and g.access_level in ('admin','manager')
                         and g.area_ids @> array[v_area])
               )
    loop
        begin
            perform hub.avisar(
                v_gestor.id,
                'liberacao',
                'Metas',
                'Pedido de liberação · ' || coalesce(v_pessoa, 'alguém'),
                coalesce(v_pessoa, 'Alguém') || coalesce(' · ' || v_cargo, '') ||
                ' quer editar o dia ' || to_char(new.reference_date, 'DD/MM/YYYY') ||
                ', que já está fechado. Motivo: ' ||
                left(replace(coalesce(new.motivo, '—'), E'\n', ' '), 300),
                -- O id do pedido vai no link porque o hub.avisar descarta aviso
                -- repetido (mesmo tipo + mesmo link) dentro de 2 minutos. Sem
                -- isso, quem pede dois dias seguidos — foi o caso da Luciane,
                -- 12 segundos entre um e outro — só geraria UM aviso. A tela lê
                -- o #liberacoes e ignora a query.
                '/metas/app?lib=' || new.id || '#liberacoes',
                coalesce(v_pessoa, 'Metas')
            );
        exception when others then
            -- Aviso é recado, não pode derrubar o pedido (mesma cautela do Discord).
            raise warning 'Aviso no sistema falhou para %: %', v_gestor.id, sqlerrm;
        end;
    end loop;

    return new;
end;
$$;

-- FUNCTION: avisar(uuid, text, text, text, text, text, text, date)
CREATE FUNCTION hub.avisar(p_user uuid, p_tipo text, p_sistema text, p_titulo text, p_texto text, p_link text, p_autor text DEFAULT NULL::text, p_prazo date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if p_user is null or p_user = auth.uid() then return; end if;

  if exists (
    select 1 from hub.notificacoes
     where user_id = p_user and tipo = p_tipo
       and coalesce(link, '') = coalesce(p_link, '')
       and created_at > now() - interval '2 minutes'
  ) then return; end if;

  insert into hub.notificacoes(user_id, tipo, sistema, titulo, texto, link, autor, prazo)
    values (p_user, p_tipo, p_sistema, p_titulo, p_texto, p_link,
            coalesce(p_autor, hub.aviso_autor()), p_prazo);
exception when others then
  raise warning 'hub.avisar falhou (alocação segue): %', sqlerrm;
end; $$;

-- FUNCTION: avisar_alocacao_suc_atendimento()
CREATE FUNCTION hub.avisar_alocacao_suc_atendimento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_user uuid; v_titulo text; v_link text; v_antes text;
begin
  if auth.uid() is null then return new; end if;                       -- rotina automática não avisa
  if tg_op = 'UPDATE' and new.cs is not distinct from old.cs then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.title), ''), nullif(btrim(new.assunto), ''), 'Atendimento');
  v_link   := '/sucesso/admin?at=' || new.id;
  v_antes  := case when tg_op = 'UPDATE' then nullif(btrim(coalesce(old.cs, '')), '') else null end;

  if v_antes is not null and lower(v_antes) is distinct from lower(coalesce(btrim(new.cs), '')) then
    perform hub.registrar_alocacao('Sucesso', 'atendimento', new.id::text, v_titulo,
                                   v_antes, 'saiu', v_link, nullif(btrim(new.creator), ''));
  end if;

  if coalesce(btrim(new.cs), '') = '' then return new; end if;

  perform hub.registrar_alocacao('Sucesso', 'atendimento', new.id::text, v_titulo,
                                 btrim(new.cs), 'entrou', v_link, nullif(btrim(new.creator), ''));

  if coalesce(new.status_atendimento, '') in ('concluido', 'cancelado') then return new; end if;

  v_user := hub.aviso_user_por_nome(new.cs);
  if v_user is null then return new; end if;

  perform hub.avisar(
    v_user, 'alocacao', 'Sucesso', v_titulo,
    coalesce(nullif(btrim(new.client_name), ''), 'Sem cliente')
      || coalesce(' · ' || nullif(btrim(new.assunto), ''), ''),
    v_link, nullif(btrim(new.creator), ''), new.prazo::date);
  return new;
end; $$;

-- FUNCTION: avisar_alocacao_suc_encantamento()
CREATE FUNCTION hub.avisar_alocacao_suc_encantamento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_user uuid; nome text; v_titulo text; v_link text;
  v_antes text[]; v_depois text[];
begin
  if tg_op = 'UPDATE' and new.responsavel is not distinct from old.responsavel then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.titulo), ''), 'Envio da Produção');
  v_link   := '/sucesso/admin?enc=' || new.id;
  v_antes  := case when tg_op = 'UPDATE' then hub.aloc_nomes(old.responsavel) else '{}'::text[] end;
  v_depois := hub.aloc_nomes(new.responsavel);

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'saiu') loop
    perform hub.registrar_alocacao('Sucesso', 'producao', new.id::text, v_titulo,
                                   nome, 'saiu', v_link, null);
  end loop;

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'entrou') loop
    perform hub.registrar_alocacao('Sucesso', 'producao', new.id::text, v_titulo,
                                   nome, 'entrou', v_link, null);
    -- envio já resolvido não precisa de aviso novo
    if coalesce(new.status, '') in ('enviado', 'entregue', 'cancelado') then continue; end if;
    v_user := hub.aviso_user_por_nome(nome);
    if v_user is null then continue; end if;
    perform hub.avisar(
      v_user, 'alocacao', 'Sucesso', v_titulo,
      'Produção · ' || coalesce(nullif(btrim(new.cliente), ''), 'envio')
        || case when coalesce(new.tipo,'') <> '' then ' · ' || new.tipo else '' end,
      v_link, null, new.prazo::date);
  end loop;
  return new;
end; $$;

-- FUNCTION: avisar_alocacao_suc_tarefa()
CREATE FUNCTION hub.avisar_alocacao_suc_tarefa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_user uuid; nome text; v_titulo text; v_link text;
  v_antes text[]; v_depois text[];
begin
  if tg_op = 'UPDATE' and new.responsavel is not distinct from old.responsavel then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.titulo), ''), 'Tarefa');
  v_link   := '/sucesso/admin?tarefa=' || new.id;
  v_antes  := case when tg_op = 'UPDATE' then hub.aloc_nomes(old.responsavel) else '{}'::text[] end;
  v_depois := hub.aloc_nomes(new.responsavel);

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'saiu') loop
    perform hub.registrar_alocacao('Sucesso', 'tarefa', new.id::text, v_titulo,
                                   nome, 'saiu', v_link, nullif(btrim(new."criadoPor"), ''));
  end loop;

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'entrou') loop
    perform hub.registrar_alocacao('Sucesso', 'tarefa', new.id::text, v_titulo,
                                   nome, 'entrou', v_link, nullif(btrim(new."criadoPor"), ''));
    if new.status = 'concluido' then continue; end if;
    v_user := hub.aviso_user_por_nome(nome);
    if v_user is null then continue; end if;
    perform hub.avisar(
      v_user, 'alocacao', 'Sucesso', v_titulo,
      coalesce(nullif(btrim(new.area), ''), 'Tarefa da equipe')
        || case when coalesce(new.urgencia,'') in ('alta','critica') then ' · urgência ' || new.urgencia else '' end,
      v_link, nullif(btrim(new."criadoPor"), ''), new.prazo::date);
  end loop;
  return new;
end; $$;

-- FUNCTION: avisar_alocacao_atendimento()
CREATE FUNCTION hub.avisar_alocacao_atendimento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_user uuid; v_texto text; v_titulo text; v_link text; nome text;
  v_antes text[]; v_depois text[];
begin
  if tg_op = 'UPDATE' and new.responsavel is not distinct from old.responsavel then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.titulo), ''), nullif(btrim(new.assunto), ''), 'Atendimento');
  v_link   := '/sucesso/atendimento?at=' || new.id;
  v_antes  := case when tg_op = 'UPDATE' then hub.aloc_nomes(old.responsavel) else '{}'::text[] end;
  v_depois := hub.aloc_nomes(new.responsavel);

  -- saiu da alocação (inclusive quando não sobrou ninguém)
  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'saiu') loop
    perform hub.registrar_alocacao('Atendimento', 'atendimento', new.id::text, v_titulo,
                                   nome, 'saiu', v_link, null);
  end loop;

  v_texto := coalesce(nullif(btrim(new.cliente_nome), ''), 'Sem cliente vinculado');
  if coalesce(btrim(new.pipeline), '') <> '' then v_texto := v_texto || ' · ' || new.pipeline; end if;

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'entrou') loop
    perform hub.registrar_alocacao('Atendimento', 'atendimento', new.id::text, v_titulo,
                                   nome, 'entrou', v_link, null);
    if new.status = 'done' then continue; end if;   -- encerrado: registra, mas não avisa
    v_user := hub.aviso_user_por_nome(nome);
    if v_user is null then continue; end if;
    perform hub.avisar(v_user, 'alocacao', 'Atendimento', v_titulo, v_texto, v_link, null, new.prazo::date);
  end loop;
  return new;
end; $$;

-- FUNCTION: avisar_alocacao_rh_endomkt()
CREATE FUNCTION hub.avisar_alocacao_rh_endomkt() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_titulo text; v_antigo text; v_novo text;
begin
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.titulo), ''), 'Ação de endomarketing');

  if tg_op = 'UPDATE' and old.responsavel_id is not null then
    select full_name into v_antigo from hub.users where id = old.responsavel_id;
    perform hub.registrar_alocacao('RH', 'endomarketing', new.id::text, v_titulo, v_antigo, 'saiu', '/rh/#endomkt', null);
  end if;
  if new.responsavel_id is null then return new; end if;

  select full_name into v_novo from hub.users where id = new.responsavel_id;
  perform hub.registrar_alocacao('RH', 'endomarketing', new.id::text, v_titulo, v_novo, 'entrou', '/rh/#endomkt', null);

  if new.status = 'concluida' then return new; end if;
  perform hub.avisar(new.responsavel_id, 'alocacao', 'RH', v_titulo,
    'Endomarketing' || coalesce(' · ' || nullif(btrim(new.tipo), ''), ''),
    '/rh/#endomkt', null, new.data_inicio);
  return new;
end; $$;

-- FUNCTION: avisar_alocacao_rh_tarefa()
CREATE FUNCTION hub.avisar_alocacao_rh_tarefa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_titulo text; v_link text; v_antigo text; v_novo text;
begin
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return new; end if;

  v_titulo := coalesce(nullif(btrim(new.titulo), ''), 'Tarefa');
  v_link   := '/rh/#tarefas?id=' || new.id;

  if tg_op = 'UPDATE' and old.responsavel_id is not null then
    select full_name into v_antigo from hub.users where id = old.responsavel_id;
    perform hub.registrar_alocacao('RH', 'tarefa', new.id::text, v_titulo, v_antigo, 'saiu', v_link, null);
  end if;
  if new.responsavel_id is null then return new; end if;

  select full_name into v_novo from hub.users where id = new.responsavel_id;
  perform hub.registrar_alocacao('RH', 'tarefa', new.id::text, v_titulo, v_novo, 'entrou', v_link, null);

  if new.status = 'feito' then return new; end if;
  perform hub.avisar(
    new.responsavel_id, 'alocacao', 'RH', v_titulo,
    'Tarefa de ' || coalesce(nullif(btrim(new.area), ''), 'RH')
      || case when coalesce(new.prioridade,'') in ('alta','critica') then ' · prioridade ' || new.prioridade else '' end,
    v_link, null, new.prazo);
  return new;
end; $$;

-- FUNCTION: avisar_por_nome(text, text, text, text, text, text, text, date)
CREATE FUNCTION hub.avisar_por_nome(p_nome text, p_tipo text, p_sistema text, p_titulo text, p_texto text, p_link text, p_autor text DEFAULT NULL::text, p_prazo date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_user uuid;
begin
  v_user := hub.aviso_user_por_nome(p_nome);
  if v_user is null then return; end if;
  perform hub.avisar(v_user, p_tipo, p_sistema, p_titulo, p_texto, p_link, p_autor, p_prazo);
end;
$$;

-- FUNCTION: aviso_autor()
CREATE FUNCTION hub.aviso_autor() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select full_name from hub.users where id = auth.uid();
$$;

-- FUNCTION: aviso_user_por_nome(text)
CREATE FUNCTION hub.aviso_user_por_nome(p_nome text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
-- Acha a pessoa do cadastro (hub.users, ativa) pelo nome que a tela ou o robô
-- mandou. As telas mandam o NOME COMPLETO (full_name); ficha e robô às vezes
-- mandam só o primeiro nome, ou uma lista ("Ana Souza, Bia") — aí vale o
-- PRIMEIRO da lista, que é o responsável. Na dúvida ninguém recebe: aviso no
-- sino da pessoa errada é pior que aviso nenhum.
declare
  v_id   uuid;
  v_qtd  int;
  v_nome text;
  v_pal  text[];
begin
  -- o primeiro da lista, sem o que estiver entre parênteses, sem acento,
  -- minúsculo e com um espaço só entre as palavras
  v_nome := (regexp_split_to_array(coalesce(p_nome, ''), '\s*[,;/]\s*'))[1];
  v_nome := regexp_replace(hub.sem_acento(regexp_replace(coalesce(v_nome, ''), '\([^)]*\)', ' ', 'g')), '\s+', ' ', 'g');
  v_nome := btrim(v_nome);
  if v_nome = '' then return null; end if;

  -- 1) nome completo igual — e de UMA pessoa só (homônimo não recebe aviso)
  select count(*), (array_agg(u.id order by u.id))[1] into v_qtd, v_id
    from hub.users u
   where coalesce(u.active, true)
     and btrim(regexp_replace(hub.sem_acento(u.full_name), '\s+', ' ', 'g')) = v_nome;
  if v_qtd = 1 then return v_id; end if;
  if v_qtd > 1 then return null; end if;

  -- 2) o nome completo é de quem SAIU: ninguém recebe (o aviso não escorrega
  --    pra outra pessoa ativa que só tem o mesmo primeiro nome)
  if exists (select 1 from hub.users u
              where not coalesce(u.active, true)
                and btrim(regexp_replace(hub.sem_acento(u.full_name), '\s+', ' ', 'g')) = v_nome) then
    return null;
  end if;

  -- 3) pelo primeiro nome — só quando é de UMA pessoa só. Veio sobrenome junto
  --    ("Ana S.", "Ana Souza")? Cada palavra a mais tem que bater com o começo
  --    de alguma palavra do nome dela, senão não é ela.
  v_pal := string_to_array(v_nome, ' ');
  select count(*), (array_agg(u.id order by u.id))[1] into v_qtd, v_id
    from hub.users u
   where coalesce(u.active, true)
     and coalesce(btrim(u.full_name), '') <> ''
     and split_part(btrim(regexp_replace(hub.sem_acento(u.full_name), '\s+', ' ', 'g')), ' ', 1) = v_pal[1]
     and not exists (
           select 1 from unnest(v_pal[2:]) w
            where rtrim(w, '.') <> ''
              and not exists (
                    select 1 from unnest(string_to_array(btrim(regexp_replace(hub.sem_acento(u.full_name), '\s+', ' ', 'g')), ' ')) f
                     where left(f, length(rtrim(w, '.'))) = rtrim(w, '.')));
  if v_qtd = 1 then return v_id; end if;

  return null;
end; $$;

-- FUNCTION: avisos_wpp_marcar(uuid, text)
CREATE FUNCTION hub.avisos_wpp_marcar(p_id uuid, p_erro text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  update hub.notificacoes
     set wpp_em = now(), wpp_erro = nullif(p_erro,'')
   where id = p_id;
$$;

-- FUNCTION: biz_minutes(timestamp with time zone, timestamp with time zone)
CREATE FUNCTION hub.biz_minutes(t1 timestamp with time zone, t2 timestamp with time zone) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  a timestamp := t1 at time zone 'America/Sao_Paulo';
  b timestamp := t2 at time zone 'America/Sao_Paulo';
  total numeric := 0; d date; ws timestamp; we timestamp; seg record;
begin
  if b <= a then return 0; end if;
  d := a::date;
  while d <= b::date loop
    if extract(dow from d) between 1 and 5 then
      for seg in select * from (values (time '09:00', time '12:00'),(time '13:00', time '18:00')) as v(s,e) loop
        ws := greatest(a, d + seg.s); we := least(b, d + seg.e);
        if we > ws then total := total + extract(epoch from (we-ws))/60; end if;
      end loop;
    end if;
    d := d + 1;
  end loop;
  return round(total);
end; $$;

-- FUNCTION: brl(numeric)
CREATE FUNCTION hub.brl(p numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select translate(to_char(coalesce(p,0), 'FM999G999G999G990D00'), '.,', ',.');
$$;

-- FUNCTION: crm_quem(text)
CREATE FUNCTION hub.crm_quem(p_email text) RETURNS TABLE(full_name text, access_level text, active boolean, pode_crm boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select u.full_name,
         u.access_level,
         coalesce(u.active, false),
         -- padrão LIBERADO: só o `false` escrito fecha a porta
         coalesce(u.acessos->>'crm', '') is distinct from 'false'
    from hub.users u
   where lower(u.email) = lower(btrim(p_email))
     -- convidado marcado no acessos não entra
     and coalesce(u.acessos->>'_perfil', '') <> 'convidado'
     -- nem quem ocupa o cargo Convidado (principal ou secundário)
     and not exists (
       select 1
         from hub.roles r
        where r.name = 'Convidado'
          and (r.id = u.role_id or r.id = any(coalesce(u.cargo_ids, '{}')))
     )
   limit 1;
$$;

-- FUNCTION: current_access_level()
CREATE FUNCTION hub.current_access_level() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select access_level from hub.users where id = auth.uid()
$$;

-- FUNCTION: current_tenant_id()
CREATE FUNCTION hub.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    select tenant_id from hub.users where id = auth.uid()
$$;

-- FUNCTION: e_dia_util(date)
CREATE FUNCTION hub.e_dia_util(p_dia date) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'hub', 'public'
    AS $$
  select extract(isodow from p_dia) <= 5
     and not exists (select 1 from hub.feriados f where f.dia = p_dia);
$$;

-- FUNCTION: e_do_time()
CREATE FUNCTION hub.e_do_time() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (select 1 from hub.users u where u.id = auth.uid() and u.active);
$$;

-- FUNCTION: fin_norm(text)
CREATE FUNCTION hub.fin_norm(txt text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select regexp_replace(
           translate(lower(coalesce(txt,'')),
                     'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇñÑ',
                     'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuucnn'),
           '[^a-z0-9 ]', '', 'g')
$$;

-- FUNCTION: fn_ascensao_comercial()
CREATE FUNCTION hub.fn_ascensao_comercial() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_lideres text;
begin
  -- Ascensão é do comercial: se ninguém foi alocado (ou ficou "A definir"),
  -- entram os LÍDERES da área Comercial do cadastro (hub.areas, slug
  -- 'comercial', coluna lider_ids), venha de onde vier (Atendimento, admin, sync).
  -- Sem a área ou sem líder cadastrado, o card fica sem dono, no balcão geral.
  if new.assunto ilike 'ascens%' and (new.cs is null or btrim(new.cs) = '' or new.cs ilike 'a definir%') then
    select string_agg(distinct u.full_name, ', ' order by u.full_name) into v_lideres
      from hub.areas a
      join hub.users u on u.id = any (a.lider_ids) and u.active
     where a.slug = 'comercial';
    if v_lideres is not null then
      new.cs := v_lideres;
    elsif new.cs is null then
      new.cs := '';
    end if;
  end if;
  return new;
end $$;

-- FUNCTION: fn_atendimento_carimba_desfecho()
CREATE FUNCTION hub.fn_atendimento_carimba_desfecho() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status_atendimento in ('concluido','ganho','cancelado','perdido') then
    if new.date_closed is null then new.date_closed := now(); end if;
  else
    new.date_closed := null;
  end if;
  return new;
end $$;

-- FUNCTION: fone_chave(text)
CREATE FUNCTION hub.fone_chave(p text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare d text;
begin
  d := regexp_replace(coalesce(p,''), '\D', '', 'g');
  if length(d) > 11 and left(d,2) = '55' then d := substr(d, 3); end if;
  if length(d) < 10 then return null; end if;
  if length(d) > 11 then d := right(d, 11); end if;
  return left(d,2) || right(d,8);   -- DDD + 8 dígitos finais
end;
$$;

-- FUNCTION: goal_achieved(numeric, numeric, text)
CREATE FUNCTION hub.goal_achieved(p_value numeric, p_target numeric, p_operator text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
    select case
        when p_value is null or p_target is null or p_operator is null then null
        when p_operator = '>'  then p_value >  p_target
        when p_operator = '>=' then p_value >= p_target
        when p_operator = '<'  then p_value <  p_target
        when p_operator = '<=' then p_value <= p_target
        when p_operator = '='  then p_value =  p_target
    end
$$;

-- FUNCTION: handle_new_auth_user()
CREATE FUNCTION hub.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_tenant_id    uuid;
    v_full_name    text;
    v_access_level text := 'collaborator';
begin
    -- Só entra no time quem foi CONVIDADO pela tela RH → Usuários
    -- (inviteUserByEmail preenche invited_at). Qualquer outro login — produto,
    -- teste, cadastro pelo painel do Supabase — fica de fora e só é registrado.
    if new.invited_at is null then
        insert into hub.logins_fora_do_time (auth_id, email)
        values (new.id, new.email)
        on conflict (auth_id) do nothing;
        return new;
    end if;

    -- a empresa desta instalação
    select id into v_tenant_id from hub.tenants order by created_at limit 1;

    v_full_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    );

    insert into hub.users (id, tenant_id, role_id, full_name, email, access_level, active)
    values (new.id, v_tenant_id, null, v_full_name, new.email, v_access_level, true)
    on conflict (id) do update
        set email      = excluded.email,
            full_name  = coalesce(excluded.full_name, hub.users.full_name);

    return new;
end;
$$;

-- FUNCTION: has_recrutamento_access()
CREATE FUNCTION hub.has_recrutamento_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select hub.has_rh_access() or coalesce(
    (select (u.acessos->>'recrutamento') in ('true','admin') from hub.users u where u.id = auth.uid()), false);
$$;

-- FUNCTION: has_rh_access()
CREATE FUNCTION hub.has_rh_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u
    where u.id = auth.uid() and coalesce(u.active, true)
      and coalesce(u.acessos->>'rh', 'true') <> 'false'
  );
$$;

-- FUNCTION: hoje_br()
CREATE FUNCTION hub.hoje_br() RETURNS date
    LANGUAGE sql STABLE
    AS $$
    select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- FUNCTION: is_journey_admin()
CREATE FUNCTION hub.is_journey_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u
    where u.id = auth.uid()
      and (u.access_level = 'admin' or (u.acessos->>'journey') = 'admin')
  );
$$;

-- FUNCTION: is_rh_admin()
CREATE FUNCTION hub.is_rh_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u
    where u.id = auth.uid() and coalesce(u.active, true)
      and u.access_level = 'admin'
  );
$$;

-- FUNCTION: menos_dias_uteis(date, integer)
CREATE FUNCTION hub.menos_dias_uteis(p_data date, p_dias integer) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare d date := p_data; faltam int := greatest(coalesce(p_dias, 0), 0);
begin
  while faltam > 0 loop
    d := d - 1;
    if extract(isodow from d) < 6 then faltam := faltam - 1; end if;
  end loop;
  return d;
end $$;

-- FUNCTION: meu_whatsapp_salvar(text)
CREATE FUNCTION hub.meu_whatsapp_salvar(p_numero text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_num text;
begin
  v_num := regexp_replace(coalesce(p_numero,''), '[^0-9]', '', 'g');
  if v_num <> '' and length(v_num) < 10 then
    raise exception 'Número incompleto — escreva com DDD (ex.: 11 91234-5678)';
  end if;
  update hub.users set whatsapp = v_num where id = auth.uid();
  return v_num;
end $$;

-- FUNCTION: nome_canonico(text)
CREATE FUNCTION hub.nome_canonico(p_nome text) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'hub', 'public'
    AS $$
declare v_full text; v_first text; v_qtd int;
begin
  if coalesce(btrim(p_nome), '') = '' then return null; end if;

  -- acha a pessoa no cadastro: nome completo igual (sem ligar pra acento)…
  select full_name into v_full from hub.users
   where coalesce(active, true) and hub.sem_acento(full_name) = hub.sem_acento(p_nome)
   limit 1;

  -- …ou pelo primeiro nome, desde que seja de uma pessoa só
  if v_full is null then
    select count(*), (array_agg(full_name order by full_name))[1] into v_qtd, v_full
      from hub.users
     where coalesce(active, true)
       and hub.sem_acento(split_part(btrim(full_name), ' ', 1)) = hub.sem_acento(split_part(btrim(p_nome), ' ', 1));
    -- não achou ninguém, ou é nome repetido: deixa exatamente como está
    if v_qtd <> 1 then return btrim(p_nome); end if;
  end if;

  v_first := split_part(btrim(v_full), ' ', 1);
  select count(*) into v_qtd from hub.users
   where coalesce(active, true)
     and hub.sem_acento(split_part(btrim(full_name), ' ', 1)) = hub.sem_acento(v_first);
  return case when v_qtd = 1 then v_first else btrim(v_full) end;
end; $$;

-- FUNCTION: crm_conta_desativa(uuid)
CREATE FUNCTION hub.crm_conta_desativa(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'crm', 'public'
    AS $$
declare v_email text;
begin
  -- a conta do CRM só existe com o CRM instalado
  if to_regclass('crm.users') is null then return; end if;
  select lower(btrim(u.email)) into v_email from hub.users u where u.id = p_user_id;
  if v_email is null or v_email = '' then return; end if;

  update crm.users
     set is_active = false, updated_at = now()
   where lower(email) = v_email and is_active;
end;
$$;

-- FUNCTION: crm_conta_garante(uuid)
CREATE FUNCTION hub.crm_conta_garante(p_user_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'crm', 'public'
    AS $$
declare
  v_email  text;
  v_nome   text;
  v_nivel  text;
  v_org    text;
  v_id     text;
  v_papel  crm."OrgRole";
begin
  select lower(btrim(u.email)), u.full_name, u.access_level
    into v_email, v_nome, v_nivel
    from hub.users u
   where u.id = p_user_id;

  if v_email is null or v_email = '' then
    return null;
  end if;

  select o.id into v_org
    from crm.organizations o
   order by o.created_at
   limit 1;

  if v_org is null then
    return null;   -- chat ainda sem organização: nada a fazer
  end if;

  v_papel := case when v_nivel = 'admin' then 'ADMIN' else 'AGENT' end;

  select s.id into v_id from crm.users s where lower(s.email) = v_email;

  if v_id is null then
    v_id := 'c' || replace(gen_random_uuid()::text, '-', '');
    insert into crm.users (id, name, email, password, is_active, created_at, updated_at)
    values (v_id,
            coalesce(nullif(btrim(v_nome), ''), split_part(v_email, '@', 1)),
            v_email,
            'sso-hub:' || gen_random_uuid()::text,
            true, now(), now());
  else
    -- reativa quem tinha sido desligado e voltou
    update crm.users
       set is_active = true, deleted_at = null, updated_at = now()
     where id = v_id and (is_active is distinct from true or deleted_at is not null);
  end if;

  insert into crm.user_organizations (id, user_id, organization_id, role)
  select 'c' || replace(gen_random_uuid()::text, '-', ''), v_id, v_org, v_papel
   where not exists (
     select 1 from crm.user_organizations m
      where m.user_id = v_id and m.organization_id = v_org
   );

  return v_id;
end;
$$;

-- FUNCTION: pdp_ve_todos()
CREATE FUNCTION hub.pdp_ve_todos() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u
    where u.id = auth.uid() and coalesce(u.active, true)
      and coalesce(u.acessos->>'pdp', '') in ('true', 'admin')
  );
$$;

-- FUNCTION: pode_editar_comissao()
CREATE FUNCTION hub.pode_editar_comissao() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1
      from hub.users u
      left join hub.roles r on r.id = u.role_id
     where u.id = auth.uid()
       and coalesce(u.active, true)
       and (
            u.access_level = 'admin'
         or lower(coalesce(r.name, '')) like '%diretoria%'
         or lower(coalesce(r.name, '')) like '%head%'
         or lower(coalesce(r.name, '')) like '%analista de opera%'
       )
  );
$$;

-- FUNCTION: pode_publicar_plano()
CREATE FUNCTION hub.pode_publicar_plano() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1 from hub.users u left join hub.roles r on r.id = u.role_id
     where u.id = auth.uid() and u.active
       and (r.name ilike 'customer success%' or r.name = 'Analista de Operações - Entrega' or r.name = 'Diretoria'));
$$;

-- FUNCTION: registrar_alocacao(text, text, text, text, text, text, text, text)
CREATE FUNCTION hub.registrar_alocacao(p_sistema text, p_entidade text, p_entidade_id text, p_titulo text, p_pessoa text, p_acao text, p_link text DEFAULT NULL::text, p_autor text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_autor text; v_pessoa_id uuid;
begin
  if coalesce(btrim(p_pessoa), '') = '' or p_entidade_id is null then return; end if;

  v_autor := coalesce(nullif(btrim(p_autor), ''), hub.aviso_autor());
  v_pessoa_id := hub.aviso_user_por_nome(p_pessoa);

  if exists (
    select 1 from hub.alocacoes_log
     where sistema = p_sistema and entidade_id = p_entidade_id
       and lower(btrim(pessoa)) = lower(btrim(p_pessoa)) and acao = p_acao
       and criado_em > now() - interval '2 minutes'
  ) then return; end if;

  insert into hub.alocacoes_log
    (sistema, entidade, entidade_id, titulo, pessoa, pessoa_id, acao, autor, autor_id, link)
  values
    (p_sistema, p_entidade, p_entidade_id, nullif(btrim(p_titulo), ''),
     btrim(p_pessoa), v_pessoa_id, p_acao, v_autor, auth.uid(), p_link);
exception when others then
  -- registro é rastro, não pode travar quem está alocando
  raise warning 'hub.registrar_alocacao falhou (alocação segue): %', sqlerrm;
end; $$;

-- FUNCTION: role_upsert(uuid, text, text, uuid, text, integer, numeric, numeric)
CREATE FUNCTION hub.role_upsert(p_id uuid, p_name text, p_slug text, p_area uuid, p_cadence text, p_ordem integer, p_faixa_min numeric DEFAULT NULL::numeric, p_faixa_max numeric DEFAULT NULL::numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_id uuid; v_tenant uuid;
begin
  if not exists (select 1 from hub.users where id = auth.uid() and access_level = 'admin') then
    raise exception 'Apenas administradores podem gerenciar cargos.';
  end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Informe o nome do cargo.'; end if;
  if p_cadence not in ('diaria','semanal','mensal','pos-evento') then raise exception 'Cadência inválida.'; end if;
  if p_area is null then raise exception 'Selecione a área.'; end if;
  -- faixa: ou vem o par completo e coerente, ou vem vazia. Faixa invertida
  -- (mín > máx) faria a tela dizer "Acima da média" pra todo mundo, calado.
  if p_faixa_min is not null and p_faixa_max is not null and p_faixa_min > p_faixa_max then
    raise exception 'A faixa mínima (%) não pode ser maior que a máxima (%).', p_faixa_min, p_faixa_max;
  end if;
  if p_id is null then
    select tenant_id into v_tenant from hub.roles limit 1;  -- mesmo tenant do Metas
    insert into hub.roles (tenant_id, area_id, slug, name, cadence, order_index, faixa_min, faixa_max)
      values (v_tenant, p_area, p_slug, btrim(p_name), p_cadence, coalesce(p_ordem, 0), p_faixa_min, p_faixa_max)
      returning id into v_id;
  else
    update hub.roles set name = btrim(p_name), slug = p_slug, area_id = p_area,
      cadence = p_cadence, order_index = coalesce(p_ordem, order_index),
      faixa_min = p_faixa_min, faixa_max = p_faixa_max
      where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $$;

-- FUNCTION: sem_acento(text)
CREATE FUNCTION hub.sem_acento(p_txt text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'hub', 'public'
    AS $$
  select lower(translate(btrim(coalesce(p_txt, '')),
                         'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                         'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
$$;

-- FUNCTION: set_atualizado_em()
CREATE FUNCTION hub.set_atualizado_em() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.atualizado_em = now(); return new; end;
$$;

-- FUNCTION: set_my_avatar(text)
CREATE FUNCTION hub.set_my_avatar(p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$ begin update hub.users set avatar_url = p_url where id = auth.uid(); end; $$;

-- FUNCTION: set_my_cor(text)
CREATE FUNCTION hub.set_my_cor(p_cor text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $_$
declare v_cor text;
begin
  if auth.uid() is null then
    raise exception 'sem sessão';
  end if;
  v_cor := nullif(trim(coalesce(p_cor, '')), '');
  if v_cor is not null and v_cor !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'cor inválida: use o formato #RRGGBB';
  end if;
  update hub.users set cor = upper(v_cor) where id = auth.uid();
  return upper(v_cor);
end $_$;

-- FUNCTION: set_updated_at()
CREATE FUNCTION hub.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- FUNCTION: tem_acesso(text)
CREATE FUNCTION hub.tem_acesso(p_chave text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select exists (
    select 1
      from hub.users u
     where u.id = auth.uid()
       and u.active
       and (u.access_level = 'admin'
            or coalesce(u.acessos ->> p_chave, 'true') <> 'false')
  );
$$;

-- FUNCTION: tg_app_push_aviso()
CREATE FUNCTION hub.tg_app_push_aviso() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if new.user_id is null or coalesce(new.tipo, '') = 'novidades' then return new; end if;
  if not exists (select 1 from hub.app_aparelhos where user_id = new.user_id) then return new; end if;
  perform hub.app_push_enviar(
    array[new.user_id],
    coalesce(nullif(new.sistema, ''), 'Aviso') || case when new.tipo = 'alocacao' then ' · alocaram você' else '' end,
    concat_ws(E'\n', nullif(new.titulo, ''), nullif(new.texto, '')),
    coalesce(nullif(new.link, ''), '/'),
    'aviso-' || new.id);
  return new;
exception when others then
  raise warning '[tg_app_push_aviso] %', sqlerrm;
  return new;
end $$;

-- FUNCTION: tg_app_saiu_do_time()
CREATE FUNCTION hub.tg_app_saiu_do_time() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if coalesce(new.active, false) = false and coalesce(old.active, false) = true then
    delete from hub.app_aparelhos where user_id = new.id;
    update hub.app_convites
       set cancelado_em = now(), cancelado_motivo = 'pessoa saiu do time'
     where user_id = new.id and usado_em is null and cancelado_em is null;
  end if;
  return new;
end $$;

-- FUNCTION: tg_users_desligamento()
CREATE FUNCTION hub.tg_users_desligamento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_quem  uuid := auth.uid();
  v_chaves constant text[] := array[
    'journey','chat','performance','central','projetos','rh',
    'comercial','financeiro','marketing','dre','recrutamento','vault',
    'trilha'
  ];
  v_zerado jsonb;
  v_sess   int;
  v_tok    int;
begin
  -- ── DESLIGOU ──────────────────────────────────────────────────────────────
  if coalesce(old.active, true) and not coalesce(new.active, true) then

    -- (b) acessos: zera TODAS as chaves que a pessoa tinha, mais as canônicas.
    -- Não basta apagar o jsonb: o gate lê "chave ausente = liberado".
    select coalesce(jsonb_object_agg(k, 'false'::jsonb), '{}'::jsonb)
      into v_zerado
      from ( select jsonb_object_keys(coalesce(old.acessos, '{}'::jsonb)) as k
             union select unnest(v_chaves) ) t;
    new.acessos := v_zerado;

    -- (c) o login para de valer, mesmo com a sessão já aberta
    update auth.users set banned_until = 'infinity' where id = new.id;

    -- (d) e as sessões que já estavam abertas caem
    with x as (delete from auth.sessions where user_id = new.id returning 1)
      select count(*) into v_sess from x;
    with y as (delete from auth.refresh_tokens where user_id::text = new.id::text returning 1)
      select count(*) into v_tok from y;

    -- o registro do desligamento mora no RH: sem ele instalado, desliga igual e só não registra
    if to_regclass('hub.rh_offboarding_log') is not null then
    insert into hub.rh_offboarding_log (user_id, nome, email, sistema, status, detalhe, feito_por)
    values (new.id, new.full_name, new.email, 'hub', 'revogado',
            format('Desligamento automático (gatilho): acessos zerados (inclusive Minha trilha), login banido, %s sessão(ões) e %s token(s) apagados. '
                || 'FALTA NA MÃO (não têm API): 1Password/Vault, ClickUp, Kommo, Notion, Alpaclass, grupos de WhatsApp do Atendimento.',
                v_sess, v_tok),
            v_quem);
    end if;

  -- ── REATIVOU ──────────────────────────────────────────────────────────────
  -- De propósito NÃO desbane: se foi sem querer (é o que já aconteceu), a
  -- pessoa não volta a entrar. Reativar de verdade é tirar o banimento à mão,
  -- que é um ato consciente. Aqui só fica registrado, pra ninguém descobrir
  -- tarde.
  elsif not coalesce(old.active, true) and coalesce(new.active, true)
        and to_regclass('hub.rh_offboarding_log') is not null then   -- registro só com o RH
    insert into hub.rh_offboarding_log (user_id, nome, email, sistema, status, detalhe, feito_por)
    values (new.id, new.full_name, new.email, 'hub', 'manual',
            'REATIVADA: a ficha voltou a ativa. O login continua banido de propósito — pra entrar de novo, '
         || 'tirar o banned_until à mão, que é ato consciente. Se ninguém quis reativar, foi tela salvando '
         || 'o campo active sem querer (o Metas faz isso).',
            v_quem);
  end if;

  return new;
end; $$;

-- FUNCTION: tg_users_crm_conta()
CREATE FUNCTION hub.tg_users_crm_conta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_pode    boolean;
  v_cadeira boolean;
begin
  -- a conta do CRM só existe com o CRM instalado
  if to_regclass('crm.users') is null then return new; end if;

  -- pode entrar no CRM? (padrão liberado; só o `false` fecha)
  v_pode := coalesce(new.active, false)
        and coalesce(new.acessos->>'crm', '') is distinct from 'false'
        and coalesce(new.acessos->>'_perfil', '') <> 'convidado';

  -- senta numa cadeira do comercial? (regra — cargo da área, nunca o nome
  -- escrito no código)
  select exists (
    select 1
      from hub.roles r
      join hub.areas a on a.id = r.area_id
     where a.name in ('Comercial', 'Diretoria')
       and (r.id = new.role_id or r.id = any(coalesce(new.cargo_ids, '{}')))
  ) into v_cadeira;

  if v_pode and v_cadeira then
    perform hub.crm_conta_garante(new.id);
  elsif not v_pode then
    perform hub.crm_conta_desativa(new.id);
  end if;

  return null;   -- AFTER trigger
end;
$$;

-- FUNCTION: trg_np_avisa_aprovador()
CREATE FUNCTION hub.trg_np_avisa_aprovador() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_user uuid;
  v_mudou boolean;
begin
  -- só interessa NP que AINDA espera aprovação e já tem aprovador escolhido
  if new.aprovador is null or new.status is distinct from 'Aguardando aprovação' then
    return new;
  end if;

  v_mudou := (tg_op = 'INSERT')
          or (old.aprovador is distinct from new.aprovador)
          or (old.status    is distinct from new.status);
  if not v_mudou then return new; end if;

  begin
    v_user := hub.aviso_user_por_nome(new.aprovador);
    if v_user is not null then
      perform hub.avisar(
        v_user, 'alocacao', 'Processos',
        'Aprovar ' || coalesce(new.numero || ' · ', '') || new.titulo,
        'Esta norma está aguardando a sua aprovação. Abra, leia e publique — ou devolva com o que falta.',
        '/processos/?doc=' || new.id,
        coalesce(new.atualizado_por, new.criado_por),
        new.revisar_em);
    end if;
  exception when others then
    -- gatilho de aviso NUNCA pode derrubar o save (lição de 31/07/2026)
    raise warning 'aviso do aprovador falhou: %', sqlerrm;
  end;
  return new;
end $$;

-- FUNCTION: trg_crm_reabre_tira_selo()
CREATE FUNCTION hub.trg_crm_reabre_tira_selo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'aberto' and old.status <> 'aberto' and old.motivo_perda_key = 'venda_outro_funil' then
    new.venda_outro_funil_id := null;
    new.venda_outro_funil_em := null;
    if new.motivo_perda_key = 'venda_outro_funil' then
      new.motivo_perda_key := null;
      new.motivo_perda := null;
    end if;
  end if;
  return new;
end $$;

-- FUNCTION: unaccent_imm(text)
CREATE FUNCTION hub.unaccent_imm(t text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
  select translate(
    t,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  );
$$;

-- FUNCTION: unaccent_ptbr(text)
CREATE FUNCTION hub.unaccent_ptbr(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select translate(coalesce(p,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
$$;

-- FUNCTION: whatsapp_do_time()
CREATE FUNCTION hub.whatsapp_do_time() RETURNS TABLE(id uuid, nome text, email text, whatsapp text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select u.id, u.full_name, u.email, coalesce(u.whatsapp,'')
    from hub.users u
   where u.active
     and exists (select 1 from hub.users a where a.id = auth.uid() and a.access_level = 'admin')
   order by u.full_name
$$;

-- FUNCTION: whatsapp_do_time_salvar(uuid, text)
CREATE FUNCTION hub.whatsapp_do_time_salvar(p_user uuid, p_numero text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_num text;
begin
  if not exists (select 1 from hub.users where id = auth.uid() and access_level = 'admin') then
    raise exception 'Só quem é admin muda o número de outra pessoa';
  end if;
  v_num := regexp_replace(coalesce(p_numero,''), '[^0-9]', '', 'g');
  if v_num <> '' and length(v_num) < 10 then
    raise exception 'Número incompleto — escreva com DDD';
  end if;
  update hub.users set whatsapp = v_num where id = p_user;
  return v_num;
end $$;


-- ─── medidor de atividade (tempo de uso de cada tela) — veio do Contratos: toda tela chama, então é da base ───

-- FUNCTION: os_atividade_dia(date, date)
CREATE FUNCTION hub.os_atividade_dia(p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date) RETURNS TABLE(user_id uuid, pessoa text, dia date, min_total integer, min_aberto integer, min_journey integer, min_atendimento integer, cliques integer, primeiro timestamp with time zone, ultimo timestamp with time zone, telas integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  with m as (
    select s.user_id, (s.minuto at time zone 'America/Sao_Paulo')::date dia,
           s.minuto, s.segundos, s.seg_aberto, s.sistema, s.cliques
      from hub.os_minuto s
     where (s.minuto at time zone 'America/Sao_Paulo')::date
             between coalesce(p_de,  (now() at time zone 'America/Sao_Paulo')::date)
                 and coalesce(p_ate, (now() at time zone 'America/Sao_Paulo')::date)
  )
  select m.user_id, u.full_name, m.dia,
         count(*) filter (where m.segundos   >= 30)::int,
         count(*) filter (where m.seg_aberto >= 30)::int,
         count(*) filter (where m.seg_aberto >= 30 and m.sistema='journey')::int,
         count(*) filter (where m.seg_aberto >= 30 and m.sistema='atendimento')::int,
         sum(m.cliques)::int, min(m.minuto), max(m.minuto),
         (select count(distinct t.tela)::int from hub.os_sessao t
           where t.user_id=m.user_id and (t.fim at time zone 'America/Sao_Paulo')::date=m.dia)
    from m join hub.users u on u.id=m.user_id
   group by m.user_id, u.full_name, m.dia order by 5 desc;
$$;

-- FUNCTION: os_pulso(uuid, text, text, integer, integer, timestamp with time zone, integer)
CREATE FUNCTION hub.os_pulso(p_sessao uuid, p_sistema text, p_tela text, p_segundos integer, p_cliques integer, p_minuto timestamp with time zone DEFAULT NULL::timestamp with time zone, p_aberto integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_min timestamptz := date_trunc('minute', coalesce(p_minuto, now()));
  v_seg smallint := least(greatest(coalesce(p_segundos,0),0),60)::smallint;
  v_ab  smallint := least(greatest(coalesce(p_aberto,p_segundos,0),0),60)::smallint;
  v_cli smallint := least(greatest(coalesce(p_cliques,0),0),500)::smallint;
begin
  if v_uid is null then return; end if;
  if v_min > now() + interval '5 minutes' or v_min < now() - interval '1 day' then return; end if;

  insert into hub.os_minuto (user_id, minuto, segundos, seg_aberto, sistema, cliques)
  values (v_uid, v_min, v_seg, greatest(v_ab, v_seg), left(coalesce(p_sistema,''),40), v_cli)
  on conflict (user_id, minuto) do update
     set segundos   = least(hub.os_minuto.segundos   + excluded.segundos,   60),
         seg_aberto = least(hub.os_minuto.seg_aberto + excluded.seg_aberto, 60),
         cliques    = hub.os_minuto.cliques + excluded.cliques,
         sistema    = case when excluded.segundos > hub.os_minuto.segundos
                           then excluded.sistema else hub.os_minuto.sistema end;

  if p_sessao is not null then
    insert into hub.os_sessao (id, user_id, sistema, tela, segundos, cliques, fim)
    values (p_sessao, v_uid, left(coalesce(p_sistema,''),40), left(coalesce(p_tela,''),200), v_seg, v_cli, now())
    on conflict (id) do update
       set segundos = hub.os_sessao.segundos + excluded.segundos,
           cliques  = hub.os_sessao.cliques + excluded.cliques,
           tela = excluded.tela, fim = now()
     where hub.os_sessao.user_id = v_uid;
  end if;
end $$;


-- ─── cargos (hub.roles é da base) — vieram do Metas em 07/10/2026. Os contadores
--     de indicadores e lançamentos só existem com o Metas instalado; sem ele, valem 0.

-- FUNCTION: role_delete(uuid)
CREATE FUNCTION hub.role_delete(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare ni int := 0; np int; nl int := 0;
begin
  if not exists (select 1 from hub.users where id = auth.uid() and access_level = 'admin') then
    raise exception 'Apenas administradores podem gerenciar cargos.';
  end if;
  if to_regclass('hub.role_indicators') is not null then
    select count(*) into ni from hub.role_indicators where role_id = p_id;
  end if;
  select count(*) into np from hub.users where role_id = p_id or (cargo_ids is not null and p_id = any(cargo_ids));
  if to_regclass('hub.entries') is not null then
    select count(*) into nl from hub.entries where role_id = p_id;
  end if;
  if ni > 0 or np > 0 or nl > 0 then
    return 'em_uso:' || ni || ',' || np || ',' || nl;
  end if;
  delete from hub.roles where id = p_id;
  return 'ok';
end; $$;

-- FUNCTION: roles_gestao()
CREATE FUNCTION hub.roles_gestao() RETURNS TABLE(id uuid, name text, slug text, area_id uuid, area_nome text, cadence text, order_index integer, faixa_min numeric, faixa_max numeric, n_ind integer, n_pessoas integer, n_lanc integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if to_regclass('hub.role_indicators') is not null and to_regclass('hub.entries') is not null then
    return query
    select r.id, r.name, r.slug, r.area_id, a.name, r.cadence, r.order_index,
      r.faixa_min, r.faixa_max,
      (select count(*)::int from hub.role_indicators ri where ri.role_id = r.id),
      (select count(*)::int from hub.users u
        where u.active = true
          and (u.role_id = r.id or (u.cargo_ids is not null and r.id = any(u.cargo_ids)))),
      (select count(*)::int from hub.entries e where e.role_id = r.id)
    from hub.roles r left join hub.areas a on a.id = r.area_id
    order by a.order_index nulls last, r.order_index, r.name;
  else
    -- sem o Metas: os mesmos cargos, sem os contadores dele
    return query
    select r.id, r.name, r.slug, r.area_id, a.name, r.cadence, r.order_index,
      r.faixa_min, r.faixa_max,
      0,
      (select count(*)::int from hub.users u
        where u.active = true
          and (u.role_id = r.id or (u.cargo_ids is not null and r.id = any(u.cargo_ids)))),
      0
    from hub.roles r left join hub.areas a on a.id = r.area_id
    order by a.order_index nulls last, r.order_index, r.name;
  end if;
end; $$;

-- ─── normalizar CPF/CNPJ: veio do Financeiro, o CRM também usa (função pura, de todos) ───

-- FUNCTION: fin_com_doc_norm(text)
CREATE FUNCTION hub.fin_com_doc_norm(d text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when d is null or regexp_replace(d,'\D','','g') = '' then null
    when length(regexp_replace(d,'\D','','g')) <= 11 then lpad(regexp_replace(d,'\D','','g'), 11, '0')
    else lpad(regexp_replace(d,'\D','','g'), 14, '0')
  end;
$$;

-- FUNCTION: pessoas_roster() — as pessoas ativas do time com a área e a foto (o
-- "rostinho" das listas de pessoa; quem usa hoje: Processos)
CREATE OR REPLACE FUNCTION hub.pessoas_roster() RETURNS TABLE(id uuid, nome text, email text, area_slug text, area_nome text, avatar_url text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$ select u.id, u.full_name, u.email, a.slug, a.name, u.avatar_url
            from hub.users u left join hub.areas a on a.id = (u.area_ids)[1]
           where hub.e_do_time() and coalesce(u.active, true) and u.tenant_id = hub.current_tenant_id(); $$;
