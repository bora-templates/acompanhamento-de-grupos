// ============================================================================
// Edge Function `og-api`: o servidor do Acompanhamento de Grupos no WhatsApp com IA
// ----------------------------------------------------------------------------
// POST com { acao } e os campos da ação. A resposta é sempre JSON: { ok: true } com os campos da
// ação, ou { ok: false, erro } com a frase para a tela.
//
//   ação                 quem          o que faz
//   ajustes_ia           admin         provedor, modelo, endereço (compatível) e chave da IA
//   testar_ia            admin         um pedido curto à IA configurada
//   ajustes_transcricao  admin         Groq ou OpenAI e a chave (ou a mesma chave da IA OpenAI)
//   whatsapp_salvar      admin         servidor e token da uazapi, cadastro do webhook, estado e QR
//   whatsapp_estado      admin         o estado da instância (e o QR, quando não está conectada)
//   whatsapp_grupos      admin         os grupos do número na uazapi
//   whatsapp_acompanhar  admin         passa a acompanhar os grupos marcados e traz as mensagens
//                                      recentes guardadas na uazapi, em segundo plano
//   participantes        editar        atualiza os participantes pela uazapi
//   reimportar           editar        traz de novo as mensagens recentes de um grupo acompanhado
//   resumo               editar        o resumo de um período (IA + números da solução)
//   enviar               editar        manda o resumo ao grupo pela uazapi (uma vez; reenviar manda de novo)
//   perguntar            ver           pergunta à IA sobre o grupo (até 30 perguntas por pessoa por hora)
//   agendado             a agenda      os resumos automáticos (cabeçalho x-og-agenda)
//
// QUEM PODE: a chave publicável está em todo HTML, então ela não é login. Entra gente do time
// logada (a trava quemPodeChamar, ficha ativa em hub.users) com o nível da chave "grupos"
// (hub.og_acesso_de: ver, editar ou admin), ou um robô com a chave de serviço. A ação agendado
// só entra pelo cabeçalho x-og-agenda, igual à chave og_chave_agenda do cofre (guardada por um
// minuto na memória da função). O corpo do pedido passa de 64 KB: recusado antes de ser lido.
//
// O token da uazapi e a chave da IA só valem para o endereço em que foram salvos: trocar o
// servidor pede o token de novo (precisa_token), e trocar o provedor ou o endereço da IA pede a
// chave de novo (precisa_chave). O servidor novo só é gravado depois que a uazapi responde.
//
// Toda chamada externa passa pelas travas do _shared/rede.ts (https, endereço público, sem
// redirecionamento, prazo e teto de leitura). Erro da uazapi ou da IA vira frase clara da
// solução para a tela e uma linha em hub.og_registro, sem token e sem texto de mensagem.
//
// Publicar com verify_jwt desligado (a instalação pela tela /setup já faz assim): quem chama é
// conferido aqui dentro.
// ============================================================================
import { mesmaChave, quemPodeChamar } from "../_shared/acesso.ts";
import {
  banco, comLimite, ehUuid, emSegundoPlano, env, erroDoBancoParaTela, ErroClaro, json, registrar, rpc, tipoDoErro,
} from "../_shared/comum.ts";
import { type Ajustes, configTranscricao, configUazapi, lerAjustes, segredo } from "../_shared/config.ts";
import {
  configIA, type ConfigIA, conferirEnderecoIA, ErroIA, faltaConfigurar, mesmoEnderecoIA, MODELO_PADRAO, perguntar, PRAZO_IA_MS,
  PROVEDORES_IA, type RespostaIA,
} from "../_shared/ia.ts";
import { ErroRede, lerComTeto } from "../_shared/rede.ts";
import { textoLimpo } from "../_shared/texto.ts";
import * as U from "../_shared/uazapi.ts";
import * as R from "../_shared/resumo.ts";
import { transcreverPendentes } from "../_shared/transcricao.ts";

type Nivel = "nenhum" | "ver" | "editar" | "admin";
type Quem = { tipo: "pessoa"; id: string; nivel: Nivel } | { tipo: "robo"; id: null; nivel: Nivel };
// deno-lint-ignore no-explicit-any
type Corpo = Record<string, any>;
// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

const PRECISA: Record<string, "ver" | "administrar" | "configurar"> = {
  ajustes_ia: "configurar",
  testar_ia: "configurar",
  ajustes_transcricao: "configurar",
  whatsapp_salvar: "configurar",
  whatsapp_estado: "configurar",
  whatsapp_grupos: "configurar",
  whatsapp_acompanhar: "configurar",
  participantes: "administrar",
  reimportar: "administrar",
  resumo: "administrar",
  enviar: "administrar",
  perguntar: "ver",
};

const SEM_ACESSO = "Você não tem acesso ao Acompanhamento de Grupos. Peça a quem administra o Hub para liberar o acesso na tela Usuários.";
const SO_VER = "Seu acesso ao Acompanhamento de Grupos permite só ver. Peça a quem administra o Hub para liberar a edição na tela Usuários.";
const SO_ADMIN = "Só quem administra o Acompanhamento de Grupos pode fazer isso. Peça a quem administra o Hub para liberar o acesso de administrador na tela Usuários.";
const SEM_WHATSAPP = "O WhatsApp ainda não está ligado. Quem administra a solução informa o servidor da uazapi e o token em Ajustes.";
const PEDE_TOKEN = "Para trocar o servidor, informe também o token da instância.";
const PEDE_CHAVE = "Para trocar o endereço ou o provedor da IA, informe também a chave.";
const JA_ENVIADO = "Este resumo já foi enviado.";
const SEM_CONFIRMACAO = "O WhatsApp não confirmou o envio a tempo. Confira o grupo antes de mandar de novo.";
const MUITAS_PERGUNTAS = "Você fez muitas perguntas na última hora. Tente de novo daqui a pouco.";
const CORPO_GRANDE = "O pedido passou de 64 KB e não foi lido. Mande só os campos da ação.";
// o jid do grupo de exemplo fica reservado a ele, e o banco também recusa esse jid
const JID_DO_EXEMPLO = "exemplo-contorno@g.us";
const TETO_CORPO = 64 * 1024;
// as duas tentativas do resumo cabem nos cerca de 150 segundos que a função vive
const PRAZO_TOTAL_RESUMO_MS = 140_000;
const TETO_RESUMO = 6000;
const TETO_PERGUNTA = 6000;
const URL_PROJETO = () => env("SUPABASE_URL").replace(/\/+$/, "");

