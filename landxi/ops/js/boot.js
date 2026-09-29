/* LX/OPS 부트 — 포트 관문 · 데이터 원천(게이트웨이 / 로컬 브리지 / 픽스처) · 관리자 세션 · 공용 표기
 * 원천 판정(콘솔 오류 0 — 브라우저가 닫힌 포트를 두드리지 않는다):
 *   localStorage.lx_api_mode === 'off'            → off (픽스처 · 리플레이 · 쓰기 disabled)
 *   /landxi/ops/bridge/health .gateway.full        → gateway (F1-B :8700 · 계약 정본 · **기본** — v1.1 결정 · F2-C)
 *   /landxi/ops/bridge/health .ok                  → bridge (게이트웨이가 죽었을 때만 자동 전환 · 마스트 '브리지 · 메모리' · 쓰기 = 브리지 메모리)
 *   localStorage.lx_ops_src === 'bridge'           → bridge 강제(e2e 로컬 워커 프로토콜 · 시연 재현)
 * api-v1.js 는 동결 파일이라 고치지 않는다 — base 는 이 origin 의 localStorage.lx_api_base 로만 바꾼다(:4173 과 분리). */
import { API, session, probe, api, fixture, assertEnvelope, isEnvelope, BASIS_KO, fmt, mastLabel, ApiError } from '../../shared/api-v1.js';

export { API, api, fmt, isEnvelope, BASIS_KO, ApiError };
export const OPS_PORT = '8702';
/* 안전망(F2-C 2차 판정): 네이티브 append/prepend/replaceChildren 은 null·undefined 를 "null" 글자로 만든다.
 * 관제 5화면이 모두 이 모듈을 먼저 부르므로 여기서 한 번 걸러 준다(false 도 무시 — h() 와 같은 규칙). 호출부도 filter(Boolean) 로 고쳤다. */
for (const P of [Element.prototype, DocumentFragment.prototype]) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = P[m]; if (orig.__lxSafe) continue;
    const safe = function (...kids) { return orig.apply(this, kids.filter((k) => k != null && k !== false)); };
    safe.__lxSafe = true; P[m] = safe;
  }
}
const FX = '/landxi/ops/data/fixtures/';
export const SRC = { kind: 'off', label: '', writable: false, why: '', base: '', health: null };
let I18N = null;

/* ── 포트 관문 ──────────────────────────────────────────────────── */
export function portGate() {
  if (location.port === OPS_PORT) return true;
  document.documentElement.dataset.lx = 'ready';
  document.documentElement.dataset.gate = 'port';
  document.title = 'LX/OPS — :8702 전용';
  document.body.setAttribute('data-stage', 'ops');
  document.body.innerHTML = `<main class="og-gate" role="main"><span class="og-lbl">LX/OPS · 관제실</span><h1>LX/OPS 관제실은 :8702 에서만 열립니다</h1>
    <p>관제 세션은 별도 origin(<b>http://localhost:8702</b>)에만 있다. 이 origin(${location.host})의 LX 직원 세션으로는 들어갈 수 없다. 관리자는 관제 전용 주소로 접속한다.</p>
    <a href="http://localhost:8702/landxi/ops/login.html">http://localhost:8702/landxi/ops/login.html</a></main>`;
  return false;
}

/* ── i18n ───────────────────────────────────────────────────────── */
export async function i18n() { return I18N || (I18N = (await fixture('/landxi/ops/data/i18n-ko.json')) || {}); }
export const t = (path, fb = '') => path.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), I18N) ?? fb;

