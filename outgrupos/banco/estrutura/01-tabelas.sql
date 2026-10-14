-- =============================================================================
-- outgrupos · 01 · tabelas
-- -----------------------------------------------------------------------------
-- Todas no esquema hub, com o prefixo og_. Cada tabela nasce com a RLS ligada e sem
-- nenhuma permissão para public, anon e authenticated: quem lê pela tela são as
-- políticas de leitura (07-seguranca.sql) e as funções das telas (03-telas.sql), e quem
-- grava são as funções (security definer) e as Edge Functions, pela chave de serviço.
-- Tokens e chaves NUNCA ficam aqui: eles moram no cofre do Supabase (Vault).
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

-- ── og_ajustes: uma linha só, com o que a empresa configurou ─────────────────
create table if not exists hub.og_ajustes (
  id                    smallint primary key default 1 check (id = 1),
  whatsapp_servidor     text check (whatsapp_servidor is null or whatsapp_servidor ~* '^https://'),
  whatsapp_estado       text not null default 'desligado'
                        check (whatsapp_estado in ('desligado', 'aguardando_qr', 'conectado', 'erro')),
  whatsapp_numero       text,
  whatsapp_erro         text,
  whatsapp_conferido_em timestamptz,
  ia_provedor           text check (ia_provedor is null or ia_provedor in ('openai', 'anthropic', 'deepseek', 'compativel')),
  ia_modelo             text,
  ia_url                text,
  transcricao_provedor  text check (transcricao_provedor is null or transcricao_provedor in ('groq', 'openai')),
  funcoes_url           text,
  atualizado_em         timestamptz,
  atualizado_por        uuid
);
comment on table hub.og_ajustes is
  'Acompanhamento de Grupos: a configuração da empresa (uma linha só). Sem token nem chave: eles ficam no Vault (og_segredo_*). Só a chave de serviço lê e grava.';
comment on column hub.og_ajustes.funcoes_url is
  'O SUPABASE_URL que a Edge Function og-api grava. Ninguém do navegador escreve aqui; a agenda usa quando a instalação não trocou o endereço do projeto.';
insert into hub.og_ajustes (id) values (1) on conflict (id) do nothing;

-- ── og_grupos: os grupos que a empresa acompanha ─────────────────────────────
create table if not exists hub.og_grupos (
  id                 uuid primary key default gen_random_uuid(),
  jid                text not null unique check (jid ~ '@g\.us$'),
  nome               text not null,
  pessoas            int not null default 0,
  ativo              boolean not null default true,
  exemplo            boolean not null default false,
  orientacoes        text,
  resumo_auto        boolean not null default false,
  resumo_hora        smallint not null default 20 check (resumo_hora between 0 and 23),
  resumo_envia       boolean not null default false,
  ultimo_auto_em     timestamptz,
  auto_tentativas    smallint not null default 0,
  auto_tentativas_dia date,
  ultima_mensagem_em timestamptz,
  importado_em       timestamptz,
  importacao_inicio  timestamptz,
  importadas         int,
  importacao_erro    text,
  criado_em          timestamptz default now(),
  criado_por         uuid,
  atualizado_em      timestamptz default now()
);
-- as colunas que chegaram depois da primeira versão (banco que já tinha a tabela)
alter table hub.og_grupos add column if not exists auto_tentativas smallint not null default 0;
alter table hub.og_grupos add column if not exists auto_tentativas_dia date;
alter table hub.og_grupos add column if not exists importacao_inicio timestamptz;
alter table hub.og_grupos add column if not exists importadas int;
alter table hub.og_grupos add column if not exists importacao_erro text;
comment on table hub.og_grupos is
  'Acompanhamento de Grupos: os grupos acompanhados. ativo = false é grupo pausado (a entrada descarta as mensagens dele). exemplo = true é o grupo fictício da Contorno Estética.';
comment on column hub.og_grupos.resumo_hora is 'Hora de Brasília (0 a 23) em que o resumo automático roda.';
comment on column hub.og_grupos.importado_em is
  'Quando terminou a importação das mensagens recentes guardadas na uazapi. Nulo enquanto a importação ainda corre.';
comment on column hub.og_grupos.importacao_inicio is
  'Quando a última importação começou (a primeira usa o criado_em). O selo importando vale por até 15 minutos a partir daqui.';
comment on column hub.og_grupos.importadas is 'Quantas mensagens a última importação gravou.';
comment on column hub.og_grupos.importacao_erro is
  'Frase da solução quando a última importação parou no meio (nunca o texto que a uazapi devolveu). Nulo quando terminou bem.';
