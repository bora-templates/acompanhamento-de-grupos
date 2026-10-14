/* ============================================================================
   HUB BORAIA · APARÊNCIA (window.OPAparencia)
   ----------------------------------------------------------------------------
   Uma coisa só, igual em TODO hub que carregar este arquivo. Faz duas coisas:

     1. MODO DE EXIBIÇÃO — 'dark' | 'light' | 'auto'
        'auto' segue o computador da pessoa (claro de dia, escuro de noite).
        Guardado em localStorage 'op_tema'. Aplica em <html data-theme="…">,
        que é o que o design-system/tokens.css já sabe ler.

     2. COR DE DESTAQUE — a cor do botão, do item ativo do menu, do foco e da
        barra de progresso. Guardada em localStorage 'op_accent' (hex).
        Vazio = o padrão daquele hub (o que estiver no CSS dele).

   A escolha vale pro Hub inteiro (mesma origem, mesmas chaves): quem
   põe o /outprocessos no claro abre o OutProjetos no claro também.

   O QUE A COR *NÃO* MUDA (de propósito): fundo, texto, cartão e borda seguem
   preto e branco — é o design system da casa. Verde/amarelo/
   vermelho de status não mudam, porque significam concluído / atenção / erro.
   E a COR POR ÁREA (--cor, os tons foscos do Key Visual) também não muda:
   ela diz DE QUE ÁREA a coisa é, não é enfeite.

   AJUSTE AUTOMÁTICO DE CONTRASTE: os tons foscos do Key Visual foram feitos
   para fundo escuro — no branco eles "lavam" e somem. Então a cor escolhida é
   escurecida no modo claro (e clareada no escuro) até passar em AA (4.5:1),
   e o texto por cima vira preto ou branco, o que der mais contraste.

   COMO ENTRA NA PÁGINA — uma linha só, no <head>, ANTES do primeiro pixel
   (assim não dá aquele flash branco ao carregar):
     <script src="/shared/os-aparencia.js?v=1"></script>
   Não precisa de mais nada: o item "Aparência" entra sozinho no rodapé da
   barra lateral (.sidebar, .rail ou .sb), copiando a classe dos itens que já
   estão lá — então ele nasce com a cara do menu daquele hub.

   Por que injetar em vez de colar em cada HTML: são dezenas de telas, e duas
   pessoas que não programam editam esses arquivos. Um lugar só pra mexer.

   Hoje usam: /outprocessos e /outprojetos (16 telas). Aposentou o antigo
   outprojetos/assets/op-tema.js, que só tinha o botão sol/lua.
   ============================================================================ */
