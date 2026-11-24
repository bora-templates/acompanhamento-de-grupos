/* ============================================================================
   Grupos · 03 o grupo aberto e a aba Conversa
   ----------------------------------------------------------------------------
   Chama no banco: gr_grupo, gr_mensagens, gr_autores.
   Chama no servidor (gr-api): reimportar (tentar de novo a importação das mensagens antigas que falhou).
   Páginas da conversa: "Ver mensagens anteriores" manda p_antes e p_antes_id (o momento e o id da mensagem mais
   antiga que está na tela), para mensagens com o mesmo momento não ficarem de fora.
   Tempo real: na aba Conversa a tela assina INSERT em hub.gr_mensagens com o filtro grupo_id=eq.<id>
   (e, num canal à parte, UPDATE, para a transcrição que chega depois). A mensagem nova entra no lugar
   certo, com um destaque discreto, e a assinatura é desfeita ao trocar de aba, de grupo ou sair da tela.
   Mensagem antiga que chega de uma vez (importação dos últimos 7 dias) não entra uma a uma: a tela
   lê a primeira página de novo e mescla.
   ============================================================================ */
function grConvInicial() {
  return {
    estado: 'carregando', erro: '', itens: [], temMais: false, carregandoMais: false, busca: '', autor: '', autores: [], vivo: 'conectando', novasFora: 0,
    fila: [],                                   // mensagens ao vivo que chegaram enquanto a primeira página era lida
    reimportando: false, erroReimporta: '',
  };
}
let GR_CANAL = null, GR_CANAL_TRANSC = null, GR_SEQ_CANAL = 0;   // os canais de tempo real (fora do estado reativo)
let GR_GEN_GRUPO = 0, GR_GEN_CONV = 0;
let GR_TIMER_BUSCA = null, GR_TIMER_CABECA = null, GR_TIMER_TRANSC = null, GR_TENTATIVAS_TRANSC = 0;
const GR_PAGINA = 50;

// parte um texto em pedaços que a tela desenha com segurança: texto comum, termo achado e link
function grMarca(trecho, termos) {
  if (!trecho) return [];
  if (!termos || !termos.length) return [{ t: 'txt', v: trecho }];
  const re = new RegExp('(' + termos.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  const out = [];
  let i = 0, m;
  while ((m = re.exec(trecho))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    if (m.index > i) out.push({ t: 'txt', v: trecho.slice(i, m.index) });
    out.push({ t: 'mark', v: m[0] });
    i = m.index + m[0].length;
  }
  if (i < trecho.length) out.push({ t: 'txt', v: trecho.slice(i) });
  return out;
}
function grSegmenta(texto, termos) {
  const s = String(texto == null ? '' : texto);
  let out = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let i = 0, m;
  while ((m = re.exec(s))) {
    let url = m[0];
    const fim = url.match(/[).,;:!?]+$/);
    if (fim) url = url.slice(0, url.length - fim[0].length);
    if (m.index > i) out = out.concat(grMarca(s.slice(i, m.index), termos));
    out.push({ t: 'link', v: url });
    i = m.index + url.length;
    re.lastIndex = i;
  }
  if (i < s.length) out = out.concat(grMarca(s.slice(i), termos));
  return out;
}

