-- =============================================================================
-- grupos · 02 · acesso, cofre e ajudantes
-- -----------------------------------------------------------------------------
-- Toda função nasce com EXECUTE para PUBLIC (e a chave publicável herda). Por isso
-- cada arquivo fecha as próprias funções no fim, na mesma transação em que elas
-- nascem: revoke de public, anon e authenticated, e depois o grant nominal
-- (tela → authenticated; Edge Function → service_role).
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

-- ── quem pode o quê ─────────────────────────────────────────────────────────
-- A chave do módulo em hub.users.acessos é "grupos" e ela é RESTRITA: sem a chave, a
-- pessoa não tem acesso. false ou ausente = nenhum; 'view' = ver; true = editar;
-- 'admin' = admin. A chave vale para todos, inclusive para o admin geral, como a tela
-- Usuários e a trava das telas já fazem. O convidado vê no máximo. Pessoa inativa ou
-- fora do time não tem acesso.
--   ver      lê grupos, conversa, resumos, participantes e materiais, e pergunta à IA
--   editar   também faz e manda resumos, escreve orientações, cuida dos materiais e
--            dos participantes, liga o resumo automático e carrega o grupo de exemplo
--   admin    também liga a IA, a transcrição e o WhatsApp, escolhe, pausa e remove grupos
create or replace function hub.gr_acesso_de(p_user uuid)
returns text
language sql stable security definer
set search_path = hub, public
as $$
  select case
    when u.id is null or not coalesce(u.active, false)                          then 'nenhum'
    when coalesce(u.acessos ->> 'grupos', '') not in ('view', 'true', 'admin')  then 'nenhum'
    when coalesce(u.acessos ->> '_perfil', '') = 'convidado'                    then 'ver'
    when u.acessos ->> 'grupos' = 'view'                                        then 'ver'
    when u.acessos ->> 'grupos' = 'admin'                                       then 'admin'
    else 'editar'
  end
  from (select 1) x
  left join hub.users u on u.id = p_user;
$$;
comment on function hub.gr_acesso_de(uuid) is
  'Acompanhamento de Grupos: o nível de uma pessoa (nenhum, ver, editar, admin) pela chave restrita "grupos" de hub.users.acessos.';

-- quem está logado VÊ o módulo? (as políticas de leitura usam esta)
create or replace function hub.gr_pode_ver()
returns boolean
language sql stable security definer
set search_path = hub, public
as $$ select hub.e_do_time() and hub.gr_acesso_de(auth.uid()) in ('ver', 'editar', 'admin') $$;

-- quem está logado pode fazer e mandar resumos, cuidar de orientações, materiais e participantes?
create or replace function hub.gr_pode_administrar()
returns boolean
language sql stable security definer
set search_path = hub, public
as $$ select hub.e_do_time() and hub.gr_acesso_de(auth.uid()) in ('editar', 'admin') $$;

-- quem está logado pode ligar a IA e o WhatsApp, escolher, pausar e remover grupos?
create or replace function hub.gr_pode_configurar()
returns boolean
language sql stable security definer
set search_path = hub, public
as $$ select hub.e_do_time() and hub.gr_acesso_de(auth.uid()) = 'admin' $$;

-- a trava que as funções das telas chamam no começo: erro claro em português
create or replace function hub.gr_exige(p_nivel text)
returns void
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v_nivel text := hub.gr_acesso_de(auth.uid());
begin
  if auth.uid() is null or not hub.e_do_time() or v_nivel = 'nenhum' then
    raise exception 'Você não tem acesso ao Acompanhamento de Grupos. Peça a quem administra o sistema para liberar o acesso na tela Usuários.';
  end if;
  if p_nivel = 'administrar' and v_nivel not in ('editar', 'admin') then
    raise exception 'Seu acesso ao Acompanhamento de Grupos permite só ver. Peça a quem administra o sistema para liberar a edição na tela Usuários.';
  end if;
  if p_nivel = 'configurar' and v_nivel <> 'admin' then
    raise exception 'Só quem administra o Acompanhamento de Grupos pode fazer isso. Peça a quem administra o sistema para liberar o acesso de administrador na tela Usuários.';
  end if;
