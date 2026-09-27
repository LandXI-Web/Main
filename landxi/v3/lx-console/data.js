/* data.js — 콘솔이 읽는 실데이터 한 곳(게이트웨이 :8700). 숫자는 전부 서버 응답에서만 나온다.
   출처: /catalog/layers · /registry/models · /registry/cards · /deploys · /survey/rules · /survey/findings · /feedback · /jobs · /tenants */
import { api, fmt, isEnvelope } from '../../shared/api-v1.js';

export const D = { log: [] };

/** 기록되는 호출(개발자 서랍용) */
export async function call(path, opt) {
  const t0 = performance.now();
  try { const j = await api(path, opt); D.log.push({ path, ms: Math.round(performance.now() - t0), ok: true, method: opt?.method || 'GET' }); return j; }
  catch (e) { D.log.push({ path, ms: Math.round(performance.now() - t0), ok: false, code: e.code, method: opt?.method || 'GET' }); throw e; }
  finally { if (D.log.length > 60) D.log.shift(); D.onlog?.(); }
}

const ok = (r) => (r.status === 'fulfilled' ? r.value : null);
/** 시험 배포본(e2e 산출 · id 끝이 -test / -test-n)은 화면에서 뺀다 — 개발자 서랍에는 수를 남긴다 */
export const isTest = (id) => /-test(-\d+)?$/.test(id);

export async function load() {
  const r = await Promise.allSettled([
    call('/catalog/layers'), call('/registry/models'), call('/registry/cards'), call('/deploys'), call('/survey/rules'),
    call('/feedback'), call('/jobs?limit=200'), call('/tenants'), call('/survey/findings?priority=A&state=open&limit=1'),
  ]);
  const [cat, models, cards, deploys, rules, fb, jobs, tenants, fA] = r.map(ok);
  D.catalog = cat?.items || [];
  D.models = models?.items || [];
  D.cards = cards?.items || [];
  const all = deploys?.items || [];
  D.deploys = all.filter((d) => !isTest(d.id));
  D.testDeploys = all.length - D.deploys.length;
  D.rules = rules?.items || [];
  D.feedback = fb?.items || [];
  D.jobs = jobs?.items || [];
  D.tenants = tenants?.items || [];
  D.reviewA = fA?.total || null;
  D.asOf = deploys?.as_of || cat?.as_of || new Date().toISOString();
  D.failed = r.filter((x) => x.status === 'rejected').length;
  return D;
}

/* ── 이름 ─────────────────────────────────────────── */
export const tenantName = (id) => D.tenants.find((t) => t.id === id)?.name?.ko || id;
export const shortRegion = (d) => {
  const ko = d?.region_name?.ko || tenantName(d?.tenant_id);
  const p = String(ko).split(' ');
  return p.length > 1 ? p[p.length - 1] : ko;
};
export const card = (id) => D.cards.find((c) => c.id === id);
export const cardShort = (id) => (card(id)?.name || id).replace(/\s*\(해외\)/, '').replace(/\s*(행정서비스|실태조사 서비스|관리 서비스|탐지 서비스|서비스)$/, '');
export const item = (id) => D.catalog.find((i) => i.id === id);
export const itemBySet = (set) => D.catalog.find((i) => i.set === set);
export const gsdText = (m) => (m == null ? '' : m >= 1 ? `${+m.toFixed(1)}m` : `${+(m * 100).toFixed(m < .1 ? 1 : 0)}cm`);
export const STAGE_KO = { ga: '운영', canary: '시범', shadow: '그림자', draft: '이식 요청' };
export const STAGE_RANK = { ga: 0, canary: 1, shadow: 2, draft: 3 };

/* ── 신뢰 기호: ✓ 확인됨 · ~ 추정치 · 예시 (법전 v2.1-2) ──────────── */
const BASIS = { measured: ['✓', '확인됨'], recorded: ['✓', '기록'], history: ['✓', '이력'], estimate: ['~', '추정치'], inferred: ['~', 'AI 판독 · 검수 전'], demo: ['예시', '예시'] };
export function mk(env) {
  if (!isEnvelope(env)) return '';
  const [s, l] = BASIS[env.basis] || ['', ''];
  const d = String(env.as_of).slice(0, 10);
  return `<span class="mk${env.basis === 'inferred' ? ' mk--ai' : ''}" title="${l} · 기준 ${d}">${s}</span>`;
}
export const n = (v, dg) => fmt(v, dg);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── 배포본 기하 ─────────────────────────────────── */
export function aoiBox(d) {
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(walk); };
  if (d?.aoi?.coordinates) walk(d.aoi.coordinates);
  return a[0] <= a[2] ? a : null;
}
export const intersects = (a, b) => a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** 기관 신고(오탐) — 결과 층별 열린 신고. 재학습 기준 = 한 결과 층에 신고 5건 이상(assets/data/ops.js reported ≥ 5 규칙과 같음) */
export const REPORT_MIN = 5;
export function reportsBySet() {
  const m = new Map();
  for (const f of D.feedback) if (f.state === 'open') { const k = f.set_id || '—'; m.set(k, [...(m.get(k) || []), f]); }
  return [...m.entries()].map(([set, list]) => ({ set, list, name: itemBySet(set)?.name?.ko || set.split('/').pop() })).sort((a, b) => b.list.length - a.list.length);
}
export const retrainDue = () => reportsBySet().filter((g) => g.list.length >= REPORT_MIN);
export const openReports = () => D.feedback.filter((f) => f.state === 'open');
export const portRequests = () => D.deploys.filter((d) => d.stage === 'draft').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

/** 모델 첫 지표(봉투) */
export function metricOf(m) {
  const e = Object.entries(m.metrics || {}).find(([, v]) => isEnvelope(v) && v.value != null);
  return e ? { key: e[0], env: e[1] } : null;
}
