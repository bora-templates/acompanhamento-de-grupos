/* ============================================================================
   Grupos · 04 as abas Resumos e Perguntar à IA, e a janela de envio ao grupo
   ----------------------------------------------------------------------------
   Chama no banco: og_resumos, og_resumo, og_resumo_texto_salvar, og_perguntas.
   Chama no servidor (og-api): resumo, enviar, perguntar.
   Período: 24h, hoje, ontem, 7d ou datas. Em "datas" a tela manda inicio e fim como aaaa-mm-dd (os dois
   dias entram por inteiro, no horário de Brasília).
   Envio: o servidor não manda duas vezes o mesmo resumo. Se ele responder ja_enviado (com enviado_em), a janela
   mostra "Este resumo já foi enviado em" mais a data e o botão passa a ser Mandar de novo. Esse botão pede a confirmação
   e só então chama enviar com reenviar: true. A tela espera até 75 segundos pela resposta do envio. Se o servidor
   responder sem_confirmacao (ou se a resposta não chegar), a tela mostra a frase de conferir o grupo e não marca
   o resumo como enviado.
   Refazer: um resumo de hoje repete o período dele; um resumo de outro dia sai de novo com as datas guardadas
   (periodo datas, inicio e fim), senão "ontem" viraria o ontem de hoje.
   ============================================================================ */
function ogResInicial() { return { estado: 'carregando', erro: '', lista: [], aberto: null, abrindo: false, erroAberto: '' }; }
function ogPedidoInicial() { return { periodo: 'hoje', de: '', ate: '', fazendo: false, erro: '' }; }
function ogEnvioInicial() {
  return {
    aberto: false, texto: '', original: '', jaEnviado: false, enviadoEm: '', confirmando: false, reenviando: false, enviando: false, salvando: false,
    erro: '', semConfirmacao: false, salvou: '',
  };
}
function ogPergInicial() {
  return { periodo: '7d', de: '', ate: '', texto: '', enviando: false, erro: '', resposta: null, estado: 'carregando', erroLista: '', lista: [], abertas: {} };
}
let OG_GEN_RES = 0, OG_GEN_PERG = 0;
const OG_MAX_ZAP = 6000;
const OG_MAX_PERGUNTA = 1000;

// o texto do WhatsApp (e a resposta da IA) em linhas e pedaços: **negrito**, *negrito*, _itálico_ e ~riscado~
function ogFormataZap(texto) {
  const re = /\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~/g;
  const palavra = /[0-9A-Za-zÀ-ÿ_]/;     // letra, número ou sublinhado: a marca não vale colada numa palavra
  return String(texto == null ? '' : texto).split('\n').map((linha) => {
    const segs = [];
    let i = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(linha))) {
      const ini = m.index, bruto = m[0], fim = ini + bruto.length;
      const antes = ini > 0 ? linha.charAt(ini - 1) : '', depois = fim < linha.length ? linha.charAt(fim) : '';
      if ((antes && palavra.test(antes)) || (depois && palavra.test(depois))) { re.lastIndex = ini + 1; continue; }
      if (ini > i) segs.push({ c: '', v: linha.slice(i, ini) });
      const dobro = bruto.startsWith('**'), marca = bruto.charAt(0);
      segs.push({ c: marca === '*' ? 'zb' : (marca === '_' ? 'zi' : 'zs'), v: bruto.slice(dobro ? 2 : 1, dobro ? -2 : -1) });
      i = fim;
    }
    if (i < linha.length) segs.push({ c: '', v: linha.slice(i) });
    return segs;
  });
}

