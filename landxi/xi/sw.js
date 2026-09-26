/* sw.js — XI맵 외부 타일 방패 + 타일 캐시(서비스 워커 · scope /landxi/xi/).
   ① 외부 위성 타일 호스트(GIBS · V-World xdworld · EOX)가 5xx/CORS 오류를 내면 화면에는 투명 1×1 로 대신 준다 —
      제3자 서버의 일시 장애가 우리 화면의 콘솔 오류·깨진 타일이 되지 않게(계약 §12 '콘솔 오류 0').
      실패 건수는 postMessage 로 화면에 알려 출처 칩 옆 '외부 타일 결손 n' 으로 정직하게 보인다.
   ② 성공한 타일 이미지는 Cache Storage(lx-ext-v2)에 둔다 — GIBS 는 no-store 라 브라우저 캐시가 없어서,
      글로브→남원 하강 경로를 한국 비행 중에 선적재(xi.js prewarm)해도 하강 때 다시 받느라 먹색 프레임이 났다.
      GIBS 경로에는 날짜가 들어 있어 같은 URL = 같은 내용. 4,000칸을 넘으면 오래된 것부터 지운다. 결손(투명 대체)은 캐시하지 않는다. */
const HOSTS = ['gibs.earthdata.nasa.gov', 'xdworld.vworld.kr', 'tiles.maps.eox.at'];
const CACHE = 'lx-ext-v2', MAX = 4000;
const BLANK = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
let failed = 0, puts = 0;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('lx-ext-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || !HOSTS.includes(u.hostname) || !/\.(png|jpe?g|webp)$/i.test(u.pathname)) return;
  e.respondWith(serve(e.request, u));
});
async function serve(req, u) {
  let c = null;
  try { c = await caches.open(CACHE); const hit = await c.match(req.url, { ignoreVary: true, ignoreSearch: false }); if (hit) return hit; } catch { /* 캐시 불가 → 통과 */ }
  let r;
  try { r = await fetch(req); } catch { return blank(u, 0); }
  if (!r.ok) return r.status === 304 ? r : blank(u, r.status);
  if (c && r.status === 200 && (r.type === 'cors' || r.type === 'basic')) {
    c.put(req.url, r.clone()).then(() => { if (++puts % 200 === 0) trim(c); }).catch(() => {});
  }
  return r;
}
async function trim(c) {
  try { const ks = await c.keys(); for (let i = 0; i < ks.length - MAX; i++) await c.delete(ks[i]); } catch { /* */ }
}
async function blank(u, status) {
  failed++;
  const cs = await self.clients.matchAll();
  for (const c of cs) c.postMessage({ type: 'lx-tile-miss', host: u.hostname, status, failed });
  return new Response(BLANK, { status: 200, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*', 'x-lx-blank': String(status) } });
}
