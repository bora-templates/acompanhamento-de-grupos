-- =============================================================================
-- grupos · LIGAÇÕES: o que precisa ficar de pé depois de toda instalação
-- -----------------------------------------------------------------------------
-- O instalador roda os *-ligacoes.sql de todos os módulos no fim de TODA instalação
-- (inclusive quando outro módulo chega depois). Este módulo não depende de nenhum outro;
-- aqui ele só garante, de novo a cada instalação:
--   1. as duas chaves que a solução inventa, no cofre do Supabase (Vault): a da entrada
--      (vai no endereço que a uazapi chama) e a da agenda (vai no cabeçalho x-gr-agenda);
--   2. a tarefa gr-resumos-automaticos no pg_cron, a cada 15 minutos.
-- Sem cofre, sem pg_cron ou sem pg_net, só grava um aviso e segue. Rodar de novo não duplica.
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

DO $og$
DECLARE
  v_agenda jsonb;
BEGIN
  IF to_regprocedure('hub.gr_segredo_garantir(text)') IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM hub.gr_segredo_garantir('gr_chave_entrada');
    PERFORM hub.gr_segredo_garantir('gr_chave_agenda');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Acompanhamento de Grupos: o cofre do Supabase não respondeu (%). As chaves nascem quando alguém salvar os ajustes da solução.', SQLERRM;
  END;

  IF to_regprocedure('hub.gr_agenda_preparar()') IS NOT NULL THEN
    v_agenda := hub.gr_agenda_preparar();
    IF coalesce((v_agenda ->> 'ok')::boolean, false) IS NOT TRUE THEN
      RAISE WARNING 'Acompanhamento de Grupos: %', coalesce(v_agenda ->> 'motivo', 'a agenda do resumo automático ficou desligada.');
    END IF;
  END IF;
END $og$;
