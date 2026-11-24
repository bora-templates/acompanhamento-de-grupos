// ============================================================================
// uazapi.ts: a conversa com a uazapi (API v2) e a leitura das mensagens dela
// ----------------------------------------------------------------------------
// O mesmo protocolo que o Atendimento usa pela Zappfy (atendimento/supabase/functions/_shared/
// provedores/zappfy.ts): cabeçalho `token` com o token da instância e as rotas /send/*,
// /message/* e /group/*. O endereço do servidor e o token vêm dos ajustes da solução
// (gr_ajustes e o cofre do Supabase), nunca do navegador.
//
//   GET  /instance/status         o número está conectado? (e o QR, enquanto conecta)
//   POST /instance/connect        pede o QR
//   GET  /webhook · POST /webhook lê e cadastra o endereço que recebe as mensagens
//                                 (o POST troca o webhook que já existe na instância)
//   GET  /group/list              os grupos do número, com os participantes
//   POST /group/info              nome e participantes de um grupo
//   POST /send/text               manda o resumo ao grupo
//   POST /message/download        baixa o áudio para a transcrição
//   POST /message/find            as mensagens recentes que a uazapi guardou (importação)
//
// Toda chamada passa pelo rede.ts: só https e endereço público, sem seguir redirecionamento e
// com a resposta lida até 5 MB (o download do áudio, até 25 MB de áudio). O tempo limite é de
// 60 segundos para /group/list, /message/find, /message/download e /send/text, e de 15
// segundos para o resto. Falha ou corte na leitura da resposta é erro da chamada (demorou),
// nunca um sucesso vazio. Resposta com campo faltando não quebra: a leitura procura pelos
// nomes conhecidos e cai num padrão seguro.
// UMA função lê a mensagem (lerMensagemUazapi), venha ela do webhook ou da importação, e o
// texto sai dela pronto para o banco (texto.ts).
// Nada aqui grava, imprime ou devolve o token.
// ============================================================================
import { buscar, comoTexto, conferirEnderecoPublico, ErroRede, hostPublico, MB, TETO_AUDIO, TETO_UAZAPI, type TipoFalha } from "./rede.ts";
import { limpoECortado, textoLimpo } from "./texto.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

export type ConfigUazapi = { servidor: string; token: string };
export type RespostaUazapi = {
  ok: boolean;
  status: number;
  dados: Json;
  demorou: boolean;            // vale true quando o prazo acabou ou a resposta foi cortada no meio da leitura
  semResposta: boolean;        // vale true quando a chamada nem chegou a ter resposta
  falha?: TipoFalha | null;    // guarda o tipo da falha de rede (endereço, redirecionamento, tempo, tamanho ou leitura)
  prazoMs?: number;
  esperaMs?: number | null;    // guarda o retry-after da resposta 429 ou 503
  nulo?: boolean;              // vale true quando o corpo foi o JSON null (a uazapi responde assim quando não há nada)
};
export type Tipo = "texto" | "audio" | "imagem" | "video" | "documento" | "figurinha" | "outro";

export type MensagemLida = {
  whatsapp_id: string;
  chat_jid: string;
  autor_jid: string | null;
  autor_nome: string | null;
  do_time: boolean;              // vale true quando veio do número conectado (fromMe)
  tipo: Tipo;
  texto: string | null;          // guarda o texto ou a legenda (o áudio chega sem texto, e a transcrição vem depois)
  arquivo_nome: string | null;   // guarda o nome do documento
  citada_id: string | null;      // guarda o id da mensagem respondida
  momento: string;               // vem no formato ISO
  grupo_nome: string | null;
};
export type Leitura = { guardar: true; mensagem: MensagemLida } | { guardar: false; motivo: string };
export type ParticipanteLido = { jid: string; nome: string | null; telefone: string | null; admin: boolean };
export type GrupoLido = { jid: string; nome: string; pessoas: number; participantes: ParticipanteLido[] | null };
export type EstadoLido = { estado: "conectado" | "aguardando_qr" | "desconectado"; numero: string | null; qr: string | null };

export const PRAZO_UAZAPI_MS = 15_000;
// /group/list, /message/find, /message/download e /send/text têm 60 segundos
export const PRAZO_LONGO_MS = 60_000;
/* O JSON do /message/download pode trazer o áudio inteiro em base64 (25 MB de áudio viram uns 34 MB). */
const TETO_DOWNLOAD = Math.ceil(TETO_AUDIO * 4 / 3) + MB;

// ── ajudantes puros ─────────────────────────────────────────────────────────

