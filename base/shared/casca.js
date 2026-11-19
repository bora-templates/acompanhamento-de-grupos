/* ============================================================================
   A CASCA DO PACOTE DE UMA SOLUÇÃO (window.Casca): o menu lateral e o cabeçalho
   Só vai no pacote avulso (marcador). O desenho mora em
   /shared/visual/casca.css.
   ----------------------------------------------------------------------------
   No pacote de uma solução não existe tela inicial: o menu lateral é a
   navegação inteira do produto, e é o mesmo na tela da solução, em Usuários e em
   Minha conta. Cada tela só inclui estas duas linhas no <head>:
     <link rel="stylesheet" href="/shared/visual/casca.css">
     <script src="/shared/casca.js"></script>   (depois do /shared/os-core.js)
   e a casca se monta sozinha no começo do <body>, sem mexer no conteúdo da
   tela (nada é movido de lugar, então a lógica e o Alpine de cada tela seguem
   iguais).

   O menu:
     · os itens da solução (OS.solucao.menu, que a fábrica escreve a partir do
       "menu" do sistema.json do módulo; sem ele, um item só, a própria solução).
       Item com "so": "admin" só aparece para quem administra a solução;
     · Usuários, só para quem administra o sistema (nível admin geral, o mesmo que
       a tela Usuários e o servidor conferem);
     · no pé: a pessoa logada, Minha conta e Sair.
   O cabeçalho: o botão do menu (no celular), onde a pessoa está e o Dia/Noite
   (salvo por pessoa em hub.user_prefs, chave "<solução>:tema", a mesma da tela
   da solução).
   Esconder item de menu não é segurança: cada tela continua conferindo o acesso.

   Para a tela da solução:
     Casca.titulo('Ajustes')          o que aparece depois do nome da solução no cabeçalho
     Casca.mostraItem('ajustes', sim) mostra ou esconde um item (quando a tela sabe melhor que a chave)
   ============================================================================ */
