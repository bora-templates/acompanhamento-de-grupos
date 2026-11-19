#!/usr/bin/env node
/*
 * tools/vercel/montar.js: o "build" do site na Vercel (vercel.json → buildCommand).
 *
 * Lê as variáveis de ambiente do projeto na Vercel, escreve um empresa.json
 * temporário e chama o montar.js de sempre (tools/instalar/montar/montar.js).
 * Quem grava as variáveis é a tela de instalação (/setup), no fim da instalação:
 *
 *   SUPABASE_URL        endereço do projeto no Supabase (https://<projeto>.supabase.co)
 *   SUPABASE_ANON_KEY   a chave pública do projeto (vai para o navegador; nunca a secreta)
 *   EMPRESA_NOME        o nome da empresa nas telas e nos e-mails
 *   VAPID_PUBLIC_KEY    a chave pública do aviso no celular (opcional)
 *   SITE_DOMINIO        o domínio do site, se não for o da Vercel (opcional)
 *
 * Sem SUPABASE_URL (a primeira publicação, logo depois de importar o repositório),
 * o site sobe em MODO INSTALAÇÃO: a porta de entrada leva direto para /setup.
 * Rodando no computador: node tools/vercel/montar.js (com as variáveis no ambiente).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.join(RAIZ, 'dist');
const env = (n) => (process.env[n] || '').trim();

const url = env('SUPABASE_URL').replace(/\/$/, '');
const chave = env('SUPABASE_ANON_KEY');
const instalado = /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(url) && !!chave;
if (env('SUPABASE_URL') && !instalado) {
  console.error('✗ SUPABASE_URL ou SUPABASE_ANON_KEY não parecem certos. Confira as variáveis do projeto na Vercel (Settings → Environment Variables).');
  process.exit(1);
}
if (/sb_secret_|service_role/i.test(chave) || (chave.startsWith('eyJ') && /"role"\s*:\s*"service_role"/.test(Buffer.from(chave.split('.')[1] || '', 'base64').toString()))) {
  console.error('✗ SUPABASE_ANON_KEY é a chave SECRETA. Ela nunca vai para o site: troque pela anon (ou a publicável).');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(path.join(RAIZ, 'base', 'sistema.json'), 'utf8'));
const dominio = (env('SITE_DOMINIO') || env('VERCEL_PROJECT_PRODUCTION_URL') || 'app.seudominio.com.br').replace(/^https?:\/\//, '').replace(/\/$/, '');
const commit = env('VERCEL_GIT_COMMIT_SHA').slice(0, 7);
// o nome da empresa entra em texto de tela, em frase do JavaScript (entre aspas simples) e no manifesto (JSON):
// aspas e barras viram a forma tipográfica, para nenhum nome quebrar a tela
const empresa = (env('EMPRESA_NOME') || 'Sistema da empresa').replace(/'/g, '\u2019').replace(/"/g, '\u201D')
  .replace(/[\\<>`\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sistema da empresa';
const config = {
  _leia: 'gerado por tools/vercel/montar.js a partir das variáveis da Vercel; não vai para o repositório',
  '%SUPABASE_URL%': instalado ? url : '%SUPABASE_URL%',
  '%SUPABASE_ANON_KEY%': instalado ? chave : '%SUPABASE_ANON_KEY%',
  'https://SEU_PROJETO.supabase.co': instalado ? url : 'https://SEU_PROJETO.supabase.co',
  '%VAPID_PUBLIC_KEY%': env('VAPID_PUBLIC_KEY'),
  'app.seudominio.com.br': dominio,
  '%EMPRESA_NOME%': empresa,
  '%APP_VERSION%': base.versao,
  '%APP_BUILD%': (commit ? commit + ' · ' : '') + new Date().toISOString().slice(0, 10),
};
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-')), 'empresa.json');
fs.writeFileSync(tmp, JSON.stringify(config, null, 2));

const r = spawnSync(process.execPath, [path.join(RAIZ, 'tools', 'instalar', 'montar', 'montar.js'), '--saida', SAIDA, '--config', tmp], { stdio: 'inherit', cwd: RAIZ });
fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);

// a tela de instalação sabe se o sistema já está instalado (para dizer "já instalado") e o nome do pacote
let pacote = {};
try { pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pacote.json'), 'utf8')); } catch (e) { /* sem pacote.json: vale o nome do produto */ }
// os módulos que de fato estão nesta pasta (um módulo acrescentado depois entra aqui, mesmo
// que o pacote.json seja o do pacote original)
const naPasta = fs.readdirSync(RAIZ).filter((d) => d !== 'base' && fs.existsSync(path.join(RAIZ, d, 'sistema.json')))
  .map((d) => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'sistema.json'), 'utf8')); } catch (e) { return null; } })
  .filter(Boolean);
const nomes = naPasta.map((m) => m.nome).filter(Boolean);
const ids = naPasta.map((m) => m.id).filter(Boolean);   // a tela /setup acha o módulo pelo id (o nome pode mudar)
const doPacote = (pacote.modulos || []).map((m) => m.id).sort().join(',');
const mesmos = doPacote === naPasta.map((m) => m.id).sort().join(',');
const principal = mesmos && (pacote.modulos || []).find((m) => m.id === pacote.principal);
const titulo = principal ? principal.nome : nomes.length === 1 ? nomes[0] : (pacote.produto || 'Soluções com IA');
const marca = `<script>window.HUB_INSTALADO = ${instalado ? 'true' : 'false'}; window.HUB_PACOTE = ${JSON.stringify({ titulo, modulos: nomes, ids }).replace(/</g, '\\u003c')};</script>`;
const setup = path.join(SAIDA, 'setup', 'index.html');
if (fs.existsSync(setup)) fs.writeFileSync(setup, fs.readFileSync(setup, 'utf8').replace('</head>', marca + '\n</head>'));

if (!instalado) {
  // MODO INSTALAÇÃO: a porta de entrada (e qualquer endereço que não exista) leva para /setup
  const leva = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/setup/"><title>Instalação</title></head><body><p style="font-family:system-ui,sans-serif;padding:24px">Abrindo a instalação. Se ela não abrir sozinha, <a href="/setup/">clique aqui</a>.</p></body></html>\n`;
  fs.writeFileSync(path.join(SAIDA, 'index.html'), leva);
  fs.writeFileSync(path.join(SAIDA, '404.html'), leva);
  console.log('  MODO INSTALAÇÃO: o site abre em /setup até a instalação gravar as variáveis do Supabase na Vercel.');
} else {
  console.log(`  ligado ao Supabase ${url.replace(/^https:\/\//, '')} · empresa: ${config['%EMPRESA_NOME%']} · domínio: ${dominio}`);
}
