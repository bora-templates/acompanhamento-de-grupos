-- TABLE: ag_conhecimento
CREATE TABLE hub.ag_conhecimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text DEFAULT 'conhecimento'::text NOT NULL,
    titulo text NOT NULL,
    texto text NOT NULL,
    quando_usar text,
    acesso text,
    para_cliente boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    autor_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    busca tsvector,
    fonte text,
    fonte_url text,
    produto_id uuid,
    CONSTRAINT ag_conhecimento_tipo_check CHECK ((tipo = ANY (ARRAY['conhecimento'::text, 'exemplo'::text])))
);

-- COMMENT: TABLE ag_conhecimento
COMMENT ON TABLE hub.ag_conhecimento IS 'A base de conhecimento da empresa (da base): processos, jeitos de responder, o que nunca se promete, e as respostas prontas de suporte de cada produto (OutFunnels). O assistente (módulo OutAssistenteIA) lê e grava nela pelo /ensinar.';

-- COMMENT: COLUMN ag_conhecimento.fonte
COMMENT ON COLUMN hub.ag_conhecimento.fonte IS 'De onde saiu este conhecimento — arquivo, link ou quem escreveu. O agente cita.';

-- COMMENT: COLUMN ag_conhecimento.fonte_url
COMMENT ON COLUMN hub.ag_conhecimento.fonte_url IS 'Onde esta página MORA lá fora (link do Notion). Vazio = nasceu aqui dentro. É o endereço; quem se pronuncia continua sendo a coluna fonte.';

-- COMMENT: COLUMN ag_conhecimento.produto_id
COMMENT ON COLUMN hub.ag_conhecimento.produto_id IS 'SUPORTE-DO-ALUNO-28-09-2026: resposta aprovada de suporte deste produto (fonte = suporte_produto, para_cliente = true).';

-- TABLE: alocacoes_log
CREATE TABLE hub.alocacoes_log (
    id bigint NOT NULL,
    sistema text NOT NULL,
    entidade text NOT NULL,
    entidade_id text NOT NULL,
    titulo text,
    pessoa text NOT NULL,
    pessoa_id uuid,
    acao text NOT NULL,
    autor text,
    autor_id uuid,
    link text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alocacoes_log_acao_check CHECK ((acao = ANY (ARRAY['entrou'::text, 'saiu'::text])))
);

-- SEQUENCE: alocacoes_log_id_seq
CREATE SEQUENCE hub.alocacoes_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: alocacoes_log_id_seq
ALTER SEQUENCE hub.alocacoes_log_id_seq OWNED BY hub.alocacoes_log.id;

-- TABLE: app_aparelhos
CREATE TABLE hub.app_aparelhos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    rotulo text,
    user_agent text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    visto_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_envio timestamp with time zone,
    falhas integer DEFAULT 0 NOT NULL,
    desconectado_em timestamp with time zone,
    desconectado_por uuid
);

-- COMMENT: TABLE app_aparelhos
COMMENT ON TABLE hub.app_aparelhos IS 'Aparelhos com notificação ligada (Web Push). Grava: hub.app_aparelho_registrar. Envia: Edge Function app-push. Some sozinho quando a pessoa sai (gatilho em hub.users).';

-- TABLE: app_convites
CREATE TABLE hub.app_convites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_sha text NOT NULL,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    vence_em timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    usado_em timestamp with time zone,
    cancelado_em timestamp with time zone,
    cancelado_motivo text
);

-- COMMENT: TABLE app_convites
COMMENT ON TABLE hub.app_convites IS 'Convite do app no celular (48h, uso único). Guarda só o sha256 do código. Escreve: Edge Function app-convite.';

-- TABLE: app_uso
CREATE TABLE hub.app_uso (
    user_id uuid NOT NULL,
    dia date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date NOT NULL,
    onde text NOT NULL,
    rotulo text,
    primeiro_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_em timestamp with time zone DEFAULT now() NOT NULL,
    aberturas integer DEFAULT 1 NOT NULL,
    CONSTRAINT app_uso_onde_check CHECK ((onde = ANY (ARRAY['app'::text, 'navegador'::text])))
);

-- COMMENT: TABLE app_uso
COMMENT ON TABLE hub.app_uso IS 'Uso do app no celular por pessoa/dia (app instalado × navegador do celular). Grava: hub.app_registra_uso (os-core). Lê: hub.app_painel.';

-- TABLE: areas
CREATE TABLE hub.areas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    lider_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL
);

-- COMMENT: COLUMN areas.lider_ids
COMMENT ON COLUMN hub.areas.lider_ids IS 'Quem responde pela área (hub.users.id). Fonte da liderança nas telas; o gestor_id do rh_perfil é reserva.';

