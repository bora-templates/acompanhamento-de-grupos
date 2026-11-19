-- ACL: SCHEMA hub
GRANT USAGE ON SCHEMA hub TO anon;
GRANT USAGE ON SCHEMA hub TO authenticated;
GRANT USAGE ON SCHEMA hub TO service_role;
GRANT USAGE ON SCHEMA hub TO crm_app;
GRANT USAGE ON SCHEMA hub TO hub_agente_leitor;
GRANT USAGE ON SCHEMA hub TO hub_agente_leitor_sem_rh;
GRANT USAGE ON SCHEMA hub TO hub_agente_leitor_vendas;

-- ACL: FUNCTION ag_conhecimento_touch()
REVOKE ALL ON FUNCTION hub.ag_conhecimento_touch() FROM PUBLIC;

-- ACL: FUNCTION ag_pode_ver(p_chave text)
REVOKE ALL ON FUNCTION hub.ag_pode_ver(p_chave text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.ag_pode_ver(p_chave text) TO authenticated;
GRANT ALL ON FUNCTION hub.ag_pode_ver(p_chave text) TO service_role;

-- ACL: FUNCTION ag_sem_acento(p_txt text)
REVOKE ALL ON FUNCTION hub.ag_sem_acento(p_txt text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.ag_sem_acento(p_txt text) TO authenticated;
GRANT ALL ON FUNCTION hub.ag_sem_acento(p_txt text) TO service_role;

-- ACL: FUNCTION agenda_tipo_padrao(p_estrategista text)
REVOKE ALL ON FUNCTION hub.agenda_tipo_padrao(p_estrategista text) FROM PUBLIC;

-- ACL: FUNCTION aloc_diff(p_antes text[], p_depois text[], p_modo text)
REVOKE ALL ON FUNCTION hub.aloc_diff(p_antes text[], p_depois text[], p_modo text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.aloc_diff(p_antes text[], p_depois text[], p_modo text) TO authenticated;
GRANT ALL ON FUNCTION hub.aloc_diff(p_antes text[], p_depois text[], p_modo text) TO service_role;

-- ACL: FUNCTION aloc_nomes(p_txt text)
REVOKE ALL ON FUNCTION hub.aloc_nomes(p_txt text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.aloc_nomes(p_txt text) TO authenticated;
GRANT ALL ON FUNCTION hub.aloc_nomes(p_txt text) TO service_role;

-- ACL: FUNCTION aloc_pessoas(p_valor jsonb)
REVOKE ALL ON FUNCTION hub.aloc_pessoas(p_valor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.aloc_pessoas(p_valor jsonb) TO authenticated;
GRANT ALL ON FUNCTION hub.aloc_pessoas(p_valor jsonb) TO service_role;

-- ACL: FUNCTION alocacoes_resumo(p_sistema text, p_entidade_id text)
REVOKE ALL ON FUNCTION hub.alocacoes_resumo(p_sistema text, p_entidade_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.alocacoes_resumo(p_sistema text, p_entidade_id text) TO authenticated;
GRANT ALL ON FUNCTION hub.alocacoes_resumo(p_sistema text, p_entidade_id text) TO service_role;

-- ACL: FUNCTION app_aparelho_desconectar(p_id uuid)
REVOKE ALL ON FUNCTION hub.app_aparelho_desconectar(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_aparelho_desconectar(p_id uuid) TO authenticated;

-- ACL: FUNCTION app_aparelho_esquecer(p_endpoint text)
REVOKE ALL ON FUNCTION hub.app_aparelho_esquecer(p_endpoint text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_aparelho_esquecer(p_endpoint text) TO authenticated;

-- ACL: FUNCTION app_aparelho_registrar(p_endpoint text, p_p256dh text, p_auth text, p_rotulo text, p_user_agent text)
REVOKE ALL ON FUNCTION hub.app_aparelho_registrar(p_endpoint text, p_p256dh text, p_auth text, p_rotulo text, p_user_agent text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_aparelho_registrar(p_endpoint text, p_p256dh text, p_auth text, p_rotulo text, p_user_agent text) TO authenticated;

-- ACL: FUNCTION app_da_pessoa(p_user uuid)
REVOKE ALL ON FUNCTION hub.app_da_pessoa(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_da_pessoa(p_user uuid) TO authenticated;

-- ACL: FUNCTION app_painel()
REVOKE ALL ON FUNCTION hub.app_painel() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_painel() TO authenticated;

-- ACL: FUNCTION app_push_enviar(p_users uuid[], p_titulo text, p_corpo text, p_link text, p_tag text)
REVOKE ALL ON FUNCTION hub.app_push_enviar(p_users uuid[], p_titulo text, p_corpo text, p_link text, p_tag text) FROM PUBLIC;

-- ACL: FUNCTION app_registra_uso(p_onde text, p_rotulo text)
REVOKE ALL ON FUNCTION hub.app_registra_uso(p_onde text, p_rotulo text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_registra_uso(p_onde text, p_rotulo text) TO authenticated;

-- ACL: FUNCTION app_sou_admin_usuarios()
REVOKE ALL ON FUNCTION hub.app_sou_admin_usuarios() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.app_sou_admin_usuarios() TO authenticated;

-- ACL: FUNCTION avisa_liberacao_no_sistema()
REVOKE ALL ON FUNCTION hub.avisa_liberacao_no_sistema() FROM PUBLIC;

-- ACL: FUNCTION avisar_por_nome(p_nome text, p_tipo text, p_sistema text, p_titulo text, p_texto text, p_link text, p_autor text, p_prazo date)
REVOKE ALL ON FUNCTION hub.avisar_por_nome(p_nome text, p_tipo text, p_sistema text, p_titulo text, p_texto text, p_link text, p_autor text, p_prazo date) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.avisar_por_nome(p_nome text, p_tipo text, p_sistema text, p_titulo text, p_texto text, p_link text, p_autor text, p_prazo date) TO authenticated;

-- ACL: FUNCTION aviso_user_por_nome(p_nome text)
REVOKE ALL ON FUNCTION hub.aviso_user_por_nome(p_nome text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.aviso_user_por_nome(p_nome text) TO authenticated;
GRANT ALL ON FUNCTION hub.aviso_user_por_nome(p_nome text) TO service_role;

-- ACL: FUNCTION avisos_wpp_marcar(p_id uuid, p_erro text)
REVOKE ALL ON FUNCTION hub.avisos_wpp_marcar(p_id uuid, p_erro text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.avisos_wpp_marcar(p_id uuid, p_erro text) TO service_role;

-- ACL: FUNCTION biz_minutes(t1 timestamp with time zone, t2 timestamp with time zone)
REVOKE ALL ON FUNCTION hub.biz_minutes(t1 timestamp with time zone, t2 timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.biz_minutes(t1 timestamp with time zone, t2 timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION hub.biz_minutes(t1 timestamp with time zone, t2 timestamp with time zone) TO service_role;

-- ACL: FUNCTION brl(p numeric)
REVOKE ALL ON FUNCTION hub.brl(p numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.brl(p numeric) TO authenticated;
GRANT ALL ON FUNCTION hub.brl(p numeric) TO service_role;

-- ACL: FUNCTION crm_quem(p_email text)
REVOKE ALL ON FUNCTION hub.crm_quem(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.crm_quem(p_email text) TO crm_app;

-- ACL: FUNCTION e_do_time()
GRANT ALL ON FUNCTION hub.e_do_time() TO anon;
GRANT ALL ON FUNCTION hub.e_do_time() TO authenticated;

-- ACL: FUNCTION fin_norm(txt text)
REVOKE ALL ON FUNCTION hub.fin_norm(txt text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.fin_norm(txt text) TO authenticated;
GRANT ALL ON FUNCTION hub.fin_norm(txt text) TO service_role;

-- ACL: FUNCTION fone_chave(p text)
REVOKE ALL ON FUNCTION hub.fone_chave(p text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.fone_chave(p text) TO authenticated;
GRANT ALL ON FUNCTION hub.fone_chave(p text) TO service_role;

-- ACL: FUNCTION goal_achieved(p_value numeric, p_target numeric, p_operator text)
REVOKE ALL ON FUNCTION hub.goal_achieved(p_value numeric, p_target numeric, p_operator text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.goal_achieved(p_value numeric, p_target numeric, p_operator text) TO authenticated;
GRANT ALL ON FUNCTION hub.goal_achieved(p_value numeric, p_target numeric, p_operator text) TO service_role;

-- ACL: FUNCTION has_recrutamento_access()
GRANT ALL ON FUNCTION hub.has_recrutamento_access() TO authenticated;

-- ACL: FUNCTION hoje_br()
REVOKE ALL ON FUNCTION hub.hoje_br() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.hoje_br() TO authenticated;
GRANT ALL ON FUNCTION hub.hoje_br() TO service_role;

-- ACL: FUNCTION is_journey_admin()
GRANT ALL ON FUNCTION hub.is_journey_admin() TO authenticated;

-- ACL: FUNCTION menos_dias_uteis(p_data date, p_dias integer)
REVOKE ALL ON FUNCTION hub.menos_dias_uteis(p_data date, p_dias integer) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.menos_dias_uteis(p_data date, p_dias integer) TO authenticated;
GRANT ALL ON FUNCTION hub.menos_dias_uteis(p_data date, p_dias integer) TO service_role;

-- ACL: FUNCTION meu_whatsapp_salvar(p_numero text)
REVOKE ALL ON FUNCTION hub.meu_whatsapp_salvar(p_numero text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.meu_whatsapp_salvar(p_numero text) TO authenticated;

-- ACL: FUNCTION nome_canonico(p_nome text)
REVOKE ALL ON FUNCTION hub.nome_canonico(p_nome text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.nome_canonico(p_nome text) TO authenticated;
GRANT ALL ON FUNCTION hub.nome_canonico(p_nome text) TO service_role;

-- ACL: FUNCTION crm_conta_desativa(p_user_id uuid)
REVOKE ALL ON FUNCTION hub.crm_conta_desativa(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.crm_conta_desativa(p_user_id uuid) TO service_role;

-- ACL: FUNCTION crm_conta_garante(p_user_id uuid)
REVOKE ALL ON FUNCTION hub.crm_conta_garante(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.crm_conta_garante(p_user_id uuid) TO service_role;

-- ACL: FUNCTION pdp_ve_todos()
REVOKE ALL ON FUNCTION hub.pdp_ve_todos() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.pdp_ve_todos() TO authenticated;

-- ACL: FUNCTION pode_editar_comissao()
REVOKE ALL ON FUNCTION hub.pode_editar_comissao() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.pode_editar_comissao() TO authenticated;

-- ACL: FUNCTION pode_publicar_plano()
GRANT ALL ON FUNCTION hub.pode_publicar_plano() TO authenticated;

-- ACL: FUNCTION role_upsert(p_id uuid, p_name text, p_slug text, p_area uuid, p_cadence text, p_ordem integer, p_faixa_min numeric, p_faixa_max numeric)
REVOKE ALL ON FUNCTION hub.role_upsert(p_id uuid, p_name text, p_slug text, p_area uuid, p_cadence text, p_ordem integer, p_faixa_min numeric, p_faixa_max numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.role_upsert(p_id uuid, p_name text, p_slug text, p_area uuid, p_cadence text, p_ordem integer, p_faixa_min numeric, p_faixa_max numeric) TO authenticated;

-- ACL: FUNCTION sem_acento(p_txt text)
REVOKE ALL ON FUNCTION hub.sem_acento(p_txt text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.sem_acento(p_txt text) TO authenticated;
GRANT ALL ON FUNCTION hub.sem_acento(p_txt text) TO service_role;

-- ACL: FUNCTION set_my_avatar(p_url text)
GRANT ALL ON FUNCTION hub.set_my_avatar(p_url text) TO authenticated;

-- ACL: FUNCTION set_my_cor(p_cor text)
GRANT ALL ON FUNCTION hub.set_my_cor(p_cor text) TO authenticated;

-- ACL: FUNCTION tem_acesso(p_chave text)
GRANT ALL ON FUNCTION hub.tem_acesso(p_chave text) TO authenticated;

-- ACL: FUNCTION tg_app_push_aviso()
REVOKE ALL ON FUNCTION hub.tg_app_push_aviso() FROM PUBLIC;

-- ACL: FUNCTION tg_app_saiu_do_time()
REVOKE ALL ON FUNCTION hub.tg_app_saiu_do_time() FROM PUBLIC;

-- ACL: FUNCTION tg_users_desligamento()
REVOKE ALL ON FUNCTION hub.tg_users_desligamento() FROM PUBLIC;

-- ACL: FUNCTION trg_crm_reabre_tira_selo()
REVOKE ALL ON FUNCTION hub.trg_crm_reabre_tira_selo() FROM PUBLIC;

-- ACL: FUNCTION whatsapp_do_time()
REVOKE ALL ON FUNCTION hub.whatsapp_do_time() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.whatsapp_do_time() TO authenticated;

-- ACL: FUNCTION whatsapp_do_time_salvar(p_user uuid, p_numero text)
REVOKE ALL ON FUNCTION hub.whatsapp_do_time_salvar(p_user uuid, p_numero text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.whatsapp_do_time_salvar(p_user uuid, p_numero text) TO authenticated;

-- ACL: TABLE ag_conhecimento
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE hub.ag_conhecimento TO authenticated;
GRANT ALL ON TABLE hub.ag_conhecimento TO service_role;
GRANT SELECT ON TABLE hub.ag_conhecimento TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.ag_conhecimento TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.ag_conhecimento TO hub_agente_leitor_vendas;

-- ACL: TABLE alocacoes_log
GRANT ALL ON TABLE hub.alocacoes_log TO authenticated;
GRANT ALL ON TABLE hub.alocacoes_log TO service_role;
GRANT SELECT ON TABLE hub.alocacoes_log TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.alocacoes_log TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.alocacoes_log TO hub_agente_leitor_vendas;

-- ACL: SEQUENCE alocacoes_log_id_seq
GRANT ALL ON SEQUENCE hub.alocacoes_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE hub.alocacoes_log_id_seq TO service_role;

-- ACL: TABLE app_aparelhos
GRANT ALL ON TABLE hub.app_aparelhos TO authenticated;
GRANT ALL ON TABLE hub.app_aparelhos TO service_role;
GRANT SELECT ON TABLE hub.app_aparelhos TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.app_aparelhos TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.app_aparelhos TO hub_agente_leitor_vendas;

-- ACL: TABLE app_convites
GRANT ALL ON TABLE hub.app_convites TO authenticated;
GRANT ALL ON TABLE hub.app_convites TO service_role;
GRANT SELECT ON TABLE hub.app_convites TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.app_convites TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.app_convites TO hub_agente_leitor_vendas;

-- ACL: TABLE app_uso
GRANT ALL ON TABLE hub.app_uso TO authenticated;
GRANT ALL ON TABLE hub.app_uso TO service_role;
GRANT SELECT ON TABLE hub.app_uso TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.app_uso TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.app_uso TO hub_agente_leitor_vendas;

-- ACL: TABLE areas
GRANT ALL ON TABLE hub.areas TO authenticated;
GRANT ALL ON TABLE hub.areas TO service_role;
GRANT SELECT ON TABLE hub.areas TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.areas TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.areas TO hub_agente_leitor_vendas;

-- ACL: TABLE aviso_prefs
GRANT ALL ON TABLE hub.aviso_prefs TO authenticated;
GRANT ALL ON TABLE hub.aviso_prefs TO service_role;
GRANT SELECT ON TABLE hub.aviso_prefs TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.aviso_prefs TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.aviso_prefs TO hub_agente_leitor_vendas;

-- ACL: TABLE banner_noticias
GRANT ALL ON TABLE hub.banner_noticias TO authenticated;
GRANT ALL ON TABLE hub.banner_noticias TO service_role;
GRANT SELECT ON TABLE hub.banner_noticias TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.banner_noticias TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.banner_noticias TO hub_agente_leitor_vendas;

-- ACL: SEQUENCE clientes_codigo_suc_seq
GRANT ALL ON SEQUENCE hub.clientes_codigo_suc_seq TO authenticated;
GRANT ALL ON SEQUENCE hub.clientes_codigo_suc_seq TO service_role;

-- ACL: TABLE colaboradores
GRANT ALL ON TABLE hub.colaboradores TO authenticated;
GRANT ALL ON TABLE hub.colaboradores TO service_role;
GRANT SELECT ON TABLE hub.colaboradores TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.colaboradores TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.colaboradores TO hub_agente_leitor_vendas;

-- ACL: TABLE users
GRANT ALL ON TABLE hub.users TO authenticated;
GRANT ALL ON TABLE hub.users TO service_role;
GRANT SELECT ON TABLE hub.users TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.users TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.users TO hub_agente_leitor_vendas;

-- ACL: TABLE email_outbox
GRANT ALL ON TABLE hub.email_outbox TO authenticated;
GRANT ALL ON TABLE hub.email_outbox TO service_role;
GRANT SELECT ON TABLE hub.email_outbox TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.email_outbox TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.email_outbox TO hub_agente_leitor_vendas;

-- ACL: TABLE ext_busca_log
GRANT ALL ON TABLE hub.ext_busca_log TO authenticated;
GRANT ALL ON TABLE hub.ext_busca_log TO service_role;
GRANT SELECT ON TABLE hub.ext_busca_log TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.ext_busca_log TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.ext_busca_log TO hub_agente_leitor_vendas;

-- ACL: TABLE feriados
GRANT ALL ON TABLE hub.feriados TO authenticated;
GRANT ALL ON TABLE hub.feriados TO service_role;
GRANT SELECT ON TABLE hub.feriados TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.feriados TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.feriados TO hub_agente_leitor_vendas;

-- ACL: TABLE roles
GRANT ALL ON TABLE hub.roles TO authenticated;
GRANT ALL ON TABLE hub.roles TO service_role;
GRANT SELECT ON TABLE hub.roles TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.roles TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.roles TO hub_agente_leitor_vendas;

-- ACL: TABLE ia_chamadas
GRANT ALL ON TABLE hub.ia_chamadas TO authenticated;
GRANT ALL ON TABLE hub.ia_chamadas TO service_role;
GRANT SELECT ON TABLE hub.ia_chamadas TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.ia_chamadas TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.ia_chamadas TO hub_agente_leitor_vendas;

-- ACL: SEQUENCE ia_chamadas_id_seq
GRANT ALL ON SEQUENCE hub.ia_chamadas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE hub.ia_chamadas_id_seq TO service_role;

-- ACL: TABLE logins_fora_do_time
GRANT ALL ON TABLE hub.logins_fora_do_time TO authenticated;
GRANT ALL ON TABLE hub.logins_fora_do_time TO service_role;
GRANT SELECT ON TABLE hub.logins_fora_do_time TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.logins_fora_do_time TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.logins_fora_do_time TO hub_agente_leitor_vendas;

-- ACL: TABLE notificacoes
GRANT ALL ON TABLE hub.notificacoes TO authenticated;
GRANT ALL ON TABLE hub.notificacoes TO service_role;
GRANT SELECT ON TABLE hub.notificacoes TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.notificacoes TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.notificacoes TO hub_agente_leitor_vendas;

-- ACL: TABLE notification_prefs
GRANT ALL ON TABLE hub.notification_prefs TO authenticated;
GRANT ALL ON TABLE hub.notification_prefs TO service_role;
GRANT SELECT ON TABLE hub.notification_prefs TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.notification_prefs TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.notification_prefs TO hub_agente_leitor_vendas;

-- ACL: TABLE novidades
GRANT ALL ON TABLE hub.novidades TO authenticated;
GRANT ALL ON TABLE hub.novidades TO service_role;
GRANT SELECT ON TABLE hub.novidades TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.novidades TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.novidades TO hub_agente_leitor_vendas;

-- ACL: TABLE novidades_envios
GRANT ALL ON TABLE hub.novidades_envios TO authenticated;
GRANT ALL ON TABLE hub.novidades_envios TO service_role;
GRANT SELECT ON TABLE hub.novidades_envios TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.novidades_envios TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.novidades_envios TO hub_agente_leitor_vendas;

-- ACL: TABLE tenants
GRANT ALL ON TABLE hub.tenants TO authenticated;
GRANT ALL ON TABLE hub.tenants TO service_role;
GRANT SELECT ON TABLE hub.tenants TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.tenants TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.tenants TO hub_agente_leitor_vendas;

-- ACL: TABLE user_managed_areas
GRANT ALL ON TABLE hub.user_managed_areas TO authenticated;
GRANT ALL ON TABLE hub.user_managed_areas TO service_role;
GRANT SELECT ON TABLE hub.user_managed_areas TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.user_managed_areas TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.user_managed_areas TO hub_agente_leitor_vendas;

-- ACL: TABLE user_prefs
GRANT ALL ON TABLE hub.user_prefs TO authenticated;
GRANT ALL ON TABLE hub.user_prefs TO service_role;
GRANT SELECT ON TABLE hub.user_prefs TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.user_prefs TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.user_prefs TO hub_agente_leitor_vendas;

-- DEFAULT ACL: DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub GRANT ALL ON SEQUENCES TO service_role;

-- DEFAULT ACL: DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA hub GRANT SELECT ON TABLES TO hub_agente_leitor;


--
-- PostgreSQL database dump complete
--


-- ─── medidor de atividade (tempo de uso de cada tela) — veio do Contratos: toda tela chama, então é da base ───

-- ACL: FUNCTION os_atividade_dia(p_de date, p_ate date)
REVOKE ALL ON FUNCTION hub.os_atividade_dia(p_de date, p_ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.os_atividade_dia(p_de date, p_ate date) TO service_role;
GRANT ALL ON FUNCTION hub.os_atividade_dia(p_de date, p_ate date) TO authenticated;

-- ACL: FUNCTION os_pulso(p_sessao uuid, p_sistema text, p_tela text, p_segundos integer, p_cliques integer, p_minuto timestamp with time zone, p_aberto integer)
REVOKE ALL ON FUNCTION hub.os_pulso(p_sessao uuid, p_sistema text, p_tela text, p_segundos integer, p_cliques integer, p_minuto timestamp with time zone, p_aberto integer) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.os_pulso(p_sessao uuid, p_sistema text, p_tela text, p_segundos integer, p_cliques integer, p_minuto timestamp with time zone, p_aberto integer) TO authenticated;
GRANT ALL ON FUNCTION hub.os_pulso(p_sessao uuid, p_sistema text, p_tela text, p_segundos integer, p_cliques integer, p_minuto timestamp with time zone, p_aberto integer) TO service_role;

-- ACL: TABLE os_minuto
GRANT ALL ON TABLE hub.os_minuto TO authenticated;
GRANT ALL ON TABLE hub.os_minuto TO service_role;
GRANT SELECT ON TABLE hub.os_minuto TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.os_minuto TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.os_minuto TO hub_agente_leitor_vendas;

-- ACL: TABLE os_sessao
GRANT ALL ON TABLE hub.os_sessao TO authenticated;
GRANT ALL ON TABLE hub.os_sessao TO service_role;


-- ─── cargos (vieram do Metas) ───

-- ACL: FUNCTION role_delete(p_id uuid)
REVOKE ALL ON FUNCTION hub.role_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.role_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION hub.role_delete(p_id uuid) TO service_role;

-- ACL: FUNCTION roles_gestao()
REVOKE ALL ON FUNCTION hub.roles_gestao() FROM PUBLIC;
GRANT ALL ON FUNCTION hub.roles_gestao() TO authenticated;
GRANT ALL ON FUNCTION hub.roles_gestao() TO service_role;

-- ─── estado compartilhado do os-core (hub.os_estado) — veio do Sucesso: toda tela usa ───

-- ACL: TABLE os_estado
GRANT ALL ON TABLE hub.os_estado TO authenticated;
GRANT ALL ON TABLE hub.os_estado TO service_role;
GRANT SELECT ON TABLE hub.os_estado TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.os_estado TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.os_estado TO hub_agente_leitor_vendas;


-- ACL: FUNCTION registrar_alocacao — grava o histórico de alocação e avisa a pessoa;
-- quem chama são os gatilhos (security definer), nunca a chave pública.
REVOKE ALL ON FUNCTION hub.registrar_alocacao(p_sistema text, p_entidade text, p_entidade_id text, p_titulo text, p_pessoa text, p_acao text, p_link text, p_autor text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hub.registrar_alocacao(p_sistema text, p_entidade text, p_entidade_id text, p_titulo text, p_pessoa text, p_acao text, p_link text, p_autor text) TO authenticated, service_role;

-- ACL: FUNCTION pessoas_roster()
REVOKE ALL ON FUNCTION hub.pessoas_roster() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION hub.pessoas_roster() TO authenticated, service_role;