/* ── 원천 판정 ──────────────────────────────────────────────────── */
export async function detect() {
  await i18n();
  let off = false; try { off = localStorage.getItem('lx_api_mode') === 'off'; } catch { /* */ }
  let h = null;
  if (!off) { try { const r = await fetch('/landxi/ops/bridge/health', { cache: 'no-store' }); h = r.ok ? await r.json() : null; } catch { h = null; } }
  SRC.health = h;
  // v1.1 결정(F1-C must_fix 6): 게이트웨이 직결이 기본 — 관제 경로 전부 200 이면 gateway. 브리지는 게이트웨이가 죽었을 때만(또는 lx_ops_src=bridge 강제).
  let want = null; try { want = localStorage.getItem('lx_ops_src'); } catch { /* */ }
  if (!off && h && h.gateway && h.gateway.full && want !== 'bridge') { SRC.kind = 'gateway'; SRC.base = h.gateway.base; }
  else if (!off && h && h.ok) { SRC.kind = 'bridge'; SRC.base = location.origin + '/landxi/ops/bridge'; }
  else { SRC.kind = 'off'; SRC.base = ''; }
  SRC.gw = h?.gateway || null;
  if (SRC.kind === 'off') { API.mode = 'off'; API.reason = API.reason || '서버 연결 없음'; }
  else {
    try {
      if (localStorage.getItem('lx_ops_base') !== SRC.base) { session.clear(); localStorage.setItem('lx_ops_base', SRC.base); }  // 토큰은 발급한 서버에서만 유효
      localStorage.setItem('lx_api_base', SRC.base);
    } catch { /* */ }
    await probe(true);
  }
  if (API.mode !== 'on' && SRC.kind !== 'off') SRC.kind = 'off';
  SRC.writable = SRC.kind !== 'off';
  SRC.why = SRC.writable ? '' : t('why_off', '준비 중 · 서버 없음');
  SRC.label = SRC.kind === 'gateway' ? t('src.gateway').replace(':8700', ':' + (new URL(SRC.base, location.href).port || '80'))
    : SRC.kind === 'bridge' ? (want === 'bridge' && SRC.gw?.up ? '실측 · 브리지 · 메모리(강제) · 게이트웨이 중계' : SRC.gw?.up ? '실측 · 브리지 · 메모리 · 게이트웨이 경로 일부 없음' : t('src.bridge'))
    : mastLabel('ko');
  SRC.recovered = h?.gateway?.recovered_at_boot || null;
  document.documentElement.dataset.src = SRC.kind;
  return SRC;
}

/* ── 관리자 세션 ────────────────────────────────────────────────── */
export function who() {
  if (SRC.kind === 'off') { const s = session.shadow(); return s.realm === 'lx' ? { realm: 'lx', role: s.role, user: { id: 'u_lx_' + s.role, name: s.role === 'admin' ? 'LX 관리자' : 'LX 직원' }, token: null } : null; }
  const s = session.get(); return s ? { ...s } : null;
}
/** 관제 화면 공통 관문: :8702 + admin. 아니면 login.html 로(권한 없음은 문구). */
export async function gate() {
  if (!portGate()) return null;
  await detect();
  const w = who();
  if (!w) { location.replace('/landxi/ops/login.html'); return null; }
  if (!(w.realm === 'lx' && w.role === 'admin')) { location.replace('/landxi/ops/login.html?denied=' + encodeURIComponent(w.role || '')); return null; }
  if (SRC.kind !== 'off') {
    // 3차: 게이트웨이 재기동(다른 에픽 · 수 초) 중 /me 네트워크 오류로 세션을 지워 관리자가 로그인 화면으로 튕겼다(녹화 05:12:4x).
    // 세션은 401/403(인증 실패)일 때만 지운다 — 네트워크 · 5xx 는 0.8 s 간격 6회 다시 묻고, 그래도 안 되면 원천을 다시 판정(브리지 폴백)한다.
    let me = null, bad = null;
    for (let k = 0; k < 6 && !me && !bad; k++) {
      try { me = await api('/me'); }
      catch (e) { if (e?.status === 401 || e?.status === 403 || ['unauthorized', 'forbidden', 'session_expired'].includes(e?.code)) bad = e; else await new Promise((r) => setTimeout(r, 800)); }
    }
    if (!me && !bad) { await detect(); if (SRC.kind !== 'off') { try { me = await api('/me'); } catch (e) { bad = e; } } else return who(); }
    if (bad || !(me && me.realm === 'lx' && me.role === 'admin')) { session.clear(); location.replace('/landxi/ops/login.html'); return null; }
  }
  return w;
}
export async function login(loginId, password) {
  if (SRC.kind === 'off') {
    const m = /^lx-(admin|staff|sales)$/.exec(loginId || '');
    if (!m) throw new ApiError('unauthorized', '계정을 확인하세요(시연: lx-admin)');
    if (m[1] !== 'admin') return { role: m[1], denied: true };
    try { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); localStorage.removeItem('lx_tenant_session'); } catch { /* */ }
    return { role: 'admin', realm: 'lx', offline: true };
  }
  const s = await api('/auth/login', { method: 'POST', body: { realm: 'lx', login: loginId, password } });
  if (!(s.realm === 'lx' && s.role === 'admin')) { try { await fetch(API.prefix + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }); } catch { /* */ } return { role: s.role, denied: true }; }
  session.set({ token: s.token, realm: s.realm, role: s.role, tenant_id: s.tenant_id, expires_at: s.expires_at, user: s.user });
  return s;
}
export async function logout() {
  if (SRC.kind !== 'off') { try { await api('/auth/logout', { method: 'POST' }); } catch { /* */ } }
  session.clear(); try { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); } catch { /* */ }
  location.replace('/landxi/ops/login.html');
}

