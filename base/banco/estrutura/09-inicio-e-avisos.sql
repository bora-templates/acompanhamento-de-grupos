-- =============================================================================
-- base — Início, central de avisos e ajustes
-- (outubro de 2026). Estrutura só: nenhum dado da empresa.
--
--   1. hub.notificacoes.adiada_ate     o "Depois" da central de avisos (/shared/os-avisos.js)
--      hub.email_outbox.html          o e-mail com desenho (HTML), além do texto
--   2. (pastas do assistente: foram pro módulo Assistente)
--   3. hub.app_painel()                ganha a coluna `celular` (qual aparelho a pessoa usa)
--   4. hub.pode_publicar_plano()       vale também pra quem está na ÁREA Sucesso do Cliente
--   5. (ferramenta de renovações do assistente: foi pro módulo Assistente)
--   6. Início                   hub.hub_logos (+ balde hub-logos), hub.consulta_rapida,
--                                      e o balde `banner` das notícias do Início
--   7. hub.avisar()                    fechada ao público (só gatilhos/funções definer e service_role)
--   8. hub.sistemas_instalados        o que está no banco (o instalador grava; refaz as ligações)
--
-- Rodar de novo não quebra nada (create or replace / if not exists / on conflict).
-- Toda função nasce fechada (revoke de public, anon e authenticated) e é liberada
-- nominalmente; toda tabela nova nasce com RLS e policy com o piso hub.e_do_time().
-- =============================================================================
SET check_function_bodies = false;

-- ── 1. o "Depois" da central de avisos ──────────────────────────────────────
-- O aviso sai da frente até a hora marcada (amanhã 9h) e volta sozinho.
-- Continua NÃO LIDO: aviso não some calado. O sino não conta o adiado.
alter table hub.notificacoes add column if not exists adiada_ate timestamptz;
comment on column hub.notificacoes.adiada_ate is
  'O "Depois" da central de avisos: até esta hora o aviso fica fora da frente e não conta no sino. Continua não lido.';

-- 1b. e-mail com desenho: a fila de e-mails (hub.email_outbox, da base) aceita
-- a versão em HTML; quem envia (email-envio) manda o HTML quando ele existe e o
-- texto vai junto. Mora aqui porque a tabela é da base: qualquer sistema grava.
alter table hub.email_outbox add column if not exists html text;

-- ── 2. (as pastas das conversas do assistente moram no módulo Assistente:
--        assistente/banco/estrutura/01-tabelas.sql e 02-funcoes.sql)

-- ── 3. app_painel(): qual celular a pessoa usa ──────────────────────────────
-- Mudar o formato da resposta exige drop + create, e isso RESETA o acesso da
-- função — por isso o revoke/grant vem de novo logo abaixo.
drop function if exists hub.app_painel();
create function hub.app_painel()
returns table (
  user_id uuid, nome text, email text, avatar_url text,
  convite_criado timestamptz, convite_vence timestamptz, convite_usado timestamptz, convite_cancelado timestamptz,
  instalou_em timestamptz, ultimo_app timestamptz, ultimo_navegador_celular timestamptz,
  dias_app_7 int, aparelhos_com_aviso int, ultimo_acesso timestamptz,
  celular text
)
language plpgsql stable security definer
set search_path to 'hub', 'public'
as $$
begin
  if not hub.app_sou_admin_usuarios() then
    raise exception 'Só a administração de usuários vê o uso do app.' using errcode = '42501';
  end if;
  return query
  select u.id, u.full_name, u.email, u.avatar_url,
         c.criado_em, c.vence_em, c.usado_em, c.cancelado_em,
         (select min(a.primeiro_em) from hub.app_uso a where a.user_id = u.id and a.onde = 'app'),
         (select max(a.ultimo_em)   from hub.app_uso a where a.user_id = u.id and a.onde = 'app'),
         (select max(a.ultimo_em)   from hub.app_uso a where a.user_id = u.id and a.onde = 'navegador'),
         (select count(distinct a.dia)::int from hub.app_uso a
           where a.user_id = u.id and a.onde = 'app' and a.dia > (now() at time zone 'America/Sao_Paulo')::date - 7),
         (select count(*)::int from hub.app_aparelhos d where d.user_id = u.id and d.desconectado_em is null),
         (select max(s.fim) from hub.os_sessao s where s.user_id = u.id),
         -- o app instalado manda; sem ele, o último jeito que a pessoa abriu ('iPhone · app', 'Android · navegador')
         (select a.rotulo from hub.app_uso a where a.user_id = u.id and a.rotulo is not null
           order by (a.onde = 'app') desc, a.ultimo_em desc limit 1)
    from hub.users u
    left join lateral (
      select * from hub.app_convites x where x.user_id = u.id order by x.criado_em desc limit 1
    ) c on true
   where u.active = true
   order by u.full_name;
