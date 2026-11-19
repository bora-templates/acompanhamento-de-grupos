-- =============================================================================
-- grupos: o banco do Acompanhamento de Grupos no WhatsApp com IA (o índice: as partes ficam em estrutura/).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f grupos/banco/estrutura.sql
-- Precisa só da BASE instalada antes; quem cuida da ordem é o tools/instalar (a tela /setup ou o instalar-banco.sh).
-- Cada parte roda numa transação só e pode rodar de novo sem erro (instalação que retoma).
-- O 90-ligacoes.sql roda de novo no fim de toda instalação: ele garante as chaves do cofre
-- (Supabase Vault) e a agenda do resumo automático no pg_cron, quando o banco tem pg_cron e pg_net.
-- Só ESTRUTURA: nenhum dado de empresa. O grupo de exemplo nasce só quando alguém pede, pela tela.
-- (o \ir inclui cada parte; é comando do psql, não SQL. No painel do Supabase, cole as partes na ordem abaixo)
-- =============================================================================
\ir estrutura/00-preparo.sql
\ir estrutura/01-tabelas.sql
\ir estrutura/02-funcoes.sql
\ir estrutura/03-telas.sql
\ir estrutura/04-servidor.sql
\ir estrutura/05-agenda.sql
\ir estrutura/06-exemplo.sql
\ir estrutura/07-seguranca.sql
\ir estrutura/90-ligacoes.sql
