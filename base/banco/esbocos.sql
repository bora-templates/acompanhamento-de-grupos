-- =============================================================================
-- base/banco/esbocos.sql: roda no FIM das ligações (as duas instalações chamam).
-- Gerado por boraia-fabrica/gerar-esbocos.mjs a partir do hub completo: não editar à mão.
--
-- Funções do OutFunnels leem visões que só nascem quando outro módulo está no banco
-- (as vendas e os indicadores do OutPerformance, as renovações do OutJourney). Com o
-- OutFunnels sem esses módulos, cada visão que faltar ganha aqui um esboço: as mesmas
-- colunas, nenhuma linha. Assim as telas mostram vazio em vez de erro. O esbocos-tira.sql
-- apaga os esboços no COMEÇO das ligações, e a visão de verdade nasce quando o módulo chega.
-- Sem o OutFunnels (hub.of_negocios), nada aqui roda.
-- =============================================================================

-- of_v_agenda_com_lead: 37 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_agenda_com_lead') is null then
    create view hub.of_v_agenda_com_lead as
    select null::text as fonte,
           null::text as id,
           null::date as data_agendamento,
           null::date as data_reuniao,
           null::text as agendado_por,
           null::text as closer,
           null::text as cliente,
           null::text as email,
           null::text as whatsapp,
           null::text as funil,
           null::text as situacao,
           null::uuid as lead_id,
           null::text as lead_nome,
           null::text as lead_pagina,
           null::text as lead_canal,
           null::text as lead_funil,
           null::text as lead_faturamento,
           null::boolean as lead_mql,
           null::timestamp with time zone as lead_entrou_em,
           null::uuid as sdr_id,
           null::uuid as closer_id,
           null::uuid as funil_id,
           null::uuid as situacao_id,
           null::text as observacao,
           null::boolean as editavel,
           null::timestamp with time zone as reuniao_hora,
           null::integer as duracao_min,
           null::text as gcal_event_id,
           null::text as reuniao_link,
           null::text as lead_anuncio,
           null::text as lead_campanha,
           null::uuid as negocio_id,
           null::text as gravacao_url,
           null::text as transcricao_url,
           null::text as lead_anuncio_id,
           null::text as lead_pagina_url,
           null::timestamp with time zone as realizado_em
     where false;
    comment on view hub.of_v_agenda_com_lead is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_agenda_com_lead to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_agenda_com_lead to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_agenda_com_lead to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_agenda_com_lead to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_agendamentos_hub: 16 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_agendamentos_hub') is null then
    create view hub.of_v_agendamentos_hub as
    select null::uuid as id,
           null::date as data_agendamento,
           null::date as data_reuniao,
           null::text as agendado_por,
           null::text as cliente,
           null::text as email,
           null::text as whatsapp,
           null::text as funil,
           null::text as situacao,
           null::boolean as virou_venda,
           null::text as observacao,
           null::text as closer,
           null::timestamp with time zone as reuniao_em,
           null::integer as duracao_min,
           null::text as gcal_event_id,
           null::text as reuniao_link
     where false;
    comment on view hub.of_v_agendamentos_hub is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_agendamentos_hub to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_agendamentos_hub to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_agendamentos_hub to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_agendamentos_hub to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_alertas: 9 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_alertas') is null then
    create view hub.of_v_alertas as
    select null::text as tipo,
           null::text as gravidade,
           null::text as chave,
           null::text as sobre,
           null::text as responsavel,
           null::text as titulo,
           null::text as pergunta,
           null::timestamp with time zone as desde,
           null::text as link
     where false;
    comment on view hub.of_v_alertas is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_alertas to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_alertas to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_alertas to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_alertas to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_compradores: 25 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_compradores') is null then
    create view hub.of_v_compradores as
    select null::uuid as id,
           null::date as data_fechamento,
           null::date as data_entrada,
           null::date as data_reuniao,
           null::date as data_resposta,
           null::text as vendedor,
           null::text as sdr,
           null::text as cs_responsavel,
           null::text as cliente_nome,
           null::text as cliente_email,
           null::text as cliente_whatsapp,
           null::text as funil,
           null::text as produto,
           null::numeric(12,2) as valor_venda,
           null::numeric(12,2) as em_caixa,
           null::text as tipo_venda,
           null::uuid as lead_id,
           null::text as lead_pagina,
           null::text as lead_canal,
           null::text as lead_funil,
           null::text as lead_faturamento,
           null::boolean as lead_mql,
           null::timestamp with time zone as lead_entrou_em,
           null::text as agendado_por,
           null::date as data_call
     where false;
    comment on view hub.of_v_compradores is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_compradores to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_compradores to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_compradores to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_compradores to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_lancamentos: 7 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_lancamentos') is null then
    create view hub.of_v_lancamentos as
    select null::date as dia,
           null::text as pessoa,
           null::text as cargo,
           null::text as indicador,
           null::text as indicador_nome,
           null::text as tipo,
           null::numeric as valor
     where false;
    comment on view hub.of_v_lancamentos is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_lancamentos to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_lancamentos to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_lancamentos to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_lancamentos to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_perf_dia: 5 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_perf_dia') is null then
    create view hub.of_v_perf_dia as
    select null::date as dia,
           null::text as pessoa,
           null::text as cargo,
           null::jsonb as valores,
           null::bigint as indicadores
     where false;
    comment on view hub.of_v_perf_dia is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_perf_dia to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_perf_dia to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_perf_dia to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_perf_dia to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_perf_mes: 8 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_perf_mes') is null then
    create view hub.of_v_perf_mes as
    select null::text as mes,
           null::text as pessoa,
           null::text as cargo,
           null::text as indicador,
           null::text as indicador_nome,
           null::text as tipo,
           null::numeric as valor,
           null::bigint as dias_lancados
     where false;
    comment on view hub.of_v_perf_mes is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_perf_mes to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_perf_mes to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_perf_mes to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_perf_mes to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_retencao: 29 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_retencao') is null then
    create view hub.of_v_retencao as
    select null::text as atendimento_id,
           null::uuid as cliente_id,
           null::text as cliente,
           null::text as tipo,
           null::text as plano,
           null::integer as ciclo,
           null::date as vencimento,
           null::numeric as valor,
           null::text as cs_da_conta,
           null::text as responsavel,
           null::text as alocados,
           null::date as prazo_falar,
           null::text as assunto,
           null::text as desfecho,
           null::text as status_original,
           null::date as data_desfecho,
           null::boolean as tem_contrato,
           null::integer as etapa,
           null::text as status,
           null::integer as dias_para_vencer,
           null::date as proximo_contato,
           null::text as proximo_combinado,
           null::text as telefone,
           null::text as email,
           null::text as e164,
           null::text as chat_jid,
           null::text as cpf,
           null::text as tipo_cliente,
           null::uuid as etapa_id
     where false;
    comment on view hub.of_v_retencao is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_retencao to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_retencao to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_retencao to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_retencao to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_vendas_com_lead: 23 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_vendas_com_lead') is null then
    create view hub.of_v_vendas_com_lead as
    select null::uuid as id,
           null::date as data_fechamento,
           null::date as data_entrada,
           null::date as data_reuniao,
           null::date as data_resposta,
           null::text as vendedor,
           null::text as sdr,
           null::text as cs_responsavel,
           null::text as cliente_nome,
           null::text as cliente_email,
           null::text as cliente_whatsapp,
           null::text as funil,
           null::text as produto,
           null::numeric(12,2) as valor_venda,
           null::numeric(12,2) as em_caixa,
           null::text as tipo_venda,
           null::uuid as lead_id,
           null::text as lead_pagina,
           null::text as lead_canal,
           null::text as lead_funil,
           null::text as lead_faturamento,
           null::boolean as lead_mql,
           null::timestamp with time zone as lead_entrou_em
     where false;
    comment on view hub.of_v_vendas_com_lead is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_vendas_com_lead to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_vendas_com_lead to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_vendas_com_lead to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_vendas_com_lead to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;