(function () {
  'use strict';
  const O = window.OS;
  if (!O || !O.avulsa || window.Casca) return;
  try { if (O.dentroDeQuadro && O.dentroDeQuadro()) return; } catch (e) { return; }   // dentro de outra tela, a de fora já tem menu

  const S = O.solucao || { id: 'sistema', rotulo: O.solucaoNome || 'Sistema', nome: O.solucaoNome || 'Sistema', caminho: '/', acesso: '', estrito: false, menu: [] };
  const MENU = (S.menu && S.menu.length ? S.menu : [{ id: S.id, rotulo: S.rotulo, href: S.caminho }]).map((m) => Object.assign({}, m));
  const CHAVE_TEMA = (S.id || 'sistema') + ':tema';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICONES = {
    grupos: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    usuarios: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
    conta: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    padrao: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    menu: 'M3 6h18M3 12h18M3 18h18',
    fecha: 'M18 6L6 18M6 6l12 12',
    dia: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    noite: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  };
  const ic = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + (ICONES[k] || ICONES.padrao) + '"/></svg>';

  // as telas da base, com o nome que aparece no cabeçalho
  const TELAS_DA_BASE = { '/usuarios/': 'Usuários', '/conta/': 'Minha conta' };
  const caminhoDe = (href) => { try { return new URL(href, location.origin).pathname; } catch (e) { return href; } };
  const rotaAgora = () => (location.hash || '').replace(/^#\/?/, '').split('/')[0];

  let titulo = TELAS_DA_BASE[location.pathname] || '';
  let raiz = null;

  // ── Dia / Noite: segue o aparelho até a pessoa escolher; a escolha fica no banco (hub.user_prefs) ──
  function temaAgora() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function aplicaTema(t) {
    if (t !== 'light' && t !== 'dark') return;
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('casca:tema', t); } catch (e) { /* sem armazenamento: vale até recarregar */ }
    desenhaTema();
  }
  // a última escolha neste aparelho entra antes de a tela aparecer (o banco confirma depois)
  try { const t = localStorage.getItem('casca:tema'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* sem armazenamento */ }
  async function carregaTema() {
    try {
      const r = await O.getClient().from('user_prefs').select('value').eq('key', CHAVE_TEMA).maybeSingle();
      if (r.data && r.data.value && r.data.value.tema) aplicaTema(r.data.value.tema);
    } catch (e) { /* sem preferência gravada: vale o tema do aparelho */ }
  }
  async function trocaTema() {
    aplicaTema(temaAgora() === 'dark' ? 'light' : 'dark');
    try { await O.getClient().from('user_prefs').upsert({ key: CHAVE_TEMA, value: { tema: temaAgora() } }, { onConflict: 'user_id,key' }); }
    catch (e) { /* o tema muda na tela mesmo sem gravar */ }
  }
  function desenhaTema() {
    if (!raiz) return;
    const b = raiz.topo.querySelector('[data-casca-tema]');
    const escuro = temaAgora() === 'dark';
    b.innerHTML = ic(escuro ? 'dia' : 'noite');
    b.setAttribute('aria-label', escuro ? 'Mudar para o Dia' : 'Mudar para a Noite');
    b.title = escuro ? 'Mudar para o Dia' : 'Mudar para a Noite';
  }

  // ── o nível da pessoa na solução, com a mesma regra da tela da solução e do banco ──
  function nivelNaSolucao(acc) {
    if (!acc || !S.acesso) return 'nenhum';
    const v = (acc.acessos || {})[S.acesso];
    const convidado = O.isGuestOf ? O.isGuestOf(acc) : false;
    if (S.estrito) {
      if (!(v === true || v === 'view' || v === 'admin')) return 'nenhum';
      if (convidado || v === 'view') return 'ver';
      return v === 'admin' ? 'admin' : 'editar';
    }
    const m = O.accessModeOf(acc, S.acesso);
    return { none: 'nenhum', view: 'ver', edit: 'editar', admin: 'admin' }[m] || 'ver';
  }
  function papel(acc, nivel) {
    if (nivel === 'admin') return 'administra e configura';
    if (nivel === 'editar') return 'edita';
    if (nivel === 'ver') return 'só visualiza';
    return acc && acc.level === 'admin' ? 'administra os usuários' : 'sem acesso liberado';
  }

  // ── desenho ──
  function itemHtml(m, extra) {
    return '<a class="casca-item" href="' + esc(m.href) + '" data-casca-item="' + esc(m.id || '') + '"' + (extra || '') + '>' + ic(m.icone || (m.id === S.id ? 'padrao' : m.id)) + '<span>' + esc(m.rotulo) + '</span></a>';
  }
  function monta() {
    if (raiz || !document.body) return;
    const lado = document.createElement('aside');
    lado.className = 'casca-lado';
    lado.id = 'casca-menu';
    lado.setAttribute('aria-label', 'Menu');
    const marca = S.marca ? '<img src="' + esc(S.marca) + '" alt="" width="32" height="32">' : '<span class="casca-marca-padrao">' + ic('padrao') + '</span>';
    lado.innerHTML =
      '<a class="casca-marca" href="' + esc(S.caminho) + '">' + marca + '<span><b>' + esc(S.rotulo) + '</b><small>' + esc(S.sub || O.empresa || '') + '</small></span></a>'
      + '<nav class="casca-nav" aria-label="Menu principal">'
      + MENU.map((m) => itemHtml(m, m.so ? ' hidden' : '')).join('')
      + itemHtml({ id: 'usuarios', rotulo: 'Usuários', href: '/usuarios/', icone: 'usuarios' }, ' hidden')
      + '</nav>'
      + '<div class="casca-pe">'
      + '<div class="casca-eu" aria-live="polite"><span class="casca-av" aria-hidden="true"></span><span class="casca-eu-tx"><b>Carregando</b><small></small></span></div>'
      + itemHtml({ id: 'conta', rotulo: 'Minha conta', href: '/conta/', icone: 'conta' })
      + '<button class="casca-item" type="button" data-casca-sair>' + ic('sair') + '<span>Sair</span></button>'
      + '</div>';
    const fundo = document.createElement('div');
    fundo.className = 'casca-fundo';
    fundo.setAttribute('aria-hidden', 'true');
    const topo = document.createElement('header');
    topo.className = 'casca-topo';
    topo.innerHTML =
      '<button type="button" class="casca-circ casca-hamb" aria-label="Abrir o menu" aria-controls="casca-menu" aria-expanded="false">' + ic('menu') + '</button>'
      + '<span class="casca-onde"></span><span class="casca-esp"></span>'
      + '<button type="button" class="casca-circ" data-casca-tema></button>';
    document.body.insertBefore(topo, document.body.firstChild);
    document.body.insertBefore(fundo, topo);
    document.body.insertBefore(lado, fundo);
    document.documentElement.classList.add('casca');
    raiz = { lado, fundo, topo };

    topo.querySelector('.casca-hamb').addEventListener('click', () => (document.documentElement.classList.contains('casca-aberta') ? fecha() : abre()));
    fundo.addEventListener('click', fecha);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.documentElement.classList.contains('casca-aberta')) { fecha(); topo.querySelector('.casca-hamb').focus(); } });
    lado.addEventListener('click', (e) => { if (e.target.closest('a.casca-item')) fecha(); });
    topo.querySelector('[data-casca-tema]').addEventListener('click', trocaTema);
    lado.querySelector('[data-casca-sair]').addEventListener('click', sair);
    window.addEventListener('hashchange', marcaAtivo);
    desenhaTema(); desenhaTitulo(); marcaAtivo();
  }
  function abre() {
    document.documentElement.classList.add('casca-aberta');
    raiz.topo.querySelector('.casca-hamb').setAttribute('aria-expanded', 'true');
    const primeiro = raiz.lado.querySelector('.casca-item:not([hidden])');
    if (primeiro) setTimeout(() => primeiro.focus({ preventScroll: true }), 30);
  }
  function fecha() {
    if (!raiz) return;
    document.documentElement.classList.remove('casca-aberta');
    raiz.topo.querySelector('.casca-hamb').setAttribute('aria-expanded', 'false');
  }
  function desenhaTitulo() {
    if (!raiz) return;
    const onde = raiz.topo.querySelector('.casca-onde');
    onde.innerHTML = titulo
      ? '<a href="' + esc(S.caminho) + '">' + esc(S.rotulo) + '</a><span aria-hidden="true"> · </span><b>' + esc(titulo) + '</b>'
      : '<b>' + esc(S.rotulo) + '</b>';
  }
  // o item da tela de agora fica marcado (aria-current), pelo endereço e pelo começo do #endereço
  function marcaAtivo() {
    if (!raiz) return;
    const rota = rotaAgora();
    let achou = null;
    const todos = [...raiz.lado.querySelectorAll('a.casca-item')];
    for (const a of todos) {
      if (caminhoDe(a.getAttribute('href')) !== location.pathname) continue;
      const m = MENU.find((x) => x.id === a.dataset.cascaItem);
      if (m && Array.isArray(m.rotas)) { if (m.rotas.indexOf(rota) >= 0) { achou = a; break; } }
      else if (!achou) achou = a;
    }
    todos.forEach((a) => { if (a === achou) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function mostraItem(id, mostra) {
    if (!raiz) return;
    const a = raiz.lado.querySelector('[data-casca-item="' + String(id).replace(/"/g, '') + '"]');
    if (a) a.hidden = !mostra;
  }
  async function sair() {
    try { await O.Auth.signOut(); } catch (e) { /* sai mesmo assim */ }
    location.replace('/');
  }

  // ── quem está logado: o pé do menu e os itens de quem administra ──
  async function conhece() {
    let sessao = null;
    try { sessao = await O.Auth.getSession(); } catch (e) { sessao = null; }
    if (!sessao) { location.replace(O.comVolta('/')); return; }   // sem login: a porta de entrada, que devolve a pessoa para cá
    carregaTema();
    let acc = null, perfil = null;
    try { [acc, perfil] = await Promise.all([O.getMyAccess(), O.getMyProfile().catch(() => null)]); } catch (e) { acc = null; }
    if (!raiz) return;
    const nivel = nivelNaSolucao(acc);
    MENU.forEach((m) => { if (m.so === 'admin') mostraItem(m.id, nivel === 'admin'); });
    mostraItem('usuarios', !!(acc && acc.level === 'admin'));
    const nome = (perfil && (perfil.nome || perfil.full_name)) || (sessao.user && sessao.user.email) || 'Você';
    const foto = perfil && (perfil.foto_url || perfil.avatar_url);
    const av = raiz.lado.querySelector('.casca-av');
    if (foto) { av.style.backgroundImage = 'url("' + String(foto).replace(/["\\]/g, '') + '")'; av.textContent = ''; }
    else av.textContent = String(nome).trim().split(/\s+/).map((p) => (p.match(/[\p{L}\p{N}]/u) || [''])[0].toUpperCase()).join('').slice(0, 2) || '?';
    raiz.lado.querySelector('.casca-eu-tx b').textContent = nome;
    raiz.lado.querySelector('.casca-eu-tx small').textContent = papel(acc, nivel);
    marcaAtivo();
  }

  window.Casca = {
    titulo(t) { titulo = String(t || ''); desenhaTitulo(); },
    mostraItem, abre, fecha,
    solucao: S,
  };
  if (document.body) { monta(); conhece(); }
  else document.addEventListener('DOMContentLoaded', () => { monta(); conhece(); });
})();
