// ============================================================================
// comum.ts: o que as duas funções do Acompanhamento de Grupos usam (og-api e og-entrada)
// ----------------------------------------------------------------------------
// Resposta sempre em JSON, o cliente do banco com a chave de serviço (criado só na hora
// de usar, para a função responder JSON mesmo sem configuração), as chamadas às
// funções do banco, o registro de falhas e o trabalho em segundo plano.
// ============================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const env = (n: string) => (Deno.env.get(n) ?? "").trim();

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Toda resposta é JSON, com os cabeçalhos de CORS. */
export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Erro que vira resposta com frase clara para a tela ({ ok: false, erro, ...extra }). */
export class ErroClaro extends Error {
  constructor(mensagem: string, public status = 200, public extra: Record<string, unknown> = {}) {
    super(mensagem);
    this.name = "ErroClaro";
  }
}

/** Erro devolvido por uma função do banco (o código do Postgres vem junto). */
export class ErroBanco extends Error {
  constructor(mensagem: string, public codigo: string) {
    super(mensagem);
    this.name = "ErroBanco";
  }
}

// deno-lint-ignore no-explicit-any
type Banco = SupabaseClient<any, "hub", any>;
let _banco: Banco | null = null;

/** O cliente do banco com a chave de serviço, ou nulo se a função está sem configuração. */
export function banco(): Banco | null {
  const url = env("SUPABASE_URL");
  const chave = env("SB_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !chave) return null;
  if (!_banco) {
    _banco = createClient(url, chave, {
      db: { schema: "hub" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _banco;
}

/** Chama uma função do banco (esquema hub) e devolve o resultado, ou lança ErroBanco. */
// deno-lint-ignore no-explicit-any
export async function rpc<T = any>(nome: string, params: Record<string, unknown> = {}): Promise<T> {
  const db = banco();
  if (!db) throw new ErroClaro("A função está sem a configuração do Supabase (SUPABASE_URL e a chave de serviço).", 500);
  const { data, error } = await db.rpc(nome, params);
  if (error) throw new ErroBanco(String(error.message || "erro no banco"), String(error.code || ""));
  return data as T;
}

/** As mensagens das regras do banco (raise exception) são frases para a tela. */
export function erroDoBancoParaTela(e: unknown): string | null {
  if (e instanceof ErroBanco && e.codigo === "P0001") return e.message;
  return null;
}

/**
 * Guarda uma falha em hub.og_registro. NUNCA mande token, chave ou texto de mensagem
 * no detalhe: só códigos, situações e ids. O registro nunca derruba a função.
 */
export async function registrar(origem: string, mensagem: string, detalhe: Record<string, unknown> = {}) {
  try {
    const db = banco();
    if (!db) return;
    await db.rpc("og_registro_gravar", { p_origem: origem, p_mensagem: mensagem.slice(0, 500), p_detalhe: detalhe });
  } catch (_) {
    // segue: o registro é o último recurso
  }
}

/** O tipo de um erro, para o registro (sem a mensagem, que pode carregar dado). */
export function tipoDoErro(e: unknown): Record<string, unknown> {
  if (e instanceof ErroClaro) return { tipo: "claro", erro: e.message.slice(0, 300) };
  if (e instanceof ErroBanco) return { tipo: "banco", codigo: e.codigo, erro: e.codigo === "P0001" ? e.message.slice(0, 300) : undefined };
  if (e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError) {
    return { tipo: (e as Error).name, erro: String((e as Error).message).slice(0, 200) };
  }
  return { tipo: String((e as Error)?.name || typeof e) };
}

/**
 * Trabalho que segue depois da resposta (EdgeRuntime.waitUntil, como a base faz no
 * app-push). Devolve true quando o Supabase vai esperar o trabalho; fora dele (nos
 * testes), o trabalho roda solto e quem chamou decide se espera.
 */
export function emSegundoPlano(trabalho: Promise<unknown>): boolean {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  const seguro = trabalho.catch((e) => console.error("[outgrupos] segundo plano:", tipoDoErro(e)));
  if (rt?.waitUntil) {
    rt.waitUntil(seguro);
    return true;
  }
  return false;
}

/** Roda fn em cada item, com no máximo `limite` ao mesmo tempo. */
export async function comLimite<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (i < itens.length) {
      const item = itens[i++];
      try { await fn(item); } catch (e) { console.error("[outgrupos] item:", tipoDoErro(e)); }
    }
  });
  await Promise.all(trabalhadores);
}

export const ehUuid = (v: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""));