end $$;

-- ── o cofre (Supabase Vault) ────────────────────────────────────────────────
-- Tokens e chaves ficam no Vault com estes nomes e nenhum outro. Só a chave de serviço
-- grava e lê; as funções das telas só perguntam se existe (para dizer "configurado").
create or replace function hub.gr_segredo_nome_valido(p_nome text)
returns boolean
language sql immutable
set search_path = hub, public
as $$
  select coalesce(p_nome, '') in ('gr_whatsapp_token', 'gr_ia_chave', 'gr_transcricao_chave', 'gr_chave_entrada', 'gr_chave_agenda')
$$;

-- cria ou troca um segredo (recusa nome fora da lista e valor vazio)
create or replace function hub.gr_segredo_gravar(p_nome text, p_valor text)
returns void
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_valor text := btrim(coalesce(p_valor, ''));
  v_id uuid;
begin
  if not hub.gr_segredo_nome_valido(p_nome) then
    raise exception 'O cofre do Acompanhamento de Grupos não guarda o nome "%".', coalesce(p_nome, '');
  end if;
  if v_valor = '' then
    raise exception 'O valor de % veio vazio. Informe o valor e salve de novo.', p_nome;
  end if;
  if to_regnamespace('vault') is null then
    raise exception 'O cofre do Supabase (Vault) não está ligado neste banco. Ligue a extensão supabase_vault no painel do Supabase e tente de novo.';
  end if;
  select s.id into v_id from vault.secrets s where s.name = p_nome limit 1;
  if v_id is null then
    perform vault.create_secret(v_valor, p_nome, 'Acompanhamento de Grupos no WhatsApp com IA');
  else
    perform vault.update_secret(v_id, v_valor);
  end if;
end $$;

-- lê um segredo (nulo quando não existe)
create or replace function hub.gr_segredo_ler(p_nome text)
returns text
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v text;
begin
  if not hub.gr_segredo_nome_valido(p_nome) or to_regnamespace('vault') is null then
    return null;
  end if;
  select d.decrypted_secret into v from vault.decrypted_secrets d where d.name = p_nome limit 1;
  return nullif(v, '');
end $$;

-- diz se o segredo existe, sem ler o valor
create or replace function hub.gr_segredo_existe(p_nome text)
returns boolean
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  if not hub.gr_segredo_nome_valido(p_nome) or to_regnamespace('vault') is null then
    return false;
  end if;
  return exists (select 1 from vault.secrets s where s.name = p_nome);
end $$;

