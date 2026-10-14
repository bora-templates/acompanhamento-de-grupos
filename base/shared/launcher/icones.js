/* ============================================================================
   INÍCIO DO HUB · os ROSTOS dos sistemas (window.InicioIcones)
   ----------------------------------------------------------------------------
   Cada sistema tem um desenho próprio, bem diferente dos outros. Os desenhos
   são provisórios até um admin subir a logo oficial da empresa em "Logos dos
   sistemas" (hub.hub_logos → balde hub-logos).
   Logo enviada vence o desenho: ic('journey') devolve a <img> se ela existir.
   ============================================================================ */
(function () {
  'use strict';
  const LG=(id,a,b,ang=160)=>`<defs><linearGradient id="${id}" gradientTransform="rotate(${ang-90} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  const BG=id=>`<rect width="100" height="100" fill="url(#${id})"/>`;
  const SOL=c=>`<rect width="100" height="100" fill="${c}"/>`;
  const ICONS = {
   usuarios:u=>LG(u,'#5A6275','#1C2029')+BG(u)+'<circle cx="50" cy="38" r="14" fill="#fff"/><path d="M24 80a26 26 0 0 1 52 0z" fill="#fff"/><circle cx="74" cy="30" r="8" fill="#9CB2D4"/><path d="M71 30l2.5 2.5 4.5-5" stroke="#1C2029" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
   central:u=>LG(u,'#5A6275','#1C2029')+BG(u)+'<rect x="22" y="22" width="25" height="32" rx="6" fill="#fff"/><rect x="53" y="22" width="25" height="18" rx="6" fill="#9CB2D4"/><rect x="53" y="46" width="25" height="32" rx="6" fill="#fff"/><rect x="22" y="60" width="25" height="18" rx="6" fill="#fff" fill-opacity=".55"/>',
   projetos:u=>SOL('#FFFFFF')+'<rect x="20" y="22" width="16" height="56" rx="6" fill="#8B7CF6"/><rect x="42" y="22" width="16" height="40" rx="6" fill="#41A9F5"/><rect x="64" y="22" width="16" height="26" rx="6" fill="#3FCB97"/><circle cx="28" cy="30" r="3" fill="#fff"/><circle cx="50" cy="30" r="3" fill="#fff"/><circle cx="72" cy="30" r="3" fill="#fff"/>',
   sign:u=>LG(u,'#2A2A2F','#09090B')+BG(u)+`<defs><linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7E2AE"/><stop offset="1" stop-color="#C3994F"/></linearGradient></defs><circle cx="37" cy="50" r="19" fill="#F7F3EA"/><path d="M62 31a19 19 0 0 1 0 38z" fill="url(#${u}g)"/><path d="M63.5 56c1.6-3.6 3-9 2.2-9.5-.9-.5-2.2 5.8-2.6 9 1.4-3.2 3.6-5.4 4.5-4 .7 1.1-.2 3.6 1.1 3.6 1.1 0 2.7-1.3 4.5-2" fill="none" stroke="#1A1A1A" stroke-width="1.1" stroke-linecap="round"/>`,
   indic:u=>SOL('#FFFFFF')+'<rect x="22" y="56" width="12" height="22" rx="4" fill="#FFC285"/><rect x="40" y="44" width="12" height="34" rx="4" fill="#FF9E4A"/><rect x="58" y="32" width="12" height="46" rx="4" fill="#F2701B"/><path d="M22 46l18-12 14 6 24-18" fill="none" stroke="#0A1030" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="78" cy="22" r="4.5" fill="#0A1030"/>',
   diretoria:u=>LG(u,'#2A2C55','#0E0F26')+BG(u)+`<defs><linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7E2AE"/><stop offset="1" stop-color="#C3994F"/></linearGradient></defs><path d="M22 66l-4-32 17 14 15-22 15 22 17-14-4 32z" fill="url(#${u}g)"/><rect x="22" y="70" width="56" height="8" rx="3" fill="url(#${u}g)"/>`,
   people:u=>LG(u,'#C3B7F2','#6A5AC0')+BG(u)+'<circle cx="62" cy="38" r="11" fill="#fff" fill-opacity=".55"/><path d="M44 74a18 18 0 0 1 36 0z" fill="#fff" fill-opacity=".55"/><circle cx="42" cy="42" r="13" fill="#fff"/><path d="M20 80a22 22 0 0 1 44 0z" fill="#fff"/>',
   processos:u=>SOL('#F6F2EA')+'<rect x="26" y="18" width="48" height="64" rx="7" fill="#3B5B8F"/><rect x="26" y="18" width="10" height="64" rx="5" fill="#2A4472"/><rect x="44" y="32" width="22" height="4" rx="2" fill="#fff"/><rect x="44" y="42" width="22" height="4" rx="2" fill="#fff" fill-opacity=".7"/><rect x="44" y="52" width="16" height="4" rx="2" fill="#fff" fill-opacity=".7"/><path d="M60 18v18l5-4 5 4V18z" fill="#EED7A4"/>',
   journey:u=>LG(u,'#5585EA','#13306B')+BG(u)+'<path d="M28 74c26 0 4-30 26-34s18-12 18-18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 10"/><circle cx="28" cy="74" r="7" fill="#9CB2D4"/><path d="M72 14a10 10 0 0 1 10 10c0 8-10 17-10 17s-10-9-10-17a10 10 0 0 1 10-10z" fill="#fff"/><circle cx="72" cy="24" r="3.5" fill="#13306B"/>',
   chat:u=>SOL('#FFFFFF')+'<path fill="#02133D" d="M22 62c-1.4 5-2.6 9.2-3.6 13 5.6-1.8 10.4-4.4 14.4-7.2A27 27 0 1 0 22 62z"/><path fill="#8DA2C8" d="M66 22a28 28 0 0 1 0 56z"/>',
   funnels:u=>LG(u,'#63E0C4','#127F69')+BG(u)+'<path d="M18 24h64l-7 12H25z" fill="#fff"/><path d="M27 40h46l-8 13H35z" fill="#fff" fill-opacity=".85"/><path d="M37 57h26l-7 12H44z" fill="#fff" fill-opacity=".7"/><rect x="45" y="72" width="10" height="9" rx="3" fill="#fff" fill-opacity=".55"/>',
   fin:u=>LG(u,'#F6DA9A','#B6852B')+BG(u)+'<g fill="#fff"><ellipse cx="50" cy="68" rx="24" ry="8"/><rect x="26" y="58" width="48" height="10"/><ellipse cx="50" cy="58" rx="24" ry="8" fill="#FBEFD3"/><rect x="26" y="44" width="48" height="12"/><ellipse cx="50" cy="44" rx="24" ry="8" fill="#FBEFD3"/><rect x="26" y="30" width="48" height="12"/><ellipse cx="50" cy="30" rx="24" ry="8" fill="#FFF8E8"/></g><text x="50" y="35" text-anchor="middle" font-size="13" font-weight="700" fill="#B6852B" font-family="-apple-system,system-ui,sans-serif">$</text>',
   pag:u=>SOL('#FFFFFF')+'<path d="M28 16h44v68l-7-5-7 5-8-5-8 5-7-5-7 5z" fill="#F3E7CC"/><rect x="36" y="30" width="28" height="4" rx="2" fill="#B6852B" fill-opacity=".5"/><rect x="36" y="40" width="20" height="4" rx="2" fill="#B6852B" fill-opacity=".5"/><circle cx="62" cy="62" r="14" fill="#B6852B"/><path d="M56 62l5 5 8-9" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
   produtos:u=>LG(u,'#B9E07E','#4F7F1F')+BG(u)+'<path d="M50 18l30 15v34L50 82 20 67V33z" fill="#fff" fill-opacity=".7"/><path d="M50 18l30 15-30 15-30-15z" fill="#fff"/><path d="M50 48v34" stroke="#4F7F1F" stroke-opacity=".35" stroke-width="2"/>',
   // OutCopiloto: o fone de ouvido com a onda da conversa (verde-água, a cor do módulo)
   copiloto:u=>LG(u,'#5FD4C3','#0F6E66')+BG(u)+'<path d="M26 56v-8a24 24 0 0 1 48 0v8" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><rect x="20" y="52" width="13" height="22" rx="6" fill="#fff"/><rect x="67" y="52" width="13" height="22" rx="6" fill="#fff"/><path d="M41 63v6M47 57v18M53 60v12M59 64v4" stroke="#fff" stroke-opacity=".8" stroke-width="3.5" stroke-linecap="round"/>',
   assistente:u=>LG(u,'#2A55A8','#00133D')+BG(u)+'<path d="M50 18c2 17 8 26 30 32-22 6-28 15-30 32-2-17-8-26-30-32 22-6 28-15 30-32z" fill="#fff"/><path d="M76 20c.8 5 2.6 7.6 8 9-5.4 1.4-7.2 4-8 9-.8-5-2.6-7.6-8-9 5.4-1.4 7.2-4 8-9z" fill="#EED7A4"/>',
   // Grupos: duas conversas de grupo e a faísca da IA (verde, a cor do WhatsApp)
   grupos:u=>LG(u,'#79D69A','#14693A')+BG(u)+'<path d="M46 42h28a9 9 0 0 1 9 9v13a9 9 0 0 1-9 9h-3v9l-11-9H46a9 9 0 0 1-9-9V51a9 9 0 0 1 9-9z" fill="#fff" fill-opacity=".55"/><path d="M26 24h30a9 9 0 0 1 9 9v17a9 9 0 0 1-9 9H41l-12 10v-10h-3a9 9 0 0 1-9-9V33a9 9 0 0 1 9-9z" fill="#fff"/><circle cx="31" cy="41.5" r="3.4" fill="#14693A"/><circle cx="41" cy="41.5" r="3.4" fill="#14693A"/><circle cx="51" cy="41.5" r="3.4" fill="#14693A"/><path d="M79 12c1.1 5.4 2.9 7.9 8.5 9-5.6 1.1-7.4 3.6-8.5 9-1.1-5.4-2.9-7.9-8.5-9 5.6-1.1 7.4-3.6 8.5-9z" fill="#FFE7A8"/>',
  };
  let UID = 0;
  const LOGO = {};                  // chave → url, lido de hub.hub_logos no boot
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function ic(k, s) {
    const st = s ? ` style="--s:${s}px"` : '';
    if (LOGO[k]) return `<span class="ic up" data-k="${esc(k)}"${st}><img src="${esc(LOGO[k])}" alt="" loading="lazy"></span>`;
    const u = 'g' + (UID++);
    const des = ICONS[k] || ICONS.central;
    return `<span class="ic" data-k="${esc(k)}"${st}><svg viewBox="0 0 100 100" aria-hidden="true">${des(u)}</svg></span>`;
  }
  window.InicioIcones = { ic, LOGO, tem: k => !!ICONS[k] };
})();
