// ============================================================================
// SERVICE WORKER DO APP (28/09/2026) — só uma coisa: NOTIFICAÇÃO.
//
// É ele que mostra o aviso com o celular bloqueado e abre a tela certa no
// toque. De propósito NÃO guarda nada em cache (não tem "fetch" aqui): a casa já
// sofreu com "publiquei e não atualizou" — cada abertura do app busca a versão
// do ar, como sempre.
//
// Mora na RAIZ do site (/sw.js) porque só assim vale pra todas as telas.
// ============================================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Chegou notificação do servidor (Edge Function app-push)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Hub';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || '',
    icon: '/shared/icon-192.png',
    badge: '/shared/icon-192.png',
    tag: d.tag || undefined,           // mesma conversa: substitui o aviso anterior
    renotify: !!d.tag,                 // …mas vibra de novo
    data: { link: d.link || '/' },
  }));
});

// Tocou no aviso: abre (ou reaproveita) o app na tela certa
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.link) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) {
      if (c.url === alvo && 'focus' in c) return c.focus();
    }
    for (const c of abertas) {
      if ('navigate' in c && 'focus' in c) { await c.focus(); return c.navigate(alvo); }
    }
    return self.clients.openWindow(alvo);
  })());
});

// O navegador trocou a inscrição sozinho (acontece): a próxima abertura do app
// re-registra pelo os-core.js — aqui não há sessão pra falar com o banco.
self.addEventListener('pushsubscriptionchange', () => {});
