// ============================================================================
// Edge Function `gr-entrada`: o endereço que a uazapi chama a cada mensagem
// ----------------------------------------------------------------------------
// A gr-api cadastra na uazapi (POST /webhook) o endereço
//   https://<projeto>.supabase.co/functions/v1/gr-entrada?chave=<gr_chave_entrada>
// e a uazapi manda aqui cada mensagem do número conectado.
//
// A PORTA TEM CHAVE: só entra POST com ?chave= igual à gr_chave_entrada do cofre (comparação
// em tempo constante). Sem a chave certa, 401 e nada gravado. A chave publicável do site não
// serve aqui: ela está em todo HTML, e com ela qualquer um poderia forjar mensagens.
//
// Com a chave certa, a resposta é 200 rápida sempre, mesmo quando a mensagem é descartada
// (a uazapi não precisa tentar de novo). Fica de fora o que não é mensagem de grupo, grupo
// que não é acompanhado ou está pausado, reação, enquete, voto, edição e mensagem apagada.
// O texto vai como chegou (a tela escapa o HTML na hora de mostrar). Áudio entra como
// "pendente" e a transcrição roda em segundo plano (EdgeRuntime.waitUntil); sem a chave da
// transcrição, fica "sem_servico".
//
// Publicar com verify_jwt desligado: a uazapi não manda login nenhum, e a trava é a chave.
// ============================================================================
import { mesmaChave } from "../_shared/acesso.ts";
import { banco, emSegundoPlano, json, registrar, rpc, tipoDoErro } from "../_shared/comum.ts";
import { type Ajustes, configTranscricao, type ConfigTranscricao, configUazapi, lerAjustes, segredo } from "../_shared/config.ts";
import { lerEventoUazapi } from "../_shared/uazapi.ts";
import { transcreverMensagem } from "../_shared/transcricao.ts";

/* A chave da entrada fica guardada por um minuto na memória da função: a uazapi chama a cada
   mensagem, e ler o cofre toda vez só deixaria a entrada mais lenta. */
let guardada = { valor: "", ate: 0 };
async function chaveDaEntrada(): Promise<string> {
  if (guardada.valor && guardada.ate > Date.now()) return guardada.valor;
  const valor = await segredo("gr_chave_entrada");
  guardada = { valor, ate: Date.now() + 60_000 };
  return valor;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, erro: "Use o método POST." }, 405);

  const chave = new URL(req.url).searchParams.get("chave") ?? "";
  if (!chave) return json({ ok: false, erro: "Falta a chave da entrada." }, 401);
  if (!banco()) return json({ ok: false, erro: "A função gr-entrada está sem a configuração do Supabase (SUPABASE_URL e a chave de serviço)." }, 500);
  let certa = "";
  try {
    certa = await chaveDaEntrada();
  } catch (_) {
    // sem conferir a chave, nada entra; a uazapi tenta de novo
    return json({ ok: false, erro: "Não consegui conferir a chave agora. Tente de novo." }, 503);
  }
  if (!certa || !mesmaChave(chave, certa)) return json({ ok: false, erro: "A chave da entrada não confere." }, 401);

  // daqui para baixo a resposta é sempre 200
  let corpo: unknown = null;
  try {
    corpo = await req.json();
  } catch (_) {
    return json({ ok: true, ignorado: "o corpo não é JSON" });
  }
  const lida = lerEventoUazapi(corpo);
  if (!lida.guardar) return json({ ok: true, ignorado: lida.motivo });
  const m = lida.mensagem;

  try {
    const grupo = await rpc<string | null>("gr_grupo_jid_ativo", { p_jid: m.chat_jid });
    if (!grupo) return json({ ok: true, ignorado: "grupo não acompanhado ou pausado" });

    let transcricao = "nao_se_aplica";
    let ajustes: Ajustes | null = null;
    let servico: ConfigTranscricao | null = null;
    if (m.tipo === "audio") {
      ajustes = await lerAjustes();
      servico = await configTranscricao(ajustes);
      transcricao = servico ? "pendente" : "sem_servico";
    }
    const id = await rpc<number | null>("gr_mensagem_gravar", { p_grupo: grupo, p_dados: { ...m, transcricao } });

    if (id && servico && ajustes) {
      const uaz = await configUazapi(ajustes);
      if (uaz) {
        emSegundoPlano(transcreverMensagem(uaz, servico, { id, whatsapp_id: m.whatsapp_id }));
      } else {
        await rpc("gr_transcricao_gravar", { p_mensagem: id, p_estado: "falhou", p_texto: null });
      }
    }
    return json({ ok: true, gravada: !!id });
  } catch (e) {
    await registrar("entrada", "Falha ao gravar uma mensagem recebida.", tipoDoErro(e));
    return json({ ok: false, erro: "Não consegui gravar a mensagem." });
  }
});
