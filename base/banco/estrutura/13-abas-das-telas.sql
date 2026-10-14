-- =============================================================================
-- base · 13-abas-das-telas.sql — as ABAS que as telas guardam (filtro,
-- agrupamento e ordem de uma lista): hub.oj_views. Várias telas de módulos
-- diferentes usam a mesma tabela (Clientes e Atendimentos do OutJourney, os funis
-- do OutFunnels…), então ela mora na base. Quem lê e grava é o time (piso
-- hub.e_do_time()); "só minha" é a coluna compartilhada = false.
-- =============================================================================

-- TABLE: oj_views
CREATE TABLE hub.oj_views (
    id bigint NOT NULL,
    tela text NOT NULL,
    nome text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    user_email text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    compartilhada boolean DEFAULT true NOT NULL
);

-- COMMENT: COLUMN oj_views.compartilhada
COMMENT ON COLUMN hub.oj_views.compartilhada IS 'true = o time todo vê esta aba (padrão, e o que sempre aconteceu); false = só quem criou. Quem filtra é a policy views_le.';

-- SEQUENCE: oj_views_id_seq
CREATE SEQUENCE hub.oj_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: oj_views_id_seq
ALTER SEQUENCE hub.oj_views_id_seq OWNED BY hub.oj_views.id;

-- DEFAULT: oj_views id
ALTER TABLE ONLY hub.oj_views ALTER COLUMN id SET DEFAULT nextval('hub.oj_views_id_seq'::regclass);

-- CONSTRAINT: oj_views oj_views_pkey
ALTER TABLE ONLY hub.oj_views
    ADD CONSTRAINT oj_views_pkey PRIMARY KEY (id);

-- INDEX: oj_views_dono
CREATE INDEX oj_views_dono ON hub.oj_views USING btree (lower(user_email));

-- INDEX: oj_views_tela
CREATE INDEX oj_views_tela ON hub.oj_views USING btree (tela);

-- ROW SECURITY: oj_views
ALTER TABLE hub.oj_views ENABLE ROW LEVEL SECURITY;

-- POLICY: oj_views views_escreve
CREATE POLICY views_escreve ON hub.oj_views TO authenticated USING (hub.e_do_time()) WITH CHECK (hub.e_do_time());

-- POLICY: oj_views views_le
CREATE POLICY views_le ON hub.oj_views FOR SELECT TO authenticated USING ((hub.e_do_time() AND (compartilhada OR (user_email IS NULL) OR (lower(user_email) = lower((auth.jwt() ->> 'email'::text))))));

-- ACL: TABLE oj_views
GRANT ALL ON TABLE hub.oj_views TO authenticated;
GRANT ALL ON TABLE hub.oj_views TO service_role;
GRANT SELECT ON TABLE hub.oj_views TO hub_agente_leitor;
GRANT SELECT ON TABLE hub.oj_views TO hub_agente_leitor_sem_rh;
GRANT SELECT ON TABLE hub.oj_views TO hub_agente_leitor_vendas;

-- ACL: SEQUENCE oj_views_id_seq
GRANT ALL ON SEQUENCE hub.oj_views_id_seq TO authenticated;
GRANT ALL ON SEQUENCE hub.oj_views_id_seq TO service_role;

