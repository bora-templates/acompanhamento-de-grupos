/*
 * os-celular.js: o que o sistema faz SÓ NO CELULAR: a barra do app embaixo
 * (Chats, Meu Dia, ✦ e Agenda, com a tela inicial no completo) e a animação de abertura do app.
 * Carregado sozinho pelo os-core.js (nenhuma tela precisa citar este arquivo).
 * Usa o que o os-core expõe em window.OS.
 */
(function () {
  'use strict';
  if (!window.OS) return;
  // ══════════════════════════════════════════════════════════════════════════
  // A BARRA DO APP NO CELULAR — Chats · Meu Dia · ✦ agente · Agenda (e a tela inicial, no completo)
  // Só no CELULAR (≤760px) e só pra quem é do time;
  // no computador nada muda. Some quando a pessoa digita e dentro de uma
  // conversa (a tela avisa com a classe `os-em-conversa` no <html>), como no
  // WhatsApp. Tela que não quer a barra: window.OS_SEM_BARRA = true.
  // O ✦ do centro abre o agente interno (os-agente.js ouve o evento 'os-kyoto').
  // O ✦ é do módulo Assistente: sem ele instalado, a barra não tem o botão.
  // ══════════════════════════════════════════════════════════════════════════
  const _BARRA_ICO = {
    chats: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    dia: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5',
    agenda: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
    inicio: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6',
  };
  function _barraAtiva() {
    const p = location.pathname, h = location.hash;
    return '';
  }
  // Tem janela ABERTA na tela? Só conta a que aparece: janela escondida (x-show,
  // display:none, visibility:hidden) que mora na página não tira a barra.
  function _barraJanelaAberta() {
    return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],.backdrop.open,.modal-backdrop')]
      .some((el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; });
  }
  async function _barraMonta() {
    // sem barra: tela dentro de um quadro (a de fora já tem) e tela do cliente (portal e o que ele abre)
    if (window.OS_SEM_BARRA === true || document.getElementById('os-barra')
      || (OS.dentroDeQuadro && OS.dentroDeQuadro()) || (OS.telaDoCliente && OS.telaDoCliente())) return;
    let celular = false;
    try { celular = window.matchMedia('(max-width:760px)').matches; } catch (e) {}
    if (!celular) return;
    let acc = null;
    try { if (await OS.Auth.getSession()) acc = await OS.getMyAccess(); } catch (e) {}
    if (!acc || !OS.estaNoTime(acc) || window.OS_SEM_BARRA === true || document.getElementById('os-barra')) return;
    const ac = acc.acessos || {};
    // cada linha de módulo só vai no pacote que tem o módulo (marcador @so da fábrica)
    let temJourney = false, chats = null, ky = false;
    const itens = [
      chats ? { id: 'chats', nome: 'Chats', href: chats } : null,
      ky ? { id: 'kyoto', nome: '✦' } : null,
    ].filter(Boolean);
    // no pacote de uma solução não existe Início: a navegação é o menu da solução (a casca), e sem outro item a barra não aparece
    if (!itens.length) return;
    let KY_HTML = '';

    const css = document.createElement('style');
    css.id = 'os-barra-css';
    css.textContent =
      '#os-barra{position:fixed;left:0;right:0;bottom:0;z-index:2147482900;display:flex;align-items:flex-end;'
      + 'background:color-mix(in srgb,var(--surface,#FFFFFF) 96%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);'
      + 'border-top:1px solid var(--bd,rgba(40,28,16,.10));padding:6px 4px calc(6px + env(safe-area-inset-bottom));'
      + 'font-family:-apple-system,"SF Pro Text",system-ui,sans-serif}'
      + '#os-barra a,#os-barra button{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:3px;'
      + 'min-height:48px;justify-content:flex-end;font-size:11px;color:var(--ink-2,#55504A);text-decoration:none;border:0;background:none;'
      + 'font-family:inherit;padding:0;-webkit-tap-highlight-color:transparent}'
      + '#os-barra a.on{color:var(--ink,#1D1A17);font-weight:600}'
      + '#os-barra svg{width:23px;height:23px}'
      + '#os-barra .ky{color:var(--ink,#1D1A17);font-weight:600}'
      // o ✦ do centro é o ORBE do assistente (as cores da identidade visual do sistema)
      + '#os-barra .ky span{position:relative;isolation:isolate;overflow:hidden;width:50px;height:50px;margin-top:-24px;border-radius:25px;color:var(--branco,#FFFFFF);background:radial-gradient(circle at 35% 30%,var(--branco,#FFFFFF) 0 6%,transparent 30%),radial-gradient(circle at 50% 50%,var(--btn,#B4481B),var(--m,#1D1A17) 70%);font-size:20px;text-shadow:0 1px 6px color-mix(in srgb,var(--sombra-cor,#1D1A17) 40%,transparent);display:flex;align-items:center;justify-content:center;border:3px solid var(--surface,#FFFFFF);box-shadow:0 8px 22px -6px color-mix(in srgb,var(--m-mark,#E8703A) 75%,transparent),inset 0 0 12px color-mix(in srgb,var(--m-mark,#E8703A) 50%,transparent)}'
      + '#os-barra .ky span::before,#os-barra .ky span::after{content:"";position:absolute;inset:6%;border-radius:50%;z-index:-1;filter:blur(5px);mix-blend-mode:screen;animation:osOrbGira 6s linear infinite}#os-barra .ky span::before{background:conic-gradient(from 0deg,transparent 0 30%,var(--m-mark,#E8703A) 45%,transparent 60%,transparent 70%,var(--m-mark,#E8703A) 82%,transparent 92%)}#os-barra .ky span::after{background:conic-gradient(from 200deg,transparent 0 40%,#D9B48F 52%,transparent 64%);animation-duration:9s;animation-direction:reverse}@keyframes osOrbGira{to{transform:rotate(360deg)}}'
      + 'html.os-com-barra body{padding-bottom:calc(72px + env(safe-area-inset-bottom))!important}'
      + 'html.os-em-conversa #os-barra,html.os-digitando #os-barra{display:none}'
      // janela aberta = barra fora: a barra fica por cima de TUDO e cobria o
      // rodapé das janelas (o botão de confirmar). Quem liga a classe é o
      // _barraJanelaAberta, que só conta janela VISÍVEL.
      + 'html.os-com-janela #os-barra{display:none}'
      // o "← voltar" flutuante cobria a aba Chats: com a barra, quem volta é a aba da tela inicial
      + 'html.os-com-barra #os-back-tab,html.os-com-barra #os-back-office{display:none!important}'
      + 'html.os-em-conversa.os-com-barra body{padding-bottom:0!important}'
      // MOVIMENTO: a barra não pisca na troca de tela
      // (view-transition-name), a marquinha roxa desliza até a aba nova, o toque afunda
      // de leve e o ✦ brilha uma vez por abertura. Reduzir movimento desliga tudo.
      + '#os-barra{view-transition-name:os-barra}'
      + '#os-barra .ind{position:absolute;top:0;width:36px;height:3px;border-radius:0 0 3px 3px;background:var(--acc,#A8431A);view-transition-name:os-barra-ind}'
      + '#os-barra a,#os-barra button{transition:transform .12s ease}'
      + '#os-barra a:active,#os-barra button:active{transform:scale(.92)}'
      + '#os-barra a.on{color:var(--acc,#A8431A)}'
      + '@keyframes osBrilho{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--m-mark,#E8703A) 65%,transparent)}100%{box-shadow:0 0 0 14px transparent}}'
      + '#os-barra .ky.brilha span{animation:osBrilho 1.2s ease-out .5s 2}'
      + '@media (prefers-reduced-motion:reduce){#os-barra *{animation:none!important;transition:none!important}}'
      // o sino fica acima da barra
      + '@media (max-width:760px){html.os-com-barra #os-desk-bell{bottom:calc(84px + env(safe-area-inset-bottom))!important}'
      + 'html.os-com-barra #os-desk-pops{bottom:calc(140px + env(safe-area-inset-bottom))!important}}';
    document.head.appendChild(css);

    const nav = document.createElement('nav');
    nav.id = 'os-barra';
    nav.style.position = 'fixed';
    nav.setAttribute('aria-label', 'Navegação do app');
    const ativa = _barraAtiva();
    nav.innerHTML = itens.map((it) => it.id === 'kyoto'
      ? KY_HTML
      : '<a href="' + it.href + '" class="' + (it.id === ativa ? 'on' : '') + '"' + (it.id === ativa ? ' aria-current="page"' : '') + '>'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'
        + _BARRA_ICO[it.id] + '"/></svg>' + it.nome + '</a>').join('');
    const _ky = nav.querySelector('.ky');
    if (_ky) _ky.addEventListener('click', () => window.dispatchEvent(new CustomEvent('os-kyoto')));
    // marquinha da aba acesa (desliza entre telas pelo view-transition)
    const acesa = nav.querySelector('a.on');
    if (acesa) {
      const ind = document.createElement('i'); ind.className = 'ind'; ind.setAttribute('aria-hidden', 'true');
      nav.appendChild(ind);
      const poe = () => { const r = acesa.getBoundingClientRect(), n = nav.getBoundingClientRect(); ind.style.left = (r.left - n.left + r.width / 2 - 18) + 'px'; };
      requestAnimationFrame(poe); window.addEventListener('resize', poe);
    }
    // ✦ brilha uma vez por abertura do app
    try { if (_ky && !sessionStorage.getItem('os:brilho')) { _ky.classList.add('brilha'); sessionStorage.setItem('os:brilho', '1'); } } catch (e) {}
    document.body.appendChild(nav);
    document.documentElement.classList.add('os-com-barra');
    window.dispatchEvent(new CustomEvent('os-barra'));
    // janela aberta DE VERDADE → barra fora (confere uma vez por quadro de animação)
    let _jPend = false;
    const _jConfere = () => { _jPend = false; document.documentElement.classList.toggle('os-com-janela', _barraJanelaAberta()); };
    try { new MutationObserver(() => { if (!_jPend) { _jPend = true; requestAnimationFrame(_jConfere); } }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'open', 'role', 'aria-modal'] }); } catch (e) {}
    _jConfere();
    // troca de menu dentro do Sucesso (#/…) muda a aba acesa
    window.addEventListener('hashchange', () => {
      const a = _barraAtiva();
      nav.querySelectorAll('a').forEach((el) => {
        const on = el.getAttribute('href') === (itens.find((i) => i.id === a) || {}).href;
        el.classList.toggle('on', on);
        if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { _barraMonta(); });
  else _barraMonta();

  // ══════════════════════════════════════════════════════════════════════════
  // MOVIMENTO DO APP
  // Duas peças que valem pra toda tela, só no celular:
  //  (1) ABERTURA — ao abrir o app instalado, a marca se forma (o círculo cresce,
  //      a meia-lua encaixa, as 5 frentes correm). Uma vez por abertura; um toque pula.
  //  (2) TROCA DE TELA — o navegador faz a transição entre páginas (View
  //      Transitions): a tela que sai some rápido e a nova entra subindo de leve.
  // "Reduzir movimento" no aparelho desliga as duas.
  // ══════════════════════════════════════════════════════════════════════════
  (function _movimentoDoApp() {
    let parado = false;
    try { parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    const css = document.createElement('style');
    css.id = 'os-movimento';
    css.textContent =
      '@media (max-width:760px) and (prefers-reduced-motion:no-preference){'
      + '@view-transition{navigation:auto}'
      + '::view-transition-old(root){animation:osVtSai .16s ease both}'
      + '::view-transition-new(root){animation:osVtEntra .28s cubic-bezier(.2,.8,.2,1) both}'
      + '::view-transition-group(os-barra-ind){animation-duration:.24s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}}'
      + '@keyframes osVtSai{to{opacity:0}}'
      + '@keyframes osVtEntra{from{opacity:0;transform:translateY(12px)}}'
      + '@keyframes osAbCirc{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}'
      + '@keyframes osAbLua{0%{transform:scale(.4);opacity:0}45%{opacity:0}100%{transform:none;opacity:1}}'
      + '@keyframes osAbFaixa{from{transform:scaleX(0)}to{transform:scaleX(1)}}'
      + '#os-abertura{position:fixed;inset:0;z-index:2147483647;background:var(--m,#1D1A17);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transition:opacity .28s ease}'
      + '#os-abertura.sai{opacity:0}'
      + '#os-abertura .c{transform-origin:496px 560px;animation:osAbCirc .6s cubic-bezier(.2,.8,.2,1) both}'
      + '#os-abertura .l{animation:osAbLua .6s cubic-bezier(.2,.8,.2,1) .15s both}'
      + '#os-abertura .f{transform-origin:228px 767px;animation:osAbFaixa .5s cubic-bezier(.2,.8,.2,1) .55s both}';
    (document.head || document.documentElement).appendChild(css);

    // (1) abertura: só no app instalado, uma vez por abertura, e nunca com movimento reduzido
    let ja = false;
    try { ja = !!sessionStorage.getItem('os:abertura'); } catch (e) {}
    if (parado || ja || !OS.app.instalado()) return;
    try { sessionStorage.setItem('os:abertura', '1'); } catch (e) {}
    const monta = () => {
      if (document.getElementById('os-abertura')) return;
      const d = document.createElement('div');
      d.id = 'os-abertura'; d.setAttribute('aria-hidden', 'true');
      d.innerHTML = '<svg width="170" height="170" viewBox="0 0 1024 1024">'
        + '<rect class="c" x="320" y="384" width="352" height="352" rx="100" fill="#E8703A"/>'
        + '<circle class="l" cx="684" cy="372" r="86" fill="#FFF8F1" stroke-width="48" style="stroke:var(--m,#1D1A17)"/></svg>';
      const tira = () => { d.classList.add('sai'); setTimeout(() => d.remove(), 300); };
      d.addEventListener('click', tira);
      (document.body || document.documentElement).appendChild(d);
      setTimeout(tira, 1300);   // a marca termina de se formar em ~1s; não segura ninguém
    };
    if (document.body) monta(); else document.addEventListener('DOMContentLoaded', monta);
  })();
})();
