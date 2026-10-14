/* ============================================================================
   Grupos · 02 a lista de grupos: painel, primeiros passos, Escolher grupos e o exemplo
   ----------------------------------------------------------------------------
   Chama no banco: og_painel, og_exemplo_carregar, og_exemplo_apagar.
   Chama no servidor (og-api): whatsapp_grupos, whatsapp_acompanhar.
   O painel traz os ajustes sem segredo (estado do WhatsApp, IA e transcrição configuradas ou não)
   e os grupos. Enquanto algum grupo está trazendo as mensagens recentes (importando), o painel é
   lido de novo a cada 5 segundos, e a leitura para quando nenhum grupo vier importando.
   ============================================================================ */
function ogEscolherInicial() {
  return { aberto: false, estado: 'carregando', erro: '', lista: [], marcados: {}, busca: '', enviando: false };
}
let OG_TIMER_VIGIA = null;
let OG_VIGIA_MIN = 0;          // rodadas que a vigia faz mesmo que o painel ainda não mostre "importando"
const OG_VIGIA_MS = 5000;

function ogGrupos() {
  return {
    painel: null,
    carga: { painel: 'carregando', grupo: 'carregando' },
    cargaErro: { painel: '', grupo: '' },
    buscaGrupos: '',
    escolher: ogEscolherInicial(),

    // ── o painel ──
    normalizaPainel(p) {
      const o = (p && typeof p === 'object') ? p : {};
      return {
        pode_administrar: !!o.pode_administrar,
        pode_configurar: !!o.pode_configurar,
        ajustes: (o.ajustes && typeof o.ajustes === 'object') ? o.ajustes : {},
        grupos: Array.isArray(o.grupos) ? o.grupos : [],
      };
    },
    async carregaPainel(quieto) {
      if (!quieto) { if (!this.painel) this.carga.painel = 'carregando'; this.cargaErro.painel = ''; }
      try {
        const p = await this.dado(OS.getClient().rpc('og_painel'));
        this.painel = this.normalizaPainel(p);
        this.carga.painel = 'pronto'; this.cargaErro.painel = '';
      } catch (e) {
        if (!quieto || !this.painel) { this.carga.painel = 'erro'; this.cargaErro.painel = this.textoErro(e); }
      }
      this.agendaVigia();
    },
    abreGrupos() {
      this.grupo = null;
      if (this.painel) this.carregaPainel(true);
    },

    // ── a vigia da importação: lê o painel (e o grupo aberto) de 5 em 5 segundos enquanto algo importa ──
    get alguemImportando() { return this.grupos.some((g) => g.importando) || !!(this.grupo && this.grupo.importando); },
    iniciaVigia(rodadas) { OG_VIGIA_MIN = Math.max(OG_VIGIA_MIN, rodadas || 0); this.agendaVigia(); },
    agendaVigia() {
      clearTimeout(OG_TIMER_VIGIA); OG_TIMER_VIGIA = null;
      if (!this.alguemImportando && OG_VIGIA_MIN <= 0) return;
      OG_TIMER_VIGIA = setTimeout(() => this.rodadaVigia(), OG_VIGIA_MS);
    },
    async rodadaVigia() {
      if (OG_VIGIA_MIN > 0) OG_VIGIA_MIN--;
      await this.carregaPainel(true);
      if (this.rota === 'grupo' && this.grupo) {
        await this.atualizaGrupoQuieto();
        if (this.aba === 'conversa') await this.atualizaCabeca();
      }
      this.agendaVigia();
    },

    // ── o que as telas perguntam sobre acesso e ajustes ──
    get ajustes() { return (this.painel && this.painel.ajustes) || {}; },
    get grupos() { return (this.painel && this.painel.grupos) || []; },
    get podeAdministrar() { return !!(this.painel && this.painel.pode_administrar); },
    get podeConfigurar() { return !!(this.painel && this.painel.pode_configurar); },
    get gruposReais() { return this.grupos.filter((g) => !g.exemplo); },
    get grupoExemplo() { return this.grupos.find((g) => g.exemplo) || null; },
    get temExemplo() { return !!this.grupoExemplo; },

    // ── a lista ──
    get gruposFiltrados() {
      const q = String(this.buscaGrupos || '').trim().toLowerCase();
      return q ? this.grupos.filter((g) => String(g.nome || '').toLowerCase().includes(q)) : this.grupos;
    },
    get kpisGrupos() {
      const ativos = this.grupos.filter((g) => g.ativo);
      const soma = (campo) => this.grupos.reduce((t, g) => t + (Number(g[campo]) || 0), 0);
      return [
        { rotulo: 'grupos acompanhados', valor: this.numero(ativos.length) },
        { rotulo: 'mensagens hoje', valor: this.numero(soma('mensagens_hoje')) },
        { rotulo: 'pendências nos últimos resumos', valor: this.numero(soma('pendencias_ultimo_resumo')) },
        { rotulo: 'resumos automáticos ligados', valor: this.numero(this.grupos.filter((g) => g.resumo_auto).length) },
      ];
    },
    selosGrupo(g) {
      const s = [];
      if (g.exemplo) s.push({ t: 'Exemplo', c: 'acc' });
      if (!g.ativo) s.push({ t: 'Pausado', c: 'warn' });
      if (g.importando) s.push({ t: 'Trazendo as mensagens recentes', c: 'acc', gira: true });
      else if (g.importacao_erro) s.push({ t: 'Mensagens antigas não chegaram', c: 'warn' });
      if (g.resumo_auto) s.push({ t: 'Resumo todo dia às ' + Number(g.resumo_hora == null ? 20 : g.resumo_hora) + 'h', c: '' });
      if (Number(g.pendencias_ultimo_resumo) > 0) {
        const n = Number(g.pendencias_ultimo_resumo);
        s.push({ t: n + ' ' + this.plural(n, 'pendência', 'pendências') + ' no último resumo', c: 'warn' });
      }
      return s;
    },

    // ── primeiros passos: IA, WhatsApp e grupos ──
    get passos() {
      const a = this.ajustes;
      const estado = a.whatsapp_estado || 'desligado';
      const n = this.gruposReais.length;
      let wa = 'Informe o servidor e o token da uazapi e leia o QR com o celular.', waBotao = 'Ligar o WhatsApp';
      if (estado === 'conectado') wa = 'Conectado ao número ' + (this.telefone(a.whatsapp_numero) || 'da instância') + '.';
      else if (estado === 'aguardando_qr') { wa = 'Falta ler o QR com o celular.'; waBotao = 'Mostrar o QR'; }
      else if (estado === 'erro') {
        // o painel só manda o texto do erro (whatsapp_erro) para quem configura; para os outros a tela usa uma frase pronta
        const motivo = this.podeConfigurar ? String(a.whatsapp_erro || '').trim() : '';
        wa = this.podeConfigurar
          ? 'A conexão deu erro' + (motivo ? ': ' + motivo + (/[.!?]$/.test(motivo) ? '' : '.') : '.')
          : 'A conexão com o WhatsApp deu erro. Peça a quem administra o Hub para conferir.';
        waBotao = 'Ver a conexão';
      }
      return [
        {
          chave: 'ia', titulo: 'Ligar a IA', feito: !!a.ia_configurada, botao: 'Ligar a IA', bloqueado: false,
          descricao: a.ia_configurada
            ? (a.ia_provedor ? 'IA ligada: ' + this.nomeProvedor(a.ia_provedor) + (a.ia_modelo ? ', modelo ' + a.ia_modelo : '') + '.' : 'A IA está ligada.')
            : 'Escolha o provedor e informe a chave. A IA escreve os resumos e responde às perguntas.',
        },
        { chave: 'whatsapp', titulo: 'Ligar o WhatsApp', feito: estado === 'conectado', botao: waBotao, bloqueado: false, descricao: wa },
        {
          chave: 'grupos', titulo: 'Escolher os grupos', feito: n > 0, botao: 'Escolher grupos',
          bloqueado: estado !== 'conectado',
          descricao: n > 0
            ? n + ' ' + this.plural(n, 'grupo acompanhado', 'grupos acompanhados') + '.'
            : (estado === 'conectado' ? 'Marque os grupos do WhatsApp que a IA deve acompanhar.' : 'Ligue o WhatsApp primeiro. Depois você marca os grupos que a IA deve acompanhar.'),
        },
      ];
    },
    get mostraPrimeirosPassos() { return !!this.painel && this.passos.some((p) => !p.feito); },
    vaiPasso(chave) {
      if (chave === 'ia') this.vai('#ajustes/ia');
      else if (chave === 'whatsapp') this.vai('#ajustes/whatsapp');
      else if (chave === 'grupos') this.abreEscolher();
    },

    // ── a janela Escolher grupos (a lista vem da uazapi, pelo servidor) ──
    abreEscolher() {
      if (!this.podeConfigurar) return;
      this.escolher = Object.assign(ogEscolherInicial(), { aberto: true });
      if (!this.ajustes.whatsapp_configurado) { this.escolher.estado = 'semWhatsapp'; return; }
      this.carregaListaUazapi();
    },
    fechaEscolher() { if (this.escolher.enviando) return; this.escolher.aberto = false; },
    async carregaListaUazapi() {
      const e = this.escolher;
      e.estado = 'carregando'; e.erro = '';
      const r = await this.edge({ acao: 'whatsapp_grupos' }, 60000);
      if (!e.aberto) return;
      if (!r || r.ok !== true) { e.estado = 'erro'; e.erro = (r && r.erro) || 'Não foi possível buscar os grupos do WhatsApp.'; return; }
      const lista = Array.isArray(r.grupos) ? r.grupos : [];
      e.lista = lista.filter((g) => g && g.jid).map((g) => ({ jid: String(g.jid), nome: String(g.nome || g.jid), pessoas: Number(g.pessoas) || 0, acompanhando: !!g.acompanhando, pausado: !!g.pausado }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      e.estado = 'pronto';
    },
    get listaEscolher() {
      const q = String(this.escolher.busca || '').trim().toLowerCase();
      return q ? this.escolher.lista.filter((g) => g.nome.toLowerCase().includes(q)) : this.escolher.lista;
    },
    get qtdMarcados() { return Object.keys(this.escolher.marcados).filter((j) => this.escolher.marcados[j]).length; },
    get qtdNovosNaLista() { return this.listaEscolher.filter((g) => !g.acompanhando).length; },
    alternaMarca(g) {
      if (g.acompanhando) return;
      this.escolher.marcados[g.jid] = !this.escolher.marcados[g.jid];
    },
    marcaTodos() { this.listaEscolher.forEach((g) => { if (!g.acompanhando) this.escolher.marcados[g.jid] = true; }); },
    limpaMarcas() { this.escolher.marcados = {}; },
    async acompanhaMarcados() {
      const e = this.escolher;
      if (e.enviando) return;
      const jids = Object.keys(e.marcados).filter((j) => e.marcados[j]);
      if (!jids.length) return;
      e.enviando = true; e.erro = '';
      const r = await this.edge({ acao: 'whatsapp_acompanhar', jids: jids }, 150000);
      e.enviando = false;
      if (!r || r.ok !== true) { e.erro = (r && r.erro) || 'Não foi possível acompanhar os grupos. Tente de novo.'; return; }
      e.aberto = false;
      const n = Number(r.criados);
      let texto = n === 1 ? 'Um grupo passou a ser acompanhado.' : (n > 1 ? n + ' grupos passaram a ser acompanhados.' : 'Os grupos escolhidos já eram acompanhados.');
      if (r.importando) texto += ' As mensagens recentes estão chegando.';
      const faltaram = Array.isArray(r.nao_encontrados) ? r.nao_encontrados.length : 0;
      if (faltaram) texto += ' ' + faltaram + ' ' + this.plural(faltaram, 'grupo marcado não apareceu', 'grupos marcados não apareceram') + ' no WhatsApp deste número.';
      this.avisa(texto);
      if (r.importando) this.iniciaVigia(3);
      await this.carregaPainel(true);
      if (this.rota !== 'grupos') this.vai('#grupos');
    },

    // ── o grupo de exemplo ──
    async carregaExemplo() {
      const id = await this.comTarefa('Preparando o grupo de exemplo', async () => {
        const novo = await this.dado(OS.getClient().rpc('og_exemplo_carregar'));
        await this.carregaPainel(true);
        return novo;
      });
      if (!id) return;
      const alvo = OG_UUID.test(String(id)) ? String(id) : (this.grupoExemplo ? this.grupoExemplo.id : '');
      if (alvo) this.vai('#grupo/' + alvo);
    },
    pedeApagarExemplo() {
      this.pedeConfirmacao({
        titulo: 'Apagar o grupo de exemplo',
        texto: 'O grupo de exemplo será apagado com a conversa, os resumos e as perguntas dele. Os grupos de verdade não mudam.',
        rotuloOk: 'Apagar o grupo de exemplo', perigo: true,
        acao: async () => {
          await this.dado(OS.getClient().rpc('og_exemplo_apagar'));
          await this.carregaPainel(true);
          this.avisa('O grupo de exemplo foi apagado.');
          if (this.rota === 'grupo' && this.grupo && this.grupo.exemplo) this.vai('#grupos');
        },
      });
    },
  };
}
