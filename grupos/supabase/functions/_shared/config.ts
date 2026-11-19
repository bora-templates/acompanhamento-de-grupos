// ============================================================================
// config.ts: de onde vem a configuração de cada integração
// ----------------------------------------------------------------------------
// Tudo o que quem administra salva na tela: os ajustes ficam em hub.gr_ajustes (sem
// segredo) e os tokens e chaves no cofre do Supabase (Vault), lidos aqui pela chave de
// serviço só na hora de usar. Para a IA, sem nada salvo, valem as variáveis IA_* da Edge
// Function (as mesmas do Assistente): ver configIA no ia.ts. Este arquivo não
// importa o ia.ts, para a gr-entrada (o webhook) não carregar o SDK da IA.
// ============================================================================
import { rpc } from "./comum.ts";
import type { ConfigUazapi } from "./uazapi.ts";

export type ConfigTranscricao = { provedor: "groq" | "openai"; chave: string };

// deno-lint-ignore no-explicit-any
export type Ajustes = Record<string, any>;

/** Os ajustes da solução (o formato do painel mais o endereço das funções). */
export async function lerAjustes(): Promise<Ajustes> {
  return (await rpc<Ajustes>("gr_ajustes_ler")) || {};
}

export const segredo = async (nome: string): Promise<string> => String((await rpc<string | null>("gr_segredo_ler", { p_nome: nome })) || "");

/** O servidor e o token da uazapi, ou nulo se o WhatsApp ainda não foi ligado. */
export async function configUazapi(aj?: Ajustes): Promise<ConfigUazapi | null> {
  const a = aj ?? (await lerAjustes());
  const servidor = String(a.whatsapp_servidor || "").trim();
  if (!servidor) return null;
  const token = await segredo("gr_whatsapp_token");
  return token ? { servidor, token } : null;
}

/** O serviço e a chave da transcrição, ou nulo se a transcrição não foi ligada. */
export async function configTranscricao(aj?: Ajustes): Promise<ConfigTranscricao | null> {
  const a = aj ?? (await lerAjustes());
  const provedor = String(a.transcricao_provedor || "");
  if (provedor !== "groq" && provedor !== "openai") return null;
  const chave = await segredo("gr_transcricao_chave");
  return chave ? { provedor, chave } : null;
}
