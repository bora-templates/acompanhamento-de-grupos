-- FK CONSTRAINT: ag_conhecimento ag_conhecimento_autor_id_fkey
ALTER TABLE ONLY hub.ag_conhecimento
    ADD CONSTRAINT ag_conhecimento_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES auth.users(id);

-- FK CONSTRAINT: app_aparelhos app_aparelhos_desconectado_por_fkey
ALTER TABLE ONLY hub.app_aparelhos
    ADD CONSTRAINT app_aparelhos_desconectado_por_fkey FOREIGN KEY (desconectado_por) REFERENCES hub.users(id);

-- FK CONSTRAINT: app_aparelhos app_aparelhos_user_id_fkey
ALTER TABLE ONLY hub.app_aparelhos
    ADD CONSTRAINT app_aparelhos_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id);

-- FK CONSTRAINT: app_convites app_convites_criado_por_fkey
ALTER TABLE ONLY hub.app_convites
    ADD CONSTRAINT app_convites_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES hub.users(id);

-- FK CONSTRAINT: app_convites app_convites_user_id_fkey
ALTER TABLE ONLY hub.app_convites
    ADD CONSTRAINT app_convites_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id);

-- FK CONSTRAINT: app_uso app_uso_user_id_fkey
ALTER TABLE ONLY hub.app_uso
    ADD CONSTRAINT app_uso_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id);

-- FK CONSTRAINT: areas areas_tenant_id_fkey
ALTER TABLE ONLY hub.areas
    ADD CONSTRAINT areas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES hub.tenants(id) ON DELETE CASCADE;

-- FK CONSTRAINT: colaboradores colaboradores_auth_id_fkey
ALTER TABLE ONLY hub.colaboradores
    ADD CONSTRAINT colaboradores_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- FK CONSTRAINT: notification_prefs notification_prefs_tenant_id_fkey
ALTER TABLE ONLY hub.notification_prefs
    ADD CONSTRAINT notification_prefs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES hub.tenants(id) ON DELETE CASCADE;

-- FK CONSTRAINT: notification_prefs notification_prefs_user_id_fkey
ALTER TABLE ONLY hub.notification_prefs
    ADD CONSTRAINT notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id) ON DELETE CASCADE;

-- FK CONSTRAINT: roles roles_area_id_fkey
ALTER TABLE ONLY hub.roles
    ADD CONSTRAINT roles_area_id_fkey FOREIGN KEY (area_id) REFERENCES hub.areas(id) ON DELETE CASCADE;

-- FK CONSTRAINT: roles roles_tenant_id_fkey
ALTER TABLE ONLY hub.roles
    ADD CONSTRAINT roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES hub.tenants(id) ON DELETE CASCADE;

-- FK CONSTRAINT: user_managed_areas user_managed_areas_area_id_fkey
ALTER TABLE ONLY hub.user_managed_areas
    ADD CONSTRAINT user_managed_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES hub.areas(id) ON DELETE CASCADE;

-- FK CONSTRAINT: user_managed_areas user_managed_areas_user_id_fkey
ALTER TABLE ONLY hub.user_managed_areas
    ADD CONSTRAINT user_managed_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id) ON DELETE CASCADE;

-- FK CONSTRAINT: users users_id_fkey
ALTER TABLE ONLY hub.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- FK CONSTRAINT: users users_role_id_fkey
ALTER TABLE ONLY hub.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES hub.roles(id);

-- FK CONSTRAINT: users users_tenant_id_fkey
ALTER TABLE ONLY hub.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES hub.tenants(id);

-- FK CONSTRAINT: ag_conhecimento ag_conhecimento_produto_id_fkey

-- ─── medidor de atividade (tempo de uso de cada tela) — veio do OutSign: toda tela chama, então é da base ───

-- FK CONSTRAINT: os_minuto os_minuto_user_id_fkey
ALTER TABLE ONLY hub.os_minuto
    ADD CONSTRAINT os_minuto_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id) ON DELETE CASCADE;

-- FK CONSTRAINT: os_sessao os_sessao_user_id_fkey
ALTER TABLE ONLY hub.os_sessao
    ADD CONSTRAINT os_sessao_user_id_fkey FOREIGN KEY (user_id) REFERENCES hub.users(id) ON DELETE CASCADE;