end $$;
revoke execute on function hub.app_painel() from public, anon, authenticated;
grant  execute on function hub.app_painel() to authenticated;

-- ── 4. quem publica / edita plano: também toda a ÁREA Sucesso do Cliente ────
-- Antes valia só o CARGO; agora também quem está na área Sucesso do Cliente
-- (hub.areas), seja qual for o cargo.
create or replace function hub.pode_publicar_plano()
returns boolean language sql stable security definer set search_path to 'hub', 'public' as $$
  select exists (
    select 1 from hub.users u left join hub.roles r on r.id = u.role_id
     where u.id = auth.uid() and u.active
       and (r.name ilike 'customer success%' or r.name = 'Analista de Operações - Entrega' or r.name = 'Diretoria'
            or exists (select 1 from hub.areas a
                        where (lower(a.name) = 'sucesso do cliente' or a.slug = 'sucesso-do-cliente')
                          and a.id = any(u.area_ids))));
$$;
revoke execute on function hub.pode_publicar_plano() from public, anon;
grant  execute on function hub.pode_publicar_plano() to authenticated;

-- ── 5. (a ferramenta de renovações do assistente mora no módulo Assistente:
--        assistente/banco/estrutura/90-ligacoes.sql, só nasce com o Sucesso)

-- ── 6. INÍCIO DO HUB ────────────────────────────────────────────────────────
-- quem pode trocar logo e editar a Consulta rápida comum: admin ativo
create or replace function hub.inicio_pode_logo()
returns boolean language sql stable security definer set search_path = hub, public as $$
  select exists (select 1 from hub.users u
                  where u.id = auth.uid() and coalesce(u.active, false) and u.access_level = 'admin');
$$;

-- quem vê os dados RESTRITOS da Consulta rápida (os do sócio): o cadeado
-- `dados_socio` ou o da Diretoria, gravados em hub.users.acessos. Admin sozinho
-- NÃO basta — quem libera marca a chave na tela Usuários, pessoa por pessoa.
create or replace function hub.inicio_ve_dados_socio()
returns boolean language sql stable security definer set search_path = hub, public as $$
  select exists (select 1 from hub.users u
                  where u.id = auth.uid() and coalesce(u.active, false) and (
                        coalesce(u.acessos->>'dados_socio', '') in ('true', 'admin', 'view')
                     or coalesce(u.acessos->>'diretoria', '') in ('true', 'admin', 'view')));
$$;

-- 6a. a LOGO OFICIAL de cada sistema (o banco guarda o LINK; a imagem vai pro balde)
create table if not exists hub.hub_logos (
  chave          text primary key,          -- a chave do desenho na tela (ex.: 'journey', 'sign')
  url            text not null,
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now()
);
comment on table hub.hub_logos is 'A logo oficial de cada sistema no Início (o link do arquivo no balde hub-logos). Escrita só por hub.inicio_logo_salvar/remover.';
alter table hub.hub_logos enable row level security;
drop policy if exists hub_logos_le on hub.hub_logos;
create policy hub_logos_le on hub.hub_logos for select to authenticated using (hub.e_do_time());
-- escrita só pelas funções abaixo (nenhuma policy de escrita)

