/*
 * menus.js — cola os MENUS EM PASTA nas telas, na montagem do site.
 *
 * Um menu novo de um sistema mora numa pasta própria, ao lado da tela que o
 * mostra (é o mesmo jeito da produção, onde quem cola é o /shared/os-menus.js
 * no navegador; aqui quem cola é a montagem, antes de publicar):
 *
 *   outjourney/
 *     admin.html                       ← a tela: no lugar do menu, UMA linha
 *         <div data-os-menu="followups" x-show="route === 'followups'"></div>
 *     menus/followups/
 *       tela.html                      ← o desenho (a <section> com o x-data dele)
 *       followups.js                   ← a lógica (a função do x-data)
 *       followups.css                  ← o estilo (pode ser só um comentário)
 *
 * O que a montagem faz com cada <div data-os-menu="<nome>" …></div>:
 *   1. a div FICA, com todos os atributos (x-show, class, hidden…), e ganha
 *      dentro dela o conteúdo do tela.html (+ data-os-menu-ok="sim");
 *   2. o CSS do menu entra no <head> da tela (um <link>, uma vez por tela);
 *   3. o JS do menu entra ANTES do Alpine (um <script>, uma vez por tela), pra a
 *      função do x-data já existir quando o Alpine ligar a tela. Se o Alpine é
 *      carregado com `defer` (o normal), o JS do menu também vai com `defer`,
 *      logo antes dele: roda depois de todos os scripts da página e antes do
 *      Alpine. Tela sem Alpine: o JS entra no fim do <body>.
 *
 * Os endereços são absolutos (/outjourney/menus/…), então a tela funciona
 * aberta como /outjourney/admin, /outjourney/admin.html ou /outprocessos/.
 * Cada arquivo leva ?v=<impressão do conteúdo>: publicou um menu novo, o
 * navegador baixa o novo.
 *
 * Tela que não tem nenhum data-os-menu não é tocada (sai byte a byte igual).
 * Faltou um dos três arquivos → a montagem para e diz qual.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// <div …atributos…></div> — atributos lidos com aspas, pra um ">" dentro de
// x-show="a > b" não cortar a tag no meio.
const DIV_VAZIA = /<div((?:\s+[^\s"'=<>`\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*>\s*<\/div>/g;
const NOME_MENU = /\sdata-os-menu\s*=\s*(?:"([^"]*)"|'([^']*)')/;

// Partes da tela que o navegador NÃO lê como elemento: comentário, <script>,
// <style> e <textarea>. Uma linha <div data-os-menu> escrita dentro delas (num
// comentário explicando o menu, por exemplo) fica como está — igual ao
// os-menus.js da produção, que só enxerga elemento de verdade.
const NAO_E_ELEMENTO = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<textarea\b[\s\S]*?<\/textarea\s*>/gi;
function trocaForaDosTextos(html, fn) {
  let saida = '', i = 0, m;
  NAO_E_ELEMENTO.lastIndex = 0;
  while ((m = NAO_E_ELEMENTO.exec(html))) {
    saida += html.slice(i, m.index).replace(DIV_VAZIA, fn) + m[0];
    i = m.index + m[0].length;
  }
  return saida + html.slice(i).replace(DIV_VAZIA, fn);
}
// o tela.html de um menu é PEDAÇO, não página: só é lido quando entra numa tela
const ehPedacoDeMenu = (arq) => /[\\/]menus[\\/][^\\/]+[\\/]tela\.html$/.test(arq);

const impressao = (arq) => crypto.createHash('sha1').update(fs.readFileSync(arq)).digest('hex').slice(0, 10);
const urlDe = (saida, arq) => '/' + path.relative(saida, arq).split(path.sep).join('/');

// Onde o JS dos menus entra: antes do primeiro <script> que carrega o Alpine
// (a base e os plugins, ex.: @alpinejs/collapse). Devolve { pos, defer } ou null.
function lugarDoAlpine(html) {
  const re = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*alpinejs[^"']*["'][^>]*>/gi;
  const m = re.exec(html);
  if (!m) return null;
  return { pos: m.index, defer: /\sdefer\b/i.test(m[0]) || /type\s*=\s*["']module["']/i.test(m[0]) };
}

/*
 * colaMenus(saida, arquivosHtml) → { telas, menus, usados:Set(pasta do menu) }
 * Erro (pasta ou arquivo do menu faltando) → lança Error com a mensagem pronta.
 */
