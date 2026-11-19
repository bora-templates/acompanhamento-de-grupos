-- =============================================================================
-- grupos · 03 · funções das telas (papel authenticated)
-- -----------------------------------------------------------------------------
-- As telas não leem tabela direto: chamam estas funções. Todas são security definer,
-- conferem o acesso por dentro (hub.gr_exige) e devolvem erro claro em português.
--   ver          gr_painel, gr_grupo, gr_mensagens, gr_autores, gr_resumos, gr_resumo,
--                gr_atividade_por_hora, gr_perguntas (só as minhas), gr_participantes, gr_materiais
--   administrar  gr_grupo_salvar (pausar exige configurar), gr_resumo_texto_salvar,
--                gr_material_salvar, gr_material_apagar, gr_exemplo_carregar, gr_exemplo_apagar
--   configurar   gr_grupo_remover
-- =============================================================================

-- Colada sozinha no painel do Supabase (cada colagem é uma sessão nova), esta parte precisa
-- da mesma linha do preparo: sem ela, uma função em SQL que chama outra de uma parte seguinte
-- não seria criada.
SET check_function_bodies = false;

-- ── leitura ─────────────────────────────────────────────────────────────────

-- o painel da primeira tela: o que a pessoa pode, os ajustes (sem segredo) e os grupos
create or replace function hub.gr_painel()
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v_hoje timestamptz := hub.gr_inicio_de_hoje();
begin
  perform hub.gr_exige('ver');
  return jsonb_build_object(
    'pode_administrar', hub.gr_pode_administrar(),
    'pode_configurar',  hub.gr_pode_configurar(),
    'ajustes',          hub.gr_ajustes_json(hub.gr_pode_configurar()),
    'grupos', coalesce((
      select jsonb_agg(x.item order by x.ativo desc, x.ultima desc nulls last, lower(x.nome))
        from (
          select g.ativo, g.ultima_mensagem_em as ultima, g.nome,
                 jsonb_build_object(
                   'id', g.id, 'nome', g.nome, 'jid', g.jid, 'pessoas', g.pessoas,
                   'ativo', g.ativo, 'exemplo', g.exemplo,
                   'ultima_mensagem_em', g.ultima_mensagem_em,
                   'mensagens_hoje', (select count(*) from hub.gr_mensagens m
                                       where m.grupo_id = g.id and m.momento >= v_hoje),
                   'resumo_auto', g.resumo_auto, 'resumo_hora', g.resumo_hora, 'resumo_envia', g.resumo_envia,
                   'ultimo_resumo_em', r.criado_em,
                   'pendencias_ultimo_resumo',
                     case when r.id is null then null
                          when jsonb_typeof(r.conteudo -> 'pendencias') = 'array' then jsonb_array_length(r.conteudo -> 'pendencias')
                          else 0 end,
                   'importando', hub.gr_importando(g.importado_em, coalesce(g.importacao_inicio, g.criado_em)),
                   'importadas', g.importadas, 'importacao_erro', g.importacao_erro) as item
            from hub.gr_grupos g
            left join lateral (
              select r0.id, r0.criado_em, r0.conteudo
                from hub.gr_resumos r0
               where r0.grupo_id = g.id
               order by r0.criado_em desc
               limit 1) r on true
        ) x), '[]'::jsonb));
end $$;

-- o grupo inteiro, com os totais
create or replace function hub.gr_grupo(p_grupo uuid)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v jsonb;
begin
  perform hub.gr_exige('ver');
  v := hub.gr_grupo_json(p_grupo);
  if v is null then
    raise exception 'Este grupo não existe mais. Ele pode ter sido removido, então volte para a lista de grupos.';
  end if;
  return v;
end $$;