-- cria uma chave aleatória forte quando ela falta (só as duas chaves que a solução inventa:
-- a da entrada, que vai no endereço cadastrado na uazapi, e a da agenda do pg_cron).
-- Devolve true quando criou agora.
create or replace function hub.gr_segredo_garantir(p_nome text)
returns boolean
language plpgsql security definer
set search_path = hub, public
as $$
begin
  if coalesce(p_nome, '') not in ('gr_chave_entrada', 'gr_chave_agenda') then
    raise exception 'A solução só cria sozinha a chave da entrada (gr_chave_entrada) e a chave da agenda (gr_chave_agenda).';
  end if;
  if hub.gr_segredo_existe(p_nome) then
    return false;
  end if;
  -- dois uuid v4 juntos: 64 caracteres hexadecimais vindos do gerador forte do Postgres
  perform hub.gr_segredo_gravar(p_nome, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
  return true;
end $$;

-- ── o registro de falhas (sem token e sem texto de mensagem) ────────────────
create or replace function hub.gr_registro_gravar(p_origem text, p_mensagem text, p_detalhe jsonb default null)
returns void
language sql security definer
set search_path = hub, public
as $$
  insert into hub.gr_registro (origem, mensagem, detalhe)
  values (left(coalesce(p_origem, ''), 40), left(coalesce(p_mensagem, ''), 500),
          case when p_detalhe is null or octet_length(p_detalhe::text) > 4000 then null else p_detalhe end);
$$;

-- ── ajudantes internos ──────────────────────────────────────────────────────
-- o começo do dia de hoje no horário de Brasília (o "hoje" das telas e da agenda)
create or replace function hub.gr_inicio_de_hoje()
returns timestamptz
language sql stable
set search_path = hub, public
as $$ select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' $$;

-- a importação das mensagens recentes ainda corre? (com um teto de 15 minutos, para o
-- selo não ficar preso se a função na nuvem parar no meio). O segundo valor é o começo da
-- importação: importacao_inicio, ou o criado_em para a primeira.
create or replace function hub.gr_importando(p_importado_em timestamptz, p_criado_em timestamptz)
returns boolean
language sql stable
set search_path = hub, public
as $$ select p_importado_em is null and coalesce(p_criado_em, now()) > now() - interval '15 minutes' $$;

-- Quando sai o próximo resumo automático (a hora cheia de Brasília; a agenda roda a cada 15
-- minutos, então ele sai até 15 minutos depois). Nulo com o resumo automático desligado.
-- Com o resumo de hoje já feito (ou com as 3 tentativas do dia gastas), é amanhã; com a hora
-- de hoje ainda por vir, é hoje; com a hora passada e sem o resumo de hoje, é agora (na
-- próxima rodada da agenda).
create or replace function hub.gr_proximo_auto(p_auto boolean, p_hora int, p_ultimo timestamptz,
                                               p_tentativas int default 0, p_tentativas_dia date default null)
returns timestamptz
language sql stable
set search_path = hub, public
as $$
  select case
    when not coalesce(p_auto, false) or p_hora is null then null
    when (p_ultimo is not null and (p_ultimo at time zone 'America/Sao_Paulo')::date >= b.hoje)
      or (p_tentativas_dia = b.hoje and coalesce(p_tentativas, 0) >= 3)
      then ((b.hoje + 1) + make_time(p_hora, 0, 0)) at time zone 'America/Sao_Paulo'
    else greatest(now(), (b.hoje + make_time(p_hora, 0, 0)) at time zone 'America/Sao_Paulo')
  end
  from (select (now() at time zone 'America/Sao_Paulo')::date as hoje) b
$$;

-- os ajustes no formato que o painel e a gr-api devolvem (nunca o valor de um segredo).
-- Quem não configura a solução recebe só os campos do contrato, sem o endereço do servidor
-- da uazapi, o endereço da IA, a frase do último erro do WhatsApp e o modelo e a origem da
-- chave da transcrição. p_completo nulo decide
-- pela pessoa logada (hub.gr_pode_configurar); a gr-api pede o completo (gr_ajustes_ler).
drop function if exists hub.gr_ajustes_json();
create or replace function hub.gr_ajustes_json(p_completo boolean default null)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select case when coalesce(p_completo, hub.gr_pode_configurar()) then x.contrato || x.completo else x.contrato end
  from (
  select jsonb_build_object(
    'whatsapp_estado',         coalesce(a.whatsapp_estado, 'desligado'),
    'whatsapp_numero',         a.whatsapp_numero,
    'whatsapp_configurado',    (a.whatsapp_servidor is not null and hub.gr_segredo_existe('gr_whatsapp_token')),
    'ia_provedor',             a.ia_provedor,
    'ia_modelo',               a.ia_modelo,
    'ia_configurada',          (a.ia_provedor is not null
                                and hub.gr_segredo_existe('gr_ia_chave')
                                and (coalesce(a.ia_modelo, '') <> '' or a.ia_provedor in ('anthropic', 'deepseek'))
                                and (a.ia_provedor <> 'compativel' or coalesce(a.ia_url, '') <> '')),
    'transcricao_provedor',    a.transcricao_provedor,
    'transcricao_configurada', (a.transcricao_provedor is not null and hub.gr_segredo_existe('gr_transcricao_chave')),
    'agenda_pronta',           hub.gr_agenda_ativa()) as contrato,
         jsonb_build_object(
    'whatsapp_erro',           a.whatsapp_erro,
    'whatsapp_servidor',       a.whatsapp_servidor,
    'whatsapp_conferido_em',   a.whatsapp_conferido_em,
    'ia_url',                  a.ia_url,
    'transcricao_modelo',      a.transcricao_modelo,
    'transcricao_chave_da_ia', coalesce(a.transcricao_chave_da_ia, false)) as completo
  from (select 1) u
  left join hub.gr_ajustes a on a.id = 1
  ) x;
$$;

-- Devolve o grupo inteiro (os campos da tabela, com importadas e importacao_erro), os totais, o
-- selo da importação e quando sai o próximo resumo automático.
create or replace function hub.gr_grupo_json(p_grupo uuid)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select to_jsonb(g) || jsonb_build_object(
           'mensagens_total',     (select count(*) from hub.gr_mensagens m where m.grupo_id = g.id),
           'materiais_total',     (select count(*) from hub.gr_materiais t where t.grupo_id = g.id),
           'participantes_total', (select count(*) from hub.gr_participantes p where p.grupo_id = g.id),
           'importando',          hub.gr_importando(g.importado_em, coalesce(g.importacao_inicio, g.criado_em)),
           'proximo_auto',        hub.gr_proximo_auto(g.resumo_auto and g.ativo and not g.exemplo, g.resumo_hora, g.ultimo_auto_em,
                                                   g.auto_tentativas, g.auto_tentativas_dia))
    from hub.gr_grupos g
   where g.id = p_grupo;
$$;

-- os participantes no formato das telas: administradores primeiro; sem nome no WhatsApp,
-- vale o último nome com que a pessoa escreveu no grupo
create or replace function hub.gr_participantes_json(p_grupo uuid)
returns jsonb
language sql stable security definer
set search_path = hub, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('jid', x.jid, 'nome', x.nome, 'telefone', x.telefone, 'admin', x.admin)
                            order by x.admin desc, (x.nome is null), lower(coalesce(x.nome, x.telefone, x.jid))), '[]'::jsonb)
    from (
      select p.jid, p.telefone, p.admin,
             coalesce(p.nome, (select m.autor_nome from hub.gr_mensagens m
                                where m.grupo_id = p.grupo_id and m.autor_jid = p.jid and m.autor_nome is not null
                                order by m.momento desc limit 1)) as nome
        from hub.gr_participantes p
       where p.grupo_id = p_grupo
    ) x;
