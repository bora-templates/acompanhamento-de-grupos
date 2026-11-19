// ============================================================================
// rede.ts: toda chamada para fora (uazapi, IA, transcrição e o link do áudio) passa por aqui
// ----------------------------------------------------------------------------
// As mesmas travas valem para todas:
//   . só https e só endereço público da internet. Localhost, *.local, *.internal, nome sem
//     ponto, IP de rede privada, loopback, link-local e os equivalentes do IPv6 são recusados
//     antes de qualquer conexão;
//   . redirect "manual": a resposta 3xx vira erro da chamada, então o token e a chave nunca
//     seguem para outro endereço;
//   . um tempo limite para a chamada inteira, com a leitura da resposta incluída;
//   . a resposta é lida com teto (uazapi 5 MB, IA 2 MB, áudio 25 MB). Quando passa do teto, a
//     leitura para na hora e a chamada falha. Falha no meio da leitura também é erro.
// O nome do endereço não é resolvido aqui (a função não consulta o DNS). Um nome público que
// aponte para um IP interno passa por esta trava, e nesse caso quem protege é a rede do Supabase.
// ============================================================================

export const MB = 1024 * 1024;
export const TETO_UAZAPI = 5 * MB;
export const TETO_IA = 2 * MB;
export const TETO_AUDIO = 25 * MB;

export type TipoFalha = "endereco" | "redirecionamento" | "tempo" | "conexao" | "tamanho" | "leitura";

/** Falha de rede com o tipo, para quem chamou escolher a frase da tela. */
export class ErroRede extends Error {
  constructor(public tipo: TipoFalha, mensagem: string, public status = 0) {
    super(mensagem);
    this.name = "ErroRede";
  }
}

// ── o endereço ──────────────────────────────────────────────────────────────

/* Sufixos de nomes que só existem dentro de uma rede (ou que nunca resolvem na internet). */
const SUFIXOS_INTERNOS = [
  "localhost", "local", "internal", "localdomain", "home.arpa", "lan", "intranet", "corp", "home", "private",
  "test", "invalid", "example",
];

function ipv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/*
 * Ficam de fora da internet: 0.0.0.0/8 (esta rede), 10/8, 172.16/12 e 192.168/16 (as redes
 * privadas), 100.64/10 (a rede compartilhada das operadoras), 127/8 (o próprio computador),
 * 169.254/16 (o link-local, onde mora o serviço de metadados da nuvem), 192.0.0/24, 192.0.2/24,
 * 198.51.100/24 e 203.0.113/24 (protocolos e documentação), 192.88.99/24 (o 6to4 antigo),
 * 198.18/15 (os testes de rede) e tudo de 224 em diante (multicast e reservados).
 */
