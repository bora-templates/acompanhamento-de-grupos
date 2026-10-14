/* ============================================================================
   Grupos · 05 as abas Orientações e materiais, Participantes e Ajustes do grupo
   ----------------------------------------------------------------------------
   Chama no banco: og_materiais, og_material_salvar, og_material_apagar, og_participantes,
   og_grupo_salvar, og_grupo_remover.
   Chama no servidor (og-api): participantes.
   Resumo automático: og_grupo e og_grupo_salvar devolvem proximo_auto (o instante do próximo resumo), e a aba
   mostra a data e a hora. Se o instante já chegou, a agenda (que roda a cada 15 minutos) faz o resumo na próxima rodada.
   Quem pode o quê (a tela só esconde, o banco confere de novo). Os níveis seguem a tela Usuários:
     Edita (pode_administrar):    orientações, materiais, participantes e resumo automático do grupo;
     Administra (pode_configurar): pausar o grupo e deixar de acompanhar.
   ============================================================================ */
function ogOriInicial() { return { texto: '', original: '', salvando: false, erro: '' }; }
function ogMatInicial() {
  return { estado: 'carregando', erro: '', lista: [], form: { aberto: false, modo: 'colar', titulo: '', texto: '', arquivo: '', erro: '', salvando: false } };
}
function ogPartInicial() { return { estado: 'carregando', erro: '', lista: [], busca: '', atualizando: false, erroAtualiza: '' }; }
function ogAgInicial() { return { auto: false, hora: 20, envia: false, salvando: false, erro: '', ok: '', pausando: false, erroPausa: '' }; }
let OG_GEN_MAT = 0, OG_GEN_PART = 0;
const OG_MAX_MATERIAL = 60000;
const OG_MAX_ORIENTACOES = 4000;
const OG_MAX_ARQUIVO = 400 * 1024;

