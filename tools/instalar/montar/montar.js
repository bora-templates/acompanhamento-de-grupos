#!/usr/bin/env node
/*
 * montar.js — monta o SITE a partir do código-fonte, pronto pra publicar em
 * qualquer hospedagem estática (Vercel, Netlify, Cloudflare Pages, um nginx…).
 *
 *   node tools/instalar/montar/montar.js --saida dist --config empresa.json [--sistemas base,outjourney,…]
 *
 * O que faz, nesta ordem:
 *   1. copia a base e cada módulo pro endereço dele (o "mapa de endereços" do README);
 *      da base, só as PEÇAS que os módulos da montagem usam ("base_pecas" de cada
 *      um; a lista de peças em base/sistema.json → "pecas"): sem o OutJourney nem o
 *      OutFunnels, por exemplo, o catálogo /produtos/ não entra;
 *   2. encaixa os pedaços das telas divididas: cada <div data-parte="…"></div>
 *      vira o conteúdo do arquivo — o que vai ao ar é a tela inteira;
 *   2b. cola os menus em pasta: cada <div data-os-menu="<nome>"></div> recebe o
 *      menus/<nome>/tela.html, e o .css e o .js do menu entram na tela (menus.js);
 *   2c. pendura a central de avisos (os-avisos.js, da peça "avisos") em toda tela que carrega o
 *      os-core.js — e o assistente (/outassistenteia/os-agente.js) só quando o
 *      módulo OutAssistenteIA está na montagem (sem ele, o ✦ não existe);
 *   3. troca os marcadores (%SUPABASE_URL%, %SUPABASE_ANON_KEY%, SEU_PROJETO…)
 *      pelos valores do empresa.json.
 *
 * Sem --sistemas, monta todos os módulos que existem nesta pasta (cada um tem um
 * sistema.json); a BASE (base/) vai sempre, mesmo fora da lista. O OutFunnels entra na LISTA do que foi comprado (os links pra ele
 * aparecem), mas não no site: ele é uma aplicação à parte (ver outfunnels/README.md).
 * Se um módulo precisa de outro que não está na lista (o OutChat precisa do
 * OutJourney), a montagem para e diz.
 *
 * empresa.json (exemplo em tools/instalar/montar/empresa.exemplo.json):
 *   { "%SUPABASE_URL%": "https://abcd.supabase.co", "%SUPABASE_ANON_KEY%": "sb_publishable_…", … }
 * Nunca coloque ali a chave secreta (sb_secret_…): tudo que está no site, o
 * navegador de qualquer visitante baixa.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { colaMenus } = require('./menus');
const Pecas = require('../pecas');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const RAIZ = path.resolve(__dirname, '..', '..', '..');
const SAIDA = path.resolve(opt('--saida', path.join(RAIZ, 'dist')));
const CONFIG = opt('--config', null);

// ─── 1. os sistemas: cada pasta com um sistema.json (o manifesto) ──────────
// O manifesto diz o nome, onde o sistema mora no site ("enderecos": [pasta, endereço])
// e do que ele precisa ("precisa").
const MANIFESTOS = {};
for (const pasta of fs.readdirSync(RAIZ)) {
  const m = path.join(RAIZ, pasta, 'sistema.json');
  if (fs.existsSync(m)) MANIFESTOS[pasta] = JSON.parse(fs.readFileSync(m, 'utf8'));
}
// o que fica de fora do site: banco, funções do servidor, ferramentas, documentação, manifesto
// (api/ são as rotas de servidor dos módulos: rodam na Vercel pelo api/[rota].js da raiz, não vão ao ar como arquivo)
const FORA = new Set(['banco', 'supabase', 'node_modules', '.git', 'sistema.json', 'tools', 'api']);
const foraArquivo = (nome) => /\.md$/i.test(nome) || nome === '.DS_Store';

const pedidos = (opt('--sistemas', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const sistemas = pedidos.length ? [...pedidos] : Object.keys(MANIFESTOS);
if (!sistemas.includes('base')) sistemas.unshift('base');   // a base vai sempre
for (const s of sistemas) if (!MANIFESTOS[s]) { console.error(`✗ módulo desconhecido: ${s} (conheço: ${Object.keys(MANIFESTOS).join(', ')})`); process.exit(1); }
// compra que não fecha: um módulo que precisa de outro que não veio
const faltando = sistemas.flatMap(s => (MANIFESTOS[s].precisa || []).filter(p => !sistemas.includes(p))
  .map(p => `  ${MANIFESTOS[s].nome} precisa de ${MANIFESTOS[p] ? MANIFESTOS[p].nome : p}${(MANIFESTOS[s].por_que_precisa || {})[p] ? ` — ${MANIFESTOS[s].por_que_precisa[p]}` : ''}`));
if (faltando.length) { console.error('✗ falta módulo nesta montagem:\n' + faltando.join('\n')); process.exit(1); }

// ─── 1b. as PEÇAS da base (base/sistema.json → "pecas") ────────────────────
// O essencial vai sempre; as outras, só as que os módulos desta montagem usam
// ("base_pecas" de cada um) — e as que o mapa da instalação (instalacao.json) diz
// que esta instalação já tem. Peça que um módulo usa e não está na pasta: para.
const BASE = MANIFESTOS.base;
const mapaInst = Pecas.lerMapa(RAIZ);
const pecas = Pecas.pecasDe(sistemas, RAIZ, MANIFESTOS);
for (const p of Object.keys((mapaInst && mapaInst.base && mapaInst.base.pecas) || {}))
  if (!pecas.includes(p) && (BASE.pecas || {})[p] && Pecas.pecaPresente(p, RAIZ)) pecas.push(p);
const semPeca = pecas.filter(p => !Pecas.pecaPresente(p, RAIZ));
if (semPeca.length) { console.error('✗ falta peça da base nesta pasta: ' + semPeca.map(p => `${p} (${(Pecas.arquivosDaPeca(p, RAIZ) || []).join(', ')})`).join('; ') + '\n  Ela vem no pacote do módulo que a usa (ver COMECE-AQUI.md).'); process.exit(1); }
// os arquivos das peças que NÃO entram nesta montagem ficam fora do site
const FORA_PECAS = new Set();
for (const [p, arqs] of Object.entries(Pecas.arquivosDasOutras(RAIZ))) if (!pecas.includes(p)) arqs.forEach(a => FORA_PECAS.add(path.join(RAIZ, a)));

const copia = (de, para) => {
  const st = fs.statSync(de);
  if (st.isDirectory()) {
    fs.mkdirSync(para, { recursive: true });
    for (const nome of fs.readdirSync(de)) {
      if (FORA.has(nome) || foraArquivo(nome) || FORA_PECAS.has(path.join(de, nome))) continue;
      copia(path.join(de, nome), path.join(para, nome));
    }
  } else { fs.mkdirSync(path.dirname(para), { recursive: true }); fs.copyFileSync(de, para); }
};

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });
for (const s of sistemas) for (const [de, para] of MANIFESTOS[s].enderecos || []) copia(path.join(RAIZ, de), path.join(SAIDA, para));
for (const p of pecas) for (const [de, para] of ((BASE.pecas || {})[p] || {}).enderecos || []) copia(path.join(RAIZ, de), path.join(SAIDA, para));

// ─── 2. encaixa os pedaços das telas divididas ─────────────────────────────
const todosArquivos = (d, out = []) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? todosArquivos(p, out) : out.push(p); } return out; };
let encaixes = 0;
const PEDACO = /<div data-parte="([^"]+)"><\/div>/g;
for (const arq of todosArquivos(SAIDA).filter(a => a.endsWith('.html'))) {
  let t = fs.readFileSync(arq, 'utf8');
  if (!/<div data-parte="/.test(t)) continue;
  for (let volta = 0; volta < 20 && /<div data-parte="/.test(t); volta++) {
    t = t.replace(PEDACO, (_, url) => {
      const p = path.join(SAIDA, url);
      if (!fs.existsSync(p)) { console.error(`✗ ${path.relative(SAIDA, arq)}: o pedaço ${url} não existe`); process.exit(1); }
      encaixes++;
      return fs.readFileSync(p, 'utf8');
    });
  }
  fs.writeFileSync(arq, t);
}
// os pedaços de HTML já estão dentro das telas: não precisam ir ao ar soltos
for (const d of todosArquivos(SAIDA).map(a => path.dirname(a)).filter((d, i, a) => a.indexOf(d) === i && /-partes\/telas$/.test(d)))
  fs.rmSync(d, { recursive: true, force: true });

// ─── 2b. cola os MENUS EM PASTA (menus/<nome>/) ────────────────────────────
// Cada <div data-os-menu="<nome>" …></div> ganha dentro dela o tela.html do menu;
// o CSS dele entra no <head> e o JS logo antes do Alpine (ver menus.js).
let colados = { telas: 0, menus: 0, usados: new Set() };
try { colados = colaMenus(SAIDA, todosArquivos(SAIDA).filter(a => a.endsWith('.html'))); }
catch (e) { console.error('✗ ' + e.message); process.exit(1); }
// o desenho já está dentro da tela: o tela.html solto não vai ao ar (o .js e o .css ficam)
for (const pasta of colados.usados) fs.rmSync(path.join(pasta, 'tela.html'), { force: true });
const menusSoltos = todosArquivos(SAIDA).filter(a => /[\\/]menus[\\/][^\\/]+[\\/]tela\.html$/.test(a));
for (const a of menusSoltos) console.log(`  ! ${path.relative(SAIDA, path.dirname(a))}: nenhuma tela usa este menu (falta a linha <div data-os-menu="…"></div>)`);

// ─── 2c. a central de avisos (e o assistente, se veio) em toda tela do time ─
// Toda tela que carrega o os-core.js ganha, antes do ÚLTIMO </body>, a gaveta de
// avisos do sino (/shared/os-avisos.js, da base) e — SÓ com o módulo
// OutAssistenteIA na montagem — o assistente (/outassistenteia/os-agente.js).
// Nenhuma tela precisa citar os dois. Quem decide se eles aparecem é cada um
// (sessão do time, tela de cliente, tela dentro de quadro) — aqui só se pendura.
const PENDURA = (pecas.includes('avisos') ? ['/shared/os-avisos.js'] : []).concat(sistemas.includes('outassistenteia') ? ['/outassistenteia/os-agente.js'] : []);
let pendurados = 0;
for (const arq of todosArquivos(SAIDA).filter(a => a.endsWith('.html'))) {
  let t = fs.readFileSync(arq, 'utf8');
  if (!/os-core\.js/.test(t)) continue;
  const faltam = PENDURA.filter(f => !t.includes(path.basename(f)));
  const iBody = t.lastIndexOf('</body>');
  if (!faltam.length || iBody < 0) continue;
  t = t.slice(0, iBody) + faltam.map(f => `<script src="${f}"></script>\n`).join('') + t.slice(iBody);
  fs.writeFileSync(arq, t);
  pendurados++;
}

// ─── 3. a lista do que foi instalado vai pro os-core (OS.instalado) ────────
// Sem ela, a porta de entrada e os links mostrariam sistemas que não vieram.
{
  const core = path.join(SAIDA, 'shared', 'os-core.js');
  const t = fs.readFileSync(core, 'utf8');
  if (!t.includes("'%OS_SISTEMAS%'")) { console.error('✗ o os-core.js não tem o marcador %OS_SISTEMAS%'); process.exit(1); }
  // os módulos e as peças da base ("peca:<nome>"): OS.instalado / OS.temPeca
  fs.writeFileSync(core, t.replace("'%OS_SISTEMAS%'", `'${JSON.stringify(sistemas.concat(pecas.map(p => 'peca:' + p)))}'`));
}

// ─── 4. troca os marcadores ────────────────────────────────────────────────
let trocas = 0;
if (CONFIG) {
  const cfg = JSON.parse(fs.readFileSync(path.resolve(CONFIG), 'utf8'));
  for (const [k, v] of Object.entries(cfg)) {
    if (k.startsWith('_')) continue;   // "_leia" e afins são comentário: não entram no site
    if (/sb_secret_|service_role/i.test(String(v))) { console.error(`✗ ${k}: isso é a chave SECRETA — ela nunca vai pro site`); process.exit(1); }
  }
  const chaves = Object.keys(cfg).filter(k => !k.startsWith('_')).sort((a, b) => b.length - a.length);   // a mais comprida primeiro
  for (const arq of todosArquivos(SAIDA).filter(a => /\.(html|js|css|json|webmanifest)$/.test(a))) {
    let t; try { t = fs.readFileSync(arq, 'utf8'); } catch { continue; }
    let t2 = t;
    for (const k of chaves) t2 = t2.split(k).join(cfg[k]);
    if (t2 !== t) { fs.writeFileSync(arq, t2); trocas++; }
  }
}
const sobrou = todosArquivos(SAIDA).filter(a => /\.(html|js)$/.test(a) && /%SUPABASE_(URL|ANON_KEY)%/.test(fs.readFileSync(a, 'utf8')));
const semNome = CONFIG ? todosArquivos(SAIDA).filter(a => /\.(html|js)$/.test(a) && fs.readFileSync(a, 'utf8').includes('%EMPRESA_NOME%')) : [];

console.log(`✓ site montado em ${path.relative(process.cwd(), SAIDA) || '.'}`);
console.log(`  base + módulos: ${sistemas.join(', ')}`);
console.log(`  peças da base: ${pecas.join(', ')}`);
console.log(`  ${encaixes} pedaços encaixados nas telas · ${colados.menus} menus em pasta colados em ${colados.telas} telas · marcadores trocados em ${trocas} arquivos`);
console.log(`  ${pecas.includes('avisos') ? 'central de avisos' : '(sem a peça avisos: sem sino)'}${sistemas.includes('outassistenteia') ? ' e assistente (OutAssistenteIA)' : ' (sem o OutAssistenteIA: sem o ✦)'} pendurados em ${pendurados} telas`);
if (!CONFIG) console.log('  ! sem --config: os marcadores (%SUPABASE_URL%…) ficaram como estão');
else if (sobrou.length) console.log(`  ! ainda há marcador do Supabase em ${sobrou.length} arquivo(s) — confira o empresa.json`);
if (semNome.length) console.log(`  ! o nome da empresa (%EMPRESA_NOME%) ficou sem trocar em ${semNome.length} arquivo(s) — ponha "%EMPRESA_NOME%" no empresa.json`);
