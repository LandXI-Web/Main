/* Land-XI 공유 API 클라이언트 v1 — F1-CONTRACT.md 의 프론트 구현 (Fable 5.1 · 2026-09-24 · F1 동안 동결)
   - 두 모드: on(게이트웨이 :8700/:8701) · off(픽스처·리플레이). probe() 가 1,500ms 안에 정한다.
   - 봉투(Envelope) 검사 · Bearer 세션 · SSE(재개·재접속) · 타일 URL 해석 · 리플레이(ndjson).
   - 새 화면(xi · ops · global)만 쓴다. proto 화면은 이 파일을 모른다.
   - 변경 요청은 에픽 결과 문서 '계약 변경 요청' 절로. 여기서 고치지 않는다. */

const LS = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };

export const API = {
  /* 기준 주소 — 이 PC(localhost)면 게이트웨이 :8700, 바깥 주소(app.land-xi.dev)면 같은 출처(관문이 /api 를 넘긴다),
     GitHub Pages 에서 열면 운영 주소로. 개발 중 덮어쓰기는 localStorage lx_api_base. */
  get base() {
    const o = LS('lx_api_base'); if (o) return o;
    if (typeof location === 'undefined' || location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname)) return 'http://localhost:8700';
    if (/\.github\.io$/i.test(location.hostname)) return 'https://app.land-xi.dev';
    return location.origin;
  },
  get prefix() { return this.base + '/api/v1'; },
  mode: 'auto',            // 'auto' | 'on' | 'off'  (probe 뒤 'on'|'off')
  probeMs: 1500,
  dataAlias: '/landxi/data',   // off 모드 junction (F1-CONTRACT §1)
  reason: '',              // off 인 이유 — 마스트 표기용 ('서버 연결 없음' | '저장 결과 재생')
};

export const BASIS_KO = { measured: '실측', estimate: '추정', demo: '시연', history: '이력', inferred: 'AI 추론 · 검수 전', recorded: '기록' };
export const BASIS_EN = { measured: 'measured', estimate: 'estimate', demo: 'demo', history: 'history', inferred: 'AI inferred · unreviewed', recorded: 'recorded' };

