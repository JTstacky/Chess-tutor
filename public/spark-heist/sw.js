// Spark Heist was taken down. This replaces its old offline worker: it deletes the cached
// game, unregisters itself and reloads open Spark Heist tabs so they show the notice page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('spark-')).map(key => caches.delete(key)));
  await self.registration.unregister();
  const tabs = await self.clients.matchAll({type: 'window'});
  for (const tab of tabs) tab.navigate(tab.url).catch(() => {});
})()));
