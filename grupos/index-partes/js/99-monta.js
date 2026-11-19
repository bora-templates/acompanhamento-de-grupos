/* ============================================================================
   Grupos · 99 junta as partes num app Alpine só (x-data="grApp()")
   Junta pelas DESCRIÇÕES das propriedades: os "get" continuam sendo get
   (Object.assign leria o valor uma vez e congelaria).
   ============================================================================ */
function grApp() {
  const alvo = {};
  for (const parte of [grBase(), grGrupos(), grGrupo(), grResumos(), grExtras(), grAjustes()]) {
    for (const [nome, desc] of Object.entries(Object.getOwnPropertyDescriptors(parte))) {
      if (Object.prototype.hasOwnProperty.call(alvo, nome)) {
        console.warn('[Grupos] nome repetido entre as partes (vale o de baixo):', nome);
      }
      Object.defineProperty(alvo, nome, desc);
    }
  }
  return alvo;
}
