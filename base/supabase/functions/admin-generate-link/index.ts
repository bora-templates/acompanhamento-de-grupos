// RH — admin-generate-link
// Um ADMIN gera um LINK DE ACESSO (definir senha) para um usuário do sistema,
// para repassar manualmente (WhatsApp/e-mail) quando o convite automático não chega.
// Chamada pela Gestão de Usuários (RH). Fluxo:
//   1) valida o JWT de quem chamou (Authorization: Bearer <sessão Supabase>)
//   2) confere que o CHAMADOR é admin em hub.users (access_level = 'admin')
//   3) gera um link de recuperação (type=recovery) no Auth do usuário-alvo
//   4) devolve o link pro admin repassar (a pessoa define a senha e entra no sistema)
//
// Obs.: o link é de uso único e expira (config do projeto, ~1h). Gere na hora de enviar.
//
// Variáveis (injetadas automaticamente pela plataforma):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = (Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
  const admin = createClient(url, service, { db: { schema: "hub" }, auth: { persistSession: false } });

  // 1) valida quem está chamando
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sem token de sessão." }, 401);
  const { data: caller, error: cErr } = await admin.auth.getUser(jwt);
  if (cErr || !caller?.user) return json({ error: "Sessão inválida ou expirada." }, 401);

  // 2) o chamador é admin?
  const { data: me, error: meErr } = await admin.from("users").select("access_level, active").eq("id", caller.user.id).maybeSingle();
  if (meErr) return json({ error: meErr.message }, 500);
  // admin desligado (active = false) que ainda tenha sessão aberta também fica de fora
  if (!me || me.access_level !== "admin" || me.active !== true) return json({ error: "Apenas administradores podem gerar links de acesso." }, 403);

  // 3) usuário-alvo
  const body = await req.json().catch(() => ({}));
  const targetId = body.userId;
  if (!targetId) return json({ error: "userId ausente." }, 400);
  const { data: target, error: tErr } = await admin.from("users").select("email, full_name").eq("id", targetId).maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!target) return json({ error: "Usuário não encontrado." }, 404);

  // 4) gera o token de recuperação (definir senha). Devolvemos o token_hash, e a
  //    página /entrar/ do sistema consome via verifyOtp (URL nossa, sem depender
  //    do redirect/Site URL do Supabase). O front monta o link com a própria origem.
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email });
  if (lErr) return json({ error: lErr.message }, 500);
  const token_hash = link?.properties?.hashed_token;
  if (!token_hash) return json({ error: "Não foi possível gerar o link." }, 500);

  return json({ ok: true, email: target.email, full_name: target.full_name, token_hash });
});
