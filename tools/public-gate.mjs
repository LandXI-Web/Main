/* Land-XI 공개 관문 — 바깥 주소(입구 셋 app · admin · gov — Cloudflare 터널)가 닿는 유일한 문. 127.0.0.1:4180
   - 화면 파일은 허용 목록(landxi/ 아래)에서만 내준다. 점(.)으로 시작하는 이름·서버·도구·문서·원본 데이터는 내주지 않는다
     (개발용 tools/serve.mjs 는 저장소 전체를 내주므로 바깥에 열지 않는다).
   - /api · /tiles · /files 는 게이트웨이(127.0.0.1:8700)로 그대로 넘긴다(실시간 스트림 포함). 원래 Host 를 넘겨 서명 주소가 바깥 주소로 나온다.
   - 로그인 시도는 접속 주소마다 10분에 20번까지(비밀번호 대입 막기).
   - 입구(주소 이름 → app · admin · gov)를 서버에 x-lx-site 로 알린다. 바깥에서 보낸 같은 이름의 값은 버린다(입구는 주소로만 정해진다).
   - 기관 주소 — 구현 2차 T3 · 사용자 구현 확인 I-1("Land-XI 로그인은 LX 직원만 이용하는 창구") · 7차 결정 기관-주소 ⓒ(기관별 주소 + 요청 기관만 자체 도메인):
       https://{기관}.land-xi.dev/ = 그 기관 메인(그 기관 모습의 로그인 포함 · landxi/v3/gov-home) — 입구는 gov(문 = 기관 계정), 로그인은 그 기관 계정만.
       그 주소의 다른 화면(서비스 선택 · 기관 화면)도 같은 주소에서 연다. Land-XI 로그인 주소로 오면 그 기관 메인으로 돌린다.
       https://gov.land-xi.dev/ = 기관 고르기 목록(각 기관 주소로) · 옛 모양 gov.land-xi.dev/{기관}/ 는 기관 주소로 넘긴다(301).
       {기관}은 서버가 만든 기관 목록(GET /api/v1/auth/tenants · 60초 보관)에 있는 것만 — 없는 기관 주소는 404. 주소 규칙은 sites.js gov.orgHost · gov.orgDomains 한 곳.
       기관 마크 그림은 /files/brand/{기관}/mark-<해시>.png 모양만 게이트웨이로 넘긴다(허용 목록).
   사용: node tools/public-gate.mjs   (server/start-public.ps1 이 숨김으로 띄운다) */
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.LX_GATE_PORT) || 4180;
const GW = { host: '127.0.0.1', port: Number(process.env.LX_API_PORT) || 8700 };
const HOME = '/landxi/v3/login/';
/* 입구 셋(원칙 27 · 확인 대장 6·7) — 한 플랫폼의 분기. 세 주소 모두 같은 로그인 화면으로 가고, 로그인 화면이 주소를 보고 알맞은 모습이 된다
   (app·admin = 아이디·비밀번호 · gov = 기관 고르기 + 아이디·비밀번호). 첫 화면은 입구별 표(kit/auth-gate.js LANDING_AT)가 정한다.
   주소 이름은 화면과 같은 표 한 곳(landxi/v3/kit/sites.js)에서 읽는다 — 바꾸면 터널 설정 · server/.env LX_PUBLIC_HOSTS 도 같은 이름으로. */
