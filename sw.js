const CACHE='lucent-timer-v0.9.0';
const ASSETS=["./", "./index.html", "./styles.css", "./app.js", "./appearance.js", "./appearance.css", "./manifest.webmanifest", "./icons/icon.svg", "./assets/fonts/Caveat-Bold.ttf", "./assets/fonts/Caveat-Medium.ttf", "./assets/fonts/Caveat-Regular.ttf", "./assets/fonts/Digital-7.ttf", "./assets/fonts/Orbitron-Bold.ttf", "./assets/fonts/Orbitron-Medium.ttf", "./assets/fonts/Orbitron-Regular.ttf", "./assets/fonts/Rajdhani-Bold.ttf", "./assets/fonts/Rajdhani-Light.ttf", "./assets/fonts/Rajdhani-Medium.ttf", "./assets/fonts/Rajdhani-Regular.ttf", "./assets/fonts/Roboto-Bold.ttf", "./assets/fonts/Roboto-Light.ttf", "./assets/fonts/Roboto-Medium.ttf", "./assets/fonts/Roboto-Regular.ttf"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
