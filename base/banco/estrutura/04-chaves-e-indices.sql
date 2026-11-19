-- CONSTRAINT: ag_conhecimento ag_conhecimento_pkey
ALTER TABLE ONLY hub.ag_conhecimento
    ADD CONSTRAINT ag_conhecimento_pkey PRIMARY KEY (id);

-- CONSTRAINT: alocacoes_log alocacoes_log_pkey
ALTER TABLE ONLY hub.alocacoes_log
    ADD CONSTRAINT alocacoes_log_pkey PRIMARY KEY (id);

-- CONSTRAINT: app_aparelhos app_aparelhos_endpoint_key
ALTER TABLE ONLY hub.app_aparelhos
    ADD CONSTRAINT app_aparelhos_endpoint_key UNIQUE (endpoint);

-- CONSTRAINT: app_aparelhos app_aparelhos_pkey
ALTER TABLE ONLY hub.app_aparelhos
    ADD CONSTRAINT app_aparelhos_pkey PRIMARY KEY (id);

-- CONSTRAINT: app_convites app_convites_pkey
ALTER TABLE ONLY hub.app_convites
    ADD CONSTRAINT app_convites_pkey PRIMARY KEY (id);

-- CONSTRAINT: app_convites app_convites_token_sha_key
ALTER TABLE ONLY hub.app_convites
    ADD CONSTRAINT app_convites_token_sha_key UNIQUE (token_sha);

-- CONSTRAINT: app_uso app_uso_pkey
ALTER TABLE ONLY hub.app_uso
    ADD CONSTRAINT app_uso_pkey PRIMARY KEY (user_id, dia, onde);

-- CONSTRAINT: areas areas_pkey
ALTER TABLE ONLY hub.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);

-- CONSTRAINT: areas areas_tenant_id_slug_key
ALTER TABLE ONLY hub.areas
    ADD CONSTRAINT areas_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- CONSTRAINT: aviso_prefs aviso_prefs_pkey
ALTER TABLE ONLY hub.aviso_prefs
    ADD CONSTRAINT aviso_prefs_pkey PRIMARY KEY (user_id);

-- CONSTRAINT: banner_noticias banner_noticias_pkey
ALTER TABLE ONLY hub.banner_noticias
    ADD CONSTRAINT banner_noticias_pkey PRIMARY KEY (id);

-- CONSTRAINT: colaboradores colaboradores_email_key
ALTER TABLE ONLY hub.colaboradores
    ADD CONSTRAINT colaboradores_email_key UNIQUE (email);

-- CONSTRAINT: colaboradores colaboradores_pkey
ALTER TABLE ONLY hub.colaboradores
    ADD CONSTRAINT colaboradores_pkey PRIMARY KEY (id);

-- CONSTRAINT: email_outbox email_outbox_pkey
ALTER TABLE ONLY hub.email_outbox
    ADD CONSTRAINT email_outbox_pkey PRIMARY KEY (id);

-- CONSTRAINT: ext_busca_log ext_busca_log_pkey
ALTER TABLE ONLY hub.ext_busca_log
    ADD CONSTRAINT ext_busca_log_pkey PRIMARY KEY (id);

-- CONSTRAINT: feriados feriados_pkey
ALTER TABLE ONLY hub.feriados
    ADD CONSTRAINT feriados_pkey PRIMARY KEY (dia);

-- CONSTRAINT: ia_chamadas ia_chamadas_pkey
ALTER TABLE ONLY hub.ia_chamadas
    ADD CONSTRAINT ia_chamadas_pkey PRIMARY KEY (id);

-- CONSTRAINT: logins_fora_do_time logins_fora_do_time_pkey
ALTER TABLE ONLY hub.logins_fora_do_time
    ADD CONSTRAINT logins_fora_do_time_pkey PRIMARY KEY (auth_id);

-- CONSTRAINT: notificacoes notificacoes_pkey
ALTER TABLE ONLY hub.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);

-- CONSTRAINT: notification_prefs notification_prefs_pkey
ALTER TABLE ONLY hub.notification_prefs
    ADD CONSTRAINT notification_prefs_pkey PRIMARY KEY (user_id);

