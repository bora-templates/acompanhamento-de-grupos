-- =============================================================================
-- grupos · 05 · a agenda do resumo automático (pg_cron + pg_net)
-- -----------------------------------------------------------------------------
-- A cada 15 minutos o pg_cron roda hub.gr_agenda_disparar(), que chama a Edge Function
-- gr-api com {"acao":"agendado"} e o cabeçalho x-gr-agenda (a chave gr_chave_agenda,
-- lida do cofre na hora da chamada, nunca escrita no comando da tarefa). A gr-api
-- responde na hora e faz os resumos em segundo plano.
--
-- O endereço do projeto: a instalação troca o texto https://SEU_PROJETO.supabase.co
-- deste arquivo pelo endereço de verdade (como a base faz no hub.app_push_enviar). Se a
-- gr-api já gravou o endereço em gr_ajustes.funcoes_url, vale o dela.
--
-- Banco sem pg_cron ou sem pg_net (o PGlite dos testes, por exemplo): nada aqui quebra.
-- As chamadas ao cron e ao net são dinâmicas e conferem antes se os dois existem.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

-- a agenda está de pé? (a tarefa no pg_cron, o pg_net e a chave da agenda no cofre)
create or replace function hub.gr_agenda_ativa()
returns boolean
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v boolean := false;
begin
  if to_regclass('cron.job') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into v using 'gr-resumos-automaticos';
  return coalesce(v, false) and hub.gr_segredo_existe('gr_chave_agenda');
exception when others then
  return false;
end $$;

-- liga (ou refaz) a tarefa gr-resumos-automaticos no pg_cron, a cada 15 minutos.
-- Nunca quebra: sem pg_cron, sem pg_net ou sem o cofre, devolve { ok: false, motivo }.
create or replace function hub.gr_agenda_preparar()
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
begin
  if to_regnamespace('cron') is null or to_regprocedure('cron.schedule(text,text,text)') is null then
    return jsonb_build_object('ok', false, 'motivo', 'O banco não tem o pg_cron, então o resumo automático fica desligado.');
  end if;
  if to_regnamespace('net') is null then
    return jsonb_build_object('ok', false, 'motivo', 'O banco não tem o pg_net, então o resumo automático fica desligado.');
  end if;
  perform hub.gr_segredo_garantir('gr_chave_agenda');
  execute 'select cron.schedule($1, $2, $3)'
    using 'gr-resumos-automaticos', '*/15 * * * *', 'select hub.gr_agenda_disparar()';
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'motivo', 'Não deu para ligar a agenda do resumo automático: ' || sqlerrm);
end $$;

-- o que a tarefa do pg_cron roda: chama a gr-api com a chave da agenda
create or replace function hub.gr_agenda_disparar()
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_base   text;
  v_chave  text;
  v_pedido bigint;
begin
  select nullif(btrim(coalesce(a.funcoes_url, '')), '') into v_base from hub.gr_ajustes a where a.id = 1;
  v_base := rtrim(coalesce(v_base, 'https://SEU_PROJETO.supabase.co'), '/');
  if position('SEU_PROJETO' in v_base) > 0 then
    perform hub.gr_registro_gravar('agenda',
      'A agenda ainda não sabe o endereço do projeto. Salve os ajustes da IA para a gr-api gravar o endereço.', null);
    return jsonb_build_object('ok', false, 'motivo', 'sem endereço do projeto');
  end if;
  v_chave := hub.gr_segredo_ler('gr_chave_agenda');
  if v_chave is null then
    perform hub.gr_registro_gravar('agenda', 'A chave da agenda não está no cofre. Rode a instalação de novo ou salve os ajustes da IA.', null);
    return jsonb_build_object('ok', false, 'motivo', 'sem chave da agenda');
  end if;
  if to_regnamespace('net') is null then
    return jsonb_build_object('ok', false, 'motivo', 'O banco não tem o pg_net.');
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    into v_pedido
    using v_base || '/functions/v1/gr-api',
          jsonb_build_object('acao', 'agendado'),
          jsonb_build_object('Content-Type', 'application/json', 'x-gr-agenda', v_chave);
  return jsonb_build_object('ok', true, 'pedido', v_pedido);