-- Devolve a conversa da mais nova para a mais antiga, com busca por palavra e filtro por pessoa.
-- A página anda por (momento, id): a tela manda o momento e o id da mais antiga que já mostra
-- (p_antes e p_antes_id), e mensagens com o mesmo momento não se perdem nem se repetem. Só
-- com p_antes (sem o id), valem as mensagens de antes daquele momento.
drop function if exists hub.gr_mensagens(uuid, timestamptz, text, text, int);
create or replace function hub.gr_mensagens(p_grupo uuid, p_antes timestamptz default null, p_busca text default null,
                                            p_autor text default null, p_limite int default 50, p_antes_id bigint default null)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v_busca  text := nullif(btrim(coalesce(p_busca, '')), '');
  v_autor  text := nullif(btrim(coalesce(p_autor, '')), '');
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_q      tsquery;
begin
  perform hub.gr_exige('ver');
  if v_busca is not null then
    v_q := websearch_to_tsquery('portuguese', left(v_busca, 200));
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'whatsapp_id', m.whatsapp_id, 'autor_nome', m.autor_nome, 'autor_jid', m.autor_jid,
             'do_time', m.do_time, 'tipo', m.tipo, 'texto', m.texto, 'arquivo_nome', m.arquivo_nome,
             'transcricao', m.transcricao, 'momento', m.momento,
             'citada', (select jsonb_build_object('autor_nome', c.autor_nome, 'texto', left(c.texto, 300))
                          from hub.gr_mensagens c
                         where m.citada_id is not null and c.grupo_id = m.grupo_id and c.whatsapp_id = m.citada_id
                         limit 1))
           order by m.momento desc, m.id desc)
      from (
        select m0.*
          from hub.gr_mensagens m0
         where m0.grupo_id = p_grupo
           and (p_antes is null
                or (p_antes_id is null and m0.momento < p_antes)
                or (p_antes_id is not null and (m0.momento, m0.id) < (p_antes, p_antes_id)))
           and (v_q is null or m0.busca @@ v_q)
           and (v_autor is null or coalesce(m0.autor_jid, m0.autor_nome) = v_autor)
         order by m0.momento desc, m0.id desc
         limit v_limite) m), '[]'::jsonb);
end $$;

-- quem escreveu no grupo (para o filtro por pessoa): o autor_jid daqui é o que o filtro recebe
create or replace function hub.gr_autores(p_grupo uuid)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  return coalesce((
    select jsonb_agg(jsonb_build_object('autor_jid', t.chave, 'autor_nome', coalesce(t.nome, t.chave), 'mensagens', t.n)
                     order by t.n desc, lower(coalesce(t.nome, t.chave)))
      from (
        select coalesce(m.autor_jid, m.autor_nome) as chave,
               (array_agg(m.autor_nome order by m.momento desc) filter (where m.autor_nome is not null))[1] as nome,
               count(*)::int as n
          from hub.gr_mensagens m
         where m.grupo_id = p_grupo
         group by 1) t
     where t.chave is not null), '[]'::jsonb);
end $$;

-- os resumos do grupo, do mais novo para o mais antigo (só o panorama de cada um)
create or replace function hub.gr_resumos(p_grupo uuid, p_limite int default 20)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'periodo', r.periodo, 'inicio', r.inicio, 'fim', r.fim, 'origem', r.origem,
             'criado_em', r.criado_em, 'enviado_em', r.enviado_em, 'panorama', r.conteudo ->> 'panorama')
           order by r.criado_em desc)
      from (
        select r0.*
          from hub.gr_resumos r0
         where r0.grupo_id = p_grupo
         order by r0.criado_em desc
         limit least(greatest(coalesce(p_limite, 20), 1), 100)) r), '[]'::jsonb);
end $$;

-- um resumo inteiro (a linha da tabela, mais o nome do grupo)
create or replace function hub.gr_resumo(p_resumo uuid)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
declare
  v jsonb;
begin
  perform hub.gr_exige('ver');
  select to_jsonb(r) || jsonb_build_object('grupo_nome', g.nome, 'grupo_exemplo', g.exemplo)
    into v
    from hub.gr_resumos r
    join hub.gr_grupos g on g.id = r.grupo_id
   where r.id = p_resumo;
  if v is null then
    raise exception 'Este resumo não existe mais. Ele pode ter sido apagado junto com o grupo.';
  end if;
  return v;
end $$;

