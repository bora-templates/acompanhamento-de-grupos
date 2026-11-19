/* ============================================================================
   CORES PESSOAIS: a paleta que cada pessoa escolhe na tela Conta ("Minha cor")
   ----------------------------------------------------------------------------
   É a cor que pinta o rosto da pessoa pelo sistema enquanto ela não sobe uma
   foto. Mora aqui, junto do design system, porque é cor gravada no banco (o
   valor hexadecimal vai para o perfil) e não pode virar variável de CSS.
   vTintaSobre(cor) devolve a tinta da sigla por cima da cor (carvão ou papel),
   para a sigla sempre ler.
   ============================================================================ */
(function () {
  'use strict';
  window.V_CORES_PESSOAIS = [
    { n: 'Terracota', h: '#E8703A' }, { n: 'Argila', h: '#C98A6B' },
    { n: 'Areia', h: '#D9B48F' }, { n: 'Mostarda', h: '#D6A440' },
    { n: 'Oliva', h: '#9DB07A' }, { n: 'Sálvia', h: '#7FA89A' },
    { n: 'Verde', h: '#3F8F63' }, { n: 'Petróleo', h: '#3C7A86' },
    { n: 'Ameixa', h: '#8E6A86' }, { n: 'Vinho', h: '#A34A4A' },
    { n: 'Pedra', h: '#8C8379' }, { n: 'Carvão', h: '#1D1A17' }
  ];
  window.V_COR_LIVRE_PADRAO = '#E8703A';
  window.vTintaSobre = function (h) {
    var c = String(h || '').replace('#', '');
    if (c.length !== 6) return '#FFF8F1';
    var l = (0.299 * parseInt(c.substr(0, 2), 16) + 0.587 * parseInt(c.substr(2, 2), 16) + 0.114 * parseInt(c.substr(4, 2), 16)) / 255;
    return l > 0.6 ? '#1D1A17' : '#FFF8F1';
  };
})();
