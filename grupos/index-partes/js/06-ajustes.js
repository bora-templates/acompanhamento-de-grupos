/* ============================================================================
   Grupos · 06 os Ajustes: WhatsApp (QR), IA, transcrição de áudio e grupo de exemplo
   ----------------------------------------------------------------------------
   Só quem configura (pode_configurar) abre esta tela. Tudo passa pelo servidor (gr-api):
     whatsapp_salvar, whatsapp_estado, ajustes_ia, testar_ia, ia_modelos, ajustes_transcricao.
   O seletor de modelos da IA: com a IA salva (provedor e chave), a tela pede ao servidor a lista que o
   provedor tem hoje (ia_modelos), os mais recentes primeiro, e mostra essa lista enquanto o provedor
   escolhido for o salvo. Sem chave salva, com outro provedor escolhido ou com falha na busca, vale a
   lista fixa GR_MODELOS. O campo de escrever outro modelo continua nos dois casos.
   A transcrição tem serviço, modelo de áudio e chave próprios. A tela diz sempre qual chave está em uso:
   a mesma chave da IA (só quando as duas são da OpenAI) ou uma chave própria do serviço.
   Token e chave:
     . ficam em campo de senha e nunca são preenchidos de volta: depois de salvos, a tela mostra só
       "salvo" e o botão de trocar;
     . saem da memória da tela assim que o servidor confirma a gravação;
     . trocar o endereço do servidor da uazapi exige o token da instância nova, e trocar o provedor da IA exige a chave. A tela abre o campo na hora, não deixa salvar sem ele
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
  return {
    provedor: 'openai', modelo: '', escolha: '', chave: '', trocandoChave: false, chaveExigida: false, salvando: false, testando: false, erro: '', ok: '', teste: '',
    modelosVivos: [], vivosDe: '', buscandoModelos: false, avisoModelos: '',
  };
}
function grTrInicial() {
  return { provedor: 'openai', modelo: '', chave: '', trocandoChave: false, usarChaveIa: false, salvando: false, erro: '', ok: '' };
}
let GR_TIMER_QR = null;
const GR_QR_SEGUNDOS = 20;
// a lista fixa do seletor, por provedor, para quando a lista do provedor não está à mão; o primeiro de cada
// lista é o recomendado e vem escolhido, e ele é o mesmo modelo padrão do servidor (MODELO_PADRAO, em
// _shared/ia.ts). Na OpenAI, desde a versão 1.0.5, o recomendado é o GPT-6 Luna (gpt-6-luna), o mais barato. Nomes conferidos em
// 24/11/2026 nas páginas de modelos da OpenAI e da Anthropic.
// A tela oferece só Claude e ChatGPT (GR_PROVEDORES_TELA, com os valores anthropic e openai).
const GR_PROVEDORES_TELA = ['anthropic', 'openai'];
const GR_MODELOS = {
  openai: [{ id: 'gpt-6-luna', nome: 'GPT-6 Luna (recomendado, o mais barato)' }, { id: 'gpt-6.1-terra', nome: 'GPT-6.1 Terra' }, { id: 'gpt-6.2-sol', nome: 'GPT-6.2 Sol' }, { id: 'gpt-5.5', nome: 'GPT-5.5' }, { id: 'gpt-6.2-astra', nome: 'GPT-6.2 Astra' }],
  anthropic: [{ id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5 (recomendado)' }, { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5' }, { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5' }, { id: 'claude-fable-5-2', nome: 'Claude Fable 5.2' }],
};
// os modelos de áudio por serviço (os mesmos que a gr-api aceita, em _shared/transcricao.ts); o primeiro é o
// recomendado e vem escolhido numa transcrição nova. "padrao" é o que o servidor usa quando o modelo fica vazio.
const GR_MODELOS_AUDIO = {
  openai: { padrao: 'whisper-1', lista: [
    { id: 'gpt-transcribe', nome: 'GPT Transcribe (recomendado pela OpenAI)' },
    { id: 'gpt-4o-mini-transcribe', nome: 'GPT-4o mini Transcribe (sai do ar em 26/02/2027)' },
    { id: 'gpt-4o-transcribe', nome: 'GPT-4o Transcribe (sai do ar em 26/02/2027)' },
    { id: 'whisper-1', nome: 'Whisper 1 (sai do ar em 26/02/2027)' },
  ] },
};
const GR_OUTRO_MODELO = '__outro';
function grPrimeiroModelo(provedor) { const l = GR_MODELOS[provedor] || []; return l.length ? l[0].id : ''; }
// a lista com o recomendado na frente (quando ele está nela), sem mudar a ordem dos outros
function grRecomendadoPrimeiro(lista, recomendado) {
  const k = recomendado ? lista.findIndex((m) => m.id === recomendado) : -1;
  return k > 0 ? [lista[k]].concat(lista.slice(0, k), lista.slice(k + 1)) : lista.slice();
}

function grAjustes() {
  return {
    wa: grWaInicial(),
    ia: grIaInicial(),
    tr: grTrInicial(),

    abreAjustes(secao, entrou) {
      if (!this.podeConfigurar) return;
      if (entrou) this.preencheAjustes();
      if (secao === 'whatsapp') this.iniciaWhatsapp();
      if (secao === 'ia') this.carregaModelosIa(false);
    },
    // as caixas começam com o que já está salvo (menos token e chave, que a tela nunca recebe)
    preencheAjustes() {
      const a = this.ajustes;
      this.wa = Object.assign(grWaInicial(), { servidor: String(a.whatsapp_servidor || ''), estado: a.whatsapp_estado || 'desligado', numero: a.whatsapp_numero || '' });
      // provedor antigo salvo (DeepSeek ou Compatível): a caixa começa no Claude, e salvar pede a chave nova
      const antigo = !!a.ia_provedor && !GR_PROVEDORES_TELA.includes(a.ia_provedor);
      this.ia = Object.assign(grIaInicial(), { provedor: antigo ? 'anthropic' : (a.ia_provedor || 'openai'), modelo: antigo ? '' : (a.ia_modelo || '') });
      this.ajustaEscolhaIa();
      // só OpenAI desde 24/11; um ajuste antigo com Groq aparece como troca de serviço e pede a chave da OpenAI
      const servico = 'openai';
      this.tr = Object.assign(grTrInicial(), {
        provedor: servico,
        // transcrição salva sem modelo: o servidor usa o padrão do serviço, e a caixa mostra esse
        modelo: String(a.transcricao_modelo || '') || (a.transcricao_configurada ? GR_MODELOS_AUDIO[servico].padrao : GR_MODELOS_AUDIO[servico].lista[0].id),
        usarChaveIa: !!(a.transcricao_configurada && a.transcricao_chave_da_ia),
      });
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
    // a tela oferece só Claude e ChatGPT (a OpenAI); uma instalação com DeepSeek ou Compatível salvos continua funcionando,
    // e a tela avisa que, para mudar alguma coisa, é preciso escolher um dos dois
    get iaProvedorAntigo() { const p = this.ajustes.ia_provedor; return !!p && !GR_PROVEDORES_TELA.includes(p); },
    get iaAvisoProvedorAntigo() {
      if (!this.iaProvedorAntigo) return '';
      return 'A IA desta instalação usa um provedor que a tela não oferece mais (' + this.nomeProvedor(this.ajustes.ia_provedor) + '). Ela continua funcionando. Para mudar alguma coisa, escolha Claude ou ChatGPT e informe a chave.';
    },
    // a lista que o provedor mandou vale enquanto o provedor escolhido for o salvo
    get iaListaAoVivo() {
      const a = this.ajustes, i = this.ia;
      return !!(a.ia_configurada && i.provedor === a.ia_provedor && i.modelosVivos.length && i.vivosDe === i.provedor);
    },
    get iaModelosSugeridos() {
      if (!this.iaListaAoVivo) return GR_MODELOS[this.ia.provedor] || [];
      // o recomendado vai na frente quando o provedor tem, para ficar marcado e ser o escolhido de fábrica
      return grRecomendadoPrimeiro(this.ia.modelosVivos, grPrimeiroModelo(this.ia.provedor))
        .map((m) => ({ id: m.id, nome: (m.nome || m.id) + (m.id === grPrimeiroModelo(this.ia.provedor) ? ' (recomendado)' : '') }));
    },
    get iaDicaModelos() {
      const a = this.ajustes, i = this.ia;
      if (!a.ia_configurada || i.provedor !== a.ia_provedor) return '';
      if (i.buscandoModelos) return 'Buscando os modelos do provedor.';
      if (this.iaListaAoVivo) return 'A lista veio do provedor, com os modelos mais recentes primeiro.';
      return i.avisoModelos;
    },
    // pede ao servidor os modelos do provedor salvo (com a chave do cofre); de novo só quando o provedor salvo mudou
    async carregaModelosIa(forcar) {
      const a = this.ajustes, i = this.ia;
      if (!a.ia_configurada || !GR_PROVEDORES_TELA.includes(a.ia_provedor) || i.buscandoModelos) return;
      if (!forcar && i.vivosDe === a.ia_provedor && (i.modelosVivos.length || i.avisoModelos)) return;
      i.buscandoModelos = true;
      const r = await this.edge({ acao: 'ia_modelos' }, 20000);
      i.buscandoModelos = false;
      const lista = r && r.ok === true && Array.isArray(r.modelos)
        ? r.modelos.filter((m) => m && typeof m.id === 'string' && m.id).map((m) => ({ id: String(m.id), nome: String(m.nome || m.id) }))
        : [];
      i.modelosVivos = lista;
      i.vivosDe = a.ia_provedor;
      i.avisoModelos = lista.length ? '' : String((r && (r.aviso || r.erro)) || 'A lista de modelos do provedor não veio agora. A tela mostra a lista fixa de modelos.');
      // o seletor passa a mostrar a lista nova, com o modelo da vez escolhido (fora dela, abre o campo de texto)
      this.ajustaEscolhaIa();
    },
    get iaOutroModelo() { return this.ia.escolha === GR_OUTRO_MODELO; },
    // acerta o seletor com o modelo da vez: sem modelo, entra o recomendado; modelo fora da lista abre o campo de texto
    ajustaEscolhaIa() {
      const i = this.ia, ids = this.iaModelosSugeridos.map((m) => m.id);
      if (!ids.length) { i.escolha = GR_OUTRO_MODELO; return; }
      const modelo = String(i.modelo || '').trim();
      if (!modelo) { i.modelo = ids[0]; i.escolha = ids[0]; return; }
      i.escolha = ids.includes(modelo) ? modelo : GR_OUTRO_MODELO;
    },
    trocaProvedorIa() {
      const a = this.ajustes, i = this.ia;
      i.chaveExigida = false;
      // de volta ao provedor salvo, volta também o modelo salvo
      i.modelo = a.ia_configurada && i.provedor === a.ia_provedor ? String(a.ia_modelo || '') : '';
      this.ajustaEscolhaIa();
    },
    escolheModeloIa() {
      const i = this.ia;
      if (i.escolha === GR_OUTRO_MODELO) { i.modelo = ''; this.focaCampo('gr-ia-modelo'); return; }
      i.modelo = i.escolha;
    },
    // os dois provedores da tela têm modelo padrão no servidor (o recomendado): o campo pode ficar vazio
    get iaTemModeloPadrao() { return GR_PROVEDORES_TELA.includes(this.ia.provedor); },
    get iaMudou() {
      const a = this.ajustes, i = this.ia;
      return i.provedor !== (a.ia_provedor || '') || String(i.modelo || '').trim() !== (a.ia_modelo || (a.ia_configurada ? grPrimeiroModelo(a.ia_provedor) : '')) || !!String(i.chave || '').trim();
    },
    get iaTrocouProvedor() { const a = this.ajustes; return !!(a.ia_configurada && a.ia_provedor && this.ia.provedor !== a.ia_provedor); },
    get iaPedeChave() { return !this.ajustes.ia_configurada || this.ia.trocandoChave || this.ia.chaveExigida || this.iaTrocouProvedor; },
    get iaMotivoChave() {
      if (this.iaTrocouProvedor) return 'Você trocou o provedor, então a chave anterior não serve mais. Informe a chave do novo provedor.';
      return '';
    },
    get iaMsgFaltaChave() {
      if (!this.ajustes.ia_configurada || this.ia.chaveExigida) return 'Informe a chave da IA.';
      if (this.iaTrocouProvedor) return 'Você trocou o provedor, então informe também a chave dele.';
      return 'Cole a chave nova ou use o botão Manter a chave salva.';
    },
    async salvaIa() {
      const i = this.ia;
      if (i.salvando) return;
      if (!GR_PROVEDORES_TELA.includes(i.provedor)) { i.erro = 'Escolha o provedor da IA: Claude ou ChatGPT.'; return; }
      const modelo = String(i.modelo || '').trim(), chave = String(i.chave || '').trim();
      // Claude e ChatGPT têm modelo padrão no servidor; um provedor sem padrão precisa do nome
      if (!modelo && !this.iaTemModeloPadrao) { i.erro = 'Informe o modelo da IA.'; return; }
      if (/\s/.test(modelo)) { i.erro = 'O nome do modelo não pode ter espaços. Copie o nome exato do site do provedor.'; return; }
      if (/\s/.test(chave)) { i.erro = 'A chave não pode ter espaços nem quebras de linha. Copie a chave de novo.'; return; }
      // com o campo da chave à vista (IA nova, provedor trocado, troca da chave), ele precisa estar preenchido
      if (!chave && this.iaPedeChave) { i.erro = this.iaMsgFaltaChave; this.focaCampo('gr-ia-chave'); return; }
      i.erro = ''; i.ok = ''; i.teste = ''; i.salvando = true;
      const corpo = { acao: 'ajustes_ia', provedor: i.provedor, modelo: modelo };   // modelo vazio: o servidor usa o padrão
      if (chave) corpo.chave = chave;
      const r = await this.edge(corpo, 60000);
      i.salvando = false;
      // o servidor pede a chave (a tela achou que não mudou nada): abre o campo e põe o cursor nele
      if (r && r.precisa_chave === true) {
        i.trocandoChave = true; i.chaveExigida = true;
        i.erro = String(r.erro || 'Para trocar o provedor, informe também a chave.');
        this.focaCampo('gr-ia-chave');
        return;
      }
      if (!r || r.ok !== true) { i.erro = (r && r.erro) || 'Não foi possível salvar a IA.'; return; }
      i.chave = ''; i.trocandoChave = false; i.chaveExigida = false;
      this.juntaAjustes(r.ajustes);
      // a caixa passa a mostrar o modelo que o servidor gravou (com o modelo em branco, é o padrão do provedor);
      // sem isso a tela veria uma mudança não salva e travaria o botão Testar a IA
      if (r.ajustes && r.ajustes.ia_modelo) i.modelo = String(r.ajustes.ia_modelo);
      i.ok = 'A IA foi salva. Use o botão Testar a IA para conferir.';
      await this.carregaPainel(true);
      if (!modelo && this.ajustes.ia_modelo && !String(i.modelo || '').trim()) i.modelo = String(this.ajustes.ia_modelo);
      // com a chave ou o provedor novos, a lista do provedor é buscada de novo
      if (chave || !this.iaListaAoVivo) this.carregaModelosIa(true);
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
    get trModelos() { return (GR_MODELOS_AUDIO[this.tr.provedor] || GR_MODELOS_AUDIO.openai).lista; },
    trocaProvedorTr() {
      const a = this.ajustes, t = this.tr;
      // de volta ao serviço salvo, volta o modelo salvo; num serviço novo, entra o recomendado
      t.modelo = a.transcricao_configurada && t.provedor === a.transcricao_provedor
        ? (String(a.transcricao_modelo || '') || GR_MODELOS_AUDIO[t.provedor].padrao)
        : GR_MODELOS_AUDIO[t.provedor].lista[0].id;
      if (!this.trPodeUsarChaveDaIa) t.usarChaveIa = false;
    },
    get trPodeUsarChaveDaIa() { const a = this.ajustes; return this.tr.provedor === 'openai' && a.ia_provedor === 'openai' && !!a.ia_configurada; },
    get trTrocouProvedor() { const a = this.ajustes; return !!(a.transcricao_configurada && a.transcricao_provedor && this.tr.provedor !== a.transcricao_provedor); },
    // o que está salvo hoje: a transcrição usa a mesma chave da IA
    get trSalvoComChaveDaIa() { const a = this.ajustes; return !!(a.transcricao_configurada && a.transcricao_chave_da_ia && !this.trTrocouProvedor); },
    // a caixa "Usar a mesma chave da IA" está marcada e vale para este serviço
    get trUsaChaveDaIa() { return !!(this.tr.usarChaveIa && this.trPodeUsarChaveDaIa); },
    // desmarcar a caixa quando a chave salva é a da IA pede a chave própria do serviço
    get trPedeChave() { return !this.ajustes.transcricao_configurada || this.tr.trocandoChave || this.trTrocouProvedor || (this.trSalvoComChaveDaIa && !this.tr.usarChaveIa); },
    // a frase que diz, sem dúvida, qual chave a transcrição usa (ou vai usar ao salvar)
    get trChaveEmUso() {
      if (this.trUsaChaveDaIa) {
        return this.trSalvoComChaveDaIa
          ? 'Chave em uso: a mesma chave da IA (OpenAI). Se você trocar a chave da IA, a transcrição passa a usar a nova.'
          : 'Ao salvar, a transcrição passa a usar a mesma chave da IA (OpenAI).';
      }
      if (!this.trPedeChave) return 'Chave em uso: uma chave própria do serviço de transcrição, salva no servidor.';
      if (this.trSalvoComChaveDaIa) return 'Hoje a transcrição usa a mesma chave da IA. Para usar uma chave própria do serviço, cole a chave abaixo e salve.';
      return '';
    },
    async salvaTranscricao() {
      const t = this.tr;
      if (t.salvando) return;
      const chave = String(t.chave || '').trim();
      const usa = this.trUsaChaveDaIa;
      if (!chave && !usa && this.trPedeChave) {
        t.erro = this.trTrocouProvedor ? 'Você trocou o serviço, então informe também a chave dele.'
          : (this.trSalvoComChaveDaIa ? 'Para deixar de usar a chave da IA, cole a chave própria do serviço de transcrição.'
          : (this.ajustes.transcricao_configurada ? 'Cole a chave nova ou use o botão Manter a chave salva.' : 'Informe a chave do serviço de transcrição.'));
        this.focaCampo('gr-tr-chave');
        return;
      }
      if (/\s/.test(chave)) { t.erro = 'A chave não pode ter espaços nem quebras de linha. Copie a chave de novo.'; return; }
      t.erro = ''; t.ok = ''; t.salvando = true;
      const corpo = { acao: 'ajustes_transcricao', provedor: t.provedor, modelo: String(t.modelo || '') };
      if (chave) corpo.chave = chave;
      if (usa && !chave) corpo.usar_chave_da_ia = true;
      else if (this.trSalvoComChaveDaIa) corpo.usar_chave_da_ia = false;
      const r = await this.edge(corpo, 45000);
      t.salvando = false;
      if (r && r.precisa_chave === true) {
        t.trocandoChave = true; t.usarChaveIa = false;
        t.erro = String(r.erro || 'Para trocar o serviço, informe também a chave dele.');
        this.focaCampo('gr-tr-chave');
        return;
      }
      if (!r || r.ok !== true) { t.erro = (r && r.erro) || 'Não foi possível salvar a transcrição de áudio.'; return; }
      t.chave = ''; t.trocandoChave = false;
      this.juntaAjustes(r.ajustes);
      // a caixa fica marcada quando a chave salva é a da IA, e a frase de chave em uso acompanha
      t.usarChaveIa = !!(this.ajustes.transcricao_chave_da_ia);
      if (this.ajustes.transcricao_modelo) t.modelo = String(this.ajustes.transcricao_modelo);
      t.ok = this.ajustes.transcricao_chave_da_ia ? 'A transcrição de áudio foi salva com a mesma chave da IA.' : 'A transcrição de áudio foi salva com a chave própria do serviço.';
      await this.carregaPainel(true);
    },
  };
}