-- quantas mensagens o grupo teve em cada hora do dia, no horário de Brasília, entre p_inicio
-- (incluído) e p_fim (fora): uma lista de 24 números, da hora 0 à hora 23. A aba Resumos
-- desenha o gráfico do período do resumo aberto com ela. O intervalo vai até 32 dias.
create or replace function hub.gr_atividade_por_hora(p_grupo uuid, p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  if p_inicio is null or p_fim is null then
    raise exception 'Escolha o começo e o fim do período.';
  end if;
  if p_fim <= p_inicio then
    raise exception 'O fim do período precisa ser depois do começo.';
  end if;
  if p_fim - p_inicio > interval '32 days' then
    raise exception 'Escolha um período de no máximo 31 dias.';
  end if;
  return (
    select jsonb_agg(coalesce(c.n, 0) order by h.hora)
      from generate_series(0, 23) as h(hora)
      left join (
        select extract(hour from m.momento at time zone 'America/Sao_Paulo')::int as hora, count(*)::int as n
          from hub.gr_mensagens m
         where m.grupo_id = p_grupo and m.momento >= p_inicio and m.momento < p_fim
         group by 1) c on c.hora = h.hora);
end $$;

-- as MINHAS perguntas à IA sobre o grupo, da mais nova para a mais antiga
create or replace function hub.gr_perguntas(p_grupo uuid, p_limite int default 30)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id, 'pergunta', q.pergunta, 'resposta', q.resposta, 'periodo', q.periodo,
             'inicio', q.inicio, 'fim', q.fim, 'modelo', q.modelo, 'criado_em', q.criado_em)
           order by q.criado_em desc, q.id desc)
      from (
        select q0.*
          from hub.gr_perguntas q0
         where q0.grupo_id = p_grupo and q0.user_id = auth.uid() and q0.resposta <> ''
         order by q0.criado_em desc, q0.id desc
         limit least(greatest(coalesce(p_limite, 30), 1), 100)) q), '[]'::jsonb);
end $$;

-- os participantes, administradores primeiro
create or replace function hub.gr_participantes(p_grupo uuid)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  return hub.gr_participantes_json(p_grupo);
end $$;

-- os materiais de apoio do grupo (sem o texto inteiro: o trecho tem os primeiros 200 caracteres)
create or replace function hub.gr_materiais(p_grupo uuid)
returns jsonb
language plpgsql stable security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('ver');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'titulo', t.titulo, 'arquivo_nome', t.arquivo_nome, 'caracteres', length(t.texto),
             'criado_em', t.criado_em, 'trecho', left(t.texto, 200))
           order by t.criado_em desc)
      from hub.gr_materiais t
     where t.grupo_id = p_grupo), '[]'::jsonb);
end $$;

-- ── escrita ─────────────────────────────────────────────────────────────────

-- muda orientações, pausa ou retomada e o resumo automático. Aceita só estas chaves e
-- ignora o resto. Pausar ou retomar (ativo) é de quem configura a solução.
-- Ao ligar o resumo automático ou mudar a hora dele, se a hora de hoje já passou, o primeiro
-- sai amanhã (ultimo_auto_em fica com agora). Devolve o grupo com proximo_auto, para a tela
-- dizer quando sai o próximo.
create or replace function hub.gr_grupo_salvar(p_grupo uuid, p_dados jsonb)
returns jsonb
language plpgsql security definer
set search_path = hub, public
as $$
declare
  g hub.gr_grupos;
  v_dados       jsonb := case when jsonb_typeof(p_dados) = 'object' then p_dados else '{}'::jsonb end;
  v_orientacoes text;
  v_ativo       boolean;
  v_auto        boolean;
  v_hora        int;
  v_envia       boolean;
  v_ultimo      timestamptz;
  v_tentativas  smallint;
