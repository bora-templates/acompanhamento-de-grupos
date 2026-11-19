// Edge Function `admin-usuarios`
// ----------------------------------------------------------------------------
// Backend da GESTÃO DE USUÁRIOS (criar / editar / excluir pessoa + liberar
// acesso aos subsistemas). SUBSTITUI o antigo `crm-api` (Railway) — aqui
// NÃO tem nada do chat: só mexe em Supabase Auth + hub.users/roles/areas.
//
// ⚠️ Nome `admin-usuarios` (e não `admin-users`) de propósito: já existe uma
//    Function `admin-users` neste MESMO projeto (Metas /
//    Insights, outra tabela). Nomes de Function são únicos por projeto.
//
// Fonte da verdade: Supabase Auth (auth.users) + hub.users. O service_role fica
// AQUI (secret do servidor) — NUNCA no HTML. Só ADMIN pode chamar.
// Irmã de: admin-reset-password, admin-generate-link (mesma família).
//
// Deploy (dev):
//   supabase functions deploy admin-usuarios --project-ref SEU_PROJETO
//   (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetados no ambiente)
//   Opcional: supabase secrets set INVITE_REDIRECT_URL=https://app.seudominio.com.br/entrar/
//   (a página /entrar/ já existe e define a senha; precisa estar na allowlist de
//    Redirect URLs do projeto: Dashboard → Authentication → URL Configuration.)
//
// O front chama com o JWT da sessão (via OS.getClient().functions.invoke):
//   POST /functions/v1/admin-usuarios  { action, ...payload }
//   actions: "list" | "cargos" | "create" | "update" | "delete"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const sanitizeIds = (ids?: string[]) => (ids ?? []).filter(isUuid);

type DB = ReturnType<typeof createClient>;

// Áreas (hub.areas) a partir dos cargos → preenche hub.users.area_ids.
async function areasFromCargos(db: DB, cargoIds: string[]): Promise<string[]> {
  if (!cargoIds.length) return [];
  const { data } = await db.from("roles").select("area_id").in("id", cargoIds);
  const set = new Set<string>();
  for (const r of data ?? []) if (r.area_id) set.add(r.area_id as string);
  return [...set];
}

// LISTA usuários + resolve os nomes dos cargos.
async function listUsers(db: DB) {
  const { data: users, error } = await db.from("users")
    .select("id,email,full_name,access_level,active,chat_enabled,acessos,cargo_ids,avatar_url,cor")
    .order("full_name");
  if (error) throw new Error(error.message);
  const { data: roles } = await db.from("roles").select("id,name");
  const roleName = new Map((roles ?? []).map((r: any) => [String(r.id), r.name]));
  return (users ?? []).map((u: any) => ({
    ...u,
    acessos: u.acessos ?? {},
    cargo_ids: (u.cargo_ids ?? []).map(String),
    cargos: (u.cargo_ids ?? []).map((id: any) => roleName.get(String(id))).filter(Boolean).sort(),
  }));
}

// CARGOS (hub.roles + área) pro seletor.
async function listCargos(db: DB) {
  const { data, error } = await db.from("roles").select("id,name,order_index,area:areas(name)");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) => ({ id: String(r.id), name: r.name, area: r.area?.name ?? "", order_index: r.order_index ?? 0 }))
    .sort((a, b) => a.area.localeCompare(b.area) || a.order_index - b.order_index || a.name.localeCompare(b.name))
    .map(({ id, name, area }) => ({ id, name, area }));
}