function ogResumos() {
  return {
    res: ogResInicial(),
    pedido: ogPedidoInicial(),
    envio: ogEnvioInicial(),
    perg: ogPergInicial(),

    // ── período (o mesmo vale para o resumo e para a pergunta) ──
    validaPeriodo(p) {
      if (p.periodo !== 'datas') return '';
      if (!p.de || !p.ate) return 'Escolha a data inicial e a data final.';
      if (p.ate < p.de) return 'A data final precisa ser igual ou posterior à inicial.';
      const dias = Math.round((Date.parse(p.ate + 'T00:00:00Z') - Date.parse(p.de + 'T00:00:00Z')) / 86400000) + 1;
      if (dias > 31) return 'O período pode ter no máximo 31 dias.';
      return '';
    },
    // o servidor lê "aaaa-mm-dd" como o dia inteiro de Brasília (o fim vale até a meia-noite seguinte)
    get hojeChave() { return OG_F_CHAVE.format(new Date()); },
    // ao escolher "Escolher datas", as caixas já vêm com os últimos 7 dias
    ajustaDatas(p) {
      if (p.periodo !== 'datas') return;
      if (!p.de) p.de = OG_F_CHAVE.format(new Date(Date.now() - 6 * 86400000));
      if (!p.ate) p.ate = this.hojeChave;
    },
    inicioDatas(p) { return p.de; },
    fimDatas(p) { return p.ate; },

    // ── a lista de resumos ──
    abreResumos() { return this.carregaResumos(); },
    async carregaResumos(quieto) {
      const r = this.res, id = this.rotaId, gen = ++OG_GEN_RES;
      if (!quieto) { r.estado = 'carregando'; r.erro = ''; }
      try {
        const lista = await this.dado(OS.getClient().rpc('og_resumos', { p_grupo: id, p_limite: 20 }));
        if (gen !== OG_GEN_RES || this.rotaId !== id) return;
        r.lista = Array.isArray(lista) ? lista : [];
        r.estado = 'pronto';
      } catch (e) {
        if (gen !== OG_GEN_RES) return;
        if (!quieto || r.estado !== 'pronto') { r.estado = 'erro'; r.erro = this.textoErro(e); }
      }
    },
    normalizaResumo(linha) {
      const o = Object.assign({}, (linha && typeof linha === 'object') ? linha : {});
      const c = Object.assign({}, (o.conteudo && typeof o.conteudo === 'object') ? o.conteudo : {});
      for (const k of ['assuntos', 'combinados', 'pendencias', 'links', 'arquivos', 'participacao']) if (!Array.isArray(c[k])) c[k] = [];
      if (!c.clima || typeof c.clima !== 'object') c.clima = null;
      o.conteudo = c;
      o.numeros = (o.numeros && typeof o.numeros === 'object') ? o.numeros : {};
      o.texto_whatsapp = o.texto_whatsapp == null ? '' : String(o.texto_whatsapp);
      return o;
    },
    async abreResumo(rid) {
      const r = this.res;
      r.abrindo = true; r.erroAberto = '';
      try {
        const linha = await this.dado(OS.getClient().rpc('og_resumo', { p_resumo: rid }));
        r.aberto = this.normalizaResumo(linha);
        this.$nextTick(() => { const el = document.getElementById('og-resumo-aberto'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      } catch (e) { r.erroAberto = this.textoErro(e); }
      finally { r.abrindo = false; }
    },
    fechaResumo() { this.res.aberto = null; this.res.erroAberto = ''; },

    // ── fazer e refazer o resumo ──
    async fazResumo() {
      const p = this.pedido;
      if (p.fazendo) return;
      const msg = this.validaPeriodo(p);
      if (msg) { p.erro = msg; return; }
      p.erro = ''; p.fazendo = true;
      const id = this.rotaId;
      const corpo = { acao: 'resumo', grupo: id, periodo: p.periodo };
      if (p.periodo === 'datas') { corpo.inicio = this.inicioDatas(p); corpo.fim = this.fimDatas(p); }
      const r = await this.edge(corpo, 150000);
      p.fazendo = false;
      if (this.rotaId !== id) return;
      if (!r || r.ok !== true || !r.resumo) { p.erro = (r && r.erro) || 'Não foi possível fazer o resumo. Tente de novo.'; return; }
      this.res.aberto = this.normalizaResumo(r.resumo);
      this.avisa('O resumo está pronto.');
      this.carregaResumos(true);
      this.$nextTick(() => { const el = document.getElementById('og-resumo-aberto'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    },
    pedeRefazer() {
      const r = this.res.aberto;
      if (!r) return;
      this.pedeConfirmacao({
        titulo: 'Refazer o resumo',
        texto: 'A IA vai ler as mensagens de novo e escrever um resumo novo. O resumo atual continua guardado na lista.',
        rotuloOk: 'Refazer o resumo',
        acao: async () => {
          const id = this.rotaId;
          const corpo = { acao: 'resumo', grupo: id, periodo: r.periodo };
          // um resumo de outro dia repete as datas dele; só o de hoje repete o período (hoje, 24h, 7d, ontem)
          if (r.periodo === 'datas' || this.resumoEhDeOutroDia(r)) corpo.periodo = 'datas';
          if (corpo.periodo === 'datas') { corpo.inicio = r.inicio; corpo.fim = r.fim; }
          const resp = await this.edge(corpo, 150000);
          if (!resp || resp.ok !== true || !resp.resumo) throw new Error((resp && resp.erro) || 'Não foi possível refazer o resumo.');
          if (this.rotaId === id) { this.res.aberto = this.normalizaResumo(resp.resumo); this.carregaResumos(true); this.avisa('O resumo foi refeito.'); }
        },
      });
    },
    // o resumo foi feito em outro dia (no horário de Brasília): o período dele já não vale se for repetido pelo nome
    resumoEhDeOutroDia(r) {
      if (!r || !r.inicio || !r.fim) return false;                       // sem as datas guardadas, só resta repetir o período
      const feito = this.diaChave(r.criado_em);
      return !!feito && feito !== OG_F_CHAVE.format(new Date());
    },
    async copiaResumo() {
      const r = this.res.aberto;
      if (!r) return;
      this.avisa((await this.copiaTexto(r.texto_whatsapp)) ? 'O texto do resumo foi copiado.' : 'Não foi possível copiar. Selecione o texto e copie na mão.', 'ok');
    },

    // ── o que o resumo aberto mostra ──
    get climaInfo() {
      const c = this.res.aberto && this.res.aberto.conteudo.clima;
      if (!c) return null;
      const nivel = { tranquilo: ['Tranquilo', 'ok'], atencao: ['Atenção', 'warn'], tenso: ['Tenso', 'risk'] }[c.nivel] || [String(c.nivel || ''), ''];
      return { rotulo: nivel[0], classe: nivel[1], explicacao: String(c.explicacao || '') };
    },
    get respostaMediaTexto() {
      const n = this.res.aberto && this.res.aberto.numeros;
      if (!n || n.resposta_media_min === null || n.resposta_media_min === undefined) return 'sem resposta medida';
      return this.duracaoMin(n.resposta_media_min);
    },
    get participacaoMax() {
      const l = this.res.aberto ? this.res.aberto.conteudo.participacao : [];
      return l.reduce((m, p) => Math.max(m, Number(p.mensagens) || 0), 0) || 1;
    },
    // "dd/mm hh:mm" (sem ano) ou data completa, o que vier no resumo
    textoQuando(q) {
      if (!q) return '';
      const t = ogMs(q);
      if (t !== null && /\d{4}-\d{2}-\d{2}/.test(String(q))) return this.quando(q);
      return String(q);
    },
    // há quanto tempo o pedido esperava quando o resumo foi feito ("dd/mm hh:mm" no fuso de Brasília)
    esperaDaPendencia(p) {
      const r = this.res.aberto;
      const m = r && p && /^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(String(p.quando || '').trim());
      if (!m) return '';
      const ref = ogMs(r.criado_em) || ogMs(r.fim);
      if (ref === null) return '';
      const ano = Number(OG_F_CHAVE.format(new Date(ref)).slice(0, 4));
      const pad = (x) => String(x).padStart(2, '0');
      let t = Date.parse(ano + '-' + pad(m[2]) + '-' + pad(m[1]) + 'T' + pad(m[3]) + ':' + m[4] + ':00-03:00');
      if (isNaN(t)) return '';
      if (t > ref + 86400000) t = Date.parse((ano - 1) + '-' + pad(m[2]) + '-' + pad(m[1]) + 'T' + pad(m[3]) + ':' + m[4] + ':00-03:00');
      if (isNaN(t) || t > ref) return '';
      const dur = this.duracaoMin(Math.round((ref - t) / 60000));
      const recente = Date.now() - ref < 3 * 3600000;
      return recente ? 'esperando há ' + dur : 'esperou ' + dur + ' até o resumo';
    },
    textoPendencia(p) {
      const partes = ['Pedido por ' + (p.quem_pediu || 'alguém') + (p.quando ? ' em ' + p.quando : '')];
      if (p.para_quem) partes.push('para ' + p.para_quem);
      const espera = this.esperaDaPendencia(p);
      if (espera) partes.push(espera);
      return partes.join(', ');
    },
    get zapLinhas() { return ogFormataZap(this.envio.texto); },
    formataTexto(texto) { return ogFormataZap(texto); },

    // ── mandar para o grupo ──
    abreEnvio() {
      const r = this.res.aberto;
      if (!r) return;
      this.envio = Object.assign(ogEnvioInicial(), {
        aberto: true, texto: r.texto_whatsapp, original: r.texto_whatsapp,
        jaEnviado: !!r.enviado_em, enviadoEm: r.enviado_em ? String(r.enviado_em) : '',
      });
    },
    fechaEnvio() { if (this.envio.enviando || this.envio.salvando) return; this.envio.aberto = false; },
    get envioMudou() { return this.envio.texto !== this.envio.original; },
    get envioFalha() {
      const t = String(this.envio.texto || '');
      if (!t.trim()) return 'O texto está vazio.';
      if (t.length > OG_MAX_ZAP) return 'O texto passou de ' + this.numero(OG_MAX_ZAP) + ' caracteres. Encurte antes de enviar.';
      return '';
    },
    async salvaTextoEnvio() {
      const e = this.envio, r = this.res.aberto;
      if (!r || e.salvando || this.envioFalha) return;
      e.erro = ''; e.salvou = ''; e.salvando = true;
      try {
        await this.dado(OS.getClient().rpc('og_resumo_texto_salvar', { p_resumo: r.id, p_texto: e.texto }));
        r.texto_whatsapp = e.texto; e.original = e.texto; e.salvou = 'O texto foi salvo.';
      } catch (err) { e.erro = this.textoErro(err); }
      finally { e.salvando = false; }
    },
    // se o resumo já foi enviado, a confirmação é a do reenvio (a segunda mensagem no grupo)
    pedeConfirmaEnvio() {
      if (this.envioFalha) { this.envio.erro = this.envioFalha; return; }
      this.envio.erro = ''; this.envio.reenviando = this.envio.jaEnviado; this.envio.confirmando = true;
    },
    async enviaAgora() {
      const e = this.envio, r = this.res.aberto;
      if (!r || e.enviando || this.envioFalha) return;
      e.erro = ''; e.semConfirmacao = false; e.enviando = true;
      const corpo = { acao: 'enviar', resumo: r.id };
      if (this.envioMudou) corpo.texto = e.texto;
      if (e.reenviando) corpo.reenviar = true;       // a pessoa já viu o aviso e confirmou Mandar de novo
      const resp = await this.edge(corpo, 75000);
      e.enviando = false;
      // o WhatsApp não confirmou o envio, ou a resposta do servidor não chegou: a mensagem pode ter saído.
      // O resumo não é marcado como enviado, e a pessoa confere o grupo antes de mandar de novo.
      if (resp && (resp.sem_confirmacao === true || (resp.sem_resposta === true && resp.ok !== true))) {
        e.confirmando = false; e.reenviando = false; e.semConfirmacao = true;
        e.erro = (resp.sem_confirmacao === true && resp.erro) ? String(resp.erro)
          : (resp.sem_confirmacao === true ? 'O WhatsApp não confirmou o envio. Confira o grupo antes de mandar de novo.'
            : 'Não recebi a resposta do servidor e não sei se o resumo foi enviado. Confira o grupo antes de mandar de novo.');
        return;
      }
      // o resumo já tinha ido (talvez por outra pessoa): nada foi enviado agora, e a janela passa a oferecer Mandar de novo
      if (resp && resp.ja_enviado === true) {
        e.confirmando = false; e.reenviando = false; e.jaEnviado = true;
        e.enviadoEm = String(resp.enviado_em || e.enviadoEm || r.enviado_em || '');
        if (e.enviadoEm) r.enviado_em = e.enviadoEm;
        if (corpo.reenviar) e.erro = 'O servidor não aceitou mandar de novo. Tente outra vez em instantes.';
        this.carregaResumos(true);
        return;
      }
      if (!resp || resp.ok !== true) { e.confirmando = false; e.reenviando = false; e.erro = (resp && resp.erro) || 'Não foi possível enviar o resumo ao grupo.'; return; }
      r.enviado_em = resp.enviado_em || new Date().toISOString();
      r.enviado_texto = e.texto;
      e.aberto = false;
      this.avisa(corpo.reenviar ? 'O resumo foi enviado de novo ao grupo.' : 'O resumo foi enviado ao grupo.');
      this.carregaResumos(true);
    },

    // ── perguntar à IA ──
    get sugestoesPergunta() {
      return ['Quem pediu material nos últimos dias?', 'Tem alguma reclamação sem resposta?', 'O que combinamos sobre a data do encontro?', 'Quais pedidos o time ainda não respondeu?'];
    },
    abrePerguntar() { return this.carregaPerguntas(); },
    async carregaPerguntas(quieto) {
      const p = this.perg, id = this.rotaId, gen = ++OG_GEN_PERG;
      if (!quieto) { p.estado = 'carregando'; p.erroLista = ''; }
      try {
        const lista = await this.dado(OS.getClient().rpc('og_perguntas', { p_grupo: id, p_limite: 30 }));
        if (gen !== OG_GEN_PERG || this.rotaId !== id) return;
        p.lista = Array.isArray(lista) ? lista : [];
        p.estado = 'pronto';
      } catch (e) {
        if (gen !== OG_GEN_PERG) return;
        if (!quieto || p.estado !== 'pronto') { p.estado = 'erro'; p.erroLista = this.textoErro(e); }
      }
    },
    usaSugestao(t) { this.perg.texto = t; },
    async perguntar() {
      const p = this.perg;
      if (p.enviando) return;
      const texto = String(p.texto || '').trim();
      if (!texto) { p.erro = 'Escreva a pergunta antes de enviar.'; return; }
      if (texto.length > OG_MAX_PERGUNTA) { p.erro = 'A pergunta pode ter no máximo ' + this.numero(OG_MAX_PERGUNTA) + ' caracteres.'; return; }
      const msg = this.validaPeriodo(p);
      if (msg) { p.erro = msg; return; }
      p.erro = ''; p.enviando = true; p.resposta = null;
      const id = this.rotaId;
      const corpo = { acao: 'perguntar', grupo: id, pergunta: texto, periodo: p.periodo };
      if (p.periodo === 'datas') { corpo.inicio = this.inicioDatas(p); corpo.fim = this.fimDatas(p); }
      const r = await this.edge(corpo, 150000);
      p.enviando = false;
      if (this.rotaId !== id) return;
      if (!r || r.ok !== true) { p.erro = (r && r.erro) || 'Não foi possível responder agora. Tente de novo.'; return; }
      p.resposta = { pergunta: texto, resposta: String(r.resposta || ''), id: r.pergunta_id };
      p.texto = '';
      this.carregaPerguntas(true);
    },
    alternaPergunta(id) { this.perg.abertas[id] = !this.perg.abertas[id]; },
    repetePergunta(item) {
      this.perg.texto = String(item.pergunta || '');
      this.perg.resposta = null;
      this.$nextTick(() => { const el = document.getElementById('og-pergunta-texto'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } });
    },
  };
}
