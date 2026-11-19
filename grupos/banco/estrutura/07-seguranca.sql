-- =============================================================================
-- grupos · 07 · as travas de leitura
-- -----------------------------------------------------------------------------
-- RLS ligada em todas as tabelas (01-tabelas.sql). Aqui ficam só as políticas de LEITURA
-- para quem está logado, com o piso hub.e_do_time() e o acesso "grupos" (hub.gr_pode_ver).
-- Nenhuma política de escrita: quem grava são as funções (security definer) e as Edge
-- Functions, pela chave de serviço. gr_ajustes e gr_registro não têm leitura para
-- authenticated: só a chave de serviço lê. As perguntas: cada pessoa lê só as próprias.
-- Os papéis da consulta livre do assistente (hub_agente_leitor e os irmãos) ganham SELECT
-- em toda tabela nova do esquema hub pelo DEFAULT PRIVILEGES da base; aqui eles perdem
-- esse acesso, porque a conversa dos grupos só sai pelas telas e pela gr-api.
-- Rodar de novo não duplica nada.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

drop policy if exists gr_grupos_le on hub.gr_grupos;
create policy gr_grupos_le on hub.gr_grupos for select to authenticated
  using (hub.e_do_time() and hub.gr_pode_ver());

drop policy if exists gr_participantes_le on hub.gr_participantes;
create policy gr_participantes_le on hub.gr_participantes for select to authenticated
  using (hub.e_do_time() and hub.gr_pode_ver());

drop policy if exists gr_mensagens_le on hub.gr_mensagens;
create policy gr_mensagens_le on hub.gr_mensagens for select to authenticated
  using (hub.e_do_time() and hub.gr_pode_ver());

drop policy if exists gr_resumos_le on hub.gr_resumos;
create policy gr_resumos_le on hub.gr_resumos for select to authenticated
  using (hub.e_do_time() and hub.gr_pode_ver());

drop policy if exists gr_materiais_le on hub.gr_materiais;
create policy gr_materiais_le on hub.gr_materiais for select to authenticated
  using (hub.e_do_time() and hub.gr_pode_ver());

drop policy if exists gr_perguntas_le on hub.gr_perguntas;
create policy gr_perguntas_le on hub.gr_perguntas for select to authenticated
  using (user_id = auth.uid() and hub.e_do_time() and hub.gr_pode_ver());

-- tabelas: o anon não vê nada; o authenticated só LÊ (e a política recorta)
revoke all on hub.gr_ajustes, hub.gr_grupos, hub.gr_participantes, hub.gr_mensagens, hub.gr_resumos,
              hub.gr_materiais, hub.gr_perguntas, hub.gr_registro
  from public, anon, authenticated;
grant select on hub.gr_grupos, hub.gr_participantes, hub.gr_mensagens, hub.gr_resumos,
                hub.gr_materiais, hub.gr_perguntas
  to authenticated;
grant all on hub.gr_ajustes, hub.gr_grupos, hub.gr_participantes, hub.gr_mensagens, hub.gr_resumos,
             hub.gr_materiais, hub.gr_perguntas, hub.gr_registro
  to service_role;

-- os papéis do assistente saem das 8 tabelas (só quando o papel existe neste banco)
do $og$
declare
  v_papel text;
begin
  foreach v_papel in array array['hub_agente_leitor', 'hub_agente_leitor_sem_rh', 'hub_agente_leitor_vendas'] loop
    if exists (select 1 from pg_roles where rolname = v_papel) then
      execute format('revoke all on hub.gr_ajustes, hub.gr_grupos, hub.gr_participantes, hub.gr_mensagens, '
                     'hub.gr_resumos, hub.gr_materiais, hub.gr_perguntas, hub.gr_registro from %I', v_papel);
    end if;
  end loop;
end $og$;

-- Tempo real: a mensagem nova aparece na tela na hora (a tela escuta hub.gr_mensagens, e a
-- política de leitura acima vale também para o canal). Só no Supabase, onde a publicação
-- supabase_realtime existe; num Postgres comum, pula.
do $og$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'hub' and tablename = 'gr_mensagens') then
    alter publication supabase_realtime add table hub.gr_mensagens;
  end if;
end $og$;
