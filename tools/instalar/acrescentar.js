#!/usr/bin/env node
/*
 * acrescentar.js — traz um PACOTE NOVO (outro módulo comprado) para dentro de uma
 * instalação que já existe, SEM DUPLICAR nada. Só mexe em ARQUIVOS; o banco é o
 * passo seguinte (tools/instalar/instalar-banco.sh, que o instalar.sh já chama).
 *
 *   node tools/instalar/acrescentar.js /caminho/do/pacote-novo            # faz
 *   node tools/instalar/acrescentar.js /caminho/do/pacote-novo --simular  # só diz o que faria
 *
 * Rode a partir da INSTALAÇÃO (esta pasta), apontando para o pacote novo. Ele lê o
 * mapa desta instalação (instalacao.json) e o manifesto do pacote, e:
 *   1. MÓDULO que não está aqui → copia a pasta dele. Módulo que já está aqui → NÃO
 *      substitui (a mesma versão: nada a fazer; mais nova no pacote: avisa — atualizar
 *      um módulo é outro passo, ver o README dele);
 *   2. PEÇA DA BASE que o módulo novo usa e esta instalação não tem → copia só ela
 *      (ex.: o catálogo de produtos, que vem com o OutJourney);
 *   3. BASE: só atualiza se a do pacote for MAIS NOVA. Antes, guarda a base e as
 *      ferramentas de agora em _copias/<data>-base-<versão>/ (nada se perde) e depois
 *      copia por cima as peças que esta instalação tem (e as ferramentas de instalar).
 *      Igual ou mais velha: não mexe;
 *   4. RECUSA, sem copiar nada, o que não fecha: módulo que precisa de outro que nem
 *      está aqui nem veio (OutChat sem OutJourney) e módulo que pede uma base mais
 *      nova do que a que ficaria aqui ("versao_minima_base");
 *   5. atualiza o instalacao.json (o banco dos novos fica "pendente" até o instalador rodar).
 * Nunca apaga nada desta instalação.
 *
 * Opção: --lista-novos ARQUIVO grava os módulos novos (um por linha) — o instalar.sh usa.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Pecas = require('./pecas');

const RAIZ = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SIMULAR = args.includes('--simular');
const PACOTE = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--lista-novos'));
const falha = (m) => { console.error('✗ ' + m); process.exit(1); };
// nome legível de um módulo que pode não estar nem aqui nem no pacote
const NOMES = { outjourney: 'OutJourney', outchat: 'OutChat', outfunnels: 'OutFunnels', outsign: 'OutSign', outpeople: 'OutPeople',
  outperformance: 'OutPerformance', outprojetos: 'OutProjetos', outprocessos: 'OutProcessos', outcopiloto: 'OutCopiloto', outassistenteia: 'OutAssistenteIA',
  outgrupos: 'Acompanhamento de Grupos no WhatsApp com IA' };
if (!PACOTE) falha('uso: node tools/instalar/acrescentar.js /caminho/do/pacote-novo [--simular]');
const PAC = path.resolve(PACOTE);
if (!fs.existsSync(path.join(PAC, 'base', 'sistema.json'))) falha(`${PAC} não parece um pacote do Hub (não tem base/sistema.json)`);
if (PAC === RAIZ) falha('o pacote novo é esta mesma pasta — aponte para a pasta (ou o zip descompactado) do pacote NOVO');
if (!fs.existsSync(path.join(RAIZ, 'base', 'sistema.json'))) falha('esta pasta não tem a base — para instalar do zero, use o pacote como está (COMECE-AQUI.md, "Instalar do zero")');

const Mloc = Pecas.manifestos(RAIZ), Mpac = Pecas.manifestos(PAC);
const Bloc = Mloc.base, Bpac = Mpac.base;
const vLoc = Bloc.versao || '1.0.0', vPac = Bpac.versao || '1.0.0';
const modsLoc = Object.keys(Mloc).filter(s => s !== 'base');
const modsPac = Object.keys(Mpac).filter(s => s !== 'base');
const mapaAntes = Pecas.lerMapa(RAIZ);

// ─── o plano ─────────────────────────────────────────────────────────────────
const novos = [], iguais = [], maisNovoNoPacote = [], maisNovoAqui = [];
for (const s of modsPac) {
  if (!Mloc[s]) { novos.push(s); continue; }
  const c = Pecas.compara(Mpac[s].versao, Mloc[s].versao);
  (c === 0 ? iguais : c > 0 ? maisNovoNoPacote : maisNovoAqui).push(s);
}
const baseNova = Pecas.compara(vPac, vLoc) > 0;
const vBaseDepois = baseNova ? vPac : vLoc;
const M = Object.assign({}, Mloc); for (const s of novos) M[s] = Mpac[s];
const todos = Object.keys(M).filter(s => s !== 'base');

const erros = [];
for (const s of novos) {
  const min = Mpac[s].versao_minima_base;
  if (min && Pecas.compara(vBaseDepois, min) < 0) erros.push(`${Mpac[s].nome} ${Mpac[s].versao} precisa da base ${min} ou mais nova; esta instalação ficaria com a ${vBaseDepois}. Pegue um pacote com a base nova.`);
  for (const p of Mpac[s].precisa || []) if (p !== 'base' && !M[p]) erros.push(`o ${Mpac[s].nome} precisa do ${NOMES[p] || p} (${(Mpac[s].por_que_precisa || {})[p] || ''}). O ${NOMES[p] || p} não está nesta instalação nem neste pacote: acrescente primeiro o pacote do ${NOMES[p] || p}.`);
}
// as peças que a instalação vai precisar (a definição de peça vem da base mais nova)
const raizDef = baseNova ? PAC : RAIZ;
const pecasPrecisa = Pecas.pecasDe(todos, raizDef, M);
const pecasAqui = Object.keys(Bloc.pecas || {}).filter(p => Pecas.pecaPresente(p, RAIZ));
const pecasTrazer = pecasPrecisa.filter(p => !pecasAqui.includes(p));
for (const p of pecasTrazer) if (!Pecas.pecaPresente(p, PAC)) erros.push(`o módulo novo usa a peça "${p}" da base, que não está aqui nem no pacote`);
if (erros.length) falha('não dá pra acrescentar este pacote (nada foi copiado):\n' + erros.map(e => '  · ' + e).join('\n'));

// ─── cópia (nunca apaga) ─────────────────────────────────────────────────────
const FORA = new Set(['node_modules', '.git', '.next', 'dist', '.vercel', '.env', '_copias']);
let copiados = 0;
const copia = (de, para, pula = () => false) => {
  if (pula(de)) return;
  const st = fs.statSync(de);
  if (st.isDirectory()) {
    if (!SIMULAR) fs.mkdirSync(para, { recursive: true });
    for (const n of fs.readdirSync(de)) if (!FORA.has(n) && !(n.startsWith('.env') && n !== '.env.example')) copia(path.join(de, n), path.join(para, n), pula);
  } else { if (!SIMULAR) { fs.mkdirSync(path.dirname(para), { recursive: true }); fs.copyFileSync(de, para); } copiados++; }
};
// os caminhos (no pacote) das peças que NÃO devem vir
const caminhosDe = (raiz, peca) => (Pecas.arquivosDaPeca(peca, raiz) || []).map(a => path.join(raiz, a));
const pulaPecas = (raiz, quero) => {
  const fora = new Set();
  for (const p of Object.keys(Pecas.base(raiz).pecas || {})) if (p !== 'essencial' && !quero.includes(p)) caminhosDe(raiz, p).forEach(c => fora.add(c));
  return (c) => fora.has(c);
};
const feito = [];
const dataHoje = new Date().toISOString().slice(0, 10);

// 3. a base (só se a do pacote for mais nova)
if (baseNova) {
  const guarda = path.join(RAIZ, '_copias', `${dataHoje}-base-${vLoc}`);
  if (!SIMULAR) {
    fs.mkdirSync(guarda, { recursive: true });
    const cp = (de, para) => { const st = fs.statSync(de); if (st.isDirectory()) { fs.mkdirSync(para, { recursive: true }); for (const n of fs.readdirSync(de)) if (n !== 'node_modules') cp(path.join(de, n), path.join(para, n)); } else fs.copyFileSync(de, para); };
    cp(path.join(RAIZ, 'base'), path.join(guarda, 'base'));
    cp(path.join(RAIZ, 'tools', 'instalar'), path.join(guarda, 'tools', 'instalar'));
    if (fs.existsSync(path.join(RAIZ, Pecas.MAPA))) fs.copyFileSync(path.join(RAIZ, Pecas.MAPA), path.join(guarda, Pecas.MAPA));
  }
  feito.push(`base ${vLoc} → ${vPac} (a de antes guardada em ${path.relative(RAIZ, guarda)}/)`);
  // por cima: o essencial e as peças que esta instalação tem E o pacote traz
  const atualiza = pecasAqui.filter(p => Pecas.pecaPresente(p, PAC));
  copia(path.join(PAC, 'base'), path.join(RAIZ, 'base'), pulaPecas(PAC, atualiza));
  copia(path.join(PAC, 'tools', 'instalar'), path.join(RAIZ, 'tools', 'instalar'));
  const ficam = pecasAqui.filter(p => !atualiza.includes(p));
  if (ficam.length) feito.push(`! as peças ${ficam.join(', ')} não vieram neste pacote e ficaram na versão de antes — o pacote do módulo que as usa, na versão ${vPac}, traz a nova`);
} else if (Pecas.compara(vPac, vLoc) < 0) feito.push(`base: a desta instalação (${vLoc}) é mais nova que a do pacote (${vPac}) — não mexo`);
else feito.push(`base: a mesma versão (${vLoc}) — não mexo`);

// 2. as peças que faltam
for (const p of pecasTrazer) {
  for (const a of Pecas.arquivosDaPeca(p, PAC)) copia(path.join(PAC, a), path.join(RAIZ, a));
  feito.push(`peça da base "${p}" (${vPac}) ${SIMULAR ? 'seria copiada' : 'copiada'} do pacote`);
}
// 1. os módulos novos
for (const s of novos) { copia(path.join(PAC, s), path.join(RAIZ, s)); feito.push(`módulo ${Mpac[s].nome} ${Mpac[s].versao || ''} ${SIMULAR ? 'seria copiado' : 'copiado'} (pasta ${s}/)`); }
// 1b. os arquivos da raiz que um módulo novo traz (o OutFunnels traz o render.yaml e o middleware.js):
// só entram se ainda não existem aqui, para não pisar numa personalização
let pacoteNovo = {};
try { pacoteNovo = JSON.parse(fs.readFileSync(path.join(PAC, 'pacote.json'), 'utf8')); } catch (e) { /* pacote antigo, sem pacote.json */ }
if (novos.length) for (const a of pacoteNovo.arquivos_da_raiz || []) {
  if (!/^[\w.-]+$/.test(a) || !fs.existsSync(path.join(PAC, a))) continue;
  if (fs.existsSync(path.join(RAIZ, a))) { feito.push(`arquivo da raiz ${a}: já existe aqui, não mexi`); continue; }
  copia(path.join(PAC, a), path.join(RAIZ, a));
  feito.push(`arquivo da raiz ${a} ${SIMULAR ? 'seria copiado' : 'copiado'} do pacote`);
}
for (const s of iguais) feito.push(`módulo ${Mloc[s].nome}: já está aqui na mesma versão (${Mloc[s].versao}) — nada a fazer`);
for (const s of maisNovoNoPacote) feito.push(`! módulo ${Mloc[s].nome}: o pacote traz a ${Mpac[s].versao} e aqui está a ${Mloc[s].versao} — NÃO substituí (atualizar um módulo é outro passo: ver o README dele)`);
for (const s of maisNovoAqui) feito.push(`módulo ${Mloc[s].nome}: o daqui (${Mloc[s].versao}) é mais novo que o do pacote (${Mpac[s].versao}) — não mexo`);

