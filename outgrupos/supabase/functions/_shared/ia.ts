// ============================================================================
// ia.ts: a camada que fala com o modelo de IA (Acompanhamento de Grupos)
// ----------------------------------------------------------------------------
// Cópia adaptada da camada do OutCopiloto (outcopiloto/supabase/functions/outcopiloto/ia.ts),
// que por sua vez segue a do assistente (outassistenteia/supabase/functions/agente/ia.ts):
// um pedido só (sistema + usuário), resposta em texto, JSON quando o pedido quer.
//
// Os quatro provedores do Hub: anthropic (Claude), deepseek, openai e compativel
// (qualquer serviço no formato /chat/completions, como OpenRouter, Groq, Mistral e Ollama).
//
// De onde vem a configuração: dos ajustes da solução (og_ajustes: provedor, modelo,
// endereço do compatível) e da chave no cofre (og_ia_chave), que quem administra salva
// na tela. Sem nada lá, valem as variáveis IA_* da Edge Function (as mesmas do assistente):
//   IA_PROVEDOR, IA_CHAVE, IA_MODELO, IA_URL e IA_ESFORCO (só Claude: low a max).
//
// Toda chamada passa pelas travas do rede.ts (só https e endereço público, sem seguir
// redirecionamento, resposta lida até 2 MB), inclusive a do SDK da Anthropic, que recebe um
// fetch com as mesmas travas.
//
// Nada aqui guarda nem imprime a chave.
// ============================================================================
import Anthropic from "npm:@anthropic-ai/sdk@^0.130.0";
import { type Ajustes, lerAjustes, segredo } from "./config.ts";
import { buscar, comoTexto, ErroRede, fetchComTravas, hostPublico, TETO_IA } from "./rede.ts";

export type ConfigIA = { provedor: string; modelo: string; chave: string; url: string; esforco: string };
export type RespostaIA = {
  texto: string;
  cortada: boolean;    // vale true quando a resposta bateu no teto de tokens
  recusada: boolean;   // vale true quando o modelo se recusou
  entrada: number;
  saida: number;
  modelo: string;
};

export const PROVEDORES_IA = ["anthropic", "deepseek", "openai", "compativel"];
const URL_BASE: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
};
export const MODELO_PADRAO: Record<string, string> = {
  anthropic: "claude-sonnet-5-5",
  deepseek: "deepseek-v4-flash",
};

/* A chamada tem 90 segundos. A Edge Function vive cerca de 150 segundos: no resumo, a nova
   tentativa usa o que sobra de 140 segundos, e ainda fica tempo para gravar. */
export const PRAZO_IA_MS = 90_000;
export const IA_FORA = "A IA não respondeu agora. O fornecedor pode estar sobrecarregado ou ter demorado mais de 90 segundos. " +
  "Tente de novo em alguns minutos.";
export const IA_LIMITE = "A IA recusou por limite de uso da sua conta. Espere um minuto ou escolha um período menor.";

/** Erro da IA com frase clara para a tela; `status` e `tipo` vão para o registro (sem texto). */
export class ErroIA extends Error {
  constructor(mensagem: string, public status = 0, public tipo = "") {
    super(mensagem);
    this.name = "ErroIA";
  }
}

const sobrecarga = (s: number) => s === 529 || s >= 500;
const env = (n: string) => (Deno.env.get(n) ?? "").trim();

/** A configuração que vem das variáveis IA_* da Edge Function (a reserva). */
export function configDoAmbiente(): ConfigIA {
  const provedor = env("IA_PROVEDOR").toLowerCase();
  return {
    provedor,
    modelo: env("IA_MODELO") || MODELO_PADRAO[provedor] || "",
    chave: env("IA_CHAVE"),
    url: env("IA_URL"),
    esforco: env("IA_ESFORCO"),
  };
}

/** A IA dos ajustes e do cofre; sem provedor salvo, a das variáveis IA_*. */
export async function configIA(aj?: Ajustes): Promise<ConfigIA> {
  const a = aj ?? (await lerAjustes());
  const doAmbiente = configDoAmbiente();
  const provedor = String(a.ia_provedor || "");
  if (!provedor) return doAmbiente;
  const mesmoDoAmbiente = doAmbiente.provedor === provedor;
  const chave = (await segredo("og_ia_chave")) || (mesmoDoAmbiente ? doAmbiente.chave : "");
  return {
    provedor,
    modelo: String(a.ia_modelo || "") || MODELO_PADRAO[provedor] || (mesmoDoAmbiente ? doAmbiente.modelo : ""),
    chave,
    url: String(a.ia_url || "") || (mesmoDoAmbiente ? doAmbiente.url : ""),
    esforco: doAmbiente.esforco,
  };
}

