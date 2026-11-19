/* ============================================================================
   Grupos · 01 base: login, acesso, rotas, avisos, chamadas ao servidor e ajudantes
   ----------------------------------------------------------------------------
   A tela é um app Alpine só (grApp, em 99-monta.js) feito de partes, uma por assunto. O menu lateral, o cabeçalho e o
   Dia/Noite são a casca da base (/shared/casca.js), a mesma de Usuários e de Minha conta.
   Cada parte é uma função que devolve um pedaço do estado:
     01-base.js       login e acesso, rotas, avisos, chamadas ao servidor, ajudantes
     02-grupos.js     a lista de grupos, os primeiros passos, a janela Escolher grupos, o exemplo
     03-grupo.js      o grupo aberto e a aba Conversa (com a assinatura em tempo real)
     04-resumos.js    as abas Resumos e Perguntar à IA, e a janela de envio ao grupo
     05-extras.js     as abas Orientações e materiais, Participantes e Ajustes do grupo
     06-ajustes.js    os Ajustes: WhatsApp (QR), IA, transcrição de áudio e grupo de exemplo
   Nome de função novo precisa ser um nome novo: duas partes com o mesmo nome fazem a de baixo
   comer a de cima (o 99-monta.js avisa no console). Procure antes de criar.

   Regras desta tela:
   . todo texto que vem do banco entra na tela só como texto (x-text ou atributo do Alpine) e nunca
     é montado como HTML, então o navegador não executa nada que alguém escreva no grupo;
   . token e chave nunca voltam do servidor: a tela só sabe se estão configurados;
   . o banco e a Edge Function conferem o acesso de novo, esta tela só esconde o que a pessoa não pode usar.
   ============================================================================ */
