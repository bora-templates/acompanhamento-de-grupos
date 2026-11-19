// RH — admin-reset-password
// Um ADMIN reseta a senha de um usuário do sistema (Supabase Auth).
// Chamada pelo /usuarios/. Fluxo:
//   1) valida o JWT de quem chamou (Authorization: Bearer <sessão Supabase>)
//   2) confere que o CHAMADOR é admin em hub.users (access_level = 'admin')
//   3) gera uma senha forte e aplica no Auth do usuário-alvo
//   4) devolve a senha nova pro admin repassar (não é enviada por e-mail aqui)
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

// Senha forte de 12 chars: 1 maiúscula + 1 minúscula + 1 dígito + 1 símbolo,
// sem caracteres ambíguos (0/O/1/l/I). Usa CSPRNG (crypto.getRandomValues).
function gerarSenha(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789", S = "!@#$%*?";
  const all = U + L + D + S;
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const chars = [U[r[0] % U.length], L[r[1] % L.length], D[r[2] % D.length], S[r[3] % S.length]];
  for (let i = 4; i < 12; i++) chars.push(all[r[i] % all.length]);
  // embaralha (Fisher-Yates) pra posição do obrigatório não ser previsível
  const sh = new Uint32Array(chars.length); crypto.getRandomValues(sh);
  for (let i = chars.length - 1; i > 0; i--) { const j = sh[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
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
  if (!me || me.access_level !== "admin" || me.active !== true) return json({ error: "Apenas administradores podem resetar senhas." }, 403);

  // 3) usuário-alvo
  const body = await req.json().catch(() => ({}));
  const targetId = body.userId;
  if (!targetId) return json({ error: "userId ausente." }, 400);
  const { data: target, error: tErr } = await admin.from("users").select("email, full_name").eq("id", targetId).maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!target) return json({ error: "Usuário não encontrado." }, 404);

  // 4) gera e aplica a senha nova
  const senha = gerarSenha();
  const { error: upErr } = await admin.auth.admin.updateUserById(targetId, { password: senha });
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ ok: true, email: target.email, full_name: target.full_name, password: senha });
});