begin
  perform hub.gr_exige('administrar');
  select * into g from hub.gr_grupos where id = p_grupo for update;
  if not found then
    raise exception 'Este grupo não existe mais. Ele pode ter sido removido, então volte para a lista de grupos.';
  end if;
  v_orientacoes := g.orientacoes;
  v_ativo := g.ativo;
  v_auto  := g.resumo_auto;
  v_hora  := g.resumo_hora;
  v_envia := g.resumo_envia;

  if v_dados ? 'orientacoes' then
    if jsonb_typeof(v_dados -> 'orientacoes') not in ('string', 'null') then
      raise exception 'As orientações precisam ser um texto.';
    end if;
    v_orientacoes := nullif(btrim(coalesce(v_dados ->> 'orientacoes', '')), '');
    if length(coalesce(v_orientacoes, '')) > 4000 then
      raise exception 'As orientações podem ter até 4.000 caracteres. Encurte o texto e salve de novo.';
    end if;
  end if;

  if v_dados ? 'ativo' then
    if jsonb_typeof(v_dados -> 'ativo') <> 'boolean' then
      raise exception 'O campo ativo precisa ser verdadeiro ou falso.';
    end if;
    if (v_dados ->> 'ativo')::boolean <> g.ativo then
      perform hub.gr_exige('configurar');
      v_ativo := (v_dados ->> 'ativo')::boolean;
    end if;
  end if;

  if v_dados ? 'resumo_auto' then
    if jsonb_typeof(v_dados -> 'resumo_auto') <> 'boolean' then
      raise exception 'O campo resumo_auto precisa ser verdadeiro ou falso.';
    end if;
    v_auto := (v_dados ->> 'resumo_auto')::boolean;
  end if;

  if v_dados ? 'resumo_hora' then
    begin
      v_hora := (v_dados ->> 'resumo_hora')::int;
    exception when others then
      v_hora := null;
    end;
    if v_hora is null or v_hora not between 0 and 23 then
      raise exception 'A hora do resumo automático precisa ser um número inteiro de 0 a 23.';
    end if;
  end if;

  if v_dados ? 'resumo_envia' then
    if jsonb_typeof(v_dados -> 'resumo_envia') <> 'boolean' then
      raise exception 'O campo resumo_envia precisa ser verdadeiro ou falso.';
    end if;
    v_envia := (v_dados ->> 'resumo_envia')::boolean;
  end if;

  v_ultimo := g.ultimo_auto_em;
  v_tentativas := g.auto_tentativas;
  if v_auto and (not g.resumo_auto or v_hora is distinct from g.resumo_hora) then
    v_tentativas := 0;
    if extract(hour from now() at time zone 'America/Sao_Paulo')::int >= v_hora then
      v_ultimo := now();
    end if;
  end if;

  update hub.gr_grupos
     set orientacoes = v_orientacoes, ativo = v_ativo, resumo_auto = v_auto,
         resumo_hora = v_hora, resumo_envia = v_envia, ultimo_auto_em = v_ultimo,
         auto_tentativas = v_tentativas, atualizado_em = now()
   where id = p_grupo;
  return hub.gr_grupo_json(p_grupo);
end $$;

-- deixa de acompanhar: apaga o grupo e tudo dele (mensagens, resumos, materiais, perguntas)
create or replace function hub.gr_grupo_remover(p_grupo uuid)
returns void
language plpgsql security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('configurar');
  delete from hub.gr_grupos where id = p_grupo;
  if not found then
    raise exception 'Este grupo não existe mais. Ele já pode ter sido removido.';
  end if;
end $$;

-- troca o texto do resumo antes de mandar para o grupo (até 6 mil caracteres)
create or replace function hub.gr_resumo_texto_salvar(p_resumo uuid, p_texto text)
returns void
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  perform hub.gr_exige('administrar');
  if v_texto = '' then
    raise exception 'O texto do resumo não pode ficar vazio.';
  end if;
  if length(v_texto) > 6000 then
    raise exception 'O texto do resumo pode ter até 6.000 caracteres. Encurte o texto e salve de novo.';
  end if;
  update hub.gr_resumos set texto_whatsapp = v_texto where id = p_resumo;
  if not found then
    raise exception 'Este resumo não existe mais. Ele pode ter sido apagado junto com o grupo.';
  end if;
end $$;

