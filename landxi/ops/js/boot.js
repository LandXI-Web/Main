/* LX/OPS 부트 — 포트 관문 · 데이터 원천(게이트웨이 / 로컬 브리지 / 픽스처) · 관리자 세션 · 공용 표기
 * 원천 판정(콘솔 오류 0 — 브라우저가 닫힌 포트를 두드리지 않는다):
 *   localStorage.lx_api_mode === 'off'            → off (픽스처 · 리플레이 · 쓰기 disabled)
 *   /landxi/ops/bridge/health .gateway.up          → gateway (F1-B :8700 · 계약 정본)
 *   /landxi/ops/bridge/health .ok                  → bridge (serve-ops 로컬 브리지 · 폴러 실측 · 쓰기 = 브리지 메모리)
 * api-v1.js 는 동결 파일이라 고치지 않는다 — base 는 이 origin 의 localStorage.lx_api_base 로만 바꾼다(:4173 과 분리). */
import { API, session, probe, api, fixture, assertEnvelope, isEnvelope, BASIS_KO, fmt, mastLabel, ApiError } from '/landxi/shared/api-v1.js';

export { API, api, fmt, isEnvelope, BASIS_KO, ApiError };
export const OPS_PORT = '8702';
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
  // 게이트웨이 직결은 명시 선택(lx_ops_src=gateway) + 관제 경로 전부 200 일 때만 — 기본은 브리지(게이트웨이 읽기 중계 · 쓰기 격리)
  let want = null; try { want = localStorage.getItem('lx_ops_src'); } catch { /* */ }
  if (!off && h && h.gateway && h.gateway.full && want === 'gateway') { SRC.kind = 'gateway'; SRC.base = h.gateway.base; }
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
    : SRC.kind === 'bridge' ? (SRC.gw?.up ? '실측 · 로컬 브리지 · 게이트웨이 중계' : t('src.bridge'))
    : mastLabel('ko');
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
    try { const me = await api('/me'); if (!(me.realm === 'lx' && me.role === 'admin')) throw new ApiError('forbidden'); }
    catch { session.clear(); location.replace('/landxi/ops/login.html'); return null; }
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
export async function get(name) {
  const [path, fx] = MAP[name];
  if (SRC.kind === 'gateway' && BRIDGE_ONLY.has(name)) { const j = fx ? await fixture(FX + fx) : { items: [] }; if (j) j._fallback = 'not_in_contract'; return j; }
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
export function ready() { requestAnimationFrame(() => { document.documentElement.dataset.lx = 'ready'; }); }
export const STAGE_ORDER = ['draft', 'shadow', 'canary', 'ga'];