/** "5511999990000@s.whatsapp.net" e "123:45@lid" viram "5511999990000" e "123". */
export const semSufixo = (v: unknown) => String(v ?? "").split("@")[0].split(":")[0];
/** "123:92@lid" vira "123@lid": o trecho depois dos dois-pontos é o aparelho, e a pessoa é a mesma. */
export const semAparelho = (v: unknown) => String(v ?? "").replace(/:\d+(?=@)/, "");
export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** epoch em segundos ou milissegundos → milissegundos (0 quando não dá para ler). */
export function msDe(v: unknown): number {
  let n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? t : 0;
  }
  if (n < 1e11) n *= 1000;
  return n;
}

/** O endereço base que a pessoa digitou: só https, sem usuário e senha, sem ? nem #. */
export function conferirServidor(valor: unknown): { ok: true; servidor: string } | { ok: false; erro: string } {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return { ok: false, erro: "Informe o endereço do servidor da uazapi, começando com https://." };
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    return { ok: false, erro: "O endereço do servidor da uazapi não parece um endereço válido. Copie o endereço do painel da uazapi, começando com https://." };
  }
  if (u.protocol !== "https:") return { ok: false, erro: "O endereço do servidor da uazapi precisa começar com https://." };
  if (u.username || u.password) {
    return { ok: false, erro: "O endereço do servidor não pode ter usuário e senha. Use só o endereço e informe o token no campo próprio." };
  }
  if (u.search || u.hash || /[?#]/.test(bruto)) return { ok: false, erro: "O endereço do servidor não pode ter ? nem #. Use só o endereço base da uazapi." };
  if (!hostPublico(u.hostname)) {
    return { ok: false, erro: "O endereço do servidor da uazapi precisa ser um endereço público da internet. Endereço interno, localhost e IP de rede privada não são aceitos." };
  }
  return { ok: true, servidor: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}` };
}

/** Os dois endereços são o mesmo, sem contar a parte depois do ? (onde mora a chave)? */
export function mesmoEndereco(a: string, b: string): boolean {
  const base = (x: string) => {
    try {
      const u = new URL(x);
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      return String(x).split("?")[0].replace(/\/+$/, "").toLowerCase();
    }
  };
  return base(a) === base(b);
}

/** O endereço sem a parte depois do ? (que pode carregar a chave de outro sistema). */
export function enderecoSemSegredo(x: string): string {
  try {
    const u = new URL(x);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return String(x).split("?")[0].slice(0, 200);
  }
}

/** O QR no formato que a tela mostra, data:image/png;base64 seguido da imagem (nulo se não for imagem). */
export function qrComoImagem(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^data:image\//i.test(s)) return s;
  const limpo = s.replace(/\s+/g, "");
  if (limpo.length > 200 && /^[A-Za-z0-9+/]+=*$/.test(limpo)) return "data:image/png;base64," + limpo;
  return null;
}

/** O número de telefone a partir de um JID (texto ou objeto { user }). */
export function numeroDe(v: unknown): string | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return numeroDe(o.user ?? o.User ?? o.jid ?? o.JID ?? "");
  }
  const d = soDigitos(semSufixo(v));
  return d || null;
}

/** Lê a resposta do estado (ou do connect) da instância. */
export function lerEstado(d: Json): EstadoLido {
  const inst = d && typeof d.instance === "object" && d.instance ? d.instance : {};
  const st = d && typeof d.status === "object" && d.status ? d.status : {};
  const textos = [inst.status, typeof d?.status === "string" ? d.status : "", d?.state, inst.state]
    .map((x) => String(x ?? "").toLowerCase());
  const logado = st.loggedIn === true || d?.loggedIn === true;
  const negado = st.loggedIn === false || d?.loggedIn === false;
  const conectado = logado ||
    (!negado && (st.connected === true || d?.connected === true || textos.includes("connected") || textos.includes("open")));
  const qr = qrComoImagem(inst.qrcode ?? d?.qrcode ?? d?.qrCode ?? d?.base64 ?? d?.qr);
  const conectando = textos.some((t) => t === "connecting" || t === "qr" || t === "qrcode");
  const numero = numeroDe(inst.owner ?? d?.owner ?? st.jid ?? d?.jid ?? inst.wid ?? "");
  if (conectado) return { estado: "conectado", numero, qr: null };
  return { estado: qr || conectando ? "aguardando_qr" : "desconectado", numero: null, qr };
}

/** Lê os webhooks da instância (lista, objeto único ou { webhooks: [] }). */
export function lerWebhooks(d: Json): { url: string; ativo: boolean }[] {
  const lista = Array.isArray(d) ? d
    : Array.isArray(d?.webhooks) ? d.webhooks
    : d && typeof d === "object" && (d.url || d.URL) ? [d]
    : [];
  return lista
    .map((w: Json) => ({ url: String(w?.url ?? w?.URL ?? "").trim(), ativo: w?.enabled !== false && w?.Enabled !== false }))
    .filter((w: { url: string }) => w.url);
}

/** Lê os participantes de um grupo (o formato do whatsmeow que a uazapi devolve, e variações). */
export function lerParticipantes(lista: Json): ParticipanteLido[] {
  if (!Array.isArray(lista)) return [];
  const saida: ParticipanteLido[] = [];
  for (const p of lista) {
    if (!p || typeof p !== "object") continue;
    const jid = limpoECortado(semAparelho(String(p.JID ?? p.jid ?? p.id ?? p.LID ?? p.lid ?? "").trim()), 200);
    if (!jid) continue;
    const foneBruto = p.PhoneNumber ?? p.phoneNumber ?? p.phone ?? (jid.endsWith("@s.whatsapp.net") ? jid : "");
    const telefone = soDigitos(semSufixo(foneBruto)).slice(0, 30) || null;
    const nome = limpoECortado(textoLimpo(p.DisplayName ?? p.displayName ?? p.Name ?? p.name ?? p.PushName ?? p.pushName ?? "").trim(), 200) || null;
    const admin = p.IsAdmin === true || p.isAdmin === true || p.IsSuperAdmin === true || p.isSuperAdmin === true ||
      p.admin === true || p.admin === "admin" || p.admin === "superadmin";
    saida.push({ jid, nome, telefone, admin });
  }
  return saida;
}

/** Lê um grupo (o objeto da lista ou da resposta de /group/info). */
export function lerGrupo(g: Json): GrupoLido | null {
  if (!g || typeof g !== "object") return null;
  const jid = textoLimpo(String(g.JID ?? g.jid ?? g.id ?? g.chatid ?? g.wa_chatid ?? "")).trim().toLowerCase();
  if (!jid.endsWith("@g.us") || jid.length > 200) return null;
  const nome = limpoECortado(textoLimpo(g.Name ?? g.name ?? g.Subject ?? g.subject ?? g.wa_name ?? "").trim(), 200) || "Grupo sem nome";
  const brutos = g.Participants ?? g.participants;
  const participantes = Array.isArray(brutos) ? lerParticipantes(brutos) : null;
  const tamanho = Number(g.Size ?? g.size ?? g.ParticipantCount ?? g.participantsCount ?? g.participants_count ?? 0) || 0;
  return { jid, nome, pessoas: participantes ? participantes.length : Math.max(0, Math.floor(tamanho)), participantes };
}

/** Lê a lista de grupos ({ groups: [] }, lista pura ou { data: [] }). */
export function lerGrupos(d: Json): GrupoLido[] {
  const lista = Array.isArray(d) ? d : Array.isArray(d?.groups) ? d.groups : Array.isArray(d?.data) ? d.data : [];
  const vistos = new Set<string>();
  const saida: GrupoLido[] = [];
  for (const g of lista) {
    const lido = lerGrupo(g);
    if (lido && !vistos.has(lido.jid)) {
      vistos.add(lido.jid);
      saida.push(lido);
    }
  }
  return saida;
}

// ── a leitura das mensagens (webhook e importação) ──────────────────────────

const descartar = (motivo: string): Leitura => ({ guardar: false, motivo });

function conteudoDe(m: Json): Json {
  return m && typeof m.content === "object" && m.content ? m.content : null;
}

function textoDe(m: Json): string {
  const c = conteudoDe(m);
  const candidatos = [m?.text, m?.caption, c?.text, c?.caption, c?.conversation,
    typeof m?.content === "string" ? m.content : null, m?.body];
  for (const v of candidatos) {
    const t = textoLimpo(v).trim();
    if (t) return t;
  }
  return "";
}

/** O id da mensagem sem o dono na frente ("5515999990000:3EB0A1" vira "3EB0A1"). */
const semDono = (v: string) => (v.includes(":") ? v.slice(v.lastIndexOf(":") + 1) : v);

/** O que a mensagem é. Nulo quando o tipo é desconhecido. */
function tipoDe(m: Json): Tipo | null {
  const t = String(m?.messageType ?? m?.type ?? "").toLowerCase();
  const midia = String(m?.mediaType ?? "").toLowerCase();
  if (/audio|ptt/.test(t) || /^(audio|ptt|voice)$/.test(midia)) return "audio";
  if (/sticker/.test(t) || midia === "sticker") return "figurinha";
  if (/image/.test(t) || midia === "image") return "imagem";
  if (/video|ptv/.test(t) || midia === "video" || midia === "ptv") return "video";
  if (/document/.test(t) || midia === "document") return "documento";
  if (/conversation|extendedtext|^text/.test(t)) return "texto";
  if (/location|contact|vcard|event|product|order|payment|call|list|button|template/.test(t)) return "outro";
  return null;
}

/** O que a uazapi manda e a solução não guarda: reação, enquete, voto, edição e mensagem apagada. */
function motivoDeDescarte(m: Json): string | null {
  const t = String(m?.messageType ?? m?.type ?? "");
  if (/reaction/i.test(t)) return "reação";
  if (/poll|vote/i.test(t)) return "enquete ou voto";
  if (/revoke|delete/i.test(t) || m?.deleted === true || m?.revoked === true || m?.isDeleted === true) return "mensagem apagada";
  if (/edit/i.test(t)) return "edição";
  if (/protocol/i.test(t)) return "aviso do WhatsApp";
  if (!t && m?.vote && String(m.vote).trim()) return "enquete ou voto";
  return null;
}

/** A mensagem respondida: só os campos que dizem "isto responde aquilo" (sem chute). */
function idCitado(m: Json, meuId: string): string | null {
  const c = conteudoDe(m);
  const ctx = c?.contextInfo ?? m?.contextInfo ?? null;
  const quoted = m?.quoted;
  const candidatos = [
    typeof quoted === "string" ? quoted : null,
    quoted?.messageid, quoted?.messageId, quoted?.id, quoted?.stanzaId,
    m?.quotedMessageId, m?.quotedId,
    ctx?.stanzaID, ctx?.stanzaId,
  ];
  for (const v of candidatos) {
    const s = v == null || typeof v === "object" ? "" : semDono(textoLimpo(String(v)).trim());
    if (s && s !== meuId) return limpoECortado(s, 200);
  }
  return null;
}

/**
 * Lê UMA mensagem da uazapi (o objeto `message` do webhook e cada item de /message/find
 * têm o mesmo formato). Só fica o que é mensagem de grupo com conteúdo; o resto volta
 * com o motivo do descarte. Nunca lança erro.
 */
export function lerMensagemUazapi(m: Json, extra: { grupoNome?: string | null } = {}): Leitura {
  try {
    if (!m || typeof m !== "object") return descartar("sem mensagem");
    const chat = textoLimpo(String(m.chatid ?? m.chatId ?? m.remoteJid ?? "")).trim().toLowerCase();
    if (!chat.endsWith("@g.us") || chat.length > 200) return descartar("não é mensagem de grupo");
    const id = semDono(textoLimpo(String(m.messageid || m.messageId || m.id || "")).trim());
    if (!id) return descartar("mensagem sem id");
    const motivo = motivoDeDescarte(m);
    if (motivo) return descartar(motivo);

    const texto = textoDe(m);
    let tipo = tipoDe(m);
    if (!tipo) {
      if (!texto) return descartar("sem conteúdo");
      tipo = "texto";
    }
    if (tipo === "texto" && !texto) return descartar("texto vazio");

    const c = conteudoDe(m);
    const arquivo = tipo === "documento"
      ? textoLimpo(c?.fileName ?? c?.FileName ?? c?.title ?? m.fileName ?? m.docName ?? "").trim() || null
      : null;
    const deMim = m.fromMe === true || m.fromMe === "true" || m.fromMe === 1;
    const dono = soDigitos(m.owner);
    const autorJid = textoLimpo(typeof m.sender === "string" ? m.sender : typeof m.participant === "string" ? m.participant
      : typeof m.author === "string" ? m.author : "").trim() || (deMim && dono ? `${dono}@s.whatsapp.net` : "");
    const autorNome = textoLimpo(typeof m.senderName === "string" ? m.senderName : typeof m.pushName === "string" ? m.pushName
      : typeof m.notifyName === "string" ? m.notifyName : "").trim() || (deMim ? "Equipe" : "");
    const ms = msDe(m.messageTimestamp ?? m.timestamp ?? m.t);

    // texto do documento igual ao nome do arquivo não é legenda; áudio não tem legenda
    let textoFinal: string | null = texto || null;
    if (tipo === "audio") textoFinal = null;
    if (tipo === "documento" && textoFinal && arquivo && textoFinal === arquivo) textoFinal = null;

    const grupoNome = textoLimpo(extra.grupoNome ?? m.groupName ?? m.chatName ?? "").trim();
    const momento = ms && ms < 8.64e15 ? ms : Date.now();
    return {
      guardar: true,
      mensagem: {
        whatsapp_id: limpoECortado(id, 200),
        chat_jid: chat,
        autor_jid: autorJid ? limpoECortado(semAparelho(autorJid), 200) : null,
        autor_nome: autorNome ? limpoECortado(autorNome, 200) : null,
        do_time: deMim,
        tipo,
        texto: textoFinal ? limpoECortado(textoFinal, 20000) : null,
        arquivo_nome: arquivo ? limpoECortado(arquivo, 300) : null,
        citada_id: idCitado(m, id),
        momento: new Date(momento).toISOString(),
        grupo_nome: grupoNome ? limpoECortado(grupoNome, 200) : null,
      },
    };
  } catch (_) {
    return descartar("formato inesperado");
  }
}

/** Lê o corpo que a uazapi POSTA no webhook. Tudo que não é mensagem nova é descartado. */
export function lerEventoUazapi(corpo: Json): Leitura {
  try {
    if (!corpo || typeof corpo !== "object") return descartar("corpo vazio");
    const evento = String(corpo.EventType ?? corpo.event ?? corpo.type ?? "").trim();
    if (evento && !/^messages?(\.upsert)?$/i.test(evento)) return descartar(`evento ${evento.slice(0, 40)}`);
    const m = corpo.message ?? corpo.data?.message;
    if (!m || typeof m !== "object") return descartar("sem mensagem");
    return lerMensagemUazapi(m, { grupoNome: corpo.chat?.name ?? corpo.chat?.wa_name ?? null });
  } catch (_) {
    return descartar("formato inesperado");
  }
}

// ── as chamadas ─────────────────────────────────────────────────────────────

/** O retry-after (segundos ou data) em milissegundos, até 10 segundos. */
function esperaDe(cabecalhos: Headers): number | null {
  const v = (cabecalhos.get("retry-after") ?? "").trim();
  if (!v) return null;
  const s = Number(v);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), 10_000) : null;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamar(
  cfg: ConfigUazapi, metodo: "GET" | "POST", caminho: string, corpo?: unknown,
  opcoes: { prazoMs?: number; teto?: number } = {},
): Promise<RespostaUazapi> {
  const prazoMs = opcoes.prazoMs ?? PRAZO_UAZAPI_MS;
  const cabecalhos: Record<string, string> = { token: cfg.token, Accept: "application/json" };
  if (metodo === "POST") cabecalhos["Content-Type"] = "application/json";
  try {
    const r = await buscar(cfg.servidor + caminho, {
      method: metodo,
      headers: cabecalhos,
      body: metodo === "POST" ? JSON.stringify(corpo ?? {}) : undefined,
    }, { teto: opcoes.teto ?? TETO_UAZAPI, prazoMs });
    const texto = comoTexto(r.bytes);
    let dados: Json = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }
    const comErro = dados && typeof dados === "object" && !Array.isArray(dados) && dados.error;
    return {
      ok: r.ok && !comErro, status: r.status, dados, demorou: false, semResposta: false, falha: null, prazoMs,
      nulo: texto.trim() === "null",
      esperaMs: r.status === 429 || r.status === 503 ? esperaDe(r.headers) : null,
    };
  } catch (e) {
    const falha: TipoFalha = e instanceof ErroRede ? e.tipo : "conexao";
    // prazo acabado ou resposta cortada no meio: a uazapi pode ter feito o pedido, só não confirmou
    const demorou = falha === "tempo" || falha === "leitura";
    return { ok: false, status: e instanceof ErroRede ? e.status : 0, dados: null, demorou, semResposta: !demorou, falha, prazoMs };
  }
}

/** A frase clara para a tela quando a uazapi não fez o que foi pedido (nunca o texto que ela devolveu). */
export function erroUazapi(r: RespostaUazapi): string {
  switch (r.falha) {
    case "endereco":
      return "O endereço do servidor da uazapi precisa ser público e começar com https://. Confira o endereço em Ajustes.";
    case "redirecionamento":
      return "O servidor da uazapi respondeu com um redirecionamento para outro endereço, e a solução não segue redirecionamentos. Confira o endereço do servidor em Ajustes.";
    case "tamanho":
      return "A resposta da uazapi passou do tamanho que a solução aceita e foi descartada. Tente de novo. Se o aviso continuar, escolha um período menor.";
    case "tempo":
      return "A uazapi demorou demais para responder. Tente de novo. Se o aviso continuar, confira a instância no painel da uazapi.";
    case "leitura":
      return "A resposta da uazapi chegou incompleta. Tente de novo.";
    case "conexao":
      return "Não consegui falar com o servidor da uazapi. Confira o endereço do servidor e tente de novo.";
  }
  if (r.demorou) return "A uazapi demorou demais para responder. Tente de novo. Se o aviso continuar, confira a instância no painel da uazapi.";
  if (r.semResposta) return "Não consegui falar com o servidor da uazapi. Confira o endereço do servidor e tente de novo.";
  if (r.status === 401 || r.status === 403) return "A uazapi recusou o token da instância. Confira o token no painel da uazapi e salve de novo.";
  if (r.status === 404) return "O servidor da uazapi não reconheceu o pedido. Confira se o endereço do servidor está certo.";
  if (r.status === 429) return "A uazapi recusou por excesso de pedidos. Tente de novo. Se o aviso continuar, confira o plano da instância na uazapi.";
  if (r.status >= 500) return "O servidor da uazapi está com problema agora. Tente de novo. Se o aviso continuar, confira a instância no painel da uazapi.";
  return `A uazapi recusou o pedido (código ${r.status}). Confira o servidor e o token em Ajustes e tente de novo.`;
}

const FORMATO_ESTRANHO = "A uazapi respondeu num formato que a solução não reconhece. Confira o endereço do servidor em Ajustes.";
const ehObjeto = (v: Json) => !!v && typeof v === "object" && !Array.isArray(v);

type Falha = { ok: false; erro: string; status: number; demorou?: boolean };

export async function estadoDaInstancia(cfg: ConfigUazapi): Promise<({ ok: true } & EstadoLido) | Falha> {
  const r = await chamar(cfg, "GET", "/instance/status");
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou };
  if (!ehObjeto(r.dados)) return { ok: false, erro: FORMATO_ESTRANHO, status: r.status };
  return { ok: true, ...lerEstado(r.dados) };
}

export async function pedirQr(cfg: ConfigUazapi): Promise<({ ok: true } & EstadoLido) | Falha> {
  const r = await chamar(cfg, "POST", "/instance/connect", {});
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou };
  if (!ehObjeto(r.dados)) return { ok: false, erro: FORMATO_ESTRANHO, status: r.status };
  return { ok: true, ...lerEstado(r.dados) };
}

export async function webhooksDaInstancia(cfg: ConfigUazapi): Promise<{ ok: true; lista: { url: string; ativo: boolean }[] } | Falha> {
  const r = await chamar(cfg, "GET", "/webhook");
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status };
  // sem webhook cadastrado, a uazapi devolve o JSON null (conferido no servidor de verdade em 14/10/2026)
  if (r.dados === null && r.nulo) return { ok: true, lista: [] };
  if (!r.dados || typeof r.dados !== "object") return { ok: false, erro: FORMATO_ESTRANHO, status: r.status };
  return { ok: true, lista: lerWebhooks(r.dados) };
}

/** Cadastra o endereço que recebe as mensagens (troca o webhook que a instância tinha). */
export async function cadastrarWebhook(cfg: ConfigUazapi, url: string): Promise<{ ok: true } | Falha> {
  const r = await chamar(cfg, "POST", "/webhook", {
    enabled: true,
    url,
    events: ["messages"],
    // o resumo que a própria solução manda não volta como mensagem do grupo,
    // e conversa individual nem sai da uazapi
    excludeMessages: ["wasSentByApi", "isGroupNo"],
    // sem isso a uazapi pendura o nome do evento no fim do endereço e a chave se perde
    addUrlEvents: false,
    addUrlTypesMessages: false,
  });
  return r.ok ? { ok: true } : { ok: false, erro: erroUazapi(r), status: r.status };
}

/** Os grupos do número, sem os participantes (lista leve, para a escolha). */
export async function listarGrupos(cfg: ConfigUazapi): Promise<{ ok: true; grupos: GrupoLido[] } | Falha> {
  const r = await chamar(cfg, "GET", "/group/list?noparticipants=true", undefined, { prazoMs: PRAZO_LONGO_MS });
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou };
  if (!r.dados || typeof r.dados !== "object") return { ok: false, erro: FORMATO_ESTRANHO, status: r.status };
  return { ok: true, grupos: lerGrupos(r.dados) };
}

/** Nome e participantes de um grupo. Resposta sem a lista de participantes é erro. */
export async function infoDoGrupo(cfg: ConfigUazapi, jid: string): Promise<{ ok: true; nome: string | null; participantes: ParticipanteLido[] } | Falha> {
  const r = await chamar(cfg, "POST", "/group/info", { groupjid: jid, getInviteLink: false });
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou };
  const bruto = ehObjeto(r.dados) && ehObjeto(r.dados.group) && !("Participants" in r.dados || "participants" in r.dados) ? r.dados.group : r.dados;
  if (!ehObjeto(bruto) || !(Array.isArray(bruto.Participants) || Array.isArray(bruto.participants))) {
    return { ok: false, erro: "A uazapi não devolveu a lista de participantes deste grupo. Tente de novo.", status: r.status };
  }
  const g = lerGrupo(bruto) ?? lerGrupo({ ...bruto, JID: jid });
  return { ok: true, nome: g?.nome && g.nome !== "Grupo sem nome" ? g.nome : null, participantes: g?.participantes ?? [] };
}

export type FalhaDoEnvio = Falha & { semConfirmacao: boolean };

/**
 * Manda o texto ao grupo. Só tenta de novo quando a uazapi responde 429 ou 5xx (até 3 novas
 * tentativas, respeitando o retry-after). Prazo acabado ou resposta cortada voltam com
 * semConfirmacao: o WhatsApp pode ter mandado, só não confirmou a tempo.
 */
export async function enviarTexto(cfg: ConfigUazapi, para: string, texto: string): Promise<{ ok: true; id: string | null } | FalhaDoEnvio> {
  let r = await chamar(cfg, "POST", "/send/text", { number: para, text: texto }, { prazoMs: PRAZO_LONGO_MS });
  for (let nova = 1; nova <= 3 && !r.ok && !r.falha && (r.status === 429 || r.status >= 500); nova++) {
    await espera(r.esperaMs ?? 500 * 2 ** (nova - 1));
    r = await chamar(cfg, "POST", "/send/text", { number: para, text: texto }, { prazoMs: PRAZO_LONGO_MS });
  }
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou, semConfirmacao: r.demorou };
  const id = ehObjeto(r.dados) ? r.dados.messageid ?? r.dados.id ?? r.dados.key?.id ?? null : null;
  return { ok: true, id: id == null ? null : String(id) };
}

function deBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

/** O áudio que veio em base64 na resposta (nulo quando não veio ou não é base64). */
function audioEmBase64(d: Json): Uint8Array | null {
  if (!ehObjeto(d)) return null;
  const b64 = String(d.base64Data ?? d.base64 ?? d.data ?? d.file ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64) || b64.length * 3 / 4 > TETO_AUDIO) return null;
  try {
    const bytes = deBase64(b64);
    return bytes.length ? bytes : null;
  } catch (_) {
    return null;
  }
}

const mimeDe = (d: Json) => (ehObjeto(d) ? String(d.mimetype ?? d.mimeType ?? d.mime ?? "") : "").split(";")[0].trim();
const transitoria = (r: RespostaUazapi) => r.demorou || r.falha === "conexao" || r.status === 429 || r.status >= 500;

/** Uma chamada com uma nova tentativa quando a falha é passageira (prazo, conexão, 429 ou 5xx). */
async function comNovaTentativa(fazer: () => Promise<RespostaUazapi>): Promise<RespostaUazapi> {
  const r = await fazer();
  if (r.ok || !transitoria(r)) return r;
  await espera(r.esperaMs ?? 1000);
  return await fazer();
}

const LINK_RUIM = "O link do áudio que a uazapi devolveu não é um endereço https público, então o áudio não foi baixado.";

/**
 * Baixa o arquivo de um áudio, com 60 segundos e uma nova tentativa. Primeiro pede o link
 * (o arquivo vem direto, até 25 MB, e só de endereço https público); sem link aceitável, pede
 * o áudio em base64.
 */
export async function baixarAudio(cfg: ConfigUazapi, id: string): Promise<{ ok: true; bytes: Uint8Array; mime: string } | Falha> {
  const pedir = (comBase64: boolean) => comNovaTentativa(() => chamar(cfg, "POST", "/message/download",
    { id, return_base64: comBase64, return_link: !comBase64 }, { prazoMs: PRAZO_LONGO_MS, teto: TETO_DOWNLOAD }));
  const r = await pedir(false);
  if (!r.ok) return { ok: false, erro: erroUazapi(r), status: r.status, demorou: r.demorou };
  const direto = audioEmBase64(r.dados);
  if (direto) return { ok: true, bytes: direto, mime: mimeDe(r.dados) || "audio/ogg" };
  const link = ehObjeto(r.dados) ? String(r.dados.fileURL ?? r.dados.fileUrl ?? r.dados.url ?? r.dados.link ?? "").trim() : "";
  const conferido = link ? conferirEnderecoPublico(link) : null;
  if (conferido?.ok) {
    let erro = "Não consegui baixar o arquivo do áudio.";
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        const a = await buscar(conferido.url.href, { method: "GET" }, { teto: TETO_AUDIO, prazoMs: PRAZO_LONGO_MS });
        if (a.ok && a.bytes.length) return { ok: true, bytes: a.bytes, mime: mimeDe(r.dados) || a.headers.get("content-type")?.split(";")[0] || "audio/ogg" };
        erro = a.ok ? "O arquivo do áudio veio vazio." : "Não consegui baixar o arquivo do áudio.";
        if (a.ok || (a.status < 500 && a.status !== 429)) break;
      } catch (e) {
        const tipo = e instanceof ErroRede ? e.tipo : "conexao";
        erro = tipo === "tamanho" ? "O áudio passou de 25 MB e não foi baixado."
          : tipo === "tempo" ? "O download do áudio demorou demais."
          : tipo === "redirecionamento" ? "O link do áudio respondeu com um redirecionamento, e a solução não segue redirecionamentos."
          : "Não consegui baixar o arquivo do áudio.";
        if (tipo === "tamanho" || tipo === "redirecionamento") break;
      }
      if (tentativa === 1) await espera(1000);
    }
    return { ok: false, erro, status: 0 };
  }
  // sem link https público: o áudio em base64
  const r2 = await pedir(true);
  if (!r2.ok) return { ok: false, erro: erroUazapi(r2), status: r2.status, demorou: r2.demorou };
  const emBase64 = audioEmBase64(r2.dados);
  if (emBase64) return { ok: true, bytes: emBase64, mime: mimeDe(r2.dados) || "audio/ogg" };
  return { ok: false, erro: link ? LINK_RUIM : "A uazapi não devolveu o arquivo do áudio.", status: r2.status };
}

/**
 * As mensagens recentes de um grupo que a uazapi já guardou (POST /message/find), da mais
 * nova para a mais antiga: 100 por página (a página que passa de 5 MB vem de novo, com 20),
 * enquanto houver mais (hasMore, ou página cheia sem hasMore) e a mais antiga da página estiver
 * dentro dos `dias`, até `maximo` mensagens. Falha no meio devolve o que já veio, com o erro.
 * `aviso` diz quando a primeira página não chegou aos últimos `dias` (veio só com mensagens
 * mais antigas que a janela), para o registro de falhas.
 */
export async function buscarRecentes(
  cfg: ConfigUazapi, jid: string, opcoes: { dias?: number; maximo?: number; agora?: number; porPagina?: number } = {},
): Promise<{ mensagens: MensagemLida[]; erro: string | null; paginas: number; aviso: string | null }> {
  const dias = opcoes.dias ?? 7, maximo = opcoes.maximo ?? 1000, porPagina = opcoes.porPagina ?? 100;
  const limite = (opcoes.agora ?? Date.now()) - dias * 24 * 3600e3;
  const vistas = new Map<string, MensagemLida>();
  let offset = 0, paginas = 0;
  let erro: string | null = null;
  let aviso: string | null = null;
  while (vistas.size < maximo && paginas < 50) {
    let pedido = porPagina;
    let r = await chamar(cfg, "POST", "/message/find", { chatid: jid, limit: pedido, offset }, { prazoMs: PRAZO_LONGO_MS });
    if (!r.ok && r.falha === "tamanho" && pedido > 20) {
      pedido = 20;
      r = await chamar(cfg, "POST", "/message/find", { chatid: jid, limit: pedido, offset }, { prazoMs: PRAZO_LONGO_MS });
    }
    paginas++;
    if (!r.ok) {
      erro = erroUazapi(r);
      break;
    }
    const lista: Json[] = Array.isArray(r.dados?.messages) ? r.dados.messages : Array.isArray(r.dados) ? r.dados : [];
    let maisAntiga = Infinity, maisNova = -Infinity;
    for (const m of lista) {
      const t = msDe(m?.messageTimestamp ?? m?.timestamp);
      if (t) {
        maisAntiga = Math.min(maisAntiga, t);
        maisNova = Math.max(maisNova, t);
      }
      const lida = lerMensagemUazapi(m);
      if (!lida.guardar || lida.mensagem.chat_jid !== jid) continue;
      if (Date.parse(lida.mensagem.momento) < limite) continue;
      vistas.set(lida.mensagem.whatsapp_id, lida.mensagem);
    }
    // sem hasMore no envelope, a página cheia (pelo limit que a uazapi diz ter usado) indica que há mais
    const cheia = lista.length >= Math.min(pedido, Number(r.dados?.limit) > 0 ? Number(r.dados.limit) : pedido);
    const temMais = r.dados?.hasMore === true || (r.dados?.hasMore == null && cheia);
    if (paginas === 1 && lista.length && maisNova < limite) {
      aviso = `A primeira página do histórico veio só com mensagens de mais de ${dias} dias e não chegou aos últimos ${dias} dias, então nada foi trazido. A uazapi pode estar devolvendo o histórico da mensagem mais antiga para a mais nova.`;
    }
    if (!lista.length || !temMais || maisAntiga < limite) break;
    const proximo = Number(r.dados?.nextOffset);
    offset = Number.isFinite(proximo) && proximo > offset ? proximo : offset + lista.length;
  }
  const mensagens = [...vistas.values()].sort((a, b) => Date.parse(b.momento) - Date.parse(a.momento)).slice(0, maximo);
  return { mensagens, erro, paginas, aviso };
}
