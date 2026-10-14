/* ============================================================================
   INÍCIO DO HUB · o DOCK e as LOGOS (window.InicioDock)
   ----------------------------------------------------------------------------
   Cada pessoa monta o SEU Dock (os ícones embaixo, jeito de Mac):
     · incluir: arrastar o sistema pro Dock, ou "Escolher os sistemas" e tocar no +
     · tirar: botão direito › Tirar do Dock, o − no modo de escolher, ou arrastar pra fora
     · ordem: arrastar dentro do Dock
     · Ajustes: mostrar/esconder o Dock, esconder sozinho, mostrar os abertos por último
   Tudo mora em hub.user_prefs (nada no navegador), chaves 'inicio:dock' e 'inicio:recentes'
   — trocar de computador traz o Dock junto.
   Logos: um admin sobe a logo oficial de cada sistema (balde `hub-logos` +
   hub.inicio_logo_salvar); ela aparece pra todo mundo no Início, no Dock e no celular.
   ============================================================================ */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const I = () => window.Inicio;
  const esc = (s) => I().esc(s);
  const ic = (k, s) => window.InicioIcones.ic(k, s);
  const by = (n) => I().by(n);
  // o Dock de quem nunca mexeu nele (só entra o que esta instalação tem e a pessoa vê)
  const PADRAO = ['OutJourney', 'OutChat', 'OutFunnels', 'OutPeople', 'OutProjetos', 'OutSign', 'OutPerformance', 'Grupos'];
  // o Dock guarda o NOME do sistema: Dock gravado antes da troca de nome (10/10/2026)
  // continua valendo — o nome antigo vira o novo na leitura
  const NOME_NOVO = { 'Hub Indicadores': 'OutPerformance', 'Processos': 'OutProcessos' };
  const nomeAtual = (n) => NOME_NOVO[n] || n;
  const MAX = 12;
  let PIN = [], PREF = { on: true, auto: false, rec: true }, REC = [];
  let dock = null, dockw = null;

  async function iniciar() {
    dock = $('#dock'); dockw = $('.dockw');
    const [cfg, rec] = await Promise.all([I().lerPref('inicio:dock', null), I().lerPref('inicio:recentes', [])]);
    PIN = ((cfg && Array.isArray(cfg.pin)) ? cfg.pin : PADRAO).map(nomeAtual).filter(n => by(n) && !by(n).soon);
    PREF = Object.assign({ on: true, auto: false, rec: true }, (cfg && cfg.pref) || {});
    REC = Array.isArray(rec) ? rec.map(nomeAtual) : [];
    ligaArrastar();
    desenha();
  }
  function salvaDock(msg) {
    desenha();
    I().gravarPref('inicio:dock', { pin: PIN, pref: PREF })
      .then(() => { if (msg) I().toast(msg); })
      .catch(e => I().toast('Não gravei o Dock: ' + (e.message || e)));
  }
  // aberto por último (só os 6 mais novos)
  function recente(n) {
    REC = [n, ...REC.filter(x => x !== n)].slice(0, 6);
    I().gravarPref('inicio:recentes', REC).catch(() => { /* sem gravar, só não aparece no Dock */ });
  }

  const dkBtn = (n, rec) => {
    const s = by(n); if (!s) return '';
    return `<button class="dk${rec ? ' rec' : ''}" type="button" data-app="${esc(n)}" draggable="true" aria-label="${esc(n)}"><span class="tip">${esc(n)}${rec ? ' · aberto há pouco' : ''}</span>${ic(s.k)}<span class="dot"></span>`
      + (rec ? '<span class="pl" aria-hidden="true">+</span>' : `<span class="rm" data-unpin="${esc(n)}" role="button" aria-label="Tirar ${esc(n)} do Dock">−</span>`) + '</button>';
  };
  function desenha() {
    if (!dock) return;
    const ed = dock.classList.contains('edit');
    const rec = PREF.rec ? REC.filter(n => !PIN.includes(n) && by(n) && !by(n).soon).slice(0, 3) : [];
    dock.innerHTML = (PIN.length ? PIN.map(n => dkBtn(n)).join('') : '<span class="dk-vz">Arraste um sistema pra cá</span>')
      + (rec.length ? '<span class="dsep"></span>' + rec.map(n => dkBtn(n, true)).join('') : '')
      // o ✦ é do módulo OutAssistenteIA: sem ele instalado, o Dock não tem o botão
      + (window.OS && OS.instalado && !OS.instalado('outassistenteia') ? ''
        : '<span class="dsep"></span><button class="dk ky" type="button" data-kyoto aria-label="Assistente"><span class="tip">Assistente</span><span class="orb-dk"></span><span class="dot"></span></button>')
      + (ed ? '<button class="dk-ok" type="button" data-dockok>Pronto</button>' : '');
    dockw.classList.toggle('off', !PREF.on && !ed);
    dockw.classList.toggle('auto', PREF.auto && PREF.on && !ed);
    marcaGrade();
    const dks = $$('.dk', dock);
    // a lupa do Mac: o ícone cresce quando o mouse chega perto
    dock.onmousemove = (e) => { if (ed || matchMedia('(prefers-reduced-motion: reduce)').matches) return; dks.forEach(d => { const r = d.getBoundingClientRect(), dist = Math.abs(e.clientX - (r.left + r.width / 2)); d.style.setProperty('--sz', (50 + 26 * Math.max(0, 1 - dist / 130)) + 'px'); }); };
    dock.onmouseleave = () => dks.forEach(d => d.style.setProperty('--sz', '50px'));
  }
  function marcaGrade() { $$('#page [data-app]').forEach(x => x.classList.toggle('no-dock', PIN.includes(x.dataset.app))); }
  function pin(n, pos) {
    if (PIN.includes(n) || !by(n) || by(n).soon) return;
    if (PIN.length >= MAX) { I().toast('O Dock cabe até ' + MAX + ' sistemas'); return; }
    PIN.splice(pos == null ? PIN.length : pos, 0, n); salvaDock(n + ' entrou no Dock');
  }
  function unpin(n) { PIN = PIN.filter(x => x !== n); salvaDock(n + ' saiu do Dock'); }
  function editar(on) {
    dock.classList.toggle('edit', on); document.body.classList.toggle('dock-edit', on); desenha();
    if (on) I().toast('Toque no + de um sistema pra incluir, no − pra tirar, ou arraste pra mudar a ordem');
  }

  // no modo "escolher", clicar inclui/tira em vez de abrir
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('dock-edit')) return;
    const t = e.target;
    if (t.closest('[data-dockok]')) { e.stopPropagation(); editar(false); return; }
    const un = t.closest('[data-unpin]'); if (un) { e.stopPropagation(); unpin(un.dataset.unpin); return; }
    const a = t.closest('[data-app]');
    if (a) { e.stopPropagation(); e.preventDefault(); if (!a.closest('#dock') || a.classList.contains('rec')) pin(a.dataset.app); }
  }, true);

  // arrastar: da grade pro Dock inclui; dentro do Dock muda a ordem; puxar pra fora tira
  let arrastoDoDock = null;
  function ligaArrastar() {
    document.addEventListener('dragstart', (e) => {
      const a = e.target.closest && e.target.closest('[data-app]'); if (!a) return;
      e.dataTransfer.setData('text/plain', a.dataset.app); e.dataTransfer.effectAllowed = 'move';
      arrastoDoDock = a.closest('#dock') && !a.classList.contains('rec') ? a.dataset.app : null;
      dockw.classList.add('mostra');
    });
    document.addEventListener('dragend', (e) => {
      dockw.classList.remove('mostra'); dock.classList.remove('alvo');
      if (arrastoDoDock && e.dataTransfer.dropEffect === 'none') { const r = dock.getBoundingClientRect(); if (e.clientY && e.clientY < r.top - 50) unpin(arrastoDoDock); }
      arrastoDoDock = null;
    });
    dock.addEventListener('dragover', (e) => { e.preventDefault(); dock.classList.add('alvo'); });
    dock.addEventListener('dragleave', (e) => { if (!dock.contains(e.relatedTarget)) dock.classList.remove('alvo'); });
    dock.addEventListener('drop', (e) => {
      e.preventDefault(); dock.classList.remove('alvo');
      const n = e.dataTransfer.getData('text/plain'); if (!by(n) || by(n).soon) return;
      const pins = $$('.dk[data-app]:not(.rec)', dock);
      let i = pins.findIndex(d => { const r = d.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; }); if (i < 0) i = pins.length;
      const era = PIN.indexOf(n);
      if (era > -1) { PIN.splice(era, 1); if (era < i) i--; PIN.splice(i, 0, n); arrastoDoDock = null; salvaDock('Ordem do Dock salva'); }
      else pin(n, i);
    });
  }

  // botão direito: o mesmo menu do Mac
  function popAt(x, y, html) {
    $$('.pop').forEach(q => q.remove());
    const p = document.createElement('div'); p.className = 'pop'; p.setAttribute('role', 'menu'); p.innerHTML = html; document.body.appendChild(p);
    const w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.min(x, innerWidth - w - 8) + 'px'; p.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px'; p.style.transformOrigin = 'top left';
  }
  const ajustes = (titulo) => (titulo ? '<div class="ph">Dock</div>' : '')
    + `<button class="it tg" type="button" data-pref="on">Mostrar o Dock<i class="sw${PREF.on ? ' on' : ''}"></i></button>`
    + `<button class="it tg" type="button" data-pref="auto">Esconder sozinho<i class="sw${PREF.auto ? ' on' : ''}"></i></button>`
    + `<button class="it tg" type="button" data-pref="rec">Mostrar os abertos por último<i class="sw${PREF.rec ? ' on' : ''}"></i></button>`
    + '<hr><button class="it" type="button" data-dockedit>Escolher os sistemas do Dock</button><button class="it" type="button" data-dockreset>Voltar ao padrão</button>';
  document.addEventListener('contextmenu', (e) => {
    if (I().ehCelular()) return;
    const a = e.target.closest('[data-app]'), dk = e.target.closest('#dock'); if (!a && !dk) return;
    e.preventDefault();
    const n = a && a.dataset.app, s = n && by(n);
    const html = (s ? `<div class="ph">${esc(n)}</div><button class="it" type="button" data-abrir="${esc(n)}">Abrir</button>`
      + (s.soon ? '' : PIN.includes(n) ? `<button class="it" type="button" data-tira="${esc(n)}">Tirar do Dock</button>` : `<button class="it" type="button" data-poe="${esc(n)}">Manter no Dock</button>`)
      + (dk ? '<hr>' : '') : '') + (dk ? ajustes(!s) : '');
    popAt(e.clientX, e.clientY, html);
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    const pr = t.closest('[data-pref]');
    if (pr) {
      const k = pr.dataset.pref; PREF[k] = !PREF[k]; salvaDock(); pr.querySelector('.sw').classList.toggle('on', PREF[k]);
      if (k === 'on' && !PREF.on) I().toast('Dock desligado. Pra voltar: sua foto › Ajustes do Dock');
      return;
    }
    if (t.closest('[data-dockedit]')) { $$('.pop').forEach(q => q.remove()); if (!PREF.on) PREF.on = true; editar(true); return; }
    if (t.closest('[data-dockreset]')) { $$('.pop').forEach(q => q.remove()); PIN = PADRAO.filter(n => by(n)); PREF = { on: true, auto: false, rec: true }; salvaDock('O Dock voltou ao padrão'); return; }
    if (t.closest('[data-dockcfg]')) { const eu = $('.mbar [data-eu]'); $$('.pop').forEach(q => q.remove()); const r = eu.getBoundingClientRect(); popAt(r.right - 300, r.bottom + 8, ajustes(true)); return; }
    const ab = t.closest('[data-abrir]');
    if (ab) { $$('.pop').forEach(q => q.remove()); const o = $(`#dock [data-app="${CSS.escape(ab.dataset.abrir)}"]`) || $(`#page [data-app="${CSS.escape(ab.dataset.abrir)}"]`); I().abrir(ab.dataset.abrir, o); return; }
    const ti = t.closest('[data-tira]'); if (ti) { $$('.pop').forEach(q => q.remove()); unpin(ti.dataset.tira); return; }
    const po = t.closest('[data-poe]'); if (po) { $$('.pop').forEach(q => q.remove()); pin(po.dataset.poe); return; }
    if (t.closest('[data-logos]')) { $$('.pop').forEach(q => q.remove()); logos(); }
  });

  // ── Logos dos sistemas (admin) ───────────────────────────────────────────
  function logos() {
    const sc = document.createElement('div'); sc.className = 'scrim';
    const m = document.createElement('div'); m.className = 'lgm'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Logos dos sistemas');
    document.body.append(sc, m);
    const fecha = () => { sc.remove(); m.remove(); document.removeEventListener('keydown', k); };
    function k(e) { if (e.key === 'Escape') fecha(); }
    document.addEventListener('keydown', k); sc.onclick = fecha;
    const L = window.InicioIcones.LOGO, erros = {};
    function desenhaLogos() {
      m.innerHTML = '<div class="lgh"><div><b>Logos dos sistemas</b><span>Suba a logo oficial de cada sistema. Ela aparece no Início, nas áreas, no Dock e no celular, pra todo mundo.</span></div><button type="button" class="x" aria-label="Fechar">✕</button></div>'
        + '<div class="lgd">PNG ou SVG, quadrada, de pelo menos 512 × 512 px, até 1,5 MB. Logo com fundo transparente fica sobre um quadrado branco.</div>'
        + window.InicioSistemas.AREAS.map(a => `<div class="lga">${esc(a.area)}</div>` + a.apps.map(s => `<div class="lr">${ic(s.k, 40)}<span class="ln"><b>${esc(s.n)}</b>`
          + (erros[s.k] ? `<small class="err">${esc(erros[s.k])}</small>` : `<small>${L[s.k] ? 'logo enviada' : 'desenho provisório'}</small>`) + '</span>'
          + (L[s.k] ? `<button type="button" class="lb2" data-rmlogo="${esc(s.k)}">Voltar ao desenho</button>` : '')
          + `<label class="lb">Subir logo<input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" data-up="${esc(s.k)}" hidden></label></div>`).join('')).join('');
      $('.x', m).onclick = fecha;
      $$('[data-up]', m).forEach(inp => inp.onchange = () => sobe(inp.dataset.up, inp.files[0]));
      $$('[data-rmlogo]', m).forEach(b => b.onclick = () => tira(b.dataset.rmlogo));
    }
    async function sobe(chave, f) {
      if (!f) return;
      delete erros[chave];
      if (f.size > 1.5e6) { erros[chave] = 'Arquivo grande demais: use até 1,5 MB.'; desenhaLogos(); return; }
      I().showOverlay('Enviando a logo…');
      try {
        const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
        const caminho = `${chave}/${Date.now()}.${ext}`;
        const c = OS.getClient();
        const up = await c.storage.from('hub-logos').upload(caminho, f, { upsert: false, cacheControl: '31536000', contentType: f.type || undefined });
        if (up.error) throw up.error;
        const url = c.storage.from('hub-logos').getPublicUrl(caminho).data.publicUrl;
        const r = await c.rpc('inicio_logo_salvar', { p_chave: chave, p_url: url });
        if (r.error) throw r.error;
        L[chave] = url; I().redesenha(); I().toast('Logo trocada pra todo mundo');
      } catch (e) { erros[chave] = 'Não subiu: ' + (e.message || e); }
      finally { I().hideOverlay(); desenhaLogos(); }
    }
    async function tira(chave) {
      delete erros[chave];
      I().showOverlay('Voltando ao desenho…');
      try {
        const r = await OS.getClient().rpc('inicio_logo_remover', { p_chave: chave });
        if (r.error) throw r.error;
        delete L[chave]; I().redesenha(); I().toast('Voltou ao desenho provisório');
      } catch (e) { erros[chave] = 'Não deu: ' + (e.message || e); }
      finally { I().hideOverlay(); desenhaLogos(); }
    }
    desenhaLogos();
  }

  window.InicioDock = { iniciar, desenha, recente, marcaGrade };
})();