function grGrupo() {
  return {
    grupo: null,
    conv: grConvInicial(),

    // ── abrir o grupo ──
    normalizaGrupo(g) {
      const o = (g && typeof g === 'object') ? g : {};
      return Object.assign({
        id: this.rotaId || '', nome: '', jid: '', pessoas: 0, ativo: true, exemplo: false, orientacoes: '',
        resumo_auto: false, resumo_hora: 20, resumo_envia: false, ultima_mensagem_em: null,
        mensagens_total: 0, materiais_total: 0, participantes_total: 0, importando: false, importadas: 0, importacao_erro: null,
      }, o);
    },
    resetaGrupo() {
      this.conv = grConvInicial();
      this.res = grResInicial(); GR_GEN_HORA++; this.porHora = grHoraInicial(); this.pedido = grPedidoInicial(); this.envio = grEnvioInicial(); this.perg = grPergInicial();
      this.ori = grOriInicial(); this.mat = grMatInicial(); this.part = grPartInicial(); this.ag = grAgInicial();
    },
    async abreGrupo(id, aba) {
      if (!this.grupo || this.grupo.id !== id) {
        this.resetaGrupo();
        this.grupo = null;
        this.carga.grupo = 'carregando'; this.cargaErro.grupo = '';
        const gen = ++GR_GEN_GRUPO;
        try {
          const g = await this.dado(OS.getClient().rpc('gr_grupo', { p_grupo: id }));
          if (gen !== GR_GEN_GRUPO || this.rotaId !== id) return;
          this.grupo = this.normalizaGrupo(g);
          this.carga.grupo = 'pronto';
          this.agendaVigia();
        } catch (e) {
          if (gen !== GR_GEN_GRUPO) return;
          this.carga.grupo = 'erro'; this.cargaErro.grupo = this.textoErro(e);
          return;
        }
      }
      // a aba "Ajustes do grupo" é de quem edita o grupo ou administra o sistema: quem não pode volta para a conversa
      if (aba === 'ajustes' && !(this.podeAdministrar || this.podeConfigurar)) {
        this.aba = 'conversa';
        history.replaceState(null, '', location.pathname + location.search + '#grupo/' + id + '/conversa');
      }
      this.abreAba(this.aba);
    },
    async atualizaGrupoQuieto() {
      const id = this.rotaId;
      if (!this.grupo || this.grupo.id !== id) return;
      try {
        const g = await this.dado(OS.getClient().rpc('gr_grupo', { p_grupo: id }));
        if (this.rotaId !== id || !this.grupo) return;
        Object.assign(this.grupo, this.normalizaGrupo(g));
      } catch (e) { /* a próxima rodada tenta de novo */ }
    },
    // junta no grupo aberto o que uma gravação devolveu (gr_grupo_salvar devolve o grupo)
    aplicaGrupo(g) {
      if (!g || typeof g !== 'object' || !this.grupo) return;
      Object.assign(this.grupo, g);
      this.carregaPainel(true);
    },

    // a linha de números embaixo do nome do grupo
    get linhaGrupo() {
      const g = this.grupo;
      if (!g) return '';
      const partes = [
        this.numero(g.pessoas) + ' ' + this.plural(g.pessoas, 'pessoa', 'pessoas'),
        this.numero(g.mensagens_total) + ' ' + this.plural(g.mensagens_total, 'mensagem guardada', 'mensagens guardadas'),
        this.numero(g.materiais_total) + ' ' + this.plural(g.materiais_total, 'material de apoio', 'materiais de apoio'),
        g.ultima_mensagem_em ? 'última mensagem ' + this.relativo(g.ultima_mensagem_em) : 'ainda sem mensagens',
      ];
      return partes.join(' · ');
    },

    // ── abas ──
    get abasGrupo() {
      const todas = [
        { chave: 'conversa', rotulo: 'Conversa' }, { chave: 'resumos', rotulo: 'Resumos' },
        { chave: 'perguntar', rotulo: 'Perguntar à IA' }, { chave: 'materiais', rotulo: 'Orientações e materiais' },
        { chave: 'participantes', rotulo: 'Participantes' }, { chave: 'ajustes', rotulo: 'Ajustes do grupo' },
      ];
      return todas.filter((a) => a.chave !== 'ajustes' || this.podeAdministrar || this.podeConfigurar);
    },
    vaiAba(chave) { if (this.grupo) this.vai('#grupo/' + this.grupo.id + '/' + chave); },
    abreAba(aba) {
      if (aba === 'conversa') this.abreConversa();
      else if (aba === 'resumos') this.abreResumos();
      else if (aba === 'perguntar') this.abrePerguntar();
      else if (aba === 'materiais') this.abreMateriais();
      else if (aba === 'participantes') this.abreParticipantes();
      else if (aba === 'ajustes') this.abreAjustesGrupo();
    },

    // ── a importação das mensagens antigas que falhou ──
    get importacaoFalhou() { const g = this.grupo; return !!(g && g.importacao_erro && !g.importando); },
    // a frase da solução que explica onde a importação parou (o servidor nunca manda o texto que a uazapi devolveu)
    get importacaoMotivo() {
      const g = this.grupo;
      return (g && typeof g.importacao_erro === 'string') ? g.importacao_erro.trim().slice(0, 400) : '';
    },
    async reimporta() {
      const g = this.grupo, c = this.conv;
      if (!g || c.reimportando || !this.podeAdministrar) return;
      const id = g.id;
      c.reimportando = true; c.erroReimporta = '';
      const r = await this.edge({ acao: 'reimportar', grupo: id }, 60000);
      c.reimportando = false;
      if (this.rotaId !== id || !this.grupo) return;
      if (!r || r.ok !== true) { c.erroReimporta = (r && r.erro) || 'Não foi possível tentar de novo agora.'; return; }
      // volta ao selo de importação e a tela passa a acompanhar até as mensagens chegarem
      this.grupo.importando = true; this.grupo.importacao_erro = null;
      this.iniciaVigia(3);
      this.carregaPainel(true);
    },

    // ── a conversa ──
    async abreConversa() {
      GR_TENTATIVAS_TRANSC = 0;
      this.assinaConversa(this.rotaId);
      // os autores vêm antes: é com o nome deles que a menção ("@123...") vira "@Nome" na conversa
      await this.carregaAutores();
      await this.carregaMensagens(true);
    },
    termosBusca() {
      return String(this.conv.busca || '').split(/\s+/).map((t) => t.replace(/^[-"]+|"+$/g, '')).filter((t) => t.length >= 2).slice(0, 6);
    },
    // o WhatsApp grava a menção como "@" e o identificador da pessoa; a tela mostra o nome de quem já escreveu no grupo
    comMencoes(texto) {
      const autores = this.conv.autores || [];
      if (!autores.length || texto.indexOf('@') < 0) return texto;
      return texto.replace(/(^|[^\p{L}\p{N}@._-])@(\d{6,20})(?!\d)/gu, (tudo, antes, id) => {
        const a = autores.find((x) => String(x.autor_jid || '').split('@')[0].split(':')[0] === id);
        const nome = a ? String(a.autor_nome || '').trim() : '';
        return nome && nome !== a.autor_jid ? antes + '@' + nome : tudo;
      });
    },
    normalizaMensagem(m) {
      const o = Object.assign({}, m);
      o.tipo = m.tipo || 'texto';
      o.texto = this.comMencoes(m.texto == null ? '' : String(m.texto));
      if (o.citada && o.citada.texto) o.citada = Object.assign({}, o.citada, { texto: this.comMencoes(String(o.citada.texto)) });
      o.momentoMs = grMs(m.momento) || 0;
      o.partes = grSegmenta(o.texto, this.termosBusca());
      o.nova = false;
      return o;
    },
    async carregaMensagens(recomeca) {
      const c = this.conv, id = this.rotaId, gen = ++GR_GEN_CONV;
      if (recomeca) { c.estado = 'carregando'; c.erro = ''; c.itens = []; c.temMais = false; c.novasFora = 0; c.fila = []; GR_TENTATIVAS_TRANSC = 0; }
      else { if (c.carregandoMais) return; c.carregandoMais = true; }
      // a próxima página começa depois da mensagem mais antiga da tela: o momento e o id dela (o id desempata mensagens do mesmo momento)
      const ultima = (recomeca || !c.itens.length) ? null : c.itens[c.itens.length - 1];
      const antes = ultima ? ultima.momento : null;
      const antesId = ultima ? ultima.id : null;
      const busca = c.busca.trim() || null;
      const autor = c.autor || null;
      try {
        const lista = await this.dado(OS.getClient().rpc('gr_mensagens', { p_grupo: id, p_antes: antes, p_antes_id: antesId, p_busca: busca, p_autor: autor, p_limite: 50 }));
        if (gen !== GR_GEN_CONV || this.rotaId !== id) return;
        const novas = (Array.isArray(lista) ? lista : []).map((m) => this.normalizaMensagem(m));
        c.itens = recomeca ? novas : c.itens.concat(novas);
        c.temMais = novas.length >= GR_PAGINA;
        c.estado = 'pronto';
        if (recomeca) this.escoaFila();
        this.vigiaPendentes();
      } catch (e) {
        if (gen !== GR_GEN_CONV) return;
        if (recomeca) { c.estado = 'erro'; c.erro = this.textoErro(e); }
        else { this.erro = this.textoErro(e); }
      } finally {
        if (gen === GR_GEN_CONV) c.carregandoMais = false;
      }
    },
    async carregaAutores() {
      const id = this.rotaId;
      try {
        const lista = await this.dado(OS.getClient().rpc('gr_autores', { p_grupo: id }));
        if (this.rotaId !== id) return;
        this.conv.autores = (Array.isArray(lista) ? lista : []).filter((a) => a && a.autor_jid);
      } catch (e) { this.conv.autores = []; }
    },
    get conversaLinhas() {
      const linhas = [];
      let ultimo = '';
      for (const m of this.conv.itens) {
        const dia = this.diaChave(m.momento);
        if (dia !== ultimo) { linhas.push({ k: 'd' + dia, dia: true, rotulo: this.diaRotulo(m.momento) }); ultimo = dia; }
        linhas.push({ k: 'm' + m.id, dia: false, m: m });
      }
      return linhas;
    },
    get conversaFiltrada() { return !!(this.conv.busca.trim() || this.conv.autor); },
    digitouBusca() { clearTimeout(GR_TIMER_BUSCA); GR_TIMER_BUSCA = setTimeout(() => this.carregaMensagens(true), 400); },
    buscaAgora() { clearTimeout(GR_TIMER_BUSCA); this.carregaMensagens(true); },
    mudouAutor() { this.carregaMensagens(true); },
    limpaFiltros() { this.conv.busca = ''; this.conv.autor = ''; this.carregaMensagens(true); },

    // ── tempo real ──
    assinaConversa(id) {
      this.fechaConversa();
      this.conv.vivo = 'conectando';
      if (!GR_UUID.test(String(id || ''))) return;
      const sb = OS.getClient(), seq = ++GR_SEQ_CANAL;
      try {
        const canal = sb.channel('gr-conversa-' + id + '-' + seq);
        GR_CANAL = canal;
        canal
          .on('postgres_changes', { event: 'INSERT', schema: 'hub', table: 'gr_mensagens', filter: 'grupo_id=eq.' + id }, (p) => this.chegouMensagem(p && p.new, id))
          .subscribe((estado) => {
            if (GR_CANAL !== canal) return;
            this.conv.vivo = estado === 'SUBSCRIBED' ? 'ligado' : (estado === 'CLOSED' ? 'desligado' : 'erro');
          });
      } catch (e) { this.conv.vivo = 'erro'; }
      // a transcrição que chega depois é um UPDATE: vai num canal à parte, para uma falha dele não derrubar as mensagens novas
      try {
        const canal2 = sb.channel('gr-transcricao-' + id + '-' + seq);
        GR_CANAL_TRANSC = canal2;
        canal2
          .on('postgres_changes', { event: 'UPDATE', schema: 'hub', table: 'gr_mensagens', filter: 'grupo_id=eq.' + id }, (p) => this.mudouMensagem(p && p.new, id))
          .subscribe();
      } catch (e) { /* sem o aviso da transcrição, a tela confere a cada 12 segundos */ }
    },
    fechaConversa() {
      const canais = [GR_CANAL, GR_CANAL_TRANSC];
      GR_CANAL = null; GR_CANAL_TRANSC = null;
      clearTimeout(GR_TIMER_BUSCA); clearTimeout(GR_TIMER_CABECA); clearTimeout(GR_TIMER_TRANSC);
      for (const canal of canais) {
        if (!canal) continue;
        try { const p = OS.getClient().removeChannel(canal); if (p && p.catch) p.catch(() => {}); } catch (e) { /* já estava fechado */ }
      }
    },
    chegouMensagem(row, id) {
      if (!row || this.rota !== 'grupo' || this.aba !== 'conversa' || this.rotaId !== id) return;
      const c = this.conv;
      if (c.itens.some((x) => String(x.id) === String(row.id))) return;
      // a primeira página ainda está sendo lida: a leitura pode ter sido tirada antes desta mensagem, então ela espera
      // na fila e entra depois que a página chegar (sem repetir a que a página já trouxe)
      if (c.estado === 'carregando' && !c.busca.trim() && !c.autor) {
        if (!c.fila.some((x) => String(x.id) === String(row.id))) c.fila.push(row);
        return;
      }
      if (this.grupo) {
        this.grupo.mensagens_total = Number(this.grupo.mensagens_total || 0) + 1;
        if (!this.grupo.ultima_mensagem_em || (grMs(row.momento) || 0) > (grMs(this.grupo.ultima_mensagem_em) || 0)) this.grupo.ultima_mensagem_em = row.momento;
      }
      if (c.busca.trim() || c.autor) { c.novasFora++; return; }
      const ms = grMs(row.momento);
      if (ms !== null && Date.now() - ms > 10 * 60 * 1000) { this.pedeAtualizaCabeca(); return; }   // veio da importação
      const m = this.normalizaMensagem(Object.assign({}, row, { citada: this.acharCitada(row.citada_id) }));
      m.nova = true;
      this.insereOrdenada(m);
      setTimeout(() => { const alvo = c.itens.find((x) => String(x.id) === String(m.id)); if (alvo) alvo.nova = false; }, 6500);
      if (m.tipo === 'audio' && m.transcricao === 'pendente') { GR_TENTATIVAS_TRANSC = 0; this.vigiaPendentes(); }
    },
    // depois da primeira página: entram as mensagens ao vivo que chegaram durante a leitura (as que a página já trouxe são ignoradas)
    escoaFila() {
      const c = this.conv, id = this.rotaId, fila = c.fila;
      c.fila = [];
      for (const row of fila) this.chegouMensagem(row, id);
    },
    mudouMensagem(row, id) {
      if (!row || this.rotaId !== id) return;
      const alvo = this.conv.itens.find((x) => String(x.id) === String(row.id));
      if (!alvo) return;
      alvo.transcricao = row.transcricao;
      alvo.texto = row.texto == null ? '' : String(row.texto);
      alvo.arquivo_nome = row.arquivo_nome;
      alvo.partes = grSegmenta(alvo.texto, this.termosBusca());
    },
    acharCitada(whatsappId) {
      if (!whatsappId) return null;
      const q = this.conv.itens.find((x) => x.whatsapp_id === whatsappId);
      return q ? { autor_nome: q.autor_nome, texto: q.texto } : null;
    },
    insereOrdenada(m) {
      const itens = this.conv.itens;
      let i = 0;
      while (i < itens.length && (itens[i].momentoMs > m.momentoMs || (itens[i].momentoMs === m.momentoMs && Number(itens[i].id) > Number(m.id)))) i++;
      itens.splice(i, 0, m);
    },
    // várias mensagens antigas chegando juntas: espera a rajada passar e lê a primeira página
    pedeAtualizaCabeca() { clearTimeout(GR_TIMER_CABECA); GR_TIMER_CABECA = setTimeout(() => this.atualizaCabeca(), 1800); },
    async atualizaCabeca() {
      const c = this.conv, id = this.rotaId;
      if (this.rota !== 'grupo' || this.aba !== 'conversa' || c.estado !== 'pronto' || c.busca.trim() || c.autor) return;
      try {
        const lista = await this.dado(OS.getClient().rpc('gr_mensagens', { p_grupo: id, p_antes: null, p_antes_id: null, p_busca: null, p_autor: null, p_limite: 50 }));
        if (this.rotaId !== id || this.aba !== 'conversa') return;
        this.mesclaMensagens(Array.isArray(lista) ? lista : []);
      } catch (e) { /* a próxima rodada tenta de novo */ }
    },
    mesclaMensagens(lista) {
      const c = this.conv;
      const mapa = new Map(c.itens.map((m) => [String(m.id), m]));
      let mudou = false;
      for (const raw of lista) {
        const k = String(raw.id), atual = mapa.get(k);
        if (!atual || atual.transcricao !== raw.transcricao || atual.texto !== (raw.texto == null ? '' : String(raw.texto))) {
          mapa.set(k, this.normalizaMensagem(raw)); mudou = true;
        }
      }
      if (!mudou) return;
      c.itens = Array.from(mapa.values()).sort((a, b) => (b.momentoMs - a.momentoMs) || (Number(b.id) - Number(a.id)));
      if (lista.length >= GR_PAGINA) c.temMais = true;
    },
    // áudio ainda sendo transcrito: se o tempo real não avisar, a tela confere a cada 12 segundos (até 8 vezes)
    vigiaPendentes() {
      clearTimeout(GR_TIMER_TRANSC);
      const tem = this.conv.itens.some((m) => m.tipo === 'audio' && m.transcricao === 'pendente');
      if (!tem || GR_TENTATIVAS_TRANSC >= 8) return;
      GR_TIMER_TRANSC = setTimeout(async () => { GR_TENTATIVAS_TRANSC++; await this.atualizaCabeca(); this.vigiaPendentes(); }, 12000);
    },

    // ── como cada mensagem aparece ──
    rotuloTipo(tipo) {
      return { texto: 'Texto', audio: 'Áudio', imagem: 'Imagem', video: 'Vídeo', documento: 'Documento', figurinha: 'Figurinha', outro: 'Outro tipo de mensagem' }[tipo] || 'Mensagem';
    },
    // o desenho (traço de 24 por 24) de cada tipo
    icone(tipo) {
      return {
        audio: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
        imagem: 'M4 5h16v14H4zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 17l5-5 4 4 3-3 4 4',
        video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
        documento: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
        figurinha: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2',
        outro: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01',
      }[tipo] || 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01';
    },
    // o aviso do estado da transcrição de um áudio ('feita' mostra o texto e não precisa de aviso)
    avisoTranscricao(m) {
      return {
        pendente: 'Transcrevendo o áudio.',
        falhou: 'Não foi possível transcrever este áudio.',
        sem_servico: 'Este áudio ficou sem transcrição porque o serviço de transcrição não está ligado.',
        nao_transcrito: 'Áudio sem transcrição',
      }[m.transcricao] || '';
    },
  };
}
