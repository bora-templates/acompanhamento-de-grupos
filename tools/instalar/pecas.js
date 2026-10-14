#!/usr/bin/env node
/*
 * pecas.js — o que a instalação tem e do que cada módulo precisa: as PEÇAS da
 * base, as versões e o MAPA DA INSTALAÇÃO (instalacao.json). Usado pela montagem
 * do site, pelo instalador do banco, pelo acrescentar.js e pelo pacote.
 *
 * As peças da base (base/sistema.json → "pecas"):
 *   essencial  vai sempre (login, usuários, os-core, Início…; e o banco que todo
 *              módulo usa, inclusive as filas de avisos e de e-mail)
 *   avisos     o sino e o aviso no celular        email      quem envia a fila de e-mail
 *   produtos   o catálogo /produtos/ e o banco dele
 *   comercial  a agenda comercial e os funis de venda (só banco)
 * Cada módulo diz as que usa em "base_pecas" (no sistema.json dele).
 *
 * Linha de comando (o instalador do banco chama):
 *   node tools/instalar/pecas.js pecas  <módulo…>        as peças que esses módulos usam (essencial primeiro)
 *   node tools/instalar/pecas.js ordena <módulo…>        os módulos na ordem do "precisa"
 *   node tools/instalar/pecas.js versao [<peça>|<módulo>] a versão desta pasta (sem nada: a da base)
 *   node tools/instalar/pecas.js compara <a> <b>          -1, 0 ou 1
 *   node tools/instalar/pecas.js atualizacoes <peça> <de|-> <até>   arquivos de base/banco/atualizacoes a rodar
 *   node tools/instalar/pecas.js confere <módulo…>        versão mínima da base e o que falta na pasta (sai 1 se não fecha)
 *   node tools/instalar/pecas.js arquivos <peça>         os arquivos da peça (relativos à raiz)
 *   node tools/instalar/pecas.js mapa < linhas "sistema versao"   grava o instalacao.json com o que está no banco
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ_PADRAO = path.resolve(__dirname, '..', '..');
const MAPA = 'instalacao.json';

// ─── versões (1.2.3) ─────────────────────────────────────────────────────────
function compara(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ─── os manifestos desta pasta ───────────────────────────────────────────────
function manifestos(raiz = RAIZ_PADRAO) {
  const M = {};
  for (const p of fs.readdirSync(raiz)) {
    const f = path.join(raiz, p, 'sistema.json');
    if (fs.existsSync(f)) M[p] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  return M;
}
function base(raiz = RAIZ_PADRAO) {
  const f = path.join(raiz, 'base', 'sistema.json');
  if (!fs.existsSync(f)) throw new Error(`não achei ${path.relative(process.cwd(), f)} — esta pasta não tem a base`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const ORDEM_PECAS = (B) => Object.keys(B.pecas || { essencial: {} });

// as peças que uma lista de módulos usa: essencial sempre, o "base_pecas" de
// cada módulo e o "precisa" de cada peça (o catálogo precisa do e-mail)
function pecasDe(mods, raiz = RAIZ_PADRAO, M = manifestos(raiz)) {
  const B = base(raiz);
  const quer = new Set(['essencial']);
  for (const s of mods) {
    if (!M[s] || s === 'base') continue;
    // módulo sem "base_pecas" (de antes das peças): usa todas
    for (const p of (M[s].base_pecas || ORDEM_PECAS(B))) quer.add(p);
  }
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of [...quer]) for (const q of ((B.pecas || {})[p] || {}).precisa || []) if (!quer.has(q)) { quer.add(q); mudou = true; }
  }
  for (const p of quer) if (!(B.pecas || {})[p]) throw new Error(`peça da base desconhecida: ${p} (conheço: ${ORDEM_PECAS(B).join(', ')})`);
  return ORDEM_PECAS(B).filter(p => quer.has(p));
}

// os arquivos (e pastas) de uma peça, relativos à RAIZ; o essencial é "o resto"
function arquivosDaPeca(peca, raiz = RAIZ_PADRAO) {
  const B = base(raiz);
  const pc = (B.pecas || {})[peca];
  if (!pc) throw new Error(`peça desconhecida: ${peca}`);
  if (peca === 'essencial' || !Array.isArray(pc.arquivos)) return null;   // null = o resto da pasta base/
  return pc.arquivos.map(a => path.join('base', a));
}
// todos os caminhos que são de alguma peça que NÃO é o essencial (pra separar o "resto")
function arquivosDasOutras(raiz = RAIZ_PADRAO) {
  const B = base(raiz), out = {};
  for (const p of ORDEM_PECAS(B)) { const a = arquivosDaPeca(p, raiz); if (a) out[p] = a; }
  return out;
}
// a peça está na pasta? (todos os arquivos dela existem)
function pecaPresente(peca, raiz = RAIZ_PADRAO) {
  const a = arquivosDaPeca(peca, raiz);
  if (!a) return fs.existsSync(path.join(raiz, 'base', 'shared', 'os-core.js'));
  return a.every(x => fs.existsSync(path.join(raiz, x)));
}

// a ordem do "precisa" (o OutChat depois do OutJourney)
function ordena(mods, raiz = RAIZ_PADRAO, M = manifestos(raiz)) {
  const pedidos = mods.filter(s => s && s !== 'base');
  const feitos = new Set(), saida = [];
  const vai = (s, pilha = []) => {
    if (feitos.has(s) || !M[s] || !pedidos.includes(s) || pilha.includes(s)) return;
    for (const p of M[s].precisa || []) vai(p, pilha.concat(s));
    feitos.add(s); saida.push(s);
  };
  pedidos.forEach(s => vai(s));
  return saida;
}

// ─── o mapa da instalação (instalacao.json, na raiz) ─────────────────────────
function lerMapa(raiz = RAIZ_PADRAO) {
  const f = path.join(raiz, MAPA);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { throw new Error(`${MAPA} está quebrado (${e.message}) — conserte ou apague (ele é refeito pelo instalador)`); }
}
// a versão dos arquivos de uma peça NESTA pasta: o mapa diz (pode ter vindo de
// outro pacote); sem mapa, a da base
function versaoDaPeca(peca, raiz = RAIZ_PADRAO) {
  const m = lerMapa(raiz);
  const v = m && m.base && m.base.pecas && m.base.pecas[peca];
  return (v && (v.versao || v)) || base(raiz).versao;
}
function gravaMapa(raiz, mapa) {
  const f = path.join(raiz, MAPA);
  fs.writeFileSync(f, JSON.stringify(mapa, null, 2) + '\n');
  return f;
}
// monta o mapa a partir da PASTA e do BANCO (linhas "sistema versao" de hub.sistemas_instalados)
function mapaDe(raiz, linhasBanco, nota) {
  const B = base(raiz), M = manifestos(raiz);
  const antes = lerMapa(raiz) || {};
  const noBanco = {};
  for (const l of linhasBanco) { const [s, v] = l.trim().split(/\s+/); if (s) noBanco[s] = v || null; }
  const pecas = {};
  for (const p of ORDEM_PECAS(B)) {
    if (!pecaPresente(p, raiz)) continue;
    pecas[p] = { versao: versaoDaPeca(p, raiz), banco: ('base.' + p) in noBanco || (p === 'essencial' && 'base' in noBanco) ? 'instalado' : 'pendente' };
  }
  const modulos = Object.keys(M).filter(s => s !== 'base').sort().map(s => ({
    id: s, nome: M[s].nome, versao: M[s].versao || null,
    banco: M[s].aplicacao_a_parte && !fs.existsSync(path.join(raiz, s, 'banco')) ? 'sem banco' : (s in noBanco ? 'instalado' : 'pendente'),
  }));
  const hist = Array.isArray(antes.historico) ? antes.historico.slice(-30) : [];
  if (nota) hist.push({ em: new Date().toISOString(), o_que: nota });
  return {
    _leia: 'MAPA DESTA INSTALAÇÃO — gerado pelas ferramentas de tools/instalar (não precisa editar). Diz a versão da base, as peças da base e os módulos que estão nesta pasta, e se o banco de cada um já foi instalado. Comprou outro módulo? Leia o COMECE-AQUI.md do pacote novo: ele compara o pacote com este mapa e acrescenta só o que falta.',
    produto: 'Hub BoraIA',
    base: { versao: B.versao, banco_versao: noBanco.base || null, pecas },
    modulos,
    emails_portugues: antes.emails_portugues || null,
    atualizado_em: new Date().toISOString(),
    historico: hist,
  };
}

// ─── atualizações do banco da base (base/banco/atualizacoes/<versão>-<peça>-<assunto>.sql) ──
function atualizacoes(peca, de, ate, raiz = RAIZ_PADRAO) {
  const d = path.join(raiz, 'base', 'banco', 'atualizacoes');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .map(n => { const m = n.match(/^(\d+\.\d+\.\d+)-([a-z]+)-.+\.sql$/); return m ? { n, v: m[1], p: m[2] } : null; })
    .filter(x => x && x.p === peca && (!de || compara(x.v, de) > 0) && compara(x.v, ate) <= 0)
    .sort((a, b) => compara(a.v, b.v) || a.n.localeCompare(b.n))
    .map(x => path.join('base', 'banco', 'atualizacoes', x.n));
}

// ─── a compra fecha? (versão mínima da base, o que um módulo precisa, as peças na pasta) ──
function confere(mods, raiz = RAIZ_PADRAO, { jaNoBanco = [] } = {}) {
  const M = manifestos(raiz), B = base(raiz), erros = [];
  for (const s of mods) {
    if (s === 'base') continue;
    if (!M[s]) { erros.push(`módulo desconhecido nesta pasta: ${s} (falta a pasta ${s}/ com o sistema.json)`); continue; }
    const min = M[s].versao_minima_base;
    if (min && compara(B.versao, min) < 0)
      erros.push(`${M[s].nome} ${M[s].versao || ''} precisa da base ${min} ou mais nova, e a base desta pasta é a ${B.versao}. Pegue a base nova (o pacote mais recente traz) antes.`);
    for (const p of M[s].precisa || []) {
      if (p === 'base' || mods.includes(p) || jaNoBanco.includes(p)) continue;
      erros.push(`${M[s].nome} precisa do ${M[p] ? M[p].nome : p}${(M[s].por_que_precisa || {})[p] ? ' — ' + M[s].por_que_precisa[p] : ''}. ${M[p] ? 'Instale os dois juntos.' : 'O módulo ' + p + ' não está nesta pasta.'}`);
    }
  }
  for (const p of pecasDe(mods.filter(s => M[s]), raiz, M))
    if (!pecaPresente(p, raiz)) erros.push(`falta a peça "${p}" da base nesta pasta (${(arquivosDaPeca(p, raiz) || ['base/']).join(', ')}) — ela vem no pacote do módulo que a usa`);
  return erros;
}

module.exports = { compara, manifestos, base, pecasDe, arquivosDaPeca, arquivosDasOutras, pecaPresente, ordena,
  lerMapa, gravaMapa, mapaDe, versaoDaPeca, atualizacoes, confere, MAPA, RAIZ_PADRAO };

// ─── linha de comando ────────────────────────────────────────────────────────
if (require.main === module) {
  const [cmd, ...a] = process.argv.slice(2);
  const raiz = process.env.HUB_RAIZ ? path.resolve(process.env.HUB_RAIZ) : RAIZ_PADRAO;
  try {
    if (cmd === 'pecas') console.log(pecasDe(a, raiz).join('\n'));
    else if (cmd === 'ordena') console.log(ordena(a, raiz).join('\n'));
    else if (cmd === 'versao') {
      const M = manifestos(raiz), x = a[0];
      if (!x || x === 'base') console.log(base(raiz).versao);
      else if ((base(raiz).pecas || {})[x]) console.log(versaoDaPeca(x, raiz));
      else console.log((M[x] && M[x].versao) || '');
    }
    else if (cmd === 'compara') console.log(compara(a[0], a[1]));
    else if (cmd === 'atualizacoes') console.log(atualizacoes(a[0], a[1] === '-' ? null : a[1], a[2], raiz).join('\n'));
    else if (cmd === 'arquivos') console.log((arquivosDaPeca(a[0], raiz) || ['base/ (o resto)']).join('\n'));
    else if (cmd === 'confere') {
      const jaNoBanco = (process.env.JA_NO_BANCO || '').split(/\s+/).filter(Boolean);
      const e = confere(a, raiz, { jaNoBanco });
      if (e.length) { console.error('✗ esta instalação não fecha:\n' + e.map(x => '  · ' + x).join('\n')); process.exit(1); }
    }
    else if (cmd === 'mapa') {
      const linhas = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
      const f = gravaMapa(raiz, mapaDe(raiz, linhas, process.env.MAPA_NOTA || null));
      console.log(`✓ mapa da instalação atualizado: ${path.relative(process.cwd(), f) || f}`);
    }
    else { console.error('uso: node tools/instalar/pecas.js pecas|ordena|versao|compara|atualizacoes|arquivos|confere|mapa …'); process.exit(2); }
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