-- TABLE: aviso_prefs
CREATE TABLE hub.aviso_prefs (
    user_id uuid NOT NULL,
    som boolean DEFAULT true NOT NULL,
    popup boolean DEFAULT true NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE: banner_noticias
CREATE TABLE hub.banner_noticias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    badge text,
    titulo text NOT NULL,
    destaque text,
    texto text,
    link_url text,
    link_label text DEFAULT 'Ver mais'::text,
    imagem_url text,
    cor text DEFAULT '#BBB2DC'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    nome text,
    expira_em timestamp with time zone
);

-- SEQUENCE: clientes_codigo_oj_seq
CREATE SEQUENCE hub.clientes_codigo_oj_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- TABLE: colaboradores
CREATE TABLE hub.colaboradores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    nome text NOT NULL,
    email text NOT NULL,
    cargo text,
    area text,
    telefone text,
    foto_url text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE: users
CREATE TABLE hub.users (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role_id uuid,
    full_name text NOT NULL,
    email text NOT NULL,
    access_level text DEFAULT 'collaborator'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    area_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    cargo_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    chat_enabled boolean DEFAULT true NOT NULL,
    acesso_journey boolean DEFAULT true NOT NULL,
    acesso_performance boolean DEFAULT true NOT NULL,
    acessos jsonb DEFAULT '{}'::jsonb NOT NULL,
    avatar_url text,
    cor text,
    whatsapp text,
    CONSTRAINT users_access_level_check CHECK ((access_level = ANY (ARRAY['collaborator'::text, 'manager'::text, 'admin'::text])))
);

-- COMMENT: COLUMN users.cor
COMMENT ON COLUMN hub.users.cor IS 'Cor pessoal em hex (#RRGGBB) — pinta o avatar quando não há foto. Null = cor padrão do tema.';

-- COMMENT: COLUMN users.whatsapp
COMMENT ON COLUMN hub.users.whatsapp IS 'WhatsApp da pessoa (só dígitos, com DDD; 55 é assumido). Usado pelo aviso de alocação.';

-- TABLE: email_outbox
CREATE TABLE hub.email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    para_email text,
    para_nome text,
    assunto text,
    corpo text,
    status text DEFAULT 'pendente'::text,
    erro text,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    de_email text,
    de_nome text,
    responder_para text,
    resend_id text,
    anexos jsonb
);

-- COMMENT: COLUMN email_outbox.de_email
COMMENT ON COLUMN hub.email_outbox.de_email IS 'Remetente desejado. Só é usado se o domínio estiver verificado no serviço de envio; senão a função cai no remetente padrão.';

-- COMMENT: COLUMN email_outbox.resend_id
COMMENT ON COLUMN hub.email_outbox.resend_id IS 'Número do envio no Resend — sem ele não dá pra saber se o e-mail foi entregue, foi pro spam ou voltou.';

-- COMMENT: COLUMN email_outbox.anexos
COMMENT ON COLUMN hub.email_outbox.anexos IS 'Lista [{nome, url}] — a email-envio entrega ao Resend. URL assinada, curta duração.';

-- TABLE: ext_busca_log
CREATE TABLE hub.ext_busca_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sistema text NOT NULL,
    acao text,
    parametros jsonb DEFAULT '{}'::jsonb NOT NULL,
    quem text,
    canal text,
    bytes integer,
    erro text,
    ms integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- COMMENT: TABLE ext_busca_log
COMMENT ON TABLE hub.ext_busca_log IS 'Cada consulta feita a sistema de FORA (ClickUp, Notion, Metabase…) pela ponte ext-busca. Append-only na prática.';

-- TABLE: feriados
CREATE TABLE hub.feriados (
    dia date NOT NULL,
    nome text NOT NULL,
    tipo text DEFAULT 'nacional'::text NOT NULL
);

-- TABLE: roles
CREATE TABLE hub.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    area_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    cadence text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    faixa_min numeric,
    faixa_max numeric,
    CONSTRAINT roles_cadence_check CHECK ((cadence = ANY (ARRAY['diaria'::text, 'semanal'::text, 'mensal'::text, 'pos-evento'::text])))
);

-- COMMENT: COLUMN roles.faixa_min
COMMENT ON COLUMN hub.roles.faixa_min IS 'Piso da faixa salarial de referência do cargo. Alimenta a coluna "Faixa do cargo" e o "Na faixa/Acima da média" da tela Folha & Quadro do OutPeople. Editável em RH → Sistema → Cargos (só admin). Vazio = o cargo não tem faixa definida e a tela mostra "—".';

-- COMMENT: COLUMN roles.faixa_max
COMMENT ON COLUMN hub.roles.faixa_max IS 'Teto da faixa salarial de referência do cargo. Ver hub.roles.faixa_min.';

-- TABLE: ia_chamadas
CREATE TABLE hub.ia_chamadas (
    id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    robo text NOT NULL,
    onde text,
    modelo text,
    tokens_entrada integer,
    tokens_saida integer,
    tokens_cache integer,
    ok boolean DEFAULT true NOT NULL,
    erro text
);

