-- ROW SECURITY: ag_conhecimento
ALTER TABLE hub.ag_conhecimento ENABLE ROW LEVEL SECURITY;

-- POLICY: ag_conhecimento ag_conhecimento_edicao
CREATE POLICY ag_conhecimento_edicao ON hub.ag_conhecimento FOR UPDATE TO authenticated USING ((hub.e_do_time() AND hub.ag_pode_ver(acesso))) WITH CHECK ((hub.e_do_time() AND hub.ag_pode_ver(acesso)));

-- POLICY: ag_conhecimento ag_conhecimento_escrita
CREATE POLICY ag_conhecimento_escrita ON hub.ag_conhecimento FOR INSERT TO authenticated WITH CHECK ((hub.e_do_time() AND hub.ag_pode_ver(acesso)));

-- POLICY: ag_conhecimento ag_conhecimento_leitura
CREATE POLICY ag_conhecimento_leitura ON hub.ag_conhecimento FOR SELECT TO authenticated USING ((hub.e_do_time() AND hub.ag_pode_ver(acesso)));

-- ROW SECURITY: alocacoes_log
ALTER TABLE hub.alocacoes_log ENABLE ROW LEVEL SECURITY;

-- POLICY: alocacoes_log alocacoes_log_read
CREATE POLICY alocacoes_log_read ON hub.alocacoes_log FOR SELECT TO authenticated USING (hub.e_do_time());

-- ROW SECURITY: app_aparelhos
ALTER TABLE hub.app_aparelhos ENABLE ROW LEVEL SECURITY;

-- POLICY: app_aparelhos app_aparelhos_meus
CREATE POLICY app_aparelhos_meus ON hub.app_aparelhos FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND hub.e_do_time()));

-- ROW SECURITY: app_convites
ALTER TABLE hub.app_convites ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY: app_uso
ALTER TABLE hub.app_uso ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY: areas
ALTER TABLE hub.areas ENABLE ROW LEVEL SECURITY;

-- POLICY: areas areas_admin
CREATE POLICY areas_admin ON hub.areas USING (((tenant_id = hub.current_tenant_id()) AND (hub.current_access_level() = 'admin'::text))) WITH CHECK (((tenant_id = hub.current_tenant_id()) AND (hub.current_access_level() = 'admin'::text)));

-- POLICY: areas areas_select
CREATE POLICY areas_select ON hub.areas FOR SELECT USING ((tenant_id = hub.current_tenant_id()));

-- POLICY: colaboradores autenticado_colaboradores
CREATE POLICY autenticado_colaboradores ON hub.colaboradores USING (hub.e_do_time()) WITH CHECK (hub.e_do_time());

-- ROW SECURITY: aviso_prefs
ALTER TABLE hub.aviso_prefs ENABLE ROW LEVEL SECURITY;

-- POLICY: aviso_prefs aviso_prefs_self
CREATE POLICY aviso_prefs_self ON hub.aviso_prefs TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- ROW SECURITY: banner_noticias
ALTER TABLE hub.banner_noticias ENABLE ROW LEVEL SECURITY;

-- POLICY: banner_noticias banner_select
CREATE POLICY banner_select ON hub.banner_noticias FOR SELECT USING (hub.e_do_time());

-- POLICY: banner_noticias banner_write
CREATE POLICY banner_write ON hub.banner_noticias USING ((hub.current_access_level() = 'admin'::text)) WITH CHECK ((hub.current_access_level() = 'admin'::text));

-- ROW SECURITY: colaboradores
ALTER TABLE hub.colaboradores ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY: email_outbox
ALTER TABLE hub.email_outbox ENABLE ROW LEVEL SECURITY;

-- POLICY: email_outbox eo_ins
CREATE POLICY eo_ins ON hub.email_outbox FOR INSERT TO authenticated WITH CHECK (hub.e_do_time());

-- ROW SECURITY: ext_busca_log
ALTER TABLE hub.ext_busca_log ENABLE ROW LEVEL SECURITY;