function ogExtras() {
  return {
    ori: ogOriInicial(),
    mat: ogMatInicial(),
    part: ogPartInicial(),
    ag: ogAgInicial(),

    // ── orientações para a IA ──
    get oriMudou() { return this.ori.texto !== this.ori.original; },
    get oriPassou() { return String(this.ori.texto || '').length > OG_MAX_ORIENTACOES; },
    async salvaOrientacoes() {
      const o = this.ori;
      if (o.salvando || !this.grupo || !this.podeAdministrar) return;
      if (this.oriPassou) { o.erro = 'As orientações podem ter até ' + this.numero(OG_MAX_ORIENTACOES) + ' caracteres. Encurte o texto e salve de novo.'; return; }
      o.erro = ''; o.salvando = true;
      const dados = { orientacoes: o.texto };
      try {
        const g = await this.dado(OS.getClient().rpc('og_grupo_salvar', { p_grupo: this.grupo.id, p_dados: dados }));
        this.aplicaGrupo(g);
        o.original = o.texto;
        this.avisa('As orientações foram salvas.');
      } catch (e) { o.erro = this.textoErro(e); }
      finally { o.salvando = false; }
    },

    // ── materiais de apoio ──
    async abreMateriais() {
      const g = this.grupo;
      if (g) { this.ori.texto = g.orientacoes || ''; this.ori.original = g.orientacoes || ''; this.ori.erro = ''; }
      await this.carregaMateriais();
    },
    async carregaMateriais(quieto) {
      const m = this.mat, id = this.rotaId, gen = ++OG_GEN_MAT;
      if (!quieto) { m.estado = 'carregando'; m.erro = ''; }
      try {
        const lista = await this.dado(OS.getClient().rpc('og_materiais', { p_grupo: id }));
        if (gen !== OG_GEN_MAT || this.rotaId !== id) return;
        m.lista = Array.isArray(lista) ? lista : [];
        m.estado = 'pronto';
        if (this.grupo) this.grupo.materiais_total = m.lista.length;
      } catch (e) {
        if (gen !== OG_GEN_MAT) return;
        if (!quieto || m.estado !== 'pronto') { m.estado = 'erro'; m.erro = this.textoErro(e); }
      }
    },
    abreNovoMaterial() {
      this.mat.form = { aberto: true, modo: 'colar', titulo: '', texto: '', arquivo: '', erro: '', salvando: false };
    },
    fechaMaterial() { if (this.mat.form.salvando) return; this.mat.form.aberto = false; },
    async escolheArquivoMaterial(ev) {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      const m = this.mat.form;
      if (!f) return;
      if (!/\.(txt|md|markdown)$/i.test(f.name)) { m.erro = 'Use um arquivo de texto com a extensão .txt ou .md.'; return; }
      if (f.size > OG_MAX_ARQUIVO) { m.erro = 'O arquivo é grande demais. Divida o conteúdo em materiais menores.'; return; }
      const t = (await f.text()).replace(/^\uFEFF/, '');
      if (t.length > OG_MAX_MATERIAL) { m.erro = 'O texto passou de ' + this.numero(OG_MAX_MATERIAL) + ' caracteres. Divida em dois materiais.'; return; }
      m.texto = t; m.arquivo = f.name; m.erro = ''; m.modo = 'colar';
      if (!String(m.titulo || '').trim()) m.titulo = f.name.replace(/\.[^.]+$/, '');
    },
    async salvaMaterial() {
      const m = this.mat.form;
      if (m.salvando || !this.grupo || !this.podeAdministrar) return;
      const titulo = String(m.titulo || '').trim(), texto = String(m.texto || '').trim();
      if (!titulo) { m.erro = 'Escreva um título para o material.'; return; }
      if (!texto) { m.erro = 'Cole o texto do material ou abra um arquivo.'; return; }
      if (texto.length > OG_MAX_MATERIAL) { m.erro = 'O texto passou de ' + this.numero(OG_MAX_MATERIAL) + ' caracteres. Divida em dois materiais.'; return; }
      m.erro = ''; m.salvando = true;
      const arquivo = m.arquivo || null;
      try {
        await this.dado(OS.getClient().rpc('og_material_salvar', { p_id: null, p_grupo: this.grupo.id, p_titulo: titulo, p_texto: texto, p_arquivo_nome: arquivo }));
        m.aberto = false;
        this.avisa('O material foi salvo.');
        await this.carregaMateriais(true);
      } catch (e) { m.erro = this.textoErro(e); }
      finally { m.salvando = false; }
    },
    pedeApagarMaterial(item) {
      this.pedeConfirmacao({
        titulo: 'Apagar o material',
        texto: 'O material "' + item.titulo + '" será apagado e a IA deixa de usar esse texto nas respostas e nos resumos.',
        rotuloOk: 'Apagar o material', perigo: true,
        acao: async () => {
          await this.dado(OS.getClient().rpc('og_material_apagar', { p_id: item.id }));
          this.avisa('O material foi apagado.');
          await this.carregaMateriais(true);
        },
      });
    },

    // ── participantes ──
    async abreParticipantes() { await this.carregaParticipantes(); },
    async carregaParticipantes(quieto) {
      const p = this.part, id = this.rotaId, gen = ++OG_GEN_PART;
      if (!quieto) { p.estado = 'carregando'; p.erro = ''; }
      try {
        const lista = await this.dado(OS.getClient().rpc('og_participantes', { p_grupo: id }));
        if (gen !== OG_GEN_PART || this.rotaId !== id) return;
        p.lista = Array.isArray(lista) ? lista : [];
        p.estado = 'pronto';
      } catch (e) {
        if (gen !== OG_GEN_PART) return;
        if (!quieto || p.estado !== 'pronto') { p.estado = 'erro'; p.erro = this.textoErro(e); }
      }
    },
    get partFiltrados() {
      const q = String(this.part.busca || '').trim().toLowerCase();
      const so = q.replace(/\D/g, '');
      if (!q) return this.part.lista;
      return this.part.lista.filter((x) => String(x.nome || '').toLowerCase().includes(q) || (so && String(x.telefone || '').replace(/\D/g, '').includes(so)));
    },
    async atualizaParticipantes() {
      const p = this.part, id = this.rotaId;
      if (p.atualizando || !this.grupo) return;
      p.atualizando = true; p.erroAtualiza = '';
      const r = await this.edge({ acao: 'participantes', grupo: id }, 60000);
      p.atualizando = false;
      if (this.rotaId !== id) return;
      if (!r || r.ok !== true) { p.erroAtualiza = (r && r.erro) || 'Não foi possível atualizar os participantes agora.'; return; }
      if (Array.isArray(r.participantes)) { p.lista = r.participantes; p.estado = 'pronto'; }
      else await this.carregaParticipantes(true);
      if (this.grupo) this.grupo.participantes_total = p.lista.length;
      this.avisa('A lista de participantes foi atualizada.');
    },

    // ── ajustes do grupo ──
    abreAjustesGrupo() {
      const g = this.grupo;
      if (!g) return;
      this.ag = Object.assign(ogAgInicial(), { auto: !!g.resumo_auto, hora: Number(g.resumo_hora == null ? 20 : g.resumo_hora), envia: !!g.resumo_envia });
    },
    get horasDoDia() { return Array.from({ length: 24 }, (_, h) => ({ valor: h, rotulo: h + 'h' })); },
    get agMudou() {
      const g = this.grupo, a = this.ag;
      if (!g) return false;
      return !!g.resumo_auto !== !!a.auto || Number(g.resumo_hora == null ? 20 : g.resumo_hora) !== Number(a.hora) || !!g.resumo_envia !== !!(a.auto && a.envia);
    },
    // Quando sai o próximo resumo automático. O servidor devolve o instante em proximo_auto (ao abrir o grupo e ao salvar).
    // Se a hora de hoje já passou, o próximo cai amanhã e a tela avisa. Com alteração ainda não salva, não mostra nada.
    get proximoAuto() {
      const g = this.grupo;
      if (!g || !g.resumo_auto || !g.proximo_auto || this.agMudou) return null;
      const t = ogMs(g.proximo_auto);
      if (t === null) return null;
      // a hora de hoje já passou e o resumo de hoje ainda não saiu: o servidor devolve "agora", e ele sai na próxima rodada da agenda
      if (t <= Date.now() + 60000) return { texto: 'O próximo resumo automático sai na próxima rodada da agenda, em até 15 minutos.', amanha: false };
      const amanha = OG_F_CHAVE.format(new Date(Date.now() + 86400000));
      return {
        texto: 'O próximo resumo automático sai ' + this.diaCurto(g.proximo_auto) + ' às ' + this.horaCheia(g.proximo_auto) + '.',
        amanha: OG_F_CHAVE.format(new Date(t)) === amanha,
      };
    },
    async salvaAutomatico() {
      const a = this.ag;
      if (a.salvando || !this.grupo || !this.podeAdministrar) return;
      a.erro = ''; a.ok = ''; a.salvando = true;
      const dados = { resumo_auto: !!a.auto, resumo_hora: Number(a.hora), resumo_envia: !!(a.auto && a.envia) };
      try {
        const g = await this.dado(OS.getClient().rpc('og_grupo_salvar', { p_grupo: this.grupo.id, p_dados: dados }));
        this.aplicaGrupo(g);
        a.ok = 'O resumo automático foi salvo.';
        this.avisa(a.ok);
      } catch (e) { a.erro = this.textoErro(e); }
      finally { a.salvando = false; }
    },
    async alternaPausa() {
      const a = this.ag, g = this.grupo;
      if (a.pausando || !g || !this.podeConfigurar) return;
      a.erroPausa = ''; a.pausando = true;
      const dados = { ativo: !g.ativo };
      try {
        const novo = await this.dado(OS.getClient().rpc('og_grupo_salvar', { p_grupo: g.id, p_dados: dados }));
        this.aplicaGrupo(novo);
        if (novo && typeof novo === 'object' && novo.ativo === undefined) g.ativo = dados.ativo;
        this.avisa(g.ativo ? 'O grupo voltou a ser acompanhado.' : 'O grupo foi pausado.');
      } catch (e) { a.erroPausa = this.textoErro(e); }
      finally { a.pausando = false; }
    },
    pedeRemoverGrupo() {
      const g = this.grupo;
      if (!g || !this.podeConfigurar) return;
      this.pedeConfirmacao({
        titulo: 'Deixar de acompanhar este grupo',
        texto: 'Ao deixar de acompanhar "' + g.nome + '", a conversa guardada será apagada, junto com os resumos, as perguntas, as orientações e os materiais do grupo. Isso não pode ser desfeito.',
        rotuloOk: 'Apagar e deixar de acompanhar', perigo: true,
        acao: async () => {
          await this.dado(OS.getClient().rpc('og_grupo_remover', { p_grupo: g.id }));
          this.avisa('O grupo deixou de ser acompanhado.');
          this.vai('#grupos');
          await this.carregaPainel(true);
        },
      });
    },
  };
}
