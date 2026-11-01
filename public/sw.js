// Cache only this public offline screen. Never cache account pages, API
// responses, auth tokens or library data. All normal launches use the network.
const OFFLINE_CACHE='scene-offline-v1';
const OFFLINE_URL='/offline.html';
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{const cache=await caches.open(OFFLINE_CACHE);await cache.add(new Request(OFFLINE_URL,{cache:'reload'}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('scene-offline-')&&key!==OFFLINE_CACHE)await caches.delete(key);await self.clients.claim();})());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||url.pathname!=='/')return;
 event.respondWith((async()=>{try{return await fetch(request,{cache:'no-store'});}catch{return await caches.match(OFFLINE_URL,{cacheName:OFFLINE_CACHE})||new Response('Scene is offline. Reconnect and reload.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});}})());
});
// Push payloads deliberately contain no title, account or watchlist information.
self.addEventListener('push',event=>{
 let availability=false;try{availability=event.data?.json()?.type==='scene-now-streaming';}catch{}
 event.waitUntil(self.registration.showNotification(availability?'Scene availability update':'Scene release reminder',{body:availability?'A saved title has new viewing options on your services. Open Scene to check.':'A release you follow is scheduled today. Open Scene to check the latest details.',icon:'/icons/scene-sidelight-192.png?v=sidelight-1',badge:'/icons/scene-sidelight-192.png?v=sidelight-1',tag:availability?'scene-now-streaming':'scene-release-day',data:{url:availability?'/?scene=availability':'/?scene=reminders'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.url==='/?scene=availability'?'/?scene=availability':'/?scene=reminders',self.location.origin).href;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}}return self.clients.openWindow(url);})());
});