-- POLICY: ext_busca_log ext_busca_log_leitura
CREATE POLICY ext_busca_log_leitura ON hub.ext_busca_log FOR SELECT TO authenticated USING (hub.e_do_time());

-- ROW SECURITY: feriados
ALTER TABLE hub.feriados ENABLE ROW LEVEL SECURITY;

-- POLICY: feriados feriados_ro
CREATE POLICY feriados_ro ON hub.feriados FOR SELECT TO authenticated USING (hub.e_do_time());

-- ROW SECURITY: ia_chamadas
ALTER TABLE hub.ia_chamadas ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY: logins_fora_do_time
ALTER TABLE hub.logins_fora_do_time ENABLE ROW LEVEL SECURITY;

-- POLICY: notificacoes notif_ins
CREATE POLICY notif_ins ON hub.notificacoes FOR INSERT TO authenticated WITH CHECK (hub.e_do_time());

-- POLICY: notificacoes notif_self
CREATE POLICY notif_self ON hub.notificacoes FOR SELECT TO authenticated USING ((user_id = auth.uid()));

-- POLICY: notificacoes notif_upd
CREATE POLICY notif_upd ON hub.notificacoes FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- ROW SECURITY: notificacoes
ALTER TABLE hub.notificacoes ENABLE ROW LEVEL SECURITY;

-- ROW SECURITY: notification_prefs
ALTER TABLE hub.notification_prefs ENABLE ROW LEVEL SECURITY;

-- POLICY: notification_prefs notification_prefs_self
CREATE POLICY notification_prefs_self ON hub.notification_prefs USING (((user_id = auth.uid()) OR ((hub.current_access_level() = 'admin'::text) AND (tenant_id = hub.current_tenant_id())))) WITH CHECK (((user_id = auth.uid()) OR ((hub.current_access_level() = 'admin'::text) AND (tenant_id = hub.current_tenant_id()))));

-- ROW SECURITY: novidades
ALTER TABLE hub.novidades ENABLE ROW LEVEL SECURITY;

-- POLICY: novidades novidades_delete_dono
CREATE POLICY novidades_delete_dono ON hub.novidades FOR DELETE USING (((status = 'construcao'::text) AND (autor_id = auth.uid())));

-- ROW SECURITY: novidades_envios
ALTER TABLE hub.novidades_envios ENABLE ROW LEVEL SECURITY;

-- POLICY: novidades_envios novidades_envios_select
CREATE POLICY novidades_envios_select ON hub.novidades_envios FOR SELECT USING (hub.e_do_time());

-- POLICY: novidades novidades_insert_construcao
CREATE POLICY novidades_insert_construcao ON hub.novidades FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (status = 'construcao'::text) AND (autor_id = auth.uid())));

-- POLICY: novidades novidades_select
CREATE POLICY novidades_select ON hub.novidades FOR SELECT USING (hub.e_do_time());

-- POLICY: novidades novidades_update_dono
CREATE POLICY novidades_update_dono ON hub.novidades FOR UPDATE USING (((status = 'construcao'::text) AND (autor_id = auth.uid()))) WITH CHECK (((status = 'construcao'::text) AND (autor_id = auth.uid())));

-- POLICY: ia_chamadas piso_e_do_time
CREATE POLICY piso_e_do_time ON hub.ia_chamadas FOR SELECT TO authenticated USING (hub.e_do_time());

-- POLICY: logins_fora_do_time piso_e_do_time
CREATE POLICY piso_e_do_time ON hub.logins_fora_do_time TO authenticated USING (hub.e_do_time()) WITH CHECK (hub.e_do_time());

-- ROW SECURITY: roles
ALTER TABLE hub.roles ENABLE ROW LEVEL SECURITY;

-- POLICY: roles roles_admin
CREATE POLICY roles_admin ON hub.roles USING (((tenant_id = hub.current_tenant_id()) AND (hub.current_access_level() = 'admin'::text))) WITH CHECK (((tenant_id = hub.current_tenant_id()) AND (hub.current_access_level() = 'admin'::text)));

