-- ligação com outjourney: só nasce quando outjourney também estiver instalado
DO $do$ BEGIN
  IF to_regclass('hub.ag_conhecimento') IS NOT NULL AND to_regclass('hub.oj_produtos') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ag_conhecimento_produto_id_fkey' AND conrelid = to_regclass('hub.ag_conhecimento')) THEN
    EXECUTE $liga$ALTER TABLE ONLY hub.ag_conhecimento
    ADD CONSTRAINT ag_conhecimento_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES hub.oj_produtos(id) ON DELETE SET NULL$liga$;
  END IF;
END $do$;

-- =============================================================================
-- CADASTRO: quem é CONVIDADO pelo sistema (ou pelo painel do Supabase) ganha a
-- ficha em hub.users. O gatilho mora em auth.users, fora do schema hub.
-- =============================================================================

-- TRIGGER: auth.users on_auth_user_created
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION hub.handle_new_auth_user();
  END IF;
END $do$;

-- O Supabase NÃO preenche invited_at no INSERT: ele cria o login e só depois
-- (alguns milissegundos) faz um UPDATE carimbando o convite. O gatilho acima,
-- que só olha o INSERT, vê invited_at nulo e manda a pessoa pra
-- hub.logins_fora_do_time. Este segundo gatilho age no instante em que o
-- convite fica provado (invited_at sai de nulo) e cria a ficha.
CREATE OR REPLACE FUNCTION hub.handle_auth_user_invited() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
    v_tenant_id uuid;
    v_full_name text;
begin
    delete from hub.logins_fora_do_time where auth_id = new.id;

    -- a empresa desta instalação
    select id into v_tenant_id from hub.tenants order by created_at limit 1;

    v_full_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    );

    insert into hub.users (id, tenant_id, role_id, full_name, email, access_level, active)
    values (new.id, v_tenant_id, null, v_full_name, new.email, 'collaborator', true)
    on conflict (id) do update
        set email     = excluded.email,
            full_name = coalesce(excluded.full_name, hub.users.full_name);
    return new;
end;
$$;

-- Só o gatilho chama: sem isto, qualquer visitante chamaria pela API.
REVOKE EXECUTE ON FUNCTION hub.handle_auth_user_invited() FROM public, anon, authenticated;

-- TRIGGER: auth.users on_auth_user_invited
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_invited' AND tgrelid = 'auth.users'::regclass) THEN
    CREATE TRIGGER on_auth_user_invited AFTER UPDATE OF invited_at ON auth.users
      FOR EACH ROW WHEN (old.invited_at IS NULL AND new.invited_at IS NOT NULL)
      EXECUTE FUNCTION hub.handle_auth_user_invited();
  END IF;
END $do$;
