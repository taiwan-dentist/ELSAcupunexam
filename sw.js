// tools/prepare-pwa.mjs updates this version and the complete local asset list.
const CACHE_VERSION='55083895142fbfcc';
const ASSETS=[
 "css/app.css",
 "data/geometry.json",
 "data/points.json",
 "icons/apple-touch-icon.png",
 "icons/arrow-up-right-square-outline.svg",
 "icons/book.svg",
 "icons/dark-light.svg",
 "icons/favicon.ico",
 "icons/favicon.svg",
 "icons/home.svg",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "icons/settings.svg",
 "index.html",
 "js/app.js",
 "js/overview-search.js",
 "js/page-transition.js",
 "js/picking.js",
 "js/pwa.js",
 "js/quiz.js",
 "js/scene.js",
 "js/scope-io.js",
 "manifest.webmanifest",
 "model/acupoint.glb",
 "vendor/three/build/three.core.js",
 "vendor/three/build/three.tsl.js",
 "vendor/three/build/three.webgpu.js",
 "vendor/three/examples/jsm/controls/OrbitControls.js",
 "vendor/three/examples/jsm/libs/meshopt_decoder.module.js",
 "vendor/three/examples/jsm/loaders/GLTFLoader.js",
 "vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
 "vendor/three/examples/jsm/utils/SkeletonUtils.js"
];
const SCOPE=self.registration.scope;
const CACHE_PREFIX='acupoint-quiz:'+SCOPE+':';
const CACHE_NAME=CACHE_PREFIX+CACHE_VERSION;
const ASSET_URLS=new Set(ASSETS.map(file=>new URL(file,SCOPE).href));
const INDEX_URL=new URL('index.html',SCOPE).href;

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const existed=await caches.has(CACHE_NAME),cache=await caches.open(CACHE_NAME);
  try{await cache.addAll([...ASSET_URLS].map(url=>new Request(url,{cache:'reload'})));}
  catch(error){if(!existed)await caches.delete(CACHE_NAME);throw error;}
  // Keep updates waiting until every old tab closes; never reload a running exam.
 })());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME)await caches.delete(key);
 })());
});

self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(SCOPE);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.searchParams.has('qa')||url.pathname.includes('/__qa/'))return;
 const navigation=request.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL(INDEX_URL).pathname);
 if(!navigation&&(url.search||!ASSET_URLS.has(url.href)))return;
 // Serve one complete release together. Unknown files and external fonts stay on the network.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME),response=await cache.match(navigation?INDEX_URL:request);
  return response||fetch(request);
 })());
});
