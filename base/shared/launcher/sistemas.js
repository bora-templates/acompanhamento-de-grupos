/* ============================================================================
   INÍCIO DO HUB · o CATÁLOGO dos sistemas e QUEM vê cada um (window.InicioSistemas)
   ----------------------------------------------------------------------------
   Os sistemas deste produto (a base + os 10 que se compram) organizados por
   área. Só aparece o que ESTA instalação tem: a montagem do site grava a lista
   no os-core (OS.instalado) e o sistema que não veio some do Início, do Dock,
   da busca e das logos — sem link morto pra quem comprou só uma parte.

     key        a chave de hub.users.acessos. Ausente/true = liberado; false = não.
     strict     o contrário: só aparece com acessos[key] = true/'view'/'admin'.
     admin      só pra quem administra (access_level admin ou manager).
     alsoAccess outra chave que também abre (recrutador entra pelo OutPeople).
     alsoOpen   chave que vale pra todos, salvo quem tem false (trilha).
     novaAba    abre em outra aba (o formulário de pagamento).
     pc         "melhor no PC" (aparece no celular).
     lock       mostra o cadeado (restrito).
     soon       em breve (não abre).

   Sistema novo no produto = uma linha aqui (com o href do sistema.json dele).
   Esconder o cartão NÃO é segurança: cada sistema confere o acesso por conta
   própria. Isto aqui é só não oferecer porta que está fechada.
   ============================================================================ */
(function () {
  'use strict';
  const S = (n, k, href, dsc, x) => Object.assign({ n, k, href, dsc }, x || {});

  const TODAS = [
    { id: 'op', area: 'Operações', cor: '#BBB2DC', d: 'Os sistemas gerais da empresa: gestão, pessoas, processos e contratos', apps: [
      // Usuários e acessos: é da base (vem em toda instalação); só quem administra vê.
      S('Usuários', 'usuarios', '/usuarios/', 'Convidar pessoas, liberar e tirar acessos', { admin: true, pc: 1 }),
      S('OutProjetos', 'projetos', '/outprojetos/', 'Gestão de projetos e tarefas', { key: 'outprojetos' }),
      // OutSign atende cliente, colaborador e parceiro — por isso é da empresa toda
      S('OutSign', 'sign', '/outsign/', 'Contratos e assinaturas', { key: 'outsign', pc: 1 }),
      S('OutPerformance', 'indic', '/outperformance/', 'Metas e indicadores por cargo e equipe', { key: 'performance' }),
      // Diretoria mostra receita/CAC: padrão NEGADO (strict) — libera quem tem acessos.diretoria
      S('Diretoria', 'diretoria', '/diretoria', 'Resultados executivos — operação e diretoria, só visualização',
        { key: 'diretoria', strict: true, lock: 1, pc: 1 }),
      // todo admitido vê o OutPeople e entra só na própria trilha
      S('OutPeople', 'people', '/rh/', 'Pessoas, onboarding e trilha, folha e comissões', { key: 'rh', alsoAccess: 'recrutamento', alsoOpen: 'trilha', pc: 1 }),
      S('OutProcessos', 'processos', '/outprocessos/', "NP's, playbooks, manuais e treinamentos", { key: 'processos' }),
      // OutCopiloto: serve venda e sucesso do cliente — por isso mora com os gerais
      S('OutCopiloto', 'copiloto', '/outcopiloto/', 'Copiloto de calls: a IA confere cada call', { key: 'copiloto' }),
    ] },
    { id: 'cs', area: 'Sucesso do Cliente', cor: '#9CB2D4', d: 'Jornada do cliente e as conversas com ele', apps: [
      S('OutJourney', 'journey', '/outjourney/admin', 'CRM e jornada do cliente', { key: 'journey' }),
      S('OutChat', 'chat', '/outjourney/outchat', 'Conversas com os clientes (WhatsApp)', { key: 'chat' }),
      // Grupos: a conversa dos grupos é de terceiros, então o cartão é restrito (só com a chave liberada em Usuários)
      S('Grupos', 'grupos', '/outgrupos/', 'Acompanhamento de Grupos no WhatsApp com IA: resumos, pendências e perguntas', { key: 'grupos', strict: true, lock: 1 }),
    ] },
    { id: 'co', area: 'Comercial', cor: '#B8E9DE', d: 'Conversas, funis, leads e resultados', apps: [
      // sem barra no fim: é a aplicação Next do OutFunnels
      S('OutFunnels', 'funnels', '/outfunnels', 'Sistema comercial — conversas, funis, leads e resultados', { key: 'comercial' }),
    ] },
    { id: 'fi', area: 'Financeiro', cor: '#EED7A4', d: 'Contas, cobranças e pagamentos', apps: [
      S('OutFinanceiro', 'fin', '/outfinanceiro/', 'ERP financeiro — Meu Dia, A Receber, Saídas e Consolidado', { key: 'financeiro', strict: true, lock: 1, pc: 1 }),
      // sem key de propósito: qualquer pessoa da empresa manda a NF por aqui
      S('Solicitar Pagamento', 'pag', '/pagamentos', 'Mandar nota fiscal e dados de pagamento ou reembolso', { novaAba: true }),
    ] },
    { id: 'pr', area: 'Produtos', cor: '#C9DCA9', d: 'Catálogo e entregas da empresa', apps: [
      S('Produtos', 'produtos', '/produtos/', 'O catálogo — entrega, comercial e a Escada de Valor', { key: 'produtos' }),   // da base (a peça "produtos": vem com os módulos que usam o catálogo)
    ] },
  ];

  // módulo que esta instalação NÃO tem (OS.instalado / OS.sistemaDoCaminho, do os-core):
  // o cartão fica, marcado como ausente, e abrir mostra o aviso padrão (OS.moduloAusenteJanela)
  const ausente = (s) => {
    if (!(window.OS && OS.instalado && OS.sistemaDoCaminho)) return null;
    const m = OS.sistemaDoCaminho(s.href);
    return OS.instalado(m) ? null : m;
  };
  // peça da base que esta instalação não tem (o catálogo de produtos vem só com os
  // módulos que o usam): o cartão some — não é módulo à venda, não leva o aviso
  const AREAS = TODAS.map(a => Object.assign({}, a, { apps: a.apps.map(s => Object.assign({}, s, { ausente: ausente(s) }))
    .filter(s => !String(s.ausente || '').startsWith('peca:')) })).filter(a => a.apps.length);
  AREAS.forEach(a => a.apps.forEach(s => { s.area = a.area; s.aid = a.id; s.cor = a.cor; }));

  // a MESMA conta do launcher antigo (hubVisible)
  function visivel(h, ACCESS) {
    if (h.soon || h.ausente) return true;
    const ac = (ACCESS && ACCESS.acessos) || {};
    if (h.admin) return ACCESS.level === 'manager' || ACCESS.level === 'admin';
    if (h.strict) {
      const v = ac[h.key];
      return v === true || v === 'view' || v === 'admin';
    }
    if (h.key) return ac[h.key] !== false
      || (h.alsoAccess && (ac[h.alsoAccess] === true || ac[h.alsoAccess] === 'admin'))
      || (h.alsoOpen && ac[h.alsoOpen] !== false);
    return true;
  }

  // as áreas com só o que a pessoa enxerga; área vazia some
  function paraMim(ACCESS) {
    return AREAS.map(a => Object.assign({}, a, { apps: a.apps.filter(s => visivel(s, ACCESS)) }))
      .filter(a => a.apps.length);
  }

  window.InicioSistemas = { AREAS, visivel, paraMim };
})();
