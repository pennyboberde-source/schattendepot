/// <reference lib="webworker" />
// Service Worker: App offline vorhalten, Daten frisch holen (Netz zuerst), Web-Push anzeigen.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Laufzeitdaten (daten/…) kommen bei jedem Deploy neu – Netz zuerst, offline der letzte Stand.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.includes('/daten/'),
  new NetworkFirst({ cacheName: 'daten', networkTimeoutSeconds: 6 }),
);

interface PushNachricht {
  titel: string;
  text: string;
  /** Hash-Route in der App, z. B. "#/order/2026-10-21-sap". */
  ziel?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let n: PushNachricht;
  try {
    n = event.data?.json() as PushNachricht;
  } catch {
    n = { titel: 'Schattendepot', text: event.data?.text() ?? '' };
  }
  event.waitUntil(
    self.registration.showNotification(n.titel, {
      body: n.text,
      tag: n.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { ziel: n.ziel ?? '' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ziel = new URL(self.registration.scope + (event.notification.data?.ziel ?? '')).href;
  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const f of fenster) {
        if ('focus' in f) {
          await (f as WindowClient).navigate(ziel).catch(() => undefined);
          return (f as WindowClient).focus();
        }
      }
      return self.clients.openWindow(ziel);
    })(),
  );
});