// ── quem está pedindo ───────────────────────────────────────────────────────
async function quemE(req: Request): Promise<Quem | null> {
  const q = await quemPodeChamar(req);
  if (!q.ok) return null;
  if (q.tipo === "robo") return { tipo: "robo", id: null, nivel: "admin" };
  const nivel = String((await rpc<string>("og_acesso_de", { p_user: q.id })) || "nenhum") as Nivel;
  return { tipo: "pessoa", id: q.id, nivel };
}

// ── ajudantes ───────────────────────────────────────────────────────────────
/** Os ajustes como a tela vê (sem o endereço interno das funções). */
function ajustesPublicos(a: Ajustes): Ajustes {
  const { funcoes_url: _interno, ...resto } = a || {};
  return resto;
}

async function exigirUazapi(): Promise<U.ConfigUazapi> {
  const uaz = await configUazapi();
  if (!uaz) throw new ErroClaro(SEM_WHATSAPP);
  return uaz;
}

/** Grava o estado do WhatsApp. O erro é sempre uma frase da solução (erroUazapi), nunca o texto da uazapi. */
async function gravarEstado(estado: string, erro: string | null, userId: string | null, numero?: string | null) {
  const dados: Record<string, unknown> = { whatsapp_estado: estado, whatsapp_erro: erro };
  if (numero !== undefined) dados.whatsapp_numero = numero;
  if (estado === "aguardando_qr") dados.whatsapp_numero = null;
  await rpc("og_ajustes_gravar", { p_dados: dados, p_user: userId });
}

async function prepararAgenda() {
  try {
    await rpc("og_segredo_garantir", { p_nome: "og_chave_agenda" });
    agendaGuardada = { valor: "", ate: 0 };
    const r = await rpc<Linha>("og_agenda_preparar");
    if (!r?.ok) await registrar("agenda", "A agenda do resumo automático não ficou de pé.", { motivo: String(r?.motivo || "").slice(0, 200) });
  } catch (e) {
    await registrar("agenda", "Falha ao preparar a agenda do resumo automático.", tipoDoErro(e));
  }
}

/** Pergunta à IA; o erro vira frase clara e uma linha no registro (sem texto). */
async function perguntarIA(
  cfg: ConfigIA, sistema: string, pedido: string, teto: number, comJson: boolean, onde: Record<string, unknown>, prazoMs = PRAZO_IA_MS,
): Promise<RespostaIA> {
  try {
    return await perguntar(cfg, sistema, pedido, { teto, json: comJson, prazoMs });
  } catch (e) {
    if (e instanceof ErroIA) {
      await registrar("ia", "A IA não atendeu o pedido.", { ...onde, provedor: cfg.provedor, modelo: cfg.modelo, status: e.status, tipo: e.tipo });
      throw new ErroClaro(e.message);
    }
    throw e;
  }
}

function lerIntervalo(periodo: string, inicio: unknown, fim: unknown): R.Intervalo {
  try {
    return R.intervaloDoPeriodo(periodo, new Date(), inicio, fim);
  } catch (e) {
    if (e instanceof R.ErroPeriodo) throw new ErroClaro(e.message, 400);
    throw e;
  }
}

async function dadosDoGrupo(grupo: unknown): Promise<Linha> {
  if (!ehUuid(grupo)) throw new ErroClaro("Escolha um grupo.", 400);
  const dados = await rpc<Linha | null>("og_grupo_dados", { p_grupo: grupo });
  if (!dados) throw new ErroClaro("Este grupo não existe mais. Ele pode ter sido removido, então volte para a lista de grupos.");
  return dados;
}

async function mensagensDoPeriodo(grupo: string, intervalo: R.Intervalo) {
  const lote = await rpc<Linha>("og_mensagens_periodo", {
    p_grupo: grupo, p_inicio: intervalo.inicio.toISOString(), p_fim: intervalo.fim.toISOString(), p_limite: 4000,
  });
  return { mensagens: (lote?.mensagens || []) as R.MensagemDoPeriodo[], total: Number(lote?.total || 0) };
}

// ── IA e transcrição ────────────────────────────────────────────────────────
async function ajustesIA(c: Corpo, quem: Quem) {
  const provedor = String(c.provedor ?? "").trim().toLowerCase();
  if (!PROVEDORES_IA.includes(provedor)) throw new ErroClaro("Escolha o provedor da IA: OpenAI, Claude, DeepSeek ou Compatível.", 400);
  const modelo = String(c.modelo ?? "").trim() || MODELO_PADRAO[provedor] || "";
  if (!modelo) throw new ErroClaro("Informe o modelo da IA.", 400);
  if (modelo.length > 120 || /\s/.test(modelo)) throw new ErroClaro("O nome do modelo parece errado. Confira o nome exato no site do fornecedor.", 400);
  let url: string | null = null;
  if (provedor === "compativel") {
    const conferido = conferirEnderecoIA(c.url);
    if (!conferido.ok) throw new ErroClaro(conferido.erro, 400);
    url = conferido.url;
  }
  const chave = String(c.chave ?? "").trim();
  if (chave && (chave.length > 500 || /\s/.test(chave))) {
    throw new ErroClaro("A chave da IA parece errada. Copie a chave de novo no site do fornecedor.", 400);
  }
  const antes = await lerAjustes();
  if (!chave) {
    if (!(await rpc<boolean>("og_segredo_existe", { p_nome: "og_ia_chave" }))) throw new ErroClaro("Informe a chave da IA.", 400);
    // a chave salva só vale para o provedor e o endereço em que ela foi salva
    const trocouProvedor = String(antes.ia_provedor || "") !== provedor;
    const trocouEndereco = provedor === "compativel" && !mesmoEnderecoIA(antes.ia_url, url);
    if (trocouProvedor || trocouEndereco) throw new ErroClaro(PEDE_CHAVE, 400, { precisa_chave: true });
  } else {
    await rpc("og_segredo_gravar", { p_nome: "og_ia_chave", p_valor: chave });
  }
  await rpc("og_ajustes_gravar", {
    p_dados: { ia_provedor: provedor, ia_modelo: modelo, ia_url: url, funcoes_url: URL_PROJETO() || null }, p_user: quem.id,
  });
  await prepararAgenda();
  return { ajustes: ajustesPublicos(await lerAjustes()) };
}