$$;

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function
  hub.gr_acesso_de(uuid), hub.gr_pode_ver(), hub.gr_pode_administrar(), hub.gr_pode_configurar(),
  hub.gr_exige(text), hub.gr_segredo_nome_valido(text), hub.gr_segredo_gravar(text, text),
  hub.gr_segredo_ler(text), hub.gr_segredo_existe(text), hub.gr_segredo_garantir(text),
  hub.gr_registro_gravar(text, text, jsonb), hub.gr_inicio_de_hoje(), hub.gr_importando(timestamptz, timestamptz),
  hub.gr_proximo_auto(boolean, int, timestamptz, int, date),
  hub.gr_ajustes_json(boolean), hub.gr_grupo_json(uuid), hub.gr_participantes_json(uuid)
from public, anon, authenticated;

-- a TELA: só as três perguntas de acesso (as políticas de leitura usam a primeira)
grant execute on function hub.gr_pode_ver(), hub.gr_pode_administrar(), hub.gr_pode_configurar() to authenticated;

-- a EDGE FUNCTION (chave de serviço)
grant execute on function
  hub.gr_acesso_de(uuid), hub.gr_pode_ver(), hub.gr_pode_administrar(), hub.gr_pode_configurar(),
  hub.gr_exige(text), hub.gr_segredo_nome_valido(text), hub.gr_segredo_gravar(text, text),
  hub.gr_segredo_ler(text), hub.gr_segredo_existe(text), hub.gr_segredo_garantir(text),
  hub.gr_registro_gravar(text, text, jsonb), hub.gr_inicio_de_hoje(), hub.gr_importando(timestamptz, timestamptz),
  hub.gr_proximo_auto(boolean, int, timestamptz, int, date),
  hub.gr_ajustes_json(boolean), hub.gr_grupo_json(uuid), hub.gr_participantes_json(uuid)
to service_role;
