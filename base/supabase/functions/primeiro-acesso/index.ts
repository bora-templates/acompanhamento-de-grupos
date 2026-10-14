// Edge Function `primeiro-acesso` — cria o PRIMEIRO ADMINISTRADOR do sistema
// ----------------------------------------------------------------------------
// Numa instalação nova não existe ninguém pra convidar ninguém. Esta porta
// resolve isso UMA vez: quem instalou abre o site (/primeiro-acesso/), digita a
// CHAVE DE INSTALAÇÃO e os dados, e o primeiro admin nasce. Depois que existe
// um admin ativo, a porta se fecha pra sempre (o banco recusa).
//
//   GET  → { disponivel: boolean, configurada: boolean }
//   POST { chave, empresa, nome, email, senha } → { ok: true }
//
// Travas:
//   · a chave de instalação mora no segredo PRIMEIRO_ACESSO_CHAVE (nunca no
//     site); comparada em tempo constante. Sem o segredo → 503.
//   · 10 chaves erradas por hora no mesmo ip (ou 50 no total) → bloqueado por
//     uma hora (hub.primeiro_acesso_tentativas, só se insere).
//   · dois pedidos ao mesmo tempo: o banco serializa (advisory lock em
//     hub.primeiro_acesso_concluir) e o segundo é recusado; o login criado por
//     ele é apagado.
//   · se o passo do banco falhar, o login recém-criado no Auth é apagado.
//
// Publicar (é PÚBLICA: quem chama ainda não tem login, então sem verificar JWT):
//   supabase secrets set PRIMEIRO_ACESSO_CHAVE="uma-frase-longa-que-só-você-sabe" --project-ref SEU_PROJETO
//   supabase functions deploy primeiro-acesso --project-ref SEU_PROJETO --no-verify-jwt
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm no ambiente da função.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const CHAVE = (Deno.env.get("PRIMEIRO_ACESSO_CHAVE") ?? "").trim();
const db = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "hub" },
});

// compara as duas chaves sem vazar, pelo tempo, quantas letras acertou
async function mesmaChave(a: string, b: string) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

function ipDe(req: Request) {
  const f = req.headers.get("x-forwarded-for") || "";
  return (f.split(",")[0] || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "desconhecido").trim().slice(0, 80);
}

async function disponivel() {
  const { data, error } = await db.rpc("primeiro_acesso_disponivel");
  if (error) throw error;
  return data === true;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return json({ disponivel: await disponivel(), configurada: !!CHAVE });
    if (req.method !== "POST") return json({ erro: "use GET ou POST" }, 405);

    if (!CHAVE) return json({ erro: "Esta instalação está sem chave de primeiro acesso. Quem instalou precisa definir o segredo PRIMEIRO_ACESSO_CHAVE." }, 503);

    const ip = ipDe(req);
    const { data: bloq } = await db.rpc("primeiro_acesso_bloqueado", { p_ip: ip });
    if (bloq === true) return json({ erro: "Muitas tentativas com a chave errada. Espere uma hora e tente de novo." }, 429);

    let corpo: Record<string, unknown> = {};
    try { corpo = await req.json(); } catch { /* corpo vazio */ }
    const chave = texto(corpo.chave), empresa = texto(corpo.empresa), nome = texto(corpo.nome);
    const email = texto(corpo.email).toLowerCase(), senha = typeof corpo.senha === "string" ? corpo.senha : "";

    const falta: string[] = [];
    if (!chave) falta.push("a chave de instalação");
    if (empresa.length < 2) falta.push("o nome da empresa");
    if (nome.length < 2) falta.push("o seu nome");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) falta.push("um e-mail válido");
    if (senha.length < 8) falta.push("uma senha de pelo menos 8 caracteres");
    if (senha.length > 72) falta.push("uma senha de até 72 caracteres");
    if (falta.length) return json({ erro: "Falta " + falta.join(", ") + "." }, 400);

    if (!(await mesmaChave(chave, CHAVE))) {
      await db.rpc("primeiro_acesso_registrar", { p_ip: ip, p_ok: false });
      return json({ erro: "A chave de instalação não confere." }, 401);
    }
    if (!(await disponivel())) return json({ erro: "Este sistema já tem administrador. Entre pela página inicial." }, 409);

    // o login (Auth), já com o e-mail confirmado
    const { data: criado, error: eAuth } = await db.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { full_name: nome },
    });
    if (eAuth || !criado?.user) {
      const ja = /already|registered|exists/i.test(eAuth?.message || "");
      console.error("[primeiro-acesso] criar login:", eAuth?.message);
      return json({ erro: ja ? "Esse e-mail já tem login neste sistema. Use outro e-mail." : "Não consegui criar o login agora. Tente de novo." }, ja ? 409 : 500);
    }
    const uid = criado.user.id;

    // a ficha de administrador e a empresa (o banco recusa se já existir admin)
    const { error: eBanco } = await db.rpc("primeiro_acesso_concluir", { p_uid: uid, p_nome: nome, p_empresa: empresa });
    if (eBanco) {
      // desfaz: o login recém-criado sai do Auth e da lista de "fora do time"
      await db.auth.admin.deleteUser(uid).catch(() => {});
      await db.from("logins_fora_do_time").delete().eq("auth_id", uid);
      const ja = /já tem administrador/i.test(eBanco.message || "");
      console.error("[primeiro-acesso] concluir:", eBanco.message);
      return json({ erro: ja ? "Este sistema já tem administrador. Entre pela página inicial." : "Não consegui terminar o cadastro agora. Tente de novo." }, ja ? 409 : 500);
    }

    await db.rpc("primeiro_acesso_registrar", { p_ip: ip, p_ok: true });
    // o endereço do site (de onde o admin nasceu) vira a base dos links que o banco
    // manda por e-mail (hub.site_url()). Só grava se ainda não houver um.
    const origem = (req.headers.get("origin") || "").trim();
    if (/^https?:\/\/[^/\s]+$/.test(origem)) await db.rpc("primeiro_acesso_site", { p_site: origem });
    return json({ ok: true });
  } catch (e) {
    console.error("[primeiro-acesso]", (e as Error)?.message || e);
    return json({ erro: "Não consegui falar com o banco agora. Tente de novo em instantes." }, 500);
  }
});