async function testarIA() {
  const cfg = await configIA();
  const falta = faltaConfigurar(cfg);
  if (falta) throw new ErroClaro(falta);
  const r = await perguntarIA(cfg, "Você confere se a conexão com a IA funciona. Responda em português, com uma frase curta.",
    "Responda só com esta frase: A IA está ligada e respondendo.", 2000, false, { acao: "testar_ia" });
  if (!r.texto) throw new ErroClaro("A IA respondeu vazio. Confira o modelo escolhido e tente de novo.");
  return { resposta: r.texto.slice(0, 300), provedor: cfg.provedor, modelo: r.modelo };
}

async function ajustesTranscricao(c: Corpo, quem: Quem) {
  const provedor = String(c.provedor ?? "").trim().toLowerCase();
  if (provedor !== "groq" && provedor !== "openai") throw new ErroClaro("Escolha o serviço de transcrição: Groq ou OpenAI.", 400);
  const chave = String(c.chave ?? "").trim();
  const antes = await lerAjustes();
  if (chave) {
    if (chave.length > 500 || /\s/.test(chave)) throw new ErroClaro("A chave da transcrição parece errada. Copie a chave de novo no site do serviço.", 400);
    await rpc("og_segredo_gravar", { p_nome: "og_transcricao_chave", p_valor: chave });
  } else if (c.usar_chave_da_ia === true) {
    if (provedor !== "openai" || antes.ia_provedor !== "openai") {
      throw new ErroClaro("A mesma chave só serve quando a IA e a transcrição usam a OpenAI.", 400);
    }
    const daIA = await segredo("og_ia_chave");
    if (!daIA) throw new ErroClaro("A IA ainda não tem chave salva. Salve a chave da IA primeiro.", 400);
    await rpc("og_segredo_gravar", { p_nome: "og_transcricao_chave", p_valor: daIA });
  } else {
    if (!(await rpc<boolean>("og_segredo_existe", { p_nome: "og_transcricao_chave" }))) {
      throw new ErroClaro("Informe a chave do serviço de transcrição.", 400);
    }
    if (antes.transcricao_provedor && antes.transcricao_provedor !== provedor) {
      throw new ErroClaro("Você trocou o serviço de transcrição. Informe a chave do novo serviço.", 400);
    }
  }
  await rpc("og_ajustes_gravar", { p_dados: { transcricao_provedor: provedor }, p_user: quem.id });
  return { ajustes: ajustesPublicos(await lerAjustes()) };
}

// ── WhatsApp ────────────────────────────────────────────────────────────────
async function whatsappSalvar(c: Corpo, quem: Quem) {
  const srv = U.conferirServidor(c.servidor);
  if (!srv.ok) throw new ErroClaro(srv.erro, 400);
  const tokenNovo = String(c.token ?? "").trim();
  if (tokenNovo && (tokenNovo.length > 500 || /\s/.test(tokenNovo))) {
    throw new ErroClaro("O token da instância parece errado. Copie o token de novo no painel da uazapi.", 400);
  }
  const projeto = URL_PROJETO();
  if (!projeto) throw new ErroClaro("A função está sem o endereço do projeto (SUPABASE_URL).", 500);

  // o token salvo só vale para o servidor salvo: servidor diferente, token novo junto
  const antes = await lerAjustes();
  const salvo = String(antes.whatsapp_servidor || "");
  const mesmoServidor = !!salvo && U.mesmoEndereco(salvo, srv.servidor);
  if (!tokenNovo && !mesmoServidor) throw new ErroClaro(PEDE_TOKEN, 400, { precisa_token: true });
  const token = tokenNovo || (await segredo("og_whatsapp_token"));
  if (!token) throw new ErroClaro("Informe o token da instância da uazapi.", 400);
  const uaz: U.ConfigUazapi = { servidor: srv.servidor, token };
  // só a conexão que já está salva ganha o estado de erro; uma conexão nova só é gravada
  // depois que a uazapi responde
  const conexaoSalva = mesmoServidor && !tokenNovo;

  const estado = await U.estadoDaInstancia(uaz);
  if (!estado.ok) {
    if (conexaoSalva) await gravarEstado("erro", estado.erro, quem.id);
    await registrar("uazapi", "A uazapi não respondeu o estado da instância.", { rota: "/instance/status", status: estado.status });
    throw new ErroClaro(estado.erro);
  }

  // o endereço que recebe as mensagens: o POST /webhook troca o que a instância tinha
  const nosso = `${projeto}/functions/v1/og-entrada`;
  const atuais = await U.webhooksDaInstancia(uaz);
  if (c.confirmar_troca !== true) {
    if (!atuais.ok) {
      throw new ErroClaro(`Não consegui ler para onde a instância manda as mensagens hoje. ${atuais.erro} Confirme a troca se quiser cadastrar o endereço desta solução mesmo assim.`,
        200, { precisa_confirmar: true, webhook_atual: null });
    }
    const outro = atuais.lista.find((w) => w.ativo && !U.mesmoEndereco(w.url, nosso));
    if (outro) {
      throw new ErroClaro("Esta instância já manda as mensagens para outro endereço. Se você trocar, aquele sistema deixa de receber as mensagens deste número. Confirme a troca para continuar.",
        200, { precisa_confirmar: true, webhook_atual: U.enderecoSemSegredo(outro.url) });
    }
  }
  await rpc("og_segredo_garantir", { p_nome: "og_chave_entrada" });
  const chaveEntrada = await segredo("og_chave_entrada");
  if (!chaveEntrada) throw new ErroClaro("O cofre do Supabase não guardou a chave da entrada. Rode a instalação de novo pela tela /setup.", 500);
  const cadastro = await U.cadastrarWebhook(uaz, `${nosso}?chave=${encodeURIComponent(chaveEntrada)}`);
  if (!cadastro.ok) {
    const msg = `A uazapi não aceitou o endereço que recebe as mensagens. ${cadastro.erro}`;
    if (conexaoSalva) await gravarEstado("erro", msg, quem.id);
    await registrar("uazapi", "A uazapi recusou o cadastro do webhook.", { rota: "/webhook", status: cadastro.status });
    throw new ErroClaro(msg);
  }

  // a uazapi respondeu: daqui em diante o servidor e o token são os da solução
  if (tokenNovo) await rpc("og_segredo_gravar", { p_nome: "og_whatsapp_token", p_valor: tokenNovo });
  await rpc("og_ajustes_gravar", { p_dados: { whatsapp_servidor: srv.servidor, funcoes_url: projeto }, p_user: quem.id });
  if (estado.estado === "conectado") {
    await gravarEstado("conectado", null, quem.id, estado.numero);
    return { estado: "conectado", numero: estado.numero };
  }
  return await pedirQr(uaz, estado, quem);
}

