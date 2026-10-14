#!/usr/bin/env node
/*
 * plano.js: O QUE instalar no banco e no servidor do Supabase, na ordem certa,
 * sem psql e sem bash. É a mesma régua do instalar-banco.sh, escrita em JavaScript
 * para rodar em qualquer lugar: na tela de instalação do site (/setup, pela Vercel),
 * no instalar-pela-api.js (pelo Claude Code, no Mac ou no Windows) e nos testes.
 *
 * O plano tem três partes:
 *   1. o BANCO: a lista de pedaços de SQL (cada \ir dos índices vira um pedaço),
 *      na ordem do instalar-banco.sh: o essencial da base, as peças da base que
 *      os módulos usam, cada módulo na ordem do "precisa" e, no fim, as ligações de
 *      todos os módulos que estão no banco;
 *   2. as FUNÇÕES do servidor (Edge Functions) de cada peça e módulo, com os arquivos
 *      que cada uma importa e se ela confere o login por dentro;
 *   3. os SEGREDOS que as funções leem (gerados na instalação, nunca escritos aqui).
 *
 * Quem executa é o instalar-pela-api.js (pela Management API do Supabase). Cada
 * pedaço de SQL vai num pedido só, que o Postgres roda numa transação só: ou o
 * pedaço inteiro entra, ou nada entra: e a instalação pode ser retomada do pedaço
 * em que parou, sem duplicar nada.
 *
 * Linha de comando (para conferir sem mexer em nada):
 *   node tools/instalar/plano.js banco [módulo…]      os pedaços de SQL de uma instalação do zero
 *   node tools/instalar/plano.js funcoes [módulo…]    as Edge Functions e os arquivos de cada uma
 * Sem módulos, vale tudo o que está nesta pasta.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Pecas = require('./pecas');

const RAIZ_PADRAO = Pecas.RAIZ_PADRAO;

// O que o 00-preparo.sql liga na sessão do psql. Pela API cada pedido é uma sessão
// nova, então cada pedaço leva estas linhas na frente (são as mesmas do preparo).
const PREAMBULO = [
  'SET statement_timeout = 0;',
  'SET lock_timeout = 0;',
  "SET client_encoding = 'UTF8';",
  'SET standard_conforming_strings = on;',
  "SELECT pg_catalog.set_config('search_path', 'public, extensions', false);",
  'SET check_function_bodies = false;',
  'SET xmloption = content;',
  'SET client_min_messages = warning;',
  'SET row_security = off;',
].join('\n') + '\n';

// ─── os módulos desta pasta ──────────────────────────────────────────────────
function modulosDaPasta(raiz = RAIZ_PADRAO) {
  return Object.keys(Pecas.manifestos(raiz)).filter(s => s !== 'base').sort();
}

// ─── um arquivo .sql → os pedaços dele (o \ir do psql vira pedaço) ───────────
// Cada arquivo incluído vira um pedaço com o caminho dele como nome. O que o
// próprio índice tiver de SQL (fora os \ir) também vira pedaço.
function pedacos(arquivo, raiz = RAIZ_PADRAO, pilha = []) {
  const abs = path.join(raiz, arquivo);
  if (!fs.existsSync(abs)) throw new Error(`falta o arquivo ${arquivo}`);
  if (pilha.includes(arquivo)) throw new Error(`o ${arquivo} inclui ele mesmo (${pilha.concat(arquivo).join(' → ')})`);
  const saida = [];
  let buf = [];
  let n = 0;
  const fecha = () => {
    const sql = buf.join('\n');
    buf = [];
    if (!sql.replace(/--[^\n]*/g, '').trim()) return;   // só comentário: não é pedaço
    saida.push({ id: n++ ? `${arquivo}#${n}` : arquivo, arquivo, sql });
  };
  for (const linha of fs.readFileSync(abs, 'utf8').split('\n')) {
    const inc = linha.match(/^\s*\\i[r]?\s+(\S+)\s*$/);
    if (inc) {
      fecha();
      const alvo = path.posix.join(path.posix.dirname(arquivo.split(path.sep).join('/')), inc[1]);
      saida.push(...pedacos(alvo, raiz, pilha.concat(arquivo)));
      continue;
    }
    if (/^\s*\\[a-z]/i.test(linha)) throw new Error(`${arquivo}: "${linha.trim()}" é comando do psql, e a instalação pela API só entende o \\ir`);
    buf.push(linha);
  }
  fecha();
  return saida;
}

