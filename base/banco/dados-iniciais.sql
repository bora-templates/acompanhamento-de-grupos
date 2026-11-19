-- =============================================================================
-- base — dados iniciais de uma instalação nova.
--
-- NÃO PRECISA MAIS RODAR NADA AQUI pra começar: a EMPRESA e o PRIMEIRO
-- ADMINISTRADOR nascem pelo PRIMEIRO ACESSO — abra o site, ele leva sozinho pra
-- /primeiro-acesso/, e lá você digita a chave de instalação (o segredo
-- PRIMEIRO_ACESSO_CHAVE da Edge Function primeiro-acesso), o nome da empresa,
-- o seu nome, o e-mail e a senha. Depois que existe um administrador, essa tela
-- se fecha pra sempre. As próximas pessoas são convidadas na Gestão de Usuários
-- (/usuarios/).
--
-- O que sobra aqui é opcional e pode rodar quantas vezes quiser (não duplica):
-- =============================================================================

-- As linhas modelo (vazias, "a preencher") da Consulta rápida do Início. O
-- primeiro acesso já põe; rode de novo se tiver apagado e quiser de volta.
select hub.consulta_rapida_modelo();

-- -----------------------------------------------------------------------------
-- (OPCIONAL) ÁREAS E CARGOS DE PARTIDA — a estrutura típica que os sistemas já
-- reconhecem pelo SLUG (o Metas monta uma aba por área, o CRM
-- acha as cadeiras de venda pelo cargo, o Início acha o Sucesso do Cliente).
-- Só entra se a empresa ainda NÃO tem nenhuma área cadastrada: rodar de novo
-- (ou rodar depois de já ter criado as suas) não muda nada. Renomeie à vontade
-- (o que os sistemas usam é o slug), apague o que não usa e acrescente o resto
-- na tela Configuração do Metas ou em /usuarios/.
-- Nenhuma pessoa e nenhum dado de empresa: só nomes de área e de cargo comuns.
-- -----------------------------------------------------------------------------
do $partida$
declare
  v_tenant uuid;
begin
  select id into v_tenant from hub.tenants order by created_at limit 1;
  if v_tenant is null then
    raise notice 'Ainda não há empresa (faça o primeiro acesso antes). Áreas de partida não entraram.';
    return;
  end if;
  if exists (select 1 from hub.areas where tenant_id = v_tenant) then
    raise notice 'A empresa já tem áreas cadastradas. Áreas de partida não entraram.';
    return;
  end if;

  insert into hub.areas (tenant_id, slug, name, order_index) values
    (v_tenant, 'comercial',          'Comercial',          1),
    (v_tenant, 'mkt',                'Marketing',          2),
    (v_tenant, 'sucesso-do-cliente', 'Sucesso do Cliente', 3),
    (v_tenant, 'eventos',            'Eventos',            4),
    (v_tenant, 'rh',                 'RH',                 5),
    (v_tenant, 'financeiro',         'Financeiro',         6),
    (v_tenant, 'cobranca',           'Cobrança',           7),
    (v_tenant, 'gp',                 'Gestão de Projetos', 8),
    (v_tenant, 'diretoria',          'Diretoria',          9);

  insert into hub.roles (tenant_id, area_id, slug, name, cadence, order_index)
  select v_tenant, a.id, c.slug, c.nome, c.cad, c.ord
    from (values
      ('comercial',          'sdr',                 'SDR',                       'diaria',  1),
      ('comercial',          'social-seller',       'Social Seller',             'diaria',  2),
      ('comercial',          'inside-sales',        'Inside Sales',              'diaria',  3),
      ('comercial',          'closer',              'Closer',                    'diaria',  4),
      ('comercial',          'farmer',              'Farmer',                    'diaria',  5),
      ('comercial',          'head-comercial',      'Gestor(a) Comercial',       'diaria',  6),
      ('mkt',                'analista-trafego',    'Analista de Tráfego',       'diaria',  7),
      ('mkt',                'analista-social-media','Analista de Social Media', 'diaria',  8),
      ('sucesso-do-cliente', 'cs-nivel-1',          'Customer Success',          'semanal', 9),
      ('eventos',            'coordenador-eventos', 'Coordenador(a) de Eventos', 'mensal', 10),
      ('rh',                 'analista-rh',         'Analista de RH',            'mensal', 11),
      ('financeiro',         'analista-financeiro', 'Analista Financeiro',       'mensal', 12),
      ('cobranca',           'assistente-cobranca', 'Assistente de Cobrança',    'mensal', 13),
      ('gp',                 'gerente-projetos',    'Gerente de Projetos',       'mensal', 14),
      ('diretoria',          'diretoria',           'Diretoria',                 'mensal', 15)
    ) as c(area, slug, nome, cad, ord)
    join hub.areas a on a.tenant_id = v_tenant and a.slug = c.area
  on conflict (tenant_id, slug) do nothing;
end
$partida$;