/** Instância sem conexão: devolve o QR (o do estado, ou um novo pelo /instance/connect). */
async function pedirQr(uaz: U.ConfigUazapi, estado: U.EstadoLido, quem: Quem) {
  let atual: U.EstadoLido = estado;
  if (!atual.qr) {
    const novo = await U.pedirQr(uaz);
    if (!novo.ok) {
      await gravarEstado("erro", novo.erro, quem.id);
      await registrar("uazapi", "A uazapi não devolveu o QR.", { rota: "/instance/connect", status: novo.status });
      throw new ErroClaro(novo.erro);
    }
    atual = novo;
  }
  if (atual.estado === "conectado") {
    await gravarEstado("conectado", null, quem.id, atual.numero);
    return { estado: "conectado", numero: atual.numero };
  }
  await gravarEstado("aguardando_qr", null, quem.id);
  return { estado: "aguardando_qr", numero: null, qr: atual.qr };
}

async function whatsappEstado(_c: Corpo, quem: Quem) {
  const uaz = await exigirUazapi();
  const estado = await U.estadoDaInstancia(uaz);
  if (!estado.ok) {
    await gravarEstado("erro", estado.erro, quem.id);
    throw new ErroClaro(estado.erro);
  }
  if (estado.estado === "conectado") {
    await gravarEstado("conectado", null, quem.id, estado.numero);
    return { estado: "conectado", numero: estado.numero };
  }
  return await pedirQr(uaz, estado, quem);
}