-- CONSTRAINT: novidades_envios novidades_envios_pkey
ALTER TABLE ONLY hub.novidades_envios
    ADD CONSTRAINT novidades_envios_pkey PRIMARY KEY (dia);

-- CONSTRAINT: novidades novidades_pkey
ALTER TABLE ONLY hub.novidades
    ADD CONSTRAINT novidades_pkey PRIMARY KEY (id);

-- CONSTRAINT: roles roles_pkey
ALTER TABLE ONLY hub.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

-- CONSTRAINT: roles roles_tenant_id_slug_key
ALTER TABLE ONLY hub.roles
    ADD CONSTRAINT roles_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- CONSTRAINT: tenants tenants_pkey
ALTER TABLE ONLY hub.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

-- CONSTRAINT: tenants tenants_slug_key
ALTER TABLE ONLY hub.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

-- CONSTRAINT: user_managed_areas user_managed_areas_pkey
ALTER TABLE ONLY hub.user_managed_areas
    ADD CONSTRAINT user_managed_areas_pkey PRIMARY KEY (user_id, area_id);

-- CONSTRAINT: user_prefs user_prefs_pkey
ALTER TABLE ONLY hub.user_prefs
    ADD CONSTRAINT user_prefs_pkey PRIMARY KEY (user_id, key);

-- CONSTRAINT: users users_email_key
ALTER TABLE ONLY hub.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

-- CONSTRAINT: users users_pkey
ALTER TABLE ONLY hub.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- INDEX: ag_conhecimento_busca_idx
CREATE INDEX ag_conhecimento_busca_idx ON hub.ag_conhecimento USING gin (busca);

-- INDEX: ag_conhecimento_produto_idx
CREATE INDEX ag_conhecimento_produto_idx ON hub.ag_conhecimento USING btree (produto_id) WHERE (produto_id IS NOT NULL);

-- INDEX: ag_conhecimento_titulo_idx
CREATE INDEX ag_conhecimento_titulo_idx ON hub.ag_conhecimento USING gin (titulo public.gin_trgm_ops);

-- INDEX: alocacoes_log_ent_idx
CREATE INDEX alocacoes_log_ent_idx ON hub.alocacoes_log USING btree (sistema, entidade_id, criado_em DESC);

-- INDEX: alocacoes_log_pessoa_idx
CREATE INDEX alocacoes_log_pessoa_idx ON hub.alocacoes_log USING btree (pessoa_id, criado_em DESC);

-- INDEX: app_aparelhos_user
CREATE INDEX app_aparelhos_user ON hub.app_aparelhos USING btree (user_id);

-- INDEX: app_convites_user
CREATE INDEX app_convites_user ON hub.app_convites USING btree (user_id, criado_em DESC);

-- INDEX: app_uso_user
CREATE INDEX app_uso_user ON hub.app_uso USING btree (user_id, ultimo_em DESC);

-- INDEX: areas_tenant_idx
CREATE INDEX areas_tenant_idx ON hub.areas USING btree (tenant_id);

-- INDEX: ext_busca_log_criado_idx
CREATE INDEX ext_busca_log_criado_idx ON hub.ext_busca_log USING btree (criado_em DESC);

-- INDEX: ia_chamadas_quando
CREATE INDEX ia_chamadas_quando ON hub.ia_chamadas USING btree (criado_em DESC);

-- INDEX: ia_chamadas_robo
CREATE INDEX ia_chamadas_robo ON hub.ia_chamadas USING btree (robo, criado_em DESC);

-- INDEX: idx_notif_user
CREATE INDEX idx_notif_user ON hub.notificacoes USING btree (user_id, lida);

-- INDEX: notif_fila_wpp
CREATE INDEX notif_fila_wpp ON hub.notificacoes USING btree (created_at) WHERE (wpp_em IS NULL);

-- INDEX: novidades_dia_ix
CREATE INDEX novidades_dia_ix ON hub.novidades USING btree (dia DESC);

-- INDEX: novidades_entrega_uk
CREATE UNIQUE INDEX novidades_entrega_uk ON hub.novidades USING btree (commit, sistema) WHERE (commit IS NOT NULL);