/* ── 봉투 ─────────────────────────────────────────────────────────────── */
export class EnvelopeError extends Error {}
export function isEnvelope(e) {
  return !!e && typeof e === 'object' && 'value' in e && typeof e.unit === 'string' && e.basis in BASIS_KO && typeof e.as_of === 'string' && typeof e.source === 'string';
}
export function assertEnvelope(e, where = '') {
  if (!isEnvelope(e)) throw new EnvelopeError(`봉투 없는 숫자 ${where}: ${JSON.stringify(e).slice(0, 120)}`);
  return e;
}
/** 봉투를 만든다(프론트가 스스로 잰 값 — perf · 프레임 시각 등). 서버 값에는 쓰지 않는다. */
export const env = (value, unit, basis, source, note) => ({ value, unit, basis, as_of: new Date().toISOString(), source, ...(note ? { note } : {}) });
/** 숫자 표기: 천 단위 · 소수 자리 · null 은 '—' */
export function fmt(e, digits) {
  const v = isEnvelope(e) ? e.value : e;
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const d = digits ?? (Number.isInteger(v) ? 0 : 1);
  return Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/* ── 세션 ─────────────────────────────────────────────────────────────── */
export const session = {
  key: 'lx_api_session',
  get() { try { const s = JSON.parse(LS(this.key) || 'null'); return s && s.token && new Date(s.expires_at) > new Date() ? s : null; } catch { return null; } },
  set(s) { LS(this.key, JSON.stringify(s)); },
  clear() { try { localStorage.removeItem(this.key); } catch { /* */ } },
  /** off 모드 · 토큰 없음: 기존 E0-1 키로 realm/role 을 흉내 낸다(화면 관문용). */
  shadow() {
    const s = this.get(); if (s) return { realm: s.realm, role: s.role, tenant_id: s.tenant_id, token: s.token };
    let t = null; try { t = JSON.parse(LS('lx_tenant_session') || 'null'); } catch { /* */ }
    if (t && t.tenant) return { realm: 'tenant', role: 'manager', tenant_id: t.tenant, token: null };
    if (LS('lx_logged_in') === '1') return { realm: 'lx', role: LS('lx_role') || 'staff', tenant_id: null, token: null };
    return { realm: null, role: null, tenant_id: null, token: null };
  },
};

/* ── 서버 탐지 ────────────────────────────────────────────────────────── */
let probed = null;
export async function probe(force = false) {
  if (probed && !force) return probed;
  if (LS('lx_api_mode') === 'off') { API.mode = 'off'; API.reason = '서버 연결 없음'; return (probed = { ok: false, mode: 'off' }); }
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), API.probeMs);
  try {
    const r = await fetch(API.prefix + '/health', { signal: ac.signal, cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    API.mode = j && j.ok ? 'on' : 'off'; API.reason = API.mode === 'on' ? '' : '서버 연결 없음';
    return (probed = { ok: API.mode === 'on', mode: API.mode, health: j });
  } catch { API.mode = 'off'; API.reason = '서버 연결 없음'; return (probed = { ok: false, mode: 'off' }); }
  finally { clearTimeout(t); }
}

/* ── 호출 ─────────────────────────────────────────────────────────────── */
export class ApiError extends Error { constructor(code, message, detail, status) { super(message || code); this.code = code; this.detail = detail; this.status = status; } }
export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  if (API.mode === 'off') throw new ApiError('offline', 'off 모드 — 픽스처를 쓰세요');
  const s = session.get();
  const h = { accept: 'application/json', ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (s) h.authorization = 'Bearer ' + s.token;
  const r = await fetch((path.startsWith('/tiles') || path.startsWith('/files') ? API.base : API.prefix) + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return r;
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) { const e = (j && j.error) || {}; throw new ApiError(e.code || 'http_' + r.status, e.message, e.detail, r.status); }
  return j;
}

/* ── SSE(재개 · 재접속 · 하트비트 감시) ──────────────────────────────── */
export const JOB_EVENTS = ['job.queued', 'job.started', 'shard.started', 'shard.done', 'shard.failed', 'job.progress', 'job.done', 'snapshot.ready', 'job.failed', 'job.cancelled', 'index.month'];
export const OPS_EVENTS = ['gpu.sample', 'queue.sample', 'usage.delta', 'deploy.changed', 'alert', 'job.state'];
/**
 * sse('/events/jobs/' + id, { on: (name, data, id) => {}, events: JOB_EVENTS })  → { close() }
 * 헤더를 못 넣으므로 access_token 쿼리(F1-CONTRACT §3). 25s 동안 아무 이벤트(하트비트 포함)도 없으면 재접속.
 */
export function sse(path, opts = {}) {
  return SHARED_SSE.test(path) && !opts.lastEventId && canShare() ? sharedSse(path, opts) : directSse(path, opts);
}

/* 탭끼리 한 스트림(c2-numbers · 2026-09-30) — 게이트웨이는 HTTP/1.1 이라 브라우저는 한 호스트에 연결 6개까지만 연다.
   기관 첫 화면·보고서가 탭마다 /events/tenant 를 상시로 열면 탭 6개에서 이후 모든 요청(로그인 기관 목록·XI맵)이 멈췄다.
   상시 방송 스트림(/events/tenant · /events/ops)은 같은 출처·같은 세션의 탭 가운데 한 탭(Web Locks 로 뽑힌 대표)만 연결을 열고,
   받은 사건을 BroadcastChannel 로 다른 탭에 나눈다. 대표 탭이 닫히면 기다리던 탭이 이어받는다(마지막 사건 id 부터).
   작업·물어보기 스트림(/events/jobs/… · 에이전트 실행)은 짧게 끝나므로 지금처럼 탭마다 연다. */
/* 스트림은 스트림 전용 호스트 이름으로 — 브라우저 연결 한도(호스트당 6)는 호스트 이름별이다.
   (09-30 실증 2차) 반대쪽 이름(localhost ↔ 127.0.0.1)으로 뒤집는 방식은, 기준 주소가 127.0.0.1 인 화면(LX 관리자 화면 등)의 스트림이
   localhost 로 열려 기본 화면의 API 호스트(localhost)를 차지했다 — 게이트웨이 재기동 뒤 탭 15개의 스트림이 한꺼번에 다시 붙자
   새 탭의 로그인·조회·영상 타일이 모두 멈췄다. 그래서 로컬 게이트웨이면 스트림은 API 가 절대 쓰지 않는 이름
   s1–s4.localhost(루프백 · 브라우저가 스스로 127.0.0.1 로 푼다 · RFC 6761)로만 연다. 네 이름에 나눠 24칸. 운영 주소는 그대로.
   streamBase() 는 에이전트 스트림(agent/api-agent.js)도 같이 쓴다. */
const LOOPBACK_HOST = /^(?:localhost\.?|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.localhost\.?)$/i;
const STREAM_HOSTS = ['s1.localhost', 's2.localhost', 's3.localhost', 's4.localhost'];
let streamN = Math.floor(Math.random() * STREAM_HOSTS.length);
export function streamBase() {
  try {
    const u = new URL(API.base);
    if (!LOOPBACK_HOST.test(u.hostname) || STREAM_HOSTS.includes(u.hostname.toLowerCase())) return API.prefix;
    if (typeof location !== 'undefined' && u.origin === location.origin) return API.prefix;   // 같은 출처 프록시(옛 LX 관리자 화면 :8702)는 CORS 가 없다 — 이름을 바꾸지 않는다
    u.hostname = STREAM_HOSTS[streamN++ % STREAM_HOSTS.length];
    return u.origin + '/api/v1';
  } catch { return API.prefix; }
}
const sseBase = streamBase;
const SHARED_SSE = /^\/events\/(?:tenant|ops)(?:[/?]|$)/;
const canShare = () => { try { return typeof BroadcastChannel === 'function' && !!(navigator.locks && navigator.locks.request); } catch { return false; } };
function sharedSse(path, { on, events = JOB_EVENTS, onState } = {}) {
  const s = session.get();
  const key = 'lx-sse|' + path + '|' + [...events].sort().join(',') + '|' + (s ? String(s.token).slice(-16) : '-');
  const bc = new BroadcastChannel(key), ac = new AbortController();
  let closed = false, last = null, inner = null, release = null, state = 'connecting';
  const post = (m) => { try { bc.postMessage(m); } catch { /* 채널 닫힘 */ } };
  const setState = (st) => { state = st; onState && onState(st); };
  bc.onmessage = (m) => {
    const d = m.data; if (!d || closed) return;
    if (d.t === 'ev') { last = d.id || last; on && on(d.name, d.data, last); }
    else if (d.t === 'st') { if (!inner) setState(d.state); }
    else if (d.t === 'hello' && inner) post({ t: 'st', state });
  };
  setState('connecting');
  navigator.locks.request(key, { signal: ac.signal }, () => new Promise((res) => {
    if (closed) { res(); return; }
    release = res;
    inner = directSse(path, {
      events, lastEventId: last,
      on: (name, data, id) => { last = id || last; on && on(name, data, id); post({ t: 'ev', name, data, id }); },
      onState: (st) => { if (st === 'closed') return; setState(st); post({ t: 'st', state: st }); },
    });
  })).catch(() => { /* 닫힘으로 기다림 취소 */ });
  post({ t: 'hello' });
  return {
    close() {
      if (closed) return; closed = true;
      ac.abort(); inner && inner.close(); release && release(); bc.close();
      onState && onState('closed');
    },
    get lastEventId() { return last; },
    get leader() { return !!inner; },
  };
}

function directSse(path, { on, events = JOB_EVENTS, lastEventId = null, onState } = {}) {
  let es = null, closed = false, last = lastEventId, timer = null, backoff = 1000;
  const url = () => { const u = new URL(sseBase() + path); const s = session.get(); if (s) u.searchParams.set('access_token', s.token); if (last) u.searchParams.set('last_event_id', last); return u.toString(); };
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (!closed) { es && es.close(); open(); } }, 25000); };
  const open = () => {
    if (closed) return; es = new EventSource(url()); onState && onState('connecting');
    es.onopen = () => { backoff = 1000; onState && onState('open'); arm(); };
    for (const name of events) es.addEventListener(name, (ev) => { arm(); last = ev.lastEventId || last; let d = null; try { d = JSON.parse(ev.data); } catch { /* */ } on && on(name, d, last); });
    es.onerror = () => { onState && onState('error'); es.close(); if (!closed) setTimeout(open, backoff = Math.min(backoff * 2, 15000)); };
  };
  open();
  return { close() { closed = true; clearTimeout(timer); es && es.close(); onState && onState('closed'); }, get lastEventId() { return last; } };
}