// ─── as ligações: os *-ligacoes.sql de cada um, e o do OutFunnels por último ──
function ligacoes(lista, raiz = RAIZ_PADRAO) {
  const saida = [];
  // os esboços (visões vazias no lugar das que nascem com outro módulo) saem antes de tudo,
  // para a ligação do módulo que chegou criar a visão de verdade; e voltam no fim (esbocos.sql)
  if (fs.existsSync(path.join(raiz, 'base/banco/esbocos-tira.sql'))) saida.push(...pedacos('base/banco/esbocos-tira.sql', raiz));
  for (const s of lista) {
    const d = path.join(raiz, s, 'banco', 'estrutura');
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(f => /-ligacoes\.sql$/.test(f)).sort())
      saida.push(...pedacos(`${s}/banco/estrutura/${f}`, raiz));
  }
  if (lista.includes('outfunnels') && fs.existsSync(path.join(raiz, 'outfunnels/banco/outfunnels_ligacoes.sql')))
    saida.push(...pedacos('outfunnels/banco/outfunnels_ligacoes.sql', raiz));
  if (fs.existsSync(path.join(raiz, 'base/banco/esbocos.sql'))) saida.push(...pedacos('base/banco/esbocos.sql', raiz));
  return saida;
}

const marca = (sistema, versao) =>
  `insert into hub.sistemas_instalados (sistema, versao) values (${lit(sistema)}, ${versao ? lit(versao) : 'null'})\n` +
  `  on conflict (sistema) do update set instalado_em = now(), versao = coalesce(excluded.versao, hub.sistemas_instalados.versao);`;
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ─── o plano do BANCO ────────────────────────────────────────────────────────
// estado = o que já está no banco: { base: '1.0.0' | null, sistemas: { outjourney: '1.0.0', 'base.produtos': '1.0.0', … } }
// Sem estado (ou com base null): instalação do zero. Com a base no banco: acrescenta
// só o que falta, como o instalar-banco.sh faz com um banco em uso.
// Devolve { etapas: [{ id, titulo, pedacos: [...], marcas: [...] }], ligacoes: [...], modulos, pecas, recusas }
function planoDoBanco(mods, estado = null, raiz = RAIZ_PADRAO) {
  const M = Pecas.manifestos(raiz);
  const B = Pecas.base(raiz);
  const noBanco = (estado && estado.sistemas) || {};
  const baseNoBanco = !!(estado && estado.base);
  const jaModulos = Object.keys(noBanco).filter(s => s !== 'base' && !s.startsWith('base.') && M[s]);
  const pedidos = Pecas.ordena(mods.length ? mods : modulosDaPasta(raiz), raiz, M);

  const recusas = Pecas.confere(pedidos, raiz, { jaNoBanco: jaModulos });
  if (recusas.length) return { recusas, etapas: [], ligacoes: [], modulos: pedidos, pecas: [] };

  const pecas = Pecas.pecasDe(jaModulos.concat(pedidos), raiz, M);
  const vPasta = B.versao;
  const etapas = [];

  if (!baseNoBanco) {
    const ps = pedacos('base/banco/estrutura.sql', raiz);
    for (const f of Pecas.atualizacoes('essencial', null, vPasta, raiz)) ps.push(...pedacos(f, raiz));
    etapas.push({ id: 'base', titulo: `A base (${vPasta})`, pedacos: ps, marcas: [marca('base', vPasta), marca('base.essencial', vPasta)] });
  } else {
    // a base já está: só as atualizações entre a do banco e a desta pasta (se a da pasta for mais nova)
    const vBanco = estado.base;
    if (Pecas.compara(vPasta, vBanco) > 0) {
      const ps = [];
      for (const p of pecas) {
        if (p !== 'essencial' && !(('base.' + p) in noBanco)) continue;
        const vp = noBanco['base.' + p] || vBanco;
        for (const f of Pecas.atualizacoes(p, vp, vPasta, raiz)) ps.push(...pedacos(f, raiz));
      }
      etapas.push({ id: `base-${vPasta}`, titulo: `Atualizar a base de ${vBanco} para ${vPasta}`, pedacos: ps,
        marcas: [marca('base', vPasta)].concat(pecas.filter(p => p === 'essencial' || ('base.' + p) in noBanco).map(p => marca('base.' + p, vPasta))) });
    }
  }

  for (const p of pecas) {
    if (p === 'essencial' || ('base.' + p) in noBanco) continue;
    const ps = [];
    for (const f of (B.pecas[p] || {}).banco || []) ps.push(...pedacos(`base/${f}`, raiz));
    for (const f of Pecas.atualizacoes(p, null, vPasta, raiz)) ps.push(...pedacos(f, raiz));
    etapas.push({ id: `base.${p}`, titulo: `Peça da base: ${(B.pecas[p] || {}).nome || p}`, pedacos: ps, marcas: [marca('base.' + p, vPasta)] });
  }

  const novos = pedidos.filter(s => !(s in noBanco));
  for (const s of novos) {
    if (!fs.existsSync(path.join(raiz, s, 'banco', 'estrutura.sql'))) throw new Error(`${s} não tem banco/estrutura.sql`);
    const ps = [];
    if (s === 'outfunnels') ps.push(...pedacos('outfunnels/banco/outfunnels.sql', raiz));
    ps.push(...pedacos(`${s}/banco/estrutura.sql`, raiz));
    etapas.push({ id: s, titulo: M[s].nome || s, pedacos: ps, marcas: [marca(s, M[s].versao || null)] });
  }

  // no fim, sempre: as ligações de TODOS os que estarão no banco (rodar de novo não duplica)
  const todos = Pecas.ordena(jaModulos.concat(pedidos), raiz, M);
  return { recusas: [], etapas, ligacoes: ligacoes(['base'].concat(todos), raiz), modulos: todos, novos, pecas };
}