function colaMenus(saida, arquivosHtml) {
  let telas = 0, menus = 0;
  const usados = new Set();
  for (const arq of arquivosHtml) {
    if (ehPedacoDeMenu(arq)) continue;
    const original = fs.readFileSync(arq, 'utf8');
    if (!/data-os-menu\s*=/.test(original)) continue;          // tela sem menu: não mexe
    const dirTela = path.dirname(arq);
    const nomes = [];                                           // menus desta tela, na ordem
    let t = original;
    // até 5 voltas: um menu pode trazer outro dentro do tela.html
    for (let volta = 0; volta < 5; volta++) {
      let mudou = false;
      t = trocaForaDosTextos(t, (tag, attrs) => {
        const m = attrs.match(NOME_MENU);
        if (!m || /\sdata-os-menu-ok\s*=/.test(attrs)) return tag;
        const nome = (m[1] || m[2] || '').trim();
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(nome)) throw new Error(`${path.relative(saida, arq)}: nome de menu inválido "${nome}" (use letras, números e "-")`);
        const pasta = path.join(dirTela, 'menus', nome);
        for (const f of ['tela.html', nome + '.js', nome + '.css'])
          if (!fs.existsSync(path.join(pasta, f)))
            throw new Error(`${path.relative(saida, arq)}: o menu "${nome}" precisa de menus/${nome}/${f} ao lado da tela`);
        if (!nomes.includes(nome)) nomes.push(nome);
        usados.add(pasta);
        menus++; mudou = true;
        const tela = fs.readFileSync(path.join(pasta, 'tela.html'), 'utf8');
        return `<div${attrs} data-os-menu-ok="sim">${tela}</div>`;
      });
      if (!mudou) break;
    }
    if (!nomes.length) continue;
    const pastaUrl = (nome) => path.join(dirTela, 'menus', nome);
    // CSS: no fim do <head> (o PRIMEIRO </head> da tela)
    const css = nomes.map(n => {
      const f = path.join(pastaUrl(n), n + '.css');
      return `<link rel="stylesheet" href="${urlDe(saida, f)}?v=${impressao(f)}" data-os-menu-css="${n}">`;
    }).join('\n');
    const iHead = t.indexOf('</head>');
    if (iHead < 0) throw new Error(`${path.relative(saida, arq)}: a tela tem menu em pasta mas não tem </head>`);
    t = t.slice(0, iHead) + css + '\n' + t.slice(iHead);
    // JS: antes do Alpine (com defer se ele for defer); sem Alpine, no fim do <body>
    const alp = lugarDoAlpine(t);
    const js = (defer) => nomes.map(n => {
      const f = path.join(pastaUrl(n), n + '.js');
      return `<script${defer ? ' defer' : ''} src="${urlDe(saida, f)}?v=${impressao(f)}" data-os-menu-js="${n}"></script>`;
    }).join('\n') + '\n';
    if (alp) t = t.slice(0, alp.pos) + js(alp.defer) + t.slice(alp.pos);
    else {
      const iBody = t.lastIndexOf('</body>');
      if (iBody < 0) throw new Error(`${path.relative(saida, arq)}: a tela tem menu em pasta mas não tem </body>`);
      t = t.slice(0, iBody) + js(false) + t.slice(iBody);
    }
    fs.writeFileSync(arq, t);
    telas++;
  }
  return { telas, menus, usados };
}

module.exports = { colaMenus, DIV_VAZIA, lugarDoAlpine };
