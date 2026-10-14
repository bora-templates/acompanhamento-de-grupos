// Base · camada de acesso a dados v1.0
// Requer os-core.js carregado antes.
// Expõe window.OS.Data com helpers para as tabelas universais.
//
// Tabelas universais (schema `hub`):
//   colaboradores · clientes · projetos · transacoes

(function () {
  'use strict';

  const db = () => window.OS.getClient();

  const Data = {

    // ── Colaboradores ───────────────────────────────────────────────────────
    async getColaborador(id) {
      const { data } = await db().from('colaboradores').select('*').eq('id', id).maybeSingle();
      return data;
    },

    async getColaboradorPorEmail(email) {
      const { data } = await db().from('colaboradores').select('*').eq('email', email).maybeSingle();
      return data;
    },

    async listColaboradores({ ativo = true } = {}) {
      let q = db().from('colaboradores').select('*').order('nome');
      if (ativo !== null) q = q.eq('ativo', ativo);
      const { data } = await q;
      return data ?? [];
    },

    async upsertColaborador(campos) {
      const { data, error } = await db().from('colaboradores').upsert(campos).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    // ── Clientes ────────────────────────────────────────────────────────────
    async getCliente(id) {
      const { data } = await db().from('clientes').select('*, colaboradores(nome)').eq('id', id).maybeSingle();
      return data;
    },

    async listClientes({ status } = {}) {
      let q = db().from('clientes').select('*, colaboradores(nome)').order('nome');
      if (status) q = q.eq('status', status);
      const { data } = await q;
      return data ?? [];
    },

    async upsertCliente(campos) {
      const { data, error } = await db().from('clientes').upsert(campos).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    // ── Projetos ────────────────────────────────────────────────────────────
    async getProjeto(id) {
      const { data } = await db().from('projetos').select('*, clientes(nome), colaboradores(nome)').eq('id', id).maybeSingle();
      return data;
    },

    async listProjetos({ clienteId, status, responsavelId } = {}) {
      let q = db().from('projetos').select('*, clientes(nome), colaboradores(nome)').order('criado_em', { ascending: false });
      if (clienteId)     q = q.eq('cliente_id', clienteId);
      if (status)        q = q.eq('status', status);
      if (responsavelId) q = q.eq('responsavel_id', responsavelId);
      const { data } = await q;
      return data ?? [];
    },

    async upsertProjeto(campos) {
      const { data, error } = await db().from('projetos').upsert(campos).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    // ── Transações financeiras ──────────────────────────────────────────────
    async listTransacoes({ clienteId, tipo, de, ate, status } = {}) {
      let q = db().from('transacoes').select('*, clientes(nome), projetos(nome)').order('data', { ascending: false });
      if (clienteId) q = q.eq('cliente_id', clienteId);
      if (tipo)      q = q.eq('tipo', tipo);
      if (status)    q = q.eq('status', status);
      if (de)        q = q.gte('data', de);
      if (ate)       q = q.lte('data', ate);
      const { data } = await q;
      return data ?? [];
    },

    async upsertTransacao(campos) {
      const { data, error } = await db().from('transacoes').upsert(campos).select().maybeSingle();
      if (error) throw error;
      return data;
    },

    // ── Atalhos compostos (consultas cross-hub comuns) ──────────────────────

    // Retorna resumo financeiro de um cliente (útil no OutJourney e Financeiro)
    async resumoFinanceiroCliente(clienteId) {
      const linhas = await this.listTransacoes({ clienteId });
      const entradas  = linhas.filter(l => l.tipo === 'entrada' && l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0);
      const pendentes = linhas.filter(l => l.tipo === 'entrada' && l.status === 'pendente').reduce((s, l) => s + Number(l.valor), 0);
      const saidas    = linhas.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0);
      return { entradas, pendentes, saidas, saldo: entradas - saidas };
    },

    // Retorna projetos + transações de um cliente (card completo no OutJourney)
    async fichaCliente(clienteId) {
      const [cliente, projetos, financeiro] = await Promise.all([
        this.getCliente(clienteId),
        this.listProjetos({ clienteId }),
        this.resumoFinanceiroCliente(clienteId),
      ]);
      return { cliente, projetos, financeiro };
    },
  };

  window.OS = Object.assign(window.OS ?? {}, { Data });
  console.info('[OS] Data Layer v1.0 carregado ✓');
})();
