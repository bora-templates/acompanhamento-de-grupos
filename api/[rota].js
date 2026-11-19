/*
 * api/[rota].js: as rotas de servidor dos módulos, na Vercel.
 *
 * Alguns módulos têm uma rota que roda no servidor (a pasta api/ dentro deles): o
 * compartilhamento do produto (base/produtos), o desligamento do RH, o convite
 * do Metas e o formulário do Projetos. As telas chamam todas pelo mesmo
 * endereço, /api/<nome>. Esta porta passa o pedido para o arquivo do módulo, sem mudar
 * nada nele: quem personaliza mexe no arquivo dentro do módulo, como sempre.
 *
 * Cada rota está escrita abaixo com o caminho inteiro de propósito: é assim que a
 * Vercel descobre quais arquivos levar junto na publicação. ROTA NOVA num módulo entra
 * nesta lista. Rota de módulo que não está nesta instalação responde "não instalado".
 *
 * As rotas usam SUPABASE_URL e SUPABASE_SERVICE_KEY, que a instalação (/setup) grava
 * nas variáveis do projeto na Vercel.
 */
'use strict';

const ROTAS = {
  'produto-share': () => require('../base/produtos/api/produto-share.js'),
  formy: () => require('../projetos/api/formy.js'),
  invite: () => require('../metas/api/invite.js'),
  offboarding: () => require('../rh/api/offboarding.js'),
};

module.exports = async function handler(req, res) {
  const rota = String((req.query && req.query.rota) || '').trim();
  const carrega = Object.prototype.hasOwnProperty.call(ROTAS, rota) ? ROTAS[rota] : null;
  if (!carrega) return res.status(404).json({ error: 'rota não encontrada' });
  let mod;
  try { mod = carrega(); } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') return res.status(404).json({ error: 'o módulo desta rota não está instalado' });
    throw e;
  }
  const h = (mod && typeof mod.default === 'function') ? mod.default : mod;
  if (typeof h !== 'function') return res.status(500).json({ error: 'a rota do módulo não exporta uma função' });
  return h(req, res);
};
