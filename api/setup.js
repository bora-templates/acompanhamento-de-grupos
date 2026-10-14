/*
 * api/setup.js: o servidor da tela de instalação (/setup), na Vercel.
 *
 * A tela manda, a cada passo, o endereço do projeto do Supabase, o token do
 * Supabase e o token da Vercel. Nada disso é guardado aqui: cada pedido usa e
 * esquece. Quem faz o trabalho é o tools/instalar/instalar-pela-api.js (o mesmo
 * que o Claude Code pode rodar no computador).
 *
 * POST { acao, supabase_url, supabase_token, vercel_token, empresa, admin_nome, admin_email, admin_senha }
 *   conferir   confere o projeto do Supabase e o token da Vercel (antes de mexer em qualquer coisa)
 *   preparar   cria o caderno da instalação no banco
 *   banco      instala o banco, um pedaço por vez (a tela repete até "terminou")
 *   esquemas   libera os esquemas do Hub para o site
 *   login      endereço do site, cadastro fechado e e-mails do login em português
 *   segredos   os segredos que as funções leem
 *   funcoes    publica as Edge Functions (a tela repete até "terminou")
 *   admin      cria o primeiro administrador
 *   vercel     grava as variáveis do site na Vercel
 *   publicar   publica o site de novo, já ligado ao banco
 *   situacao   diz se a publicação nova já está no ar
 *   outfunnels         os valores para a Render (API do OutFunnels) e para o projeto do painel na Vercel
 *   outfunnels-ligar   grava o endereço do painel no Hub e publica o Hub de novo
 */
'use strict';
const I = require('../tools/instalar/instalar-pela-api');
const { cliente, refDoEndereco, ErroSupabase } = require('../tools/instalar/supabase-api');

const PRAZO = Number(process.env.HUB_SETUP_PRAZO_MS) || 240 * 1000;   // a Vercel corta em 300 s; a tela chama de novo e segue de onde parou

// ─── Vercel ──────────────────────────────────────────────────────────────────
async function vercel(token, metodo, caminho, corpo, equipe) {
  const u = new URL('https://api.vercel.com' + caminho);
  if (equipe) u.searchParams.set('teamId', equipe);
  const r = await fetch(u, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* texto */ }
  if (!r.ok) {
    const msg = (j && j.error && j.error.message) || t.slice(0, 300);
    const e = new Error(r.status === 403 || r.status === 401
      ? 'O token da Vercel não tem acesso a este projeto. Crie outro com Scope na sua equipe e All Projects.'
      : `A Vercel respondeu ${r.status}: ${String(msg).split(token).join('***')}`);
    e.status = r.status;
    throw e;
  }
  return j;
}
// o projeto pode morar numa equipe: descobre qual
async function equipeDoProjeto(token, projeto) {
  try { await vercel(token, 'GET', `/v9/projects/${projeto}`); return null; } catch (e) { if (e.status !== 403 && e.status !== 404) throw e; }
  const eq = await vercel(token, 'GET', '/v2/teams');
  for (const t of (eq && eq.teams) || []) {
    try { await vercel(token, 'GET', `/v9/projects/${projeto}`, null, t.id); return t.id; } catch (e) { /* outra equipe */ }
  }
  const e = new Error('O token da Vercel não enxerga este projeto. Crie outro com Scope na sua equipe e All Projects.');
  e.status = 403;
  throw e;
}

function siteDoPedido(req) {
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (prod) return 'https://' + prod.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? 'https://' + host : '';
}