-- COMMENT: TABLE ia_chamadas
COMMENT ON TABLE hub.ia_chamadas IS 'Cada chamada de robô ao modelo de IA, com os tokens — inclusive as que falharam. Quem escreve é hub.ia_registra (Edge Functions).';

-- SEQUENCE: ia_chamadas_id_seq
CREATE SEQUENCE hub.ia_chamadas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: ia_chamadas_id_seq
ALTER SEQUENCE hub.ia_chamadas_id_seq OWNED BY hub.ia_chamadas.id;

-- TABLE: logins_fora_do_time
CREATE TABLE hub.logins_fora_do_time (
    auth_id uuid NOT NULL,
    email text,
    quando timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE: notificacoes
CREATE TABLE hub.notificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tipo text,
    titulo text,
    texto text,
    link text,
    lida boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    sistema text,
    autor text,
    prazo date,
    wpp_em timestamp with time zone,
    wpp_erro text
);

-- TABLE: notification_prefs
CREATE TABLE hub.notification_prefs (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    notify_my_pendency boolean DEFAULT true NOT NULL,
    notify_area_pendency boolean DEFAULT false NOT NULL,
    notify_meta_hit boolean DEFAULT true NOT NULL,
    show_login_modal boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE: novidades
CREATE TABLE hub.novidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dia date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date NOT NULL,
    sistema text NOT NULL,
    titulo text NOT NULL,
    link text,
    status text DEFAULT 'liberado'::text NOT NULL,
    versao text,
    commit text,
    autor text,
    autor_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT novidades_status_ck CHECK ((status = ANY (ARRAY['liberado'::text, 'construcao'::text])))
);

-- TABLE: novidades_envios
CREATE TABLE hub.novidades_envios (
    dia date NOT NULL,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    itens integer DEFAULT 0 NOT NULL,
    pessoas integer DEFAULT 0 NOT NULL
);

-- TABLE: tenants
CREATE TABLE hub.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- TABLE: user_managed_areas
CREATE TABLE hub.user_managed_areas (
    user_id uuid NOT NULL,
    area_id uuid NOT NULL
);

-- TABLE: user_prefs
CREATE TABLE hub.user_prefs (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    key text NOT NULL,
    value jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- DEFAULT: alocacoes_log id
ALTER TABLE ONLY hub.alocacoes_log ALTER COLUMN id SET DEFAULT nextval('hub.alocacoes_log_id_seq'::regclass);

-- DEFAULT: ia_chamadas id
ALTER TABLE ONLY hub.ia_chamadas ALTER COLUMN id SET DEFAULT nextval('hub.ia_chamadas_id_seq'::regclass);


-- ─── medidor de atividade (tempo de uso de cada tela) — veio do OutSign: toda tela chama, então é da base ───

-- TABLE: os_minuto
CREATE TABLE hub.os_minuto (
    user_id uuid NOT NULL,
    minuto timestamp with time zone NOT NULL,
    segundos smallint DEFAULT 0 NOT NULL,
    sistema text,
    cliques smallint DEFAULT 0 NOT NULL,
    seg_aberto smallint DEFAULT 0 NOT NULL
);

-- COMMENT: TABLE os_minuto
COMMENT ON TABLE hub.os_minuto IS 'Um minuto de presença por pessoa. Duas abas no mesmo minuto contam UMA vez — a unidade é a pessoa, não a aba.';

-- COMMENT: COLUMN os_minuto.seg_aberto
COMMENT ON COLUMN hub.os_minuto.seg_aberto IS 'Segundos do minuto em que a tela do Hub estava NA FRENTE da pessoa, mesmo sem ela mexer. `segundos` é o subconjunto em que ela estava mexendo.';

-- TABLE: os_sessao
CREATE TABLE hub.os_sessao (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    sistema text NOT NULL,
    tela text,
    inicio timestamp with time zone DEFAULT now() NOT NULL,
    fim timestamp with time zone DEFAULT now() NOT NULL,
    segundos integer DEFAULT 0 NOT NULL,
    cliques integer DEFAULT 0 NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);

-- COMMENT: TABLE os_sessao
COMMENT ON TABLE hub.os_sessao IS 'Presença no Hub: tempo ATIVO (aba visível e com foco), telas e cliques, por pessoa e sistema. Mede presença, não trabalho.';


-- ─── estado compartilhado do os-core (hub.os_estado) — veio do OutJourney: toda tela usa ───

-- TABLE: os_estado
CREATE TABLE hub.os_estado (
    chave text NOT NULL,
    valor jsonb DEFAULT '{}'::jsonb NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por text
);

-- COMMENT: TABLE os_estado
COMMENT ON TABLE hub.os_estado IS 'Armário compartilhado do Hub: o que uma pessoa faz na tela, todas veem. Escrito pelo os-core.js.';

