#!/usr/bin/env node
/*
 * emails-portugues.js — põe os e-mails do LOGIN em português (convite, nova senha,
 * troca de e-mail, link de acesso, confirmação e código) no Supabase da empresa:
 * os 6 modelos de base/supabase/templates/ (com %EMPRESA_NOME% trocado pelo nome
 * do empresa.json) E os ASSUNTOS. Sem isso, o Supabase manda em inglês
 * ("You have been invited").
 *
 * No projeto HOSPEDADO (pela Management API do Supabase):
 *   SUPABASE_ACCESS_TOKEN="sbp_…" node tools/instalar/emails-portugues.js --config empresa.json --projeto SEU_PROJETO
 *   … --simular      mostra o pedido (endereço e o JSON, com os modelos encurtados), sem mandar nada e sem o token
 *   … --salvar x.json  grava o JSON completo do pedido num arquivo (sem o token)
 *   O token de acesso é o "Personal access token" da conta (supabase.com → Account →
 *   Access Tokens). Ele é lido SÓ da variável SUPABASE_ACCESS_TOKEN: nunca é gravado
 *   nem mostrado. Depois de usar, pode apagar o token na mesma página.
 *   Pedido: PATCH https://api.supabase.com/v1/projects/{ref}/config/auth com os campos
 *   mailer_subjects_<tipo> e mailer_templates_<tipo>_content (documentação oficial:
 *   supabase.com/docs/guides/auth/auth-email-templates).
 *
 * No Supabase LOCAL (supabase start):
 *   node tools/instalar/emails-portugues.js --config empresa.json --local CAMINHO_DO_PROJETO_LOCAL
 *   Copia os modelos (com o nome trocado) para CAMINHO/supabase/templates/ e liga cada
 *   um no CAMINHO/supabase/config.toml ([auth.email.template.<tipo>]). Rodar de novo
 *   só atualiza. Vale depois de `supabase stop && supabase start`.
 *
 * Opções: --nome "Minha Empresa" (no lugar do empresa.json) · --api URL (outro
 * endereço da API, para teste) · --para PASTA (os modelos prontos numa pasta, para
 * colar no painel à mão — a alternativa sem token).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const tem = (n) => args.includes(n);

// tipo do Supabase → arquivo e assunto (os mesmos do base/README.md)
const MODELOS = [
  ['invite',           'convite',            'Você foi convidado para o %EMPRESA_NOME%'],
  ['recovery',         'recuperar-senha',    'Crie uma nova senha · %EMPRESA_NOME%'],
  ['email_change',     'mudar-email',        'Confirme o seu novo e-mail · %EMPRESA_NOME%'],
  ['magic_link',       'link-magico',        'Seu link de acesso · %EMPRESA_NOME%'],
  ['confirmation',     'confirmar-cadastro', 'Confirme o seu e-mail · %EMPRESA_NOME%'],
  ['reauthentication', 'reautenticacao',     'Seu código de confirmação · %EMPRESA_NOME%'],
];

function falha(msg) { console.error('✗ ' + msg); process.exit(1); }

// ─── o nome da empresa ───────────────────────────────────────────────────────
let nome = opt('--nome', null);
if (!nome && opt('--config', null)) {
  const f = path.resolve(opt('--config'));
  if (!fs.existsSync(f)) falha(`não achei ${f}`);
  nome = (JSON.parse(fs.readFileSync(f, 'utf8'))['%EMPRESA_NOME%'] || '').trim();
}
if (!nome) falha('falta o nome da empresa: ponha "%EMPRESA_NOME%" no empresa.json (--config) ou use --nome "Minha Empresa"');
if (nome === 'Sua Empresa') console.log('  ! o nome da empresa ainda é o do exemplo ("Sua Empresa"). Troque no empresa.json');

// ─── os modelos prontos (nome trocado) ───────────────────────────────────────
const PASTA_MODELOS = path.join(RAIZ, 'base', 'supabase', 'templates');
const prontos = MODELOS.map(([tipo, arq, assunto]) => {
  const f = path.join(PASTA_MODELOS, arq + '.html');
  if (!fs.existsSync(f)) falha(`não achei o modelo ${path.relative(process.cwd(), f)}`);
  return { tipo, arq, assunto: assunto.split('%EMPRESA_NOME%').join(nome), html: fs.readFileSync(f, 'utf8').split('%EMPRESA_NOME%').join(nome) };
});

function anotaNoMapa(como) {
  const mapa = path.join(RAIZ, 'instalacao.json');
  if (!fs.existsSync(mapa)) return;
  try {
    const m = JSON.parse(fs.readFileSync(mapa, 'utf8'));
    m.emails_portugues = { em: new Date().toISOString(), como, empresa: nome };
    fs.writeFileSync(mapa, JSON.stringify(m, null, 2) + '\n');
  } catch (e) { /* o mapa é só registro: não para por causa dele */ }
}

// ─── 1. só os arquivos (para colar no painel) ────────────────────────────────
if (opt('--para', null)) {
  const d = path.resolve(opt('--para'));
  fs.mkdirSync(d, { recursive: true });
  for (const p of prontos) fs.writeFileSync(path.join(d, p.arq + '.html'), p.html);
  fs.writeFileSync(path.join(d, 'ASSUNTOS.txt'), prontos.map(p => `${p.tipo.padEnd(17)} ${p.assunto}`).join('\n') + '\n');
  console.log(`✓ ${prontos.length} modelos prontos em ${d} (e os assuntos em ASSUNTOS.txt). Cole no painel, em Authentication → Emails`);
  process.exit(0);
}

