-- =============================================================================
-- base — estrutura do banco (schema hub), SEM NENHUM DADO.
-- Tirada do banco em produção em 30/09/2026 (pg_dump --schema-only).
-- Precisa da base instalado antes (base/banco/estrutura.sql).
-- Ligações condicionais com: sucesso, crm — cada uma só é criada
-- quando o outro subsistema também estiver instalado, em qualquer ordem.
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, extensions', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- papéis de banco que o produto usa (sem login: quem entra por eles é configurado na instalação)
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_agente_leitor') THEN CREATE ROLE hub_agente_leitor NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_agente_leitor_sem_rh') THEN CREATE ROLE hub_agente_leitor_sem_rh NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_agente_leitor_vendas') THEN CREATE ROLE hub_agente_leitor_vendas NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN CREATE ROLE crm_app NOLOGIN; END IF;
  -- quem instala precisa ser membro dos papéis de leitura pra dar a posse das funções de consulta a eles
  EXECUTE format('GRANT hub_agente_leitor, hub_agente_leitor_sem_rh, hub_agente_leitor_vendas TO %I', current_user);
END $do$;

-- extensões que as funções usam (o Supabase já traz todas, só liga)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_cron;