// CRIA: convite no Supabase (e-mail) + perfil no hub.
async function createUser(db: DB, dto: any, redirectTo: string) {
  const email = String(dto.email || "").trim().toLowerCase();
  if (!email) return json({ error: "E-mail é obrigatório." }, 400);

  // 1) convite → cria auth.users e dispara e-mail. O gatilho hub.handle_new_auth_user cria hub.users.
  const { data: inv, error: invErr } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: dto.fullName ?? "" },
    redirectTo,
  });
  // 18/09/2026 — o login JÁ EXISTE mas a pessoa ficou sem cadastro no hub
  // (o gatilho mandou pra hub.logins_fora_do_time — ver o passo 2). Ativar de
  // novo dava "e-mail já registrado" e não havia saída. Só aceita quem está
  // NAQUELA lista: login de fora do time que o admin decidiu trazer.
  let authUserId = inv?.user?.id as string | undefined;
  let jaTinhaLogin = false;
  let emailEnviado = !!authUserId && !invErr;
  if (!authUserId && /already|registered|exists/i.test(invErr?.message ?? "")) {
    const { data: fora } = await db.from("logins_fora_do_time").select("auth_id")
      .ilike("email", email).limit(1).maybeSingle();
    if (fora?.auth_id) { authUserId = fora.auth_id as string; jaTinhaLogin = true; }
  }
  // 12/10/2026: o e-mail padrão do Supabase só entrega para quem é membro da organização
  // dele (e 2 por hora). Numa instalação nova, sem SMTP próprio, o convite por e-mail
  // falhava e a pessoa nem era criada. Agora ela é criada mesmo assim, sem e-mail, e a
  // tela Usuários mostra o link de acesso do app-convite para mandar pelo WhatsApp.
  if (!authUserId && !/already|registered|exists/i.test(invErr?.message ?? "")) {
    const { data: criado } = await db.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { full_name: dto.fullName ?? "" },
    });
    if (criado?.user?.id) { authUserId = criado.user.id; emailEnviado = false; }
  }
  if (!authUserId)
    return json({ error: `Falha ao convidar no Supabase: ${invErr?.message ?? "sem id"}` }, 400);

  // 2) perfil no hub. role_id = 1º cargo (compat Performance).
  // ⚠️ 18/09/2026: NÃO dá pra confiar que o gatilho criou a linha. Desde
  // 27/08 ele só cria quem chega com `invited_at`, e o convite do Supabase
  // grava o usuário PRIMEIRO e carimba o `invited_at` ~50 ms depois, num
  // update — o gatilho (after insert) vê nulo e manda a pessoa pra
  // hub.logins_fora_do_time. O `update` abaixo então mexia em ZERO linhas,
  // sem erro, e a tela dizia "ativado" (caso do Francisco, 18/09). Agora:
  // atualizou nada → cria a linha aqui.
  const cargoIds = sanitizeIds(dto.cargoIds);
  const areaIds = await areasFromCargos(db, cargoIds);
  const acessos = dto.acessos ?? {};
  // o acesso do chat guarda false, 'view', true ou 'admin'; chat_enabled é sim ou não: só o false fecha
  const chatEnabled = acessos.chat === undefined ? (dto.chatEnabled ?? true) : acessos.chat !== false;
  const { data: upRows, error: upErr } = await db.from("users").update({
    // 28/08/2026 — o gatilho hub.handle_new_auth_user passou a criar TODA ficha
    // nova como `active = false`, porque ele dispara pra qualquer cadastro no
    // Supabase (inclusive de quem se inscreveu sozinho ou entrou com Google).
    // Quem ATIVA é este convite, que só o admin de usuários consegue disparar.
    active: true,
    full_name: dto.fullName,
    access_level: dto.accessLevel,
    cargo_ids: cargoIds,
    area_ids: areaIds,
    acessos,
    chat_enabled: chatEnabled,
    role_id: cargoIds[0] ?? null,
    cor: /^#[0-9A-Fa-f]{6}$/.test(String(dto.cor ?? "")) ? String(dto.cor).toUpperCase() : null,
  }).eq("id", authUserId).select("id");
  if (upErr) return json({ error: `Convidado, mas falhou ao salvar o perfil: ${upErr.message}` }, 500);

  if (!upRows?.length) {
    // a empresa desta instalação: a única linha de hub.tenants (base/banco/dados-iniciais.sql)
    const { data: tenant } = await db.from("tenants").select("id").order("created_at").limit(1).maybeSingle();
    const { error: insErr } = await db.from("users").insert({
      id: authUserId, tenant_id: tenant?.id ?? null, email,
      active: true,
      full_name: dto.fullName || email.split("@")[0],
      access_level: dto.accessLevel || "collaborator",
      cargo_ids: cargoIds,
      area_ids: areaIds,
      acessos,
      chat_enabled: chatEnabled,
      role_id: cargoIds[0] ?? null,
      cor: /^#[0-9A-Fa-f]{6}$/.test(String(dto.cor ?? "")) ? String(dto.cor).toUpperCase() : null,
    });
    if (insErr) return json({ error: `Convidado, mas não consegui criar o cadastro: ${insErr.message}` }, 500);
  }

  return json({ id: authUserId, email, invited: !jaTinhaLogin, ja_tinha_login: jaTinhaLogin, email_enviado: emailEnviado });
}