/* ── 타일 URL 해석(F1-CONTRACT §8) ────────────────────────────────────── */
const signed = new Map();   // set → { url, expires_at }
export async function signSet(set) {
  const c = signed.get(set);
  if (c && new Date(c.expires_at) - Date.now() > 30 * 60 * 1000) return c.url;
  const j = await api('/tiles/sign?set=' + encodeURIComponent(set)); signed.set(set, j); return j.url;
}
/** LayerItem → MapLibre 소스 url/tiles. 외부 템플릿의 {date}{year}{searchid}{item} 은 params 로 치환. */
export async function tileUrl(item, params = {}) {
  if (item.source === 'external') {
    const p = { date: yesterdayUTC(), ...(item.params || {}), ...params };
    const t = String(item.tiles).replace(/\{(date|year|searchid|item)\}/g, (_, k) => p[k] ?? `{${k}}`);
    return item.kind === 'vector' && t.startsWith('pmtiles://') ? { url: t } : { tiles: [t] };
  }
  if (API.mode === 'on') {
    if (item.source === 'xyz') return { tiles: [`${API.base}/tiles/xyz/${item.set.split('/').pop()}/{z}/{x}/{y}.webp`] };
    // 등록 원본 영상(COG 동적 타일 · LX 전용) — PMTiles 가 아직 없으므로 서버가 준 타일 주소를 그대로 쓴다
    if (item.source === 'cog') return { tiles: [await signSet(item.set)] };
    const u = item.signed ? await signSet(item.set) : `${API.base}/tiles/pmtiles/${item.set}.pmtiles`;
    return { url: 'pmtiles://' + u };
  }
  // off: junction 별칭
  if (item.source === 'xyz') return { tiles: [`${API.dataAlias}/${item.path.replace(/\{z\}.*$/, '')}{z}/{x}/{y}.webp`] };
  return { url: 'pmtiles://' + location.origin + API.dataAlias + '/' + item.path };
}
export function yesterdayUTC() { const d = new Date(Date.now() - 86400000); return d.toISOString().slice(0, 10); }

