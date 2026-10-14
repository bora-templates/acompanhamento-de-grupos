-- =============================================================================
-- base — PRIMEIRO ACESSO DE ADMINISTRADOR (sem convite pelo painel do Supabase)
--
-- Quem instala abre o site, vai pra /primeiro-acesso/, digita a CHAVE DE
-- INSTALAÇÃO (o segredo PRIMEIRO_ACESSO_CHAVE da Edge Function primeiro-acesso),
-- o nome da empresa, o nome, o e-mail e a senha — e o primeiro administrador
-- nasce. Depois que existe um admin ativo, a porta se fecha pra sempre.
--
-- Quem escreve aqui é SÓ a Edge Function `primeiro-acesso` (chave de serviço):
-- todas as funções abaixo são revogadas de public, anon e authenticated.
--
--   hub.primeiro_acesso_disponivel()         ainda não existe admin ativo?
--   hub.primeiro_acesso_tentativas           registro append-only das tentativas (ip, hora, deu certo?)
--   hub.primeiro_acesso_bloqueado(ip)        10 erros/hora no mesmo ip (ou 50 no total) = bloqueado
--   hub.primeiro_acesso_registrar(ip, ok)    grava uma tentativa
--   hub.primeiro_acesso_concluir(uid, nome, empresa)
--        com trava (advisory lock): RECUSA se já existe admin; cria/renomeia a
--        empresa (hub.tenants), tira o login de hub.logins_fora_do_time e cria a
--        ficha em hub.users como admin ativo, acessos '{}'. Também põe as linhas
--        modelo da Consulta rápida do Início (hub.consulta_rapida_modelo()).
-- =============================================================================
SET check_function_bodies = false;

-- ── ainda dá pra criar o primeiro admin? ────────────────────────────────────
create or replace function hub.primeiro_acesso_disponivel()
returns boolean language sql stable security definer set search_path = hub, public as $$
  select not exists (select 1 from hub.users u where u.active and u.access_level = 'admin');
$$;

-- ── as tentativas (append-only: só se insere; ninguém edita nem apaga) ──────
create table if not exists hub.primeiro_acesso_tentativas (
  id    bigint generated always as identity primary key,
  ip    text not null,
  ok    boolean not null,
  quando timestamptz not null default now()
);
create index if not exists primeiro_acesso_tentativas_ip_idx on hub.primeiro_acesso_tentativas (ip, quando desc);
comment on table hub.primeiro_acesso_tentativas is
  'Tentativas do primeiro acesso de administrador (ip, hora, se deu certo). Só a Edge Function primeiro-acesso grava; append-only.';
alter table hub.primeiro_acesso_tentativas enable row level security;
drop policy if exists primeiro_acesso_tentativas_admin on hub.primeiro_acesso_tentativas;
create policy primeiro_acesso_tentativas_admin on hub.primeiro_acesso_tentativas for select to authenticated
  using (hub.e_do_time() and hub.current_access_level() = 'admin');
revoke all on hub.primeiro_acesso_tentativas from public, anon, authenticated, service_role;
grant select on hub.primeiro_acesso_tentativas to authenticated;
grant select, insert on hub.primeiro_acesso_tentativas to service_role;

create or replace function hub.primeiro_acesso_bloqueado(p_ip text)
returns boolean language sql stable security definer set search_path = hub, public as $$
  select (select count(*) from hub.primeiro_acesso_tentativas
           where ip = coalesce(p_ip, '?') and not ok and quando > now() - interval '1 hour') >= 10
      or (select count(*) from hub.primeiro_acesso_tentativas
           where not ok and quando > now() - interval '1 hour') >= 50;
$$;

create or replace function hub.primeiro_acesso_registrar(p_ip text, p_ok boolean)
returns void language sql security definer set search_path = hub, public as $$
  insert into hub.primeiro_acesso_tentativas (ip, ok) values (left(coalesce(p_ip, '?'), 80), coalesce(p_ok, false));
$$;

-- ── as linhas modelo da Consulta rápida do Início (vazias, "a preencher") ───
-- Um lugar só: o primeiro acesso chama, e quem quiser roda de novo (não duplica).
create or replace function hub.consulta_rapida_modelo()
returns void language sql security definer set search_path = hub, public as $$
  insert into hub.consulta_rapida (grupo, grupo_ordem, rotulo, restrito, ordem) values
    ('Dados da empresa', 1, 'Razão social',         false, 1),
    ('Dados da empresa', 1, 'Nome fantasia',        false, 2),
    ('Dados da empresa', 1, 'CNPJ',                 false, 3),
    ('Dados da empresa', 1, 'Endereço fiscal',      false, 4),
    ('Dados da empresa', 1, 'E-mail do financeiro', false, 5),
    ('Dados da empresa', 1, 'Dados bancários',      false, 6),
    ('Dados do sócio',   2, 'CPF',                  true,  1),
    ('Dados do sócio',   2, 'RG',                   true,  2),
    ('Dados do sócio',   2, 'Nascimento',           true,  3),
    ('Dados do sócio',   2, 'Endereço',             true,  4)
  on conflict (grupo, rotulo) do nothing;
$$;