// ─── as FUNÇÕES do servidor ──────────────────────────────────────────────────
// Funções que quem chama não tem login (página pública, webhook de provedor, robô
// com chave própria) e por isso conferem tudo por dentro. As outras também conferem
// por dentro (ver o _shared/acesso.ts de cada módulo); a lista abaixo é a que a
// documentação de cada uma manda publicar com --no-verify-jwt.
const SEM_LOGIN = new Set([
  'primeiro-acesso', 'app-convite', 'app-push',
  'wpp-webhook', 'outcopiloto', 'of-email-entrada',
  'oj-grupos-vincula', 'portal-avisar-grupo', 'portal-grupo-link',
  'outsign-codigo', 'outsign-arquivo', 'outsign-final',
  'og-api', 'og-entrada',   // Grupos: a api também recebe a chamada agendada do banco (com chave), e a entrada recebe o webhook (com chave)
]);

// os arquivos de uma pasta, relativos a outra (para mandar à API com o caminho certo).
// O arquivo de teste da função (*.test.ts) fica no repositório e não vai para a nuvem.
function arquivosDe(dir, relA) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const n of fs.readdirSync(dir).sort()) {
    if (n === '.DS_Store' || n === 'node_modules' || /\.test\.[cm]?[jt]s$/.test(n)) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...arquivosDe(p, relA));
    else out.push(path.relative(relA, p).split(path.sep).join('/'));
  }
  return out;
}