comment on column hub.og_grupos.auto_tentativas is
  'Quantas vezes o resumo automático foi tentado no dia auto_tentativas_dia (no máximo 3 por dia).';
create index if not exists og_grupos_agenda_idx on hub.og_grupos (resumo_hora) where resumo_auto and ativo;

-- ── og_participantes: quem está em cada grupo ────────────────────────────────
create table if not exists hub.og_participantes (
  grupo_id      uuid not null references hub.og_grupos (id) on delete cascade,
  jid           text not null,
  nome          text,
  telefone      text,
  admin         boolean not null default false,
  atualizado_em timestamptz default now(),
  primary key (grupo_id, jid)
);
comment on table hub.og_participantes is 'Acompanhamento de Grupos: os participantes de cada grupo, atualizados a pedido pela uazapi.';

-- ── og_mensagens: a conversa guardada ────────────────────────────────────────
create table if not exists hub.og_mensagens (
  id          bigint generated always as identity primary key,
  grupo_id    uuid not null references hub.og_grupos (id) on delete cascade,
  whatsapp_id text,
  autor_jid   text,
  autor_nome  text,
  do_time     boolean not null default false,
  tipo        text not null check (tipo in ('texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'outro')),
  texto       text,
  arquivo_nome text,
  transcricao text not null default 'nao_se_aplica'
              check (transcricao in ('nao_se_aplica', 'pendente', 'feita', 'falhou', 'sem_servico', 'nao_transcrito')),
  citada_id   text,
  momento     timestamptz not null,
  recebida_em timestamptz not null default now(),
  transcricao_tentativas smallint not null default 0,
  busca       tsvector generated always as (
                to_tsvector('portuguese'::regconfig, coalesce(autor_nome, '') || ' ' || coalesce(texto, ''))
              ) stored,
  constraint og_mensagens_whatsapp_unico unique (grupo_id, whatsapp_id)
);
comment on table hub.og_mensagens is
  'Acompanhamento de Grupos: as mensagens dos grupos acompanhados. A mesma mensagem que chega duas vezes entra uma vez (grupo_id, whatsapp_id). do_time = veio do número conectado.';
comment on column hub.og_mensagens.texto is 'Texto da mensagem, legenda da mídia ou transcrição do áudio. Vai como chegou: a tela escapa o HTML ao mostrar.';
comment on column hub.og_mensagens.transcricao is
  'Só para áudio: pendente (na fila), feita, falhou, sem_servico (sem chave de transcrição) ou nao_transcrito (áudio antigo importado fora dos 30 mais recentes).';
alter table hub.og_mensagens add column if not exists transcricao_tentativas smallint not null default 0;
comment on column hub.og_mensagens.transcricao_tentativas is
  'Quantas vezes a transcrição do áudio falhou. A agenda tenta de novo as que falharam há menos de 24 horas, no máximo 3 vezes.';
create index if not exists og_mensagens_busca_idx on hub.og_mensagens using gin (busca);
-- a página da conversa anda por (momento, id): duas mensagens com o mesmo momento não se perdem
drop index if exists hub.og_mensagens_grupo_momento_idx;
create index if not exists og_mensagens_pagina_idx on hub.og_mensagens (grupo_id, momento desc, id desc);
create index if not exists og_mensagens_pendentes_idx on hub.og_mensagens (recebida_em) where transcricao = 'pendente';
create index if not exists og_mensagens_falhas_idx on hub.og_mensagens (recebida_em) where transcricao = 'falhou';
create index if not exists og_mensagens_autor_idx on hub.og_mensagens (grupo_id, autor_jid);

-- ── og_resumos: os resumos guardados por grupo ───────────────────────────────
create table if not exists hub.og_resumos (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references hub.og_grupos (id) on delete cascade,
  periodo          text not null check (periodo in ('24h', 'hoje', 'ontem', '7d', 'datas')),
  inicio           timestamptz not null,
  fim              timestamptz not null,
  conteudo         jsonb not null,
  numeros          jsonb not null,
  texto_whatsapp   text not null,
  mensagens_usadas int not null,
  mensagens_fora   int not null default 0,
  origem           text not null check (origem in ('pedido', 'automatico')),
  pedido_por       uuid,
  modelo           text,
  criado_em        timestamptz default now(),
  enviado_em       timestamptz,
  enviado_por      uuid,
  enviado_texto    text,
  enviando_em      timestamptz
);
-- enviando_em marca o envio que começou e ainda não terminou: ele trava o segundo clique (og_resumo_reservar_envio).
alter table hub.og_resumos add column if not exists enviando_em timestamptz;
comment on table hub.og_resumos is
  'Acompanhamento de Grupos: cada resumo feito (a pedido ou automático). conteudo = o JSON conferido da IA mais links, arquivos e participação; numeros = calculados sem IA.';
create index if not exists og_resumos_grupo_idx on hub.og_resumos (grupo_id, criado_em desc);

-- ── og_materiais: os materiais de apoio de cada grupo ────────────────────────
create table if not exists hub.og_materiais (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references hub.og_grupos (id) on delete cascade,
  titulo       text not null check (length(btrim(titulo)) between 1 and 200),
  texto        text not null check (length(texto) between 1 and 60000),
  arquivo_nome text,
  busca        tsvector generated always as (
                 setweight(to_tsvector('portuguese'::regconfig, coalesce(titulo, '')), 'A')
                 || setweight(to_tsvector('portuguese'::regconfig, coalesce(texto, '')), 'B')
               ) stored,
  criado_em    timestamptz default now(),
  criado_por   uuid
);
comment on table hub.og_materiais is
  'Acompanhamento de Grupos: regras, perguntas frequentes e programas de cada grupo. A IA usa os trechos que combinam com as palavras do período ou da pergunta.';
create index if not exists og_materiais_busca_idx on hub.og_materiais using gin (busca);
create index if not exists og_materiais_grupo_idx on hub.og_materiais (grupo_id, criado_em desc);

-- ── og_perguntas: as perguntas à IA, de cada pessoa ──────────────────────────
create table if not exists hub.og_perguntas (
  id        bigint generated always as identity primary key,
  grupo_id  uuid references hub.og_grupos (id) on delete cascade,
  user_id   uuid not null,
  pergunta  text not null,
  resposta  text not null,
  periodo   text,
  inicio    timestamptz,
  fim       timestamptz,
  modelo    text,
  criado_em timestamptz default now()
);
comment on table hub.og_perguntas is
  'Acompanhamento de Grupos: as perguntas feitas à IA sobre cada grupo. Cada pessoa vê só as próprias. Resposta vazia é a pergunta que ainda espera a IA (ou que a IA não respondeu) e conta no limite de 30 por hora.';
create index if not exists og_perguntas_minhas_idx on hub.og_perguntas (grupo_id, user_id, criado_em desc);
create index if not exists og_perguntas_pessoa_idx on hub.og_perguntas (user_id, criado_em desc);

-- ── og_registro: as falhas, sem token e sem texto de mensagem ─────────────────
create table if not exists hub.og_registro (
  id        bigint generated always as identity primary key,
  origem    text,
  mensagem  text,
  detalhe   jsonb,
  criado_em timestamptz default now()
);
comment on table hub.og_registro is
  'Acompanhamento de Grupos: falhas da entrada, da IA, da uazapi, da importação e da agenda. Sem token e sem texto de mensagem. Só a chave de serviço lê e grava; a agenda apaga o que tem mais de 30 dias.';
create index if not exists og_registro_quando_idx on hub.og_registro (criado_em);

-- ── travas das tabelas, já na mesma transação em que elas nascem ─────────────
-- No esquema hub, tabela nova nasce com permissão para authenticated: fecha tudo aqui e
-- libera só o necessário no 07-seguranca.sql.
alter table hub.og_ajustes       enable row level security;
alter table hub.og_grupos        enable row level security;
alter table hub.og_participantes enable row level security;
alter table hub.og_mensagens     enable row level security;
alter table hub.og_resumos       enable row level security;
alter table hub.og_materiais     enable row level security;
alter table hub.og_perguntas     enable row level security;
alter table hub.og_registro      enable row level security;

revoke all on hub.og_ajustes, hub.og_grupos, hub.og_participantes, hub.og_mensagens, hub.og_resumos,
              hub.og_materiais, hub.og_perguntas, hub.og_registro
  from public, anon, authenticated;
grant all on hub.og_ajustes, hub.og_grupos, hub.og_participantes, hub.og_mensagens, hub.og_resumos,
             hub.og_materiais, hub.og_perguntas, hub.og_registro
  to service_role;

DO $og$
DECLARE v_tabela text; v_seq text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['hub.og_mensagens', 'hub.og_perguntas', 'hub.og_registro'] LOOP
    v_seq := pg_get_serial_sequence(v_tabela, 'id');
    IF v_seq IS NOT NULL THEN
      EXECUTE format('revoke all on sequence %s from public, anon, authenticated', v_seq);
      EXECUTE format('grant usage, select on sequence %s to service_role', v_seq);
    END IF;
  END LOOP;
END $og$;
