/*
 * supabase-api.js: o que a instalação pede ao Supabase, pela Management API
 * (https://api.supabase.com), com o token de acesso da conta de quem instala.
 * Sem psql, sem Supabase CLI e sem Docker: só fetch (Node 18+).
 *
 * O token nunca é gravado nem mostrado: ele só vai no cabeçalho de cada pedido,
 * e toda mensagem de erro passa por limpa(), que tira qualquer pedaço dele.
 */
'use strict';

const API = 'https://api.supabase.com';

class ErroSupabase extends Error {
  constructor(msg, status, detalhe) { super(msg); this.status = status; this.detalhe = detalhe; }
}

// o identificador do projeto a partir do endereço (https://abcd.supabase.co → abcd)
function refDoEndereco(url) {
  const m = String(url || '').trim().match(/^https:\/\/([a-z0-9]{15,40})\.supabase\.co\/?$/i);
  return m ? m[1].toLowerCase() : null;
}

function cliente(token, { api = API, tentativas = 6 } = {}) {
  if (!token) throw new ErroSupabase('falta o token de acesso do Supabase', 400);
  const limpa = (s) => String(s || '').split(token).join('***');

  async function pede(metodo, caminho, { json, form, texto } = {}) {
    let ultimo;
    for (let i = 0; i < tentativas; i++) {
      let r;
      try {
        r = await fetch(api + caminho, {
          method: metodo,
          headers: Object.assign({ Authorization: 'Bearer ' + token },
            json !== undefined ? { 'Content-Type': 'application/json' } : {}),
          body: json !== undefined ? JSON.stringify(json) : form,
        });
      } catch (e) {
        ultimo = new ErroSupabase(`não consegui falar com o Supabase (${limpa(e.message)})`, 0);
        await espera(1500 * (i + 1));
        continue;
      }
      const corpo = await r.text();
      if (r.ok) {
        if (texto) return corpo;
        try { return corpo ? JSON.parse(corpo) : null; } catch { return corpo; }
      }
      // 429 (pedidos demais) e 5xx (o Supabase engasgou): espera e tenta de novo. No 429,
      // respeita o tempo que o Supabase pede (Retry-After); sem ele, espera cada vez mais.
      if (r.status === 429 || r.status >= 500) {
        ultimo = new ErroSupabase(`o Supabase respondeu ${r.status}: ${limpa(corpo).slice(0, 400)}`, r.status, limpa(corpo));
        const pede = Number(r.headers.get('retry-after'));
        const ms = r.status === 429
          ? (Number.isFinite(pede) && pede > 0 ? Math.min(pede, 90) * 1000 : Math.min(5000 * 2 ** i, 60000))
          : 2000 * (i + 1);
        if (i < tentativas - 1) await espera(ms);
        continue;
      }
      let msg = limpa(corpo);
      try { const j = JSON.parse(corpo); msg = limpa(j.message || j.msg || j.error || corpo); } catch { /* texto puro */ }
      const dica = r.status === 401 ? ' (o token está errado ou venceu)'
        : r.status === 403 ? ' (o token não tem permissão neste projeto: crie outro com acesso total)'
        : r.status === 404 ? ' (projeto não encontrado: confira o endereço)' : '';
      throw new ErroSupabase(`${msg.slice(0, 600)}${dica}`, r.status, limpa(corpo));
    }
    throw ultimo;
  }

  return {
    pede,
    projetos: () => pede('GET', '/v1/projects'),
    projeto: (ref) => pede('GET', `/v1/projects/${ref}`),
    // roda SQL no banco do projeto (como o dono do banco). Devolve as linhas do último comando.
    sql: (ref, query) => pede('POST', `/v1/projects/${ref}/database/query`, { json: { query } }),
    chaves: (ref) => pede('GET', `/v1/projects/${ref}/api-keys?reveal=true`),
    auth: (ref) => pede('GET', `/v1/projects/${ref}/config/auth`),
    mudaAuth: (ref, campos) => pede('PATCH', `/v1/projects/${ref}/config/auth`, { json: campos }),
    postgrest: (ref) => pede('GET', `/v1/projects/${ref}/postgrest`),
    mudaPostgrest: (ref, campos) => pede('PATCH', `/v1/projects/${ref}/postgrest`, { json: campos }),
    segredos: (ref) => pede('GET', `/v1/projects/${ref}/secrets`),
    gravaSegredos: (ref, lista) => pede('POST', `/v1/projects/${ref}/secrets`, { json: lista }),
    funcoes: (ref) => pede('GET', `/v1/projects/${ref}/functions`),
    // publica uma Edge Function com vários arquivos (o Supabase empacota do lado de lá)
    publicaFuncao: (ref, nome, { entrada, arquivos, verifyJwt }) => {
      const form = new FormData();
      form.append('metadata', JSON.stringify({ name: nome, entrypoint_path: entrada, verify_jwt: !!verifyJwt }));
      for (const a of arquivos) form.append('file', new Blob([a.conteudo], { type: 'application/typescript' }), a.caminho);
      return pede('POST', `/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(nome)}`, { form });
    },
  };
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

// as chaves do projeto: a anon e a service_role "legadas" (JWT, as que tudo aceita)
// e as novas (sb_publishable_ / sb_secret_), quando existem
function separaChaves(lista) {
  const out = { anon: null, servico: null, publicavel: null, secreta: null };
  for (const k of Array.isArray(lista) ? lista : []) {
    const v = k.api_key || '';
    if (!v) continue;
    if (k.name === 'anon' || (k.type === 'legacy' && /anon/.test(k.name || ''))) out.anon = out.anon || v;
    else if (k.name === 'service_role' || (k.type === 'legacy' && /service/.test(k.name || ''))) out.servico = out.servico || v;
    else if (k.type === 'publishable' || v.startsWith('sb_publishable_')) out.publicavel = out.publicavel || v;
    else if (k.type === 'secret' || v.startsWith('sb_secret_')) out.secreta = out.secreta || v;
  }
  return out;
}

module.exports = { cliente, refDoEndereco, separaChaves, ErroSupabase, espera, API };