-- POLICY: roles roles_select
CREATE POLICY roles_select ON hub.roles FOR SELECT USING ((tenant_id = hub.current_tenant_id()));

-- ROW SECURITY: tenants
ALTER TABLE hub.tenants ENABLE ROW LEVEL SECURITY;

-- POLICY: tenants tenants_select
CREATE POLICY tenants_select ON hub.tenants FOR SELECT USING ((id = hub.current_tenant_id()));

-- ROW SECURITY: user_managed_areas
ALTER TABLE hub.user_managed_areas ENABLE ROW LEVEL SECURITY;

-- POLICY: user_managed_areas user_managed_areas_admin
CREATE POLICY user_managed_areas_admin ON hub.user_managed_areas USING ((hub.current_access_level() = 'admin'::text)) WITH CHECK ((hub.current_access_level() = 'admin'::text));

-- POLICY: user_managed_areas user_managed_areas_select
CREATE POLICY user_managed_areas_select ON hub.user_managed_areas FOR SELECT USING (((user_id = auth.uid()) OR (hub.current_access_level() = 'admin'::text)));

-- ROW SECURITY: user_prefs
ALTER TABLE hub.user_prefs ENABLE ROW LEVEL SECURITY;

-- POLICY: user_prefs user_prefs_self
CREATE POLICY user_prefs_self ON hub.user_prefs USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- ROW SECURITY: users
ALTER TABLE hub.users ENABLE ROW LEVEL SECURITY;

-- POLICY: users users_admin
CREATE POLICY users_admin ON hub.users USING (((hub.current_access_level() = 'admin'::text) AND (tenant_id = hub.current_tenant_id()))) WITH CHECK (((hub.current_access_level() = 'admin'::text) AND (tenant_id = hub.current_tenant_id())));

-- POLICY: users users_self
CREATE POLICY users_self ON hub.users FOR SELECT USING (((id = auth.uid()) OR ((hub.current_access_level() = 'admin'::text) AND (tenant_id = hub.current_tenant_id())) OR ((hub.current_access_level() = 'manager'::text) AND (tenant_id = hub.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM (hub.roles r
     JOIN hub.user_managed_areas uma ON ((uma.area_id = r.area_id)))
  WHERE ((r.id = users.role_id) AND (uma.user_id = auth.uid())))))));

-- POLICY: users users_time_le
CREATE POLICY users_time_le ON hub.users FOR SELECT TO authenticated USING (hub.e_do_time());


-- ─── medidor de atividade (tempo de uso de cada tela) — veio do Contratos: toda tela chama, então é da base ───

-- ROW SECURITY: os_minuto
ALTER TABLE hub.os_minuto ENABLE ROW LEVEL SECURITY;

-- POLICY: os_minuto os_minuto_self
CREATE POLICY os_minuto_self ON hub.os_minuto FOR SELECT USING (((user_id = auth.uid()) OR hub.is_journey_admin()));

-- ROW SECURITY: os_sessao
ALTER TABLE hub.os_sessao ENABLE ROW LEVEL SECURITY;

-- POLICY: os_sessao os_sessao_self
CREATE POLICY os_sessao_self ON hub.os_sessao FOR SELECT USING (((user_id = auth.uid()) OR hub.is_journey_admin()));


-- ─── estado compartilhado do os-core (hub.os_estado) — veio do Sucesso: toda tela usa ───

-- ROW SECURITY: os_estado
ALTER TABLE hub.os_estado ENABLE ROW LEVEL SECURITY;

-- POLICY: os_estado os_estado_ins
CREATE POLICY os_estado_ins ON hub.os_estado FOR INSERT TO authenticated WITH CHECK (hub.e_do_time());

-- POLICY: os_estado os_estado_sel
CREATE POLICY os_estado_sel ON hub.os_estado FOR SELECT TO authenticated USING (hub.e_do_time());

-- POLICY: os_estado os_estado_upd
CREATE POLICY os_estado_upd ON hub.os_estado FOR UPDATE TO authenticated USING (hub.e_do_time()) WITH CHECK (hub.e_do_time());