function ipv4Publico([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** Os 8 grupos de 16 bits de um IPv6 (o formato que o URL devolve), ou nulo. */
function ipv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  const partes = host.split("::");
  if (partes.length > 2) return null;
  const lado = (x: string) => (x ? x.split(":") : []);
  const esquerda = lado(partes[0]);
  const direita = partes.length === 2 ? lado(partes[1]) : [];
  // IPv4 no fim (::ffff:1.2.3.4) vira dois grupos
  const fim = direita.length ? direita : esquerda;
  const ultimo = fim[fim.length - 1];
  if (ultimo && ultimo.includes(".")) {
    const v4 = ipv4(ultimo);
    if (!v4) return null;
    fim.splice(fim.length - 1, 1, ((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16));
  }
  const faltam = 8 - esquerda.length - direita.length;
  if ((partes.length === 1 && faltam !== 0) || faltam < 0) return null;
  const grupos = [...esquerda, ...new Array(partes.length === 2 ? faltam : 0).fill("0"), ...direita]
    .map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
  return grupos.length === 8 && grupos.every((n) => Number.isFinite(n)) ? grupos : null;
}

/*
 * No IPv6 ficam de fora: ::/96 (o endereço vazio, o ::1 do próprio computador e o IPv4
 * compatível), ::ffff:0:0/96 (o IPv4 mapeado), 64:ff9b::/96 (NAT64), 100::/64 (descarte),
 * 2001::/23 (protocolos e Teredo), 2001:db8::/32 e 3fff::/20 (documentação), 2002::/16 (o 6to4,
 * que pode levar um IPv4 privado dentro), fc00::/7 (a rede privada), fe80::/10 e fec0::/10
 * (link-local e site-local) e ff00::/8 (multicast).
 */
function ipv6Publico(g: number[]): boolean {
  if (g.slice(0, 6).every((x) => x === 0)) return false;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return false;
  if (g[0] === 0x64 && g[1] === 0xff9b) return false;
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false;
  if (g[0] === 0x2001 && g[1] < 0x200) return false;
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false;
  if (g[0] === 0x2002) return false;
  if (g[0] === 0x3fff && g[1] < 0x1000) return false;
  if ((g[0] & 0xfe00) === 0xfc00) return false;
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return false;
  if ((g[0] & 0xff00) === 0xff00) return false;
  return true;
}

/** O nome ou o IP é de um endereço público da internet? (sem consultar o DNS) */
export function hostPublico(hostBruto: string): boolean {
  const host = String(hostBruto ?? "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!host) return false;
  const v6 = ipv6(host);
  if (v6) return ipv6Publico(v6);
  if (host.includes(":")) return false;
  const v4 = ipv4(host);
  if (v4) return ipv4Publico(v4);
  // número que o URL não reconheceu como IP fica de fora, e nome sem ponto só existe dentro de uma rede
  if (/^[\d.]+$/.test(host)) return false;
  if (!host.includes(".")) return false;
  return !SUFIXOS_INTERNOS.some((s) => host === s || host.endsWith("." + s));
}

/** O endereço é https, sem usuário e senha, e aponta para um host público? */
export function conferirEnderecoPublico(valor: string | URL):
  { ok: true; url: URL } | { ok: false; motivo: "formato" | "https" | "credenciais" | "interno" } {
  let u: URL;
  try {
    u = valor instanceof URL ? valor : new URL(String(valor ?? "").trim());
  } catch {
    return { ok: false, motivo: "formato" };
  }
  if (u.protocol !== "https:") return { ok: false, motivo: "https" };
  if (u.username || u.password) return { ok: false, motivo: "credenciais" };
  if (!hostPublico(u.hostname)) return { ok: false, motivo: "interno" };
  return { ok: true, url: u };
}

// ── a leitura com teto ──────────────────────────────────────────────────────

/**
 * Lê o corpo até `teto` bytes. Passou do teto: cancela a leitura e lança ErroRede "tamanho".
 * Com `sinal`, o fim do prazo também para a leitura ("tempo"). Erro no meio vira "leitura".
 */
export async function lerComTeto(corpo: ReadableStream<Uint8Array> | null, teto: number, sinal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!corpo) return new Uint8Array(0);
  const leitor = corpo.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  let parar: (e: unknown) => void = () => {};
  const parou = new Promise<never>((_, rejeita) => (parar = rejeita));
  parou.catch(() => {});
  const aoAbortar = () => parar(new ErroRede("tempo", "a resposta passou do tempo limite"));
  if (sinal) {
    if (sinal.aborted) aoAbortar();
    else sinal.addEventListener("abort", aoAbortar, { once: true });
  }
  try {
    while (true) {
      let passo: ReadableStreamReadResult<Uint8Array>;
      try {
        passo = await Promise.race([leitor.read(), parou]);
      } catch (e) {
        if (e instanceof ErroRede) throw e;
        if (sinal?.aborted) throw new ErroRede("tempo", "a resposta passou do tempo limite");
        throw new ErroRede("leitura", "a resposta foi cortada no meio");
      }
      if (passo.done) break;
      const pedaco = passo.value instanceof Uint8Array ? passo.value : new Uint8Array(passo.value as ArrayBuffer);
      total += pedaco.byteLength;
      if (total > teto) throw new ErroRede("tamanho", `a resposta passou de ${Math.round(teto / MB)} MB`);
      pedacos.push(pedaco);
    }
  } catch (e) {
    leitor.cancel().catch(() => {});
    throw e;
  } finally {
    sinal?.removeEventListener("abort", aoAbortar);
  }
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    saida.set(p, pos);
    pos += p.byteLength;
  }
  return saida;
}

/** Os bytes como texto (UTF-8). */
export const comoTexto = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// ── a chamada ───────────────────────────────────────────────────────────────

export type RespostaRede = { status: number; ok: boolean; headers: Headers; bytes: Uint8Array<ArrayBuffer> };

/**
 * Faz a chamada com as travas: endereço público em https, sem seguir redirecionamento, com
 * prazo para tudo e a resposta lida até o teto. Qualquer falha vira ErroRede.
 */
export async function buscar(endereco: string, init: RequestInit, opcoes: { teto: number; prazoMs: number }): Promise<RespostaRede> {
  const conferido = conferirEnderecoPublico(endereco);
  if (!conferido.ok) throw new ErroRede("endereco", "o endereço precisa ser https e público");
  const controle = new AbortController();
  const externo = init.signal ?? null;
  const aoExterno = () => controle.abort();
  if (externo) {
    if (externo.aborted) controle.abort();
    else externo.addEventListener("abort", aoExterno, { once: true });
  }
  let estourou = false;
  const relogio = setTimeout(() => {
    estourou = true;
    controle.abort();
  }, opcoes.prazoMs);
  try {
    let r: Response;
    try {
      r = await globalThis.fetch(conferido.url.href, { ...init, redirect: "manual", signal: controle.signal });
    } catch (_) {
      throw new ErroRede(estourou ? "tempo" : "conexao", estourou ? "a chamada passou do tempo limite" : "a chamada não conseguiu conexão com o endereço");
    }
    if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) {
      await r.body?.cancel().catch(() => {});
      throw new ErroRede("redirecionamento", "o endereço respondeu com um redirecionamento", r.status);
    }
    const declarado = Number(r.headers.get("content-length") ?? "");
    if (Number.isFinite(declarado) && declarado > opcoes.teto) {
      await r.body?.cancel().catch(() => {});
      throw new ErroRede("tamanho", `a resposta passou de ${Math.round(opcoes.teto / MB)} MB`, r.status);
    }
    const bytes = await lerComTeto(r.body, opcoes.teto, controle.signal);
    return { status: r.status, ok: r.ok, headers: r.headers, bytes };
  } finally {
    clearTimeout(relogio);
    externo?.removeEventListener("abort", aoExterno);
  }
}

/** Um fetch com as mesmas travas, para quem pede um fetch pronto (o SDK da Anthropic). */
export function fetchComTravas(teto: number, prazoMs: number): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    const r = await buscar(url, init ?? {}, { teto, prazoMs });
    const semCorpo = r.status === 204 || r.status === 205 || r.status === 304;
    return new Response(semCorpo ? null : r.bytes, { status: r.status, headers: r.headers });
  }) as typeof fetch;
}