async function whatsappGrupos() {
  const uaz = await exigirUazapi();
  const lista = await U.listarGrupos(uaz);
  if (!lista.ok) throw new ErroClaro(lista.erro);
  const ja = new Map(((await rpc<Linha[]>("og_grupos_jids")) || []).map((g) => [String(g.jid), g]));
  return {
    grupos: lista.grupos
      .filter((g) => g.jid !== JID_DO_EXEMPLO)
      .map((g) => ({ jid: g.jid, nome: g.nome, pessoas: g.pessoas, acompanhando: ja.has(g.jid), pausado: ja.get(g.jid)?.ativo === false }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

async function whatsappAcompanhar(c: Corpo, quem: Quem) {
  const jids = [...new Set((Array.isArray(c.jids) ? c.jids : []).map((j: unknown) => String(j ?? "").trim())
    .filter((j: string) => /@g\.us$/.test(j) && j !== JID_DO_EXEMPLO))] as string[];
  if (!jids.length) throw new ErroClaro("Marque pelo menos um grupo para acompanhar.", 400);
  if (jids.length > 200) throw new ErroClaro("Escolha no máximo 200 grupos de uma vez.", 400);
  const uaz = await exigirUazapi();
  const lista = await U.listarGrupos(uaz);
  if (!lista.ok) throw new ErroClaro(lista.erro);
  const porJid = new Map(lista.grupos.map((g) => [g.jid, g]));
  const escolhidos = jids.filter((j) => porJid.has(j));
  const naoEncontrados = jids.filter((j) => !porJid.has(j));
  if (!escolhidos.length) {
    throw new ErroClaro("Nenhum dos grupos marcados aparece no WhatsApp deste número. Atualize a lista e tente de novo.");
  }
  const r = await rpc<Linha>("og_grupos_criar", {
    p_lista: escolhidos.map((j) => ({ jid: j, nome: porJid.get(j)!.nome, pessoas: porJid.get(j)!.pessoas })),
    p_user: quem.id,
  });
  const novos = (r?.novos || []) as { id: string; jid: string }[];
  const importando = novos.length > 0;
  // os participantes vêm pelo /group/info de cada grupo escolhido, junto com a importação
  if (importando) emSegundoPlano(importarRecentes(uaz, novos));
  return {
    criados: Number(r?.criados || 0),
    grupos: r?.grupos || [],
    importando,
    ...(naoEncontrados.length ? { nao_encontrados: naoEncontrados } : {}),
  };
}

/**
 * Traz os participantes (/group/info) e as mensagens dos últimos 7 dias que a uazapi já
 * guardou (até 1.000 por grupo). Os 30 áudios mais recentes entram na fila da transcrição; os
 * outros ficam como nao_transcrito. No fim, o grupo guarda quantas mensagens entraram
 * (importadas) e, quando a importação parou no meio, a frase da solução que explica
 * (importacao_erro). Erro num grupo não desfaz o acompanhamento.
 */
async function importarRecentes(uaz: U.ConfigUazapi, grupos: { id: string; jid: string }[]) {
  const transcricao = await configTranscricao().catch(() => null);
  await comLimite(grupos, 2, async (g) => {
    let gravadas = 0;
    let erro: string | null = null;
    try {
      const info = await U.infoDoGrupo(uaz, g.jid);
      if (info.ok) {
        await rpc("og_participantes_gravar", { p_grupo: g.id, p_lista: info.participantes, p_nome: info.nome })
          .catch((e) => registrar("importacao", "Não deu para gravar os participantes do grupo.", { grupo: g.id, ...tipoDoErro(e) }));
      } else {
        await registrar("importacao", "A uazapi não devolveu os participantes do grupo.", { grupo: g.id, status: info.status });
      }
      const r = await U.buscarRecentes(uaz, g.jid, { dias: 7, maximo: 1000 });
      let audios = 0;
      const itens = r.mensagens.map((m) => {
        if (m.tipo !== "audio") return { ...m, transcricao: "nao_se_aplica" };
        audios++;
        return { ...m, transcricao: !transcricao ? "sem_servico" : audios <= 30 ? "pendente" : "nao_transcrito" };
      });
      for (let i = 0; i < itens.length; i += 250) {
        gravadas += Number(await rpc<number>("og_mensagens_gravar_lote", { p_grupo: g.id, p_itens: itens.slice(i, i + 250) })) || 0;
      }
      if (r.aviso) await registrar("importacao", r.aviso, { grupo: g.id, paginas: r.paginas });
      if (r.erro) {
        erro = `A importação das mensagens recentes parou no meio, com ${gravadas} mensagens trazidas. ${r.erro}`;
        await registrar("importacao", "A importação das mensagens recentes parou no meio.", { grupo: g.id, paginas: r.paginas, gravadas, erro: r.erro });
      }
    } catch (e) {
      erro = `A importação das mensagens recentes parou no meio, com ${gravadas} mensagens trazidas. Peça para trazer as mensagens de novo em alguns minutos.`;
      await registrar("importacao", "Falha ao trazer as mensagens recentes do grupo.", { grupo: g.id, gravadas, ...tipoDoErro(e) });
    } finally {
      await rpc("og_importacao_concluir", { p_grupo: g.id, p_importadas: gravadas, p_erro: erro }).catch(() => null);
    }
    if (transcricao) await transcreverPendentes(uaz, transcricao, { grupo: g.id, limite: 30, aoMesmoTempo: 3 }).catch(() => 0);
  });
}

async function participantes(c: Corpo) {
  const dados = await dadosDoGrupo(c.grupo);
  if (dados.exemplo) {
    throw new ErroClaro("O grupo de exemplo não está no WhatsApp, então os participantes dele não são atualizados pela uazapi.");
  }
  const uaz = await exigirUazapi();
  const info = await U.infoDoGrupo(uaz, dados.jid);
  if (!info.ok) throw new ErroClaro(info.erro);
  const lista = await rpc<Linha[]>("og_participantes_gravar", { p_grupo: dados.id, p_lista: info.participantes, p_nome: info.nome });
  return { participantes: lista || [] };
}

/** Traz de novo as mensagens recentes de um grupo já acompanhado (em segundo plano). */
async function reimportar(c: Corpo) {
  const dados = await dadosDoGrupo(c.grupo);
  if (dados.exemplo) throw new ErroClaro("O grupo de exemplo não está no WhatsApp, então não há mensagens para trazer.");
  const uaz = await exigirUazapi();
  const g = await rpc<Linha>("og_importacao_comecar", { p_grupo: dados.id });
  emSegundoPlano(importarRecentes(uaz, [{ id: String(g.id), jid: String(g.jid) }]));
  return { importando: true };
}

// ── resumo, envio e pergunta ────────────────────────────────────────────────
async function fazerResumo(a: { grupo: unknown; periodo: string; inicio?: unknown; fim?: unknown; origem: "pedido" | "automatico"; pedidoPor: string | null }) {
  if (!R.PERIODOS.includes(a.periodo)) {
    throw new ErroClaro("Escolha um período: últimas 24 horas, hoje, ontem, últimos 7 dias ou entre duas datas.", 400);
  }
  const intervalo = lerIntervalo(a.periodo, a.inicio, a.fim);
  const dados = await dadosDoGrupo(a.grupo);
  const cfg = await configIA();
  const falta = faltaConfigurar(cfg);
  if (falta) throw new ErroClaro(falta);
  const { mensagens, total } = await mensagensDoPeriodo(dados.id, intervalo);
  if (!total || !mensagens.length) throw new ErroClaro("Este grupo não teve mensagens nesse período.");

  const participantesDoGrupo = (dados.participantes || []) as R.ParticipanteDoGrupo[];
  const chaves = R.chavesDoTime(participantesDoGrupo);
  const bloco = R.mensagensParaIA(mensagens, chaves);
  const termos = R.palavrasFrequentes(mensagens.map((m) => m.texto), 12).join(" ");
  const trechos = termos
    ? ((await rpc<{ titulo: string; trecho: string }[]>("og_materiais_trechos", { p_grupo: dados.id, p_termos: termos, p_limite: R.LIMITE_MATERIAIS_CHARS })) || [])
    : [];
  const pedido = R.pedidoDoResumo({
    grupoNome: dados.nome, intervalo, orientacoes: dados.orientacoes, materiais: R.materiaisParaIA(trechos), bloco, total,
  });

  // a primeira chamada tem 90 segundos; a nova tentativa (resposta fora do formato) usa o que
  // sobra de 140 segundos, e só vai quando sobram pelo menos 10
  let conteudoIA: R.ConteudoIA | null = null;
  let modelo = cfg.modelo;
  let problema = "";
  const comeco = Date.now();
  for (let tentativa = 1; tentativa <= 2 && !conteudoIA; tentativa++) {
    const resta = PRAZO_TOTAL_RESUMO_MS - (Date.now() - comeco);
    if (tentativa === 2 && resta < 10_000) break;
    const resposta = await perguntarIA(cfg, R.SISTEMA_RESUMO, tentativa === 1 ? pedido : pedido + R.LEMBRETE_SO_JSON, TETO_RESUMO, true,
      { acao: "resumo", grupo: dados.id, tentativa }, tentativa === 1 ? Math.min(PRAZO_IA_MS, resta) : resta);
    modelo = resposta.modelo;
    if (resposta.recusada) throw new ErroClaro("A IA se recusou a resumir estas mensagens. Tente outro período.");
    try {
      conteudoIA = R.conferirResumoIA(R.lerJsonDaIA(resposta.texto));
    } catch (e) {
      problema = resposta.cortada ? "a resposta veio cortada no teto de tokens" : String((e as Error).message).slice(0, 200);
    }
  }
  if (!conteudoIA) {
    await registrar("ia", "A IA respondeu fora do formato do resumo.", { grupo: dados.id, provedor: cfg.provedor, modelo, problema });
    throw new ErroClaro("A IA respondeu fora do formato combinado, e o resumo não foi guardado. Tente de novo em alguns minutos ou escolha um período menor.");
  }

  const numeros = R.calcularNumeros(mensagens, participantesDoGrupo, total);
  const fora = Math.max(0, total - bloco.usadas);
  const conteudo = {
    ...conteudoIA,
    links: R.extrairLinks(mensagens),
    arquivos: R.listarArquivos(mensagens),
    participacao: R.participacao(mensagens),
    ...(fora > 0 ? { aviso: `O período teve ${total.toLocaleString("pt-BR")} mensagens e só as ${bloco.usadas.toLocaleString("pt-BR")} mais recentes couberam no pedido à IA.` } : {}),
  };
  const textoWhatsApp = R.textoParaWhatsApp({
    grupoNome: dados.nome, rotulo: intervalo.rotulo, conteudo: conteudoIA, numeros,
    linksDoTime: R.extrairLinks(mensagens.filter((m) => R.ehDoTime(m, chaves))),
    nomesNoGrupo: R.nomesConhecidos(participantesDoGrupo, mensagens),
  });
  return await rpc<Linha>("og_resumo_gravar", {
    p_grupo: dados.id,
    p_dados: {
      periodo: a.periodo, inicio: intervalo.inicio.toISOString(), fim: intervalo.fim.toISOString(), conteudo, numeros,
      texto_whatsapp: textoWhatsApp, mensagens_usadas: bloco.usadas, mensagens_fora: fora, origem: a.origem,
      pedido_por: a.pedidoPor, modelo,
    },
  });
}

async function resumo(c: Corpo, quem: Quem) {
  const linha = await fazerResumo({ grupo: c.grupo, periodo: String(c.periodo ?? ""), inicio: c.inicio, fim: c.fim, origem: "pedido", pedidoPor: quem.id });
  return { resumo: linha };
}

/**
 * Manda o resumo ao grupo uma vez. Já enviado, devolve ja_enviado com a data, a não ser que
 * venha reenviar. A reserva no banco (og_resumo_reservar_envio) impede o segundo envio de dois
 * cliques ao mesmo tempo. Sem a confirmação do WhatsApp a tempo, devolve sem_confirmacao e não
 * marca o envio.
 */
async function enviarResumo(resumoId: unknown, texto: unknown, userId: string | null, reenviar: boolean) {
  if (!ehUuid(resumoId)) throw new ErroClaro("Escolha o resumo que vai para o grupo.", 400);
  const r = await rpc<Linha | null>("og_resumo_para_envio", { p_resumo: resumoId });
  if (!r) throw new ErroClaro("Este resumo não existe mais. Ele pode ter sido apagado junto com o grupo.");
  if (r.exemplo) throw new ErroClaro("O grupo de exemplo não recebe mensagens.");
  if (r.enviado_em && !reenviar) throw new ErroClaro(JA_ENVIADO, 200, { ja_enviado: true, enviado_em: r.enviado_em });
  const final = textoLimpo(texto ?? r.texto_whatsapp ?? "").trim();
  if (!final) throw new ErroClaro("O texto do resumo está vazio. Escreva o texto antes de enviar.", 400);
  if (final.length > 6000) throw new ErroClaro("O texto do resumo pode ter até 6.000 caracteres. Encurte o texto e tente de novo.", 400);
  const uaz = await exigirUazapi();
  const reserva = await rpc<Linha>("og_resumo_reservar_envio", { p_resumo: r.id, p_reenviar: reenviar });
  if (reserva?.ja_enviado) throw new ErroClaro(JA_ENVIADO, 200, { ja_enviado: true, enviado_em: reserva.enviado_em });
  if (reserva?.enviando) throw new ErroClaro("Este resumo está sendo enviado agora. Espere um instante e confira no grupo.");
  const liberar = () => rpc("og_resumo_liberar_envio", { p_resumo: r.id }).catch(() => null);
  let envio: Awaited<ReturnType<typeof U.enviarTexto>>;
  try {
    envio = await U.enviarTexto(uaz, String(r.jid), final);
  } catch (e) {
    await liberar();
    throw e;
  }
  if (!envio.ok) {
    await liberar();
    await registrar("uazapi", "Falha ao enviar o resumo ao grupo.", { resumo: r.id, rota: "/send/text", status: envio.status, sem_confirmacao: envio.semConfirmacao });
    if (envio.semConfirmacao) throw new ErroClaro(SEM_CONFIRMACAO, 200, { sem_confirmacao: true });
    throw new ErroClaro(`O resumo não foi enviado. ${envio.erro}`);
  }
  const quando = await rpc<string>("og_resumo_marcar_envio", { p_resumo: r.id, p_user: userId, p_texto: final });
  return { enviado_em: quando };
}

async function enviar(c: Corpo, quem: Quem) {
  return await enviarResumo(c.resumo, c.texto === undefined || c.texto === null ? null : c.texto, quem.id, c.reenviar === true);
}

async function perguntarAoGrupo(c: Corpo, quem: Quem) {
  if (quem.tipo !== "pessoa") throw new ErroClaro("A pergunta precisa de uma pessoa logada no Hub.", 403);
  const pergunta = textoLimpo(c.pergunta).trim();
  if (!pergunta) throw new ErroClaro("Escreva a pergunta.", 400);
  if (pergunta.length > 1000) throw new ErroClaro("A pergunta pode ter até 1.000 caracteres.", 400);
  const periodo = String(c.periodo ?? "7d");
  if (!R.PERIODOS.includes(periodo)) {
    throw new ErroClaro("Escolha um período: últimas 24 horas, hoje, ontem, últimos 7 dias ou entre duas datas.", 400);
  }
  const intervalo = lerIntervalo(periodo, c.inicio, c.fim);
  const dados = await dadosDoGrupo(c.grupo);
  const cfg = await configIA();
  const falta = faltaConfigurar(cfg);
  if (falta) throw new ErroClaro(falta);
  const { mensagens, total } = await mensagensDoPeriodo(dados.id, intervalo);
  const chaves = R.chavesDoTime((dados.participantes || []) as R.ParticipanteDoGrupo[]);
  const bloco = R.mensagensParaIA(mensagens, chaves);
  const trechos = (await rpc<{ titulo: string; trecho: string }[]>("og_materiais_trechos", {
    p_grupo: dados.id, p_termos: pergunta, p_limite: R.LIMITE_MATERIAIS_CHARS,
  })) || [];
  const pedido = R.pedidoDaPergunta({
    pergunta, grupoNome: dados.nome, intervalo, orientacoes: dados.orientacoes, materiais: R.materiaisParaIA(trechos), bloco, total,
  });
  // o limite de 30 perguntas por pessoa por hora: a pergunta fica guardada antes de ir à IA
  const id = await rpc<number | null>("og_pergunta_comecar", {
    p_grupo: dados.id, p_user: quem.id, p_pergunta: pergunta, p_periodo: periodo,
    p_inicio: intervalo.inicio.toISOString(), p_fim: intervalo.fim.toISOString(),
  });
  if (!id) throw new ErroClaro(MUITAS_PERGUNTAS);
  const r = await perguntarIA(cfg, R.SISTEMA_PERGUNTA, pedido, TETO_PERGUNTA, false, { acao: "perguntar", grupo: dados.id });
  if (r.recusada) throw new ErroClaro("A IA se recusou a responder essa pergunta. Tente escrever de outro jeito.");
  const resposta = r.texto.trim().slice(0, 8000);
  if (!resposta) {
    throw new ErroClaro(r.cortada
      ? "A resposta da IA ficou grande demais e veio cortada. Faça uma pergunta mais específica ou escolha um período menor."
      : "A IA respondeu vazio. Tente de novo em instantes.");
  }
  await rpc("og_pergunta_responder", { p_pergunta: id, p_resposta: resposta, p_modelo: r.modelo });
  return { resposta, pergunta_id: id };
}

// ── a agenda (pg_cron → pg_net → aqui) ──────────────────────────────────────
async function rodarAgenda() {
  const placar = { feitos: 0, enviados: 0, pulados: 0, falhas: 0, transcritos: 0 };
  const resumos = (async () => {
    try {
      const lista = (await rpc<{ grupo: string; envia: boolean; teve_mensagem: boolean; anterior: string | null; periodo: string; tentativa: number }[]>(
        "og_agenda_reservar", { p_limite: 4 })) || [];
      await comLimite(lista, 4, async (item) => {
        if (!item.teve_mensagem) {
          placar.pulados++;
          return;
        }
        try {
          // o resumo da meia-noite (hora 0) é o de ontem
          const linha = await fazerResumo({ grupo: item.grupo, periodo: item.periodo === "ontem" ? "ontem" : "hoje", origem: "automatico", pedidoPor: null });
          placar.feitos++;
          if (item.envia) {
            try {
              await enviarResumo(linha.id, null, null, false);
              placar.enviados++;
            } catch (e) {
              await registrar("agenda", "O resumo automático foi feito, mas não foi enviado ao grupo.", { grupo: item.grupo, ...tipoDoErro(e) });
            }
          }
        } catch (e) {
          if (e instanceof ErroClaro && /não teve mensagens/.test(e.message)) {
            placar.pulados++;
            return;
          }
          // o grupo volta a ficar sem o resumo de hoje e a agenda tenta de novo (até 3 vezes no dia)
          placar.falhas++;
          await rpc("og_agenda_devolver", { p_grupo: item.grupo, p_anterior: item.anterior ?? null }).catch(() => null);
          await registrar("agenda", "O resumo automático falhou, e a agenda tenta de novo na próxima rodada, até 3 vezes no dia.",
            { grupo: item.grupo, tentativa: item.tentativa, ...tipoDoErro(e) });
        }
      });
    } catch (e) {
      await registrar("agenda", "Falha ao separar os grupos do resumo automático.", tipoDoErro(e));
    }
  })();
  // os áudios que ficaram para trás (a função que recebeu parou antes de transcrever) e os que
  // falharam há menos de 24 horas (até 3 novas tentativas)
  const audios = (async () => {
    try {
      const transcricao = await configTranscricao();
      const uaz = await configUazapi();
      if (transcricao && uaz) {
        placar.transcritos = await transcreverPendentes(uaz, transcricao, { idadeMin: 10, limite: 15, aoMesmoTempo: 3, comFalhas: true });
      }
    } catch (e) {
      await registrar("agenda", "Falha ao transcrever os áudios atrasados.", tipoDoErro(e));
    }
  })();
  await Promise.all([resumos, audios]);
  await rpc("og_registro_limpar").catch(() => null);
  return placar;
}

/* A chave da agenda fica guardada por um minuto na memória da função, como a da entrada:
   pedido com chave inventada não lê o cofre a cada vez. */
let agendaGuardada = { valor: "", ate: 0 };
async function chaveDaAgenda(): Promise<string> {
  if (agendaGuardada.ate > Date.now()) return agendaGuardada.valor;
  const valor = await segredo("og_chave_agenda");
  agendaGuardada = { valor, ate: Date.now() + 60_000 };
  return valor;
}

async function portaDaAgenda(req: Request, acao: string): Promise<Response> {
  if (!banco()) return json({ ok: false, erro: "A função og-api está sem a configuração do Supabase (SUPABASE_URL e a chave de serviço)." }, 500);
  const recebida = (req.headers.get("x-og-agenda") ?? "").trim();
  const certa = recebida ? await chaveDaAgenda() : "";
  if (!recebida || !certa || !mesmaChave(recebida, certa)) return json({ ok: false, erro: "A chave da agenda não confere." }, 401);
  if (acao !== "agendado") return json({ ok: false, erro: "Pela porta da agenda só passa a ação agendado." }, 400);
  const trabalho = rodarAgenda();
  // o pg_net desliga a conexão em segundos: responde na hora e trabalha em segundo plano
  if (emSegundoPlano(trabalho)) return json({ ok: true, fila: true }, 202);
  return json({ ok: true, ...(await trabalho) });
}

// ── a porta ─────────────────────────────────────────────────────────────────
const ACOES: Record<string, (c: Corpo, quem: Quem) => Promise<Record<string, unknown>>> = {
  ajustes_ia: ajustesIA,
  testar_ia: () => testarIA(),
  ajustes_transcricao: ajustesTranscricao,
  whatsapp_salvar: whatsappSalvar,
  whatsapp_estado: whatsappEstado,
  whatsapp_grupos: () => whatsappGrupos(),
  whatsapp_acompanhar: whatsappAcompanhar,
  participantes: (c) => participantes(c),
  reimportar: (c) => reimportar(c),
  resumo,
  enviar,
  perguntar: perguntarAoGrupo,
};

async function respostaDeErro(e: unknown, acao: string): Promise<Response> {
  if (e instanceof ErroClaro) return json({ ok: false, erro: e.message, ...e.extra }, e.status);
  const doBanco = erroDoBancoParaTela(e);
  if (doBanco) return json({ ok: false, erro: doBanco });
  console.error("[og-api]", acao, tipoDoErro(e));
  await registrar("og-api", "Falha inesperada na og-api.", { acao: acao.slice(0, 40), ...tipoDoErro(e) });
  return json({ ok: false, erro: "Algo deu errado do nosso lado. Tente de novo em instantes; se continuar, avise quem administra o Hub." }, 500);
}

/** O corpo do pedido, lido até 64 KB. Nulo quando passa disso (pelo content-length, antes de ler). */
async function lerCorpo(req: Request): Promise<Corpo | null> {
  const declarado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > TETO_CORPO) return null;
  let bytes: Uint8Array;
  try {
    bytes = await lerComTeto(req.body, TETO_CORPO);
  } catch (e) {
    if (e instanceof ErroRede && e.tipo === "tamanho") return null;
    return {};
  }
  try {
    const lido = JSON.parse(new TextDecoder().decode(bytes));
    if (lido && typeof lido === "object" && !Array.isArray(lido)) return lido;
  } catch (_) { /* corpo vazio ou que não é JSON */ }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, erro: "Use o método POST." }, 405);
  const corpo = await lerCorpo(req);
  if (!corpo) return json({ ok: false, erro: CORPO_GRANDE }, 400);
  const acao = String(corpo.acao ?? "").trim();
  try {
    if (req.headers.has("x-og-agenda")) return await portaDaAgenda(req, acao);
    if (!banco()) return json({ ok: false, erro: "A função og-api está sem a configuração do Supabase (SUPABASE_URL e a chave de serviço)." }, 500);
    const quem = await quemE(req);
    if (!quem) return json({ ok: false, erro: "Entre no Hub para usar o Acompanhamento de Grupos." }, 401);
    if (!acao) return json({ ok: false, erro: "Diga qual ação a função deve fazer (o campo acao)." }, 400);
    if (acao === "agendado") return json({ ok: false, erro: "A ação agendado é só da agenda do banco." }, 403);
    const precisa = PRECISA[acao];
    if (!precisa) return json({ ok: false, erro: `A ação "${acao.slice(0, 40)}" não existe.` }, 400);
    if (quem.nivel === "nenhum") return json({ ok: false, erro: SEM_ACESSO }, 403);
    if (precisa === "administrar" && quem.nivel !== "editar" && quem.nivel !== "admin") return json({ ok: false, erro: SO_VER }, 403);
    if (precisa === "configurar" && quem.nivel !== "admin") return json({ ok: false, erro: SO_ADMIN }, 403);
    return json({ ok: true, ...(await ACOES[acao](corpo, quem)) });
  } catch (e) {
    return await respostaDeErro(e, acao);
  }
});
