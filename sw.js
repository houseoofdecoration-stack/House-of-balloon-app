/* House of Balloons CRM service worker – v18: field alarm push */
const C="hob-shell-3";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(["./","icon-192.png"])).catch(()=>{}))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request,u=new URL(r.url);if(r.method!=="GET"||u.origin!==location.origin)return;
  e.respondWith(fetch(r,{cache:"no-store"}).then(x=>{if(x.ok){const y=x.clone();caches.open(C).then(c=>c.put(r,y))}return x}).catch(()=>caches.match(r).then(m=>m||caches.match("./"))))});
self.addEventListener("push",e=>{let d={};try{d=e.data.json()}catch(x){try{d={body:e.data.text()}}catch(y){}}
  const o={body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||"hob",renotify:true,requireInteraction:!!d.alarm,
    vibrate:d.alarm?[900,300,900,300,900,300,900,300,900]:[200,100,200],data:{url:d.url||"./",ack:d.ack||""}};
  if(d.ack)o.actions=[{action:"ack",title:"✓ Dekh liya"},{action:"open",title:"App kholo"}];
  e.waitUntil(self.registration.showNotification(d.title||"House of Balloons",o))});
self.addEventListener("notificationclick",e=>{e.notification.close();const D=e.notification.data||{};
  if(e.action==="ack"&&D.ack){e.waitUntil(fetch(D.ack,{method:"POST"}).then(r=>r.ok?self.registration.showNotification("✓ Owner ko pata chal gaya",{body:"Aapne alarm dekh liya.",icon:"icon-192.png",tag:"hob-ack"}):null).catch(()=>{}));return}
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if("focus" in c)return c.focus()}return self.clients.openWindow(D.url||"./")}))});
