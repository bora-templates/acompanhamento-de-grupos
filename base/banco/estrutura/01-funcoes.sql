-- SCHEMA: hub
CREATE SCHEMA hub;

-- FUNCTION: ag_conhecimento_touch()
CREATE FUNCTION hub.ag_conhecimento_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.atualizado_em := now();
  new.busca := to_tsvector('portuguese',
    hub.ag_sem_acento(coalesce(new.titulo,'') || ' ' || coalesce(new.texto,'') || ' ' ||
                      coalesce(new.quando_usar,'') || ' ' || array_to_string(new.tags,' ')));
  return new;
end $$;

-- FUNCTION: ag_pode_ver(text)
CREATE FUNCTION hub.ag_pode_ver(p_chave text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select case
    when p_chave is null or btrim(p_chave) = '' then true
    else coalesce((
      select u.access_level = 'admin'
          or (u.acessos->>p_chave) is distinct from 'false'
        from hub.users u where u.id = auth.uid() and u.active), false)
  end;
$$;

-- FUNCTION: ag_sem_acento(text)
CREATE FUNCTION hub.ag_sem_acento(p_txt text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'public'
    AS $$ select public.unaccent('public.unaccent'::regdictionary, coalesce(p_txt,'')) $$;

-- FUNCTION: agenda_tipo_padrao(text)
CREATE FUNCTION hub.agenda_tipo_padrao(p_estrategista text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  -- Tipo da call quando a tela não mandou nenhum: Análise Individual.
  -- Não depende de QUEM é o estrategista — o tipo certo vem da tela (p_tipo);
  -- o parâmetro continua só para não quebrar quem já chama esta função.
  select 'analise'::text
$$;

-- FUNCTION: aloc_diff(text[], text[], text)
CREATE FUNCTION hub.aloc_diff(p_antes text[], p_depois text[], p_modo text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'hub', 'public'
    AS $$
  with a as (select lower(btrim(x)) k from unnest(coalesce(p_antes,  '{}'::text[])) x
              where btrim(x) <> ''),
       d as (select btrim(x) v, lower(btrim(x)) k from unnest(coalesce(p_depois, '{}'::text[])) x
              where btrim(x) <> ''),
       av as (select btrim(x) v, lower(btrim(x)) k from unnest(coalesce(p_antes, '{}'::text[])) x
               where btrim(x) <> '')
  select case when p_modo = 'entrou'
    then array(select distinct v from d where k not in (select k from a))
    else array(select distinct v from av where k not in (select k from d))
  end;
$$;

-- FUNCTION: aloc_nomes(text)
CREATE FUNCTION hub.aloc_nomes(p_txt text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'hub', 'public'
    AS $$
  select array(select btrim(x) from unnest(string_to_array(coalesce(p_txt, ''), ',')) x
                where btrim(x) <> '');
$$;

-- FUNCTION: aloc_pessoas(jsonb)
CREATE FUNCTION hub.aloc_pessoas(p_valor jsonb) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'hub', 'public'
    AS $_$
declare v_txt text; v_out text[];
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then return '{}'::text[]; end if;

  -- lista de nomes (assignees)
  if jsonb_typeof(p_valor) = 'array' then
    return array(select btrim(x) from jsonb_array_elements_text(p_valor) x where btrim(x) <> '');
  end if;

  if jsonb_typeof(p_valor) <> 'string' then return '{}'::text[]; end if;
  v_txt := btrim(p_valor #>> '{}');
  if v_txt = '' then return '{}'::text[]; end if;

  -- uuid -> vira o nome da pessoa (as telas de banco novo guardam id)
  if v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select array[full_name] into v_out from hub.users where id = v_txt::uuid;
    return coalesce(v_out, '{}'::text[]);
  end if;

  -- texto "Fulano, Beltrano"
  return hub.aloc_nomes(v_txt);
end; $_$;

-- FUNCTION: alocacao_generica()
CREATE FUNCTION hub.alocacao_generica() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare
  v_sistema  text := tg_argv[0];
  v_entidade text := tg_argv[1];
  v_colp     text := tg_argv[2];
  v_colt     text := tg_argv[3];
  v_linkfmt  text := tg_argv[4];
  v_cols     text := coalesce(tg_argv[5], '');
  v_fechado  text := coalesce(tg_argv[6], '');
  v_humano   text := coalesce(tg_argv[7], 'nao');
  v_novo jsonb := to_jsonb(new);
  v_velho jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_antes text[]; v_depois text[];
  v_id text; v_titulo text; v_link text; v_status text;
  v_user uuid; nome text;
begin
  if v_humano = 'sim' and auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and v_novo -> v_colp is not distinct from v_velho -> v_colp then return new; end if;

  v_antes  := case when tg_op = 'UPDATE' then hub.aloc_pessoas(v_velho -> v_colp) else '{}'::text[] end;
  v_depois := hub.aloc_pessoas(v_novo -> v_colp);
  if v_antes = v_depois then return new; end if;

  v_id     := coalesce(v_novo ->> 'id', '');
  if v_id = '' then return new; end if;
  v_titulo := coalesce(nullif(btrim(coalesce(v_novo ->> v_colt, '')), ''), initcap(v_entidade));
  v_link   := replace(v_linkfmt, '%s', v_id);
  v_status := case when v_cols <> '' then lower(coalesce(v_novo ->> v_cols, '')) else '' end;

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'saiu') loop
    perform hub.registrar_alocacao(v_sistema, v_entidade, v_id, v_titulo, nome, 'saiu', v_link, null);
  end loop;

  foreach nome in array hub.aloc_diff(v_antes, v_depois, 'entrou') loop
    perform hub.registrar_alocacao(v_sistema, v_entidade, v_id, v_titulo, nome, 'entrou', v_link, null);
    -- atividade já encerrada registra, mas não incomoda ninguém com aviso
    if v_fechado <> '' and v_status = any(string_to_array(lower(v_fechado), ',')) then continue; end if;
    v_user := hub.aviso_user_por_nome(nome);
    if v_user is null then continue; end if;
    perform hub.avisar(v_user, 'alocacao', v_sistema, v_titulo, initcap(v_entidade), v_link, null, null);
  end loop;
  return new;
end; $$;

-- FUNCTION: alocacoes_resumo(text, text)
CREATE FUNCTION hub.alocacoes_resumo(p_sistema text, p_entidade_id text) RETURNS TABLE(quando timestamp with time zone, linha text, pessoa text, acao text, autor text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  select l.criado_em,
         case when l.acao = 'entrou'
              then coalesce(l.autor, 'Alguém') || ' alocou ' || l.pessoa
              else coalesce(l.autor, 'Alguém') || ' tirou ' || l.pessoa || ' da alocação'
         end,
         l.pessoa, l.acao, l.autor
    from hub.alocacoes_log l
   where l.sistema = p_sistema and l.entidade_id = p_entidade_id
   order by l.criado_em desc
   limit 50;
$$;

-- FUNCTION: app_aparelho_desconectar(uuid)
CREATE FUNCTION hub.app_aparelho_desconectar(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  update hub.app_aparelhos a
     set desconectado_em = now(), desconectado_por = auth.uid()
   where a.id = p_id and a.desconectado_em is null
     and (a.user_id = auth.uid() or hub.app_sou_admin_usuarios());
  if not found then
    raise exception 'Aparelho não encontrado (ou não é seu).' using errcode = 'P0002';
  end if;
end $$;

-- FUNCTION: app_aparelho_esquecer(text)
CREATE FUNCTION hub.app_aparelho_esquecer(p_endpoint text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
  delete from hub.app_aparelhos where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- FUNCTION: app_aparelho_registrar(text, text, text, text, text)
CREATE FUNCTION hub.app_aparelho_registrar(p_endpoint text, p_p256dh text, p_auth text, p_rotulo text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
declare v_id uuid;
begin
  if not hub.e_do_time() then
    raise exception 'Só quem é do time liga notificações.' using errcode = '42501';
  end if;
  if coalesce(p_endpoint,'') !~ '^https://' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    raise exception 'Inscrição de notificação inválida.' using errcode = '22023';
  end if;
  -- desconectado pelo RH: este endereço não volta sozinho
  if exists (select 1 from hub.app_aparelhos where endpoint = p_endpoint and desconectado_em is not null) then
    return null;
  end if;
  insert into hub.app_aparelhos (user_id, endpoint, p256dh, auth, rotulo, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_rotulo, 40), left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         rotulo = excluded.rotulo, user_agent = excluded.user_agent,
         visto_em = now(), falhas = 0
  returning id into v_id;
  return v_id;
end $$;

-- FUNCTION: app_da_pessoa(uuid)
CREATE FUNCTION hub.app_da_pessoa(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if not hub.app_sou_admin_usuarios() and p_user is distinct from auth.uid() then
    raise exception 'Só a administração de usuários vê os aparelhos de outra pessoa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'aparelhos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'rotulo', a.rotulo, 'criado_em', a.criado_em,
                                          'visto_em', a.visto_em, 'ultimo_envio', a.ultimo_envio)
                       order by a.visto_em desc)
        from hub.app_aparelhos a where a.user_id = p_user and a.desconectado_em is null), '[]'::jsonb),
    'convite', (
      select jsonb_build_object('criado_em', c.criado_em, 'vence_em', c.vence_em, 'usado_em', c.usado_em,
                                'cancelado_em', c.cancelado_em,
                                'criado_por', (select u.full_name from hub.users u where u.id = c.criado_por))
        from hub.app_convites c where c.user_id = p_user
       order by c.criado_em desc limit 1)
  );
end $$;

-- FUNCTION: app_painel()
CREATE FUNCTION hub.app_painel() RETURNS TABLE(user_id uuid, nome text, email text, avatar_url text, convite_criado timestamp with time zone, convite_vence timestamp with time zone, convite_usado timestamp with time zone, convite_cancelado timestamp with time zone, instalou_em timestamp with time zone, ultimo_app timestamp with time zone, ultimo_navegador_celular timestamp with time zone, dias_app_7 integer, aparelhos_com_aviso integer, ultimo_acesso timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'hub', 'public'
    AS $$
begin
  if not hub.app_sou_admin_usuarios() then
    raise exception 'Só a administração de usuários vê o uso do app.' using errcode = '42501';
  end if;
  return query
  select u.id, u.full_name, u.email, u.avatar_url,
         c.criado_em, c.vence_em, c.usado_em, c.cancelado_em,
         (select min(a.primeiro_em) from hub.app_uso a where a.user_id = u.id and a.onde = 'app'),
         (select max(a.ultimo_em)   from hub.app_uso a where a.user_id = u.id and a.onde = 'app'),
         (select max(a.ultimo_em)   from hub.app_uso a where a.user_id = u.id and a.onde = 'navegador'),
         (select count(distinct a.dia)::int from hub.app_uso a
           where a.user_id = u.id and a.onde = 'app' and a.dia > (now() at time zone 'America/Sao_Paulo')::date - 7),
         (select count(*)::int from hub.app_aparelhos d where d.user_id = u.id and d.desconectado_em is null),
         (select max(s.fim) from hub.os_sessao s where s.user_id = u.id)
    from hub.users u
    left join lateral (
      select * from hub.app_convites x where x.user_id = u.id order by x.criado_em desc limit 1
    ) c on true
   where u.active = true
   order by u.full_name;
end $$;

