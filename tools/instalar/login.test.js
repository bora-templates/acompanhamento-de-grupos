// login.test.js: o passo "login" da instalação no plano gratuito do Supabase.
// Conferido em 14/10/2026 num projeto de verdade: com o e-mail padrão do Supabase, o plano gratuito recusa trocar os textos
// dos e-mails ("Email template modification is not available for free tier projects ..."). A instalação segue sem eles.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const I = require('./instalar-pela-api');
const { ErroSupabase } = require('./supabase-api');

const RECUSA_DO_PLANO_GRATUITO = 'Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider.';

test('login: no plano gratuito sem SMTP próprio, segue sem trocar os e-mails e avisa', async () => {
  const pedidos = [];
  const api = {
    auth: async () => ({ uri_allow_list: '' }),
    mudaAuth: async (_ref, campos) => {
      pedidos.push(campos);
      if (Object.keys(campos).some((k) => k.startsWith('mailer_'))) throw new ErroSupabase(RECUSA_DO_PLANO_GRATUITO, 400);
      return {};
    },
  };
  const r = await I.login(api, 'abc', { site: 'https://site.teste', empresa: 'Contorno Estética' });
  assert.equal(r.emails, false);
  assert.match(r.aviso, /inglês/);
  assert.equal(pedidos.length, 2);
  assert.ok(Object.keys(pedidos[1]).every((k) => !k.startsWith('mailer_')), 'a segunda tentativa vai sem os e-mails');
  assert.equal(pedidos[1].site_url, 'https://site.teste');
  assert.equal(pedidos[1].disable_signup, true);
});

test('login: com os e-mails aceitos, nada muda', async () => {
  const pedidos = [];
  const api = { auth: async () => ({}), mudaAuth: async (_ref, campos) => { pedidos.push(campos); return {}; } };
  const r = await I.login(api, 'abc', { site: 'https://site.teste', empresa: 'Contorno Estética' });
  assert.equal(r.emails, true);
  assert.equal(pedidos.length, 1);
});

test('login: outro erro do Supabase continua parando o passo', async () => {
  const api = { auth: async () => ({}), mudaAuth: async () => { throw new ErroSupabase('Invalid site_url', 400); } };
  await assert.rejects(I.login(api, 'abc', { site: 'https://site.teste', empresa: 'X' }), /Invalid site_url/);
});
