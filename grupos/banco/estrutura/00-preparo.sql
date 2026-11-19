-- =============================================================================
-- grupos · 00 · preparo
-- -----------------------------------------------------------------------------
-- O Acompanhamento de Grupos no WhatsApp com IA guarda as mensagens dos grupos que a
-- empresa escolhe, transcreve os áudios e usa a IA para resumir e responder perguntas.
-- Precisa só da base (hub.users, hub.e_do_time()). As extensões pg_cron e pg_net são
-- ligadas pela base; este módulo usa as duas só quando elas existem, então um banco sem
-- elas instala o resto normalmente e fica sem o resumo automático.
-- Rodar de novo não quebra nada.
-- =============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public, extensions', false);
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE SCHEMA IF NOT EXISTS hub;

-- A base precisa estar no banco: o módulo confere o acesso pela ficha da pessoa em hub.users.
DO $og$
BEGIN
  IF to_regclass('hub.users') IS NULL OR to_regprocedure('hub.e_do_time()') IS NULL THEN
    RAISE EXCEPTION 'O Acompanhamento de Grupos precisa da base do sistema instalada antes (hub.users e hub.e_do_time()). Instale a base e rode a instalação de novo.';
  END IF;
END $og$;