// ─── 2. Supabase LOCAL: arquivos + config.toml ───────────────────────────────
if (opt('--local', null)) {
  const proj = path.resolve(opt('--local'));
  const cfg = path.join(proj, 'supabase', 'config.toml');
  if (!fs.existsSync(cfg)) falha(`não achei ${cfg} (o --local é a pasta onde você roda o "supabase start")`);
  const dest = path.join(proj, 'supabase', 'templates');
  fs.mkdirSync(dest, { recursive: true });
  for (const p of prontos) fs.writeFileSync(path.join(dest, p.arq + '.html'), p.html);
  let linhas = fs.readFileSync(cfg, 'utf8').split('\n');
  const toml = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  for (const p of prontos) {
    const cab = `[auth.email.template.${p.tipo}]`;
    const quer = { subject: toml(p.assunto), content_path: toml(`./supabase/templates/${p.arq}.html`) };
    const i = linhas.findIndex(l => l.trim() === cab);
    if (i < 0) {
      // seção nova: antes de [auth.sms], se existir; senão no fim
      let j = linhas.findIndex(l => l.trim() === '[auth.sms]');
      const bloco = [cab, `subject = ${quer.subject}`, `content_path = ${quer.content_path}`, ''];
      if (j < 0) { if (linhas[linhas.length - 1] !== '') linhas.push(''); linhas.push(...bloco); }
      else linhas.splice(j, 0, ...bloco);
      continue;
    }
    let fim = linhas.findIndex((l, k) => k > i && /^\s*\[/.test(l));
    if (fim < 0) fim = linhas.length;
    for (const [k, v] of Object.entries(quer)) {
      const at = linhas.slice(i + 1, fim).findIndex(l => new RegExp('^\\s*#?\\s*' + k + '\\s*=').test(l));
      if (at >= 0) linhas[i + 1 + at] = `${k} = ${v}`;
      else { linhas.splice(i + 1, 0, `${k} = ${v}`); fim++; }
    }
  }
  fs.writeFileSync(cfg, linhas.join('\n'));
  anotaNoMapa('local');
  console.log(`✓ e-mails do login em português no Supabase local (${nome}): ${prontos.length} modelos em supabase/templates/ e ligados no config.toml`);
  console.log('  vale depois de: supabase stop && supabase start');
  process.exit(0);
}

// ─── 3. projeto HOSPEDADO: Management API ────────────────────────────────────
const ref = opt('--projeto', null);
if (!ref) falha('diga onde aplicar: --projeto SEU_PROJETO (hospedado), --local PASTA (Supabase local) ou --para PASTA (arquivos para colar no painel)');
if (!/^[a-z0-9]{6,40}$/.test(ref)) falha(`"${ref}" não parece o identificador de um projeto (o SEU_PROJETO de https://SEU_PROJETO.supabase.co)`);
const api = (opt('--api', 'https://api.supabase.com')).replace(/\/$/, '');
const url = `${api}/v1/projects/${ref}/config/auth`;
const corpo = {};
for (const p of prontos) { corpo[`mailer_subjects_${p.tipo}`] = p.assunto; corpo[`mailer_templates_${p.tipo}_content`] = p.html; }

if (opt('--salvar', null)) { fs.writeFileSync(path.resolve(opt('--salvar')), JSON.stringify(corpo, null, 2) + '\n'); console.log(`  pedido completo gravado em ${opt('--salvar')} (sem o token)`); }
if (tem('--simular')) {
  const curto = {};
  for (const [k, v] of Object.entries(corpo)) curto[k] = k.includes('_content') ? `${v.replace(/\s+/g, ' ').slice(0, 70)} (encurtado, ${v.length} caracteres)` : v;
  console.log(`PATCH ${url}`);
  console.log('Authorization: Bearer <SUPABASE_ACCESS_TOKEN, não mostrado>');
  console.log('Content-Type: application/json\n');
  console.log(JSON.stringify(curto, null, 2));
  console.log('\n(simulação: nada foi enviado)');
  process.exit(0);
}
const token = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!token) falha('defina SUPABASE_ACCESS_TOKEN (o token de acesso da sua conta do Supabase: supabase.com → Account → Access Tokens). Ele não é gravado nem mostrado. Sem token: use --para PASTA e cole no painel.');

(async () => {
  let r;
  try {
    r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  } catch (e) { falha(`não consegui falar com ${api} (${e.message})`); }
  if (!r.ok) {
    let txt = ''; try { txt = (await r.text()).slice(0, 300); } catch (e) {}
    const dica = r.status === 401 ? '. O token está inválido ou vencido: crie outro em Account › Access Tokens' : r.status === 403 ? '. O token não tem acesso a este projeto: use um token da conta dona do projeto' : r.status === 404 ? '. O projeto não foi encontrado: confira o SEU_PROJETO' : '';
    falha(`a API respondeu ${r.status}${dica}${txt ? ': ' + txt.split(token).join('***') : ''}`);
  }
  anotaNoMapa('projeto');
  console.log(`✓ e-mails do login em português no projeto ${ref} (${nome}): ${prontos.length} modelos e os assuntos`);
})();