/* ── 픽스처 · 리플레이(off 모드) ──────────────────────────────────────── */
/** JSON 픽스처를 읽는다(에픽 자기 data/fixtures/). 실패하면 null(화면은 결손 표시 · 콘솔 오류 0). */
export async function fixture(url) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
/**
 * ndjson 리플레이: 한 줄 = { t: ms, event, data }. t 순서로 발행. speed 배속. 모든 data 에 basis:'demo' 꼬리표를 덧댄다.
 * 반환 { close(), done: Promise }
 */
export function replay(url, { on, speed = 1, onState } = {}) {
  let closed = false; const timers = [];
  const done = (async () => {
    API.reason = API.reason || '저장 결과 재생';
    let text = ''; try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw 0; text = await r.text(); } catch { onState && onState('missing'); return; }
    const lines = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    onState && onState('playing');
    await new Promise((res) => {
      let n = 0;
      for (const ln of lines) timers.push(setTimeout(() => { if (closed) return; on && on(ln.event, { ...ln.data, basis: 'demo', replay: true }, String(ln.t)); if (++n === lines.length) res(); }, ln.t / speed));
      if (!lines.length) res();
    });
    onState && onState('ended');
  })();
  return { close() { closed = true; timers.forEach(clearTimeout); }, done };
}

/* ── 편의 ─────────────────────────────────────────────────────────────── */
export const catalog = (q = {}) => api('/catalog/layers?' + new URLSearchParams(q));
export const quote = (body) => api('/jobs/quote', { method: 'POST', body });
export const submit = (body) => api('/jobs', { method: 'POST', body });
export const job = (id) => api('/jobs/' + id);
export const deploys = (q = {}) => api('/deploys?' + new URLSearchParams(q));
export const port = (body) => api('/deploys', { method: 'POST', body });
export const deployAction = (id, action, body = {}) => api(`/deploys/${id}/${action}`, { method: 'POST', body });
export const usage = (tenant) => api(`/t/${tenant}/usage`);
export const ops = (what) => api('/ops/' + what);
export const parcelAt = (lng, lat) => api(`/parcels?lng=${lng}&lat=${lat}`);
export function mastLabel(locale = 'ko') {
  if (API.mode === 'on') return '';
  return locale === 'en' ? (API.reason === '저장 결과 재생' ? 'Demo · replaying stored results' : 'Demo · no server') : `시연 · ${API.reason || '서버 연결 없음'}`;
}
