/* ============================================================================
   INÍCIO DO HUB (window.Inicio) — identidade visual do Hub (OS)
   ----------------------------------------------------------------------------
   Este arquivo: entrada (login), a tela do computador (barra no alto, menu das
   áreas, Início com banner + uma seção por área, página de cada área com a
   Consulta rápida em Operações), o celular (topo azul, grade das áreas, tela
   da área que desliza), a busca ⌘K e o "abrir" de cada sistema.
   O Dock e as logos moram em dock.js; o editor do banner, em banner-editor.js;
   o catálogo e quem vê cada sistema, em sistemas.js; os desenhos, em icones.js.
   A central de avisos é a MESMA de todas as telas: /shared/os-avisos.js.

   Nada do launcher antigo sumiu: login + "esqueci minha senha" + ?volta= + tela
   de quem não é do time; banner com vídeo, texto, link, prazo de saída e editor;
   Diretoria/Financeiro restritos; Usuários (admin); Novidades, Minha Conta, Sair;
   "melhor no PC" e a arte do banner em tela cheia no celular.
   ============================================================================ */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isVideoUrl = (u) => /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(u || '');
  const ic = (k, s) => window.InicioIcones.ic(k, s);
  const db = () => OS.getClient();
  const reduz = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ehCelular = () => matchMedia('(max-width:760px)').matches;

  let ACCESS = { acessos: {}, level: 'collaborator', foraDoTime: false };
  let UID = null, AREAS = [], ALL = [], BANNER = [], CQ = [], IS_MANAGER = false;
  const by = (n) => ALL.find(s => s.n === n);
  const DEFAULT_SLIDE = { badge: 'Comunicado', titulo: 'Bem-vindo ao Hub,', destaque: 'tudo da empresa num lugar só.',
    texto: 'Fique por dentro das novidades, eventos e informações importantes do dia.', link_url: '', link_label: 'Ver mais', imagem_url: '', cor: '#BBB2DC' };

  const LOCK = '<svg class="i lk" viewBox="0 0 24 24" style="width:11px;height:11px;display:inline"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const SETA = '<svg class="i seta" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  const MARCA = '<svg viewBox="0 0 30 18" aria-hidden="true"><circle cx="9" cy="9" r="9"/><path d="M21 0a9 9 0 0 1 0 18z"/></svg>';
  const FAIXA = '<i style="background:#BBB2DC"></i><i style="background:#9CB2D4"></i><i style="background:#B8E9DE"></i><i style="background:#EED7A4"></i><i style="background:#EABAAA"></i>';

  function showOverlay(m) { $('#overlayMsg').textContent = m || 'Carregando…'; $('#overlay').hidden = false; }
  function hideOverlay() { $('#overlay').hidden = true; }
  function toast(t) { $$('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2700); }
  const periodo = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const primeiroNome = () => (ACCESS.full_name || '').split(' ')[0] || (ACCESS.email || '').split('@')[0] || 'você';
  const iniciais = () => (ACCESS.full_name || ACCESS.email || '··').split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase();
  const conta = (a) => a.apps.filter(s => !s.soon).length;
  const qtd = (a) => conta(a) ? conta(a) + (conta(a) > 1 ? ' sistemas' : ' sistema') : 'em breve';

  // ── preferências da pessoa (hub.user_prefs — nada fica no navegador) ─────
  async function lerPref(k, padrao) {
    try { const { data } = await db().from('user_prefs').select('value').eq('user_id', UID).eq('key', k).maybeSingle(); return data ? data.value : padrao; }
    catch (e) { return padrao; }
  }
  async function gravarPref(k, v) {
    const { error } = await db().from('user_prefs').upsert({ user_id: UID, key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) throw error;
  }

  // ── Dia / Noite (sem escolha = segue o computador) ───────────────────────
  function aplicaTema(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  function trocaTema() {
    const at = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const novo = at === 'dark' ? 'light' : 'dark';
    const f = () => aplicaTema(novo);
    if (document.startViewTransition && !reduz()) document.startViewTransition(f); else f();
    gravarPref('inicio:tema', novo).catch(e => toast('Não gravei o Dia/Noite: ' + (e.message || e)));
  }

  // ════════ ENTRADA (o mesmo login de antes) ════════
  async function showForaDoTime() {
    hideOverlay();
    try { await OS.Auth.signOut(); } catch (e) {}
    document.body.innerHTML = '<div class="gate"><div class="gate-card" style="text-align:center"><div style="font-size:34px;margin-bottom:12px">🔒</div>'
      + '<h1>Esta conta não tem acesso ao Hub</h1><p class="sub" style="margin:10px 0 18px">Se você faz parte do time e está vendo isto, '
      + 'fale com a administração de usuários para liberar o seu acesso.</p><a href="/" style="text-decoration:underline">Voltar</a></div></div>';
  }
  // TER SESSÃO NÃO É SER DO TIME: sem ficha em hub.users, ou com active = false,
  // não entra. Falhou a leitura = não dá pra afirmar que é do time.
  async function loadAccess(session) {
    try {
      UID = session && session.user && session.user.id;
      if (!UID) return;
      const { data } = await db().from('users').select('acessos, access_level, role_id, area_ids, email, full_name, avatar_url, active').eq('id', UID).single();
      if (!data || data.active === false) { ACCESS.foraDoTime = true; return; }
      ACCESS = { acessos: data.acessos || {}, level: data.access_level || 'collaborator', role_id: data.role_id || null,
        area_ids: data.area_ids || [], email: data.email || (session.user.email || ''), full_name: data.full_name || '',
        avatar_url: data.avatar_url || '', foraDoTime: false };
    } catch (e) { ACCESS.foraDoTime = true; }
  }
  // link de uma tela aberto sem sessão chega com ?volta=/caminho — só caminho DESTE site
  function destinoDeVolta() {
    try {
      const v = new URL(location.href).searchParams.get('volta');
      if (!v) return null;
      const d = decodeURIComponent(v);
      return (!d.startsWith('/') || d.startsWith('//')) ? null : d;
    } catch (e) { return null; }
  }
  function showLogin() { $('#app').hidden = true; $('#gate').hidden = false; hideOverlay(); }

  // Instalação nova, ainda sem administrador? Leva pro /primeiro-acesso/.
  // Pergunta à função primeiro-acesso; sem resposta em 2,5 s (função não
  // publicada, rede fora), segue pro login normal — nunca trava a entrada.
  async function primeiroAcessoAberto() {
    try {
      const r = await Promise.race([
        db().functions.invoke('primeiro-acesso', { method: 'GET' }),
        new Promise((ok) => setTimeout(() => ok(null), 2500)),
      ]);
      return !!(r && !r.error && r.data && r.data.disponivel === true);
    } catch (e) { return false; }
  }
  async function boot() {
    showOverlay('Carregando…');
    if (!(window.OS && window.OS.Auth)) { showLogin(); return; }
    try {
      const session = await OS.Auth.getSession();
      if (!session) {
        if (await primeiroAcessoAberto()) { location.replace('/primeiro-acesso/'); return; }
        showLogin(); return;
      }
      await loadAccess(session);
      if (ACCESS.foraDoTime) { await showForaDoTime(); return; }
      await showApp();
    } catch (e) { showLogin(); }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn'), err = $('#loginErr');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…'; showOverlay('Entrando…');
    // erro de senha fala de senha; erro DEPOIS da senha diz que a senha está certa
    try { await OS.Auth.signIn($('#email').value.trim(), $('#pass').value); }
    catch (eSenha) {
      hideOverlay(); err.textContent = 'E-mail ou senha não conferem. Confira o e-mail exatamente como está no cadastro (ponto, hífen e _ contam).';
      btn.disabled = false; btn.textContent = 'Entrar'; return;
    }
    try {
      const session = await OS.Auth.getSession();
      await loadAccess(session);
      if (ACCESS.foraDoTime) { await showForaDoTime(); return; }
      await showApp();
    } catch (eDepois) {
      hideOverlay();
      err.textContent = 'Sua senha está certa, mas não consegui montar sua tela (' + ((eDepois && eDepois.message) || 'falha de conexão') + '). Recarregando…';
      setTimeout(() => location.reload(), 1800);
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });
  // "Esqueci minha senha": serve pra quem esqueceu e pra quem foi convidado
  $('#forgotLink').addEventListener('click', async () => {
    const email = $('#email').value.trim(), msg = $('#recoverMsg'); $('#loginErr').textContent = '';
    if (!email) { msg.style.color = '#C2413A'; msg.textContent = 'Digite seu e-mail acima primeiro.'; $('#email').focus(); return; }
    msg.style.color = ''; msg.textContent = 'Enviando…';
    try {
      const r = await db().auth.resetPasswordForEmail(email, { redirectTo: OS.link('/entrar/') });
      if (r.error) throw r.error;
      msg.style.color = '#1F8A3A'; msg.textContent = 'Pronto! Enviamos um link para ' + email + '. Abra o e-mail para definir a senha.';
    } catch (e) { msg.style.color = '#C2413A'; msg.textContent = 'Não deu para enviar: ' + (e.message || 'tente de novo.'); }
  });
  async function sair() { try { await OS.Auth.signOut(); } catch (e) {} location.reload(); }

  // ════════ DADOS ════════
  async function loadBanner() {
    try {
      const { data, error } = await db().from('banner_noticias').select('*').eq('ativo', true)
        .order('ordem', { ascending: true }).order('criado_em', { ascending: false });
      if (error) throw error;
      const agora = Date.now();
      const vivas = (data || []).filter(r => !r.expira_em || new Date(r.expira_em).getTime() > agora);
      BANNER = vivas.length ? vivas : [DEFAULT_SLIDE];
    } catch (e) { BANNER = [DEFAULT_SLIDE]; }
  }
  async function loadLogos() {
    try {
      const { data, error } = await db().from('hub_logos').select('chave, url');
      if (error) throw error;
      const L = window.InicioIcones.LOGO; Object.keys(L).forEach(k => delete L[k]);
      (data || []).forEach(r => { L[r.chave] = r.url; });
    } catch (e) { /* sem logo enviada: fica o desenho */ }
  }
  async function loadCQ() {
    try {
      const { data, error } = await db().from('consulta_rapida').select('id, grupo, grupo_ordem, rotulo, valor, link, restrito, ordem, fonte')
        .order('grupo_ordem').order('ordem');
      if (error) throw error;
      CQ = data || [];
    } catch (e) { CQ = []; }
  }

  // ════════ ABRIR UM SISTEMA: vai direto, sem animação ════════
  function irPara(s) {
    if (!s || s.soon || !s.href) return;
    if (s.ausente) { if (window.OS && OS.moduloAusenteJanela) OS.moduloAusenteJanela(s.ausente); return; }   // módulo que não veio
    if (s.novaAba || s.externo) { window.open(s.href, '_blank', 'noopener'); return; }
    location.href = s.href;
  }
  function abrir(nome, origem) {
    const s = by(nome); if (!s || s.soon) return;
    if (window.InicioDock) window.InicioDock.recente(s.n);
    irPara(s);
  }

  // ════════ COMPUTADOR ════════
  function movePill(el) {
    const pill = $('#navPill'); if (!el || !pill) return;
    pill.style.transform = `translateY(${el.offsetTop}px)`; pill.style.height = el.offsetHeight + 'px';
    pill.style.setProperty('--pc', getComputedStyle(el).getPropertyValue('--a'));
  }
  function montaMenu() {
    const nav = $('#nav');
    nav.innerHTML = '<span class="pill" id="navPill"></span>'
      + '<button class="it on" type="button" data-area="inicio" style="--a:#9CB2D4"><svg class="i" viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>Início</button>'
      + '<button class="it" type="button" data-sino style="--a:#E5484D"><svg class="i" viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>Avisos<span class="badge js-n" hidden>0</span></button>'
      + '<div class="lbl">Áreas</div>'
      + AREAS.map(a => `<button class="it" type="button" data-area="${a.id}" style="--a:${a.cor}"><span class="dt"></span>${esc(a.area)}<span class="ct">${conta(a) || ''}</span></button>`).join('')
      + '<div class="grow"></div><div class="sep"></div>'
      + '<a class="it" href="/novidades/"><svg class="i" viewBox="0 0 24 24"><path d="M3 11l12-5v12L3 13z"/><path d="M6 12v6a2 2 0 0 0 4 0v-5"/><path d="M18 9a3 3 0 0 1 0 6"/></svg>Novidades</a>'
      + '<a class="it" href="/conta/"><svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>Minha Conta</a>'
      + '<button class="it sair" type="button" data-sair><svg class="i" viewBox="0 0 24 24"><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h11"/></svg>Sair</button>';
    requestAnimationFrame(() => movePill($('#nav .it.on')));
  }
  function bannerHTML() {
    const lista = BANNER.length ? BANNER : [DEFAULT_SLIDE];
    const slides = lista.map((n, i) => {
      if (n.imagem_url && isVideoUrl(n.imagem_url)) return `<div class="sl"><video src="${esc(n.imagem_url)}" muted playsinline preload="metadata"></video></div>`;
      if (n.imagem_url && !n.titulo && !n.destaque && !n.texto && !n.badge) return `<div class="sl"><img src="${esc(n.imagem_url)}" alt="${esc(n.nome || 'Notícia')}" loading="${i ? 'lazy' : 'eager'}"></div>`;
      return `<div class="sl txt" style="--c:${esc(n.cor || '#9CB2D4')}${n.imagem_url ? `;background:linear-gradient(90deg,rgba(0,19,61,.92) 40%,rgba(0,19,61,.35)),url('${esc(n.imagem_url)}') center/cover` : ''}">`
        + (n.badge ? `<span class="bd">${esc(n.badge)}</span>` : '') + (n.titulo ? `<h2>${esc(n.titulo)}${n.destaque ? `<br><em>${esc(n.destaque)}</em>` : ''}</h2>` : '')
        + (n.texto ? `<p>${esc(n.texto)}</p>` : '') + '</div>';
    }).join('');
    const multi = lista.length > 1;
    return slides
      + (multi ? '<button class="nv p" type="button" aria-label="Anterior"><svg class="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button><button class="nv n" type="button" aria-label="Próxima"><svg class="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>'
        + `<div class="pg">${lista.map((b, i) => `<button type="button" aria-label="Notícia ${i + 1}"></button>`).join('')}</div>` : '')
      + `<div class="ac">${IS_MANAGER ? '<button class="ed" type="button" data-bneditor>Publicar notícia</button>' : ''}<a class="go" target="_blank" rel="noopener" hidden></a></div>`;
  }
  let _bnTimer = null;
  function ligaBanner(box) {
    const lista = BANNER.length ? BANNER : [DEFAULT_SLIDE];
    let cur = 0;
    const sl = $$('.sl', box), pg = $$('.pg button', box), go = $('.go', box);
    function show(i) {
      cur = (i + lista.length) % lista.length;
      sl.forEach((s, j) => {
        s.classList.toggle('on', j === cur);
        const v = $('video', s); if (v) { if (j === cur) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); }
        const im = $('img', s); if (im && j === cur) { im.style.transition = 'none'; im.style.transform = 'scale(1.04)'; void im.offsetWidth; im.style.transition = ''; im.style.transform = ''; }
      });
      pg.forEach((p, j) => p.classList.toggle('on', j === cur));
      const b = lista[cur]; go.hidden = !b.link_url; go.href = b.link_url || '#'; go.textContent = (b.link_label || 'Abrir') + ' →';
      clearTimeout(_bnTimer);
      if (lista.length < 2) return;
      // imagem = 6,5 s; vídeo = espera acabar (teto de 30 s) — igual ao de antes
      const v = $('video', sl[cur]);
      if (v) { let feito = false; const prox = () => { if (feito) return; feito = true; show(cur + 1); }; v.onended = prox; _bnTimer = setTimeout(prox, 30000); }
      else _bnTimer = setTimeout(() => show(cur + 1), 6500);
    }
    pg.forEach((p, j) => p.onclick = () => show(j));
    const p = $('.nv.p', box), n = $('.nv.n', box);
    if (p) p.onclick = () => show(cur - 1); if (n) n.onclick = () => show(cur + 1);
    box.onmouseenter = () => clearTimeout(_bnTimer);
    box.onmouseleave = () => { if (lista.length > 1) _bnTimer = setTimeout(() => show(cur + 1), 3000); };
    show(0);
  }
  const appBtn = (s) => `<button class="app${s.soon ? ' soon' : ''}" type="button" draggable="${s.soon ? 'false' : 'true'}" data-app="${esc(s.n)}" title="${esc(s.dsc)}">${ic(s.k, 64)}<span class="nm">${esc(s.n)}${s.lock ? ' ' + LOCK : ''}</span>${s.soon ? '<span class="sub">em breve</span>' : s.ausente ? '<span class="sub">não instalado</span>' : ''}</button>`;
  let CUR = 'inicio';
  function area(id) {
    // no celular a área desliza por cima; a tela do computador fica montada por baixo
    // (girar o tablet ou alargar a janela não deixa a página em branco)
    if (ehCelular()) { if (id !== 'inicio') { mAbre(id); return; } mVolta(); }
    CUR = id;
    const nav = $('#nav'), el = $(`[data-area="${id}"]`, nav);
    $$('.it', nav).forEach(x => x.classList.toggle('on', x === el)); movePill(el);
    const P = $('#page'); P.classList.remove('troca'); void P.offsetWidth; P.classList.add('troca');
    if (id === 'inicio') {
      P.innerHTML = `<div class="ola"><h1>${periodo()}, ${esc(primeiroNome())}</h1><span>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div><div class="bn" id="bnD">${bannerHTML()}</div>`
        + AREAS.map(a => `<section class="sec" style="--a:${a.cor}"><div class="sec-h"><span class="dt"></span><b>${esc(a.area)}</b><small>${qtd(a)}</small><button class="mais" type="button" data-area="${a.id}">Abrir área <svg class="i" viewBox="0 0 24 24" style="width:13px;height:13px"><path d="M9 6l6 6-6 6"/></svg></button></div><div class="grid">${a.apps.map(appBtn).join('')}</div></section>`).join('');
      ligaBanner($('#bnD'));
    } else {
      const a = AREAS.find(x => x.id === id); if (!a) return area('inicio');
      P.innerHTML = `<div class="hero" style="--a:${a.cor}"><div><div class="ov">Área</div><h2>${esc(a.area)}</h2><p>${esc(a.d)}</p></div><div class="n"><span><b>${conta(a)}</b><small>${conta(a) === 1 ? 'sistema' : 'sistemas'}</small></span></div></div>`
        + `<div class="lista">${a.apps.map(s => `<button class="row" type="button" draggable="${s.soon ? 'false' : 'true'}" data-app="${esc(s.n)}"${s.soon ? ' disabled' : ''}>${ic(s.k, 52)}<span class="tx"><b>${esc(s.n)}${s.lock ? '<span class="tag">restrito</span>' : ''}${s.soon ? '<span class="tag">em breve</span>' : ''}</b><span>${esc(s.dsc)}</span></span>${SETA}</button>`).join('')}</div>`
        + (id === 'op' ? `<div class="cq" id="cqD"><div class="cq-h"><b>Consulta rápida</b><span>o que a empresa toda precisa de vez em quando</span></div><div class="cq-g">${cqHTML()}</div></div>` : '');
    }
    scrollTo({ top: 0, behavior: reduz() ? 'auto' : 'smooth' });
    if (window.InicioDock) window.InicioDock.marcaGrade();
  }

  // ── Consulta rápida (hub.consulta_rapida; o grupo restrito só pra quem tem o cadeado
  //    `dados_socio` — quem decide o que chega é a policy do banco) ──
  const PODE_EDITAR_CQ = (r) => r.restrito || ACCESS.level === 'admin';   // linha restrita só chega pra quem pode
  let _cqEditando = null;
  function cqGrupos() {
    const g = []; CQ.forEach(r => { let x = g.find(y => y.t === r.grupo); if (!x) { x = { t: r.grupo, lock: r.restrito, rows: [] }; g.push(x); } x.rows.push(r); }); return g;
  }
  function cqLinha(r) {
    if (_cqEditando === r.id) return `<div class="kv" data-cq="${r.id}"><span>${esc(r.rotulo)}</span><input type="text" value="${esc(r.valor || '')}" maxlength="400" aria-label="${esc(r.rotulo)}" data-cqin><button type="button" data-cqsalva="${r.id}">Salvar</button><button type="button" data-cqcancela style="color:var(--mut)">Cancelar</button></div>`;
    const ed = !PODE_EDITAR_CQ(r) || r.link ? '' : r.valor
      ? `<button type="button" class="lapis" data-cqedita="${r.id}" title="Editar" aria-label="Editar ${esc(r.rotulo)}"><svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`
      : `<button type="button" data-cqedita="${r.id}" style="color:var(--mut)">Preencher</button>`;
    if (r.link) return `<div class="kv"><span>${esc(r.rotulo)}</span><b><a class="ab" href="${esc(r.link)}" target="_blank" rel="noopener">Abrir ↗</a></b></div>`;
    if (r.valor) return `<div class="kv"><span>${esc(r.rotulo)}</span><b${r.valor.length < 28 ? ' class="curto"' : ''} title="${esc(r.fonte ? 'fonte: ' + r.fonte : '')}">${esc(r.valor)}</b><button type="button" data-copy="${esc(r.valor)}">Copiar</button>${ed}</div>`;
    return `<div class="kv"><span>${esc(r.rotulo)}</span><b class="vz">a preencher</b>${ed}</div>`;
  }
  function cqHTML() {
    const g = cqGrupos();
    if (!g.length) return '<div class="grp"><div class="gh">Consulta rápida</div><div class="kv"><b class="vz">Nada por aqui ainda.</b></div></div>';
    return g.map(x => `<div class="grp"><div class="gh">${x.lock ? LOCK + ' ' : ''}${esc(x.t)}${x.lock ? ' · só quem tem acesso' : ''}</div>${x.rows.map(cqLinha).join('')}<div class="cq-err" data-cqerr="${esc(x.t)}"></div></div>`).join('');
  }
  function redesenhaCQ() {
    $$('.cq-g').forEach(el => { el.innerHTML = cqHTML(); });
    const i = $('[data-cqin]'); if (i) { i.focus(); i.select(); }
  }
  async function salvaCQ(id) {
    const linha = CQ.find(r => r.id === id), inp = $(`[data-cq="${id}"] [data-cqin]`); if (!linha || !inp) return;
    const valor = inp.value.trim(), errEl = $(`[data-cqerr="${CSS.escape(linha.grupo)}"]`);
    showOverlay('Salvando…');
    try {
      const { error } = await db().rpc('consulta_rapida_salvar', { p_id: id, p_valor: valor });
      if (error) throw error;
      linha.valor = valor || null; linha.fonte = 'editado no Início'; _cqEditando = null; redesenhaCQ(); toast('Salvo');
    } catch (e) { if (errEl) errEl.textContent = 'Não salvei: ' + (e.message || e); }
    finally { hideOverlay(); }
  }

  // ── menu da sua foto ──
  function pop(btn, html) {
    $$('.pop').forEach(x => x.remove());
    const r = btn.getBoundingClientRect(), p = document.createElement('div'); p.className = 'pop'; p.setAttribute('role', 'menu');
    p.style.top = (r.bottom + 8) + 'px'; p.style.right = Math.max(8, innerWidth - r.right - 4) + 'px'; p.innerHTML = html; document.body.appendChild(p);
  }
  function menuEu() {
    return `<div class="who"><b>${esc(ACCESS.full_name || primeiroNome())}</b><small>${esc(ACCESS.email || '')}</small></div><hr>`
      + '<a class="it" href="/conta/">Minha Conta</a><a class="it" href="/novidades/">Novidades</a><button class="it" type="button" data-tema>Dia / Noite</button>'
      + '<button class="it" type="button" data-dockcfg>Ajustes do Dock</button>'
      + (ACCESS.level === 'admin' ? '<button class="it" type="button" data-logos>Logos dos sistemas<em>admin</em></button>' : '')
      + (IS_MANAGER ? '<button class="it" type="button" data-bneditor>Publicar notícia no banner</button>' : '')
      + '<hr><span class="it off">Meus Acessos<em>em breve</em></span><span class="it off">Favoritos<em>em breve</em></span><span class="it off">Central de Ajuda<em>em breve</em></span>'
      + '<hr><button class="it" type="button" data-sair>Sair</button>';
  }
  function avatarHTML(cls) {
    return ACCESS.avatar_url ? `<span class="${cls}" style="background-image:url('${esc(ACCESS.avatar_url)}')"></span>` : `<span class="${cls}">${esc(iniciais())}</span>`;
  }
  function montaDesk() {
    $('#mbarEu').innerHTML = avatarHTML('eu-av');
    $('#mbarMarca').innerHTML = MARCA; $('#brandMarca').innerHTML = MARCA; $('#faixa').innerHTML = FAIXA;
    const tick = () => { const h = $('#hora'); if (h) h.textContent = new Date().toLocaleString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ''); };
    tick(); setInterval(tick, 20000);
    montaMenu(); area('inicio');
  }

  // ════════ CELULAR ════════
  const mHome = () => $('#mHome'), mArea = () => $('#mArea');
  function montaCelular() {
    const lista = BANNER.length ? BANNER : [DEFAULT_SLIDE];
    mHome().innerHTML = `<div class="mh-topo"><div class="mh-l"><a href="/conta/" aria-label="Meu perfil">${avatarHTML('mh-av')}</a><div class="mh-eu"><small>${periodo()}</small><b>${esc(primeiroNome())}</b></div>`
      + `<button class="mh-ib" type="button" data-sino aria-label="Avisos"><svg class="i" viewBox="0 0 24 24" style="width:19px;height:19px"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="badge js-n" hidden>0</span></button></div>`
      + `<button class="mh-busca" type="button" data-spot><svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>Buscar sistema</button>`
      + `<div class="mh-fx">${FAIXA}</div></div>`
      + `<div class="m-bn" id="mBn">${lista.map((n, i) => (n.imagem_url && !isVideoUrl(n.imagem_url))
          ? `<button type="button" data-mbn="${i}" aria-label="Abrir a notícia ${i + 1}"><img src="${esc(n.imagem_url)}" alt="${esc(n.nome || 'Notícia')}" loading="${i ? 'lazy' : 'eager'}"></button>`
          : `<button type="button" data-mbn="${i}"><span class="mtx"><b>${esc([n.titulo, n.destaque].filter(Boolean).join(' ') || n.nome || 'Notícia')}</b>${n.texto ? `<span>${esc(n.texto)}</span>` : ''}</span></button>`).join('')}</div>`
      + (lista.length > 1 ? `<div class="m-dots" id="mDots">${lista.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : '')
      + '<div class="m-h">Áreas</div>'
      + `<div class="m-areas">${AREAS.map(a => `<button class="m-area" type="button" data-marea="${a.id}" style="--a:${a.cor}"><span class="mini">${a.apps.slice(0, 4).map(s => ic(s.k)).join('')}</span><b>${esc(a.area)}<small>${qtd(a)}</small></b></button>`).join('')}</div>`;
    const mb = $('#mBn'), md = $$('#mDots i');
    mb.addEventListener('scroll', () => { const i = Math.round(mb.scrollLeft / Math.max(1, mb.clientWidth)); md.forEach((d, j) => d.classList.toggle('on', j === i)); }, { passive: true });
  }
  // a arte inteira pra ler (pinça amplia), com o link embaixo — igual ao de antes
  function visor(n) {
    if (!n.imagem_url || isVideoUrl(n.imagem_url)) { if (n.link_url) window.open(n.link_url, '_blank', 'noopener'); return; }
    const v = document.createElement('div'); v.className = 'visor'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Notícia');
    v.innerHTML = `<button type="button" class="x" aria-label="Fechar">✕</button><div class="rolo"><img src="${esc(n.imagem_url)}" alt=""></div><div class="dica">↔ deslize pra ler a notícia inteira</div>`
      + (n.link_url ? `<a href="${esc(n.link_url)}" target="_blank" rel="noopener">${esc(n.link_label || 'Abrir')} →</a>` : '');
    v.addEventListener('click', (e) => { if (e.target === v || e.target.classList.contains('x')) v.remove(); });
    document.body.appendChild(v);
  }
  function mAbre(id) {
    const a = AREAS.find(x => x.id === id); if (!a) return;
    mArea().innerHTML = `<div class="m-nav"><button type="button" data-mback><svg class="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Início</button></div>`
      + `<div class="m-hero" style="--a:${a.cor}"><h2>${esc(a.area)}</h2><p>${esc(a.d)}</p></div>`
      + `<div class="ins">${a.apps.map(s => `<button class="li" type="button" data-app="${esc(s.n)}"${s.soon ? ' disabled style="opacity:.5"' : ''}>${ic(s.k, 42)}<span class="tx"><b>${esc(s.n)}${s.lock ? ' ' + LOCK : ''}</b><span>${esc(s.dsc)}</span></span>${s.pc ? '<span class="pc">melhor no PC</span>' : ''}<svg class="i" viewBox="0 0 24 24" style="color:var(--mut2)"><path d="M9 6l6 6-6 6"/></svg></button>`).join('')}</div>`
      + (id === 'op' ? `<div class="m-gh">Consulta rápida</div><div class="ins"><div class="cq-g">${cqHTML()}</div></div>` : '');
    mArea().scrollTop = 0; mArea().classList.add('on'); mArea().setAttribute('aria-hidden', 'false');
  }
  function mVolta() { mArea().classList.remove('on'); mArea().setAttribute('aria-hidden', 'true'); }

  // ════════ BUSCA ⌘K (sistemas + Consulta rápida) ════════
  function busca() {
    if ($('.spot')) return;
    const sc = document.createElement('div'); sc.className = 'scrim'; const p = document.createElement('div'); p.className = 'spot'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Buscar');
    p.innerHTML = '<div class="sp-in"><svg class="i" viewBox="0 0 24 24" style="width:21px;height:21px;color:var(--mut)"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input id="spq" placeholder="Buscar sistema ou dado da empresa" autocomplete="off" aria-label="Buscar"></div><div class="sp-l" id="spl"></div>';
    document.body.append(sc, p);
    const q = $('#spq', p), L = $('#spl', p); let sel = 0, lista = [];
    const nrm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const IT = [...ALL.filter(s => !s.soon).map(s => ({ g: s.area, s })), ...cqGrupos().map(c => ({ g: 'Consulta rápida', c }))];
    function draw() {
      const t = nrm(q.value.trim());
      lista = IT.filter(x => !t || nrm(x.s ? x.s.n + ' ' + x.s.dsc + ' ' + x.s.area : x.c.t + ' ' + x.c.rows.map(r => r.rotulo + ' ' + (r.valor || '')).join(' ')).includes(t));
      sel = Math.min(sel, Math.max(0, lista.length - 1));
      if (!lista.length) { L.innerHTML = `<div class="sp-v">Nada encontrado para “${esc(q.value)}”</div>`; return; }
      let g = '';
      L.innerHTML = lista.map((x, i) => (x.g !== g ? `<div class="sp-g">${esc(g = x.g)}</div>` : '') + `<div class="sp-i${i === sel ? ' on' : ''}" data-i="${i}">`
        + (x.s ? ic(x.s.k, 30) + `<b>${esc(x.s.n)}</b><span class="ds">${esc(x.s.dsc)}</span>` : `<b>${esc(x.c.t)}</b><span class="ds">Operações</span>`) + '</div>').join('');
    }
    const fecha = () => { sc.remove(); p.remove(); document.removeEventListener('keydown', k); };
    const vai = (i) => {
      const x = lista[i]; if (!x) return; fecha();
      if (x.s) { if (ehCelular()) { mAbre(x.s.aid); return; } area(x.s.aid); setTimeout(() => { const o = $(`#page [data-app="${CSS.escape(x.s.n)}"]`); if (o) abrir(x.s.n, o); }, 380); }
      else area('op');
    };
    function k(e) {
      if (e.key === 'Escape') fecha();
      else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, lista.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') vai(sel);
    }
    document.addEventListener('keydown', k); q.oninput = () => { sel = 0; draw(); };
    L.onclick = (e) => { const it = e.target.closest('.sp-i'); if (it) vai(+it.dataset.i); };
    sc.onclick = fecha; draw(); q.focus();
  }
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !$('#app').hidden) { e.preventDefault(); busca(); } });

  // ════════ AVISOS (a central é a mesma de todas as telas: /shared/os-avisos.js) ════════
  function contaSino(n) { $$('.js-n').forEach(b => { b.textContent = n > 99 ? '99+' : String(n || 0); b.hidden = !n; }); }
  window.addEventListener('os-avisos', (e) => contaSino((e.detail && e.detail.nao) || 0));
  function abrirAvisos() {
    if (window.OSAvisos) window.OSAvisos.abrir();
    else toast('A central de avisos ainda está carregando. Tenta de novo em um segundo.');
  }

  // ════════ CLIQUES ════════
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest('.pop,[data-eu]')) $$('.pop').forEach(x => x.remove());
    if (document.body.classList.contains('dock-edit')) return;   // modo "escolher os sistemas do Dock" (dock.js)
    if (t.closest('[data-sino]')) { abrirAvisos(); return; }
    const eu = t.closest('[data-eu]'); if (eu) { pop(eu, menuEu()); return; }
    if (t.closest('[data-kyoto]')) { if (!OS.instalado || OS.instalado('outassistenteia')) window.dispatchEvent(new CustomEvent('os-kyoto')); return; }   // abre o assistente (módulo OutAssistenteIA)
    if (t.closest('[data-sair]')) { sair(); return; }
    if (t.closest('[data-bneditor]')) { $$('.pop').forEach(x => x.remove()); window.InicioBannerEditor.abrir(); return; }
    if (t.closest('[data-tema]')) { $$('.pop').forEach(x => x.remove()); trocaTema(); return; }
    const mbn = t.closest('[data-mbn]'); if (mbn) { visor((BANNER.length ? BANNER : [DEFAULT_SLIDE])[+mbn.dataset.mbn] || {}); return; }
    const ma = t.closest('[data-marea]'); if (ma) { mAbre(ma.dataset.marea); return; }
    if (t.closest('[data-mback]')) { mVolta(); return; }
    const ar = t.closest('[data-area]'); if (ar) { area(ar.dataset.area); return; }
    const ap = t.closest('[data-app]'); if (ap && !ap.disabled) { abrir(ap.dataset.app, ap); return; }
    if (t.closest('[data-spot]')) { busca(); return; }
    const ce = t.closest('[data-cqedita]'); if (ce) { _cqEditando = ce.dataset.cqedita; redesenhaCQ(); return; }
    if (t.closest('[data-cqcancela]')) { _cqEditando = null; redesenhaCQ(); return; }
    const cs = t.closest('[data-cqsalva]'); if (cs) { salvaCQ(cs.dataset.cqsalva); return; }
    const cp = t.closest('[data-copy]');
    if (cp) { try { navigator.clipboard.writeText(cp.dataset.copy).then(() => toast('Copiado'), () => toast('Selecione e copie')); } catch (_) { toast('Selecione e copie'); } }
  });
  document.addEventListener('keydown', (e) => {
    const inp = e.target.closest && e.target.closest('[data-cqin]');
    if (inp && e.key === 'Enter') { e.preventDefault(); salvaCQ(inp.closest('[data-cq]').dataset.cq); }
    if (inp && e.key === 'Escape') { _cqEditando = null; redesenhaCQ(); }
    if (e.key === 'Escape' && mArea() && mArea().classList.contains('on') && !$('.spot,.visor')) mVolta();
  });
  addEventListener('resize', () => { const on = $('#nav .it.on'); if (on) movePill(on); });

  // ════════ MONTAR ════════
  async function showApp() {
    const volta = destinoDeVolta(); if (volta) { location.replace(volta); return; }
    // Quem publica no banner: quem administra o sistema. Só o botão — a trava de
    // verdade é a RLS (policy banner_write de hub.banner_noticias: admin).
    IS_MANAGER = ACCESS.level === 'admin';
    AREAS = window.InicioSistemas.paraMim(ACCESS);
    ALL = AREAS.flatMap(a => a.apps);
    const [tema] = await Promise.all([lerPref('inicio:tema', null), loadBanner(), loadLogos(), loadCQ()]);
    aplicaTema(tema);
    $('#gate').hidden = true; $('#app').hidden = false;
    montaDesk(); montaCelular();
    if (window.InicioDock) await window.InicioDock.iniciar();
    hideOverlay();
    if (window.OS && OS.avisosNaoLidos) contaSino(OS.avisosNaoLidos());
  }

  window.Inicio = {
    esc, isVideoUrl, showOverlay, hideOverlay, toast, lerPref, gravarPref, abrir, area, by,
    todos: () => ALL, areas: () => AREAS, acesso: () => ACCESS, ehCelular,
    // o editor do banner chama estas duas depois de gravar
    loadBanner, showHero: () => { if (CUR === 'inicio' && !ehCelular()) area('inicio'); montaCelular(); },
    redesenha: () => { area(CUR); montaCelular(); if (window.InicioDock) window.InicioDock.desenha(); },
    loadLogos,
  };
  boot();
})();
