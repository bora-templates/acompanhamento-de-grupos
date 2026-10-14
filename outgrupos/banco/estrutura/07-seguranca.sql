-- =============================================================================
-- outgrupos · 07 · as travas de leitura
-- -----------------------------------------------------------------------------
-- RLS ligada em todas as tabelas (01-tabelas.sql). Aqui ficam só as políticas de LEITURA
-- para quem está logado, com o piso hub.e_do_time() e o acesso "grupos" (hub.og_pode_ver).
-- Nenhuma política de escrita: quem grava são as funções (security definer) e as Edge
-- Functions, pela chave de serviço. og_ajustes e og_registro não têm leitura para
-- authenticated: só a chave de serviço lê. As perguntas: cada pessoa lê só as próprias.
-- Os papéis da consulta livre do assistente (hub_agente_leitor e os irmãos) ganham SELECT
-- em toda tabela nova do esquema hub pelo DEFAULT PRIVILEGES da base; aqui eles perdem
-- esse acesso, porque a conversa dos grupos só sai pelas telas e pela og-api.
-- Rodar de novo não duplica nada.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

drop policy if exists og_grupos_le on hub.og_grupos;
create policy og_grupos_le on hub.og_grupos for select to authenticated
  using (hub.e_do_time() and hub.og_pode_ver());

drop policy if exists og_participantes_le on hub.og_participantes;
create policy og_participantes_le on hub.og_participantes for select to authenticated
  using (hub.e_do_time() and hub.og_pode_ver());

drop policy if exists og_mensagens_le on hub.og_mensagens;
create policy og_mensagens_le on hub.og_mensagens for select to authenticated
  using (hub.e_do_time() and hub.og_pode_ver());

drop policy if exists og_resumos_le on hub.og_resumos;
create policy og_resumos_le on hub.og_resumos for select to authenticated
  using (hub.e_do_time() and hub.og_pode_ver());

drop policy if exists og_materiais_le on hub.og_materiais;
create policy og_materiais_le on hub.og_materiais for select to authenticated
  using (hub.e_do_time() and hub.og_pode_ver());

drop policy if exists og_perguntas_le on hub.og_perguntas;
create policy og_perguntas_le on hub.og_perguntas for select to authenticated
  using (user_id = auth.uid() and hub.e_do_time() and hub.og_pode_ver());

-- tabelas: o anon não vê nada; o authenticated só LÊ (e a política recorta)
revoke all on hub.og_ajustes, hub.og_grupos, hub.og_participantes, hub.og_mensagens, hub.og_resumos,
              hub.og_materiais, hub.og_perguntas, hub.og_registro
  from public, anon, authenticated;
grant select on hub.og_grupos, hub.og_participantes, hub.og_mensagens, hub.og_resumos,
                hub.og_materiais, hub.og_perguntas
  to authenticated;
grant all on hub.og_ajustes, hub.og_grupos, hub.og_participantes, hub.og_mensagens, hub.og_resumos,
             hub.og_materiais, hub.og_perguntas, hub.og_registro
  to service_role;

-- os papéis do assistente saem das 8 tabelas (só quando o papel existe neste banco)
do $og$
declare
  v_papel text;
begin
  foreach v_papel in array array['hub_agente_leitor', 'hub_agente_leitor_sem_rh', 'hub_agente_leitor_vendas'] loop
    if exists (select 1 from pg_roles where rolname = v_papel) then
      execute format('revoke all on hub.og_ajustes, hub.og_grupos, hub.og_participantes, hub.og_mensagens, '
                     'hub.og_resumos, hub.og_materiais, hub.og_perguntas, hub.og_registro from %I', v_papel);
    end if;
  end loop;
end $og$;

-- Tempo real: a mensagem nova aparece na tela na hora (a tela escuta hub.og_mensagens, e a
-- política de leitura acima vale também para o canal). Só no Supabase, onde a publicação
-- supabase_realtime existe; num Postgres comum, pula.
do $og$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'hub' and tablename = 'og_mensagens') then
    alter publication supabase_realtime add table hub.og_mensagens;
  end if;
end $og$;