exception when others then
  perform hub.gr_registro_gravar('agenda', 'Falha ao chamar a gr-api pela agenda.', jsonb_build_object('codigo', sqlstate));
  return jsonb_build_object('ok', false, 'motivo', 'falha ao chamar a gr-api');
end $$;

-- Separa os grupos cujo resumo automático chegou na hora (horário de Brasília) e que ainda
-- não tiveram resumo automático hoje. Marca ultimo_auto_em na mesma hora, então duas rodadas
-- da agenda nunca pegam o mesmo grupo, e conta a tentativa do dia (no máximo 3 por dia; a
-- gr-api devolve o ultimo_auto_em anterior quando o resumo falha, por gr_agenda_devolver).
-- periodo: "ontem" para o resumo da meia-noite (hora 0), "hoje" para as outras horas.
-- teve_mensagem diz se o período teve alguma mensagem.
create or replace function hub.gr_agenda_reservar(p_limite int default 5)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_agora_br timestamp := now() at time zone 'America/Sao_Paulo';
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hora     int := extract(hour from v_agora_br)::int;
  v_inicio   timestamptz := v_hoje::timestamp at time zone 'America/Sao_Paulo';
  v_ontem    timestamptz := (v_hoje - 1)::timestamp at time zone 'America/Sao_Paulo';
  v          jsonb;
begin
  with alvo as (
    select g.id, g.ultimo_auto_em as anterior
      from hub.gr_grupos g
     where g.resumo_auto and g.ativo and not g.exemplo
       and g.resumo_hora <= v_hora
       and (g.ultimo_auto_em is null or (g.ultimo_auto_em at time zone 'America/Sao_Paulo')::date < v_hoje)
       and not (g.auto_tentativas_dia is not distinct from v_hoje and g.auto_tentativas >= 3)
     order by g.resumo_hora, g.id
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update hub.gr_grupos g
       set ultimo_auto_em = now(),
           auto_tentativas = case when g.auto_tentativas_dia is not distinct from v_hoje then g.auto_tentativas + 1 else 1 end,
           auto_tentativas_dia = v_hoje
      from alvo
     where g.id = alvo.id
    returning g.id, g.resumo_envia, g.resumo_hora, g.auto_tentativas, alvo.anterior
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'grupo', m.id,
           'envia', m.resumo_envia,
           'anterior', m.anterior,
           'tentativa', m.auto_tentativas,
           'periodo', case when m.resumo_hora = 0 then 'ontem' else 'hoje' end,
           'teve_mensagem', exists (select 1 from hub.gr_mensagens x
                                     where x.grupo_id = m.id
                                       and x.momento >= case when m.resumo_hora = 0 then v_ontem else v_inicio end
                                       and x.momento < case when m.resumo_hora = 0 then v_inicio else now() + interval '1 minute' end))),
           '[]'::jsonb)
    into v
    from marcados m;
  return v;
end $$;

-- o resumo automático falhou: o grupo volta a ficar sem o resumo de hoje (o ultimo_auto_em de
-- antes) e a agenda tenta de novo na próxima rodada, até 3 tentativas no dia
create or replace function hub.gr_agenda_devolver(p_grupo uuid, p_anterior timestamptz)
returns void
language sql security definer
set search_path = hub, public
as $$
  update hub.gr_grupos set ultimo_auto_em = p_anterior where id = p_grupo
$$;

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function
  hub.gr_agenda_ativa(), hub.gr_agenda_preparar(), hub.gr_agenda_disparar(), hub.gr_agenda_reservar(int),
  hub.gr_agenda_devolver(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function
  hub.gr_agenda_ativa(), hub.gr_agenda_preparar(), hub.gr_agenda_disparar(), hub.gr_agenda_reservar(int),
  hub.gr_agenda_devolver(uuid, timestamptz)
to service_role;
