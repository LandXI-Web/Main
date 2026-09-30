/* Land-XI 공개 관문 — 바깥 주소(app.land-xi.dev · Cloudflare 터널)가 닿는 유일한 문. 127.0.0.1:4180
   - 화면 파일은 허용 목록(landxi/ 아래)에서만 내준다. 점(.)으로 시작하는 이름·서버·도구·문서·원본 데이터는 내주지 않는다
     (개발용 tools/serve.mjs 는 저장소 전체를 내주므로 바깥에 열지 않는다).
   - /api · /tiles · /files 는 게이트웨이(127.0.0.1:8700)로 그대로 넘긴다(실시간 스트림 포함). 원래 Host 를 넘겨 서명 주소가 바깥 주소로 나온다.
   - 로그인 시도는 접속 주소마다 10분에 20번까지(비밀번호 대입 막기).
   사용: node tools/public-gate.mjs   (server/start-public.ps1 이 숨김으로 띄운다) */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.LX_GATE_PORT) || 4180;
const GW = { host: '127.0.0.1', port: Number(process.env.LX_API_PORT) || 8700 };
const HOME = '/landxi/v3/login/';
/* 입구 셋(원칙 27 · 확인 대장 6) — 한 플랫폼의 분기. 입구 화면 정리 전까지는 같은 로그인에 그 입구의 첫 화면을 미리 고른다.
   주소는 나중에 도메인에 따라 바뀔 수 있다 — 이름은 여기와 server/.env LX_PUBLIC_HOSTS 두 곳만. */
const ENTRY = { admin: HOME + '?next=' + encodeURIComponent('/landxi/v3/ops-core/'), gov: HOME + '?next=' + encodeURIComponent('/landxi/v3/gov-fusion/') };
const siteOf = (req) => String(req.headers.host || '').toLowerCase().split('.')[0];

const API_PREFIX = /^\/(api|tiles|files)\//;
/* 화면이 읽는 곳만. landxi/data(원본 데이터 연결)는 화면이 직접 읽는 지도 조각만 연다 */
const ALLOW = /^\/landxi\/(v3|shared|assets|agent|xi|global|ops|proto)\/|^\/landxi\/data\/(tiles|vector|global)\/|^\/landxi\/data\/survey\/[\w.-]+\.pmtiles$|^\/landxi\/data\/manifest\.json$/;
const DENY = /(^|\/)\.|(^|\/)(node_modules|server|tools|docs|tests|shots|_[a-z]+)(\/|$)|\.(py|ps1|md|env|log|pid|yml|yaml|sqlite|db)$/i;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pmtiles': 'application/octet-stream', '.pbf': 'application/x-protobuf', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8' };
const BLANK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };

/* 로그인 시도 제한 — 접속 주소(Cloudflare 가 붙이는 CF-Connecting-IP)마다 */
const WINDOW = 10 * 60 * 1000, MAX_LOGIN = 20, tries = new Map();
function loginAllowed(ip) {
  const now = Date.now(), a = (tries.get(ip) || []).filter((t) => now - t < WINDOW);
  a.push(now); tries.set(ip, a);
  if (tries.size > 5000) for (const [k, v] of tries) if (!v.some((t) => now - t < WINDOW)) tries.delete(k);
  return a.length <= MAX_LOGIN;
}

/* 지도 키(V-World)는 서버 파일에서 읽어 화면에 넣는다(소스에는 두지 않는다) — 개발 서버와 같은 방식 */
function envJs() {
  let key = '';
  try { const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^\s*VWORLD_KEY\s*=\s*(.+?)\s*$/m); if (m) key = m[1].replace(/^["']|["']$/g, ''); } catch { /* 없음 */ }
  return `window.VWORLD_KEY=${JSON.stringify(key)};\n`;
}

function send(res, code, body = '', headers = {}) { res.writeHead(code, { ...SEC, 'content-type': 'text/plain; charset=utf-8', ...headers }); res.end(body); }

function proxy(req, res) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
  if (req.method === 'POST' && /^\/api\/v1\/auth\/login\/?$/.test(req.url.split('?')[0]) && !loginAllowed(ip))
    return send(res, 429, JSON.stringify({ error: { code: 'too_many_attempts', message: '로그인 시도가 너무 많습니다. 10분 뒤 다시 해 주세요.' } }), { 'content-type': 'application/json' });
  const headers = { ...req.headers, 'x-forwarded-for': ip, 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host || '' };
  const up = http.request({ ...GW, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode || 502, { ...r.headers, 'x-content-type-options': 'nosniff' });
    if (/text\/event-stream/.test(r.headers['content-type'] || '')) res.flushHeaders?.();
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) send(res, 502, JSON.stringify({ error: { code: 'gateway_down', message: '서버에 연결할 수 없습니다.' } }), { 'content-type': 'application/json' }); else res.end(); });
  req.on('aborted', () => up.destroy());
  req.pipe(up);
}

function serveFile(req, res, p) {
  if (p.endsWith('/')) p += 'index.html';
  if (!ALLOW.test(p) || DENY.test(p)) return send(res, 404, '404');
  const f = path.join(ROOT, p);
  if (!f.startsWith(path.join(ROOT, 'landxi') + path.sep)) return send(res, 404, '404');
  let st; try { st = fs.statSync(f); } catch { st = null; }
  if (!st || st.isDirectory()) {
    if (/^\/landxi\/(assets|data)\/tiles\//.test(p)) return send(res, 200, BLANK, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' });
    return send(res, 404, '404');
  }
  const type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const cache = /\.(html|js|mjs|css|json)$/.test(f) ? 'no-cache' : 'public, max-age=86400';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && st.size) {
    let start = range[1] === '' ? null : Number(range[1]), end = range[2] === '' ? null : Number(range[2]);
    if (start === null) { start = Math.max(0, st.size - (end || 0)); end = st.size - 1; }
    if (end === null || end >= st.size) end = st.size - 1;
    if (!Number.isFinite(start) || start > end) return send(res, 416, '', { 'content-range': `bytes */${st.size}` });
    res.writeHead(206, { ...SEC, 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1, 'cache-control': cache });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...SEC, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size, 'cache-control': cache });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f).pipe(res);
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, '400'); }
  if (p.includes('\0') || p.includes('..')) return send(res, 400, '400');
  if (API_PREFIX.test(p)) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '405');
  if (p === '/' || p === '/landxi' || p === '/landxi/' || p === '/landxi/v3' || p === '/landxi/v3/') return send(res, 302, '', { location: ENTRY[siteOf(req)] || HOME });
  if (p === '/favicon.ico') return send(res, 204);
  if (p === '/landxi/proto/env.js') return send(res, 200, envJs(), { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  serveFile(req, res, p);
}).listen(PORT, '127.0.0.1', () => console.log('public gate http://127.0.0.1:' + PORT + HOME));