// funcoes(mods) → [{ sistema, nome, pasta, entrada, arquivos: [caminho relativo a <sistema>/supabase/functions], semLogin }]
function planoDasFuncoes(mods, raiz = RAIZ_PADRAO, { jaModulos = [] } = {}) {
  const M = Pecas.manifestos(raiz);
  const B = Pecas.base(raiz);
  const lista = Pecas.ordena(mods.length ? mods : modulosDaPasta(raiz), raiz, M);
  const pecas = Pecas.pecasDe(jaModulos.concat(lista), raiz, M);
  const saida = [];
  const funcoesDe = (sistema, nomes) => {
    const raizFn = path.join(raiz, sistema, 'supabase', 'functions');
    const shared = fs.existsSync(path.join(raizFn, '_shared')) ? arquivosDe(path.join(raizFn, '_shared'), raizFn) : [];
    for (const nome of nomes) {
      const pasta = path.join(raizFn, nome);
      if (!fs.existsSync(path.join(pasta, 'index.ts'))) throw new Error(`falta ${sistema}/supabase/functions/${nome}/index.ts`);
      const proprios = arquivosDe(pasta, raizFn);
      const fonte = proprios.map(a => fs.readFileSync(path.join(raizFn, a), 'utf8')).join('\n');
      saida.push({
        sistema, nome, pasta: path.relative(raiz, raizFn).split(path.sep).join('/'),
        entrada: `${nome}/index.ts`,
        arquivos: /\.\.\/_shared\//.test(fonte) ? proprios.concat(shared) : proprios,
        semLogin: SEM_LOGIN.has(nome),
      });
    }
  };
  // da base: só as funções das peças que vieram
  funcoesDe('base', pecas.flatMap(p => (B.pecas[p] || {}).funcoes || []));
  for (const s of lista) {
    const raizFn = path.join(raiz, s, 'supabase', 'functions');
    if (!fs.existsSync(raizFn)) continue;
    funcoesDe(s, fs.readdirSync(raizFn).filter(n => n !== '_shared' && fs.statSync(path.join(raizFn, n)).isDirectory()).sort());
  }
  return saida;
}

// os esquemas que o site lê pela API do Supabase (Project Settings → API → Exposed schemas)
function esquemasExpostos(mods, raiz = RAIZ_PADRAO) {
  const lista = mods.length ? mods : modulosDaPasta(raiz);
  return ['public', 'graphql_public', 'hub'].concat(lista.includes('outfunnels') ? ['outfunnels'] : []);
}

module.exports = { PREAMBULO, modulosDaPasta, pedacos, ligacoes, planoDoBanco, planoDasFuncoes, esquemasExpostos, SEM_LOGIN };

// ─── linha de comando ────────────────────────────────────────────────────────
if (require.main === module) {
  const [cmd, ...mods] = process.argv.slice(2);
  try {
    if (cmd === 'banco') {
      const p = planoDoBanco(mods);
      if (p.recusas.length) { console.error('✗ não fecha:\n' + p.recusas.map(r => '  · ' + r).join('\n')); process.exit(1); }
      let n = 0, kb = 0;
      for (const e of p.etapas) {
        console.log(`${e.titulo}`);
        for (const x of e.pedacos) { n++; kb += x.sql.length / 1024; console.log(`  ${String(n).padStart(3)}. ${x.id} (${Math.round(x.sql.length / 1024)} KB)`); }
      }
      console.log('Ligações (sempre, no fim):');
      for (const x of p.ligacoes) { n++; kb += x.sql.length / 1024; console.log(`  ${String(n).padStart(3)}. ${x.id}`); }
      console.log(`${n} pedaços, ${Math.round(kb)} KB · módulos: ${p.modulos.join(', ')} · peças: ${p.pecas.join(', ')}`);
    } else if (cmd === 'funcoes') {
      const fs_ = planoDasFuncoes(mods);
      for (const f of fs_) console.log(`${f.sistema}/${f.nome}${f.semLogin ? ' (sem login)' : ''}: ${f.arquivos.length} arquivo(s)`);
      console.log(`${fs_.length} funções`);
    } else { console.error('uso: node tools/instalar/plano.js banco|funcoes [módulo…]'); process.exit(2); }
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
