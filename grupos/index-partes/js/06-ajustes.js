/* ============================================================================
   Grupos · 06 os Ajustes: WhatsApp (QR), IA, transcrição de áudio e grupo de exemplo
   ----------------------------------------------------------------------------
   Só quem configura (pode_configurar) abre esta tela. Tudo passa pelo servidor (gr-api):
     whatsapp_salvar, whatsapp_estado, ajustes_ia, testar_ia, ajustes_transcricao.
   Token e chave:
     . ficam em campo de senha e nunca são preenchidos de volta: depois de salvos, a tela mostra só
       "salvo" e o botão de trocar;
     . saem da memória da tela assim que o servidor confirma a gravação;
     . trocar o endereço do servidor da uazapi exige o token da instância nova, e trocar o provedor da IA (ou o
       endereço da API do provedor compatível) exige a chave. A tela abre o campo na hora, não deixa salvar sem ele
       e põe o cursor nele. Se o servidor responder precisa_token ou precisa_chave, mostra o erro, abre o campo e
       põe o cursor nele do mesmo jeito.
   O QR do WhatsApp é atualizado a cada 20 segundos enquanto a seção WhatsApp está aberta e a
   instância aguarda a leitura. Se o número já estiver conectado, a tela mostra o número e o botão
   Escolher grupos, sem passar pelo QR.
   ============================================================================ */
// o endereço como a tela o compara: protocolo, servidor e caminho, sem barra no fim
function grEnderecoChave(url) {
  const s = String(url == null ? '' : url).trim();
  if (!s) return '';
  try { const u = new URL(s); return (u.protocol + '//' + u.host + u.pathname).replace(/\/+$/, ''); }
  catch (e) { return s.replace(/\/+$/, ''); }
}
function grWaInicial() {
  return {
    servidor: '', token: '', trocandoToken: false, tokenExigido: false, salvando: false, erro: '', ok: '',
    precisaConfirmar: false, webhookAtual: '', avisoTroca: '',
    estado: 'desligado', numero: '', qr: '', consultando: false, restante: 20, erroEstado: '',
  };
}
function grIaInicial() {
  return { provedor: 'openai', modelo: '', url: '', urlSalva: '', chave: '', trocandoChave: false, chaveExigida: false, salvando: false, testando: false, erro: '', ok: '', teste: '' };
}
function grTrInicial() {
  return { provedor: 'groq', chave: '', trocandoChave: false, usarChaveIa: false, salvando: false, erro: '', ok: '' };
}
let GR_TIMER_QR = null;
const GR_QR_SEGUNDOS = 20;
const GR_MODELOS = {
  openai: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'],
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5'],
  deepseek: ['deepseek-v4-flash'],
  compativel: [],
};