-- INDEX: novidades_status_ix
CREATE INDEX novidades_status_ix ON hub.novidades USING btree (status);

-- INDEX: roles_area_idx
CREATE INDEX roles_area_idx ON hub.roles USING btree (area_id);

-- INDEX: users_area_ids_gin
CREATE INDEX users_area_ids_gin ON hub.users USING gin (area_ids);

-- INDEX: users_role_idx
CREATE INDEX users_role_idx ON hub.users USING btree (role_id);

-- INDEX: users_tenant_idx
CREATE INDEX users_tenant_idx ON hub.users USING btree (tenant_id);

-- TRIGGER: notification_prefs notification_prefs_updated_at
CREATE TRIGGER notification_prefs_updated_at BEFORE UPDATE ON hub.notification_prefs FOR EACH ROW EXECUTE FUNCTION hub.set_updated_at();

-- TRIGGER: ag_conhecimento trg_ag_conhecimento_touch
CREATE TRIGGER trg_ag_conhecimento_touch BEFORE INSERT OR UPDATE ON hub.ag_conhecimento FOR EACH ROW EXECUTE FUNCTION hub.ag_conhecimento_touch();

-- TRIGGER: notificacoes trg_app_push_aviso
CREATE TRIGGER trg_app_push_aviso AFTER INSERT ON hub.notificacoes FOR EACH ROW EXECUTE FUNCTION hub.tg_app_push_aviso();

-- TRIGGER: users trg_app_saiu_do_time
CREATE TRIGGER trg_app_saiu_do_time AFTER UPDATE OF active ON hub.users FOR EACH ROW EXECUTE FUNCTION hub.tg_app_saiu_do_time();

-- TRIGGER: banner_noticias trg_banner_noticias_updated
CREATE TRIGGER trg_banner_noticias_updated BEFORE UPDATE ON hub.banner_noticias FOR EACH ROW EXECUTE FUNCTION hub.set_atualizado_em();

-- TRIGGER: colaboradores trg_colaboradores_updated
CREATE TRIGGER trg_colaboradores_updated BEFORE UPDATE ON hub.colaboradores FOR EACH ROW EXECUTE FUNCTION hub.set_atualizado_em();

-- TRIGGER: users trg_users_desligamento
CREATE TRIGGER trg_users_desligamento BEFORE UPDATE OF active ON hub.users FOR EACH ROW WHEN ((old.active IS DISTINCT FROM new.active)) EXECUTE FUNCTION hub.tg_users_desligamento();

-- TRIGGER: users trg_users_crm_conta
CREATE TRIGGER trg_users_crm_conta AFTER INSERT OR UPDATE OF active, acessos, role_id, cargo_ids, email, full_name ON hub.users FOR EACH ROW EXECUTE FUNCTION hub.tg_users_crm_conta();


-- ─── medidor de atividade (tempo de uso de cada tela) — veio do Contratos: toda tela chama, então é da base ───

-- CONSTRAINT: os_minuto os_minuto_pkey
ALTER TABLE ONLY hub.os_minuto
    ADD CONSTRAINT os_minuto_pkey PRIMARY KEY (user_id, minuto);

-- CONSTRAINT: os_sessao os_sessao_pkey
ALTER TABLE ONLY hub.os_sessao
    ADD CONSTRAINT os_sessao_pkey PRIMARY KEY (id);

-- INDEX: idx_os_minuto_dia
CREATE INDEX idx_os_minuto_dia ON hub.os_minuto USING btree (minuto DESC);

-- INDEX: idx_os_sessao_sistema
CREATE INDEX idx_os_sessao_sistema ON hub.os_sessao USING btree (sistema, fim DESC);

-- INDEX: idx_os_sessao_user_dia
CREATE INDEX idx_os_sessao_user_dia ON hub.os_sessao USING btree (user_id, fim DESC);


-- ─── estado compartilhado do os-core (hub.os_estado) — veio do Sucesso: toda tela usa ───

-- CONSTRAINT: os_estado os_estado_pkey
ALTER TABLE ONLY hub.os_estado
    ADD CONSTRAINT os_estado_pkey PRIMARY KEY (chave);