-- ── cria o primeiro administrador (o login já foi criado pela Edge Function) ─
create or replace function hub.primeiro_acesso_concluir(p_uid uuid, p_nome text, p_empresa text)
returns void language plpgsql security definer set search_path = hub, public as $$
declare
  v_nome    text := btrim(coalesce(p_nome, ''));
  v_empresa text := btrim(coalesce(p_empresa, ''));
  v_email   text;
  v_tenant  uuid;
  v_slug    text;
begin
  -- dois pedidos ao mesmo tempo: um espera o outro terminar (e aí vê que já tem admin)
  perform pg_advisory_xact_lock(hashtext('hub.primeiro_acesso'));
  if not hub.primeiro_acesso_disponivel() then
    raise exception 'Este sistema já tem administrador.' using errcode = 'P0001';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then raise exception 'Nome inválido.'; end if;
  if length(v_empresa) < 2 or length(v_empresa) > 120 then raise exception 'Nome da empresa inválido.'; end if;
  select email into v_email from auth.users where id = p_uid;
  if v_email is null then raise exception 'Login não encontrado.'; end if;

  -- a empresa desta instalação (a primeira cadastrada é "a empresa")
  v_slug := nullif(trim(both '-' from regexp_replace(lower(v_empresa), '[^a-z0-9]+', '-', 'g')), '');
  select id into v_tenant from hub.tenants order by created_at limit 1;
  if v_tenant is null then
    insert into hub.tenants (slug, name) values (coalesce(v_slug, 'empresa'), v_empresa) returning id into v_tenant;
  else
    update hub.tenants set name = v_empresa where id = v_tenant;
  end if;

  -- o login nasceu fora do time (não foi convite): agora ele É do time
  delete from hub.logins_fora_do_time where auth_id = p_uid;

  insert into hub.users (id, tenant_id, full_name, email, access_level, active, acessos)
  values (p_uid, v_tenant, v_nome, v_email, 'admin', true, '{}'::jsonb)
  on conflict (id) do update
     set tenant_id = excluded.tenant_id, full_name = excluded.full_name, email = excluded.email,
         access_level = 'admin', active = true, acessos = '{}'::jsonb;

  perform hub.consulta_rapida_modelo();
end $$;

revoke execute on function hub.primeiro_acesso_disponivel()                 from public, anon, authenticated;
revoke execute on function hub.primeiro_acesso_bloqueado(text)              from public, anon, authenticated;
revoke execute on function hub.primeiro_acesso_registrar(text, boolean)     from public, anon, authenticated;
revoke execute on function hub.consulta_rapida_modelo()                     from public, anon, authenticated;
revoke execute on function hub.primeiro_acesso_concluir(uuid, text, text)   from public, anon, authenticated;
grant execute on function hub.primeiro_acesso_disponivel()                  to service_role;
grant execute on function hub.primeiro_acesso_bloqueado(text)               to service_role;
grant execute on function hub.primeiro_acesso_registrar(text, boolean)      to service_role;
grant execute on function hub.consulta_rapida_modelo()                      to service_role;
grant execute on function hub.primeiro_acesso_concluir(uuid, text, text)    to service_role;

-- ── O ENDEREÇO DO SITE (os links que saem nos e-mails e avisos) ─────────────
-- Toda função do banco que monta um link pra pessoa abrir (convite do portal,
-- assinatura do OutSign, aviso com "abrir no sistema"…) pergunta o endereço a
-- hub.site_url(), nunca escreve o domínio. Quem grava é a Edge Function
-- primeiro-acesso: o endereço de onde o primeiro administrador foi criado
-- (o cabeçalho Origin). Pra trocar depois (domínio novo):
--   update hub.tenants set site_url = 'https://app.suaempresa.com.br';
-- Sem nada gravado, vale o exemplo 'https://app.seudominio.com.br' (troque!).
alter table hub.tenants add column if not exists site_url text;
comment on column hub.tenants.site_url is 'Endereço do site (https://…, sem barra no fim): base dos links que o banco manda por e-mail e aviso. Gravado no primeiro acesso.';

create or replace function hub.site_url()
returns text language sql stable security definer set search_path = hub, public as $$
  select rtrim(coalesce(
    (select nullif(btrim(t.site_url), '') from hub.tenants t order by t.created_at limit 1),
    'https://app.seudominio.com.br'), '/');
$$;
-- o endereço do site é público (é o que está na barra do navegador); anon executa porque
-- funções de porta pública (assinar, portal) montam link com ele
revoke all on function hub.site_url() from public;
grant execute on function hub.site_url() to anon, authenticated, service_role;

-- quem grava: só a Edge Function primeiro-acesso (chave de serviço), logo depois de criar o admin
create or replace function hub.primeiro_acesso_site(p_site text)
returns void language plpgsql security definer set search_path = hub, public as $$
begin
  if p_site is null or p_site !~ '^https?://[a-zA-Z0-9.:\[\]-]+$' then return; end if;
  update hub.tenants set site_url = p_site
   where id = (select id from hub.tenants order by created_at limit 1)
     and coalesce(btrim(site_url), '') = '';
end $$;
revoke all on function hub.primeiro_acesso_site(text) from public, anon, authenticated;
grant execute on function hub.primeiro_acesso_site(text) to service_role;