create or replace function hub.inicio_logo_salvar(p_chave text, p_url text)
returns void language plpgsql security definer set search_path = hub, public as $$
begin
  if not hub.inicio_pode_logo() then raise exception 'Só admin troca a logo dos sistemas.'; end if;
  if coalesce(btrim(p_chave), '') = '' or length(p_chave) > 40 then raise exception 'sistema inválido'; end if;
  if p_url is null or p_url not like 'http%' or p_url like 'data:%' then raise exception 'link da logo inválido'; end if;
  insert into hub.hub_logos (chave, url, atualizado_por, atualizado_em)
  values (p_chave, p_url, auth.uid(), now())
  on conflict (chave) do update set url = excluded.url, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end $$;

-- "Voltar ao desenho": tira a linha (o arquivo fica no balde)
create or replace function hub.inicio_logo_remover(p_chave text)
returns void language plpgsql security definer set search_path = hub, public as $$
begin
  if not hub.inicio_pode_logo() then raise exception 'Só admin troca a logo dos sistemas.'; end if;
  delete from hub.hub_logos where chave = p_chave;
end $$;

-- o balde das logos: público pra LER (a logo aparece pra todo mundo pelo link), escrita só admin
insert into storage.buckets (id, name, public)
values ('hub-logos', 'hub-logos', true)
on conflict (id) do nothing;
drop policy if exists hub_logos_obj_le on storage.objects;
create policy hub_logos_obj_le on storage.objects for select to authenticated
  using (bucket_id = 'hub-logos' and hub.e_do_time());
drop policy if exists hub_logos_obj_escreve on storage.objects;
create policy hub_logos_obj_escreve on storage.objects for all to authenticated
  using (bucket_id = 'hub-logos' and hub.inicio_pode_logo())
  with check (bucket_id = 'hub-logos' and hub.inicio_pode_logo());

-- 6b. o balde das notícias do banner do Início (o editor sobe a arte aqui).
-- Público pra LER (a arte aparece pelo link); escrita só de quem administra,
-- a mesma regra da tabela hub.banner_noticias (policy banner_write).
insert into storage.buckets (id, name, public)
values ('banner', 'banner', true)
on conflict (id) do nothing;
drop policy if exists banner_obj_le on storage.objects;
create policy banner_obj_le on storage.objects for select to authenticated
  using (bucket_id = 'banner' and hub.e_do_time());
drop policy if exists banner_obj_escreve on storage.objects;
create policy banner_obj_escreve on storage.objects for all to authenticated
  using (bucket_id = 'banner' and hub.current_access_level() = 'admin')
  with check (bucket_id = 'banner' and hub.current_access_level() = 'admin');

