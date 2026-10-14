#!/usr/bin/env bash
# instalar-banco.sh — instala o banco da base e dos módulos, na ordem certa.
#
#   DATABASE_URL="postgresql://…" bash tools/instalar/instalar-banco.sh outjourney outsign
#
# INSTALAÇÃO NOVA (banco sem a base):
#   1. o ESSENCIAL da base (base/banco/estrutura.sql) e as atualizações dele;
#   2. as outras PEÇAS da base que os módulos da lista usam ("base_pecas" no
#      sistema.json de cada um; a lista de peças em base/sistema.json → "pecas"):
#      produtos (base/banco/pecas/produtos.sql), comercial (…/comercial.sql) —
#      avisos e e-mail não têm banco próprio (a fila deles é do essencial);
#   3. cada módulo, na ordem do "precisa" (o OutChat depois do OutJourney), não
#      importa a ordem digitada. O OutFunnels tem três arquivos: outfunnels.sql
#      (antes), estrutura.sql e outfunnels_ligacoes.sql (no fim, com as ligações);
#   4. NO FIM, SEMPRE: as ligações (*-ligacoes.sql) de TODOS os módulos que estão
#      no banco — os novos e os que já estavam. Cada ligação só cria o que precisa
#      dos dois lados instalados, e rodar de novo não duplica nem apaga nada;
#   5. o mapa da instalação (instalacao.json, na raiz) é refeito.
#
# BANCO EM USO (a base já está lá) — o modo ACRESCENTAR, automático:
#   - a base NÃO é reinstalada (nunca se reinstala o banco de uma base em uso);
#   - a versão da base desta pasta é comparada com a do banco: MAIS NOVA → roda só
#     as atualizações (base/banco/atualizacoes/) entre as duas, de forma idempotente;
#     IGUAL ou MAIS VELHA → não mexe na base;
#   - as peças da base que os módulos novos usam e o banco não tem são instaladas;
#   - módulo que já está no banco é pulado (não se reinstala); o novo é instalado;
#   - as ligações de todos se refazem e o mapa é atualizado.
#      bash tools/instalar/instalar-banco.sh outchat              # acrescenta o OutChat
#      bash tools/instalar/instalar-banco.sh --acrescentar outchat # o mesmo, dito com todas as letras
#   (--sem-base, o nome antigo, continua valendo.)
#
# RECUSA, com o motivo, antes de mexer em qualquer coisa: módulo que precisa de
# outro que não veio nem está no banco (OutChat sem OutJourney), módulo que pede
# uma base mais nova do que a desta pasta ("versao_minima_base") e peça da base
# que um módulo usa e não está na pasta.
#
# SÓ REFAZER AS PONTES (conferir, ou depois de mexer numa ligação):
#      bash tools/instalar/instalar-banco.sh --ligacoes                 # de todos os módulos do banco
#      bash tools/instalar/instalar-banco.sh --ligacoes outjourney outchat   # só destes
#
# O que está no banco: hub.sistemas_instalados (o script grava cada módulo, a base
# como 'base' e cada peça como 'base.<peça>', com a versão) e, pra banco instalado
# antes dela, a primeira tabela de cada um existir no banco.
# Ver "Adicionar um módulo depois" no README.md e o COMECE-AQUI.md do pacote.
{   # (o script inteiro é lido antes de rodar: o acrescentar pode trocar este arquivo no meio)
# O bash que vem no Mac é o 3.2 e não tem o mapfile que este script usa. Em vez de um erro
# sem explicação, diz o caminho que funciona em qualquer computador (só precisa do Node).
if [ -z "${BASH_VERSINFO:-}" ] || [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "✗ Este script precisa do bash 4 ou mais novo (o do Mac é o 3.2)."
  echo "  Use a tela de instalação do site (/setup) ou o instalador em JavaScript, que não precisa de psql:"
  echo "  SUPABASE_ACCESS_TOKEN=\"<token>\" node tools/instalar/instalar-pela-api.js --projeto https://SEU_PROJETO.supabase.co --empresa \"Sua Empresa\""
  exit 1
fi
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?defina DATABASE_URL (a conexão do banco; nunca imprima na tela)}"
PECAS_JS=tools/instalar/pecas.js
roda() { echo "  → $1"; psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }
# as ligações rodam soltas (fora do estrutura.sql): sem conferir o corpo das
# funções na criação, igual ao resto da instalação (00-preparo.sql)
roda_ligacao() { echo "  → $1"; PGOPTIONS="-c check_function_bodies=off ${PGOPTIONS:-}" psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null; }
sql() { psql "$DATABASE_URL" -qAt -v ON_ERROR_STOP=1 -c "$1"; }
pecas_js() { node "$PECAS_JS" "$@"; }

# todos os módulos que esta pasta conhece (os que têm banco), base primeiro
TODOS=(base $(for d in */banco; do s="${d%/banco}"; [ "$s" != base ] && echo "$s"; done))
tem_tabela_inst() { [ "$(sql "select count(*) from pg_class where oid = to_regclass('hub.sistemas_instalados')")" = 1 ]; }

# a primeira tabela que a estrutura do sistema cria (a "assinatura" dele no banco)
assinatura() {
  [ "$1" = outfunnels ] && { echo "hub.of_leads"; return; }
  [ "$1" = base ] && { echo "hub.users"; return; }
  local arqs=("$1"/banco/estrutura.sql) f
  for f in "$1"/banco/estrutura/*.sql; do case "$f" in *-ligacoes.sql) ;; *) [ -f "$f" ] && arqs+=("$f");; esac; done
  local t
  for f in "${arqs[@]}"; do    # arquivo por arquivo, NA ORDEM: a primeira tabela que o sistema cria
    t="$(command grep -i -m1 -o -E '^create table (if not exists )?hub\.[a-z0-9_]+' "$f" 2>/dev/null | command grep -o -i -E 'hub\.[a-z0-9_]+' || true)"
    [ -n "$t" ] && { echo "$t"; return; }
  done
}
esta_no_banco() {
  local s="$1"
  tem_tabela_inst && [ "$(sql "select count(*) from hub.sistemas_instalados where sistema = '$s'")" = 1 ] && return 0
  local t; t="$(assinatura "$s")"
  [ -n "$t" ] && [ "$(sql "select (to_regclass('$t') is not null)::int")" = 1 ]
}
# peça da base no banco: a linha 'base.<peça>' ou (banco de antes das peças) a assinatura dela
peca_no_banco() {
  local p="$1"
  [ "$p" = essencial ] && { esta_no_banco base; return; }
  tem_tabela_inst && [ "$(sql "select count(*) from hub.sistemas_instalados where sistema = 'base.$p'")" = 1 ] && return 0
  local t; t="$(python3 -c "import json,sys; print(json.load(open('base/sistema.json'))['pecas']['$p'].get('assinatura',''))")"
  [ -n "$t" ] && [ "$(sql "select (to_regclass('$t') is not null)::int")" = 1 ]
}
marca_instalado() {   # marca_instalado <sistema> [versão]
  local v="${2:-}"
  sql "insert into hub.sistemas_instalados (sistema, versao) values ('$1', nullif('$v','')) on conflict (sistema) do update set instalado_em = now(), versao = coalesce(nullif('$v',''), hub.sistemas_instalados.versao)" >/dev/null 2>&1 || true
}
refaz_ligacoes() {
  local lista=("$@") feitos=() s f
  # os esboços saem antes (a ligação do módulo que chegou cria a visão de verdade) e voltam no fim
  [ -f base/banco/esbocos-tira.sql ] && roda_ligacao base/banco/esbocos-tira.sql
  for s in "${lista[@]}"; do
    for f in "$s"/banco/estrutura/*-ligacoes.sql; do [ -f "$f" ] && roda_ligacao "$f"; done
    feitos+=("$s")
  done
  # o OutFunnels fecha a fila: o que ele cria depende de todos os outros
  for s in "${lista[@]}"; do [ "$s" = outfunnels ] && roda_ligacao outfunnels/banco/outfunnels_ligacoes.sql; done
  [ -f base/banco/esbocos.sql ] && roda_ligacao base/banco/esbocos.sql
  echo "✓ ligações refeitas: ${feitos[*]}"
}
ordena() { [ $# -eq 0 ] && return 0; pecas_js ordena "$@"; }
instalados() { local s; for s in "${TODOS[@]}"; do esta_no_banco "$s" && echo "$s"; done; return 0; }
grava_mapa() {   # o instalacao.json da raiz, com o que está no banco agora
  # o repositório de TRABALHO (o que tem tools/manutencao/) não é uma instalação: sem mapa
  [ -d tools/manutencao ] && [ -z "${MAPA_SEMPRE:-}" ] && return 0
  local linhas=""
  tem_tabela_inst && linhas="$(sql "select sistema || ' ' || coalesce(versao,'') from hub.sistemas_instalados order by 1")"
  printf '%s\n' "$linhas" | MAPA_NOTA="${1:-}" pecas_js mapa
}
# banco instalado antes da troca de nome (10/10/2026: performance → outperformance,
# processos → outprocessos): a lista passa a usar o nome novo, sem reinstalar nada
nomes_novos() {
  tem_tabela_inst || return 0
  sql "set client_min_messages = warning; alter table hub.sistemas_instalados add column if not exists versao text" >/dev/null   # banco de antes das versões
  sql "update hub.sistemas_instalados v set sistema = n.novo from (values ('performance','outperformance'),('processos','outprocessos')) n(velho, novo)
       where v.sistema = n.velho and not exists (select 1 from hub.sistemas_instalados x where x.sistema = n.novo)" >/dev/null
  sql "delete from hub.sistemas_instalados where sistema in ('performance','processos')" >/dev/null
}
nomes_novos

if [ "${1:-}" = "--ligacoes" ]; then
  shift
  if [ $# -gt 0 ]; then mapfile -t L < <(ordena "$@"); else mapfile -t L < <(ordena $(instalados)); fi
  refaz_ligacoes base "${L[@]}"
  exit 0
fi
case "${1:-}" in --sem-base|--sem-nucleo|--acrescentar) shift;; esac   # o modo vem do banco: com a base lá, é sempre "acrescentar"

# ─── o que já está no banco ──────────────────────────────────────────────────
BASE_NO_BANCO=0; esta_no_banco base && BASE_NO_BANCO=1
mapfile -t JA < <(instalados | grep -vx base || true)
mapfile -t PEDIDOS < <(ordena "$@")
for s in "$@"; do [ -f "$s/sistema.json" ] || { echo "✗ módulo desconhecido nesta pasta: $s (falta a pasta $s/)"; exit 1; }; done
NOVOS=(); PULADOS=()
for s in "${PEDIDOS[@]}"; do
  if [ $BASE_NO_BANCO = 1 ] && printf '%s\n' "${JA[@]}" | grep -qx "$s"; then PULADOS+=("$s"); else NOVOS+=("$s"); fi
done

# ─── a compra fecha? (antes de mexer em qualquer coisa) ─────────────────────
JA_NO_BANCO="${JA[*]:-}" pecas_js confere "${PEDIDOS[@]}"
# as peças: as dos módulos que JÁ estão no banco e as dos novos
mapfile -t PECAS < <(pecas_js pecas "${JA[@]}" "${PEDIDOS[@]}")
V_PASTA="$(pecas_js versao base)"

if [ $BASE_NO_BANCO = 0 ]; then
  # ═══ INSTALAÇÃO NOVA ═══
  echo "Instalação nova — base $V_PASTA (peças: ${PECAS[*]}) + ${NOVOS[*]:-nenhum módulo}"
  roda base/banco/estrutura.sql
  for f in $(pecas_js atualizacoes essencial - "$V_PASTA"); do roda "$f"; done
  marca_instalado base "$V_PASTA"; marca_instalado base.essencial "$V_PASTA"
else
  # ═══ BANCO EM USO: acrescentar ═══
  V_BANCO="$(sql "select coalesce((select versao from hub.sistemas_instalados where sistema = 'base'), '1.0.0')" 2>/dev/null || echo 1.0.0)"
  [ -z "$V_BANCO" ] && V_BANCO=1.0.0
  echo "Banco em uso — base $V_BANCO no banco, $V_PASTA nesta pasta. Acrescentando: ${NOVOS[*]:-nenhum módulo novo}${PULADOS:+ (já estavam: ${PULADOS[*]})}"
  case "$(pecas_js compara "$V_PASTA" "$V_BANCO")" in
    1)  echo "  a base desta pasta é MAIS NOVA: atualizando a base do banco de $V_BANCO para $V_PASTA (só as atualizações entre as duas)"
        for p in $(pecas_js pecas "${JA[@]}"); do
          peca_no_banco "$p" || continue
          vp="$(sql "select coalesce((select versao from hub.sistemas_instalados where sistema = 'base.$p'), '$V_BANCO')")"
          for f in $(pecas_js atualizacoes "$p" "$vp" "$V_PASTA"); do roda "$f"; done
          marca_instalado "base.$p" "$V_PASTA"
        done
        marca_instalado base "$V_PASTA";;
    0)  echo "  a base é a mesma versão: não mexo nela";;
    -1) echo "  ! a base desta pasta ($V_PASTA) é MAIS VELHA que a do banco ($V_BANCO): não mexo na base do banco."
        echo "    Os arquivos da base nesta pasta estão atrás do banco — traga a base $V_BANCO (ou mais nova) para a pasta.";;
  esac
  for p in $(pecas_js pecas "${JA[@]}"); do peca_no_banco "$p" && ! esta_no_banco "base.$p" && marca_instalado "base.$p" "$V_BANCO"; done
fi

# ─── as peças da base que faltam no banco ────────────────────────────────────
for p in "${PECAS[@]}"; do
  [ "$p" = essencial ] && continue
  peca_no_banco "$p" && { esta_no_banco "base.$p" || marca_instalado "base.$p" "$V_PASTA"; continue; }
  vp="$(pecas_js versao "$p")"
  echo "  peça da base: $p ($vp)"
  for f in $(python3 -c "import json; print(' '.join(json.load(open('base/sistema.json'))['pecas']['$p'].get('banco', [])))"); do roda "base/$f"; done
  for f in $(pecas_js atualizacoes "$p" - "$V_PASTA"); do roda "$f"; done
  marca_instalado "base.$p" "$V_PASTA"
done

# ─── os módulos novos ────────────────────────────────────────────────────────
for s in "${NOVOS[@]}"; do
  [ -f "$s/banco/estrutura.sql" ] || { echo "✗ $s não tem banco/estrutura.sql"; exit 1; }
  [ "$s" = outfunnels ] && roda outfunnels/banco/outfunnels.sql
  roda "$s/banco/estrutura.sql"
  marca_instalado "$s" "$(pecas_js versao "$s")"
done
for s in "${PULADOS[@]}"; do echo "  · $s já está no banco: não reinstalo (atualizar um módulo é outra coisa — ver o README dele)"; done

echo "Refazendo as ligações de todos os sistemas do banco:"
mapfile -t L < <(ordena $(instalados))
refaz_ligacoes base "${L[@]}"
grava_mapa "banco: base $V_PASTA ($(printf '%s ' "${PECAS[@]}" | sed 's/ $//')) + ${NOVOS[*]:-nada novo}"
if [ $BASE_NO_BANCO = 0 ]; then
  echo "✓ banco instalado. Falta: publicar a função primeiro-acesso (com o segredo PRIMEIRO_ACESSO_CHAVE), abrir o site e criar o primeiro administrador."
else
  echo "✓ banco atualizado (nada que já estava foi reinstalado nem apagado)."
fi
exit 0
}
