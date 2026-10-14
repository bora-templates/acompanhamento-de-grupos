// Carimbo de versão do sistema
// ----------------------------------------------------------------------------
// Mostra, no fim do MENU DA ESQUERDA:
//     © 2026 · Todos os direitos reservados · v1.0.1
//
// ONDE APARECE:
//   · tela COM menu lateral (OutJourney, RH, OutProjetos…) → no fim do
//     menu, centralizado na largura dele. É o rodapé natural do menu: não cobre
//     nada, não vaza pra direita e desce junto com o menu.
//   · menu estreito de ícones (o "rail" do OutChat, ~66px) → só o "v1.0.1", que
//     é o que cabe.
//   · tela SEM menu (launcher, área do aluno, páginas públicas) → NÃO aparece.
//
// Você NÃO precisa colar nada na sua página: o build.sh pendura este script
// sozinho em todo HTML que vai ao ar.
//
// Os dois valores abaixo são trocados pelo build.sh na hora de publicar (o build
// roda na Vercel). Abrindo o arquivo aqui no repositório eles aparecem como
// %ALGUMA_COISA% mesmo — é o esperado, e nesse caso a tela mostra "vdev".
//
// A numeração é passada pelo build de quem publica.
(function () {
  'use strict';

  var VERSAO = '%APP_VERSION%';
  var BUILD  = '%APP_BUILD%';

  // Se o build não passou por aqui (rodando o HTML na mão, sem publicar).
  if (VERSAO.charAt(0) === '%') { VERSAO = 'dev'; BUILD = 'sem build'; }

  // Fica disponível pra qualquer tela: OS_VERSAO.versao
  window.OS_VERSAO = { versao: VERSAO, build: BUILD };
  console.info('[OS] Hub v' + VERSAO + ' · ' + BUILD);

  // O ano é sempre o corrente — ninguém precisa lembrar de trocar em janeiro.
  function texto(largura) {
    if (largura < 150) return 'v' + VERSAO;                       // rail de ícones
    return '© ' + new Date().getFullYear() + ' · '
         + 'Todos os direitos reservados · v' + VERSAO;
  }

  // ── Montagem ──────────────────────────────────────────────────────────────
  function montar() {
    if (!document.body) return;
    var el = document.createElement('div');
    el.id = 'os-versao-selo';
    el.setAttribute('aria-hidden', 'true');

    posicionar(el);
    // Telas que montam o layout depois (Alpine, SPA) só põem o menu na tela um
    // tempinho depois. Procura por um tempinho e PARA assim que achar — este
    // relógio já foi 82% do tempo de uma gravação do Performance (06/08/2026),
    // porque procurar mede o tamanho dos candidatos e medir obriga o navegador a
    // recalcular o layout da página inteira.
    setTimeout(function () { posicionar(el); }, 800);
    var voltas = 0;
    var relogio = setInterval(function () {
      posicionar(el);
      if (_menu || ++voltas >= 8) clearInterval(relogio);   // achou ou desistiu
    }, 3000);
    // Trocar de rota pode remontar o menu; redimensionar muda a largura (o rail
    // estreito mostra só a versão). Nos dois casos, esquece o menu conhecido.
    window.addEventListener('hashchange', function () { _menu = null; posicionar(el); });
    window.addEventListener('resize', function () { _menu = null; posicionar(el); });
  }

  // Menu já encontrado. Guardar evita refazer a busca (que mede elemento por
  // elemento) a cada verificação — ver o comentário do relógio acima.
  var _menu = null;

  // Põe (ou repõe) o selo como ÚLTIMO item do menu. Sem menu, tira da tela.
  function posicionar(el) {
    // CURTO-CIRCUITO: já está DENTRO do menu que achamos antes → não toca no DOM.
    // Note que não exigimos ser o último filho: o menu é desenhado pelo Alpine, e
    // insistir na última posição virava briga — cada reinserção nossa era uma
    // mudança no DOM, o Alpine redesenhava, o selo saía do fim, e recomeçava.
    // Esse ciclo apareceu como 82% do tempo no Performance de 06/08/2026.
    if (_menu && _menu.isConnected && el.parentElement === _menu) return;
    var menu = acharMenuEsquerdo();
    _menu = menu;
    if (!menu) { if (el.parentElement) el.parentElement.removeChild(el); return; }
    if (el.parentElement === menu) { pintar(el, menu); return; }
    vestir(el, menu.getBoundingClientRect().width);
    menu.appendChild(el);
    pintar(el, menu);
  }

  // ── Achar o menu da esquerda ──────────────────────────────────────────────
  // Cada hub montou o seu do seu jeito, então vale a FORMA e não o nome da
  // classe: encostado na esquerda, estreito (menu, não conteúdo) e alto.
  // Assim pega o <aside class="app-side"> do OutJourney, o .sidebar do RH, o
  // .sb do OutProjetos, e o .rail do OutChat — sem
  // precisar tocar em nenhuma dessas telas.
  function acharMenuEsquerdo() {
    var cand = document.querySelectorAll(
      'aside, nav, .rail, .sidebar, #sidebar, .side-nav, .sidenav, .menu-lateral,' +
      '[class*="sidebar"], [class*="side-menu"], [class*="app-side"]'
    );
    var melhor = null, melhorAltura = 0;
    for (var i = 0; i < cand.length; i++) {
      var n = cand[i], r;
      if (n.id === 'os-versao-selo') continue;
      try { r = n.getBoundingClientRect(); } catch (e) { continue; }
      var encostado = r.left <= 12;                                   // na borda esquerda
      var estreito  = r.width >= 44 && r.width <= 420;                // menu, não conteúdo
      var alto      = r.height >= (window.innerHeight || 800) * 0.55; // coluna inteira
      if (encostado && estreito && alto && r.height > melhorAltura) { melhor = n; melhorAltura = r.height; }
    }
    return melhor;
  }

  // ── Como ele aparece ──────────────────────────────────────────────────────
  // pointer-events:none de propósito: o selo NUNCA pode roubar um clique.
  function vestir(el, largura) {
    var apertado = largura < 150;
    el.textContent = texto(largura);
    el.style.cssText =
      'display:block;box-sizing:border-box;width:100%;flex:0 0 auto;margin-top:auto;' +
      'padding:' + (apertado ? '10px 4px 12px' : '14px 16px 18px') + ';' +
      'text-align:center;white-space:normal;word-break:break-word;' +
      'font:500 ' + (apertado ? '10px' : '11px') + '/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'pointer-events:none;user-select:none;opacity:.9;background:none;border:0;';
  }

  // O Hub tem tela clara (CRUD) e tela escura. Lê a cor de fundo do menu
  // e escolhe o tom que dá pra ler nos dois.
  function pintar(el, menu) {
    var claro = true;
    try {
      var alvo = menu, cor = '';
      while (alvo && alvo !== document.documentElement) {
        cor = getComputedStyle(alvo).backgroundColor || '';
        if (cor && cor !== 'transparent' && cor.indexOf('rgba(0, 0, 0, 0)') === -1) break;
        alvo = alvo.parentElement;
      }
      var m = cor.match(/\d+/g);
      if (m && m.length >= 3) {
        // luminância aproximada (0 = preto, 255 = branco)
        var lum = (Number(m[0]) * 299 + Number(m[1]) * 587 + Number(m[2]) * 114) / 1000;
        claro = lum > 140;
      }
    } catch (e) { /* fundo indecifrável: fica no tema claro */ }

    el.style.color      = claro ? '#1C3E87' : '#9CB2D4';
    el.style.borderTop  = '1px solid ' + (claro ? 'rgba(0,19,61,.10)' : 'rgba(255,255,255,.12)');
  }

  // ── A TELA SE ATUALIZA SOZINHA QUANDO SAI VERSÃO NOVA ─────────────────────
  // Antes, toda publicação terminava com "quem estiver com a tela aberta dê
  // Cmd+Shift+R" — e quem deixa o OutChat aberto o dia inteiro ficava com a
  // versão velha (e com o defeito já consertado) até lembrar de recarregar.
  //
  // Como funciona: de 5 em 5 minutos a tela pergunta ao servidor qual é a versão
  // deste mesmo arquivo. Mudou → fica PENDENTE e só recarrega num momento que não
  // atrapalha ninguém:
  //   · a aba está em segundo plano (a pessoa nem vê);
  //   · a pessoa acabou de VOLTAR pra aba (ainda não começou nada);
  //   · 5 minutos sem mexer no mouse nem no teclado.
  // E NUNCA recarrega, espera o próximo momento, quando:
  //   · há texto digitado e não enviado em algum campo visível (inclusive nos
  //     iframes da mesma casa, como o OutChat dentro do OutJourney);
  //   · o cursor está dentro de um campo;
  //   · a própria tela disse que não pode (window.OS_PODE_ATUALIZAR() → false —
  //     o OutChat usa isso enquanto grava áudio).
  // Só liga em tela COM menu (as internas do time) — página pública e portal do
  // cliente não recarregam sozinhos. Sem build (vdev), não liga.
  var ATUALIZA_CADA_MS = 5 * 60 * 1000;
  var PARADO_MS        = 5 * 60 * 1000;
  var _pendente = false, _ultimoToque = Date.now();

  function campoSujo(doc) {
    var els = doc.querySelectorAll('textarea, input, [contenteditable="true"], [contenteditable=""]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.offsetParent && el.getClientRects().length === 0) continue;   // escondido
      if (el.isContentEditable) { if ((el.textContent || '').trim()) return true; continue; }
      var t = (el.type || '').toLowerCase();
      if (/^(hidden|checkbox|radio|button|submit|reset|file|range|color|image)$/.test(t)) continue;
      if (el.disabled || el.readOnly) continue;
      var v = String(el.value || '');
      if (v.trim() && v !== String(el.defaultValue || '')) return true;
    }
    return false;
  }

  function podeAtualizar() {
    var docs = [document];
    var fr = document.querySelectorAll('iframe');
    for (var i = 0; i < fr.length; i++) {
      try { if (fr[i].contentDocument) docs.push(fr[i].contentDocument); } catch (e) { /* outra origem */ }
    }
    for (var d = 0; d < docs.length; d++) {
      var doc = docs[d], w = doc.defaultView;
      try {
        if (w && typeof w.OS_PODE_ATUALIZAR === 'function' && w.OS_PODE_ATUALIZAR() === false) return false;
        var ativo = doc.activeElement;
        if (ativo && (ativo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName))
            && doc.hasFocus && doc.hasFocus()) return false;
        if (campoSujo(doc)) return false;
      } catch (e) { return false; }   // na dúvida, não recarrega
    }
    return true;
  }

  function tentarAtualizar(motivo) {
    if (!_pendente || !podeAtualizar()) return false;
    console.info('[OS] versão nova no ar — atualizando a tela (' + motivo + ')');
    _pendente = false;
    location.reload();
    return true;
  }

  function conferirVersao() {
    if (!window.fetch) return Promise.resolve(null);
    return fetch('/shared/os-versao.js?confere=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        var m = /var VERSAO\s*=\s*'([^'%]+)'/.exec(txt || '');
        if (m && m[1] !== VERSAO) _pendente = true;
        if (_pendente && document.visibilityState === 'hidden') tentarAtualizar('aba em segundo plano');
        return m ? m[1] : null;
      })
      .catch(function () { return null; });   // sem rede agora: tenta na próxima volta
  }

  function ligarAtualizacao() {
    if (VERSAO === 'dev' || window.OS_VERSAO_SEM_AUTO) return;
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { _ultimoToque = Date.now(); }, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { tentarAtualizar('aba em segundo plano'); return; }
      if (_pendente) tentarAtualizar('voltou pra aba'); else conferirVersao();
    });
    setInterval(function () {
      conferirVersao().then(function () {
        if (_pendente && Date.now() - _ultimoToque >= PARADO_MS) tentarAtualizar('tela parada');
      });
    }, ATUALIZA_CADA_MS);
  }

  // Só tela com menu (a mesma régua do selo). O menu pode nascer depois (Alpine),
  // então procura por até ~30s, igual o selo.
  var _voltasAuto = 0;
  function quandoTiverMenu() {
    if (acharMenuEsquerdo()) { ligarAtualizacao(); return; }
    if (++_voltasAuto < 10) setTimeout(quandoTiverMenu, 3000);
  }

  // Pro laboratório conferir sem esperar 5 minutos.
  window.OS_VERSAO.conferir = conferirVersao;
  window.OS_VERSAO.tentar = tentarAtualizar;
  window.OS_VERSAO.podeAtualizar = podeAtualizar;
  window.OS_VERSAO.pendente = function () { return _pendente; };

  function iniciar() { montar(); setTimeout(quandoTiverMenu, 1500); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