await import(new URL('../landxi/v3/kit/sites.js', import.meta.url).href);
const ENTRY = Object.freeze(Object.fromEntries(Object.entries(globalThis.LX_SITES).map(([site, v]) => [v.host.toLowerCase(), site])));   // 주소 이름 → 입구
const hostOf = (req) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
/* 기관 주소 — 규칙({org}.land-xi.dev)과 요청 기관의 자체 도메인(sites.js gov.orgHost · gov.orgDomains) */
const GOVC = globalThis.LX_SITES.gov;
const ORG_HOST = new RegExp('^' + String(GOVC.orgHost || '').replace(/[.]/g, '\\.').replace('{org}', '([a-z0-9][a-z0-9-]{1,40})') + '$', 'i');
function orgOfReq(req) {
  const hn = hostOf(req);
  if (ENTRY[hn]) return null;
  for (const [id, d] of Object.entries(GOVC.orgDomains || {})) if (String(d).toLowerCase() === hn) return id;
  const m = ORG_HOST.exec(hn);
  return m && !(GOVC.reserved || []).includes(m[1]) ? m[1] : null;
}
const siteOf = (req) => ENTRY[hostOf(req)] || (orgOfReq(req) ? 'gov' : null);
const orgUrlOf = (id) => 'https://' + (GOVC.orgDomains?.[id] || GOVC.orgHost.replace('{org}', id)) + '/';
const NO_ORG = Buffer.from('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>없는 기관 주소</title></head>'
  + '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F2F4F6;color:#1C1F25;font-family:Pretendard,sans-serif;word-break:keep-all">'
  + '<main style="background:#fff;border-radius:16px;padding:32px;margin:20px;max-width:420px"><h1 style="margin:0 0 8px;font-size:24px;line-height:32px">없는 기관 주소입니다</h1>'
  + '<p style="margin:0 0 20px;color:#4E535C;line-height:24px">주소를 다시 확인하거나 기관 목록에서 고르세요.</p>'
  + '<a href="https://' + GOVC.host + '/" style="display:inline-block;background:#1C1F25;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">기관 목록</a></main></body></html>');
const noOrg = (res) => { res.writeHead(404, { ...SEC, 'content-type': 'text/html; charset=utf-8', 'content-length': NO_ORG.length, 'cache-control': 'no-store' }); res.end(NO_ORG); };

/* 기관 메인 — 주소 모양(sites.js gov.org '/{org}/')과 서버의 기관 목록 */
const GOV_HOME = '/landxi/v3/gov-home/';
const [ORG_PRE, ORG_POST] = String(globalThis.LX_SITES.gov.org || '/{org}/').split('{org}');
const ORG_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const RESERVED = new Set(['landxi', 'api', 'tiles', 'files', 'favicon.ico']);
let ORGS = null, ORGS_AT = 0, ORGS_WAIT = null;
function loadOrgs() {
  if (ORGS && Date.now() - ORGS_AT < 60000) return Promise.resolve(ORGS);
  if (ORGS_WAIT) return ORGS_WAIT;
  ORGS_WAIT = new Promise((done) => {
    const fail = () => { ORGS_WAIT = null; done(ORGS); };   // 서버가 멈춰도 마지막 목록으로(처음이면 null — 화면이 서버 오류를 말한다)
    http.get({ ...GW, path: '/api/v1/auth/tenants', timeout: 4000 }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => (b += c)); r.on('end', () => {
      try { const j = JSON.parse(b); if (Array.isArray(j.items)) { ORGS = new Set(j.items.map((t) => t.id)); ORGS_AT = Date.now(); } } catch { /* 아래 */ }
      ORGS_WAIT = null; done(ORGS);
    }); }).on('error', fail).on('timeout', function () { this.destroy(); });
  });
  return ORGS_WAIT;
}
/** 경로 → 기관 id(모양만 · 목록 확인 전) · 끝 '/' 가 없으면 slash:false */
function orgPath(p) {
  if (!p.startsWith(ORG_PRE)) return null;
  let id = p.slice(ORG_PRE.length), slash = true;
  if (ORG_POST) { if (id.endsWith(ORG_POST)) id = id.slice(0, -ORG_POST.length); else slash = false; }
  return ORG_ID.test(id) && !RESERVED.has(id) ? { id, slash } : null;
}
/** 기관 메인 HTML — 주소는 /{기관}/ 그대로 두고, 화면의 상대 경로가 gov-home 에서 풀리도록 <base> 를 붙인다(미리 받기 목록도) */
function serveGovHome(res) {
  const f = path.join(ROOT, 'landxi', 'v3', 'gov-home', 'index.html');
  let html; try { html = htmlWithPreload(GOV_HOME + 'index.html', f); } catch { return send(res, 404, '404'); }
  const body = Buffer.from(html.replace(/<head>/i, `<head><base href="${GOV_HOME}">`));
  res.writeHead(200, { ...SEC, 'content-type': 'text/html; charset=utf-8', 'content-length': body.length, 'cache-control': 'private, no-cache' });
  res.end(body);
}
const BRAND_FILE = /^\/files\/brand\/[a-z0-9][a-z0-9-]{1,40}\/mark-[0-9a-f]{12}\.png$/;