function grAjustes() {
  return {
    wa: grWaInicial(),
    ia: grIaInicial(),
    tr: grTrInicial(),

    abreAjustes(secao, entrou) {
      if (!this.podeConfigurar) return;
      if (entrou) this.preencheAjustes();
      if (secao === 'whatsapp') this.iniciaWhatsapp();
    },
    // as caixas começam com o que já está salvo (menos token e chave, que a tela nunca recebe)
    preencheAjustes() {
      const a = this.ajustes;
      this.wa = Object.assign(grWaInicial(), { servidor: String(a.whatsapp_servidor || ''), estado: a.whatsapp_estado || 'desligado', numero: a.whatsapp_numero || '' });
      this.ia = Object.assign(grIaInicial(), { provedor: a.ia_provedor || 'openai', modelo: a.ia_modelo || '', url: String(a.ia_url || ''), urlSalva: String(a.ia_url || '') });
      this.tr = Object.assign(grTrInicial(), { provedor: a.transcricao_provedor || 'groq' });
    },
    get secoesAjustes() {
      const a = this.ajustes;
      return [
        { chave: 'whatsapp', rotulo: 'WhatsApp', ok: a.whatsapp_estado === 'conectado' },
        { chave: 'ia', rotulo: 'IA', ok: !!a.ia_configurada },
        { chave: 'transcricao', rotulo: 'Transcrição de áudio', ok: !!a.transcricao_configurada },
        { chave: 'exemplo', rotulo: 'Grupo de exemplo', ok: this.temExemplo },
      ];
    },
    juntaAjustes(novos) {
      if (novos && typeof novos === 'object' && this.painel) this.painel.ajustes = Object.assign({}, this.painel.ajustes, novos);
    },

    // ── WhatsApp ──
    get waRotulo() {
      const w = this.wa;
      if (w.estado === 'conectado') return { texto: 'Conectado', classe: 'ok' };
      if (w.estado === 'aguardando_qr') return { texto: 'Aguardando a leitura do QR', classe: 'warn' };
      if (w.estado === 'erro') return { texto: 'Com erro', classe: 'risk' };
      return { texto: 'Desligado', classe: '' };
    },
    // o servidor digitado é outro que o salvo: o token salvo não vale mais e o da instância nova é obrigatório
    get waServidorMudou() {
      if (!this.ajustes.whatsapp_configurado) return false;       // sem conexão salva, o token já é obrigatório de qualquer jeito
      const digitado = grEnderecoChave(this.wa.servidor);
      return !!digitado && digitado !== grEnderecoChave(this.ajustes.whatsapp_servidor);
    },
    get waPedeToken() { return !this.ajustes.whatsapp_configurado || this.wa.trocandoToken || this.waServidorMudou; },
    get waMotivoToken() {
      return this.waServidorMudou ? 'Você mudou o endereço do servidor, então o token salvo não vale mais. Informe o token da instância que está neste servidor.' : '';
    },
    confereServidor(s) {
      if (!s) return 'Informe o endereço do servidor da uazapi.';
      let u;
      try { u = new URL(s); } catch (e) { return 'O endereço do servidor não parece válido. Use o formato https://seu-servidor.exemplo.com.'; }
      if (u.protocol !== 'https:') return 'O endereço do servidor precisa começar com https://.';
      if (u.username || u.password) return 'Não coloque usuário nem senha no endereço. O token tem campo próprio.';
      return '';
    },
    // mostra só o servidor e o caminho do endereço atual do webhook, sem parâmetros (podem trazer chave de outro sistema)
    hostDoEndereco(url) {
      try { const u = new URL(String(url)); return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : ''); } catch (e) { return ''; }
    },
    // só imagem em base64 vira QR na tela
    qrSeguro(qr) {
      const q = String(qr || '').trim();
      if (/^data:image\/(png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$/.test(q)) return q;
      if (/^[A-Za-z0-9+/=]{200,}$/.test(q)) return 'data:image/png;base64,' + q;
      return '';
    },
    aplicaEstadoWhatsapp(r) {
      const w = this.wa;
      const estado = ['conectado', 'aguardando_qr', 'erro', 'desligado'].includes(r.estado) ? r.estado : (r.estado ? 'erro' : w.estado);
      w.estado = estado;
      w.numero = r.numero ? String(r.numero) : (estado === 'conectado' ? w.numero : '');
      w.qr = estado === 'aguardando_qr' ? this.qrSeguro(r.qr) : '';
      w.restante = GR_QR_SEGUNDOS;
      // se o erro continua e o servidor não mandou o texto de novo, vale o último texto conhecido
      this.juntaAjustes({ whatsapp_estado: estado, whatsapp_numero: w.numero || null, whatsapp_erro: estado === 'erro' ? (r.erro || this.ajustes.whatsapp_erro || null) : null });
      if (estado === 'aguardando_qr') this.iniciaQr(); else this.paraQr();
    },
    iniciaWhatsapp() {
      // abriu a seção: se já existe conexão salva, confere o estado de verdade (e pega o QR, se faltar)
      if (this.ajustes.whatsapp_configurado) this.atualizaWhatsapp(true);
      if (this.wa.estado === 'aguardando_qr') this.iniciaQr();
    },
    async salvaWhatsapp(confirmou) {
      const w = this.wa;
      if (w.salvando) return;
      const servidor = String(w.servidor || '').trim();
      const falha = this.confereServidor(servidor);
      if (falha) { w.erro = falha; this.focaCampo('gr-wa-servidor'); return; }
      const token = String(w.token || '').trim();
      // com o campo do token à vista (sem conexão salva, servidor novo ou troca do token), ele precisa estar preenchido
      if (!token && this.waPedeToken) {
        w.erro = this.waServidorMudou ? 'Você mudou o endereço do servidor, então informe também o token da instância neste servidor.'
          : (this.ajustes.whatsapp_configurado ? 'Cole o token novo ou use o botão Manter o token salvo.' : 'Informe o token da instância.');
        this.focaCampo('gr-wa-token');
        return;
      }
      w.erro = ''; w.ok = ''; w.salvando = true;
      const corpo = { acao: 'whatsapp_salvar', servidor: servidor };
      if (token) corpo.token = token;
      if (confirmou === true) corpo.confirmar_troca = true;
      const r = await this.edge(corpo, 75000);
      w.salvando = false;
      // o servidor pede o token (a tela achou que o endereço era o mesmo): abre o campo e põe o cursor nele
      if (r && r.precisa_token === true) {
        w.precisaConfirmar = false; w.trocandoToken = true; w.tokenExigido = true;
        w.erro = String(r.erro || 'Para mudar o servidor, informe também o token da instância neste servidor.');
        this.focaCampo('gr-wa-token');
        return;
      }
      if (r && r.precisa_confirmar) { w.precisaConfirmar = true; w.webhookAtual = this.hostDoEndereco(r.webhook_atual); w.avisoTroca = String(r.erro || ''); return; }
      w.precisaConfirmar = false;
      if (!r || r.ok !== true) { w.erro = (r && r.erro) || 'Não foi possível salvar a conexão com o WhatsApp.'; return; }
      w.token = ''; w.trocandoToken = false; w.tokenExigido = false;
      this.juntaAjustes({ whatsapp_configurado: true, whatsapp_servidor: servidor });
      this.aplicaEstadoWhatsapp(r);
      if (w.estado === 'conectado') w.ok = 'WhatsApp conectado' + (w.numero ? ' ao número ' + this.telefone(w.numero) : '') + '.';
      else if (w.estado === 'aguardando_qr') w.ok = 'A conexão foi salva. Leia o QR abaixo com o celular.';
      else w.ok = 'A conexão foi salva.';
      await this.carregaPainel(true);
      // a caixa passa a mostrar o endereço como o servidor o guardou
      if (this.ajustes.whatsapp_servidor) w.servidor = String(this.ajustes.whatsapp_servidor);
    },
    cancelaTroca() { this.wa.precisaConfirmar = false; this.wa.webhookAtual = ''; this.wa.avisoTroca = ''; },
    async atualizaWhatsapp(silencioso) {
      const w = this.wa;
      if (w.consultando) return;
      w.consultando = true;
      if (!silencioso) w.erro = '';
      const r = await this.edge({ acao: 'whatsapp_estado' }, 45000);
      w.consultando = false; w.restante = GR_QR_SEGUNDOS;
      if (!r || r.ok !== true) {
        const msg = (r && r.erro) || 'Não foi possível consultar o WhatsApp agora.';
        if (silencioso) w.erroEstado = msg; else w.erro = msg;
        return;
      }
      w.erroEstado = '';
      const antes = w.estado;
      this.aplicaEstadoWhatsapp(r);
      if (w.estado === 'conectado' && antes !== 'conectado') { w.ok = 'WhatsApp conectado' + (w.numero ? ' ao número ' + this.telefone(w.numero) : '') + '.'; this.carregaPainel(true); }
    },
    // atualização do QR a cada 20 segundos, só com a seção aberta e a aba do navegador à vista
    iniciaQr() {
      this.paraQr();
      GR_TIMER_QR = setInterval(() => this.tickQr(), 1000);
    },
    paraQr() { if (GR_TIMER_QR) { clearInterval(GR_TIMER_QR); GR_TIMER_QR = null; } },
    tickQr() {
      const w = this.wa;
      if (this.rota !== 'ajustes' || this.secao !== 'whatsapp' || w.estado !== 'aguardando_qr') { this.paraQr(); return; }
      if (document.hidden || w.consultando || w.salvando) return;
      w.restante = Math.max(0, w.restante - 1);
      if (w.restante <= 0) this.atualizaWhatsapp(true);
    },

    // ── IA ──
    get iaModelosSugeridos() { return GR_MODELOS[this.ia.provedor] || []; },
    get iaTemModeloPadrao() { return this.ia.provedor === 'anthropic' || this.ia.provedor === 'deepseek'; },
    get iaMudou() {
      const a = this.ajustes, i = this.ia;
      return i.provedor !== (a.ia_provedor || '') || String(i.modelo || '').trim() !== (a.ia_modelo || '') || !!String(i.chave || '').trim()
        || (i.provedor === 'compativel' && grEnderecoChave(i.url) !== grEnderecoChave(i.urlSalva));
    },
    get iaTrocouProvedor() { const a = this.ajustes; return !!(a.ia_configurada && a.ia_provedor && this.ia.provedor !== a.ia_provedor); },
    // o provedor compatível já estava salvo e o endereço da API digitado é outro: a chave salva não vale nesse endereço
    get iaTrocouUrl() {
      const a = this.ajustes, i = this.ia;
      if (!(a.ia_configurada && a.ia_provedor === 'compativel' && i.provedor === 'compativel')) return false;
      const digitado = grEnderecoChave(i.url);
      return !!digitado && digitado !== grEnderecoChave(i.urlSalva);
    },
    get iaPedeChave() { return !this.ajustes.ia_configurada || this.ia.trocandoChave || this.ia.chaveExigida || this.iaTrocouProvedor || this.iaTrocouUrl; },
    get iaMotivoChave() {
      if (this.iaTrocouProvedor) return 'Você trocou o provedor, então a chave anterior não serve mais. Informe a chave do novo provedor.';
      if (this.iaTrocouUrl) return 'Você mudou o endereço da API, então a chave anterior não serve mais. Informe a chave que vale neste endereço.';
      return '';
    },
    get iaMsgFaltaChave() {
      if (!this.ajustes.ia_configurada || this.ia.chaveExigida) return 'Informe a chave da IA.';
      if (this.iaTrocouProvedor) return 'Você trocou o provedor, então informe também a chave dele.';
      if (this.iaTrocouUrl) return 'Você mudou o endereço da API, então informe também a chave dele.';
      return 'Cole a chave nova ou use o botão Manter a chave salva.';
    },
    async salvaIa() {
      const i = this.ia;
      if (i.salvando) return;
      const modelo = String(i.modelo || '').trim(), chave = String(i.chave || '').trim();
      // Claude e DeepSeek têm modelo padrão no servidor; os outros precisam do nome
      if (!modelo && !this.iaTemModeloPadrao) { i.erro = 'Informe o modelo da IA.'; return; }
      if (/\s/.test(modelo)) { i.erro = 'O nome do modelo não pode ter espaços. Copie o nome exato do site do provedor.'; return; }
      if (/\s/.test(chave)) { i.erro = 'A chave não pode ter espaços nem quebras de linha. Copie a chave de novo.'; return; }
      let url = '';
      if (i.provedor === 'compativel') {
        url = String(i.url || '').trim();
        if (!/^https:\/\/[^\s]+$/i.test(url)) { i.erro = 'Informe o endereço da API começando com https://.'; this.focaCampo('gr-ia-url'); return; }
      }
      // com o campo da chave à vista (IA nova, provedor ou endereço trocado, troca da chave), ele precisa estar preenchido
      if (!chave && this.iaPedeChave) { i.erro = this.iaMsgFaltaChave; this.focaCampo('gr-ia-chave'); return; }
      i.erro = ''; i.ok = ''; i.teste = ''; i.salvando = true;
      const corpo = { acao: 'ajustes_ia', provedor: i.provedor, modelo: modelo };   // modelo vazio: o servidor usa o padrão
      if (url) corpo.url = url;
      if (chave) corpo.chave = chave;
      const r = await this.edge(corpo, 60000);
      i.salvando = false;
      // o servidor pede a chave (a tela achou que não mudou nada): abre o campo e põe o cursor nele
      if (r && r.precisa_chave === true) {
        i.trocandoChave = true; i.chaveExigida = true;
        i.erro = String(r.erro || 'Para trocar o provedor ou o endereço da API, informe também a chave.');
        this.focaCampo('gr-ia-chave');
        return;
      }
      if (!r || r.ok !== true) { i.erro = (r && r.erro) || 'Não foi possível salvar a IA.'; return; }
      i.chave = ''; i.trocandoChave = false; i.chaveExigida = false;
      if (url) i.urlSalva = url;
      this.juntaAjustes(r.ajustes);
      // a caixa passa a mostrar o modelo que o servidor gravou (com o modelo em branco, é o padrão do provedor);
      // sem isso a tela veria uma mudança não salva e travaria o botão Testar a IA
      if (r.ajustes && r.ajustes.ia_modelo) i.modelo = String(r.ajustes.ia_modelo);
      i.ok = 'A IA foi salva. Use o botão Testar a IA para conferir.';
      await this.carregaPainel(true);
      if (!modelo && this.ajustes.ia_modelo && !String(i.modelo || '').trim()) i.modelo = String(this.ajustes.ia_modelo);
    },
    async testaIa() {
      const i = this.ia;
      if (i.testando || i.salvando) return;
      i.erro = ''; i.ok = ''; i.teste = ''; i.testando = true;
      const r = await this.edge({ acao: 'testar_ia' }, 90000);
      i.testando = false;
      if (!r || r.ok !== true) { i.erro = (r && r.erro) || 'A IA não respondeu ao teste.'; return; }
      i.teste = String(r.resposta || 'A IA respondeu, mas não enviou nenhum texto.');
    },

    // ── transcrição de áudio ──
    get trPodeUsarChaveDaIa() { const a = this.ajustes; return this.tr.provedor === 'openai' && a.ia_provedor === 'openai' && !!a.ia_configurada; },
    get trTrocouProvedor() { const a = this.ajustes; return !!(a.transcricao_configurada && a.transcricao_provedor && this.tr.provedor !== a.transcricao_provedor); },
    get trPedeChave() { return !this.ajustes.transcricao_configurada || this.tr.trocandoChave || this.trTrocouProvedor; },
    async salvaTranscricao() {
      const t = this.tr;
      if (t.salvando) return;
      const chave = String(t.chave || '').trim();
      const usa = !!(t.usarChaveIa && this.trPodeUsarChaveDaIa);
      if (!chave && !usa && (!this.ajustes.transcricao_configurada || this.trTrocouProvedor)) {
        t.erro = this.trTrocouProvedor ? 'Você trocou o serviço, então informe também a chave dele.' : 'Informe a chave do serviço de transcrição.';
        this.focaCampo('gr-tr-chave');
        return;
      }
      if (/\s/.test(chave)) { t.erro = 'A chave não pode ter espaços nem quebras de linha. Copie a chave de novo.'; return; }
      t.erro = ''; t.ok = ''; t.salvando = true;
      const corpo = { acao: 'ajustes_transcricao', provedor: t.provedor };
      if (chave) corpo.chave = chave;
      if (usa) corpo.usar_chave_da_ia = true;
      const r = await this.edge(corpo, 45000);
      t.salvando = false;
      if (r && r.precisa_chave === true) {
        t.trocandoChave = true; t.usarChaveIa = false;
        t.erro = String(r.erro || 'Para trocar o serviço, informe também a chave dele.');
        this.focaCampo('gr-tr-chave');
        return;
      }
      if (!r || r.ok !== true) { t.erro = (r && r.erro) || 'Não foi possível salvar a transcrição de áudio.'; return; }
      t.chave = ''; t.trocandoChave = false; t.usarChaveIa = false;
      this.juntaAjustes(r.ajustes);
      t.ok = 'A transcrição de áudio foi salva.';
      await this.carregaPainel(true);
    },
  };
}