// 5. o mapa
if (!SIMULAR) {
  const linhas = [];   // o banco quem diz é o instalador; aqui só o que já estava registrado
  const ant = mapaAntes || {};
  for (const x of (ant.modulos || [])) if (x.banco === 'instalado') linhas.push(`${x.id} ${x.versao || ''}`);
  for (const [p, v] of Object.entries((ant.base && ant.base.pecas) || {})) if (v && v.banco === 'instalado') linhas.push(`base.${p} ${v.versao || ''}`);
  if (ant.base && ant.base.banco_versao) linhas.push(`base ${ant.base.banco_versao}`);
  // a versão de cada peça nos arquivos: as copiadas agora vêm do pacote
  const m = Pecas.mapaDe(RAIZ, linhas, `arquivos: ${feito.filter(f => !f.startsWith('módulo') || f.includes('copiado')).join(' · ')}`);
  for (const p of Object.keys(m.base.pecas)) {
    const veio = pecasTrazer.includes(p) || (baseNova && Pecas.pecaPresente(p, PAC));
    const antes = ant.base && ant.base.pecas && ant.base.pecas[p];
    m.base.pecas[p].versao = veio ? vPac : ((antes && antes.versao) || vLoc);
  }
  Pecas.gravaMapa(RAIZ, m);
}
// as Edge Functions das peças da base que chegaram agora (publicar depois)
const funcoesNovas = pecasTrazer.flatMap(p => ((Bpac.pecas || {})[p] || {}).funcoes || []);
const lista = opt('--lista-novos', null);
if (lista && !SIMULAR) { fs.writeFileSync(lista, novos.join('\n') + (novos.length ? '\n' : '')); fs.writeFileSync(lista + '.funcoes', funcoesNovas.join(' ')); }

console.log(`${SIMULAR ? 'SIMULAÇÃO — nada foi copiado' : '✓ pacote acrescentado'} (${copiados} arquivo(s)${SIMULAR ? ' seriam copiados' : ' copiados'})`);
for (const f of feito) console.log('  ' + (f.startsWith('!') ? f : '· ' + f));
if (funcoesNovas.length) console.log(`  · Edge Functions das peças que chegaram (publicar): ${funcoesNovas.join(', ')}`);
if (novos.length) {
  console.log(`\nFalta o banco e as funções dos módulos novos (${novos.join(', ')}):`);
  console.log('  1. suba as alterações para o GitHub e espere a Vercel publicar (situação Ready);');
  console.log('  2. abra o site em /setup, clique em "Acrescentar um módulo ou refazer a instalação" e preencha os dados: ela instala só o que é novo.');
  console.log('  (pelo terminal: SUPABASE_ACCESS_TOKEN="<token>" node tools/instalar/instalar-pela-api.js --projeto https://SEU_PROJETO.supabase.co --site https://SEU-SITE)');
}
else console.log('\nNenhum módulo novo neste pacote.');