(function () {
  var KEY_TEMA = 'op_tema';
  var KEY_COR  = 'op_accent';

  /* ── Paleta oferecida: as frentes BoraIA (tons foscos do Key Visual),
        os mesmos do launcher do Hub. Mais o P&B puro. ───────────── */
  var PALETA = [
    { nome: 'Operações (padrão)', hex: '' },
    { nome: 'Sucesso do Cliente', hex: '#A7CEE5' },
    { nome: 'Comercial',          hex: '#B8E9DE' },
    { nome: 'Financeiro',         hex: '#D4BEA5' },
    { nome: 'Marketing',          hex: '#EABAAA' },
    { nome: 'RH e Operações',     hex: '#BBB2DC' },
    { nome: 'Administrativo',     hex: '#9CB2D4' },
    { nome: 'Diretoria',          hex: '#EED7A4' },
    { nome: 'Sem cor (P&B)',      hex: 'PB' }   /* preto no claro, branco no escuro */
  ];
  var COR_PADRAO = '#BBB2DC';   /* só para desenhar a bolinha do "padrão" */

  /* ── Contas de cor (WCAG) ────────────────────────────────────────────── */
  function hex2rgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(r) {
    return '#' + r.map(function (v) {
      return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    }).join('').toUpperCase();
  }
  function lum(h) {
    var c = hex2rgb(h).map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function mistura(h, alvo, p) {
    var a = hex2rgb(h), b = hex2rgb(alvo);
    return rgb2hex([0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * p; }));
  }
  /* Escurece/clareia só o necessário pra dar leitura no fundo daquele modo. */
  function ajustar(h, fundo) {
    var c = h, p = 0;
    var puxa = fundo === '#FFFFFF' ? '#0A0A0B' : '#FFFFFF';
    while (contraste(c, fundo) < 4.5 && p < 0.92) { p += 0.06; c = mistura(h, puxa, p); }
    return c;
  }

  /* ── Estado ──────────────────────────────────────────────────────────── */
  function leTema() {
    var v; try { v = localStorage.getItem(KEY_TEMA); } catch (e) { v = null; }
    return (v === 'light' || v === 'dark' || v === 'auto') ? v : 'dark';
  }
  function leCor() {
    var v; try { v = localStorage.getItem(KEY_COR); } catch (e) { v = null; }
    if (String(v).toUpperCase() === 'PB') return 'PB';
    return hex2rgb(v) ? String(v).toUpperCase() : '';
  }
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function temaEfetivo() {
    var m = leTema();
    if (m === 'auto') return (mq && mq.matches) ? 'dark' : 'light';
    return m;
  }

  /* ── Aplicação ───────────────────────────────────────────────────────── */
  var VARS_COR = [
    '--accent', '--accent-hover', '--accent-soft', '--accent-strong', '--area',
    '--text-on-accent', '--border-focus', '--focus-ring',
    /* tokens shadcn das telas feitas em Next (painel, tarefas…) */
    '--primary', '--primary-foreground', '--ring',
    '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring'
  ];

  function aplicar() {
    var claro = temaEfetivo() === 'light';
    document.documentElement.setAttribute('data-theme', claro ? 'light' : 'dark');

    var st = document.documentElement.style;
    var cor = leCor();

    if (!cor) {                                   /* padrão: quem manda é o app.css */
      VARS_COR.forEach(function (v) { st.removeProperty(v); });
    } else {
      var fundo = claro ? '#FFFFFF' : '#0A0A0B';
      /* 'PB' é o acento do design system puro: preto no claro, branco no escuro. */
      var c = cor === 'PB' ? (claro ? '#0A0A0B' : '#FFFFFF') : ajustar(cor, fundo);
      var rgb = hex2rgb(c);
      var sobre = contraste(c, '#FFFFFF') >= contraste(c, '#0A0A0B') ? '#FFFFFF' : '#171520';
      var hover = mistura(c, claro ? '#0A0A0B' : '#FFFFFF', 0.14);

      st.setProperty('--accent', c);
      st.setProperty('--accent-hover', hover);
      st.setProperty('--accent-soft', 'rgba(' + rgb.join(',') + ',' + (claro ? 0.12 : 0.18) + ')');
      st.setProperty('--accent-strong', c);
      st.setProperty('--area', c);
      st.setProperty('--text-on-accent', sobre);
      st.setProperty('--border-focus', c);
      st.setProperty('--focus-ring', '0 0 0 3px rgba(' + rgb.join(',') + ',.34)');
      st.setProperty('--primary', c);
      st.setProperty('--primary-foreground', sobre);
      st.setProperty('--ring', c);
      st.setProperty('--sidebar-primary', c);
      st.setProperty('--sidebar-primary-foreground', sobre);
      st.setProperty('--sidebar-ring', c);
    }

    pintarPainel();
    try {
      window.dispatchEvent(new CustomEvent('op:aparencia', {
        detail: { tema: temaEfetivo(), modo: leTema(), cor: cor }
      }));
      /* nome antigo, pra não quebrar tela que já escutava */
      window.dispatchEvent(new CustomEvent('op:tema', { detail: { tema: temaEfetivo() } }));
    } catch (e) {}
  }

  function setModo(m) {
    try { localStorage.setItem(KEY_TEMA, m); } catch (e) {}
    aplicar();
  }
  function setCor(hex) {
    try { localStorage.setItem(KEY_COR, hex || ''); } catch (e) {}
    aplicar();
  }
  function alternar() { setModo(temaEfetivo() === 'light' ? 'dark' : 'light'); }

  /* Aplica ANTES de pintar a tela (este script roda no <head>). */
  aplicar();
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (leTema() === 'auto') aplicar(); });
  }
  /* Trocou numa aba, muda nas outras também. */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY_TEMA || e.key === KEY_COR) aplicar();
  });

  /* ══════════════════════════════════════════════════════════════════════
     Daqui pra baixo é só a telinha (item na barra + painel).
     ══════════════════════════════════════════════════════════════════════ */

  /* Tokens próprios do painel. Onde o design system existe, ele manda; onde não
     existe (a tela de Configurações tem CSS próprio), cai no valor do modo. */
  var CSS = [
    ':root{--op-ap-bg:var(--bg-surface,#FFFFFF);--op-ap-fg:var(--text-primary,#0A0A0B);',
      '--op-ap-fg2:var(--text-secondary,#5A5E66);--op-ap-fg3:var(--text-tertiary,#7D848B);',
      '--op-ap-bd:var(--border-default,rgba(10,10,11,.13));--op-ap-bd2:var(--border-strong,rgba(10,10,11,.24));',
      '--op-ap-ac:var(--accent,var(--primary,#5B4FA6));--op-ap-acs:var(--accent-soft,rgba(10,10,11,.06))}',
    'html[data-theme="dark"]{--op-ap-bg:var(--bg-surface,#111114);--op-ap-fg:var(--text-primary,#F7F7F7);',
      '--op-ap-fg2:var(--text-secondary,#A6ABB2);--op-ap-fg3:var(--text-tertiary,#7D848B);',
      '--op-ap-bd:var(--border-default,rgba(255,255,255,.13));--op-ap-bd2:var(--border-strong,rgba(255,255,255,.24));',
      '--op-ap-ac:var(--accent,var(--primary,#BBB2DC));--op-ap-acs:var(--accent-soft,rgba(255,255,255,.09))}',
    '#op-ap-btn{cursor:pointer}',
    '#op-ap-btn .op-ap-bolha{width:13px;height:13px;border-radius:99px;background:var(--op-ap-ac);',
      'box-shadow:inset 0 0 0 1px rgba(125,132,139,.45);flex-shrink:0}',
    '#op-ap-pop{position:fixed;z-index:1200;width:290px;background:var(--op-ap-bg);',
      'border:1px solid var(--op-ap-bd);border-radius:14px;padding:14px;',
      'box-shadow:0 20px 48px -14px rgba(0,0,0,.42);font-family:var(--font-sans,-apple-system,system-ui,sans-serif);',
      'color:var(--op-ap-fg)}',
    '#op-ap-pop .op-ap-tit{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;',
      'color:var(--op-ap-fg3);margin-bottom:9px}',
    '#op-ap-pop .op-ap-modos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:16px}',
    '#op-ap-pop .op-ap-modo{border:1.5px solid var(--op-ap-bd);border-radius:10px;',
      'padding:8px 4px;background:none;color:inherit;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;',
      'display:flex;flex-direction:column;align-items:center;gap:5px;transition:border-color .12s,background .12s}',
    '#op-ap-pop .op-ap-modo:hover{border-color:var(--op-ap-bd2)}',
    '#op-ap-pop .op-ap-modo.on{border-color:var(--op-ap-ac);background:var(--op-ap-acs)}',
    '#op-ap-pop .op-ap-modo svg{width:17px;height:17px}',
    '#op-ap-pop .op-ap-cores{display:flex;flex-wrap:wrap;gap:8px}',
    '#op-ap-pop .op-ap-cor{width:30px;height:30px;border-radius:9px;border:2px solid transparent;cursor:pointer;',
      'padding:0;box-shadow:inset 0 0 0 1px rgba(125,132,139,.45);position:relative}',
    '#op-ap-pop .op-ap-cor.on{border-color:var(--op-ap-fg)}',
    '#op-ap-pop .op-ap-cor.on::after{content:"";position:absolute;inset:0;background:no-repeat center/12px ',
      'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23171520\' stroke-width=\'3.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M20 6 9 17l-5-5\'/></svg>")}',
    '#op-ap-pop .op-ap-outra{width:30px;height:30px;border-radius:9px;border:1.5px dashed var(--op-ap-bd2);',
      'display:grid;place-items:center;cursor:pointer;color:var(--op-ap-fg3);position:relative;overflow:hidden;font-size:15px}',
    '#op-ap-pop .op-ap-outra input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}',
    '#op-ap-pop .op-ap-pe{margin-top:11px;font-size:11px;color:var(--op-ap-fg3);line-height:1.45}',
    '#op-ap-pop .op-ap-reset{background:none;border:0;padding:0;font:inherit;font-size:11px;cursor:pointer;',
      'color:var(--op-ap-fg2);text-decoration:underline}',
    '@media (prefers-reduced-motion:no-preference){#op-ap-pop{animation:op-ap-in .13s ease-out both}',
      '@keyframes op-ap-in{from{opacity:0;transform:translateY(4px)}}}'
  ].join('');

  var IC = {
    sol:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    lua:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>'
  };

  function injetarCSS() {
    if (document.getElementById('op-ap-css')) return;
    var s = document.createElement('style');
    s.id = 'op-ap-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var pop = null;

  function fechar() {
    if (pop) { pop.remove(); pop = null; }
    document.removeEventListener('mousedown', foraDaqui, true);
    document.removeEventListener('keydown', esc, true);
  }
  function foraDaqui(e) {
    var b = document.getElementById('op-ap-btn');
    if (pop && !pop.contains(e.target) && b && !b.contains(e.target)) fechar();
  }
  function esc(e) { if (e.key === 'Escape') fechar(); }

  function abrir() {
    if (pop) { fechar(); return; }
    injetarCSS();
    var b = document.getElementById('op-ap-btn');
    pop = document.createElement('div');
    pop.id = 'op-ap-pop';
    pop.innerHTML =
      '<div class="op-ap-tit">Modo de exibição</div>' +
      '<div class="op-ap-modos">' +
        modoBtn('light', IC.sol,  'Claro') +
        modoBtn('dark',  IC.lua,  'Escuro') +
        modoBtn('auto',  IC.auto, 'Automático') +
      '</div>' +
      '<div class="op-ap-tit">Cor de destaque</div>' +
      '<div class="op-ap-cores"></div>' +
      '<div class="op-ap-pe">Muda só o destaque (botão, menu, foco). Fundo e texto ' +
        'seguem preto e branco. <button class="op-ap-reset" type="button">Voltar ao padrão</button></div>';
    document.body.appendChild(pop);

    /* bolinhas */
    var cores = pop.querySelector('.op-ap-cores');
    var atual = leCor();
    PALETA.forEach(function (p) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'op-ap-cor' + ((p.hex || '') === atual ? ' on' : '');
      c.style.background = p.hex === 'PB' ? '#FFFFFF' : (p.hex || COR_PADRAO);
      c.title = p.nome;
      c.setAttribute('aria-label', p.nome);
      c.onclick = function () { setCor(p.hex); marcar(c); };
      cores.appendChild(c);
    });
    var outra = document.createElement('label');
    outra.className = 'op-ap-outra';
    outra.title = 'Outra cor';
    outra.innerHTML = '+<input type="color" value="' + (hex2rgb(atual) ? atual : COR_PADRAO) + '">';
    outra.querySelector('input').addEventListener('input', function (e) {
      var v = String(e.target.value).toUpperCase();
      outra.style.background = v; setCor(v); marcar(outra);
    });
    cores.appendChild(outra);
    /* cor de fora da paleta: marca o "+" */
    if (hex2rgb(atual) && !PALETA.some(function (p) { return p.hex === atual; })) {
      outra.style.background = atual; marcar(outra);
    }

    function marcar(el) {
      [].forEach.call(cores.children, function (x) { x.classList.remove('on'); });
      el.classList.add('on');
      if (el !== outra) outra.style.background = '';
    }

    pop.querySelectorAll('[data-modo]').forEach(function (m) {
      m.onclick = function () {
        setModo(m.dataset.modo);
        pop.querySelectorAll('[data-modo]').forEach(function (x) { x.classList.remove('on'); });
        m.classList.add('on');
      };
    });
    pop.querySelector('.op-ap-reset').onclick = function () {
      setCor(''); marcar(cores.firstChild);
    };

    /* posiciona colado na barra lateral, sem sair da tela */
    var r = b ? b.getBoundingClientRect() : { right: 16, bottom: window.innerHeight - 16 };
    pop.style.left = Math.min(r.right + 10, window.innerWidth - 302) + 'px';
    var alt = pop.offsetHeight;
    pop.style.top = Math.max(10, Math.min(r.bottom - alt, window.innerHeight - alt - 10)) + 'px';

    document.addEventListener('mousedown', foraDaqui, true);
    document.addEventListener('keydown', esc, true);
  }

  function modoBtn(v, ic, tx) {
    return '<button type="button" class="op-ap-modo' + (leTema() === v ? ' on' : '') +
           '" data-modo="' + v + '">' + ic + '<span>' + tx + '</span></button>';
  }

  function pintarPainel() {
    var b = document.getElementById('op-ap-btn');
    if (b) {
      var tx = b.querySelector('.tx');
      if (tx) tx.textContent = 'Aparência';
      b.title = 'Modo claro/escuro e cor de destaque';
    }
  }

  function montar() {
    if (document.getElementById('op-ap-btn')) return true;
    var barra = document.querySelector('aside.sb') || document.querySelector('aside.rail') ||
                document.querySelector('aside.sidebar') || document.querySelector('.sb') ||
                document.querySelector('.rail') || document.querySelector('.sidebar');
    if (!barra) return false;
    injetarCSS();

    /* Se a versão antiga (op-tema.js) já tiver colocado o sol/lua, tira. */
    var velho = document.getElementById('op-tema-btn');
    if (velho) velho.remove();

    var b = document.createElement('div');
    b.id = 'op-ap-btn';
    /* Cada hub chama o item de menu de um jeito. Em vez de chutar, copiamos a
       classe dos itens que JÁ estão nesta barra — assim o "Aparência" nasce
       igualzinho aos vizinhos, sem CSS novo em lugar nenhum. */
    var classe = barra.querySelector('.nav-item') ? 'nav-item'
               : barra.querySelector('.sb-link')  ? 'sb-link'
               : barra.querySelector('.nav-link') ? 'nav-link' : 'nav-item';
    b.className = classe + ' op-ap-item';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.innerHTML = '<span class="ic op-ap-bolha"></span>' +
                  '<span class="tx nav-item__rot">Aparência</span>';
    b.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); abrir(); });
    b.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); }
    });

    /* Barra que agrupa os itens em blocos (.sidebar__section, que é quem dá o
       respiro nas laterais) recebe o nosso dentro de um bloco igual — senão
       ele fica colado na borda, diferente dos vizinhos. */
    var dentro = b;
    if (barra.classList.contains('sidebar')) {   /* barra do DS (.sidebar__*) */
      dentro = document.createElement('div');
      dentro.className = 'sidebar__section';
      dentro.appendChild(b);
    }

    var user = barra.querySelector('.sidebar__footer') || barra.querySelector('.sb-foot') ||
               barra.querySelector('.sb-user') || barra.querySelector('.rail-foot') ||
               barra.querySelector('.rail-user');
    if (user && user.parentNode === barra) barra.insertBefore(dentro, user);
    else barra.appendChild(dentro);
    pintarPainel();
    return true;
  }

  /* A barra às vezes só existe depois que o Alpine monta a tela — tenta de novo
     por alguns segundos e para assim que conseguir (sem ficar rodando à toa). */
  function iniciar() {
    if (montar()) return;
    var n = 0;
    var id = setInterval(function () { if (montar() || ++n > 40) clearInterval(id); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.OPAparencia = {
    tema: temaEfetivo, modo: leTema, cor: leCor,
    setModo: setModo, setCor: setCor, alternar: alternar, aplicar: aplicar, abrir: abrir
  };
  /* compatibilidade com o antigo op-tema.js */
  window.OPTema = { atual: temaEfetivo, aplicar: function (t) { setModo(t); }, alternar: alternar };
})();