const GR_FUSO = 'America/Sao_Paulo';
const GR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GR_ABAS = ['conversa', 'resumos', 'perguntar', 'materiais', 'participantes', 'ajustes'];
const GR_SECOES = ['whatsapp', 'ia', 'transcricao', 'exemplo'];
const GR_PROVEDORES_IA = { openai: 'OpenAI', anthropic: 'Claude', deepseek: 'DeepSeek', compativel: 'Compatível com OpenAI' };
// formatadores criados uma vez, fora do estado do Alpine (criar dentro de laço deixa a tela lenta)
const GR_F_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const GR_F_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const GR_F_DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, day: '2-digit', month: '2-digit' });
const GR_F_DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, day: 'numeric', month: 'long' });
const GR_F_DIA_ANO = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, day: 'numeric', month: 'long', year: 'numeric' });
const GR_F_CHAVE = new Intl.DateTimeFormat('en-CA', { timeZone: GR_FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const GR_F_HH = new Intl.DateTimeFormat('pt-BR', { timeZone: GR_FUSO, hour: '2-digit', hourCycle: 'h23' });
const GR_F_REL = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

let GR_ACAO_CONF = null;      // o que a janela de confirmação executa (fora do estado reativo)
let GR_TIMER_AVISO = null;

function grMs(iso) {
  if (iso === null || iso === undefined || iso === '') return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

function grBase() {
  return {
    // ── estado geral ──
    pronto: false, eu: null, nivel: 'view',
    rota: 'grupos', rotaId: null, aba: 'conversa', secao: 'whatsapp',
    menuAberto: false,
    tarefa: '',                         // o texto do carregando por cima da tela (vazio = sem)
    erro: '',                           // erro de uma ação, no alto da página
    aviso: { texto: '', tom: 'ok' },    // o aviso curto que sobe na tela
    conf: { aberto: false, titulo: '', texto: '', rotuloOk: 'Confirmar', perigo: false, rodando: false, erro: '' },

    async init() {
      // login e acesso "grupos" (chave restrita: sem sessão volta à porta de entrada, sem acesso mostra o bloqueio padrão)
      const acc = await OS.requireAccessEstrito('grupos', { loginPath: '/' });
      if (!acc) return;
      const perfil = await OS.getMyProfile().catch(() => null);
      this.eu = perfil ? { id: perfil.id, nome: perfil.nome || perfil.full_name || 'Você', foto: perfil.foto_url || perfil.avatar_url || null } : null;
      this.nivel = OS.accessModeOf ? OS.accessModeOf(acc, 'grupos') : 'view';
      document.getElementById('gr-app').style.display = '';
      this.pronto = true;
      await this.carregaPainel();
      window.addEventListener('hashchange', () => this.leRota());
      this.leRota(true);
    },

    // ── rotas: #grupos, #grupo/<id>/<aba> e #ajustes/<seção> ──
    leRota(primeira) {
      const h = (location.hash || '#grupos').replace(/^#\/?/, '').split('/');
      let rota = 'grupos', id = null, aba = 'conversa', secao = 'whatsapp';
      if (h[0] === 'grupo' && GR_UUID.test(h[1] || '')) {
        rota = 'grupo'; id = h[1].toLowerCase(); aba = GR_ABAS.includes(h[2]) ? h[2] : 'conversa';
      } else if (h[0] === 'ajustes') {
        rota = 'ajustes'; secao = GR_SECOES.includes(h[1]) ? h[1] : 'whatsapp';
      }
      const antes = this.rota, idAntes = this.rotaId;
      this.fechaTudo();
      this.rota = rota; this.rotaId = id; this.aba = aba; this.secao = secao;
      this.erro = ''; this.menuAberto = false;
      if (window.Casca) Casca.fecha();
      if (primeira || antes !== rota || idAntes !== id) window.scrollTo(0, 0);
      if (rota === 'grupos') this.abreGrupos();
      if (rota === 'grupo') this.abreGrupo(id, aba);
      if (rota === 'ajustes') this.abreAjustes(secao, antes !== 'ajustes');
    },
    vai(destino) { location.hash = destino; },
    // para tudo o que fica ligado enquanto uma tela está aberta (tempo real da conversa, atualização do QR)
    fechaTudo() {
      if (this.fechaConversa) this.fechaConversa();
      if (this.paraQr) this.paraQr();
    },
    get tituloRota() {
      if (this.rota === 'grupo') return this.grupo ? this.grupo.nome : 'Grupo';
      return { grupos: '', ajustes: 'Ajustes' }[this.rota] || '';
    },
    get papelTexto() {
      if (!this.painel) return 'carregando';
      if (this.painel.pode_configurar) return 'administra e configura';
      if (this.painel.pode_administrar) return 'edita os grupos';
      return 'só visualiza';
    },

    // O Dia/Noite, o menu e o cabeçalho são da casca da base (/shared/casca.js): ela guarda o tema por pessoa em
    // hub.user_prefs, chave "grupos:tema", e mostra no cabeçalho o que estiver em tituloRota.

    // ── falar com o banco e com o servidor ──
    // Uso: await this.dado(OS.getClient().rpc('gr_grupo', { p_grupo: id })). A chamada fica escrita
    // por inteiro em cada lugar para o teste telas-x-banco conferir o nome e os parâmetros.
    async dado(promessa) {
      const r = await promessa;
      if (r && r.error) throw r.error;
      return r ? r.data : null;
    },
    // A Edge Function gr-api. Devolve sempre um objeto: { ok: true } com os campos da ação, ou { ok: false, erro: "frase" }.
    // O corpo do erro HTTP também é lido (error.context.json), como no Calls.
    // Quando a resposta do servidor não chegou (demorou demais, a conexão caiu ou veio ilegível), o objeto leva
    // sem_resposta: true. Quem manda algo que não se desfaz (o envio ao grupo) precisa saber disso, porque a ação pode ter acontecido.
    async edge(corpo, esperaMs) {
      const chamada = (async () => {
        try {
          const { data, error } = await OS.getClient().functions.invoke('gr-api', { body: corpo });
          if (!error) return (data && typeof data === 'object') ? data : { ok: false, sem_resposta: true, erro: 'O servidor respondeu num formato inesperado. Tente de novo.' };
          let det = null;
          try { det = error.context && typeof error.context.json === 'function' ? await error.context.json() : null; } catch (e) { det = null; }
          if (det && typeof det === 'object') return det;
          return { ok: false, sem_resposta: true, erro: 'O servidor do módulo não respondeu. ' + this.textoErro(error) };
        } catch (e) {
          return { ok: false, sem_resposta: true, erro: this.textoErro(e) };
        }
      })();
      const tempo = new Promise((resolve) => setTimeout(() => resolve({ ok: false, sem_resposta: true, erro: 'O servidor demorou demais para responder. Tente de novo em instantes.' }), esperaMs || 60000));
      return Promise.race([chamada, tempo]);
    },
    textoErro(e) {
      const m = String((e && (e.message || e.error_description || e.details || e.erro)) || e || '').trim();
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'A conexão com o servidor falhou. Confira a internet e tente de novo.';
      return m || 'Algo deu errado. Tente de novo.';
    },

    // ── avisos, carregando e confirmação ──
    avisa(texto, tom) {
      this.aviso = { texto: String(texto || ''), tom: tom || 'ok' };
      clearTimeout(GR_TIMER_AVISO);
      GR_TIMER_AVISO = setTimeout(() => { this.aviso.texto = ''; }, 5000);
    },
    // o carregando por cima da tela, para o que trava tudo por alguns segundos
    async comTarefa(msg, fn) {
      this.tarefa = msg; this.erro = '';
      try { return await fn(); }
      catch (e) { this.erro = this.textoErro(e); window.scrollTo(0, 0); return undefined; }
      finally { this.tarefa = ''; }
    },
    pedeConfirmacao(o) {
      GR_ACAO_CONF = o.acao || null;
      this.conf = { aberto: true, titulo: o.titulo, texto: o.texto, rotuloOk: o.rotuloOk || 'Confirmar', perigo: !!o.perigo, rodando: false, erro: '' };
    },
    async confirma() {
      if (!GR_ACAO_CONF || this.conf.rodando) return;
      this.conf.rodando = true; this.conf.erro = '';
      try { await GR_ACAO_CONF(); this.conf.aberto = false; GR_ACAO_CONF = null; }
      catch (e) { this.conf.erro = this.textoErro(e); }
      finally { this.conf.rodando = false; }
    },
    fechaConf() { if (this.conf.rodando) return; this.conf.aberto = false; GR_ACAO_CONF = null; },
    // Esc fecha a janela que estiver por cima
    // janela aberta: o foco entra nela e o Tab dá a volta só entre os botões e campos dela
    focaJanela(el) {
      this.$nextTick(() => {
        if (!el || el.contains(document.activeElement)) return;
        const alvo = el.querySelector('[autofocus], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]');
        if (alvo) alvo.focus({ preventScroll: true });
      });
    },
    prendeFoco(ev, el) {
      const itens = Array.from(el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((x) => x.offsetParent !== null);
      if (!itens.length) return;
      const primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
    },
    fechaJanelas() {
      if (this.conf.aberto) return this.fechaConf();
      if (this.envio && this.envio.aberto) return this.fechaEnvio();
      if (this.mat && this.mat.form.aberto) return this.fechaMaterial();
      if (this.escolher && this.escolher.aberto) return this.fechaEscolher();
    },

    // ── ajudantes de tela ──
    numero(v) { return Number(v || 0).toLocaleString('pt-BR'); },
    plural(n, um, varios) { return Number(n) === 1 ? um : varios; },
    quando(iso) {
      const t = grMs(iso); if (t === null) return '';
      const d = new Date(t);
      return GR_F_DATA.format(d) + ' às ' + GR_F_HORA.format(d);
    },
    hora(iso) { const t = grMs(iso); return t === null ? '' : GR_F_HORA.format(new Date(t)); },
    diaCurto(iso) { const t = grMs(iso); return t === null ? '' : GR_F_DIA_CURTO.format(new Date(t)); },
    diaChave(iso) { const t = grMs(iso); return t === null ? '' : GR_F_CHAVE.format(new Date(t)); },
    diaRotulo(iso) {
      const t = grMs(iso); if (t === null) return '';
      const chave = GR_F_CHAVE.format(new Date(t));
      if (chave === GR_F_CHAVE.format(new Date())) return 'Hoje';
      if (chave === GR_F_CHAVE.format(new Date(Date.now() - 86400000))) return 'Ontem';
      const mesmoAno = chave.slice(0, 4) === GR_F_CHAVE.format(new Date()).slice(0, 4);
      return (mesmoAno ? GR_F_DIA_LONGO : GR_F_DIA_ANO).format(new Date(t));
    },
    // "há 5 minutos", "ontem", "há 3 dias"
    relativo(iso) {
      const t = grMs(iso); if (t === null) return '';
      const s = Math.round((t - Date.now()) / 1000), a = Math.abs(s);
      if (a < 45) return GR_F_REL.format(0, 'second');
      if (a < 3600) return GR_F_REL.format(Math.round(s / 60), 'minute');
      if (a < 86400) return GR_F_REL.format(Math.round(s / 3600), 'hour');
      if (a < 86400 * 30) return GR_F_REL.format(Math.round(s / 86400), 'day');
      return GR_F_REL.format(Math.round(s / (86400 * 30)), 'month');
    },
    // minutos viram "12 min", "1 h 05 min" ou "2 dias"
    duracaoMin(min) {
      if (min === null || min === undefined || isNaN(Number(min))) return '';
      const m = Math.round(Number(min));
      if (m < 60) return m + ' min';
      if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + String(r).padStart(2, '0') + ' min' : ''); }
      const d = Math.floor(m / 1440); return d + (d === 1 ? ' dia' : ' dias');
    },
    telefone(t) {
      const d = String(t || '').replace(/\D/g, '');
      if (!d) return '';
      if (d.length >= 12 && d.startsWith('55')) {
        const ddd = d.slice(2, 4), n = d.slice(4);
        return '+55 ' + ddd + ' ' + (n.length === 9 ? n.slice(0, 5) + '-' + n.slice(5) : n.length === 8 ? n.slice(0, 4) + '-' + n.slice(4) : n);
      }
      return '+' + d;
    },
    // O identificador do WhatsApp só vira telefone quando é de verdade um número (terminado em @s.whatsapp.net ou em @c.us).
    // Identificador de outro tipo (@lid, por exemplo) não é telefone, e formatá-lo mostraria um número que não existe.
    telefoneDoJid(jid) {
      const m = String(jid || '').match(/^(\d{8,15})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/);
      return m ? this.telefone(m[1]) : '';
    },
    // o nome de quem escreveu: o nome salvo, o telefone, e "Participante" quando não há nenhum dos dois
    nomeDoAutor(nome, jid) { return String(nome || '').trim() || this.telefoneDoJid(jid) || 'Participante'; },
    // "20h", "09h" (a hora cheia, no fuso de Brasília)
    horaCheia(iso) { const t = grMs(iso); return t === null ? '' : GR_F_HH.format(new Date(t)).padStart(2, '0') + 'h'; },
    // as letras de dentro do nome (um emoji ou símbolo no começo não vira inicial quebrada)
    iniciais(nome) {
      const letras = String(nome || '').trim().split(/\s+/).map((p) => { const m = p.match(/[\p{L}\p{N}]/u); return m ? m[0].toUpperCase() : ''; }).filter(Boolean);
      return letras.slice(0, 2).join('') || '?';
    },
    // uma cor estável por pessoa (pelo nome), clara o bastante para texto escuro nos dois temas
    corAvatar(nome) {
      let h = 0; const s = String(nome || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
      // tons do design system misturados ao fundo do cartão: o nome continua com a mesma cor e o texto passa no contraste
      const tons = ['--acc', '--ok', '--warn', '--risk', '--ink-2', '--m-mark'];
      return 'background-color:color-mix(in srgb,var(' + tons[h % tons.length] + ') 26%,var(--surface));color:var(--ink)';
    },
    // só endereço http ou https vira link; qualquer outra coisa (javascript:, data:) vira nada
    urlSegura(u) { return /^https?:\/\/[^\s]+$/i.test(String(u || '')) ? String(u) : '#'; },
    nomeProvedor(p) { return GR_PROVEDORES_IA[p] || String(p || ''); },
    async copiaTexto(texto) {
      try { await navigator.clipboard.writeText(String(texto)); return true; }
      catch (e) {
        try {
          const t = document.createElement('textarea');
          t.value = String(texto); t.style.position = 'fixed'; t.style.opacity = '0';
          document.body.appendChild(t); t.select();
          const ok = document.execCommand('copy'); t.remove(); return ok;
        } catch (e2) { return false; }
      }
    },
    // Leva o cursor para o campo e o traz para o meio da tela. Se o campo estava escondido, espera o Alpine mostrá-lo
    // (o x-show mostra o elemento um quadro depois da mudança).
    focaCampo(id) {
      let tentativas = 0;
      const tenta = () => {
        try {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.getClientRects && !el.getClientRects().length && tentativas++ < 20) { setTimeout(tenta, 30); return; }
          if (el.focus) el.focus({ preventScroll: true });
          if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) { /* sem foco, a mensagem de erro já avisa */ }
      };
      this.$nextTick(tenta);
    },
    // O nome do período como a pessoa lê: "Hoje, 14/10", "Dia 12/10", "Últimas 6 horas", "Últimas 24 horas, até 12/10", "De 01/10 a 07/10".
    // "Hoje" e "Ontem" só valem enquanto o dia ainda é esse; um resumo antigo mostra a data.
    rotuloPeriodo(periodo, inicio, fim) {
      const hoje = GR_F_CHAVE.format(new Date()), ontem = GR_F_CHAVE.format(new Date(Date.now() - 86400000));
      const ate = () => { const k = this.diaChave(fim); return k && k !== hoje ? ', até ' + this.diaCurto(fim) : ''; };
      if (periodo === '6h') return 'Últimas 6 horas' + ate();
      if (periodo === '12h') return 'Últimas 12 horas' + ate();
      if (periodo === '24h') return 'Últimas 24 horas' + ate();
      if (periodo === '7d') return 'Últimos 7 dias' + ate();
      if (periodo === 'hoje' || periodo === 'ontem') {
        const k = this.diaChave(inicio), d = this.diaCurto(inicio);
        if (!k) return periodo === 'hoje' ? 'Hoje' : 'Ontem';
        return (k === hoje ? 'Hoje, ' : (k === ontem ? 'Ontem, ' : 'Dia ')) + d;
      }
      if (periodo === 'datas') {
        const f = grMs(fim);
        const ultimo = f === null ? '' : this.diaCurto(new Date(f - 1000).toISOString());
        if (ultimo && ultimo === this.diaCurto(inicio)) return 'Dia ' + ultimo;
        return 'De ' + this.diaCurto(inicio) + (ultimo ? ' a ' + ultimo : '');
      }
      return String(periodo || '');
    },
  };
}