/**
 * O endereço da IA compatível: https, sem usuário e senha, sem ? nem # (a chave vai no campo
 * próprio, nunca no endereço) e para um host público. Devolve o endereço sem a barra no fim.
 */
export function conferirEnderecoIA(valor: unknown): { ok: true; url: string } | { ok: false; erro: string } {
  const bruto = String(valor ?? "").trim().replace(/\/+$/, "");
  const pede = "Informe o endereço da IA compatível, começando com https:// e terminando em /v1.";
  if (!bruto) return { ok: false, erro: pede };
  if (/[?#]/.test(bruto)) {
    return { ok: false, erro: "O endereço da IA compatível não pode ter ? nem #. Informe só o endereço da API, terminando em /v1, e a chave no campo próprio." };
  }
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    return { ok: false, erro: pede };
  }
  if (u.protocol !== "https:" || u.username || u.password) return { ok: false, erro: pede };
  if (!hostPublico(u.hostname)) {
    return { ok: false, erro: "O endereço da IA compatível precisa ser um endereço público da internet. Endereço interno, localhost e IP de rede privada não são aceitos." };
  }
  return { ok: true, url: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}` };
}

/** Os dois endereços da IA são o mesmo (sem contar maiúsculas no servidor e a barra no fim)? */
export function mesmoEnderecoIA(a: unknown, b: unknown): boolean {
  const base = (x: unknown) => {
    const t = String(x ?? "").trim().replace(/\/+$/, "");
    try {
      const u = new URL(t);
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}${u.hash}`;
    } catch {
      return t.toLowerCase();
    }
  };
  return base(a) === base(b);
}

/** Diz o que falta configurar, em frase para a tela, ou nulo se está tudo certo. */
export function faltaConfigurar(cfg: ConfigIA): string | null {
  if (!PROVEDORES_IA.includes(cfg.provedor)) {
    return "A IA ainda não está ligada. Quem administra a solução escolhe o provedor e salva a chave em Ajustes, na parte da IA.";
  }
  if (!cfg.chave) return "A IA está sem chave. Quem administra a solução salva a chave em Ajustes, na parte da IA.";
  if (!cfg.modelo) return "A IA está sem modelo. Quem administra a solução escolhe o modelo em Ajustes, na parte da IA.";
  if (cfg.provedor === "compativel" && !conferirEnderecoIA(cfg.url).ok) {
    return "A IA compatível está sem um endereço válido. Quem administra a solução informa em Ajustes o endereço público da API, começando com https:// e terminando em /v1.";
  }
  return null;
}

function erroPorStatus(cfg: ConfigIA, status: number): ErroIA {
  if (status === 401 || status === 403) {
    return new ErroIA("O fornecedor da IA recusou a chave. Confira a chave da IA em Ajustes e salve de novo.", status, "chave");
  }
  if (status === 404) {
    return new ErroIA(`O fornecedor da IA não encontrou o modelo "${cfg.modelo}". Confira o nome do modelo em Ajustes.`, status, "modelo");
  }
  if (status === 413) {
    return new ErroIA("O pedido ficou grande demais para a IA. Escolha um período menor e tente de novo.", status, "tamanho");
  }
  if (status === 429) return new ErroIA(IA_LIMITE, status, "limite");
  if (sobrecarga(status)) return new ErroIA(IA_FORA, status, "fora");
  return new ErroIA(`O fornecedor da IA recusou o pedido (código ${status}). Confira o modelo escolhido em Ajustes e tente de novo.`, status, "recusa");
}

/** A falha de rede (das travas do rede.ts) vira a frase da IA para a tela. */
function erroDaRede(e: unknown): ErroIA {
  // deno-lint-ignore no-explicit-any
  const rede = e instanceof ErroRede ? e : (e as any)?.cause instanceof ErroRede ? (e as any).cause as ErroRede : null;
  switch (rede?.tipo) {
    case "endereco":
      return new ErroIA("O endereço da IA precisa ser público e começar com https://. Confira o endereço da IA compatível em Ajustes.", 0, "endereco");
    case "redirecionamento":
      return new ErroIA("O endereço da IA respondeu com um redirecionamento para outro lugar, e a solução não segue redirecionamentos. Confira o endereço da IA compatível em Ajustes.",
        rede.status, "redirecionamento");
    case "tamanho":
      return new ErroIA("A resposta da IA passou de 2 MB e foi descartada. Tente de novo com um período menor.", rede.status, "tamanho");
    default:
      return new ErroIA(IA_FORA, rede?.status ?? 0, "fora");
  }
}

/**
 * Um pedido só (sistema + usuário). Com json = true, pede JSON a quem aceita o campo. O prazo
 * padrão é de 90 segundos; o resumo manda um prazo menor na nova tentativa.
 */