// EDITA perfil no hub.
async function updateUser(db: DB, id: string, dto: any) {
  if (!isUuid(id)) return json({ error: "id inválido." }, 400);
  const { data: existing } = await db.from("users").select("email").eq("id", id).maybeSingle();
  if (!existing) return json({ error: "Usuário não encontrado." }, 404);

  const patch: Record<string, unknown> = {};
  if (dto.fullName !== undefined) patch.full_name = dto.fullName;
  // cor pessoal (paleta secundária) — só hex de 6 dígitos; qualquer outra coisa limpa
  if (dto.cor !== undefined) patch.cor = /^#[0-9A-Fa-f]{6}$/.test(String(dto.cor ?? "")) ? String(dto.cor).toUpperCase() : null;
  // E-MAIL = LOGIN (22/09/2026, ficha do RH: "deixe editável todos os
  // campos"). Troca primeiro no Supabase Auth — é por lá que a pessoa entra — e
  // só então no hub.users. Endereço que já é de outra pessoa é recusado.
  if (dto.email !== undefined) {
    const novo = String(dto.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) return json({ error: "E-mail inválido." }, 400);
    if (novo !== String((existing as any).email || "").toLowerCase()) {
      const { data: dup } = await db.from("users").select("id").ilike("email", novo).neq("id", id).limit(1).maybeSingle();
      if (dup) return json({ error: "Esse e-mail já é de outra pessoa no sistema. Confira o e-mail ou edite o cadastro dessa pessoa na tela Usuários." }, 409);
      const { error: aErr } = await db.auth.admin.updateUserById(id, { email: novo, email_confirm: true });
      if (aErr) return json({ error: `Falha ao trocar o login: ${aErr.message}` }, 400);
      patch.email = novo;
    }
  }
  if (dto.accessLevel !== undefined) patch.access_level = dto.accessLevel;
  if (dto.active !== undefined) patch.active = dto.active;
  if (dto.cargoIds !== undefined) {
    const ids = sanitizeIds(dto.cargoIds);
    patch.cargo_ids = ids;
    patch.area_ids = await areasFromCargos(db, ids);
    patch.role_id = ids[0] ?? null;
  }
  if (dto.acessos !== undefined) {
    patch.acessos = dto.acessos;
    patch.chat_enabled = dto.acessos.chat === undefined ? true : dto.acessos.chat !== false; // compat com o gating antigo ('view' e 'admin' também abrem)
  } else if (dto.chatEnabled !== undefined) {
    patch.chat_enabled = dto.chatEnabled;
  }

  if (Object.keys(patch).length) {
    const { error } = await db.from("users").update(patch).eq("id", id);
    if (error) return json({ error: `Falha ao salvar: ${error.message}` }, 500);
  }
  return json({ id, email: (patch.email as string) || (existing as any).email, updated: true });
}

// EXCLUI: apaga do Supabase Auth (cascateia hub.users pelo gatilho/FK).
async function deleteUser(db: DB, id: string) {
  if (!isUuid(id)) return json({ error: "id inválido." }, 400);
  const { data: existing } = await db.from("users").select("email").eq("id", id).maybeSingle();
  if (!existing) return json({ error: "Usuário não encontrado." }, 404);

  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return json({ error: `Falha ao remover no Supabase: ${error.message}` }, 400);
  return json({ id, email: (existing as any).email, deleted: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = (Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
  const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") ?? "https://app.seudominio.com.br/entrar/";
  const db = createClient(url, service, { db: { schema: "hub" }, auth: { persistSession: false } });

  // 1) valida quem chamou
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Sem token de sessão." }, 401);
  const { data: caller, error: cErr } = await db.auth.getUser(jwt);
  if (cErr || !caller?.user) return json({ error: "Sessão inválida ou expirada." }, 401);

  // 2) o chamador é admin ativo?
  const { data: me } = await db.from("users").select("access_level, active").eq("id", caller.user.id).maybeSingle();
  if (!me || (me as any).access_level !== "admin" || (me as any).active === false)
    return json({ error: "Acesso restrito à administração de usuários." }, 403);

  // 3) roteia a ação
  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "list":   return json({ data: await listUsers(db) });
      case "cargos": return json({ data: await listCargos(db) });
      case "create": return await createUser(db, body, redirectTo);
      case "update": return await updateUser(db, body.id, body);
      case "delete": return await deleteUser(db, body.id);
      default:       return json({ error: `action desconhecida: ${body.action}` }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
