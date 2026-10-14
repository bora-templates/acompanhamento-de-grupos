// ============================================================================
// Quem pode chamar uma Edge Function (robô com a chave de serviço, ou gente do time logada)
// ----------------------------------------------------------------------------
// A chave PUBLICÁVEL do Supabase está em todo HTML: quem abre o site baixa ela.
// Então "o gateway confere o JWT" NÃO protege nada — a chave publicável passa.
// Antes desta trava, qualquer um com a chave mandava WhatsApp pelo número da
// empresa (wpp-send), baixava a mídia de qualquer conversa (wpp-media) e fazia o
// servidor buscar qualquer endereço (wpp-transcribe com {url}).
//
// Só entram dois tipos de chamada:
//   • ROBÔ: outra Edge Function mandando a chave de SERVIÇO no Authorization;
//   • TELA: o JWT de um usuário logado (supabase.functions.invoke manda sozinho)
//     que ESTÁ NO TIME — tem ficha em hub.users e active = true. Ter sessão no
//     Supabase não é ser da empresa (quem se cadastrou sozinho, ou foi desligado,
//     tem sessão e não tem acesso).
//
// Nenhuma chave é escrita aqui: tudo vem das variáveis de ambiente que o
// Supabase já põe em toda Edge Function (SUPABASE_URL, chave de serviço).
//
// Uso:
//   import { quemPodeChamar } from "../_shared/acesso.ts";
//   const quem = await quemPodeChamar(req);
//   if (!quem.ok) return json({ error: "sem_acesso" }, 403);
//   quem.tipo === "robo" | "usuario";  quem.email / quem.nome quando é usuário
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const SUPABASE_URL = env("SUPABASE_URL");
// As duas formas de a chave de serviço chegar (nova e legada): robô pode mandar qualquer uma.
const CHAVES_SERVICO = [env("SB_SECRET_KEY"), env("SUPABASE_SERVICE_ROLE_KEY")].filter(Boolean);
const SERVICE_KEY = CHAVES_SERVICO[0] ?? "";

/** Compara em tempo fixo: não dá pra descobrir a chave medindo a demora. */
export function mesmaChave(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let igual = x.length === y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) igual = igual && x[i] === y[i];
  return igual;
}

export type QuemChamou =
  | { ok: true; tipo: "robo" }
  | { ok: true; tipo: "usuario"; id: string; email: string; nome: string }
  | { ok: false; motivo: string };

/** Lê o token do Authorization (Bearer …). */
export function tokenDoPedido(req: Request): string {
  return (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** Diz se quem chamou é robô (chave de serviço) ou gente do time logada. */
export async function quemPodeChamar(req: Request): Promise<QuemChamou> {
  const tok = tokenDoPedido(req);
  if (!tok) return { ok: false, motivo: "sem_token" };
  if (CHAVES_SERVICO.some((k) => mesmaChave(tok, k))) return { ok: true, tipo: "robo" };
  // A chave publicável (sb_publishable_…) ou a anon legada NÃO são login de ninguém.
  if (!tok.startsWith("eyJ")) return { ok: false, motivo: "chave_publica" };
  if (!SUPABASE_URL || !SERVICE_KEY) return { ok: false, motivo: "funcao_sem_configuracao" };
  try {
    const db = createClient(SUPABASE_URL, SERVICE_KEY, {
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
