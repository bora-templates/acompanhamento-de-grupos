-- =============================================================================
-- base/banco/esbocos-tira.sql: roda no COMEÇO das ligações (as duas instalações chamam).
--
-- Apaga os esboços que o esbocos.sql deixou da última vez (visões vazias no lugar das
-- que nascem com outro módulo). Assim, se o módulo chegou, a ligação dele cria a visão
-- de verdade; se ainda não chegou, o esbocos.sql põe o esboço de volta no fim.
-- Só apaga visão marcada como esboço no comentário: nada de verdade sai daqui.
-- =============================================================================
do $esboco$
declare v record;
begin
  for v in
    select c.oid::regclass as nome
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'hub' and c.relkind = 'v'
       and coalesce(obj_description(c.oid, 'pg_class'), '') like 'esboço:%'
  loop
    execute format('drop view %s', v.nome);
  end loop;
end $esboco$;
