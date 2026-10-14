-- =============================================================================
-- base/banco/estrutura.sql — ÍNDICE
-- A estrutura deste sistema mora em estrutura/, um arquivo por fase, na ORDEM
-- em que o banco precisa delas. Instale com:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f banco/estrutura.sql
-- (o \ir inclui cada parte; é comando do psql, não SQL — no painel do Supabase,
--  cole as partes uma a uma, nesta ordem.)
-- Dividido pelo tools/manutencao/dividir/sql.js sem mudar nada: a soma das partes é o
-- arquivo de antes, byte a byte.
--
-- Este índice é o ESSENCIAL da base (vai em toda instalação). As outras peças
-- da base que têm banco moram em banco/pecas/ e o instalador
-- (tools/instalar/instalar-banco.sh) só roda as que algum módulo da compra usa:
--     banco/pecas/produtos.sql   o catálogo de produtos
--     banco/pecas/comercial.sql  a agenda comercial e os funis de venda
-- (lista e motivo em base/sistema.json → "pecas"). Mudança na base depois da
-- versão 1.0.0 entra em banco/atualizacoes/ (ver o LEIA-ME de lá).
-- =============================================================================

\ir estrutura/00-preparo.sql
\ir estrutura/01-funcoes.sql
\ir estrutura/02-funcoes.sql
\ir estrutura/03-tabelas-e-views.sql
\ir estrutura/04-chaves-e-indices.sql
\ir estrutura/05-seguranca-rls.sql
\ir estrutura/06-permissoes.sql
\ir estrutura/07-chaves-estrangeiras.sql
\ir estrutura/13-abas-das-telas.sql
\ir estrutura/08-ligacoes.sql
\ir estrutura/09-inicio-e-avisos.sql
\ir estrutura/10-primeiro-acesso.sql
-- os baldes (Storage) da base e a peça que cada módulo usa pra criar os dele
\ir estrutura/14-baldes.sql
-- telefone → número do WhatsApp (vários módulos usam)
\ir estrutura/15-telefone-whatsapp.sql
