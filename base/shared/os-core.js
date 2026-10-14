// Base · módulo compartilhado (os-core) v1.0
// Carregue este arquivo em qualquer hub antes dos scripts específicos do hub.
// Expõe window.OS com: getClient(), Auth, Bus, Nav, getMyProfile()
//
// Uso num hub:
//   <script src="/shared/os-core.js"></script>

(function () {
  'use strict';

  // ── Credenciais (substituídas pelo build.sh em produção) ─────────────────
  const _URL = '%SUPABASE_URL%';
  const _KEY = '%SUPABASE_ANON_KEY%';

  // ── Endereço do sistema ──────────────────────────────────────────────────
  // TODO link que a gente COPIA, MANDA ou GRAVA sai com este domínio, e só ele.
  // `location.origin` NÃO serve pra isso: ele devolve o endereço de onde a
  // PESSOA está no momento — uma preview, localhost:8088 — e o link nasce
  // carregando esse endereço pra sempre: no WhatsApp do cliente, no e-mail do
  // candidato, num aviso. Ninguém volta pra consertar depois.
  const SITE = 'https://app.seudominio.com.br';

  // OS.link('/outjourney/briefing?c=' + id)
  //   → 'https://app.seudominio.com.br/outjourney/briefing?c=…'
  // Aceita com ou sem a barra da frente; endereço que já é absoluto passa
  // direto (não reescreve link de fora, tipo Drive ou Zoom).
  function link(caminho) {
    const c = String(caminho == null ? '' : caminho);
    if (/^[a-z][a-z0-9+.-]*:/i.test(c)) return c;
    return SITE + (c.charAt(0) === '/' ? c : '/' + c);
  }

  // ── Tela do CLIENTE ──────────────────────────────────────────────────────
  // O portal e o que o cliente abre a partir dele (briefing, agenda, cadastro do
  // time, avaliação da call). Nessas telas não aparecem a barra do app, o ✦ do
  // assistente nem o sino — mesmo que alguém do time esteja logado no mesmo
  // navegador (o assistente e os avisos são coisa do time, não do cliente).
  // A decisão é pelo CAMINHO da tela: o portal mora no mesmo domínio do sistema.
  function telaDoCliente() {
    const p = (location.pathname || '').toLowerCase();
    return /^\/(outjourney\/)?(cliente|briefing|agendar|time)(\.html)?([?#/]|$)/.test(p);
  }

  // ── Cliente Supabase (singleton) ─────────────────────────────────────────
  let _sb = null;

  function getClient() {
    if (_sb) return _sb;
    if (!window.supabase) throw new Error('[OS] Supabase SDK não carregado. Adicione o script antes de os-core.js.');
    _sb = window.supabase.createClient(_URL, _KEY, {
      db:   { schema: 'hub' },
      auth: { storageKey: 'os:sb-auth', persistSession: true, autoRefreshToken: true },
    });
    _vigiaSessao(_sb);
    return _sb;
  }

  // ── Sessão que CAI no meio do uso tem que se DIZER · [sessao-caiu-avisa-25-09-2026]
  // Quando o login vence e não consegue se renovar (token revogado, outra aba
  // saiu, pessoa desligada), o Supabase apaga a sessão calado e a tela SEGUE
  // ABERTA: tudo o que a pessoa clica passa a ir como anônimo, e o banco
  // responde "permission denied for table …". Pra quem está usando isso parece
  // defeito do sistema (25/09/2026: "Erro ao atualizar etapa: permission denied
  // for table oj_jornada_progresso"). Agora a tela diz o que aconteceu e leva
  // pra entrar de novo, voltando pro mesmo lugar (?volta=).
  // Sair pelo botão (OS.Auth.signOut) NÃO mostra o aviso: aí foi a pessoa.
  let _saidaPedida = false;
  function _vigiaSessao(sb) {
    try {
      sb.auth.onAuthStateChange((evento) => {
        if (evento !== 'SIGNED_OUT' || _saidaPedida) return;
        const p = location.pathname;
        if (p === '/' || p === '/index.html') return;   // o launcher é a própria porta de entrada
        _avisoSessaoCaiu();
      });
    } catch (e) { console.warn('[OS] vigia da sessão:', e && e.message || e); }
  }
  function _avisoSessaoCaiu() {
    if (document.getElementById('os-sessao-caiu')) return;
    const d = document.createElement('div');
    d.id = 'os-sessao-caiu';
    d.setAttribute('role', 'alertdialog');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif';
    d.innerHTML = '<div style="background:#fff;color:#111;max-width:420px;width:100%;border-radius:12px;padding:22px 22px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3)">'
      + '<div style="font-weight:700;font-size:16px;margin-bottom:8px">Sua sessão terminou</div>'
      + '<div style="font-size:14px;line-height:1.45;color:#333;margin-bottom:16px">O login deste navegador venceu ou foi encerrado. Enquanto não entrar de novo, <b>nada do que você fizer nesta tela será gravado</b>. Se estava escrevendo algo, copie o texto antes.</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      + '<button type="button" data-fechar style="border:1px solid #ccc;background:#fff;color:#111;border-radius:8px;padding:8px 12px;cursor:pointer">Copiar meu texto antes</button>'
      + '<a data-entrar style="background:#111;color:#fff;border-radius:8px;padding:8px 14px;text-decoration:none;font-weight:600">Entrar de novo</a>'
      + '</div></div>';
    d.querySelector('[data-entrar]').href = comVolta('/');
    d.querySelector('[data-fechar]').onclick = () => {
      // some por 20 s pra pessoa copiar o que digitou, e volta — a sessão continua caída
      d.style.display = 'none';
      setTimeout(() => { d.style.display = 'flex'; }, 20000);
    };
    (document.body || document.documentElement).appendChild(d);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const Auth = {
    async signIn(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      _saidaPedida = true;   // foi a pessoa que saiu: nada de aviso de sessão caída
      // saiu da conta = este aparelho para de receber aviso dela [app-celular-28-09-2026]
      await Promise.race([appDesligarNotificacoes(), new Promise((r) => setTimeout(r, 1500))]);
      await getClient().auth.signOut();
    },

    async getSession() {
      const { data } = await getClient().auth.getSession();
      return data?.session ?? null;
    },

    async getUser() {
      const { data } = await getClient().auth.getUser();
      return data?.user ?? null;
    },

    onChange(callback) {
      return getClient().auth.onAuthStateChange(callback);
    },

    // Redireciona para loginPath se não houver sessão ativa.
    // Retorna a sessão se autenticado, null caso contrário.
    async requireAuth(loginPath = '/') {
      const session = await this.getSession();
      if (!session) { window.location.href = comVolta(loginPath); return null; }
      return session;
    },
  };

  // ── Voltar pra onde a pessoa QUERIA ir ───────────────────────────────────
  // Quem abre um link direto de uma tela (aviso, e-mail, WhatsApp) num
  // navegador sem sessão vai pro launcher; o destino viaja no `?volta=` e o
  // launcher devolve a pessoa pra lá depois que ela entra.
  function comVolta(loginPath) {
    const destino = location.pathname + location.search + location.hash;
    // Já tem query? respeita. E launcher com `volta` não empilha outro.
    if (/[?&]volta=/.test(loginPath)) return loginPath;
    return loginPath + (loginPath.includes('?') ? '&' : '?') + 'volta=' + encodeURIComponent(destino);
  }

  // ── BroadcastChannel (comunicação entre hubs na mesma origem) ────────────
  // Exemplo de uso:
  //   OS.Bus.on('cliente:atualizado', ({ id }) => recarregarCliente(id))
  //   OS.Bus.emit('cliente:atualizado', { id: '...' })
  const Bus = (() => {
    const ch = new BroadcastChannel('boraia-hub');
    return {
      emit(event, payload) {
        ch.postMessage({ event, payload, from: location.pathname });
      },
      on(event, handler) {
        ch.addEventListener('message', (e) => {
          if (e.data?.event === event) handler(e.data.payload, e.data.from);
        });
      },
    };
  })();

  // ── Navegação entre hubs ─────────────────────────────────────────────────
  const Nav = {
    hubs: {
      outjourney:  '/outjourney/',
      outfunnels:     '/outfunnels',
      outprojetos: '/outprojetos/',
      outsign:     '/outsign/',
      rh:          '/rh/',
      outperformance: '/outperformance/',
      performance: '/outperformance/',   // nome antigo (OutPerformance): continua valendo em OS.Nav.go
      produtos:    '/produtos/',
      financeiro:  '/outfinanceiro/',
      outprocessos: '/outprocessos/',
      processos:   '/outprocessos/',     // nome antigo (OutProcessos)
    },

    go(hub, path = '') {
      const base = this.hubs[hub];
      if (!base) throw new Error(`[OS] Hub desconhecido: "${hub}"`);
      const url = base.startsWith('http') ? base : base + path;
      if (base.startsWith('http')) window.open(url, '_blank');
      else window.location.href = url;
    },
  };

  // ── Acessos por subsistema ────────────────────────────────────────────────
  // Lê hub.users do usuário logado.
  // Retorna { acessos:{}, level, authed, active, naBase }.
  // `acessos` é um jsonb tipo { journey:true, chat:false, performance:true, ... }.
  // Regra do SUBSISTEMA: chave ausente OU true = LIBERADO (default allow).
  // Regra de ESTAR NO TIME: é fechada — ver estaNoTime() logo abaixo.
  async function getMyAccess() {
    const user = await Auth.getUser();
    if (!user) return { acessos: {}, level: 'collaborator', authed: false, active: false, naBase: false };
    const { data, error } = await getClient()
      .from('users')
      .select('acessos, access_level, active')
      .eq('id', user.id)
      .maybeSingle();
    if (error) console.warn('[OS] getMyAccess:', error.message);
    return {
      acessos: (data && data.acessos) || {},
      level:   (data && data.access_level) || 'collaborator',
      authed:  true,
      // Sem linha em hub.users a pessoa não é da casa: barra.
      naBase:  !!data,
      // `active === false` é quem foi desligado e quem se cadastrou
      // sozinho pela porta do Supabase (o gatilho faz nascer desligado).
      active:  !!data && data.active !== false,
    };
  }

  // ── ESTAR NO TIME é trava FECHADA (28/08/2026) ────────────────────────────
  // Ter sessão do Supabase NÃO é ser da casa. O cadastro do Supabase aceita
  // qualquer e-mail e o login com Google entrega sessão na hora — e até aqui o
  // os-core só olhava `acessos` e `access_level`, nunca o `active`. Resultado:
  // quem se cadastrasse sozinho ganhava ficha em hub.users e passava em todos
  // os gates; e quem foi DESLIGADO continuava entrando com a sessão aberta
  // (era o caso de uma pessoa no dia em que isto foi escrito), apesar da
  // regra dizer que desligou = acesso suspenso em todos os sistemas.
  // Aqui não existe "ausente = liberado": ou a pessoa está no hub.users e
  // ativa, ou não entra em lugar nenhum.
  function estaNoTime(acc) {
    return !!(acc && acc.authed && acc.naBase && acc.active !== false);
  }

  // true se o usuário pode abrir o subsistema `key` (default allow).
  function canAccess(acessos, key) {
    return !acessos || acessos[key] !== false;
  }

  // true se o usuário é ADMIN do subsistema `key`.
  //   - Admin geral (access_level==='admin') é admin de todos os sistemas.
  //   - Senão, é admin só onde acessos[key] === 'admin'.
  // Uso: OS.isSystemAdmin('journey') (async) ou OS.isSystemAdminOf(acc, 'journey') com o acc já lido.
  function isSystemAdminOf(acc, key) {
    if (!acc) return false;
    if (acc.level === 'admin') return true;
    return (acc.acessos || {})[key] === 'admin';
  }
  async function isSystemAdmin(key) {
    return isSystemAdminOf(await getMyAccess(), key);
  }

  // ── Modo de acesso: só visualizar × editar ────────────────────────────────
  // O valor de acessos[key] pode ser:
  //   false     → sem acesso        (não abre o sistema)
  //   'view'    → só visualizar      (abre, mas NÃO pode editar)
  //   'admin'   → admin do sistema   (pode tudo)
  //   true/aus. → acesso comum       (pode editar)
  // Admin geral (level==='admin') pode editar em todos.
  function accessModeOf(acc, key) {
    if (!acc) return 'edit';
    if (acc.level === 'admin') return 'admin';
    var v = (acc.acessos || {})[key];
    if (v === false) return 'none';
    if (v === 'view') return 'view';
    if (v === 'admin') return 'admin';
    return 'edit';
  }
  async function accessMode(key) { return accessModeOf(await getMyAccess(), key); }

  // true se PODE EDITAR no subsistema `key` ('view' e 'none' = não).
  // Uso: if (await OS.canEdit('journey')) { ...habilita salvar... }
  function canEditOf(acc, key) { var m = accessModeOf(acc, key); return m === 'edit' || m === 'admin'; }
  async function canEdit(key) { return canEditOf(await getMyAccess(), key); }

  // true se o usuário é "convidado" (perfil só-visualização marcado pelo RH).
  function isGuestOf(acc) { return !!(acc && acc.acessos && acc.acessos._perfil === 'convidado'); }
  async function isGuest() { return isGuestOf(await getMyAccess()); }

  // Adoção incremental do "só visualizar" (o RH já grava; cada tela adota quando quiser).
  // Chame no init: await OS.enforceViewOnly('journey').
  //   • Se o usuário PODE editar naquele sistema → não faz nada, retorna false.
  //   • Se é "só visualizar" → desabilita todo elemento marcado com [data-os-edit]
  //     (botões de salvar/novo/remover, inputs) e mostra um selo discreto. Retorna true.
  // Assim, marcar os controles de edição com data-os-edit basta pra tela virar read-only.
  async function enforceViewOnly(key, opts) {
    opts = opts || {};
    const acc = await getMyAccess();
    if (canEditOf(acc, key)) return false;                 // pode editar → nada a fazer
    if (accessModeOf(acc, key) === 'none') return false;   // sem acesso → é caso do requireAccess
    const lock = (el) => {
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') {
        el.setAttribute('disabled', 'disabled');
      } else {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
      }
      el.setAttribute('title', 'Somente visualização');
    };
    document.querySelectorAll('[data-os-edit]').forEach(lock);
    if (opts.badge !== false && !document.getElementById('os-viewonly-badge')) {
      const b = document.createElement('div');
      b.id = 'os-viewonly-badge';
      b.textContent = '👁 Somente visualização';
      b.style.cssText =
        'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483000;'
        + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12.5px;font-weight:700;'
        + 'color:#5b3d00;background:#ffe9b8;border:1px solid #f2c65a;border-radius:999px;'
        + 'padding:6px 14px;box-shadow:0 4px 14px rgba(0,0,0,.14);';
      (document.body || document.documentElement).appendChild(b);
    }
    return true;
  }

  // Tela de bloqueio padrão (overlay full-screen). Não destrói a página.
  function _renderDenied(loginPath) {
    // uma vez só: tela que confere o acesso duas vezes (Alpine com init() + x-init="init()")
    // não empilha dois bloqueios iguais
    if (document.getElementById('os-sem-acesso')) return;
    const d = document.createElement('div');
    d.id = 'os-sem-acesso';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0E0E10;color:#F2F2F0;text-align:center;padding:24px';
    d.innerHTML = '<div style="max-width:380px"><div style="font-size:30px;margin-bottom:10px">🔒</div>'
      + '<h1 style="font-size:21px;margin:0 0 8px">Sem acesso a este módulo</h1>'
      + '<p style="color:#9A9AA2;font-size:14px;margin:0 0 18px">Seu usuário não tem permissão para abrir esta área. Peça a quem administra o Hub para liberar (tela Usuários).</p>'
      + '<a href="' + loginPath + '" style="background:#E8722B;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px;display:inline-block">← Voltar ao Hub</a></div>';
    document.body.appendChild(d);
  }

  // Garante sessão + acesso ao subsistema `key`.
  //   - Sem sessão  → redireciona para o launcher (loginPath, padrão '/').
  //   - Sem acesso  → chama opts.onDenied(acc) se passado, senão mostra bloqueio padrão.
  // Retorna { acessos, level } se liberado; null se bloqueou (redirect/denied).
  async function requireAccess(key, opts) {
    opts = opts || {};
    const loginPath = opts.loginPath || '/';
    const session = await Auth.getSession();
    if (!session) { window.location.href = comVolta(loginPath); return null; }
    const acc = await getMyAccess();
    // Primeiro a trava fechada: é da casa e está ativo? (28/08/2026)
    if (!estaNoTime(acc)) {
      if (typeof opts.onDenied === 'function') opts.onDenied(acc);
      else _renderDenied(loginPath);
      return null;
    }
    if (key && acc.acessos[key] === false) {
      if (typeof opts.onDenied === 'function') opts.onDenied(acc);
      else _renderDenied(loginPath);
      return null;
    }
    return acc;
  }

  // Trava FECHADA — o contrário do requireAccess (Samara, 25/08/2026).
  //   requireAccess libera por padrão: só barra quem tem `false` gravado, e
  //   admin geral fura sempre. Isso serve pros hubs abertos ao time; NÃO serve
  //   pro Financeiro, onde a lista de quem entra é curta e nominal.
  //   Aqui é o inverso: só entra quem tem o sinal verde gravado em
  //   hub.users.acessos[key] (true / 'view' / 'admin'). Chave ausente = barrado.
  //   Ser admin geral NÃO fura a trava — quem manda é o acessos[key].
  //   Uso: await OS.requireAccessEstrito('financeiro', { loginPath:'/' })
  function temAcessoEstrito(acc, key) {
    if (!acc || !acc.acessos) return false;
    var v = acc.acessos[key];
    return v === true || v === 'view' || v === 'admin';
  }
  async function requireAccessEstrito(key, opts) {
    opts = opts || {};
    const loginPath = opts.loginPath || '/';
    const session = await Auth.getSession();
    if (!session) { window.location.href = comVolta(loginPath); return null; }
    const acc = await getMyAccess();
    if (!estaNoTime(acc) || !temAcessoEstrito(acc, key)) {
      if (typeof opts.onDenied === 'function') opts.onDenied(acc);
      else _renderDenied(loginPath);
      return null;
    }
    return acc;
  }

  // ── Perfil do colaborador logado ─────────────────────────────────────────
  // Lê da tabela universal `hub.colaboradores` via auth_id.
  // Quem está logado. A tabela `colaboradores` está VAZIA (nenhuma ficha), então
  // sem o socorro abaixo toda tela mostrava "você" no lugar do nome da pessoa.
  // Fonte de verdade hoje é `hub.users` (nome, foto e cargo da Gestão de Usuários).
  // Devolve os dois formatos de nome (nome/full_name) e de foto (foto_url/avatar_url)
  // porque as telas antigas leem um e as novas leem o outro.
  async function getMyProfile() {
    const user = await Auth.getUser();
    if (!user) return null;
    const db = getClient();

    const { data: colab, error } = await db
      .from('colaboradores')
      .select('*')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (error) console.warn('[OS] getMyProfile:', error.message);
    if (colab && (colab.nome || colab.full_name)) {
      return Object.assign({}, colab, {
        full_name: colab.full_name || colab.nome,
        avatar_url: colab.avatar_url || colab.foto_url || null,
      });
    }

    const { data: u } = await db
      .from('users')
      // o embed nomeia a chave de propósito: hub.hp_cobranca_inicio aponta pra
      // users e pra roles, então `roles(name)` sozinho vira ambíguo e o
      // PostgREST derruba a consulta (PGRST201) — o perfil voltava sem cargo em
      // TODO hub que usa o os-core. Conferido em 10/09/2026.
      .select('full_name, avatar_url, email, role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .maybeSingle();
    if (!u) return colab || null;
    return {
      id: user.id,
      auth_id: user.id,
      nome: u.full_name,
      full_name: u.full_name,
      email: u.email || user.email,
      foto_url: u.avatar_url || null,
      avatar_url: u.avatar_url || null,
      cargo: (u.roles && u.roles.name) || null,
    };
  }

  // ── Botão flutuante "Voltar ao Hub" ───────────────────────────────
  // Aparece sozinho em todo hub que carrega o os-core (é só editar aqui, vale
  // pra todos). É um pino fixo no canto, position:fixed, então NÃO empurra nem
  // cobre o conteúdo — não atrapalha a visualização de nenhum sistema.
  //
  // Ele se esconde sozinho quando NÃO faz sentido, sem precisar configurar nada:
  //   • no próprio Hub (launcher na raiz "/");
  //   • em páginas públicas/externas (portal do cliente, ficha de admissão,
  //     onboarding, trilha, portal do convidado).
  // Aparece em TODO hub interno (mesmo os que já têm um link "Hub" no
  // cabeçalho — o pino é acesso rápido e fica no canto, não conflita).
  //
  // Se encostar em algo, o usuário FECHA no "×": o botão vira uma aba fininha
  // colada na borda da tela (não cobre nada) e reabre com um clique. A escolha
  // fica guardada no navegador (localStorage), então continua fechado nos
  // próximos acessos até a pessoa reabrir.
  //
  // Escapes (uma linha, se algum sistema quiser controlar):
  //   window.OS_NO_BACK = true;                 // não mostra nesta tela
  //   window.OS_BACK_POSITION = 'bottom-right'; // 'bottom-left'(padrão)|'bottom-right'|'top-left'|'top-right'
  // + as páginas públicas do OutSign (quem assina e quem confere é gente de FORA) e a ficha
  // pública do produto (/produto/ — não confundir com o catálogo interno /produtos/)
  const _BACK_DENY = ['cliente', 'admissao', 'admissão', 'onboarding', 'trilha', 'externo', 'convidado',
    'outsign/assinar', 'outsign/verificar'];
  const _BACK_HIDE_KEY = 'os:back-hidden'; // '1' = usuário fechou (mostra só a aba)

  // Tela aberta DENTRO de outra (iframe, ex.: um painel embutido no OutJourney)
  // não monta ←, sino nem ✦ — a tela de fora já tem (senão aparecem em dobro).
  function _dentroDeQuadro() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  function _shouldShowBack() {
    if (window.OS_NO_BACK === true) return false;
    if (_dentroDeQuadro()) return false;
    const path = (location.pathname || '/').toLowerCase();
    // launcher = raiz do domínio (ele É o Hub)
    if (path === '/' || path === '' || path === '/index.html') return false;
    // páginas públicas/externas
    if (_BACK_DENY.some((k) => path.includes(k))) return false;
    if (path === '/produto' || path.indexOf('/produto/') === 0 || path === '/produto.html') return false;
    return true;
  }

  function _backHidden() {
    try { return localStorage.getItem(_BACK_HIDE_KEY) === '1'; } catch (e) { return false; }
  }
  function _setBackHidden(v) {
    try { v ? localStorage.setItem(_BACK_HIDE_KEY, '1') : localStorage.removeItem(_BACK_HIDE_KEY); } catch (e) {}
  }
  function _backSide() {
    // 'left' ou 'right' conforme o canto escolhido (a aba cola nessa borda)
    return (window.OS_BACK_POSITION || 'bottom-left').indexOf('right') >= 0 ? 'right' : 'left';
  }
  function _backEdge() {
    // eixo vertical do canto (a aba fininha fica na mesma altura do botão)
    return (window.OS_BACK_POSITION || 'bottom-left').indexOf('top') >= 0 ? 'top:16px' : 'bottom:16px';
  }

  // Remove qualquer versão já montada (botão ou aba) antes de redesenhar.
  function _clearBack() {
    const old = document.getElementById('os-back-office');
    if (old) old.remove();
    const tab = document.getElementById('os-back-tab');
    if (tab) tab.remove();
  }

  // Aba fininha na borda (estado "fechado"): não cobre conteúdo, só reabre.
  function _mountBackTab() {
    _clearBack();
    const side = _backSide();
    const t = document.createElement('button');
    t.id = 'os-back-tab';
    t.type = 'button';
    t.title = 'Mostrar o botão do Hub';
    t.setAttribute('aria-label', 'Mostrar o botão do Hub');
    t.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" '
      + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
      + (side === 'right' ? '<path d="m15 18-6-6 6-6"/>' : '<path d="m9 18 6-6-6-6"/>') + '</svg>';
    t.style.cssText =
      'position:fixed;' + _backEdge() + ';' + side + ':0;z-index:2147483000;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'width:16px;height:44px;padding:0;box-sizing:border-box;color:#fff;'
      + 'background:rgba(18,18,20,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(255,255,255,.14);border-' + side + ':none;'
      + (side === 'right' ? 'border-radius:10px 0 0 10px;' : 'border-radius:0 10px 10px 0;')
      + 'cursor:pointer;opacity:.65;transition:opacity .15s,width .15s;';
    t.addEventListener('mouseenter', () => { t.style.opacity = '1'; t.style.width = '20px'; });
    t.addEventListener('mouseleave', () => { t.style.opacity = '.65'; t.style.width = '16px'; });
    t.addEventListener('click', () => { _setBackHidden(false); _mountBackPill(); });
    document.body.appendChild(t);
  }

  // Botão-pílula (estado "aberto"): seta que expande no hover + "×" para fechar.
  function _mountBackPill() {
    _clearBack();
    const posMap = {
      'bottom-left':  'left:16px;bottom:16px',
      'bottom-right': 'right:16px;bottom:16px',
      'top-left':     'left:16px;top:16px',
      'top-right':    'right:16px;top:16px',
    };
    const pos = posMap[window.OS_BACK_POSITION] || posMap['bottom-left'];

    const box = document.createElement('div');
    box.id = 'os-back-office';
    box.style.cssText =
      'position:fixed;' + pos + ';z-index:2147483000;'
      + 'display:inline-flex;align-items:center;'
      + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;'
      + 'background:rgba(18,18,20,.82);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);'
      + 'border:1px solid rgba(255,255,255,.16);border-radius:999px;'
      + 'box-shadow:0 6px 18px rgba(0,0,0,.28);'
      + 'overflow:hidden;white-space:nowrap;max-width:44px;'
      + 'transition:background .15s,border-color .15s,max-width .18s;';

    const a = document.createElement('a');
    a.href = '/';
    a.title = 'Voltar ao Hub';
    a.setAttribute('aria-label', 'Voltar ao Hub');
    a.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
      + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto">'
      + '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>'
      + '<span class="os-back-lbl">Hub</span>';
    a.style.cssText =
      'display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px 0 14px;'
      + 'box-sizing:border-box;font-size:13px;font-weight:700;text-decoration:none;color:#fff;cursor:pointer;';
    const lbl = a.querySelector('.os-back-lbl');
    lbl.style.cssText = 'opacity:0;max-width:0;overflow:hidden;transition:opacity .15s,max-width .18s;';

    // "×" para fechar — só aparece quando o botão está aberto
    const x = document.createElement('button');
    x.type = 'button';
    x.title = 'Fechar (fica uma aba na borda para reabrir)';
    x.setAttribute('aria-label', 'Fechar o botão do Hub');
    x.textContent = '×';
    x.style.cssText =
      'flex:0 0 auto;display:none;align-items:center;justify-content:center;'
      + 'width:22px;height:22px;margin-right:9px;padding:0;line-height:1;'
      + 'font-size:16px;font-weight:700;color:#fff;cursor:pointer;'
      + 'background:rgba(255,255,255,.16);border:none;border-radius:50%;';
    x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); _setBackHidden(true); _mountBackTab(); });

    box.appendChild(a);
    box.appendChild(x);

    const open = () => {
      box.style.maxWidth = '210px';
      box.style.background = 'rgba(232,114,43,.95)';
      box.style.borderColor = 'rgba(232,114,43,.95)';
      lbl.style.opacity = '1'; lbl.style.maxWidth = '120px';
      x.style.display = 'flex';
    };
    const shut = () => {
      box.style.maxWidth = '44px';
      box.style.background = 'rgba(18,18,20,.82)';
      box.style.borderColor = 'rgba(255,255,255,.16)';
      lbl.style.opacity = '0'; lbl.style.maxWidth = '0';
      x.style.display = 'none';
    };
    box.addEventListener('mouseenter', open);
    box.addEventListener('mouseleave', shut);
    a.addEventListener('focus', open);
    x.addEventListener('blur', shut);
    document.body.appendChild(box);
  }

  function _mountBackButton() {
    if (!_shouldShowBack()) return;
    if (_backHidden()) _mountBackTab();
    else _mountBackPill();
  }

  function _initBackButton() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _mountBackButton);
    } else {
      _mountBackButton();
    }
  }
  _initBackButton();

  // ── Recolher menu lateral (desktop) ──────────────────────────────────────
  // "Recolher menu" automático em todo hub que carrega o os-core: acha o menu
  // lateral padrão (.app-side / .shell__sidebar / aside.sidebar) e adiciona um
  // botão "« Recolher menu" no fim dele. Recolhido: o menu some, o conteúdo
  // ocupa a tela toda, e fica uma alça "»" na borda esquerda pra reabrir.
  // A escolha fica salva no navegador POR SISTEMA (localStorage).
  // Só no computador (>=881px) — no celular já existe a gaveta (☰).
  // Hubs com recolher próprio são pulados (o OutPerformance tem #sidebarToggle).
  const _MENU_KEY = 'os:menu-off:' + ((location.pathname || '/').split('/')[1] || 'root');

  function _setMenuOff(v) {
    document.documentElement.classList.toggle('os-menu-off', !!v);
    try { v ? localStorage.setItem(_MENU_KEY, '1') : localStorage.removeItem(_MENU_KEY); } catch (e) {}
  }

  function _mountMenuCollapse() {
    if (document.getElementById('sidebarToggle')) return;   // hub já tem recolher próprio
    const side = document.querySelector('.app-side, .shell__sidebar, aside.sidebar');
    if (!side || document.getElementById('os-menu-collapse')) return;

    // CSS (uma vez): tudo gated em >=881px — no celular nada disso age
    if (!document.getElementById('os-menu-style')) {
      const st = document.createElement('style');
      st.id = 'os-menu-style';
      st.textContent =
        '#os-menu-collapse{display:none}#os-menu-handle{display:none}'
        + '@media (min-width:881px){'
        +   '#os-menu-collapse{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px;padding:9px 12px;'
        +     'border:1px solid rgba(128,128,128,.3);border-radius:10px;background:transparent;color:inherit;'
        +     'font:inherit;font-size:12.5px;opacity:.72;cursor:pointer;box-sizing:border-box}'
        +   '#os-menu-collapse:hover{opacity:1}'
        +   'html.os-menu-off{--layout-sidebar:0px;--sidebar:0px}'
        +   'html.os-menu-off .app-side,html.os-menu-off .shell__sidebar,html.os-menu-off aside.sidebar,html.os-menu-off .app-logo{display:none!important}'
        +   'html.os-menu-off #os-menu-handle{display:flex;align-items:center;justify-content:center;'
        +     'position:fixed;top:50%;left:0;transform:translateY(-50%);width:18px;height:52px;z-index:2147482000;'
        +     'background:rgba(18,18,20,.72);color:#fff;border:1px solid rgba(255,255,255,.14);border-left:none;'
        +     'border-radius:0 10px 10px 0;cursor:pointer;font-size:14px;'
        +     '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}'
        + '}';
      document.head.appendChild(st);
    }

    // Botão dentro do menu (fim da lista)
    const b = document.createElement('button');
    b.id = 'os-menu-collapse'; b.type = 'button';
    b.title = 'Recolher o menu';
    b.setAttribute('aria-label', 'Recolher o menu');
    b.innerHTML = '«  Recolher menu';
    b.onclick = () => _setMenuOff(true);
    // No TOPO do menu (no fim ficava escondido em menus compridos)
    b.style.marginTop = '0'; b.style.marginBottom = '10px';
    side.insertBefore(b, side.firstChild);

    // Alça pra reabrir (borda esquerda, meia altura)
    if (!document.getElementById('os-menu-handle')) {
      const h = document.createElement('button');
      h.id = 'os-menu-handle'; h.type = 'button';
      h.title = 'Mostrar o menu';
      h.setAttribute('aria-label', 'Mostrar o menu');
      h.textContent = '»';
      h.onclick = () => _setMenuOff(false);
      document.body.appendChild(h);
    }
  }

  // Aplica o estado salvo o quanto antes (evita o menu "piscar" ao carregar)
  try { if (localStorage.getItem(_MENU_KEY) === '1') document.documentElement.classList.add('os-menu-off'); } catch (e) {}

  function _initMenuCollapse() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _mountMenuCollapse);
    } else {
      _mountMenuCollapse();
    }
  }
  _initMenuCollapse();

  // ── Avisos: sino + popup de aviso em TODA tela ───────────────────────────
  // Objetivo: quando alguém aloca você numa tarefa, num atendimento ou num projeto
  // (ou um prazo chega), um aviso PULA NA SUA TELA na hora, esteja você em que
  // módulo estiver.
  //
  // Como funciona (3 camadas, uma cobre a outra):
  //   1. Realtime do Supabase: o banco avisa o navegador no instante do insert
  //      em hub.notificacoes (só as SUAS — a policy notif_self já filtra).
  //   2. Verificação a cada 30s (e ao voltar pra aba): se o realtime cair
  //      (wi-fi, notebook dormindo), o aviso chega no máximo 30s depois.
  //   3. Aviso do sistema operacional (aquele balãozinho do Windows/Mac): só
  //      se a pessoa autorizar, pelo botão "Ativar avisos" dentro do sino.
  //
  // Quem cria a notificação é o BANCO (hub.avisar, chamado pelos gatilhos de cada
  // módulo), então isso vale pra alocação, mudança de status e alerta de prazo.
  //
  // Escape (uma linha, se alguma tela não quiser o sino):
  //   window.OS_NO_DESK = true;
  const _DESK_POP_KEY = 'os:desk-popped';   // ids já mostrados (não repete o popup)
  const _DESK_POLL_MS = 30000;              // de quanto em quanto tempo confere
  let _deskUid = null, _deskNotifs = [], _deskChannel = null, _deskPolling = null;

  // Preferências da pessoa (hub.aviso_prefs, cada um só enxerga a sua):
  //   som   = bipe quando chega aviso
  //   popup = o cartão que pula na tela
  // ALOCAÇÃO É EXCEÇÃO: quando alocam VOCÊ (tipo 'alocacao'), o cartão aparece
  // do mesmo jeito — é trabalho caindo pra você, você precisa ver e clicar.
  // O barulho, esse sim, o silenciar desliga pra tudo.
  let _deskPrefs = { som: true, popup: true };
  const _deskEhAlocacao = (n) => String((n && n.tipo) || '') === 'alocacao';

  async function _deskLoadPrefs() {
    try {
      // a tela Conta pode pedir antes do sino ligar (ou numa instalação sem a peça avisos):
      // pega a pessoa da sessão; sem sessão, ficam as preferências padrão
      if (!_deskUid) { const s = await Auth.getSession(); _deskUid = s && s.user ? s.user.id : null; }
      if (!_deskUid) return _deskPrefs;
      const { data } = await getClient()
        .from('aviso_prefs').select('som,popup').eq('user_id', _deskUid).maybeSingle();
      if (data) _deskPrefs = { som: data.som !== false, popup: data.popup !== false };
    } catch (e) { /* sem preferência salva = tudo ligado */ }
    return _deskPrefs;
  }

  async function _deskSavePrefs(p) {
    const novo = { som: p.som !== false, popup: p.popup !== false };
    if (!_deskUid) { try { const s = await Auth.getSession(); _deskUid = s && s.user ? s.user.id : null; } catch (e) {} }
    if (!_deskUid) throw new Error('Sem sessão para salvar as preferências.');
    const { error } = await getClient().from('aviso_prefs')
      .upsert({ user_id: _deskUid, som: novo.som, popup: novo.popup, atualizado_em: new Date().toISOString() },
        { onConflict: 'user_id' });
    if (error) throw error;
    _deskPrefs = novo;
    return novo;
  }

  // "2026-08-05" -> "05/08"
  function _deskPrazo(v) {
    if (!v) return '';
    const s = String(v).slice(0, 10).split('-');
    return s.length === 3 ? s[2] + '/' + s[1] : String(v);
  }

  // Linha de rodapé do aviso: quem mandou + pra quando
  function _deskAssinatura(n) {
    const p = [];
    if (n.autor) p.push('por ' + n.autor);
    if (n.prazo) p.push('prazo ' + _deskPrazo(n.prazo));
    return p.join(' · ');
  }

  function _deskShouldShow() {
    if (window.OS_NO_DESK === true) return false;
    if (_dentroDeQuadro() || telaDoCliente()) return false;   // o sino é da tela de fora / não é coisa de cliente
    const path = (location.pathname || '/').toLowerCase();
    // páginas públicas/externas (cliente, admissão, onboarding…) não têm sino
    if (_BACK_DENY.some((k) => path.includes(k))) return false;
    if (path === '/produto' || path.indexOf('/produto/') === 0 || path === '/produto.html') return false;
    return true;
  }

  // ids já mostrados ficam guardados no navegador: recarregar a página (ou ter
  // duas abas abertas) não faz o mesmo aviso pipocar de novo.
  function _deskPopped() {
    try { return JSON.parse(localStorage.getItem(_DESK_POP_KEY) || '[]'); } catch (e) { return []; }
  }
  function _deskMarkPopped(id) {
    try {
      const l = _deskPopped();
      if (l.includes(id)) return false;
      l.push(id);
      localStorage.setItem(_DESK_POP_KEY, JSON.stringify(l.slice(-80)));
      return true;
    } catch (e) { return true; }
  }

  const _deskEsc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── O POPUP (o aviso que pula na tela) ───────────────────────────────────
  function _deskPopup(n) {
    if (!document.body) return;
    // desligou o pop-up no perfil → só alocação continua pulando na tela
    if (_deskPrefs.popup === false && !_deskEhAlocacao(n)) return;
    let root = document.getElementById('os-desk-pops');
    if (!root) {
      root = document.createElement('div');
      root.id = 'os-desk-pops';
      root.style.cssText =
        'position:fixed;right:16px;bottom:74px;z-index:2147483100;'
        + 'display:flex;flex-direction:column;gap:10px;align-items:flex-end;'
        + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:none;';
      document.body.appendChild(root);
    }
    const card = document.createElement('div');
    card.style.cssText =
      'pointer-events:auto;width:330px;max-width:calc(100vw - 32px);box-sizing:border-box;'
      + 'background:#17171A;color:#F2F2F0;border:1px solid rgba(255,255,255,.14);'
      + 'border-left:4px solid #E8722B;border-radius:12px;padding:13px 14px;'
      + 'box-shadow:0 10px 30px rgba(0,0,0,.45);'
      + 'opacity:0;transform:translateY(10px);transition:opacity .2s,transform .2s;';
    const aloc = _deskEhAlocacao(n);
    const assin = _deskAssinatura(n);
    card.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:9px">'
      +   '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#E8722B" stroke-width="2" '
      +     'stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;margin-top:1px">'
      +     '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'
      +   '<div style="flex:1;min-width:0">'
      // 1ª linha: DE ONDE veio (sistema) e o que aconteceu
      +     '<div style="font-size:12.5px;font-weight:800;letter-spacing:.02em;color:#E8722B">'
      +       _deskEsc(n.sistema || 'Aviso') + (aloc ? ' · alocaram você' : '') + '</div>'
      // 2ª linha: o título da atividade
      +     '<div style="font-size:13.5px;line-height:1.4;margin-top:3px;font-weight:700">'
      +       _deskEsc(n.titulo || '') + '</div>'
      // 3ª linha: o detalhe (cliente, projeto, área…)
      +     (n.texto ? '<div style="font-size:12.5px;line-height:1.4;margin-top:2px;color:#C9C9CE">'
      +                  _deskEsc(n.texto) + '</div>' : '')
      // rodapé: quem mandou e pra quando
      +     (assin ? '<div style="font-size:11.5px;margin-top:5px;color:#9A9AA2">' + _deskEsc(assin) + '</div>' : '')
      +     '<div style="display:flex;gap:8px;margin-top:10px">'
      +       '<a class="os-pop-go" href="' + _deskEsc(n.link || '/') + '" '
      +         'style="background:#E8722B;color:#fff;text-decoration:none;padding:6px 12px;border-radius:8px;'
      +         'font-size:12.5px;font-weight:700">' + (aloc ? 'Abrir e executar' : 'Abrir') + '</a>'
      +       '<button class="os-pop-x" type="button" style="background:transparent;border:1px solid rgba(255,255,255,.2);'
      +         'color:#9A9AA2;padding:6px 11px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer">Depois</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    root.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; });

    const close = () => {
      card.style.opacity = '0'; card.style.transform = 'translateY(10px)';
      setTimeout(() => card.remove(), 220);
    };
    // "Depois": tira o cartão da frente, mas o aviso CONTINUA no sino (não lido).
    card.querySelector('.os-pop-x').addEventListener('click', close);

    // "Abrir e executar": o cartão some na hora E o aviso sai do sino (vira lido).
    const go = card.querySelector('.os-pop-go');
    if (go) go.addEventListener('click', (ev) => {
      const destino = go.getAttribute('href') || '/';
      ev.preventDefault();
      close();
      window.open(destino, '_blank', 'noopener');   // aba nova: a tela de agora fica
      _deskMarkRead(n.id);
    });

    // Ninguém clicou? O cartão FICA na tela — ele só sai quando a pessoa
    // clica em "Abrir e executar" ou em "Depois" (Samara, 24/08/2026).

    _deskBeep();
    _deskSystemNotify(n);
  }

  // Bipe curto e discreto (não usa arquivo de som; se o navegador bloquear, ignora)
  function _deskBeep() {
    try {
      if (_deskPrefs.som === false) return;      // silenciou o barulho no perfil
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') { ctx.close(); return; }   // sem interação do usuário ainda
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.36);
      setTimeout(() => ctx.close(), 600);
    } catch (e) {}
  }

  // Balãozinho do sistema operacional — só se a pessoa autorizou no sino.
  function _deskSystemNotify(n) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (_pushAtivo) return;   // o celular/navegador já recebe pelo /sw.js — sem aviso em dobro
      if (_deskPrefs.popup === false && !_deskEhAlocacao(n)) return;
      const assin = _deskAssinatura(n);
      const nt = new Notification(
        (n.sistema || 'Aviso') + (_deskEhAlocacao(n) ? ' · alocaram você' : ''), {
          body: [n.titulo, n.texto, assin].filter(Boolean).join('\n'),
          icon: '/shared/app-icone.svg', tag: n.id, silent: _deskPrefs.som === false,
        });
      // clicou no balãozinho = mesma coisa do "Abrir e executar": sai do sino
      nt.onclick = () => {
        window.focus();
        const destino = n.link || '/';
        window.open(destino, '_blank', 'noopener');
        _deskMarkRead(n.id);
      };
    } catch (e) {}
  }

  // ── O SINO (canto inferior direito, com o contador de não lidas) ─────────
  // O painel que abre no sino é a CENTRAL DE AVISOS (/shared/os-avisos.js, a
  // mesma em toda tela): "Pra você" separado das "Novidades do Hub", abrir em
  // ABA NOVA e o "Depois". Aqui fica só o botão e a CONTA: novidade não conta
  // no sino, e aviso adiado ("Depois") só volta a contar quando o adiamento vence.
  // Tela que tem o sino no próprio menu liga window.OS_SINO_PROPRIO e recebe o
  // número pelo evento 'os-avisos'.
  // A conta vem do BANCO (contagem exata, só o número): olhando só os 30 avisos
  // mais novos, quem tem 300 pendências via "30". Sem resposta, conta o que tem.
  let _deskNao = 0, _deskTotal = null;
  function _deskConta() {
    if (_deskTotal != null) return _deskTotal;
    const agora = Date.now();
    return _deskNotifs.filter((n) => !n.lida && n.tipo !== 'novidades'
      && !(n.adiada_ate && new Date(n.adiada_ate).getTime() > agora)).length;
  }
  async function _deskContaNoBanco() {
    try {
      let q = getClient().from('notificacoes').select('id', { count: 'exact', head: true })
        .eq('lida', false).neq('tipo', 'novidades').or('adiada_ate.is.null,adiada_ate.lt.' + new Date().toISOString());
      if (_deskUid) q = q.eq('user_id', _deskUid);
      const r = await q;
      if (!r.error && typeof r.count === 'number') _deskTotal = r.count;
    } catch (e) { /* fica a conta local */ }
  }
  function _deskRenderBell() {
    if (!document.body) return;
    const nao = _deskNao = _deskConta();
    try { window.dispatchEvent(new CustomEvent('os-avisos', { detail: { nao } })); } catch (e) {}
    let box = document.getElementById('os-desk-bell');
    if (window.OS_SINO_PROPRIO === true) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.id = 'os-desk-bell';
      box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;';
      document.body.appendChild(box);
    }
    box.innerHTML =
      '<button id="os-desk-bell-btn" type="button" title="Avisos" aria-label="Avisos' + (nao ? ' (' + nao + ' novos)' : '') + '" '
      +   'style="position:relative;width:44px;height:44px;border-radius:50%;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;'
      +   'background:linear-gradient(-75deg,#1C3E87,#00133D);border:1px solid rgba(156,178,212,.35);box-shadow:0 8px 22px -6px rgba(0,19,61,.6)">'
      +   '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +     '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'
      +   (nao ? '<span style="position:absolute;top:-2px;right:-2px;min-width:19px;height:19px;padding:0 5px;box-sizing:border-box;border-radius:10px;'
      +     'background:#E5484D;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff">'
      +     (nao > 99 ? '99+' : nao) + '</span>' : '')
      + '</button>';
    box.querySelector('#os-desk-bell-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.OSAvisos) window.OSAvisos.abrir(); else window.open('/', '_blank', 'noopener');
    });
  }

  // Marca UM aviso como lido — usado quando a pessoa clica em "Abrir e executar"
  // no cartão. O número do sino cai na hora, sem esperar o banco responder.
  async function _deskMarkRead(id) {
    if (!id) return;
    const n = _deskNotifs.find((x) => x.id === id);
    if (n && !n.lida) { n.lida = true; if (_deskTotal && n.tipo !== 'novidades') _deskTotal--; _deskRenderBell(); }
    try {
      let q = getClient().from('notificacoes').update({ lida: true }).eq('id', id);
      if (_deskUid) q = q.eq('user_id', _deskUid);   // só os SEUS avisos (igual ao "Marcar lidas")
      await q;
    } catch (e) { console.warn('[OS] marcar lida:', e && e.message); }
  }

  // Busca os avisos e dispara o popup dos que ainda não foram mostrados.
  async function _deskFetch(popar) {
    try {
      const { data, error } = await getClient()
        .from('notificacoes')
        .select('id,tipo,sistema,titulo,texto,link,autor,prazo,lida,created_at,adiada_ate')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      _deskNotifs = data || [];
      await _deskContaNoBanco();
      _deskRenderBell();
      if (!popar) return;
      // só pipoca o que é recente (últimos 15 min), não lido e ainda não mostrado
      const corte = Date.now() - 15 * 60 * 1000;
      _deskNotifs
        .filter((n) => !n.lida && new Date(n.created_at).getTime() > corte)
        .reverse()
        .forEach((n) => { if (_deskMarkPopped(n.id)) _deskPopup(n); });
    } catch (e) { console.warn('[OS] avisos:', e && e.message); }
  }

  async function _deskInit() {
    if (!_deskShouldShow()) return;
    let session = null;
    try { session = await Auth.getSession(); } catch (e) { return; }
    if (!session || !session.user) return;          // sem login, sem sino
    if (!temPeca('avisos')) return;                 // sem a peça "avisos" da base: sem sino (os avisos ficam gravados no banco)
    _deskUid = session.user.id;

    await _deskLoadPrefs();     // som/pop-up do jeito que a pessoa escolheu
    await _deskFetch(true);

    // 1) Realtime — o banco empurra o aviso na hora
    try {
      _deskChannel = getClient()
        .channel('os-desk-notif')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'hub', table: 'notificacoes', filter: 'user_id=eq.' + _deskUid },
          (payload) => {
            const n = payload.new;
            if (!n) return;
            _deskNotifs.unshift(n);
            if (_deskTotal != null && n.tipo !== 'novidades') _deskTotal++;
            _deskRenderBell();
            if (_deskMarkPopped(n.id)) _deskPopup(n);
          })
        .subscribe();
    } catch (e) { console.warn('[OS] realtime avisos:', e && e.message); }

    // 2) Rede de segurança: confere a cada 30s e ao voltar pra aba
    _deskPolling = setInterval(() => { if (!document.hidden) _deskFetch(true); }, _DESK_POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) _deskFetch(true); });
  }

  function _initDesk() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _deskInit);
    else _deskInit();
  }
  _initDesk();

  // (O antigo "estado compartilhado" — espelho de chaves do navegador em
  // hub.os_estado — saiu: todo dado de trabalho já mora em tabela própria do
  // banco, e uma instalação nova não tem nada no navegador pra resgatar.)

  // ── x-valor: o <select> MOSTRAR o que está gravado ────────────────────────
  // Problema (06/08/2026): num <select> cujas opções vêm de <template x-for>,
  // tanto `:value` quanto `x-model` NÃO conseguem marcar a opção certa quando o
  // select nasce junto com os dados (uma linha de lista, um card, um modal com
  // ficha). O Alpine aplica o valor ANTES de o x-for criar as <option>, e o
  // navegador, sem achar a opção, cai na primeira ("— escolha —"). Resultado:
  // a pessoa escolhe, grava no banco certinho, volta na tela e o campo está em
  // branco — "não está salvando". Foi o caso dos tipos de reunião na Agenda.
  //
  // Uso (é só isto, em qualquer tela):
  //   <select x-valor="s.tipo" @change="salvar(s, $event.target.value)">
  //     <option value="">definir tipo…</option>
  //     <template x-for="t in tipos"><option :value="t.key" x-text="t.label"></option></template>
  //   </select>
  //
  // Ele reaplica o valor depois de as opções existirem e continua acompanhando
  // mudanças no estado. Pode conviver com x-model (o x-model segue gravando).
  const _regValor = () => {
    if (!window.Alpine || !window.Alpine.directive) return false;
    if (window.Alpine.__osValor) return true;
    window.Alpine.__osValor = true;
    window.Alpine.directive('valor', (el, { expression }, { effect, evaluateLater }) => {
      const pega = evaluateLater(expression);
      effect(() => pega((v) => {
        const novo = (v === null || v === undefined) ? '' : String(v);
        const aplica = () => { if (el.value !== novo) el.value = novo; };
        aplica();                 // as opções já podem estar lá
        queueMicrotask(aplica);   // e de novo depois que o x-for montá-las
        setTimeout(aplica, 0);    // x-for aninhado / dados que chegam junto
      }));
    });
    return true;
  };
  document.addEventListener('alpine:init', _regValor);
  _regValor();   // se o Alpine já subiu antes deste arquivo

  /* ══════════════════════════════════════════════════════════════════════════
     ATIVIDADE — tempo on, telas e cliques  (Samara, 25/08/2026)
     Alimenta o painel de CS do OutPerformance: quanto tempo cada pessoa passa
     no sistema, quanto no OutChat, e quantos cliques dá no OutJourney no dia.

     ⚠️ CORRIGIDO EM 27/08/2026. A 1ª versão só contava com `document.hasFocus()`,
     ou seja, com a janela do navegador sendo a janela FOCADA DO SISTEMA. Quem
     trabalha com o OutJourney aberto do lado e o foco no WhatsApp Web, no Meet
     ou no Excel contava ZERO — e o painel mostrou 38 min pra quem passou 20h
     entre a primeira e a última ação. Agora o critério é: aba VISÍVEL e alguma
     interação nos últimos 5 minutos. Aba esquecida aberta de madrugada continua
     não contando, porque ninguém mexe nela.

     E a unidade é o MINUTO DA PESSOA, não o segundo da aba: elas trabalham com
     20 abas abertas, e somar aba por aba contava o mesmo minuto várias vezes.
     O banco guarda (pessoa, minuto) e resolve com GREATEST.

     Manda um pulso por minuto. Se a pessoa fechar a aba antes, o `pagehide`
     manda o que faltou com `keepalive`, que sobrevive à página morrendo.
     ═══════════════════════════════════════════════════════════════════════ */
  const _AT = {
    sessao: null, seg: 0, cliques: 0, ligado: false, enviando: false,
    ultimaAcao: Date.now(),          // qualquer sinal de vida da pessoa
    minuto: null,                     // o minuto que está sendo contado agora
    segAberto: 0,                     // aba na frente da pessoa (mesmo parada)
  };
  const _AT_OCIOSO = 5 * 60 * 1000;   // 5 min sem mexer em nada = ociosa

  function _atSistema() {
    const p = (location.pathname || '').toLowerCase();
    if (p.includes('/outchat'))      return 'outchat';
    if (p.includes('/outjourney'))   return 'journey';
    if (p.includes('/outfinanceiro'))return 'financeiro';
    if (p.includes('/outprojetos'))  return 'outprojetos';
    if (p.includes('/outfunnel'))    return 'comercial';
    if (p.includes('/outsign'))      return 'outsign';
    if (p.includes('/produtos'))     return 'produtos';
    if (p.includes('/outprocessos')) return 'processos';      // chave do registro de atividade (gravada nos dados): fica a antiga
    if (p.includes('/outperformance')) return 'performance';  // idem
    if (p.includes('/rh'))           return 'rh';
    if (p === '/' || p === '')       return 'launcher';
    return 'hub';
  }

  // Ativa = a aba está na frente da pessoa E ela deu algum sinal de vida há
  // pouco. `hasFocus()` NÃO entra: ele exige que o navegador seja a janela
  // focada do sistema, e ninguém atende cliente assim.
  function _atAtiva() {
    return document.visibilityState === 'visible'
        && (Date.now() - _AT.ultimaAcao) < _AT_OCIOSO;
  }

  async function _atEnvia(final) {
    if (_AT.enviando) return;
    if (!_AT.seg && !_AT.cliques && !_AT.segAberto && !final) return;
    const seg = _AT.seg, cli = _AT.cliques, ab = _AT.segAberto;
    _AT.seg = 0; _AT.cliques = 0; _AT.segAberto = 0;   // zera antes: pulso perdido não duplica
    _AT.enviando = true;
    try {
      const { error } = await getClient().rpc('os_pulso', {
        p_sessao:   _AT.sessao,
        p_sistema:  _atSistema(),
        p_tela:     (location.pathname || '') + (location.hash || ''),
        p_segundos: seg,
        p_cliques:  cli,
        p_minuto:   _AT.minuto || new Date().toISOString(),
        p_aberto:   ab,
      });
      if (error) { _AT.seg += seg; _AT.cliques += cli; _AT.segAberto += ab; }
    } catch (e) { _AT.seg += seg; _AT.cliques += cli; _AT.segAberto += ab; }
    _AT.enviando = false;
  }

  // OUTFUNNELS-MOLDURA-26-09-2026 · tela EMBUTIDA (?embutido=1 dentro de um quadro —
  // hoje, o OutFunnels dentro do OutFunnels) não mede tempo sozinha: quem mede é a
  // janela de fora, que é a tela que a pessoa está usando. Aqui só se repassa o
  // sinal de vida (clique/tecla), que a janela de fora não enxerga. Sem isso o
  // mesmo minuto contaria em dois sistemas, e quem trabalha no quadro pareceria
  // parado pra janela de fora.
  function _atEmbutida() {
    try {
      return window.self !== window.top && /[?&]embutido=/.test(location.search || '');
    } catch (e) { return false; }
  }
  function _atRepassaSinalDeVida() {
    let ultimo = 0;
    const manda = (clique) => {
      const t = Date.now();
      if (!clique && t - ultimo < 1000) return;   // mexer o mouse: no máximo 1x/seg
      ultimo = t;
      try { window.parent.postMessage({ origem: 'outfunnel', tipo: 'vivo', clique: !!clique }, location.origin); } catch (e) {}
    };
    window.addEventListener('pointerdown', () => manda(true), { passive: true, capture: true });
    ['keydown', 'wheel', 'touchstart', 'mousemove'].forEach(
      (ev) => window.addEventListener(ev, () => manda(false), { passive: true, capture: true }));
  }

  async function _atLiga() {
    if (_AT.ligado) return;
    if (_atEmbutida()) { _AT.ligado = true; _atRepassaSinalDeVida(); return; }
    try {
      const s = await Auth.getSession();
      if (!s) return;                       // sem login não mede nada
    } catch (e) { return; }
    _AT.ligado = true;
    _AT.sessao = (crypto && crypto.randomUUID) ? crypto.randomUUID()
               : (Date.now() + '-' + Math.random().toString(16).slice(2));

    // sinais de vida — é o que separa "está ali" de "deixou aberto"
    const vivo = () => { _AT.ultimaAcao = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'].forEach(
      (ev) => window.addEventListener(ev, vivo, { passive: true, capture: true }));
    let _mm = 0;
    window.addEventListener('mousemove', () => {          // limitado: 1x/seg
      const t = Date.now(); if (t - _mm > 1000) { _mm = t; vivo(); }
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') vivo();
    });

    // O relógio anda de segundo em segundo, mas FECHA A CONTA A CADA MINUTO:
    // o banco guarda (pessoa, minuto), e é isso que impede 20 abas de contarem
    // o mesmo minuto 20 vezes.
    setInterval(() => {
      const agora = new Date();
      const minAgora = new Date(Math.floor(agora.getTime() / 60000) * 60000).toISOString();
      if (_AT.minuto && _AT.minuto !== minAgora) {
        _atEnvia(false);                 // virou o minuto: manda o que juntou
        _AT.minuto = minAgora;
      } else if (!_AT.minuto) {
        _AT.minuto = minAgora;
      }
      // DUAS contas, porque "tempo no sistema" tem dois sentidos e confundir
      // os dois foi o que fez o número não bater:
      //   segAberto = a tela do Hub estava NA FRENTE da pessoa
      //   seg       = ...e ela estava mexendo (interagiu nos últimos 5 min)
      if (document.visibilityState === 'visible') _AT.segAberto += 1;
      if (_atAtiva()) _AT.seg += 1;
    }, 1000);

    // try/catch porque este arquivo carrega em TODA tela do Hub: um
    // seletor que o navegador não aceite não pode derrubar o resto do os-core.
    document.addEventListener('click', (ev) => {
      try {
        if (!_atAtiva()) return;
        const alvo = ev.target && ev.target.closest &&
          ev.target.closest('button, a, [role="button"], .tab, .btn, input[type="submit"], select');
        if (alvo) _AT.cliques += 1;
      } catch (e) {}
    }, true);

    // Minimizou, trocou de aba ou vai fechar: manda o que juntou.
    // O `visibilitychange` para `hidden` é o que sempre dispara antes de a aba
    // morrer — inclusive no celular. Ele é o fecho de verdade; o `pagehide`
    // fica só como reforço. Não se usa `sendBeacon` porque ele não carrega o
    // cabeçalho de autenticação do Supabase, e o pulso seria recusado.
    // No pior caso perde-se o último minuto de uma aba — nada que mude a conta.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _atEnvia(true);
    });
    window.addEventListener('pagehide', () => { _atEnvia(true); });
  }

  // liga sozinho, sem tela nenhuma precisar chamar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _atLiga(); });
  } else { _atLiga(); }

  // ══════════════════════════════════════════════════════════════════════════
  // APP NO CELULAR — notificação com o celular bloqueado  [app-celular-28-09-2026]
  //
  // O /sw.js (service worker) é quem mostra o aviso quando o app está fechado.
  // Aqui: registrar o sw em toda tela, ligar as notificações (precisa de um
  // TOQUE da pessoa — o iPhone exige) e gravar o aparelho no banco
  // (hub.app_aparelho_registrar). Quem decide O QUE chega é o banco
  // (hub.tg_app_push_aviso / tg_app_push_mensagem) e quem entrega é a Edge
  // Function app-push. Saiu do time → o banco apaga os aparelhos sozinho.
  // ══════════════════════════════════════════════════════════════════════════
  // Chave PÚBLICA de notificação (a privada mora só nos segredos da app-push).
  // a chave PÚBLICA do Web Push da empresa (par da VAPID_PRIVATE_KEY da função app-push)
  const VAPID_PUBLICA = '%VAPID_PUBLIC_KEY%';
  let _pushAtivo = false;

  const _appEhIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const _appEhCelular = () => /iPhone|iPad|iPod|Android/.test(navigator.userAgent || '');
  function appInstalado() {
    try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
    catch (e) { return false; }
  }
  const _pushSuportado = () => ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  function _b64u(s) {
    const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  }
  function _appRotulo() {
    const ua = navigator.userAgent || '';
    const tipo = /iPhone|iPod/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
      : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Computador';
    return tipo + (appInstalado() ? ' · app' : ' · navegador');
  }
  async function _swReg() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('/sw.js'); }
    catch (e) { console.warn('[OS] sw:', e && e.message); return null; }
  }
  async function _pushInscricao(reg) {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _b64u(VAPID_PUBLICA) });
    return sub;
  }
  async function _pushGrava(sub) {
    const j = sub.toJSON();
    const r = await getClient().rpc('app_aparelho_registrar', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_rotulo: _appRotulo(), p_user_agent: navigator.userAgent,
    });
    if (r.error) throw r.error;
    _pushAtivo = !!r.data;          // null = aparelho desconectado pelo RH
    return _pushAtivo;
  }

  // Liga as notificações DESTE aparelho. Chamar só a partir de um toque/clique.
  async function appLigarNotificacoes() {
    if (!_pushSuportado()) {
      throw new Error(_appEhIphone() && !appInstalado()
        ? 'No iPhone, primeiro coloque o app na tela de início (Compartilhar › Adicionar à Tela de Início) e abra pelo ícone.'
        : 'Este navegador não recebe notificações.');
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      throw new Error('As notificações estão bloqueadas. Libere nos ajustes do aparelho (Notificações do app) e tente de novo.');
    }
    const reg = await _swReg();
    if (!reg) throw new Error('Não deu pra preparar as notificações neste navegador.');
    await navigator.serviceWorker.ready;
    const ok = await _pushGrava(await _pushInscricao(reg));
    if (!ok) throw new Error('Este aparelho foi desconectado pelo RH. Peça pra liberar de novo.');
    _appTiraConvite();
    return true;
  }

  // "Sair deste aparelho": para de receber aviso aqui (o login continua o mesmo).
  async function appDesligarNotificacoes() {
    try {
      const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration('/') : null;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        try { await getClient().rpc('app_aparelho_esquecer', { p_endpoint: sub.endpoint }); } catch (e) {}
        await sub.unsubscribe();
      }
    } catch (e) { console.warn('[OS] desligar push:', e && e.message); }
    _pushAtivo = false;
  }

  // Toda tela: registra o sw e, se a pessoa já autorizou, confirma o aparelho no
  // banco (o navegador troca a inscrição de vez em quando). Uma vez por aba.
  // Quem instalou / quem usa (painel do OutPeople, hub.app_painel): uma linha por
  // pessoa, dia e jeito de abrir — pelo ícone (app) ou pelo navegador do celular.
  // Uma vez por aba. [app-celular-uso-28-09-2026]
  async function _appRegistraUso() {
    const onde = appInstalado() ? 'app' : (_appEhCelular() ? 'navegador' : null);
    if (!onde) return;
    try {
      if (sessionStorage.getItem('os:uso-' + onde)) return;
      const s = await Auth.getSession(); if (!s) return;
      const r = await getClient().rpc('app_registra_uso', { p_onde: onde, p_rotulo: _appRotulo() });
      if (!r.error) sessionStorage.setItem('os:uso-' + onde, '1');
    } catch (e) { /* medir uso nunca atrapalha a tela */ }
  }

  async function _appLiga() {
    _appRegistraUso();
    if (!('serviceWorker' in navigator)) return;
    const reg = await _swReg();
    if (!reg || !_pushSuportado()) return;
    if (!temPeca('avisos')) return;                 // o aviso no celular é da peça "avisos" da base
    let s = null;
    try { s = await Auth.getSession(); } catch (e) {}
    if (!s) return;
    if (Notification.permission === 'default') { _appConvidaLigar(); return; }
    if (Notification.permission !== 'granted') return;
    try {
      let feito = null;
      try { feito = sessionStorage.getItem('os:push-ok'); } catch (e) {}
      if (feito === s.user.id) { _pushAtivo = true; return; }
      await _pushGrava(await _pushInscricao(reg));
      try { sessionStorage.setItem('os:push-ok', s.user.id); } catch (e) {}
    } catch (e) { console.warn('[OS] push:', e && e.message); }
  }

  // Faixa "Ligar avisos" — só no APP instalado (no computador, o sino já oferece).
  function _appConvidaLigar() {
    if (!appInstalado() || window.OS_SEM_FAIXA_AVISOS === true || document.getElementById('os-app-ligar')) return;
    try { if (sessionStorage.getItem('os:push-depois')) return; } catch (e) {}
    const d = document.createElement('div');
    d.id = 'os-app-ligar';
    d.setAttribute('role', 'region');
    d.setAttribute('aria-label', 'Ligar avisos no celular');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483200;'
      + 'background:#0A0A0B;color:#F7F7F7;border-radius:14px;padding:12px 14px;display:flex;gap:10px;align-items:center;'
      + 'font-family:-apple-system,"SF Pro Text",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)';
    d.innerHTML = '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">Ligar avisos de mensagem</div>'
      + '<div data-msg style="font-size:12.5px;color:#D4D7DC;line-height:1.35;margin-top:2px">Pra saber na hora quando um cliente escrever.</div></div>'
      + '<button type="button" data-depois style="background:transparent;border:0;color:#A6ABB2;font-size:13px;padding:10px 6px;min-height:44px">Depois</button>'
      + '<button type="button" data-ligar style="background:#F7F7F7;color:#0A0A0B;border:0;border-radius:10px;font-size:14px;font-weight:600;padding:10px 14px;min-height:44px">Ligar</button>';
    d.querySelector('[data-depois]').onclick = () => { try { sessionStorage.setItem('os:push-depois', '1'); } catch (e) {} d.remove(); };
    d.querySelector('[data-ligar]').onclick = async () => {
      const msg = d.querySelector('[data-msg]');
      try { await appLigarNotificacoes(); msg.textContent = 'Pronto! Os avisos vão chegar neste celular.'; setTimeout(() => d.remove(), 1800); }
      catch (e) { msg.style.color = '#F2B8B5'; msg.textContent = (e && e.message) || 'Não deu pra ligar.'; }
    };
    (document.body || document.documentElement).appendChild(d);
  }
  function _appTiraConvite() { const d = document.getElementById('os-app-ligar'); if (d) d.remove(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { _appLiga(); });
  else _appLiga();

  // ── CELULAR: os botões flutuantes não podem cobrir a caixa de mensagem ─────
  // No canto de baixo de toda tela de chat mora o campo de mensagem e o enviar.
  // Então, no celular: sino e ✦ sobem, ficam menores e SOMEM enquanto a pessoa digita.
  // (O OutFunnels carrega este mesmo arquivo — vale lá também.)
  (function _botoesNoCelular() {
    const css = document.createElement('style');
    css.id = 'os-celular-botoes';
    css.textContent =
      '@media (max-width:760px){'
      + '#os-desk-bell{right:12px!important;bottom:calc(124px + env(safe-area-inset-bottom))!important}'
      + '#os-desk-bell-btn{width:40px!important;height:40px!important}'
      + '#os-desk-pops{bottom:calc(222px + env(safe-area-inset-bottom))!important}}'
      + 'html.os-digitando #os-desk-bell,html.os-digitando #os-desk-pops,html.os-digitando #os-agente{display:none!important}'
      // sem zoom sozinho no iPhone: campo com letra < 16px faz o Safari ampliar e não voltar
      // (mesma regra do os-responsive.css, aqui pra quem não carrega ele — o OutFunnels)
      + '@media (max-width:760px){input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea{font-size:16px!important}}';
    (document.head || document.documentElement).appendChild(css);

    const celular = () => { try { return window.matchMedia('(max-width:760px)').matches; } catch (e) { return false; } };
    const ehCampo = (el) => !!el && el.id !== 'os-agente' && (
      el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'IFRAME'
      || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|file|range|color|reset|image|hidden)$/i.test(el.type || '')));
    const confere = () => {
      const digitando = celular() && ehCampo(document.activeElement);
      document.documentElement.classList.toggle('os-digitando', digitando);
    };
    document.addEventListener('focusin', confere, true);
    document.addEventListener('focusout', () => setTimeout(confere, 60), true);
    // campo dentro de um quadro (iframe): quem perde o foco é a janela de cima
    window.addEventListener('blur', () => setTimeout(confere, 60));
    window.addEventListener('focus', () => setTimeout(confere, 60));
  })();

  // ── Módulos instalados ───────────────────────────────────────────────────
  // A montagem do site (tools/instalar/montar/montar.js) troca o marcador abaixo pela lista
  // dos módulos desta instalação. Sem a troca (código-fonte), vale tudo instalado.
  // Com a lista, o que é de um módulo que NÃO veio:
  //   · quadro (iframe) → no lugar dele aparece o aviso padrão do módulo ausente;
  //   · link (menu, cartão, botão "abrir") → fica à vista e, no clique, abre o aviso;
  //   · item marcado com data-sistema="x" (botão solto, sem onde pôr mensagem) → some.
  // O aviso é UM só (OS.moduloAusente): "Este espaço é do módulo …".
  const _SISTEMAS_TXT = '%OS_SISTEMAS%';
  const _SISTEMAS = _SISTEMAS_TXT.charAt(0) === '[' ? JSON.parse(_SISTEMAS_TXT) : null;
  // a ordem importa: o caminho mais específico primeiro (/outjourney/outchat antes de /outjourney/)
  const _CAMINHOS = [['/outjourney/outchat', 'outchat'], ['/outjourney/historico-whatsapp', 'outchat'], ['/outchat/', 'outchat'], ['/outjourney/', 'outjourney'], ['/rh/', 'outpeople'], ['/outperformance/', 'outperformance'],
    ['/diretoria', 'outperformance'], ['/outsign/', 'outsign'], ['/outprojetos/', 'outprojetos'],
    ['/outprocessos/', 'outprocessos'], ['/financeiro/', 'financeiro'],
    ['/outfinanceiro/', 'financeiro'], ['/pagamentos/', 'financeiro'], ['/compras/', 'financeiro'], ['/outfunnels', 'outfunnels'], ['/outfunnel/', 'outfunnels'],
    ['/outcopiloto/', 'outcopiloto'], ['/outassistenteia/', 'outassistenteia'], ['/outgrupos/', 'outgrupos'],
    // peças da base que podem não ter vindo (sem elas, o que leva até lá some — não é módulo à venda)
    ['/produtos/', 'peca:produtos'], ['/produto/', 'peca:produtos']];
  // Catálogo de NOMES dos módulos — inclusive os que não fazem parte deste código
  // (o Financeiro): é com ele que o aviso diz de quem é o espaço.
  const MODULOS = {
    outjourney:  { nome: 'OutJourney',      assunto: 'sucesso do cliente',        seu: 'o seu próprio sucesso do cliente' },
    outchat:     { nome: 'OutChat',         assunto: 'atendimento por WhatsApp',  seu: 'o seu próprio atendimento por WhatsApp' },
    outfunnels:  { nome: 'OutFunnels',      assunto: 'comercial',                 seu: 'o seu próprio comercial' },
    outsign:     { nome: 'OutSign',         assunto: 'contratos e assinaturas',   seu: 'os seus próprios contratos' },
    outprojetos: { nome: 'OutProjetos',     assunto: 'gestão de projetos',        seu: 'a sua própria gestão de projetos' },
    outperformance: { nome: 'OutPerformance', assunto: 'painel de indicadores', seu: 'o seu próprio painel de indicadores' },
    outpeople:   { nome: 'OutPeople',       assunto: 'gestão de pessoas',         seu: 'a sua própria gestão de pessoas' },
    outprocessos: { nome: 'OutProcessos',   assunto: 'documentação de processos', seu: 'a sua própria documentação de processos' },
    outcopiloto: { nome: 'OutCopiloto',     assunto: 'copiloto de calls',         seu: 'o seu próprio copiloto de calls' },
    outassistenteia: { nome: 'OutAssistenteIA', assunto: 'assistente de IA',      seu: 'o seu próprio assistente de IA' },
    outgrupos:   { nome: 'Grupos',          assunto: 'acompanhamento de grupos de WhatsApp', seu: 'o seu próprio acompanhamento de grupos de WhatsApp' },
    financeiro:  { nome: 'Financeiro',      assunto: 'financeiro',                seu: 'o seu próprio financeiro' },
  };
  function modulo(id) { return MODULOS[id] || { nome: String(id || 'outro'), assunto: 'sistema', seu: 'o seu próprio sistema' }; }
  // PEÇAS DA BASE (base/sistema.json → "pecas"): a montagem põe na lista as que esta
  // instalação tem, como "peca:<nome>". Lista sem nenhuma peça (montagem antiga ou
  // código-fonte) = todas. O essencial está sempre.
  const _PECAS = _SISTEMAS ? _SISTEMAS.filter((s) => String(s).indexOf('peca:') === 0).map((s) => s.slice(5)) : [];
  function temPeca(p) { return !_PECAS.length || !p || p === 'essencial' || _PECAS.indexOf(p) >= 0; }
  function instalado(sistema) {
    if (sistema && String(sistema).indexOf('peca:') === 0) return temPeca(String(sistema).slice(5));
    return !_SISTEMAS || !sistema || sistema === 'base' || _SISTEMAS.indexOf(sistema) >= 0;
  }
  function sistemaDoCaminho(url) {
    let p = String(url || '');
    if (/^https?:/i.test(p)) { if (p.indexOf(SITE) !== 0 && p.indexOf(location.origin) !== 0) return null; p = p.replace(/^https?:\/\/[^/]+/i, ''); }
    if (p.charAt(0) !== '/') return null;
    const m = _CAMINHOS.find((c) => p === c[0].replace(/\/$/, '') || p.indexOf(c[0]) === 0);
    return m ? m[1] : 'base';
  }
  // O AVISO PADRÃO de módulo ausente (o mesmo em toda tela).
  function _escMod(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function moduloAusenteTexto(id) {
    const m = modulo(id);
    return 'Este espaço é do módulo ' + m.nome + '. Você pode adquirir o módulo ' + m.nome
      + ' da BoraIA ou adaptar este espaço para ' + m.seu + '.';
  }
  function moduloAusenteHtml(id) {
    const m = modulo(id);
    return '<div class="os-modulo-ausente" role="note" data-modulo="' + _escMod(id) + '" style="box-sizing:border-box;margin:12px 0;padding:22px 24px;'
      + 'border:1px dashed var(--border-strong, #c8ccd2);border-radius:12px;background:var(--bg-surface, rgba(127,127,127,.06));'
      + 'color:var(--text-secondary, #5b6270);font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center">'
      + '<div style="font-weight:700;color:var(--text-primary, #1d2230);margin-bottom:4px">Módulo ' + _escMod(m.nome) + '</div>'
      + _escMod(moduloAusenteTexto(id)) + '</div>';
  }
  function moduloAusente(id) {
    const d = document.createElement('div');
    d.innerHTML = moduloAusenteHtml(id);
    return d.firstChild;
  }
  // a mesma mensagem numa janela (quando o clique foi num link, cartão ou menu)
  function moduloAusenteJanela(id) {
    const fundo = document.createElement('div');
    fundo.className = 'os-modulo-ausente-janela';
    fundo.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,25,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    const caixa = document.createElement('div');
    caixa.style.cssText = 'max-width:440px;width:100%;background:var(--bg-raised, #fff);border-radius:14px;padding:6px 6px 14px;box-shadow:0 20px 50px -12px rgba(0,0,0,.45);text-align:center';
    caixa.innerHTML = moduloAusenteHtml(id).replace('margin:12px 0', 'margin:0') + '<button type="button" style="margin-top:4px;padding:8px 18px;border-radius:8px;border:1px solid var(--border-default, #c8ccd2);background:transparent;color:inherit;font:600 13px system-ui,sans-serif;cursor:pointer">Entendi</button>';
    fundo.appendChild(caixa);
    const fecha = () => fundo.remove();
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.tagName === 'BUTTON') fecha(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fecha(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(fundo);
    return fundo;
  }
  // Antes de uma AÇÃO que depende de outro módulo (ex.: mandar WhatsApp é do OutChat):
  //   if (!OS.precisaModulo('outchat')) return;
  // Com o módulo instalado devolve true; sem ele, mostra o aviso e devolve false.
  function precisaModulo(id) {
    if (instalado(id)) return true;
    try { moduloAusenteJanela(id); } catch (e) {}
    return false;
  }
  // Quadro que já vem escrito na página (não nasce de um template) e é de OUTRO
  // módulo: escreva <iframe data-os-src="/modulo/tela"> em vez de src=. Assim o
  // navegador não tenta abrir a tela antes de sabermos se o módulo veio — com ele,
  // o src entra aqui; sem ele, entra o aviso.
  function _ligaQuadros(raiz) {
    if (!raiz || !raiz.querySelectorAll) return;
    const lista = raiz.matches && raiz.matches('iframe[data-os-src]') ? [raiz] : [];
    raiz.querySelectorAll('iframe[data-os-src]').forEach((el) => lista.push(el));
    for (const el of lista) {
      const url = el.getAttribute('data-os-src'); el.removeAttribute('data-os-src');
      const s = sistemaDoCaminho(url);
      if (instalado(s)) el.setAttribute('src', url); else el.replaceWith(moduloAusente(s));
    }
  }
  function _foraDoSistema(raiz) {
    _ligaQuadros(raiz);
    if (!_SISTEMAS || !raiz || !raiz.querySelectorAll) return;
    const lista = raiz.matches && raiz.matches('a[href],iframe[src],[data-sistema]') ? [raiz] : [];
    raiz.querySelectorAll('a[href],iframe[src],[data-sistema]').forEach((el) => lista.push(el));
    for (const el of lista) {
      const s = el.getAttribute('data-sistema') || sistemaDoCaminho(el.getAttribute(el.tagName === 'IFRAME' ? 'src' : 'href'));
      if (instalado(s)) { el.classList.remove('os-fora'); delete el.dataset.osAusente; continue; }
      if (String(s).indexOf('peca:') === 0) { el.classList.add('os-fora'); continue; }   // peça da base que não veio: some
      if (el.tagName === 'IFRAME') {
        if (el.dataset.osFora) continue;
        el.dataset.osFora = '1';
        el.replaceWith(moduloAusente(s));
      } else if (el.tagName === 'A' && !el.hasAttribute('data-sistema')) {
        el.dataset.osAusente = s;                 // fica à vista; o clique mostra o aviso
      } else el.classList.add('os-fora');
    }
  }
  if (_SISTEMAS) {
    const css = document.createElement('style');
    css.textContent = '.os-fora{display:none!important}' + (temPeca('avisos') ? '' : '[data-sino]{display:none!important}');
    (document.head || document.documentElement).appendChild(css);
    // clique num link de módulo ausente: em vez de abrir uma página que não existe, o aviso
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest && e.target.closest('a[data-os-ausente]');
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      moduloAusenteJanela(a.dataset.osAusente);
    }, true);
    const liga = () => {
      _foraDoSistema(document.body);
      new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === 'attributes') _foraDoSistema(m.target);
          else m.addedNodes.forEach((n) => { if (n.nodeType === 1) _foraDoSistema(n); });
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'data-sistema'] });
    };
    if (document.body) liga(); else document.addEventListener('DOMContentLoaded', liga);
  }
  else {
    // código-fonte sem a lista (tudo instalado): só acende os quadros data-os-src
    const ligaQ = () => {
      _ligaQuadros(document.body);
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) _ligaQuadros(n); })))
        .observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) ligaQ(); else document.addEventListener('DOMContentLoaded', ligaQ);
  }


  // ── Expose ───────────────────────────────────────────────────────────────
  window.OS = {
    getClient, Auth, Bus, Nav, getMyProfile,
    instalado, sistemaDoCaminho, temPeca,         // o que esta instalação tem: módulos e peças da base (ver tools/instalar/montar)
    modulo, moduloAusente, moduloAusenteHtml, moduloAusenteTexto, moduloAusenteJanela, precisaModulo,   // o aviso de módulo que não veio
    SITE, link,                                   // link que sai daqui leva o domínio do sistema
    telaDoCliente, dentroDeQuadro: _dentroDeQuadro,   // tela do cliente / tela dentro de um quadro (sem barra, sino e ✦)
    getMyAccess, canAccess, estaNoTime, requireAccess, requireAccessEstrito, temAcessoEstrito,
    isSystemAdmin, isSystemAdminOf,
    accessMode, accessModeOf, canEdit, canEditOf, isGuest, isGuestOf, enforceViewOnly,
    denyScreen: (loginPath) => _renderDenied(loginPath || '/'),
    comVolta,                                     // '/'  →  '/?volta=<tela de agora>'
    irProLogin: (loginPath) => { window.location.replace(comVolta(loginPath || '/')); },
    mountBackButton: _mountBackButton, // remontar em SPA que renderiza o body depois
    deskRefresh: () => _deskFetch(true),          // recarregar os avisos na mão
    avisosNaoLidos: () => _deskNao,               // o número do sino (sem novidades nem adiados)
    deskNotify: (n) => _deskPopup(n),             // mostrar um aviso na tela (teste/uso próprio)
    // Preferências de aviso (a tela /conta/ usa estas duas):
    avisoPrefs: () => _deskLoadPrefs(),           // lê {som, popup} da pessoa logada
    setAvisoPrefs: (p) => _deskSavePrefs(p),      // grava {som, popup}
    // App no celular (notificação com o celular bloqueado):
    app: {
      instalado: appInstalado,                    // abriu pelo ícone da tela de início?
      celular: _appEhCelular,
      iphone: _appEhIphone,
      ligarNotificacoes: appLigarNotificacoes,    // chamar num clique
      desligarNotificacoes: appDesligarNotificacoes,
      notificacoesLigadas: () => _pushAtivo,
    },
  };
  console.info('[OS] Core v1.4 carregado ✓');

  // A barra do app e a abertura (só no celular) moram no os-celular.js, ao lado deste arquivo.
  (function () {
    const eu = document.currentScript && document.currentScript.src;
    const s = document.createElement('script');
    s.src = eu ? eu.replace(/os-core\.js(\?.*)?$/, 'os-celular.js') : '/shared/os-celular.js';
    (document.head || document.documentElement).appendChild(s);
  })();

})();
