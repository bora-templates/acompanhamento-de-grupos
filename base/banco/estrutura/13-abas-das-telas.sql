-- =============================================================================
-- base · 13-abas-das-telas.sql — as ABAS que as telas guardam (filtro,
-- agrupamento e ordem de uma lista): hub.suc_views. Várias telas de módulos
-- diferentes usam a mesma tabela (Clientes e Atendimentos do Sucesso, os funis
-- do CRM…), então ela mora na base. Quem lê e grava é o time (piso
-- hub.e_do_time()); "só minha" é a coluna compartilhada = false.
-- =============================================================================

-- TABLE: suc_views
CREATE TABLE hub.suc_views (
    id bigint NOT NULL,
    tela text NOT NULL,
    nome text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_email text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    compartilhada boolean DEFAULT true NOT NULL
);

-- COMMENT: COLUMN suc_views.compartilhada
COMMENT ON COLUMN hub.suc_views.compartilhada IS 'true = o time todo vê esta aba (padrão, e o que sempre aconteceu); false = só quem criou. Quem filtra é a policy views_le.';

-- SEQUENCE: suc_views_id_seq
CREATE SEQUENCE hub.suc_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: suc_views_id_seq
ALTER SEQUENCE hub.suc_views_id_seq OWNED BY hub.suc_views.id;

-- DEFAULT: suc_views id
ALTER TABLE ONLY hub.suc_views ALTER COLUMN id SET DEFAULT nextval('hub.suc_views_id_seq'::regclass);

-- CONSTRAINT: suc_views suc_views_pkey
ALTER TABLE ONLY hub.suc_views
    ADD CONSTRAINT suc_views_pkey PRIMARY KEY (id);

-- INDEX: suc_views_dono
CREATE INDEX suc_views_dono ON hub.suc_views USING btree (lower(user_email));

-- INDEX: suc_views_tela
CREATE INDEX suc_views_tela ON hub.suc_views USING btree (tela);

-- ROW SECURITY: suc_views
ALTER TABLE hub.suc_views ENABLE ROW LEVEL SECURITY;

-- POLICY: suc_views views_escreve
CREATE POLICY views_escreve ON hub.suc_views TO authenticated USING (hub.e_do_time()) WITH CHECK (hub.e_do_time());

-- POLICY: suc_views views_le
CREATE POLICY views_le ON hub.suc_views FOR SELECT TO authenticated USING ((hub.e_do_time() AND (compartilhada OR (user_email IS NULL) OR (lower(user_email) = lower((auth.jwt() ->> 'email'::text))))));

-- ACL: TABLE suc_views
GRANT ALL ON TABLE hub.suc_views TO authenticated;
GRANT ALL ON TABLE hub.suc_views TO service_role;
GRANT SELECT ON TABLE hub.suc_views TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.suc_views TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.suc_views TO hub_agente_leitor_vendas;

-- ACL: SEQUENCE suc_views_id_seq
GRANT ALL ON SEQUENCE hub.suc_views_id_seq TO authenticated;
GRANT ALL ON SEQUENCE hub.suc_views_id_seq TO service_role;