// ─── o pedido ────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'use POST' });
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  const acao = String(b.acao || '');
  const inicio = Date.now();
  const ate = inicio + PRAZO;
  const url = String(b.supabase_url || '').trim().replace(/\/$/, '');
  const ref = refDoEndereco(url);
  const site = siteDoPedido(req);
  const empresa = String(b.empresa || '').trim().slice(0, 120);
  const projetoVercel = (process.env.VERCEL_PROJECT_ID || '').trim();
  try {
    if (!ref) return res.status(400).json({ ok: false, campo: 'supabase_url', erro: 'O endereço do projeto não parece certo. Ele termina em .supabase.co e fica em Project Overview, no Supabase.' });
    if (!b.supabase_token) return res.status(400).json({ ok: false, campo: 'supabase_token', erro: 'Falta o token do Supabase.' });
    const api = cliente(String(b.supabase_token).trim());

    switch (acao) {
      case 'conferir': {
        const p = await I.confereProjeto(api, ref, { ate: inicio + 20000 });
        await api.sql(ref, 'select 1');
        const chaves = await I.chavesDoProjeto(api, ref);
        let vercelOk = null;
        if (b.vercel_token) {
          if (!projetoVercel) vercelOk = { ok: false, erro: 'Esta tela precisa estar publicada na Vercel para gravar as variáveis.' };
          else { await equipeDoProjeto(String(b.vercel_token).trim(), projetoVercel); vercelOk = { ok: true }; }
        }
        const estado = await I.estadoDoBanco(api, ref).catch(() => ({ base: null, sistemas: {} }));
        return res.json({ ok: true, projeto: { nome: p.name, regiao: p.region }, chaves: { site: !!chaves.site, servico: !!chaves.servicoFinal }, vercel: vercelOk, site, jaInstalado: estado.sistemas });
      }
      case 'preparar': await I.preparaCaderno(api, ref); return res.json({ ok: true });
      case 'banco': {
        const r = await I.banco(api, ref, { url, ate });
        return res.json(Object.assign({ ok: true }, r));
      }
      case 'esquemas': return res.json(Object.assign({ ok: true }, await I.esquemas(api, ref)));
      case 'login': return res.json(Object.assign({ ok: true }, await I.login(api, ref, { site, empresa })));
      case 'segredos': {
        const chaves = await I.chavesDoProjeto(api, ref);
        const r = await I.segredos(api, ref, { site, empresa, chaves });
        return res.json({ ok: true, segredos: r.segredos.length });
      }
      case 'funcoes': {
        const r = await I.funcoes(api, ref, { ate });
        return res.json(Object.assign({ ok: true }, r));
      }
      case 'admin': {
        const chaves = await I.chavesDoProjeto(api, ref);
        const r = await I.administrador(api, ref, { url, chaves, empresa, nome: String(b.admin_nome || '').trim(), email: b.admin_email, senha: b.admin_senha, site });
        return res.json(Object.assign({ ok: true }, r));
      }
      case 'vercel': {
        if (!projetoVercel) throw new Error('Esta tela precisa estar publicada na Vercel para gravar as variáveis.');
        const token = String(b.vercel_token || '').trim();
        if (!token) return res.status(400).json({ ok: false, campo: 'vercel_token', erro: 'Falta o token da Vercel.' });
        const equipe = await equipeDoProjeto(token, projetoVercel);
        const chaves = await I.chavesDoProjeto(api, ref);
        const v = await I.valoresGerados(api, ref);
        const vars = [
          ['SUPABASE_URL', url, 'encrypted'],
          ['SUPABASE_ANON_KEY', chaves.site, 'encrypted'],
          ['SUPABASE_SERVICE_KEY', chaves.servicoFinal, 'encrypted'],
          ['EMPRESA_NOME', empresa || 'Hub', 'encrypted'],
          ['VAPID_PUBLIC_KEY', v.VAPID_PUBLIC_KEY, 'encrypted'],
        ];
        for (const [key, value, type] of vars)
          await vercel(token, 'POST', `/v10/projects/${projetoVercel}/env?upsert=true`, { key, value, type, target: ['production', 'preview', 'development'] }, equipe);
        await I.guarda(api, ref, 'vercel', { variaveis: vars.map(x => x[0]), em: new Date().toISOString() });
        return res.json({ ok: true, variaveis: vars.length });
      }
      case 'publicar': {
        const token = String(b.vercel_token || '').trim();
        const equipe = await equipeDoProjeto(token, projetoVercel);
        const lista = await vercel(token, 'GET', `/v6/deployments?projectId=${projetoVercel}&target=production&limit=1`, null, equipe);
        const ultimo = lista && lista.deployments && lista.deployments[0];
        if (!ultimo) throw new Error('Não achei a publicação do site na Vercel.');
        const nova = await vercel(token, 'POST', '/v13/deployments?forceNew=1', { name: ultimo.name, deploymentId: ultimo.uid, target: 'production' }, equipe);
        await I.guarda(api, ref, 'publicacao', { id: nova.id, em: new Date().toISOString() });
        return res.json({ ok: true, publicacao: nova.id });
      }
      case 'situacao': {
        const token = String(b.vercel_token || '').trim();
        const equipe = await equipeDoProjeto(token, projetoVercel);
        const id = String(b.publicacao || '');
        const d = await vercel(token, 'GET', `/v13/deployments/${encodeURIComponent(id)}`, null, equipe);
        return res.json({ ok: true, estado: d.readyState || d.status, site });
      }
      case 'outfunnels': {
        // os valores para a Render (API do OutFunnels) e para o projeto do painel na Vercel
        const chaves = await I.chavesDoProjeto(api, ref);
        let pool = null;
        try { pool = await api.pede('GET', `/v1/projects/${ref}/config/database/pooler`); } catch (e) { pool = null; }
        const p = Array.isArray(pool) ? (pool.find((x) => x.database_type === 'PRIMARY') || pool[0]) : pool;
        const host = p && (p.db_host || ((p.connection_string || '').match(/@([^:/]+)/) || [])[1]);
        const usuario = (p && p.db_user) || `postgres.${ref}`;
        // a Render não fala IPv6: vai pelo pooler do Supabase no modo sessão (porta 5432), em IPv4
        const banco = host ? `postgresql://${usuario}:[SENHA-DO-BANCO]@${host}:5432/postgres?schema=outfunnels&connection_limit=5` : null;
        return res.json({
          ok: true,
          render: { DATABASE_URL: banco, DIRECT_URL: banco, SUPABASE_URL: url, SUPABASE_ANON_KEY: chaves.site, CORS_ORIGIN: site, OUTFUNNELS_WEB_URL: site + '/outfunnels', EMPRESA_NOME: empresa || 'Hub' },
          web: { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: chaves.site },
        });
      }
      case 'outfunnels-ligar': {
        // grava o endereço do painel no projeto do Hub e publica o Hub de novo (o middleware.js desvia /outfunnels)
        const token = String(b.vercel_token || '').trim();
        const web = String(b.web_url || '').trim().replace(/\/+$/, '').replace(/\/outfunnels$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/i.test(web)) return res.status(400).json({ ok: false, campo: 'web_url', erro: 'O endereço do painel tem o formato https://nome-do-projeto.vercel.app.' });
        const equipe = await equipeDoProjeto(token, projetoVercel);
        await vercel(token, 'POST', `/v10/projects/${projetoVercel}/env?upsert=true`, { key: 'OUTFUNNELS_WEB_URL', value: web, type: 'encrypted', target: ['production', 'preview', 'development'] }, equipe);
        const lista = await vercel(token, 'GET', `/v6/deployments?projectId=${projetoVercel}&target=production&limit=1`, null, equipe);
        const ultimo = lista && lista.deployments && lista.deployments[0];
        if (!ultimo) throw new Error('Não achei a publicação do site na Vercel.');
        const nova = await vercel(token, 'POST', '/v13/deployments?forceNew=1', { name: ultimo.name, deploymentId: ultimo.uid, target: 'production' }, equipe);
        await I.guarda(api, ref, 'outfunnels', { web, em: new Date().toISOString() });
        return res.json({ ok: true, publicacao: nova.id });
      }
      default: return res.status(400).json({ ok: false, erro: 'ação desconhecida' });
    }
  } catch (e) {
    const status = e instanceof ErroSupabase ? (e.status >= 400 && e.status < 600 ? e.status : 500) : (e.status || 500);
    return res.status(status === 401 || status === 403 ? 400 : status).json({ ok: false, erro: e.message || 'Erro na instalação.' });
  }
};
