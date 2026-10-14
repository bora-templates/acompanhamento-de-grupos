/* ============================================================================
   INÍCIO DO HUB · EDITOR DO BANNER (window.InicioBannerEditor)
   ----------------------------------------------------------------------------
   O MESMO editor de notícias do launcher antigo, só mudado de arquivo na
   passagem pra identidade visual do Hub — nenhuma função saiu:
   subir imagem/vídeo (balde `banner`), prompts prontos pra IA, ordenar a
   rotação, ocultar/mostrar, excluir, tirar do ar em data, banner de texto,
   e o login caído que se renova sozinho.
   Erro aparece DENTRO da janela, não em alert().
   Quem publica é quem administra o sistema; a trava de verdade é a RLS
   (policy banner_write de hub.banner_noticias), o botão é só o que se mostra.
   ============================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const I = () => window.Inicio;
  const esc = (s) => I().esc(s);
  const isVideoUrl = (u) => I().isVideoUrl(u);
  const showOverlay = (m) => I().showOverlay(m);
  const hideOverlay = () => I().hideOverlay();
  const loadBanner = () => I().loadBanner();
  const showHero = () => I().showHero();
  const resetHeroTimer = () => {};
  const AREAS = window.InicioSistemas.AREAS.map(a => ({ area: a.area, color: a.cor }));

  /* Login caído no editor do banner ("permission denied for table roles").
     Com a tela aberta muito tempo o login vence e o banco passa a tratar a pessoa como
     visitante — o erro que aparece não fala em login e ninguém entende. Então:
     1) tenta renovar o login sozinho e refaz a ação; 2) não deu → aviso claro com
     "Entrar de novo". */
  function erroDeSessao(e){
    const cod = String((e && (e.code || e.statusCode)) || '');
    const msg = String((e && (e.message || e.error_description)) || e || '');
    return cod==='42501' || cod==='401' || /permission denied|JWT|jwt|not authenticated|invalid claim/i.test(msg);
  }
  async function renovarSessao(){
    try{ const { data, error } = await OS.getClient().auth.refreshSession(); return !error && !!(data && data.session); }
    catch(e){ console.warn('[banner] renovar sessão', e); return false; }
  }
  function avisarSessaoExpirada(){
    if (document.getElementById('sessaoExpirada')) return;
    const d = document.createElement('div'); d.className='modal-bg'; d.id='sessaoExpirada';
    d.style.cssText = 'z-index:9999;align-items:center';
    d.innerHTML = `<div class="modal" style="max-width:430px;padding:26px 28px;text-align:center">
      <div style="font-size:34px;margin-bottom:10px">🔒</div>
      <h3 style="margin:0 0 10px;font-size:17px">Sua sessão expirou</h3>
      <p style="margin:0 0 18px;font-size:13px;line-height:1.55;color:var(--mut)">
        A tela ficou aberta muito tempo e o login caiu — por isso não deu pra gravar.
        Entre de novo e faça de novo o que estava fazendo.</p>
      <button class="btn-pri" onclick="location.reload()">Entrar de novo</button>
    </div>`;
    document.body.appendChild(d);
  }
  // Roda uma ação no banco. Se for login caído: renova e tenta de novo; não deu, avisa.
  // O erro volta marcado com .sessao = true pra quem chamou não mostrar o alerta cru por cima.
  async function comSessao(fazer){
    let r = await fazer();
    if (r && r.error && erroDeSessao(r.error) && await renovarSessao()) r = await fazer();
    if (r && r.error && erroDeSessao(r.error)){ r.error.sessao = true; avisarSessaoExpirada(); }
    return r;
  }

  // Editor de notícias (apenas gestor/RH) — formato fixo p/ facilitar.
  function openBannerEditor(){
    const colors = AREAS.map(a=>({n:a.area, c:a.color}));
    const bg = document.createElement('div'); bg.className='modal-bg'; bg.id='bannerModal';
    bg.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>Notícias do banner</h3><button class="x" data-close>×</button></div>
      <div class="modal-body">
        <div class="lbl-h">Banners publicados (em rotação)</div>
        <div class="news-note">Todos os que estão <b>🟢 No ar</b> giram sozinhos no banner, na ordem abaixo — use as setas ▲▼ pra ordenar. Pode ter quantos quiser ao mesmo tempo.</div>
        <div class="news-list" id="newsList"></div>
        <div class="lbl-h" id="formTitle">Novo banner</div>
        <input type="hidden" id="f_id">
        <div class="form-grid">
          <!-- 0) Nome interno: só pra identificar na lista acima (não aparece no banner). -->
          <div class="fld full"><label>Nome da notícia (só pra vocês identificarem aqui)</label>
            <input type="text" id="f_nome" placeholder="Ex.: Festa Junina · Julho" maxlength="80">
            <div class="hint">Não aparece no banner — serve só pra achar na lista de publicadas.</div></div>
          <!-- 1) A mídia é o principal: sobe a arte pronta (imagem OU vídeo). -->
          <div class="fld full"><label>Imagem ou vídeo do banner</label>
            <div class="drop" id="f_drop"><div class="thumb" id="f_thumb">sem mídia</div><div class="dz">Clique para subir a arte pronta<br><span class="hint"><b>Tamanho: 1600 × 600 px (proporção 8:3).</b><br>Imagem: JPG ou PNG. &nbsp;·&nbsp; Vídeo: MP4 ou WebM (até ~30s, máx. 50 MB).<br>Deixe textos/logos com ~140 px de margem das bordas (zona segura) — o banner preenche cortando as pontas.</span></div></div>
            <input type="file" id="f_file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" hidden>
          </div>
          <!-- 1b) Prompt pronto pra IA: copia com o tamanho/zona segura já embutidos. -->
          <div class="fld full prompt-box">
            <label>Não tem a arte? Copie um prompt e cole numa IA (ChatGPT, Sora, Higgsfield…)</label>
            <div class="copy-row">
              <button type="button" class="copy-btn" data-prompt="img">📋 Prompt de imagem</button>
              <button type="button" class="copy-btn" data-prompt="video">📋 Prompt de vídeo</button>
              <button type="button" class="copy-btn" data-prompt="gif">📋 Prompt de GIF</button>
            </div>
            <div class="hint">Depois de colar, troque o <b>[DESCREVA O TEMA]</b> pelo assunto do banner. O tamanho e as margens já vão no prompt.</div>
          </div>
          <!-- 2) CTA opcional: só se a notícia tiver um destino. -->
          <div class="fld"><label>Botão / link (opcional)</label><input type="url" id="f_link" placeholder="https://…"><div class="hint">Deixe vazio se a notícia não tem link</div></div>
          <div class="fld"><label>Texto do botão</label><input type="text" id="f_linklbl" placeholder="Ver mais" maxlength="24"></div>
          <!-- 2b) Tempo limite opcional: notícia sai do ar sozinha nessa data/hora. -->
          <div class="fld full"><label>Tirar do ar em (opcional)</label>
            <input type="datetime-local" id="f_expira">
            <div class="hint">Deixe vazio pra ficar no ar até você ocultar. Preenchido, some sozinha na data/hora.</div></div>
          <!-- 3) Avançado: só pra quem quiser um banner escrito (sem arte pronta). -->
          <details class="fld full adv">
            <summary>Banner de texto (avançado — dispensável se subiu a imagem)</summary>
            <div class="form-grid" style="margin-top:12px">
              <div class="fld"><label>Selo (badge)</label><input type="text" id="f_badge" placeholder="Comunicado RH" maxlength="40"></div>
              <div class="fld"><label>Cor do slide</label><div class="colorpick" id="f_cor"></div></div>
              <div class="fld full"><label>Título</label><input type="text" id="f_titulo" placeholder="Conexão que transforma," maxlength="120"></div>
              <div class="fld full"><label>Destaque (2ª linha, colorida)</label><input type="text" id="f_destaque" placeholder="cultura que impulsiona." maxlength="120"></div>
              <div class="fld full"><label>Texto</label><textarea id="f_texto" maxlength="240" placeholder="Fique por dentro das novidades…"></textarea></div>
            </div>
          </details>
        </div>
      </div>
      <div class="modal-foot">
        <span class="err" id="f_err" role="alert"></span>
        <button class="btn-ghost" data-close>Fechar</button>
        <button class="btn-pri" id="f_save" style="width:auto;padding:0 22px">Publicar</button>
      </div>
    </div>`;
    document.body.appendChild(bg);
    $('#f_cor').innerHTML = colors.map((c,i)=>`<label><input type="radio" name="cor" value="${c.c}" ${i===0?'checked':''}><span class="sw2" style="background:${c.c}" title="${esc(c.n)}"></span></label>`).join('');
    let imgUrl = '';
    const erro = (m)=>{ const e=$('#f_err'); if(e) e.textContent = m || ''; };

    bg.querySelectorAll('[data-close]').forEach(b=> b.onclick=()=>bg.remove());
    bg.onclick = (e)=>{ if (e.target===bg) bg.remove(); };
    $('#f_drop').onclick = ()=> $('#f_file').click();

    // Prompts prontos pra IA — tamanho (1600×600, 8:3) e zona segura já embutidos.
    const PROMPTS = {
      img:  'Crie uma imagem de banner horizontal em 1600x600 pixels (proporção 8:3), alta resolução, para o topo de um sistema interno. Tema: [DESCREVA O TEMA]. Estilo limpo, moderno e profissional. Mantenha textos, logos e rostos centralizados, com pelo menos 140px de margem livre em todas as bordas (as pontas podem ser cortadas). Boa legibilidade e contraste.',
      video:'Crie um vídeo de banner horizontal em 1600x600 pixels (proporção 8:3), com até 10 segundos, em loop suave e sem áudio. Tema: [DESCREVA O TEMA]. Movimento sutil e elegante. Mantenha textos, logos e rostos centralizados, com pelo menos 140px de margem livre nas bordas (as pontas podem ser cortadas). Exportar em MP4.',
      gif:  'Crie um GIF animado curto de banner horizontal em 1600x600 pixels (proporção 8:3), leve (até ~5 MB), em loop contínuo. Tema: [DESCREVA O TEMA]. Movimento sutil. Elementos importantes centralizados, com pelo menos 140px de margem livre nas bordas.'
    };
    bg.querySelectorAll('.copy-btn').forEach(b=> b.onclick = async ()=>{
      const txt = PROMPTS[b.dataset.prompt]; if(!txt) return;
      try{ await navigator.clipboard.writeText(txt); }
      catch(e){ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(_){}
        ta.remove(); }
      const orig=b.textContent; b.textContent='✓ Copiado!'; b.classList.add('ok');
      setTimeout(()=>{ b.textContent=orig; b.classList.remove('ok'); }, 1600);
    });
    // Mostra a mídia carregada no quadradinho (thumb): imagem de fundo ou <video>.
    function showThumb(url){
      const t = $('#f_thumb');
      if(!url){ t.style.backgroundImage=''; t.innerHTML=''; t.textContent='sem mídia'; return; }
      if(isVideoUrl(url)){ t.style.backgroundImage=''; t.innerHTML=`<video src="${esc(url)}" muted playsinline></video>`; }
      else { t.innerHTML=''; t.style.backgroundImage=`url('${url}')`; }
    }
    $('#f_file').onchange = async (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const ehVideo = /^video\//.test(file.type) || isVideoUrl(file.name);
      if(ehVideo && file.size > 50*1024*1024){ erro('O vídeo tem mais de 50 MB. Comprima ou encurte (recomendado até ~30s).'); return; }
      showOverlay(ehVideo ? 'Enviando vídeo…' : 'Enviando imagem…');
      try{
        const path = `noticias/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const { error } = await comSessao(()=> OS.getClient().storage.from('banner').upload(path, file, {upsert:true, cacheControl:'3600', contentType:file.type||undefined}));
        if (error) throw error;
        imgUrl = OS.getClient().storage.from('banner').getPublicUrl(path).data.publicUrl;
        showThumb(imgUrl);
      }catch(err){ if(!err.sessao) erro('Não consegui enviar o arquivo: '+(err.message||err)); }
      finally{ hideOverlay(); }
    };

    // timestamptz do banco (UTC) → valor do input datetime-local (hora local) e vice-versa.
    const toLocalInput = (iso)=>{ if(!iso) return ''; const d=new Date(iso); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };

    function fillForm(s){
      $('#f_id').value=s?.id||''; $('#f_nome').value=s?.nome||''; $('#f_badge').value=s?.badge||''; $('#f_titulo').value=s?.titulo||'';
      $('#f_destaque').value=s?.destaque||''; $('#f_texto').value=s?.texto||''; $('#f_link').value=s?.link_url||'';
      $('#f_linklbl').value=s?.link_label||''; $('#f_expira').value=toLocalInput(s?.expira_em); imgUrl=s?.imagem_url||'';
      showThumb(imgUrl);
      const r = bg.querySelector(`input[name=cor][value="${s?.cor||'#BBB2DC'}"]`); if(r) r.checked=true;
      // Se o slide tem texto, abre a seção avançada pra mostrar os campos preenchidos.
      const adv = bg.querySelector('details.adv'); if(adv) adv.open = !!(s?.badge||s?.titulo||s?.destaque||s?.texto);
      $('#formTitle').textContent = s?.id ? 'Editar banner' : 'Novo banner';
      $('#f_save').textContent   = s?.id ? 'Salvar' : 'Publicar banner';
    }
    async function refreshList(){
      let rows=[];
      try{ const {data}=await OS.getClient().from('banner_noticias').select('*').order('ordem',{ascending:true}).order('criado_em',{ascending:false}); rows=data||[]; }catch(e){}
      const agora = Date.now();
      const fmtData = (iso)=>{ if(!iso) return ''; try{ return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } };
      // Status de cada notícia: expirada > oculta > no ar (com aviso se tem data pra sair).
      const statusOf = (r)=>{
        if (r.expira_em && new Date(r.expira_em).getTime() <= agora) return {cls:'exp',  txt:'Expirado'};
        if (!r.ativo)                                                 return {cls:'hide', txt:'Oculto'};
        if (r.expira_em)                                             return {cls:'sched',txt:'No ar · sai '+fmtData(r.expira_em)};
        return {cls:'on', txt:'No ar'};
      };
      $('#newsList').innerHTML = rows.length ? rows.map((r,i)=>{
        const st = statusOf(r);
        const fora = !r.ativo || (r.expira_em && new Date(r.expira_em).getTime() <= agora);
        const tipo = r.imagem_url ? (isVideoUrl(r.imagem_url) ? '🎬 vídeo' : '🖼 imagem') : '✍ texto';
        return `<div class="news-row ${fora?'off':''}">
        <div class="ord">
          <button data-up="${r.id}" ${i===0?'disabled':''} title="Subir">▲</button>
          <button data-down="${r.id}" ${i===rows.length-1?'disabled':''} title="Descer">▼</button>
        </div>
        <span class="sw" style="background:${esc(r.cor||'#BBB2DC')}"></span>
        <div class="nm"><b>${esc(r.nome||r.titulo||'(sem nome)')}</b><span>${tipo} · publicada ${esc(fmtData(r.criado_em))}${r.badge?' · '+esc(r.badge):''}</span></div>
        <span class="st ${st.cls}">${esc(st.txt)}</span>
        <button data-edit="${r.id}">Editar</button>
        <button data-toggle="${r.id}" data-on="${r.ativo?1:0}">${r.ativo?'Ocultar':'Mostrar'}</button>
        <button data-del="${r.id}">Excluir</button>
      </div>`; }).join('') : '<div class="hint" style="padding:6px">Nenhum banner ainda. Crie o primeiro abaixo 👇</div>';
      $('#newsList').querySelectorAll('[data-edit]').forEach(b=> b.onclick=()=>{ fillForm(rows.find(x=>x.id===b.dataset.edit)); $('.modal-body').scrollTo({top:9999,behavior:'smooth'}); });
      $('#newsList').querySelectorAll('[data-toggle]').forEach(b=> b.onclick=()=> saveRow({id:b.dataset.toggle, ativo: b.dataset.on==='0'}));
      $('#newsList').querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{ if(confirm('Excluir este banner?')) delRow(b.dataset.del); });
      $('#newsList').querySelectorAll('[data-up]').forEach(b=> b.onclick=()=> moveRow(rows, b.dataset.up, -1));
      $('#newsList').querySelectorAll('[data-down]').forEach(b=> b.onclick=()=> moveRow(rows, b.dataset.down, 1));
    }
    // Reordena a rotação: troca o banner de posição e regrava a coluna `ordem` de todos.
    async function moveRow(rows, id, dir){
      const arr = [...rows]; const i = arr.findIndex(x=>x.id===id); const j = i+dir;
      if (i<0 || j<0 || j>=arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      showOverlay('Reordenando…');
      try{
        const c = OS.getClient();
        for (let k=0;k<arr.length;k++){ if (arr[k].ordem !== k){ const {error}=await comSessao(()=> c.from('banner_noticias').update({ordem:k}).eq('id',arr[k].id)); if(error)throw error; } }
        await refreshList(); await loadBanner(); showHero();
      }catch(e){ if(!e.sessao) erro('Erro ao reordenar: '+(e.message||e)); }
      finally{ hideOverlay(); }
    }
    async function saveRow(patch){
      showOverlay('Salvando…');
      try{
        const c = OS.getClient();
        const r = await comSessao(()=> patch.id ? c.from('banner_noticias').update(patch).eq('id',patch.id)
                                                : c.from('banner_noticias').insert(patch));
        if (r.error) throw r.error;
        await refreshList(); await loadBanner(); showHero(); resetHeroTimer();
      }catch(e){ if(!e.sessao) erro('Erro ao salvar: '+(e.message||e)); }
      finally{ hideOverlay(); }
    }
    async function delRow(id){
      showOverlay('Excluindo…');
      try{ const {error}=await comSessao(()=> OS.getClient().from('banner_noticias').delete().eq('id',id)); if(error)throw error;
        await refreshList(); await loadBanner(); showHero(); resetHeroTimer(); }
      catch(e){ if(!e.sessao) erro('Erro ao excluir: '+(e.message||e)); } finally{ hideOverlay(); }
    }
    $('#f_save').onclick = async ()=>{
      erro('');
      const titulo = $('#f_titulo').value.trim();
      const nome   = $('#f_nome').value.trim();
      // Basta uma imagem OU um título — quem publica normalmente sobe só a arte pronta.
      if(!titulo && !imgUrl){ erro('Suba uma imagem ou escreva um título.'); return; }
      if(!nome){ erro('Dê um nome pra notícia (só pra vocês identificarem na lista).'); $('#f_nome').focus(); return; }
      const expiraLocal = $('#f_expira').value; // datetime-local (hora local) → ISO (UTC) ou null
      const rec = { nome, badge:$('#f_badge').value.trim()||null, titulo, destaque:$('#f_destaque').value.trim()||null,
        texto:$('#f_texto').value.trim()||null, link_url:$('#f_link').value.trim()||null,
        link_label:$('#f_linklbl').value.trim()||null, imagem_url:imgUrl||null,
        expira_em: expiraLocal ? new Date(expiraLocal).toISOString() : null,
        cor:(bg.querySelector('input[name=cor]:checked')||{}).value||'#BBB2DC', ativo:true };
      const id = $('#f_id').value;
      await saveRow(id ? {...rec, id} : rec);
      fillForm(null);
    };
    fillForm(null); refreshList();
  }


  window.InicioBannerEditor = { abrir: openBannerEditor };
})();
