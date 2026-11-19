// ============================================================================
// app-convite — o link do APP NO CELULAR (28/09/2026)
//
// Três ações:
//   gerar  → o RH (admin de usuários) cria o convite de UMA pessoa. Vale 48h e
//            uma vez só. Gerar de novo cancela o anterior. Devolve o CÓDIGO, que
//            só existe no link: o banco guarda o sha256 dele (hub.app_convites).
//   abrir  → a pessoa abriu o link (/entrar/?c=CÓDIGO). Sem login. Confere o
//            código e devolve um token de "definir senha" do Supabase (o mesmo
//            que o admin-generate-link já usava), que a página consome.
//   usado  → a pessoa criou a senha. Já logada; o convite morre aqui.
//
// Por que o convite não é o link do Supabase direto: aquele vence em ~1h (é
// config do projeto inteiro). O nosso vence em 48h e pode ser cancelado — e
// cai sozinho quando a pessoa sai do time (gatilho em hub.users).
//
// Publicar: supabase functions deploy app-convite --project-ref SEU_PROJETO --use-api --no-verify-jwt
//   (--no-verify-jwt porque o "abrir" vem de quem ainda não tem login; o
//    "gerar" confere a sessão AQUI DENTRO, contra o banco — regra)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256(txt: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function codigoNovo() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = (Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
  const db = createClient(url, service, { db: { schema: "hub" }, auth: { persistSession: false } });

  const body = await req.json().catch(() => ({}));
  const acao = String(body.acao || "");

  // quem está chamando (quando tem sessão)
  async function quemChama() {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return null;
    const { data } = await db.auth.getUser(jwt);
    return data?.user || null;
  }

  // ── gerar ────────────────────────────────────────────────────────────────
  if (acao === "gerar") {
    const eu = await quemChama();
    if (!eu) return json({ error: "Sessão inválida ou expirada. Entre de novo." }, 401);
    const { data: me } = await db.from("users").select("access_level, active, acessos").eq("id", eu.id).maybeSingle();
    const souAdmin = !!me && me.active === true && (me.access_level === "admin" || (me.acessos || {}).rh === "admin");
    if (!souAdmin) return json({ error: "Só quem administra usuários gera o link do app." }, 403);

    const alvo = String(body.userId || "");
    const { data: pessoa } = await db.from("users").select("id, full_name, email, active, whatsapp").eq("id", alvo).maybeSingle();
    if (!pessoa) return json({ error: "Pessoa não encontrada no cadastro." }, 404);
    if (pessoa.active !== true) return json({ error: "Esta pessoa está desativada. Ative o acesso antes de gerar o link." }, 409);
    if (!pessoa.email) return json({ error: "Esta pessoa não tem e-mail de login no cadastro." }, 409);

    // o anterior que ainda estava valendo deixa de valer
    await db.from("app_convites").update({ cancelado_em: new Date().toISOString(), cancelado_motivo: "gerou outro" })
      .eq("user_id", alvo).is("usado_em", null).is("cancelado_em", null);

    const codigo = codigoNovo();
    const { data: conv, error } = await db.from("app_convites")
      .insert({ user_id: alvo, token_sha: await sha256(codigo), criado_por: eu.id })
      .select("vence_em").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, codigo, vence_em: conv.vence_em, nome: pessoa.full_name, whatsapp: pessoa.whatsapp || null });
  }

  // ── abrir (sem login) ────────────────────────────────────────────────────
  if (acao === "abrir") {
    const codigo = String(body.codigo || "");
    if (codigo.length < 20) return json({ error: "invalido" }, 400);
    const { data: conv } = await db.from("app_convites")
      .select("id, user_id, vence_em, usado_em, cancelado_em, criado_por").eq("token_sha", await sha256(codigo)).maybeSingle();
    if (!conv || conv.usado_em || conv.cancelado_em || new Date(conv.vence_em) < new Date()) {
      return json({ error: "vencido" }, 410);
    }
    const { data: pessoa } = await db.from("users").select("full_name, email, active").eq("id", conv.user_id).maybeSingle();
    if (!pessoa || pessoa.active !== true || !pessoa.email) return json({ error: "vencido" }, 410);

    const { data: link, error } = await db.auth.admin.generateLink({ type: "recovery", email: pessoa.email });
    const token_hash = link?.properties?.hashed_token;
    if (error || !token_hash) return json({ error: "Não deu para preparar o acesso agora. Tente de novo." }, 500);

    const { data: quem } = conv.criado_por
      ? await db.from("users").select("full_name").eq("id", conv.criado_por).maybeSingle()
      : { data: null };
    return json({
      ok: true, token_hash, email: pessoa.email,
      primeiro_nome: String(pessoa.full_name || "").split(" ")[0] || "",
      convidou: String(quem?.full_name || "").split(" ")[0] || "",
    });
  }

  // ── usado (já logada, depois de criar a senha) ───────────────────────────
  if (acao === "usado") {
    const eu = await quemChama();
    if (!eu) return json({ error: "Sem sessão." }, 401);
    const codigo = String(body.codigo || "");
    await db.from("app_convites").update({ usado_em: new Date().toISOString() })
      .eq("token_sha", await sha256(codigo)).eq("user_id", eu.id).is("usado_em", null);
    return json({ ok: true });
  }

  return json({ error: "Ação desconhecida." }, 400);
});