-- of_v_vendas_hub: 16 colunas
do $esboco$ begin
  if to_regclass('hub.of_negocios') is not null and to_regclass('hub.of_v_vendas_hub') is null then
    create view hub.of_v_vendas_hub as
    select null::uuid as id,
           null::date as data_fechamento,
           null::date as data_entrada,
           null::date as data_reuniao,
           null::date as data_resposta,
           null::text as vendedor,
           null::text as sdr,
           null::text as cs_responsavel,
           null::text as cliente_nome,
           null::text as cliente_email,
           null::text as cliente_whatsapp,
           null::text as funil,
           null::text as produto,
           null::numeric(12,2) as valor_venda,
           null::numeric(12,2) as em_caixa,
           null::text as tipo_venda
     where false;
    comment on view hub.of_v_vendas_hub is 'esboço: visão vazia no lugar da que nasce com outro módulo (OutJourney ou OutPerformance); as ligações trocam pela de verdade quando ele chegar';
    grant select on hub.of_v_vendas_hub to authenticated, service_role;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor') then execute 'grant select on hub.of_v_vendas_hub to hub_agente_leitor'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_sem_rh') then execute 'grant select on hub.of_v_vendas_hub to hub_agente_leitor_sem_rh'; end if;
    if exists (select 1 from pg_roles where rolname = 'hub_agente_leitor_vendas') then execute 'grant select on hub.of_v_vendas_hub to hub_agente_leitor_vendas'; end if;
  end if;
end $esboco$;
