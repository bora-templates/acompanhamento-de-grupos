#!/usr/bin/env bash
# instalar.sh — o comando de alto nível da instalação. Rode de dentro da pasta da
# instalação (a que tem base/ e tools/).
#
#   INSTALAR DO ZERO (pasta do pacote, banco vazio):
#     DATABASE_URL="…" bash tools/instalar/instalar.sh
#       → instala o banco da base e de TODOS os módulos que estão nesta pasta e
#         grava o mapa (instalacao.json).
#
#   ACRESCENTAR UM MÓDULO COMPRADO DEPOIS (pacote novo descompactado em outra pasta):
#     DATABASE_URL="…" bash tools/instalar/instalar.sh --acrescentar /caminho/do/pacote-novo
#       → copia só o que falta (o módulo novo e as peças da base que ele usa; a base
#         só se a do pacote for mais nova, guardando a de antes em _copias/), instala
#         no banco SÓ o que é novo e refaz as ligações de todos. Nada é apagado e o
#         banco em uso não é reinstalado.
#     … --simular   mostra o que faria, sem copiar nem mexer no banco
#     … --sem-banco só os arquivos (o banco você instala depois com o instalar-banco.sh)
#
#   E-MAILS DO LOGIN EM PORTUGUÊS (no fim de cada instalação ele oferece):
#     SUPABASE_ACCESS_TOKEN="sbp_…" bash tools/instalar/instalar.sh --emails SEU_PROJETO
#     (ou: node tools/instalar/emails-portugues.js --config empresa.json --projeto SEU_PROJETO)
#
# Depois: publicar as Edge Functions e montar o site — o fim do comando diz quais.
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
MODO=novo; PACOTE=""; SIMULAR=0; SEM_BANCO=0; EMAILS_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --acrescentar) MODO=acrescentar; PACOTE="${2:?diga a pasta do pacote novo: --acrescentar /caminho/do/pacote}"; shift 2;;
    --simular) SIMULAR=1; shift;;
    --sem-banco) SEM_BANCO=1; shift;;
    --emails) EMAILS_REF="${2:?diga o projeto: --emails SEU_PROJETO}"; shift 2;;
    -h|--help) sed -n '2,24p' "$0"; exit 0;;
    *) echo "✗ não conheço a opção $1 (veja: bash tools/instalar/instalar.sh --help)"; exit 1;;
  esac
done

emails() {   # aplica os e-mails do login em português no projeto
  local ref="$1"
  [ -f empresa.json ] || { echo "✗ falta o empresa.json (copie de tools/instalar/montar/empresa.exemplo.json e preencha o nome da empresa)"; return 1; }
  node tools/instalar/emails-portugues.js --config empresa.json --projeto "$ref"
}
if [ -n "$EMAILS_REF" ] && [ "$MODO" = novo ] && [ -z "${DATABASE_URL:-}" ]; then emails "$EMAILS_REF"; exit $?; fi

oferece_emails() {
  if grep -q '"emails_portugues": {' instalacao.json 2>/dev/null; then return 0; fi
  echo
  echo "E-mails do login (convite, nova senha…) em português: ainda não aplicados."
  if [ -t 0 ] && [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    read -r -p "Aplicar agora no projeto? Digite o identificador do projeto (SEU_PROJETO) ou Enter para pular: " ref
    [ -n "$ref" ] && emails "$ref" && return 0
  fi
  echo "  Para aplicar: SUPABASE_ACCESS_TOKEN=\"…\" node tools/instalar/emails-portugues.js --config empresa.json --projeto SEU_PROJETO"
  echo "  (sem token: --para PASTA gera os arquivos para colar no painel — ver base/README.md)"
}

funcoes_de() {   # as Edge Functions que a instalação tem (base: das peças presentes; módulos: a pasta deles)
  local s
  for s in base "$@"; do
    [ -d "$s/supabase/functions" ] || continue
    for f in "$s"/supabase/functions/*/; do f="$(basename "$f")"; [ "$f" = _shared ] || printf '%s ' "$s:$f"; done
  done
}

if [ "$MODO" = acrescentar ]; then
  # o pacote de uma solução (pacote.json "tipo": "avulsa") não traz o acrescentar.js: a solução tem uma instalação só dela
  [ -f tools/instalar/acrescentar.js ] || { echo "✗ Esta instalação é de uma solução só e não recebe outro módulo. Para refazer a instalação, abra o site em /setup."; exit 1; }
  LISTA="$(mktemp)"; trap 'rm -f "$LISTA" "$LISTA.funcoes"' EXIT
  if [ $SIMULAR = 1 ]; then node tools/instalar/acrescentar.js "$PACOTE" --simular; exit 0; fi
  node tools/instalar/acrescentar.js "$PACOTE" --lista-novos "$LISTA"
  mapfile -t NOVOS < "$LISTA"
  if [ $SEM_BANCO = 1 ]; then echo "(--sem-banco: o banco fica para depois: bash tools/instalar/instalar-banco.sh ${NOVOS[*]:-})"; exit 0; fi
  : "${DATABASE_URL:?defina DATABASE_URL (a conexão do banco; nunca imprima na tela) — ou use --sem-banco}"
  echo
  # (o instalar-banco.sh pode ter acabado de chegar mais novo do pacote: é ele que roda)
  bash tools/instalar/instalar-banco.sh --acrescentar "${NOVOS[@]}"
  oferece_emails
  echo
  echo "Falta (fora do banco):"
  [ ${#NOVOS[@]} -gt 0 ] && echo "  · publicar as Edge Functions dos módulos novos (lista no README de cada um): $(funcoes_de "${NOVOS[@]}" | tr ' ' '\n' | grep -v '^base:' | tr '\n' ' ')"
  [ -n "$(cat "$LISTA.funcoes" 2>/dev/null)" ] && echo "  · publicar as Edge Functions das peças da base que chegaram: $(cat "$LISTA.funcoes")"
  echo "  · montar e publicar o site: node tools/instalar/montar/montar.js --saida dist --config empresa.json"
  exit 0
fi

# ═══ INSTALAR DO ZERO ═══
mapfile -t MODS < <(for d in */sistema.json; do s="${d%/sistema.json}"; [ "$s" != base ] && echo "$s"; done)
if [ $SIMULAR = 1 ]; then
  echo "Instalaria a base ($(node tools/instalar/pecas.js versao)) com as peças: $(node tools/instalar/pecas.js pecas "${MODS[@]}" | tr '\n' ' ')"
  echo "e os módulos: ${MODS[*]:-nenhum}"; exit 0
fi
: "${DATABASE_URL:?defina DATABASE_URL (a conexão do banco; nunca imprima na tela)}"
bash tools/instalar/instalar-banco.sh "${MODS[@]}"
oferece_emails
echo
echo "Falta (fora do banco), na ordem — README.md, \"1. Instalar\":"
echo "  · a chave de instalação (PRIMEIRO_ACESSO_CHAVE) e as Edge Functions: $(funcoes_de "${MODS[@]}")"
echo "  · Exposed schemas: hub$([ -d crm ] && echo ' e crm') · URL do site e Redirect URLs · cadastro aberto DESLIGADO"
echo "  · montar e publicar o site: node tools/instalar/montar/montar.js --saida dist --config empresa.json"
exit 0
}
