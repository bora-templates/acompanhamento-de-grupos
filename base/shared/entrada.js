/* ============================================================================
   ENTRADA DO PACOTE DE UMA SOLUÇÃO (window.Entrada): a porta de entrada "/"
   Só vai no pacote avulso (marcador). No pacote completo,
   quem cuida do login e da tela inicial é o inicio.js da pasta do lançador.
   ----------------------------------------------------------------------------
   O cliente instala uma solução por instalação, e por isso não existe tela
   inicial: depois do login, e sempre que alguém já logado abre "/", a pessoa
   vai direto para a solução (OS.solucao.caminho, escrito pela fábrica a partir
   do sistema.json do módulo). O ?volta= continua valendo (o link de uma tela
   aberto sem sessão volta para ela depois do login).
   Quem entrou mas não tem a chave da solução vê, aqui mesmo, a tela "Você
   ainda não tem acesso ao <solução>", que diz a quem pedir. Esta página nunca
   manda essa pessoa para a solução, e a solução manda quem não tem acesso para
   o bloqueio dela (os-core.js), então não existe laço de redirecionamento.
   Instalação nova, ainda sem administrador: vai para /primeiro-acesso/.
   ============================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const O = window.OS;
  if (!O || !O.Auth || !O.avulsa) return;   // no código-fonte (completo) esta página é o Início, do inicio.js
  const S = O.solucao || { rotulo: O.solucaoNome || 'sistema', nome: O.solucaoNome || '', caminho: '/', acesso: '', estrito: false };
  const db = () => O.getClient();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function carregando(m) { $('#overlayMsg').textContent = m || 'Carregando'; $('#overlay').hidden = false; }
  function pronto() { $('#overlay').hidden = true; }
  function mostra(id) { ['#gate', '#semAcesso'].forEach((x) => { const el = $(x); if (el) el.hidden = (x !== id); }); pronto(); }

  // a marca e o nome da solução no cartão de entrada
  function marcaDaSolucao() {
    const linha = $('#gateSolucao');
    if (linha && S.nome) { linha.textContent = S.nome; linha.hidden = false; }
    if (!S.marca) return;
    document.querySelectorAll('.gate-card .v-marca').forEach((el) => {
      el.classList.add('v-marca--img');
      el.innerHTML = '<img src="' + esc(S.marca) + '" alt="" width="44" height="44">';
    });
  }

  // link de uma tela aberto sem sessão chega com ?volta=/caminho (só caminho DESTE site)
  function destinoDeVolta() {
    try {
      const v = new URL(location.href).searchParams.get('volta');
      if (!v) return null;
      const d = decodeURIComponent(v);
      return (!d.startsWith('/') || d.startsWith('//') || d === '/' || d.startsWith('/?')) ? null : d;
    } catch (e) { return null; }
  }
  // a mesma regra da tela da solução: chave restrita (estrito) só abre com a chave liberada, mesmo para o admin geral
  function temAcesso(acc) {
    if (!S.acesso) return true;
    return S.estrito ? O.temAcessoEstrito(acc, S.acesso) : O.canAccess(acc.acessos, S.acesso);
  }
  const ehDaSolucao = (d) => d.split(/[?#]/)[0].indexOf(S.caminho.replace(/\/$/, '')) === 0;

  // quem tem sessão: decide para onde vai (nunca volta para "/")
  async function segue() {
    const acc = await O.getMyAccess();
    if (!O.estaNoTime(acc)) return foraDoTime();
    const volta = destinoDeVolta();
    if (temAcesso(acc)) { location.replace(volta || S.caminho); return; }
    // sem a chave da solução: as telas da base (Minha conta, Usuários) continuam abrindo pelo ?volta=
    if (volta && !ehDaSolucao(volta)) { location.replace(volta); return; }
    let email = '';
    try { const sessao = await O.Auth.getSession(); email = (sessao && sessao.user && sessao.user.email) || ''; } catch (e) { email = ''; }
    semAcesso(acc, email);
  }

  function semAcesso(acc, email) {
    document.title = 'Sem acesso · ' + (S.rotulo || 'sistema');
    $('#semAcessoTitulo').textContent = 'Você ainda não tem acesso ao ' + S.rotulo;
    $('#semAcessoTexto').textContent = 'Quem administra o sistema da empresa libera o acesso ao ' + S.rotulo + ' na tela Usuários. '
      + 'Peça a essa pessoa para liberar o seu e-mail' + (email ? ' (' + email + ')' : '') + '.';
    // quem administra o sistema inteiro pode liberar a si mesmo: o botão leva à tela Usuários
    $('#semAcessoUsuarios').hidden = !(acc && acc.level === 'admin');
    mostra('#semAcesso');
  }

  async function foraDoTime() {
    try { await O.Auth.signOut(); } catch (e) { /* sai mesmo assim */ }
    $('#semAcessoTitulo').textContent = 'Esta conta não tem acesso ao sistema';
    $('#semAcessoTexto').textContent = 'Se você faz parte do time e está vendo isto, peça a quem administra o sistema da empresa para liberar o seu acesso na tela Usuários.';
    $('#semAcessoUsuarios').hidden = true;
    $('#semAcessoSair').textContent = 'Entrar com outra conta';
    mostra('#semAcesso');
  }

  function mostraLogin() {
    document.title = 'Entrar' + (O.empresa ? ' · ' + O.empresa : '');
    mostra('#gate');
  }

  // Instalação nova, ainda sem administrador? Pergunta à função primeiro-acesso; sem resposta (função não publicada,
  // rede fora), segue para o login normal e nunca trava a entrada.
  async function primeiroAcessoAberto() {
    try {
      const r = await Promise.race([
        db().functions.invoke('primeiro-acesso', { method: 'GET' }),
        new Promise((ok) => setTimeout(() => ok(null), 2500)),
      ]);
      return !!(r && !r.error && r.data && r.data.disponivel === true);
    } catch (e) { return false; }
  }

  async function inicia() {
    marcaDaSolucao();
    carregando('Carregando');
    try {
      const sessao = await O.Auth.getSession();
      if (!sessao) {
        if (await primeiroAcessoAberto()) { location.replace('/primeiro-acesso/'); return; }
        mostraLogin(); return;
      }
      carregando('Abrindo o ' + S.rotulo);
      await segue();
    } catch (e) { mostraLogin(); }
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn'), err = $('#loginErr');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando'; carregando('Entrando');
    // erro de senha fala de senha; erro DEPOIS da senha diz que a senha está certa
    try { await O.Auth.signIn($('#email').value.trim(), $('#pass').value); }
    catch (eSenha) {
      pronto(); err.textContent = 'E-mail ou senha não conferem. Confira o e-mail exatamente como está no cadastro (ponto, hífen e _ contam).';
      btn.disabled = false; btn.textContent = 'Entrar'; return;
    }
    try { carregando('Abrindo o ' + S.rotulo); await segue(); }
    catch (eDepois) {
      pronto();
      err.textContent = 'Sua senha está certa, mas a tela não abriu (' + ((eDepois && eDepois.message) || 'falha de conexão') + '). Confira a internet e toque em Entrar de novo.';
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });

  // "Esqueci minha senha": serve para quem esqueceu e para quem foi convidado
  $('#forgotLink').addEventListener('click', async () => {
    const email = $('#email').value.trim(), msg = $('#recoverMsg'); $('#loginErr').textContent = '';
    if (!email) { msg.style.color = 'var(--risk)'; msg.textContent = 'Digite o seu e-mail no campo acima e toque de novo em Esqueci minha senha.'; $('#email').focus(); return; }
    msg.style.color = ''; msg.textContent = 'Enviando';
    try {
      const r = await db().auth.resetPasswordForEmail(email, { redirectTo: O.link('/entrar/') });
      if (r.error) throw r.error;
      msg.style.color = 'var(--ok)'; msg.textContent = 'Pronto! Enviamos um link para ' + email + '. Abra o e-mail para definir a senha.';
    } catch (e2) { msg.style.color = 'var(--risk)'; msg.textContent = 'Não deu para enviar o link (' + (e2.message || 'falha de conexão') + '). Confira o e-mail e tente de novo.'; }
  });

  // Sair (na tela de quem ainda não tem acesso): volta ao login, aqui mesmo
  $('#semAcessoSair').addEventListener('click', async () => {
    carregando('Saindo');
    try { await O.Auth.signOut(); } catch (e) { /* sai mesmo assim */ }
    $('#semAcessoSair').textContent = 'Sair';
    $('#pass').value = '';
    mostraLogin();
  });

  window.Entrada = { segue, destinoDeVolta };
  inicia();
})();