export function perguntar(cfg: ConfigIA, sistema: string, usuario: string, opcoes: { teto: number; json?: boolean; prazoMs?: number }): Promise<RespostaIA> {
  const prazo = Math.max(1000, opcoes.prazoMs ?? PRAZO_IA_MS);
  return cfg.provedor === "anthropic"
    ? anthropic(cfg, sistema, usuario, opcoes.teto, prazo)
    : compativel(cfg, sistema, usuario, opcoes.teto, opcoes.json === true, prazo);
}

// ── Anthropic (Claude), pelo SDK oficial ────────────────────────────────────
/* Modelos atuais (Opus 5.x, Sonnet 5.5, Fable 5.x): aceitam `effort` e o `fallbacks:
   "default"` (se o modelo recusar, a própria API tenta de novo em outro modelo). Nesses
   modelos não se manda temperatura. O padrão aqui é o esforço "low": resumir e responder
   sobre a conversa cabe bem nele e fica dentro do prazo. IA_ESFORCO muda. */
const MODERNO = /^claude-(opus-5|sonnet-5-5|fable-5)/;

async function anthropic(cfg: ConfigIA, sistema: string, usuario: string, teto: number, prazo: number): Promise<RespostaIA> {
  const cliente = new Anthropic({ apiKey: cfg.chave, maxRetries: 0, timeout: prazo, fetch: fetchComTravas(TETO_IA, prazo) });
  // deno-lint-ignore no-explicit-any
  const params: any = {
    model: cfg.modelo,
    max_tokens: teto,
    system: sistema,
    messages: [{ role: "user", content: [{ type: "text", text: usuario }] }],
  };
  const opcoes = { signal: AbortSignal.timeout(prazo), maxRetries: 0 };
  // deno-lint-ignore no-explicit-any
  let r: any;
  try {
    if (MODERNO.test(cfg.modelo)) {
      params.output_config = { effort: cfg.esforco || "low" };
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
      r = await cliente.beta.messages.create(params, opcoes);
    } else {
      r = await cliente.messages.create(params, opcoes);
    }
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const status = Number((e as any)?.status) || 0;
    const nome = String((e as Error)?.name || "");
    if (!status || /abort|timeout|connection/i.test(nome)) throw erroDaRede(e);
    throw erroPorStatus(cfg, status);
  }
  // deno-lint-ignore no-explicit-any
  const blocos: any[] = r?.content || [];
  return {
    texto: blocos.filter((b) => b?.type === "text").map((b) => b.text).join("").trim(),
    cortada: r?.stop_reason === "max_tokens",
    recusada: r?.stop_reason === "refusal",
    entrada: r?.usage?.input_tokens || 0,
    saida: r?.usage?.output_tokens || 0,
    modelo: String(r?.model || cfg.modelo),
  };
}

// ── Formato /chat/completions (DeepSeek, OpenAI e compatíveis) ──────────────
async function compativel(cfg: ConfigIA, sistema: string, usuario: string, teto: number, json: boolean, prazo: number): Promise<RespostaIA> {
  const base = (cfg.provedor === "compativel" ? cfg.url : URL_BASE[cfg.provedor] || "").replace(/\/+$/, "");
  // deno-lint-ignore no-explicit-any
  const corpo: any = {
    model: cfg.modelo,
    messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }],
  };
  // os modelos novos da OpenAI só aceitam max_completion_tokens; os demais, max_tokens (com teto menor)
  if (cfg.provedor === "openai") corpo.max_completion_tokens = teto;
  else corpo.max_tokens = Math.min(teto, 8000);
  // DeepSeek e OpenAI garantem JSON; o compatível nem sempre aceita o campo
  if (json && cfg.provedor !== "compativel") corpo.response_format = { type: "json_object" };
  const temperatura = env("IA_TEMPERATURA");
  if (temperatura) corpo.temperature = Number(temperatura);

  let r: Awaited<ReturnType<typeof buscar>>;
  try {
    r = await buscar(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }, { teto: TETO_IA, prazoMs: prazo });
  } catch (e) {
    throw erroDaRede(e);
  }
  // deno-lint-ignore no-explicit-any
  let o: any = null;
  try {
    o = JSON.parse(comoTexto(r.bytes));
  } catch (_) {
    o = null;
  }
  if (!r.ok) throw erroPorStatus(cfg, r.status);
  if (o?.error) throw new ErroIA(IA_FORA, r.status, "fora");
  const msg = o?.choices?.[0]?.message;
  if (!msg) throw new ErroIA("A IA não devolveu resposta. Tente de novo em alguns minutos.", r.status, "vazia");
  return {
    texto: String(msg.content || "").trim(),
    cortada: o?.choices?.[0]?.finish_reason === "length",
    recusada: o?.choices?.[0]?.finish_reason === "content_filter",
    entrada: o?.usage?.prompt_tokens || 0,
    saida: o?.usage?.completion_tokens || 0,
    modelo: String(o?.model || cfg.modelo),
  };
}