/* ── 데이터(계약 경로 ↔ 픽스처) ─────────────────────────────────── */
const MAP = {
  nodes: ['/ops/nodes', 'ops-nodes.json'], gpus: ['/ops/gpus', 'ops-gpus.json'], queues: ['/ops/queues', 'ops-queues.json'],
  storage: ['/ops/storage', 'ops-storage.json'], alerts: ['/ops/alerts', 'ops-alerts.json'], models: ['/ops/models', 'ops-models.json'],
  opsTenants: ['/ops/tenants', 'ops-tenants.json'], bench: ['/ops/bench', 'bench.json'], deploys: ['/deploys', 'deploys.json'],
  tenants: ['/tenants', 'tenants.json'], registryModels: ['/registry/models', 'registry-models.json'], registryCards: ['/registry/cards', 'registry-cards.json'],
  approvals: ['/approvals', 'approvals.json'], jobs: ['/jobs?limit=50', null], audit: ['/ops/audit', null],
};
const BRIDGE_ONLY = new Set(['approvals', 'audit']);   // 계약 밖(결과 문서 '계약 변경 요청' §4.10) — 게이트웨이에는 부르지 않는다(404 콘솔 0)
/** 게이트웨이 직결 모드: 계약 밖 읽기(approvals · audit)는 :8702 가 정본 DB 를 읽기만 해서 준다(server/ops/audit_read.py). */
export async function gwRead(kind, q = {}) {
  const tok = session.get()?.token; const u = new URL('/landxi/ops/bridge/gw/' + kind, location.origin);
  for (const [k, v] of Object.entries(q)) if (v != null) u.searchParams.set(k, v);
  try { const r = await fetch(u, { headers: { authorization: 'Bearer ' + tok }, cache: 'no-store' }); return r.ok ? await r.json() : { items: [], _fallback: 'http_' + r.status }; }
  catch { return { items: [], _fallback: 'network' }; }
}
/** 배포본 감사 이력 — 게이트웨이: 정본 DB · 브리지: 브리지 메모리 · off: 없음 */
export async function auditOf(subject) {
  if (SRC.kind === 'gateway') return gwRead('audit', { subject, limit: 50 });
  if (SRC.kind === 'bridge') { try { return await api('/ops/audit?subject=' + encodeURIComponent(subject)); } catch { return { items: [] }; } }
  return null;
}
export async function get(name) {
  const [path, fx] = MAP[name];
  if (SRC.kind === 'gateway' && BRIDGE_ONLY.has(name)) { const j = await gwRead(name, { limit: 100 }); if (j && !j._fallback) return j; const f = fx ? await fixture(FX + fx) : { items: [] }; if (f) f._fallback = 'not_in_contract'; return f; }
  if (SRC.kind !== 'off') {
    try { return await api(path); }
    catch (e) {
      // 게이트웨이에 아직 없는 비계약 경로(approvals · audit) 등 → 픽스처로 정직하게 폴백
      if (fx) { const j = await fixture(FX + fx); if (j) { j._fallback = e.code || 'error'; return j; } }
      return name === 'gpus' || name === 'storage' ? null : { items: [], _fallback: e.code || 'error' };
    }
  }
  return fx ? await fixture(FX + fx) : { items: [] };
}
export async function lineage(deploy) {
  if (SRC.kind !== 'off') { try { return await api('/registry/lineage/' + deploy.id); } catch { /* 폴백 */ } }
  const j = await fixture(FX + 'lineage.json');
  return (j && j[`${deploy.id}@${deploy.card_version_id}`]) || { chain: [{ kind: 'card_version', id: deploy.card_version_id }, { kind: 'deploy', id: deploy.id }, { kind: 'tenant', id: deploy.tenant_id }, { kind: 'job', id: null, label: '결과 없음' }] };
}
export async function regionAoi(id) {
  if (SRC.kind === 'bridge') { try { return await api('/regions/' + id); } catch { /* 게이트웨이에 없는 경로 */ } }
  const [x0, y0, x1, y1] = [74.125, 42.43, 74.559, 43.241];
  return { id, name: { ko: '키르기스스탄 소쿨룩' }, aoi: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] }, boundary: '경계 미확보', source: 'recon-0924 Sokuluk bbox' };
}
/** 쓰기: off 면 던진다(화면은 버튼을 disabled + 이유로 둔다). */
export async function write(path, method = 'POST', body = {}) {
  if (!SRC.writable) throw new ApiError('offline', SRC.why);
  return api(path, { method, body });
}
/** 쓰기 버튼 공통: off 면 disabled + title/aria-describedby 이유 */
export function guardWrite(btn) {
  if (SRC.writable) return btn;
  btn.disabled = true; btn.title = SRC.why; btn.setAttribute('aria-disabled', 'true'); btn.dataset.why = SRC.why;
  return btn;
}