const API_PREFIX = /^\/(api|tiles|files)\//;
/* 바깥에 열지 않는 것 — 서버 내부 안내 문서(경로 목록)는 이 PC 안에서만 */
const HIDDEN = /^\/api\/v1\/(docs|redoc)(\/|$)|^\/(docs|redoc|openapi\.json)(\/|$)/;
/* 화면은 경로 목록으로 '있는 기능만 버튼을 켠다'(kit/util.js 등) — 바깥에는 경로·메서드 이름만(설명·형식 없음) */
let OA = null, OA_AT = 0;
function slimOpenapi(res) {
  if (OA && Date.now() - OA_AT < 60000) return send(res, 200, OA, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
  http.get({ ...GW, path: '/api/v1/openapi.json' }, (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => (b += c)); r.on('end', () => {
    try { const j = JSON.parse(b); const paths = {}; for (const [k, v] of Object.entries(j.paths || {})) { paths[k] = {}; for (const m of Object.keys(v)) paths[k][m] = {}; }
      OA = JSON.stringify({ openapi: j.openapi, paths }); OA_AT = Date.now(); send(res, 200, OA, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    } catch { send(res, 502, '{}', { 'content-type': 'application/json' }); } }); }).on('error', () => send(res, 502, '{}', { 'content-type': 'application/json' }));
}
/* 로그인한 사람만 — 필지 조회·지도 원천 중계(서버 열쇠로 부르는 길)를 누구나 쓰지 못하게(원칙 39 · 설계 4차 API 평가에서 발견) */
const NEED_LOGIN = /^\/api\/v1\/(parcels|proxy\/(vworld|pc))(\/|\?|$)/;
const hasLogin = (req) => !!req.headers.authorization || /[?&]access_token=/.test(req.url);
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

function proxy(req, res, body = null) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
  const isLogin = req.method === 'POST' && /^\/api\/v1\/auth\/login\/?$/.test(req.url.split('?')[0]);
  if (isLogin && body === null && !loginAllowed(ip))
    return send(res, 429, JSON.stringify({ error: { code: 'too_many_attempts', message: '로그인 시도가 너무 많습니다. 10분 뒤 다시 해 주세요.' } }), { 'content-type': 'application/json' });
  const org = orgOfReq(req);
  if (isLogin && org && body === null) {                           // 기관 주소에서는 그 기관 계정만 — 본문의 기관을 주소와 맞춰 본다(작은 본문만)
    const parts = []; let n = 0, over = false;
    req.on('data', (c) => { n += c.length; if (n > 16384) { over = true; req.destroy(); } else parts.push(c); });
    req.on('end', () => {
      if (over) return;
      const buf = Buffer.concat(parts); let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch { /* 아래 */ }
      if (!j || (j.tenant_id ?? org) !== org) return send(res, 400, JSON.stringify({ error: { code: 'bad_request', message: '이 주소에서는 이 기관 계정으로만 로그인합니다' } }), { 'content-type': 'application/json' });
      proxy(req, res, buf);
    });
    return;
  }
  const headers = { ...req.headers, 'x-forwarded-for': ip, 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host || '' };
  if (body !== null) { headers['content-length'] = String(body.length); delete headers['transfer-encoding']; }
  delete headers['x-lx-site'];                                   // 입구는 주소로만 — 바깥에서 보낸 값은 버린다
  const site = siteOf(req); if (site) headers['x-lx-site'] = site;
  const up = http.request({ ...GW, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode || 502, { ...r.headers, 'x-content-type-options': 'nosniff' });
    if (/text\/event-stream/.test(r.headers['content-type'] || '')) res.flushHeaders?.();
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) send(res, 502, JSON.stringify({ error: { code: 'gateway_down', message: '서버에 연결할 수 없습니다.' } }), { 'content-type': 'application/json' }); else res.end(); });
  req.on('aborted', () => up.destroy());
  if (body !== null) up.end(body); else req.pipe(up);
}


