// ============================================================================
// texto.ts: o texto que vai para o banco sem o que o Postgres recusa
// ----------------------------------------------------------------------------
// O Postgres recusa o caractere nulo (\u0000) em texto e em jsonb, e o JSON com metade de um
// emoji (surrogate sem par) quebra o pedido inteiro. Por isso todo texto que vem da uazapi
// passa por aqui antes de ir para o banco:
//   . o caractere nulo sai;
//   . a metade solta de um emoji vira o caractere de substituição (toWellFormed);
//   . o corte de tamanho para antes do emoji que não cabe inteiro, sem partir caractere
//     nem emoji composto.
// ============================================================================

// deno-lint-ignore no-explicit-any
const Segmentador = (Intl as any).Segmenter as (new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> }) | undefined;
const graficos = Segmentador ? new Segmentador("pt-BR", { granularity: "grapheme" }) : null;

/** A metade solta de um emoji vira o caractere de substituição. */
function bemFormado(s: string): string {
  // deno-lint-ignore no-explicit-any
  const nativo = (s as any).toWellFormed as (() => string) | undefined;
  if (typeof nativo === "function") return nativo.call(s);
  return s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "�");
}

/** O texto sem o caractere nulo e sem metade de emoji. Número vira texto; o resto, texto vazio. */
export function textoLimpo(v: unknown): string {
  const s = typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  return bemFormado(s.includes("\u0000") ? s.replace(/\u0000/g, "") : s);
}

/** Corta em até `max` unidades de texto, sem partir caractere nem emoji. */
export function cortar(s: string, max: number): string {
  if (s.length <= max) return s;
  if (!graficos) {
    const corte = s.slice(0, max);
    return /[\ud800-\udbff]$/.test(corte) ? corte.slice(0, -1) : corte;
  }
  let saida = "";
  for (const { segment } of graficos.segment(s)) {
    if (saida.length + segment.length > max) break;
    saida += segment;
  }
  return saida;
}

/** Limpa e corta de uma vez. */
export const limpoECortado = (v: unknown, max: number) => cortar(textoLimpo(v), max);
