// Testes do plano da instalação: node --test tools/instalar/*.test.js
// Rodam com os arquivos DESTA pasta, então valem para qualquer pacote (um módulo ou o Hub completo).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Plano = require('./plano');
const Pecas = require('./pecas');

const RAIZ = Pecas.RAIZ_PADRAO;
const MODS = Plano.modulosDaPasta(RAIZ);

test('a instalação do zero começa pelo preparo da base e termina nas ligações', () => {
  const p = Plano.planoDoBanco([], null, RAIZ);
  assert.deepStrictEqual(p.recusas, []);
  assert.strictEqual(p.etapas[0].id, 'base');
  assert.strictEqual(p.etapas[0].pedacos[0].id, 'base/banco/estrutura/00-preparo.sql');
  assert.ok(p.ligacoes.length > 0, 'tem ligações');
  // os esboços saem antes de todas as ligações e voltam depois de todas (até da do OutFunnels)
  assert.strictEqual(p.ligacoes[0].id, 'base/banco/esbocos-tira.sql');
  assert.strictEqual(p.ligacoes[p.ligacoes.length - 1].id, 'base/banco/esbocos.sql');
  if (MODS.includes('outfunnels')) assert.strictEqual(p.ligacoes[p.ligacoes.length - 2].id, 'outfunnels/banco/outfunnels_ligacoes.sql');
  for (const m of MODS) assert.ok(p.etapas.some((e) => e.id === m), `${m} entra no plano`);
});

test('todo pedaço de SQL existe, tem conteúdo e não usa comando do psql', () => {
  const p = Plano.planoDoBanco([], null, RAIZ);
  const ids = new Set();
  for (const x of p.etapas.flatMap((e) => e.pedacos).concat(p.ligacoes)) {
    assert.ok(x.sql.trim().length > 0, x.id);
    assert.ok(!/^\s*\\[a-z]/im.test(x.sql), `${x.id} tem comando do psql`);
    if (!x.id.includes('ligacoes')) { assert.ok(!ids.has(x.id), `${x.id} aparece duas vezes`); ids.add(x.id); }
  }
});

test('com a base e os módulos no banco, o plano não reinstala nada', () => {
  const V = Pecas.base(RAIZ).versao;   // a base que está no banco é a desta pasta (se fosse mais velha, o plano a atualizaria)
  const sistemas = { base: V, 'base.essencial': V };
  for (const p of Pecas.pecasDe(MODS, RAIZ)) sistemas['base.' + p] = V;
  for (const m of MODS) sistemas[m] = '1.0.0';
  const p = Plano.planoDoBanco([], { base: V, sistemas }, RAIZ);
  assert.deepStrictEqual(p.etapas, []);
  assert.ok(p.ligacoes.length > 0, 'as ligações rodam de novo');
});

test('banco com a base mais velha: o plano atualiza a base e só depois instala o módulo novo', () => {
  const V = Pecas.base(RAIZ).versao;
  const novo = MODS.find((m) => !(Pecas.manifestos(RAIZ)[m].precisa || []).some((p) => p !== 'base'));
  const velho = { base: '0.9.0', sistemas: { base: '0.9.0', 'base.essencial': '0.9.0' } };
  const p = Plano.planoDoBanco([novo], velho, RAIZ);
  assert.deepStrictEqual(p.recusas, []);
  assert.deepStrictEqual(p.etapas.map((e) => e.id).slice(0, 1), ['base-' + V], 'a base é atualizada primeiro');
  assert.ok(p.etapas.some((e) => e.id === novo), `${novo} entra no plano`);
  assert.ok(p.etapas[0].marcas.some((m) => m.includes(`'base', '${V}'`)), 'a versão nova da base é anotada');
});

test('módulo que precisa de outro é recusado sem ele e aceito quando o outro já está no banco', (t) => {
  const M = Pecas.manifestos(RAIZ);
  const comDep = MODS.find((m) => (M[m].precisa || []).some((p) => p !== 'base'));
  if (!comDep) return t.skip('este pacote não tem módulo que dependa de outro');
  const dep = M[comDep].precisa.find((p) => p !== 'base');
  if (!MODS.includes(dep)) return t.skip('a dependência não está nesta pasta');
  const sem = Plano.planoDoBanco([comDep], { base: '1.0.0', sistemas: { base: '1.0.0', 'base.essencial': '1.0.0' } }, RAIZ);
  assert.ok(sem.recusas.length > 0, `${comDep} sem ${dep} é recusado`);
  const com = Plano.planoDoBanco([comDep], { base: '1.0.0', sistemas: { base: '1.0.0', 'base.essencial': '1.0.0', [dep]: '1.0.0' } }, RAIZ);
  assert.deepStrictEqual(com.recusas, []);
});

test('toda função leva junto os arquivos que importa', () => {
  for (const f of Plano.planoDasFuncoes([], RAIZ)) {
    const raizFn = path.join(RAIZ, f.pasta);
    assert.ok(f.arquivos.includes(f.entrada), `${f.nome}: falta a entrada ${f.entrada}`);
    for (const a of f.arquivos) {
      const txt = fs.readFileSync(path.join(raizFn, a), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      for (const m of txt.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
        const alvo = path.posix.normalize(path.posix.join(path.posix.dirname(a), m[1]));
        assert.ok(f.arquivos.includes(alvo), `${f.sistema}/${f.nome}: ${a} importa ${m[1]}, que não vai junto`);
      }
    }
  }
});

test('as funções sem login são só as que conferem tudo por dentro', () => {
  const nomes = new Set(Plano.planoDasFuncoes([], RAIZ).map((f) => f.nome));
  for (const n of Plano.SEM_LOGIN) if (nomes.has(n)) assert.ok(true);
  assert.ok(nomes.has('primeiro-acesso'), 'a base publica o primeiro-acesso');
});

test('os esquemas liberados para o site incluem o hub', () => {
  const e = Plano.esquemasExpostos([], RAIZ);
  assert.ok(e.includes('hub'));
  assert.strictEqual(e.includes('outfunnels'), MODS.includes('outfunnels'));
});
