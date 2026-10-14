// ============================================================================
// Quem pode chamar uma Edge Function (robô com a chave de serviço, ou gente do time logada)
// ----------------------------------------------------------------------------
// Cópia da trava da base (base/supabase/functions/_shared/acesso.ts), com a versão do
// supabase-js fixa como nas outras funções. Mexeu numa, confira a outra. A diferença que
// existe de propósito: aqui a comparação das chaves usa o SHA-256 das duas e o
// timingSafeEqual do node:crypto (revisão de segurança do outgrupos).
//
// A chave PUBLICÁVEL do Supabase está em todo HTML: quem abre o site baixa ela.
// Então "o gateway confere o JWT" NÃO protege nada, porque a chave publicável passa.
//
// Só entram dois tipos de chamada:
//   • ROBÔ: outra Edge Function mandando a chave de SERVIÇO no Authorization;
//   • TELA: o JWT de um usuário logado (supabase.functions.invoke manda sozinho)
//     que ESTÁ NO TIME, com ficha em hub.users e active = true. Ter sessão no
//     Supabase não é o mesmo que estar na empresa (quem se cadastrou sozinho, ou foi
//     desligado, tem sessão e não tem acesso).
// A chave do módulo ("grupos") é conferida à parte, pela hub.og_acesso_de (og-api).
//
// Nenhuma chave é escrita aqui: tudo vem das variáveis de ambiente que o Supabase
// já põe em toda Edge Function (SUPABASE_URL e a chave de serviço).
// ============================================================================
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();

/** As duas formas de a chave de serviço chegar (nova e legada): robô pode mandar qualquer uma. */
function chavesDeServico(): string[] {
  return [env("SB_SECRET_KEY"), env("SUPABASE_SERVICE_ROLE_KEY")].filter(Boolean);
}

/**
 * Compara em tempo fixo: não dá para descobrir a chave medindo a demora. As duas viram o
 * SHA-256 delas (o mesmo tamanho sempre, então nem o tamanho da chave certa vaza) e o
 * timingSafeEqual compara os dois resumos.
 */
export function mesmaChave(a: string, b: string): boolean {
  const x = createHash("sha256").update(String(a ?? ""), "utf8").digest();
  const y = createHash("sha256").update(String(b ?? ""), "utf8").digest();
  return timingSafeEqual(x, y);
}

export type QuemChamou =
  | { ok: true; tipo: "robo" }
  | { ok: true; tipo: "usuario"; id: string; email: string; nome: string }
  | { ok: false; motivo: string };

/** Lê o token do cabeçalho Authorization (Bearer seguido do token). */
export function tokenDoPedido(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Diz se quem chamou é robô (chave de serviço) ou gente do time logada. */
export async function quemPodeChamar(req: Request): Promise<QuemChamou> {
  const tok = tokenDoPedido(req);
  if (!tok) return { ok: false, motivo: "sem_token" };
  const chaves = chavesDeServico();
  if (chaves.some((k) => mesmaChave(tok, k))) return { ok: true, tipo: "robo" };
  // A chave publicável (a que começa com sb_publishable_) e a anon legada NÃO são login de ninguém.
  if (!tok.startsWith("eyJ")) return { ok: false, motivo: "chave_publica" };
  const url = env("SUPABASE_URL");
  if (!url || !chaves[0]) return { ok: false, motivo: "funcao_sem_configuracao" };
  try {
    const db = createClient(url, chaves[0], {
      db: { schema: "hub" }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const u = await db.auth.getUser(tok);
    const user = u?.data?.user;
    if (!user?.id) return { ok: false, motivo: "sessao_invalida" };
    // Está no time? (mesma régua de hub.e_do_time(): ficha + active)
    const p = await db.from("users").select("full_name,active").eq("id", user.id).maybeSingle();
    if (!p?.data || p.data.active !== true) return { ok: false, motivo: "fora_do_time" };
    return { ok: true, tipo: "usuario", id: user.id, email: user.email ?? "", nome: String(p.data.full_name ?? user.email ?? "") };
  } catch (_) {
    return { ok: false, motivo: "falha_ao_conferir" };
  }
}
