-- =============================================================================
-- base · 15-telefone-whatsapp.sql — hub.wpp_numero: telefone → número do WhatsApp
-- (com "+" o DDI fica; 10–11 dígitos ganham o 55; o resto vira NULL). Usada por
-- vários módulos (OutSign, OutChat, OutFunnels, OutPeople), por isso mora no
-- ESSENCIAL da base (morava no catálogo de produtos até 10/10/2026).
-- =============================================================================

-- FUNCTION: wpp_numero(text)
CREATE FUNCTION hub.wpp_numero(p_telefone text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  with d as (
    select btrim(coalesce(p_telefone,'')) as cru,
           regexp_replace(coalesce(p_telefone,''), '\D', '', 'g') as dig
  )
  select case
    when dig = '' then null
    -- (a) escreveram o DDI (+1, +351, +55…): o país JÁ está ali. Nunca prefixar.
    when left(cru,1) = '+' then case when length(dig) between 8 and 15 then dig end
    -- (b) sem DDI, 10 (fixo antigo) ou 11 (celular) dígitos: é daqui
    when length(dig) between 10 and 11 then '55' || dig
    -- (c) já veio com o 55 na frente
    when length(dig) between 12 and 13 and left(dig,2) = '55' then dig
    -- (d) qualquer outra coisa: não sei de quem é, e não invento
    else null
  end
  from d;
$$;

-- COMMENT: FUNCTION wpp_numero(p_telefone text)
COMMENT ON FUNCTION hub.wpp_numero(p_telefone text) IS 'Telefone -> dígitos do JID do WhatsApp (ou NULL). Telefone com +DDI nunca recebe 55 na frente; 10 ou 11 dígitos ganham o 55; o resto vira NULL (não se inventa destino).';

-- ACL: FUNCTION wpp_numero(p_telefone text)
REVOKE ALL ON FUNCTION hub.wpp_numero(p_telefone text) FROM PUBLIC;
GRANT ALL ON FUNCTION hub.wpp_numero(p_telefone text) TO authenticated;
GRANT ALL ON FUNCTION hub.wpp_numero(p_telefone text) TO service_role;
GRANT ALL ON FUNCTION hub.wpp_numero(p_telefone text) TO outfunnels_app;