-- cria (p_id nulo) ou troca um material de apoio
create or replace function hub.gr_material_salvar(p_id uuid, p_grupo uuid, p_titulo text, p_texto text, p_arquivo_nome text)
returns uuid
language plpgsql security definer
set search_path = hub, public
as $$
declare
  v_titulo  text := btrim(coalesce(p_titulo, ''));
  v_texto   text := btrim(coalesce(p_texto, ''));
  v_arquivo text := left(nullif(btrim(coalesce(p_arquivo_nome, '')), ''), 200);
  v_id      uuid;
begin
  perform hub.gr_exige('administrar');
  if v_titulo = '' then
    raise exception 'Dê um título ao material.';
  end if;
  if length(v_titulo) > 200 then
    raise exception 'O título do material pode ter até 200 caracteres.';
  end if;
  if v_texto = '' then
    raise exception 'O material está sem texto. Cole o texto ou escolha um arquivo .txt ou .md.';
  end if;
  if length(v_texto) > 60000 then
    raise exception 'O material pode ter até 60 mil caracteres. Divida o texto em dois materiais.';
  end if;

  if p_id is null then
    if not exists (select 1 from hub.gr_grupos where id = p_grupo) then
      raise exception 'Este grupo não existe mais. Ele pode ter sido removido, então volte para a lista de grupos.';
    end if;
    if (select count(*) from hub.gr_materiais where grupo_id = p_grupo) >= 50 then
      raise exception 'Este grupo já tem 50 materiais. Apague algum antes de criar outro.';
    end if;
    insert into hub.gr_materiais (grupo_id, titulo, texto, arquivo_nome, criado_por)
    values (p_grupo, v_titulo, v_texto, v_arquivo, auth.uid())
    returning id into v_id;
  else
    update hub.gr_materiais
       set titulo = v_titulo, texto = v_texto, arquivo_nome = coalesce(v_arquivo, arquivo_nome)
     where id = p_id and (p_grupo is null or grupo_id = p_grupo)
    returning id into v_id;
    if v_id is null then
      raise exception 'Este material não existe mais. Ele pode ter sido apagado.';
    end if;
  end if;
  return v_id;
end $$;

-- apaga um material de apoio
create or replace function hub.gr_material_apagar(p_id uuid)
returns void
language plpgsql security definer
set search_path = hub, public
as $$
begin
  perform hub.gr_exige('administrar');
  delete from hub.gr_materiais where id = p_id;
  if not found then
    raise exception 'Este material não existe mais. Ele já pode ter sido apagado.';
  end if;
end $$;

-- ── travas das funções deste arquivo ────────────────────────────────────────
revoke execute on function
  hub.gr_painel(), hub.gr_grupo(uuid), hub.gr_mensagens(uuid, timestamptz, text, text, int, bigint), hub.gr_autores(uuid),
  hub.gr_resumos(uuid, int), hub.gr_resumo(uuid), hub.gr_atividade_por_hora(uuid, timestamptz, timestamptz),
  hub.gr_perguntas(uuid, int), hub.gr_participantes(uuid),
  hub.gr_materiais(uuid), hub.gr_grupo_salvar(uuid, jsonb), hub.gr_grupo_remover(uuid),
  hub.gr_resumo_texto_salvar(uuid, text), hub.gr_material_salvar(uuid, uuid, text, text, text), hub.gr_material_apagar(uuid)
from public, anon, authenticated;

grant execute on function
  hub.gr_painel(), hub.gr_grupo(uuid), hub.gr_mensagens(uuid, timestamptz, text, text, int, bigint), hub.gr_autores(uuid),
  hub.gr_resumos(uuid, int), hub.gr_resumo(uuid), hub.gr_atividade_por_hora(uuid, timestamptz, timestamptz),
  hub.gr_perguntas(uuid, int), hub.gr_participantes(uuid),
  hub.gr_materiais(uuid), hub.gr_grupo_salvar(uuid, jsonb), hub.gr_grupo_remover(uuid),
  hub.gr_resumo_texto_salvar(uuid, text), hub.gr_material_salvar(uuid, uuid, text, text, text), hub.gr_material_apagar(uuid)
to authenticated;