/* ── 미리 받기(modulepreload) — 바깥 주소는 요청 하나가 먼 길(Cloudflare 무료 요금제는 한국 접속도 해외 지점을 거친다, 09-30 실측 약 0.5–0.7초)을 돈다.
   화면 코드는 파일이 파일을 차례로 불러 그 시간이 층마다 쌓이므로, HTML 을 내줄 때 필요한 모듈·스타일 목록을 머리에 적어 한꺼번에 받게 한다.
   화면 코드는 바꾸지 않는다(관문이 읽기만). 동적 import() 는 미리 받지 않는다. */
const IMP = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const CSSIMP = /@import\s+(?:url\()?\s*['"]?([^'")\s]+)['"]?\s*\)?/g;
const PRE = new Map();
function urlToFile(u) { const f = path.join(ROOT, decodeURIComponent(u)); return f.startsWith(path.join(ROOT, 'landxi') + path.sep) ? f : null; }
function resolveUrl(spec, base, html = false) { if (/^(https?:|data:)?\/\//.test(spec) || /^[a-z]+:/i.test(spec) || (!html && !/^(\.|\/)/.test(spec))) return null; try { return new URL(spec, 'http://x' + base).pathname; } catch { return null; } }
function graph(htmlUrl, html) {
  const mods = new Set(), css = new Set(), qm = [], qc = [];
  for (const m of html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)) { const u = resolveUrl(m[1], htmlUrl, true); if (u) qm.push(u); }
  for (const m of html.matchAll(/<script[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)) for (const x of m[1].matchAll(IMP)) { const u = resolveUrl(x[1] || x[2], htmlUrl); if (u) qm.push(u); }
  for (const m of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)) { const u = resolveUrl(m[1], htmlUrl, true); if (u) qc.push(u); }
  while (qm.length && mods.size < 250) { const u = qm.shift(); if (mods.has(u) || !/\.m?js$/.test(u)) continue; const f = urlToFile(u); if (!f) continue; let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } mods.add(u); for (const x of t.matchAll(IMP)) { const v = resolveUrl(x[1] || x[2], u); if (v && !mods.has(v)) qm.push(v); } }
  while (qc.length && css.size < 60) { const u = qc.shift(); if (css.has(u) || !/\.css$/.test(u)) continue; const f = urlToFile(u); if (!f) continue; let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; } css.add(u); for (const x of t.matchAll(CSSIMP)) { const v = resolveUrl(x[1], u); if (v && !css.has(v)) qc.push(v); } }
  return [...mods].map((u) => `<link rel="modulepreload" href="${u}">`).concat([...css].map((u) => `<link rel="preload" as="style" href="${u}">`)).join('');
}
function htmlWithPreload(p, f) {
  const html = fs.readFileSync(f, 'utf8'); const c = PRE.get(p);
  let links; if (c && c.html === html && Date.now() - c.at < 30000) links = c.links; else { links = graph(p, html); PRE.set(p, { html, links, at: Date.now() }); }
  return links && html.includes('</head>') ? html.replace('</head>', links + '</head>') : html;
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
  /* 화면 코드는 매번 확인(ETag 로 바뀐 것만 받는다). 'private' = Cloudflare 가 가장자리에 보관하거나 브라우저 보관 시간(4시간)으로 덮지 않게
     (2026-09-30 r3-train: 'no-cache' 만 보내면 .js 가 max-age=14400 으로 바뀌어 고친 화면이 바깥 주소에서 4시간 늦게 반영됐다) */
  if (/\.html$/.test(f) && req.method === 'GET') {   // HTML 은 미리 받기 목록을 붙여 내준다(매번 새로)
    let body; try { body = Buffer.from(htmlWithPreload(p, f)); } catch { body = null; }
    if (body) { res.writeHead(200, { ...SEC, 'content-type': type, 'content-length': body.length, 'cache-control': 'private, no-cache' }); return res.end(body); }
  }
  const code = /\.(html|js|mjs|css|json)$/.test(f);
  const cache = code ? 'private, no-cache' : 'public, max-age=86400';
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  if (code && req.headers['if-none-match'] === etag) { res.writeHead(304, { ...SEC, etag, 'cache-control': cache }); return res.end(); }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && st.size) {
    let start = range[1] === '' ? null : Number(range[1]), end = range[2] === '' ? null : Number(range[2]);
    if (start === null) { start = Math.max(0, st.size - (end || 0)); end = st.size - 1; }
    if (end === null || end >= st.size) end = st.size - 1;
    if (!Number.isFinite(start) || start > end) return send(res, 416, '', { 'content-range': `bytes */${st.size}` });
    res.writeHead(206, { ...SEC, 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1, 'cache-control': cache });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...SEC, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size, 'cache-control': cache, ...(code ? { etag } : {}) });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f).pipe(res);
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, '400'); }
  if (p.includes('\0') || p.includes('..')) return send(res, 400, '400');
  if (HIDDEN.test(p)) return send(res, 404, '404');
  if (p === '/api/v1/openapi.json') return slimOpenapi(res);
  if (NEED_LOGIN.test(p) && !hasLogin(req)) return send(res, 401, JSON.stringify({ error: { code: 'unauthorized', message: '로그인이 필요합니다.' } }), { 'content-type': 'application/json' });
  if (p.startsWith('/files/brand/') && !BRAND_FILE.test(p)) return send(res, 404, '404');   // 기관 마크 그림만(허용 목록)
  if (API_PREFIX.test(p)) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '405');
  const site = siteOf(req), org = orgOfReq(req);
  const qStr = () => { const i = req.url.indexOf('?'); return i >= 0 ? req.url.slice(i) : ''; };
  if (org) return loadOrgs().then((ids) => {                                                 // 기관 주소({기관}.land-xi.dev)
    if (ids && !ids.has(org)) return noOrg(res);                                             // 서버 기관 목록에 없는 이름 — 404
    if (p === '/') return serveGovHome(res);                                                 // 그 기관 메인(그 기관 모습의 로그인)
    if (/^\/landxi\/v3\/login(\/(index\.html)?)?$/.test(p) || /^\/landxi(\/v3)?\/?$/.test(p)) return send(res, 302, '', { location: '/' + qStr() });   // Land-XI 로그인 화면 아님 — 그 기관 메인으로(로그인 폴더의 부품 파일은 그대로 내준다)
    if (p === '/favicon.ico') return send(res, 204);
    if (p === '/landxi/proto/env.js') return send(res, 200, envJs(), { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return serveFile(req, res, p);
  });
  if (site === 'gov' && p === '/') return serveGovHome(res);                                  // 기관 입구 첫 주소 = 기관 고르기 목록(Land-XI 로그인 아님)
  if (site === 'gov' || !site) {                                                             // 옛 모양 /{기관}/ — gov 입구는 기관 주소로 넘기고, 이 PC 관문 직접 접속은 그 자리에서
    const o = orgPath(p);
    if (o) return loadOrgs().then((ids) => {
      if (ids && !ids.has(o.id)) return send(res, 302, '', { location: site === 'gov' ? '/' : HOME });   // 없는 기관 — 기관 고르기로
      if (site === 'gov') return send(res, 301, '', { location: orgUrlOf(o.id) + qStr() });
      if (!o.slash) return send(res, 301, '', { location: ORG_PRE + o.id + ORG_POST + qStr() });
      return serveGovHome(res);
    });
  }
  if (p === '/' || p === '/landxi' || p === '/landxi/' || p === '/landxi/v3' || p === '/landxi/v3/') return send(res, 302, '', { location: HOME });   // app · admin 입구 = 로그인(LX 전용 창구)
  if (p === '/favicon.ico') return send(res, 204);
  if (p === '/landxi/proto/env.js') return send(res, 200, envJs(), { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  serveFile(req, res, p);
}).listen(PORT, '127.0.0.1', () => console.log('public gate http://127.0.0.1:' + PORT + HOME + ' · 입구 ' + Object.entries(ENTRY).map(([h, s]) => s + '=' + h).join(' ')));
