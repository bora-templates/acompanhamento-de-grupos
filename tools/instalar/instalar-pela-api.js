#!/usr/bin/env node
/*
 * instalar-pela-api.js: instala o Hub num projeto do Supabase SÓ pela internet,
 * com o token de acesso da conta: banco, esquemas liberados para o site, e-mails do
 * login em português, segredos, Edge Functions e o primeiro administrador.
 * Não precisa de psql, bash, Docker nem Supabase CLI: roda igual no Mac e no Windows.
 *
 * É o mesmo motor da tela de instalação do site (/setup), que chama estes passos
 * pela Vercel (api/setup.js). Cada passo pode ser repetido sem duplicar nada, e a
 * instalação retoma do ponto em que parou (o banco guarda o que já foi feito na
 * tabela public._hub_instalacao).
 *
 * Pela linha de comando (o Claude Code roda assim, se a pessoa preferir não usar a tela):
 *   SUPABASE_ACCESS_TOKEN="<token>" HUB_ADMIN_SENHA="<senha>" node tools/instalar/instalar-pela-api.js \
 *     --projeto https://SEU_PROJETO.supabase.co --site https://seu-site.vercel.app \
 *     --empresa "Minha Empresa" --admin-nome "Seu Nome" --admin-email voce@empresa.com
 *   O token e a senha vêm SÓ das variáveis: nunca são gravados nem mostrados.
 *   --simular   diz o que faria, sem mexer em nada
 *   --so banco|esquemas|auth|segredos|funcoes|admin   roda só um passo
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Plano = require('./plano');
const Pecas = require('./pecas');
const { cliente, refDoEndereco, separaChaves, ErroSupabase, espera } = require('./supabase-api');

const RAIZ = Pecas.RAIZ_PADRAO;
const TABELA = 'public._hub_instalacao';

// ─── o caderno da instalação (o que já foi feito) ───────────────────────────
const SQL_CADERNO = `
create table if not exists ${TABELA} (
  passo    text primary key,
  feito_em timestamptz not null default now(),
  valor    jsonb
);
alter table ${TABELA} enable row level security;
revoke all on ${TABELA} from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on ${TABELA} from anon, authenticated'; end if;
end $$;
comment on table ${TABELA} is 'O que a instalação do Hub já fez (pedaços do banco, funções publicadas, valores gerados). Só o dono do banco lê. Pode apagar depois de instalar: a instalação refaz o que faltar.';
`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function preparaCaderno(api, ref) { await api.sql(ref, SQL_CADERNO); }
async function feitos(api, ref, prefixo) {
  const r = await api.sql(ref, `select passo from ${TABELA} where passo like ${lit(prefixo + '%')}`);
  return new Set((r || []).map(x => x.passo));
}
async function guarda(api, ref, passo, valor) {
  await api.sql(ref, `insert into ${TABELA} (passo, valor) values (${lit(passo)}, ${valor === undefined ? 'null' : lit(JSON.stringify(valor)) + '::jsonb'})
    on conflict (passo) do update set feito_em = now(), valor = excluded.valor`);
}
async function le(api, ref, passo) {
  const r = await api.sql(ref, `select valor from ${TABELA} where passo = ${lit(passo)}`);
  return r && r[0] ? r[0].valor : null;
}

// ─── o que já está no banco ──────────────────────────────────────────────────
// Quem diz o que está instalado é hub.sistemas_instalados. Um banco antigo, instalado
// antes dessa tabela existir, é reconhecido pela tabela hub.users; mas, se esta
// instalação já começou a rodar pedaços (o caderno tem "sql:"), a hub.users pode ser
// só metade de uma base em andamento, e aí ela não conta.
async function estadoDoBanco(api, ref) {
  const r = await api.sql(ref, `select to_regclass('hub.sistemas_instalados') is not null as tem, to_regclass('hub.users') is not null as base, to_regclass('${TABELA}') is not null as caderno`);
  const tem = r && r[0] && r[0].tem, base = r && r[0] && r[0].base, caderno = r && r[0] && r[0].caderno;
  const linhas = tem ? await api.sql(ref, 'select sistema, versao from hub.sistemas_instalados') : [];
  const sistemas = {};
  for (const l of linhas || []) sistemas[l.sistema] = l.versao || null;
  if (sistemas.base) return { base: sistemas.base, sistemas };
  let nossa = false;
  if (caderno) { const c = await api.sql(ref, `select count(*)::int as n from ${TABELA} where passo like 'sql:%'`); nossa = !!(c && c[0] && c[0].n); }
  return { base: base && !nossa ? '1.0.0' : null, sistemas };
}

// ─── 1. o BANCO, pedaço por pedaço ───────────────────────────────────────────
// ate = horário (ms) em que este pedido precisa parar (a Vercel corta a função
// depois de alguns minutos); a tela chama de novo e ele segue de onde parou.
async function banco(api, ref, { mods = [], raiz = RAIZ, ate = Infinity, url, aoAvancar = () => {} } = {}) {
  // O plano é feito UMA vez, com o banco como estava no começo, e guardado no caderno até o
  // fim: no meio da instalação o banco fica pela metade, e refazer o plano a cada pedido
  // mudaria o caminho no meio dele.
  const emAndamento = await le(api, ref, 'banco:em-andamento');
  const estado = emAndamento && emAndamento.estado ? emAndamento.estado : await estadoDoBanco(api, ref);
  if (!emAndamento) await guarda(api, ref, 'banco:em-andamento', { estado, em: new Date().toISOString() });
  const plano = Plano.planoDoBanco(mods, estado, raiz);
  if (plano.recusas.length) throw new ErroSupabase('Esta instalação não fecha: ' + plano.recusas.join(' '), 400);
  const ja = await feitos(api, ref, 'sql:');
  const todos = plano.etapas.flatMap(e => e.pedacos);
  const total = todos.length + plano.ligacoes.length;
  let feitosAgora = todos.filter(p => ja.has('sql:' + p.id)).length;
  const troca = (sql) => url ? sql.split('https://SEU_PROJETO.supabase.co').join(url.replace(/\/$/, '')) : sql;

  // cada pedido faz pelo menos um pedaço, mesmo com o prazo estourado: assim a tela sempre anda
  let fezAlgo = false;
  for (const etapa of plano.etapas) {
    for (const p of etapa.pedacos) {
      if (ja.has('sql:' + p.id)) continue;
      if (fezAlgo && Date.now() > ate) return { terminou: false, feitos: feitosAgora, total, etapa: etapa.titulo };
      aoAvancar({ feitos: feitosAgora, total, etapa: etapa.titulo, pedaco: p.id });
      try {
        // o pedaço e a anotação vão juntos: entram os dois ou nenhum
        await api.sql(ref, Plano.PREAMBULO + troca(p.sql) + `\n;\ninsert into ${TABELA} (passo) values (${lit('sql:' + p.id)}) on conflict (passo) do nothing;`);
      } catch (e) {
        throw new ErroSupabase(`O banco recusou ${p.id}: ${e.message}`, e.status || 500);
      }
      feitosAgora++;
      fezAlgo = true;
    }
    // a etapa inteira entrou: anota no banco (hub.sistemas_instalados)
    if (etapa.marcas.length) await api.sql(ref, etapa.marcas.join('\n'));
  }
  // as ligações de todos, sempre no fim e num pedido só (rodar de novo não duplica nem apaga)
  if (fezAlgo && Date.now() > ate) return { terminou: false, feitos: feitosAgora, total, etapa: 'Ligações' };
  let n = 0;
  for (const p of plano.ligacoes) {
    aoAvancar({ feitos: feitosAgora + n, total, etapa: 'Ligações entre os módulos', pedaco: p.id });
    try { await api.sql(ref, Plano.PREAMBULO + troca(p.sql)); }
    catch (e) { throw new ErroSupabase(`O banco recusou a ligação ${p.id}: ${e.message}`, e.status || 500); }
    n++;
  }
  await guarda(api, ref, 'banco', { modulos: plano.modulos, pecas: plano.pecas, em: new Date().toISOString() });
  await api.sql(ref, `delete from ${TABELA} where passo = 'banco:em-andamento'`);
  return { terminou: true, feitos: total, total, modulos: plano.modulos, pecas: plano.pecas };
}

// ─── 2. os esquemas que o site lê ────────────────────────────────────────────
async function esquemas(api, ref, { mods = [], raiz = RAIZ } = {}) {
  const atual = await api.postgrest(ref);
  const quer = Plano.esquemasExpostos(mods, raiz);
  const tem = String((atual && atual.db_schema) || '').split(',').map(s => s.trim()).filter(Boolean);
  const junto = tem.concat(quer.filter(s => !tem.includes(s)));
  if (junto.length !== tem.length) await api.mudaPostgrest(ref, { db_schema: junto.join(',') });
  return { esquemas: junto };
}

// ─── 3. o login: endereço do site, cadastro fechado e e-mails em português ──
const MODELOS = [
  ['invite', 'convite', 'Você foi convidado para o %EMPRESA_NOME%'],
  ['recovery', 'recuperar-senha', 'Crie uma nova senha · %EMPRESA_NOME%'],
  ['email_change', 'mudar-email', 'Confirme o seu novo e-mail · %EMPRESA_NOME%'],
  ['magic_link', 'link-magico', 'Seu link de acesso · %EMPRESA_NOME%'],
  ['confirmation', 'confirmar-cadastro', 'Confirme o seu e-mail · %EMPRESA_NOME%'],
  ['reauthentication', 'reautenticacao', 'Seu código de confirmação · %EMPRESA_NOME%'],
];
async function login(api, ref, { site, empresa, raiz = RAIZ } = {}) {
  const campos = { disable_signup: true };
  if (site) {
    const s = site.replace(/\/$/, '');
    const atual = await api.auth(ref);
    const lista = String((atual && atual.uri_allow_list) || '').split(',').map(x => x.trim()).filter(Boolean);
    for (const u of [`${s}/entrar/`, `${s}/**`]) if (!lista.includes(u)) lista.push(u);
    Object.assign(campos, { site_url: s, uri_allow_list: lista.join(',') });
  }
  if (empresa) {
    for (const [tipo, arq, assunto] of MODELOS) {
      const f = path.join(raiz, 'base', 'supabase', 'templates', arq + '.html');
      if (!fs.existsSync(f)) continue;
      campos[`mailer_subjects_${tipo}`] = assunto.split('%EMPRESA_NOME%').join(empresa);
      campos[`mailer_templates_${tipo}_content`] = fs.readFileSync(f, 'utf8').split('%EMPRESA_NOME%').join(empresa);
    }
  }
  try {
    await api.mudaAuth(ref, campos);
  } catch (e) {
    // Plano gratuito com o e-mail padrão do Supabase (conferido num projeto de verdade em 14/10/2026): trocar os textos dos
    // e-mails é recusado com "Email template modification is not available for free tier projects". O resto do login segue.
    if (!(e && e.status === 400 && /email template modification is not available/i.test(String(e.message)))) throw e;
    for (const k of Object.keys(campos)) if (k.startsWith('mailer_')) delete campos[k];
    await api.mudaAuth(ref, campos);
    return {
      site_url: campos.site_url || null, emails: false,
      aviso: 'Os e-mails do login ficam no padrão do Supabase, em inglês, porque o plano gratuito só deixa trocar os textos com um servidor de e-mail próprio (SMTP).',
    };
  }
  return { site_url: campos.site_url || null, emails: !!empresa };
}

// ─── 4. os segredos que as funções leem ──────────────────────────────────────
const aleatorio = (n = 32) => crypto.randomBytes(n).toString('base64url');
// par de chaves do aviso no celular (Web Push / VAPID): P-256, em base64url
function chavesVapid() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publica: ecdh.getPublicKey().toString('base64url'), privada: ecdh.getPrivateKey().toString('base64url') };
}
// Os valores gerados ficam no caderno (só o dono do banco lê), para a instalação
// retomada usar os mesmos. Nada disso vai para o site, fora a chave PÚBLICA do aviso.
async function valoresGerados(api, ref) {
  let v = await le(api, ref, 'valores');
  if (!v) {
    const vapid = chavesVapid();
    v = {
      PRIMEIRO_ACESSO_CHAVE: aleatorio(24),
      APP_PUSH_TOKEN: aleatorio(24),
      WPP_WEBHOOK_KEY: aleatorio(18),
      VAPID_PUBLIC_KEY: vapid.publica,
      VAPID_PRIVATE_KEY: vapid.privada,
    };
    await guarda(api, ref, 'valores', v);
  }
  return v;
}
async function segredos(api, ref, { site, empresa, chaves = {} } = {}) {
  const v = await valoresGerados(api, ref);
  const s = site ? site.replace(/\/$/, '') : '';
  const lista = [
    ['PRIMEIRO_ACESSO_CHAVE', v.PRIMEIRO_ACESSO_CHAVE],
    ['APP_PUSH_TOKEN', v.APP_PUSH_TOKEN],
    ['VAPID_PUBLIC_KEY', v.VAPID_PUBLIC_KEY],
    ['VAPID_PRIVATE_KEY', v.VAPID_PRIVATE_KEY],
    ['WPP_WEBHOOK_KEY', v.WPP_WEBHOOK_KEY],
    ['EMPRESA_NOME', empresa || ''],
    ['INVITE_REDIRECT_URL', s ? `${s}/entrar/` : ''],
    ['APP_BASE_URL', s],
    ['AGENDAR_BASE_URL', s],
    ['OUTSIGN_VERIFICAR_URL', s ? `${s}/outsign/verificar` : ''],
    ['SB_SECRET_KEY', chaves.secreta || ''],
  ].filter(([, valor]) => valor).map(([name, value]) => ({ name, value }));
  await api.gravaSegredos(ref, lista);
  // o banco chama o aviso no celular com este token (guardado no cofre do Supabase)
  await api.sql(ref, `do $$ begin
    if exists (select 1 from pg_namespace where nspname = 'vault') then
      if exists (select 1 from vault.secrets where name = 'cron_app-push') then
        perform vault.update_secret((select id from vault.secrets where name = 'cron_app-push'), ${lit(v.APP_PUSH_TOKEN)});
      else
        perform vault.create_secret(${lit(v.APP_PUSH_TOKEN)}, 'cron_app-push', 'token do aviso no celular (app-push), gravado pela instalação');
      end if;
    end if;
  end $$;`);
  return { segredos: lista.map(x => x.name), vapidPublica: v.VAPID_PUBLIC_KEY };
}

// ─── 5. as Edge Functions ────────────────────────────────────────────────────
function resumo(texto) { return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16); }
async function funcoes(api, ref, { mods = [], raiz = RAIZ, ate = Infinity, aoAvancar = () => {} } = {}) {
  const estado = await estadoDoBanco(api, ref);
  const jaModulos = Object.keys(estado.sistemas).filter(s => s !== 'base' && !s.startsWith('base.'));
  const lista = Plano.planoDasFuncoes(mods.length ? mods : Plano.modulosDaPasta(raiz), raiz, { jaModulos });
  const ja = await feitos(api, ref, 'fn:');
  let n = 0, publicouAlguma = false;
  let aAnotar = [];
  const anota = async () => {
    if (!aAnotar.length) return;
    const sql = aAnotar.map(([nome, marca]) => `delete from ${TABELA} where passo like ${lit('fn:' + nome + ':%')}; insert into ${TABELA} (passo) values (${lit(marca)});`).join('\n');
    aAnotar = [];
    await api.sql(ref, sql);
  };
  for (const f of lista) {
    const raizFn = path.join(raiz, f.pasta);
    const arquivos = f.arquivos.map(caminho => ({ caminho, conteudo: fs.readFileSync(path.join(raizFn, caminho), 'utf8') }));
    // quem confere o login é a própria função (o portão do Supabase recusa o login dos
    // projetos novos, que assinam com chaves ES256): publica sem a trava do portão
    const marcaFn = `fn:${f.nome}:${resumo(arquivos.map(a => a.caminho + '\n' + a.conteudo).join('\n'))}`;
    if (ja.has(marcaFn)) { n++; continue; }
    if (publicouAlguma && Date.now() > ate) { await anota(); return { terminou: false, feitos: n, total: lista.length }; }
    aoAvancar({ feitos: n, total: lista.length, funcao: f.nome });
    try {
      await api.publicaFuncao(ref, f.nome, { entrada: f.entrada, arquivos, verifyJwt: false });
    } catch (e) {
      await anota();
      throw new ErroSupabase(`Não consegui publicar a função ${f.nome}: ${e.message}`, e.status || 500);
    }
    // a anotação de cada função publicada vai junto, de tempos em tempos (menos pedidos ao Supabase)
    aAnotar.push([f.nome, marcaFn]);
    if (aAnotar.length >= 8) await anota();
    n++;
    publicouAlguma = true;
  }
  await anota();
  return { terminou: true, feitos: n, total: lista.length, funcoes: lista.map(f => f.nome) };
}

// ─── 6. o primeiro administrador ─────────────────────────────────────────────
// Módulo cuja chave de acesso é RESTRITA (a tela Usuários só libera na mão e o cartão do Início não aparece sem a
// chave): quem instala já nasce com a chave, no nível admin, senão não enxergaria o módulo logo depois de entrar.
const CHAVES_RESTRITAS = { outgrupos: 'grupos' };
async function administrador(api, ref, { url, chaves, empresa, nome, email, senha, site } = {}) {
  const disp = await api.sql(ref, 'select hub.primeiro_acesso_disponivel() as livre');
  if (!(disp && disp[0] && disp[0].livre)) return { criado: false, motivo: 'ja_tem_admin' };
  const servico = chaves.servico || chaves.secreta;
  if (!servico) throw new ErroSupabase('Não achei a chave de serviço do projeto.', 500);
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new ErroSupabase('O e-mail do administrador não parece válido.', 400);
  if (!senha || senha.length < 8 || senha.length > 72) throw new ErroSupabase('A senha precisa ter de 8 a 72 caracteres.', 400);
  // o login já existe (instalação retomada)? usa o mesmo
  const ja = await api.sql(ref, `select id from auth.users where lower(email) = ${lit(mail)} limit 1`);
  let uid = ja && ja[0] && ja[0].id;
  if (!uid) {
    const r = await fetch(url.replace(/\/$/, '') + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { apikey: servico, Authorization: 'Bearer ' + servico, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, password: senha, email_confirm: true, user_metadata: { full_name: nome } }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || !corpo.id) throw new ErroSupabase(`Não consegui criar o login do administrador: ${corpo.msg || corpo.message || r.status}`, r.status || 500);
    uid = corpo.id;
  }
  // a chave restrita vai no mesmo pedido: entram a ficha do administrador e a chave, ou nenhuma das duas
  const modulos = Pecas.manifestos(RAIZ);
  const restritas = Object.fromEntries(Object.entries(CHAVES_RESTRITAS).filter(([m]) => modulos[m]).map(([, k]) => [k, 'admin']));
  await api.sql(ref, `select hub.primeiro_acesso_concluir(${lit(uid)}::uuid, ${lit(nome)}, ${lit(empresa)});` +
    (site ? `select hub.primeiro_acesso_site(${lit(site.replace(/\/$/, ''))});` : '') +
    (Object.keys(restritas).length ? `update hub.users set acessos = coalesce(acessos, '{}'::jsonb) || ${lit(JSON.stringify(restritas))}::jsonb where id = ${lit(uid)}::uuid;` : ''));
  return { criado: true };
}

// ─── as chaves do projeto (para o site e para as rotas da Vercel) ───────────
async function chavesDoProjeto(api, ref) {
  const k = separaChaves(await api.chaves(ref));
  // o site usa a anon legada quando existe (passa em todo lugar) e a publicável se não
  const site = k.anon || k.publicavel;
  const servico = k.servico || k.secreta;
  if (!site || !servico) throw new ErroSupabase('O projeto não devolveu as chaves de API. Confira se o token tem acesso total.', 500);
  return Object.assign(k, { site, servicoFinal: servico });
}

// espera o projeto ficar pronto (logo depois de criado, ele leva uns minutos)
async function confereProjeto(api, ref, { ate = Date.now() + 60000 } = {}) {
  for (;;) {
    const p = await api.projeto(ref);
    if (p && p.status === 'ACTIVE_HEALTHY') return p;
    if (p && /PAUSED|INACTIVE/.test(p.status || '')) throw new ErroSupabase('Este projeto do Supabase está pausado. Abra o projeto no Supabase e clique em Restore.', 409);
    if (Date.now() > ate) throw new ErroSupabase(`O projeto ainda não está pronto (situação: ${p && p.status}). Espere um minuto e tente de novo.`, 409);
    await espera(4000);
  }
}

module.exports = { preparaCaderno, estadoDoBanco, banco, esquemas, login, segredos, funcoes, administrador,
  chavesDoProjeto, confereProjeto, guarda, le, valoresGerados, chavesVapid, TABELA };

// ─── linha de comando ────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const tem = (n) => args.includes(n);
  const falha = (m) => { console.error('✗ ' + m); process.exit(1); };
  (async () => {
    const url = (opt('--projeto') || '').trim().replace(/\/$/, '');
    const ref = refDoEndereco(url);
    if (!ref) falha('diga o endereço do projeto: --projeto https://SEU_PROJETO.supabase.co (Project URL, no Supabase)');
    const site = (opt('--site') || '').trim().replace(/\/$/, '');
    const empresa = (opt('--empresa') || '').trim();
    const mods = (opt('--modulos') || '').split(',').map(s => s.trim()).filter(Boolean);
    const so = opt('--so', null);
    if (tem('--simular')) {
      const p = Plano.planoDoBanco(mods);
      console.log(`Projeto ${ref} · site ${site || '(sem site)'} · empresa ${empresa || '(sem nome)'}`);
      console.log(`Banco: ${p.etapas.reduce((n, e) => n + e.pedacos.length, 0)} pedaços + ${p.ligacoes.length} ligações · módulos: ${p.modulos.join(', ')}`);
      console.log(`Funções: ${Plano.planoDasFuncoes(mods).map(f => f.nome).join(', ')}`);
      console.log('(simulação: nada foi feito)');
      return;
    }
    const token = process.env.SUPABASE_ACCESS_TOKEN || '';
    if (!token) falha('defina SUPABASE_ACCESS_TOKEN (o token de acesso da sua conta: supabase.com → Account → Access Tokens). Ele não é gravado nem mostrado.');
    const api = cliente(token);
    const passo = (nome) => !so || so === nome;
    console.log(`Instalando no projeto ${ref}.`);
    await confereProjeto(api, ref);
    await preparaCaderno(api, ref);
    const chaves = await chavesDoProjeto(api, ref);
    if (passo('login')) { await login(api, ref, { site, empresa }); console.log('✓ login: cadastro aberto desligado' + (site ? `, endereço ${site}` : '') + (empresa ? ', e-mails em português' : '')); }
    if (passo('banco')) {
      let ult = '';
      const r = await banco(api, ref, { mods, url, aoAvancar: ({ feitos, total, etapa }) => { if (etapa !== ult) { ult = etapa; console.log(`  · ${etapa}`); } process.stdout.write(`\r    ${feitos}/${total}`); } });
      process.stdout.write('\n');
      console.log(`✓ banco: ${r.total} pedaços · módulos: ${(r.modulos || []).join(', ')}`);
    }
    if (passo('esquemas')) { const r = await esquemas(api, ref, { mods }); console.log(`✓ esquemas liberados para o site: ${r.esquemas.join(', ')}`); }
    if (passo('segredos')) { const r = await segredos(api, ref, { site, empresa, chaves }); console.log(`✓ segredos das funções: ${r.segredos.join(', ')}`); }
    if (passo('funcoes')) {
      const r = await funcoes(api, ref, { mods, aoAvancar: ({ feitos, total, funcao }) => process.stdout.write(`\r  publicando ${feitos + 1}/${total}: ${funcao}            `) });
      process.stdout.write('\n');
      console.log(`✓ funções publicadas: ${r.total}`);
    }
    if (passo('admin')) {
      const email = opt('--admin-email'), nome = opt('--admin-nome'), senha = process.env.HUB_ADMIN_SENHA || '';
      if (!email || !nome || !senha) console.log('· administrador: pulei (faltam --admin-email, --admin-nome e a variável HUB_ADMIN_SENHA). Ele pode nascer depois em /primeiro-acesso/.');
      else { const r = await administrador(api, ref, { url, chaves, empresa, nome, email, senha, site }); console.log(r.criado ? `✓ administrador criado: ${email}` : '· administrador: o sistema já tem um'); }
    }
    console.log('\nPara o site: SUPABASE_URL e SUPABASE_ANON_KEY são o endereço do projeto e a chave anon (Project Settings → API Keys → Legacy).');
  })().catch(e => falha(e.message));
}
