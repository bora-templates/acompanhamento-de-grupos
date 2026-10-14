-- =============================================================================
-- base · 14-baldes.sql — os "armários" de arquivo (Storage do Supabase)
--
-- 1) hub.storage_balde_garante(): cria um balde e as regras de quem lê e quem
--    escreve nele. É a peça que cada módulo usa no SEU arquivo de baldes (cada
--    balde mora no módulo dono). Roda só na instalação, como dono do banco:
--    ninguém do site chama (fechada de public, anon e authenticated).
-- 2) os baldes da base:
--      avatars   PÚBLICO  — a foto de perfil de quem é do time (conta, OutPeople);
--      produtos  PÚBLICO  — capa, logo e material dos produtos do catálogo.
--
-- A regra da casa: FOTO, CAPA E LOGO = PÚBLICO (aparecem pelo link pra todo mundo
-- que abre a tela). ANEXO, CONTRATO, DOCUMENTO, MÍDIA DE CONVERSA E HISTÓRICO =
-- PRIVADO: a tela pede um link assinado de poucos minutos (createSignedUrl) ou uma
-- Edge Function entrega o arquivo — o endereço nunca fica aberto.
-- Público quer dizer só LER pelo link: subir, trocar e apagar é sempre de quem é
-- do time (hub.e_do_time()) ou da regra do módulo.
--
-- Banco sem Storage (Postgres fora do Supabase): pula, sem erro.
-- Rodar de novo não duplica nada (e um balde privado que tenha nascido público
-- volta a ser privado).
-- =============================================================================

CREATE OR REPLACE FUNCTION hub.storage_balde_garante(
  p_balde   text,
  p_publico boolean,
  p_le      text,                       -- quem LÊ/lista (expressão SQL), ex.: 'hub.e_do_time()'
  p_escreve text,                       -- quem SOBE, TROCA e APAGA (expressão SQL)
  p_limite  bigint  DEFAULT NULL,       -- bytes por arquivo (null = o padrão do projeto)
  p_tipos   text[]  DEFAULT NULL        -- tipos aceitos, ex.: '{image/*}' (null = qualquer)
) RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'hub', 'public'
AS $function$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;
  if p_balde !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'nome de balde inválido: %', p_balde;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (p_balde, p_balde, p_publico, p_limite, p_tipos)
  on conflict (id) do nothing;
  if not p_publico then   -- privado é privado: se nasceu aberto antes, fecha
    update storage.buckets set public = false where id = p_balde and public;
  end if;

  execute format('drop policy if exists %I on storage.objects', p_balde || ' le');
  execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and (%s))',
                 p_balde || ' le', p_balde, p_le);
  execute format('drop policy if exists %I on storage.objects', p_balde || ' sobe');
  execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (%s))',
                 p_balde || ' sobe', p_balde, p_escreve);
  execute format('drop policy if exists %I on storage.objects', p_balde || ' troca');
  execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (%s)) with check (bucket_id = %L and (%s))',
                 p_balde || ' troca', p_balde, p_escreve, p_balde, p_escreve);
  execute format('drop policy if exists %I on storage.objects', p_balde || ' apaga');
  execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (%s))',
                 p_balde || ' apaga', p_balde, p_escreve);
end $function$;
comment on function hub.storage_balde_garante(text, boolean, text, text, bigint, text[]) is
  'Instalação: cria o balde do Storage (se não existe) e as 4 regras dele em storage.objects (ler, subir, trocar, apagar). Só o dono do banco roda.';
revoke all on function hub.storage_balde_garante(text, boolean, text, text, bigint, text[]) from public, anon, authenticated;

-- ─── os baldes da base ──────────────────────────────────────────────────────
-- a foto de perfil (até 5 MB, só imagem)
select hub.storage_balde_garante('avatars', true, 'hub.e_do_time()', 'hub.e_do_time()',
                                 5242880, array['image/png','image/jpeg','image/webp','image/gif']);
-- (o balde 'produtos' é da peça "produtos": nasce no fim de 11-produtos-catalogo.sql)
