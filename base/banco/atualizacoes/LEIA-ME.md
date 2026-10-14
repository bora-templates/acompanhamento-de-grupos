# Atualizações do banco da base

`banco/estrutura/` (o essencial) e `banco/pecas/` são a fotografia da base na **versão 1.0.0**.
Toda mudança no banco da base depois disso vira **um arquivo aqui**, e **não** se mexe mais nos
arquivos de estrutura (senão quem já tem a base instalada nunca recebe a mudança).

## Nome do arquivo

```
<versão>-<peça>-<assunto>.sql        ex.: 1.1.0-essencial-avisos-com-prioridade.sql
                                          1.1.0-produtos-preco-promocional.sql
```

- **versão**: a versão da base que traz a mudança (a mesma do `base/sistema.json` → `versao`).
- **peça**: `essencial`, `avisos`, `email`, `produtos` ou `comercial` (a lista em `base/sistema.json` → `pecas`).
  O arquivo só roda onde aquela peça está instalada.

## Regras

- **Idempotente**: rodar duas vezes não pode quebrar nem duplicar (`create or replace`,
  `add column if not exists`, `on conflict do nothing`, `drop … if exists` antes de recriar policy).
- Só **estrutura**, nunca dado de cliente.
- Tabela nova com RLS ligada e policy com o piso `hub.e_do_time()`; função `security definer`
  nova com `revoke execute … from public, anon, authenticated` e grant nominal.

## Quem roda

O `tools/instalar/instalar-banco.sh`:

- **instalação nova**: roda a estrutura e depois **todas** as atualizações até a versão da base
  da pasta (instalar do zero e atualizar dão o mesmo banco);
- **peça nova numa base em uso**: roda o arquivo da peça e as atualizações daquela peça;
- **base mais nova na pasta do que no banco** (`hub.sistemas_instalados`, linha `base`): roda só as
  atualizações com versão **maior** que a do banco e **menor ou igual** à da pasta, na ordem;
- base igual ou mais velha: não mexe em nada.