-- 6c. CONSULTA RÁPIDA: o que a empresa toda precisa de vez em quando (dados da
-- empresa, links úteis) — e um grupo RESTRITO (dados do sócio), que só quem tem
-- o cadeado vê. Quem tranca é a POLICY, não a tela. As linhas modelo (vazias, "a
-- preencher") estão em base/banco/dados-iniciais.sql.
create table if not exists hub.consulta_rapida (
  id             uuid primary key default gen_random_uuid(),
  grupo          text not null,
  grupo_ordem    int  not null default 0,
  rotulo         text not null,
  valor          text,                      -- vazio = "a preencher"
  link           text,                      -- quando é um endereço (documento, pasta)
  restrito       boolean not null default false,   -- dados do sócio
  ordem          int  not null default 0,
  fonte          text,                      -- de onde o valor veio (dito na tela)
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  unique (grupo, rotulo)
);
comment on table hub.consulta_rapida is 'Consulta rápida do Início: dados da empresa e links úteis; linha restrita só pra quem tem o cadeado dados_socio/diretoria.';
alter table hub.consulta_rapida enable row level security;
drop policy if exists consulta_rapida_le on hub.consulta_rapida;
create policy consulta_rapida_le on hub.consulta_rapida for select to authenticated
  using (hub.e_do_time() and (not restrito or hub.inicio_ve_dados_socio()));
-- escrita só pela função abaixo (nenhuma policy de escrita)

-- quem PODE editar uma linha: admin (linha comum) · o cadeado do sócio (linha restrita)
create or replace function hub.consulta_rapida_salvar(p_id uuid, p_valor text)
returns void language plpgsql security definer set search_path = hub, public as $$
declare v_restrito boolean;
begin
  if auth.uid() is null or not hub.e_do_time() then raise exception 'sem acesso'; end if;
  select restrito into v_restrito from hub.consulta_rapida where id = p_id;
  if not found then raise exception 'linha não encontrada'; end if;
  if v_restrito and not hub.inicio_ve_dados_socio() then raise exception 'Esses dados são só de quem tem o acesso.'; end if;
  if not v_restrito and not hub.inicio_pode_logo() then raise exception 'Só admin edita a Consulta rápida.'; end if;
  update hub.consulta_rapida
     set valor = nullif(btrim(coalesce(p_valor, '')), ''), fonte = 'editado no Início',
         atualizado_por = auth.uid(), atualizado_em = now()
   where id = p_id;
end $$;

revoke execute on function hub.inicio_pode_logo()                 from public, anon, authenticated;
revoke execute on function hub.inicio_ve_dados_socio()            from public, anon, authenticated;
revoke execute on function hub.inicio_logo_salvar(text, text)     from public, anon, authenticated;
revoke execute on function hub.inicio_logo_remover(text)          from public, anon, authenticated;
revoke execute on function hub.consulta_rapida_salvar(uuid, text) from public, anon, authenticated;
grant execute on function hub.inicio_pode_logo()                  to authenticated;
grant execute on function hub.inicio_ve_dados_socio()             to authenticated;
grant execute on function hub.inicio_logo_salvar(text, text)      to authenticated;
grant execute on function hub.inicio_logo_remover(text)           to authenticated;
grant execute on function hub.consulta_rapida_salvar(uuid, text)  to authenticated;

-- ── 7. hub.avisar fechada ───────────────────────────────────────────────────
-- Ela grava aviso na caixa de QUALQUER pessoa e nascia aberta ao PUBLIC (o anon
-- herda): com a chave publicável qualquer um mandava aviso falso pra todo mundo.
-- Quem chama hoje são só gatilhos e funções `security definer` (rodam como o
-- dono e não precisam de grant) — conferido no banco instalado com todos os
-- sistemas: nenhuma função comum, tela ou Edge Function chama direto. Fica o
-- grant pra service_role (robô/Edge Function que a empresa criar).
revoke execute on function hub.avisar(uuid, text, text, text, text, text, text, date) from public, anon, authenticated;
grant  execute on function hub.avisar(uuid, text, text, text, text, text, text, date) to service_role;

-- ── 8. o que está instalado neste banco ────────────────────────────────────
-- O tools/instalar/instalar-banco.sh grava aqui cada sistema que instala; é por esta
-- lista que ele refaz, no fim de toda instalação (inclusive na compra em
-- etapas), as ligações de TODOS os sistemas do banco. Só leitura pro time.
create table if not exists hub.sistemas_instalados (
  sistema      text primary key,
  instalado_em timestamptz not null default now(),
  versao       text
);
alter table hub.sistemas_instalados add column if not exists versao text;
comment on table hub.sistemas_instalados is 'Sistemas instalados neste banco (gravado pelo tools/instalar/instalar-banco.sh): os módulos pelo id, a base como ''base'' e cada peça da base como ''base.<peça>'', com a versão. Usado pra refazer as ligações e pra atualizar a base.';
alter table hub.sistemas_instalados enable row level security;
drop policy if exists sistemas_instalados_le on hub.sistemas_instalados;
create policy sistemas_instalados_le on hub.sistemas_instalados for select to authenticated using (hub.e_do_time());
revoke all on hub.sistemas_instalados from public, anon, authenticated;
grant select on hub.sistemas_instalados to authenticated;
grant all on hub.sistemas_instalados to service_role;
