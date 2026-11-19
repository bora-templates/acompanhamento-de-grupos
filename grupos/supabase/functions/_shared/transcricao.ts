// ============================================================================
// transcricao.ts: o áudio do grupo vira texto (Groq ou OpenAI, modelo Whisper, em português)
// ----------------------------------------------------------------------------
// O mesmo serviço que o sistema já usa para transcrever o áudio do WhatsApp (atendimento,
// wpp-transcribe): o arquivo vem da uazapi (/message/download) e vai para o Whisper.
// A chave é a que quem administra salvou no cofre (gr_transcricao_chave).
// Sem chave, o áudio fica guardado sem transcrição (sem_servico); erro vira falhou, e a agenda
// tenta de novo os que falharam há menos de 24 horas, no máximo 3 vezes.
// A resposta 429 do serviço respeita o retry-after: até 20 segundos, a função espera e tenta de
// novo (no máximo 2 vezes); acima disso, o áudio fica para a agenda.
// O registro de falhas guarda só a etapa e o código, nunca o áudio nem o texto.
// ============================================================================
import { comLimite, registrar, rpc } from "./comum.ts";
import { buscar, comoTexto, ErroRede, TETO_IA } from "./rede.ts";
import { baixarAudio, type ConfigUazapi } from "./uazapi.ts";
import type { ConfigTranscricao } from "./config.ts";

export const PRAZO_TRANSCRICAO_MS = 60_000;
const ESPERA_MAXIMA_MS = 20_000;
const SERVICOS = {
  groq: { url: "https://api.groq.com/openai/v1/audio/transcriptions", modelo: "whisper-large-v3" },
  openai: { url: "https://api.openai.com/v1/audio/transcriptions", modelo: "whisper-1" },
};

const extensao = (mime: string) =>
  mime.includes("ogg") || mime.includes("opus") ? "ogg"
  : mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") ? "m4a"
  : mime.includes("webm") ? "webm"
  : mime.includes("wav") ? "wav"
  : mime.includes("mpeg") || mime.includes("mp3") ? "mp3"
  : "ogg";

export class ErroTranscricao extends Error {
  constructor(mensagem: string, public etapa: string, public status = 0) {
    super(mensagem);
    this.name = "ErroTranscricao";
  }
}

/** O retry-after da resposta (segundos ou data) em milissegundos; nulo quando não veio. */
export function esperaPedida(cabecalhos: Headers): number | null {
  const v = (cabecalhos.get("retry-after") ?? "").trim();
  if (!v) return null;
  const s = Number(v);
  const ms = Number.isFinite(s) ? s * 1000 : Date.parse(v) - Date.now();
  return Number.isFinite(ms) ? Math.max(ms, 0) : null;
}

/** Manda o áudio para o Whisper e devolve o texto. */
export async function transcrever(cfg: ConfigTranscricao, bytes: Uint8Array, mime: string): Promise<string> {
  const servico = SERVICOS[cfg.provedor];
  const tipo = mime || "audio/ogg";
  for (let tentativa = 0; ; tentativa++) {
    const formulario = new FormData();
    formulario.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: tipo }), "audio." + extensao(tipo));
    formulario.append("model", servico.modelo);
    formulario.append("language", "pt");
    formulario.append("response_format", "json");
    let r: Awaited<ReturnType<typeof buscar>>;
    try {
      r = await buscar(servico.url, { method: "POST", headers: { Authorization: "Bearer " + cfg.chave }, body: formulario },
        { teto: TETO_IA, prazoMs: PRAZO_TRANSCRICAO_MS });
    } catch (e) {
      const tipoFalha = e instanceof ErroRede ? e.tipo : "conexao";
      throw new ErroTranscricao(tipoFalha === "tempo" ? "a transcrição demorou demais" : "sem resposta do serviço", "servico", 0);
    }
    if (r.status === 429) {
      const pedida = esperaPedida(r.headers);
      const espera = pedida ?? 2000;
      if (tentativa < 2 && espera <= ESPERA_MAXIMA_MS) {
        await new Promise((ok) => setTimeout(ok, espera));
        continue;
      }
      throw new ErroTranscricao("o serviço de transcrição pediu para esperar", "limite", 429);
    }
    // deno-lint-ignore no-explicit-any
    let o: any = {};
    try {
      o = JSON.parse(comoTexto(r.bytes));
    } catch (_) {
      o = {};
    }
    if (!r.ok || o?.error) throw new ErroTranscricao("o serviço de transcrição recusou o áudio", "servico", r.status);
    return String(o?.text ?? "").trim();
  }
}

/** Baixa e transcreve UM áudio guardado e grava o resultado (feita ou falhou). */
export async function transcreverMensagem(
  uaz: ConfigUazapi, cfg: ConfigTranscricao, msg: { id: number | string; whatsapp_id: string | null },
): Promise<"feita" | "falhou"> {
  try {
    if (!msg.whatsapp_id) throw new ErroTranscricao("mensagem sem id do WhatsApp", "download");
    const arquivo = await baixarAudio(uaz, msg.whatsapp_id);
    if (!arquivo.ok) throw new ErroTranscricao("não deu para baixar o áudio", "download", arquivo.status);
    const texto = await transcrever(cfg, arquivo.bytes, arquivo.mime);
    await rpc("gr_transcricao_gravar", { p_mensagem: msg.id, p_estado: "feita", p_texto: texto });
    return "feita";
  } catch (e) {
    const etapa = e instanceof ErroTranscricao ? e.etapa : "gravar";
    const status = e instanceof ErroTranscricao ? e.status : 0;
    await registrar("transcricao", "Falha ao transcrever um áudio.", { mensagem: msg.id, etapa, status, provedor: cfg.provedor });
    try {
      await rpc("gr_transcricao_gravar", { p_mensagem: msg.id, p_estado: "falhou", p_texto: null });
    } catch (_) { /* o registro já guardou a falha */ }
    return "falhou";
  }
}

/**
 * Transcreve os áudios que esperam na fila: de um grupo (logo depois da importação) ou os
 * que ficaram para trás há mais de `idadeMin` minutos (a agenda). Com `comFalhas`, também os
 * que falharam há menos de 24 horas, até 3 novas tentativas (a agenda). Devolve quantos
 * ficaram prontos.
 */
export async function transcreverPendentes(
  uaz: ConfigUazapi, cfg: ConfigTranscricao,
  opcoes: { grupo?: string | null; idadeMin?: number; limite?: number; aoMesmoTempo?: number; comFalhas?: boolean } = {},
): Promise<number> {
  const lista = await rpc<{ id: number; whatsapp_id: string | null }[]>("gr_audios_pendentes", {
    p_grupo: opcoes.grupo ?? null, p_idade_min: opcoes.idadeMin ?? 0, p_limite: opcoes.limite ?? 30,
    p_com_falhas: opcoes.comFalhas === true,
  });
  let prontos = 0;
  await comLimite(lista || [], opcoes.aoMesmoTempo ?? 3, async (m) => {
    if ((await transcreverMensagem(uaz, cfg, m)) === "feita") prontos++;
  });
  return prontos;
}