/* ── 표기 ───────────────────────────────────────────────────────── */
export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hhmmss = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }); };
export const ymd = (iso) => (iso ? String(iso).slice(0, 10) : '—');
export const basisKo = (b) => BASIS_KO[b] || b;
/** 봉투 → 프로비넌스 칩(봉투 없으면 throw — 법전 §5) */
export function prov(env, { short = false } = {}) {
  assertEnvelope(env, 'prov');
  const el = h('span', { class: 'cw-prov', 'data-basis': env.basis, title: `${basisKo(env.basis)} · ${env.source} · ${env.as_of}${env.note ? ' · ' + env.note : ''}` });
  el.append(h('b', {}, basisKo(env.basis)), ' · ', short ? String(env.source).split(/[ ·(]/)[0] : env.source, ' · ', /T/.test(env.as_of) ? hhmmss(env.as_of) : env.as_of);
  return el;
}
export const tag = (basis, text) => h('span', { class: 'og-tag', 'data-basis': basis }, text || basisKo(basis));
export const goal = (text = '[목표]') => h('span', { class: 'og-tag', 'data-goal': '' }, text);
/** 숫자 현상: 값이 바뀐 글자만 40ms(.cw-digit). 같으면 아무것도 하지 않는다 → false */
export function setText(el, text) {
  text = String(text);
  if (!el || el.dataset.v === text) return false;
  const prev = el.dataset.v; el.dataset.v = text;
  if (prev == null) { el.textContent = text; return true; }
  const a = [...text], b = [...prev], off = a.length - b.length; const frag = document.createDocumentFragment();
  let run = '';
  a.forEach((ch, i) => { if (b[i - off] === ch || /\s/.test(ch)) { run += ch; } else { if (run) { frag.append(run); run = ''; } const s = document.createElement('span'); s.className = 'cw-digit'; s.textContent = ch; frag.append(s); } });
  if (run) frag.append(run);
  el.textContent = ''; el.append(frag); return true;
}
export function toast(msg, kind = 'ok', ms = 3800) {
  const el = h('div', { class: 'og-toast', 'data-kind': kind, role: 'status', html: msg }); document.body.append(el);
  setTimeout(() => el.remove(), ms); return el;
}
/** 확인 다이얼로그(사유 필수 옵션) → 사유 문자열 | null */
export function confirmBox({ title, text, reason = true, ok = '확인', danger = false, placeholder = '사유(감사 기록에 남는다)' }) {
  return new Promise((res) => {
    const input = reason ? h('input', { class: 'og-input', style: { width: '100%' }, placeholder, 'aria-label': '사유' }) : null;
    const okBtn = h('button', { class: 'og-btn ' + (danger ? 'is-caution' : 'is-primary'), type: 'button' }, ok);
    const back = h('div', { class: 'og-modal-back', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'og-modal' }, h('h3', {}, title), h('p', { html: text }), input, h('div', { class: 'og-row' }, h('button', { class: 'og-btn', type: 'button', onclick: () => done(null) }, '취소'), okBtn)));
    const done = (v) => { back.remove(); document.removeEventListener('keydown', key); res(v); };
    const key = (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && (!reason || input.value.trim())) done(reason ? input.value.trim() : true); };
    okBtn.addEventListener('click', () => { if (reason && !input.value.trim()) { input.focus(); input.setAttribute('aria-invalid', 'true'); return; } done(reason ? input.value.trim() : true); });
    document.addEventListener('keydown', key); document.body.append(back); (input || okBtn).focus();
  });
}
export function errText(e) { return e && e.code ? `${e.code}${e.message && e.message !== e.code ? ' · ' + e.message : ''}` : String(e); }
export function ready() { unveil(); requestAnimationFrame(() => { document.documentElement.dataset.lx = 'ready'; }); }

/* ── 첫 페인트 골격 · 직전 화면 스냅샷(F2-C 3차 판정: 화면 이동마다 오른쪽 판이 순수 검정 25프레임) ─────────────
 * 각 화면 HTML 이 정적 골격(#ogSkel · 레일 · 마스트 · 판 머리)을 첫 페인트에 세우고, 직전 방문 스냅샷이 있으면 그것으로 덮는다(인라인 스크립트).
 * 모듈이 실데이터로 셸을 세우는 동안 골격은 위에 덮여 있고(rail.js mountFrame 이 밑에 셸을 넣는다), unveil() 이 걷는다 — 빈 판 · '—' 골격 노출 0.
 * 떠날 때(pagehide) 지금 셸을 스냅샷으로 남긴다: 캔버스 · 토스트 · 리더선 빼고 · id 와 data-k 는 바꿔 적어(e2e 선택자 · 중복 id 0) · 60만 자 넘으면 안 남긴다. */
export function unveil() {
  const sk = document.getElementById('ogSkel'); if (!sk) return false;
  sk.remove(); document.body.classList.remove('has-skel');
  document.documentElement.dataset.unveil = String(Math.round(performance.now()));
  return true;
}
const SNAP_MAX = 600000;
function saveSnap() {
  try {
    const pg = document.body.dataset.page; const sh = document.querySelector('.og-shell:not(.og-skel)');
    if (!pg || !sh || document.documentElement.dataset.lx !== 'ready') return;
    const c = sh.cloneNode(true);
    c.querySelectorAll('canvas, .og-toast, .leader, .og-modal-back, .maplibregl-control-container, script').forEach((e) => e.remove());
    c.querySelectorAll('[id]').forEach((e) => { e.removeAttribute('id'); });
    c.querySelectorAll('[data-k]').forEach((e) => { e.setAttribute('data-sk', e.getAttribute('data-k')); e.removeAttribute('data-k'); });
    c.querySelectorAll('.is-new, .is-tick').forEach((e) => e.classList.remove('is-new', 'is-tick'));
    const html = c.innerHTML; if (html.length > SNAP_MAX) return;
    localStorage.setItem('lxops:snap:' + pg, JSON.stringify({ t: Date.now(), w: innerWidth, st: sh.querySelector('.og-main')?.scrollTop || 0, at: hhmmss(new Date().toISOString()), h: html }));
  } catch { /* 저장소 가득 · 사생활 모드 — 스냅샷 없이 정적 골격만 */ }
}
addEventListener('pagehide', saveSnap);
export const STAGE_ORDER = ['draft', 'shadow', 'canary', 'ga'];
