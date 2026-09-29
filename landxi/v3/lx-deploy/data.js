/* data.js — lx-deploy 가 읽는 실데이터 한 곳(게이트웨이 :8700). 숫자는 전부 서버 응답(봉투)에서 온다.
   출처(명세 §2.7): /deploys(?with=health) · /deploys/{did} · /registry/lineage/{did} · /catalog/layers · /registry/models ·
                   /registry/cards · /survey/findings?deploy_id= · /feedback · /jobs · /tenants
   재학습 · 정밀도 · 오탐 신고 = retrain.js 한 규칙(콘솔 '오늘' · lx-review 와 같은 원천). 서버가 S-7 전이면 심기 본문에 이전 계약 모양을 함께 싣는다. */
import { API, api, isEnvelope, bboxOf } from '../kit/util.js';
import { devlog } from '../kit/dev-drawer.js';
import * as RV from '../lx-review/data.js';
import { REPORT_MIN, SAMPLE_GOAL, dueSets, reportsFor, retrainTargets, precisionFor } from './retrain.js';

export const D = { deploys: [], cards: [], models: [], catalog: [], feedback: [], jobs: [], tenants: [], rules: [], byRule: {}, asOf: null, health: 'none' };
export { REPORT_MIN };
const isTest = (id) => /-test(-\d+)?$/.test(id);
const ok = (r) => (r.status === 'fulfilled' ? r.value : null);

export async function load() {
  const r = await Promise.allSettled([
    api('/deploys?with=health'), api('/registry/cards'), api('/registry/models'), api('/catalog/layers'),
    api('/feedback?since=30d'), api('/jobs?limit=500'), api('/tenants'),
  ]);
  const [dp, cards, models, cat, fb, jobs, ten] = r.map(ok);
  D.deploys = (dp?.items || []).filter((d) => !isTest(d.id));
  D.cards = cards?.items || [];
  D.models = models?.items || [];
  D.catalog = cat?.items || [];
  D.feedback = fb?.items || [];
  D.jobs = jobs?.items || [];
  D.tenants = ten?.items || [];
  D.asOf = dp?.as_of || new Date().toISOString();
  D.health = D.deploys.some((d) => d.health) ? 'server' : 'adapter';
  devlog('health', D.health === 'server' ? '서버 계산(S-7)' : '어댑터 계산(S-7 전)');
  devlog('deploys', `${D.deploys.length} (시험 ${(dp?.items || []).length - D.deploys.length} 제외)`);
  return D;
}

export async function reloadDeploys() {
  const dp = await api('/deploys?with=health');
  D.deploys = (dp.items || []).filter((d) => !isTest(d.id));
  D.asOf = dp.as_of || D.asOf;
  return D.deploys;
}

/* ── 이름(사용자 말) ─────────────────────────── */
export const STAGE_CHIP = { draft: '적용 요청', shadow: '시범', canary: '시범', rolled_back: '시범', ga: '운영' };
export const stageKind = (s) => (s === 'ga' ? 'ga' : s === 'draft' ? 'draft' : 'pilot');
export const tenantName = (id) => D.tenants.find((t) => t.id === id)?.name?.ko || '';
export const regionKey = (d) => d.sgg_cd || d.region_profile || d.tenant_id;   // 시군구에 적용한 배포본은 제 점을 갖는다
export function regionShort(d) {
  const ko = d?.region_name?.ko || tenantName(d?.tenant_id) || '';
  const p = String(ko).trim().split(/\s+/);
  return [...p].reverse().find((w) => /(시|군|구)$/.test(w) && p.length > 1) || p[p.length - 1] || ko;
}
export const cardOf = (id) => D.cards.find((c) => c.id === id);
export const workName = (cardId) => (cardOf(cardId)?.name || '')
  .replace(/\s*\(해외\)/, '')
  .replace(/\s*(행정서비스|서비스)$/, '')
  .trim();
export const deployOf = (id) => D.deploys.find((d) => d.id === id);
export const aoiBox = (d) => bboxOf(d?.aoi);
export const isDomestic = (d) => { const b = aoiBox(d); return !!b && b[0] >= 124 && b[2] <= 132.5 && b[1] >= 32.5 && b[3] <= 39.5; };

/** 지역별 묶음(지도 점) — 지역은 배포 기록에서만 나온다(문자열 고정값 0) */
export function regions() {
  const m = new Map();
  for (const d of D.deploys) {
    const k = regionKey(d), b = aoiBox(d);
    if (!b) continue;
    const r = m.get(k) || { key: k, name: regionShort(d), bbox: b, list: [] };
    r.bbox = [Math.min(r.bbox[0], b[0]), Math.min(r.bbox[1], b[1]), Math.max(r.bbox[2], b[2]), Math.max(r.bbox[3], b[3])];
    r.list.push(d);
    m.set(k, r);
  }
  const rank = { draft: 0, pilot: 1, ga: 2 };
  for (const r of m.values()) {
    r.list.sort((a, b) => rank[stageKind(a.stage)] - rank[stageKind(b.stage)] || workName(a.card_id).localeCompare(workName(b.card_id), 'ko'));
    r.stage = stageKind(r.list[0].stage);
    r.center = [(r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2];
  }
  return [...m.values()];
}

/* ── 영상 · 모델 짝(지역 고정값 없음 · AOI 와 데이터로) ─────────── */
function inRing(p, r) { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) o = !o; } return o; }
function inAoi(g, p) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((pl) => inRing(p, pl[0]) && !pl.slice(1).some((h) => inRing(p, h)));
}
const hit = (a, b) => a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
/** 이 배포본 AOI 에 실제로 겹치는 자체 영상(모서리 4 + 중심 중 하나라도 AOI 안) */
export function imageryIn(d) {
  const box = aoiBox(d);
  return D.catalog.filter((i) => {
    if (i.role !== 'imagery' || i.source !== 'pmtiles' || !i.bounds || i.gsd_m == null) return false;
    if (!hit(i.bounds, box)) return false;
    if (!d.aoi) return true;
    const b = i.bounds, c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    if (![[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]], c].some((p) => inAoi(d.aoi, p))) return false;
    /* 상자형(거친) AOI 는 이웃 지역을 덮는다 — 영상 중심이 다른 지역의 정밀 경계 안이면 그 지역 영상 */
    if (JSON.stringify(d.aoi.coordinates).length >= 400) return true;
    return !D.deploys.some((o) => regionKey(o) !== regionKey(d) && o.aoi && JSON.stringify(o.aoi.coordinates).length >= 400 && hit(aoiBox(o), [c[0], c[1], c[0], c[1]]));
  }).sort((a, b) => a.gsd_m - b.gsd_m);
}
const CARD_CLS = { 'card-farm': ['경작지', '비닐하우스', '비닐하우스_단동', '비닐하우스_다동', '비경작지'], 'card-living': ['건물', '주차장'], 'card-road': ['vehicle', '주차장'], 'card-change': ['built_gain', 'veg_loss'] };
/** 배포본에 연결된 모델(계보 → 고정 모델) */
export function linkedModel(d, lineage) {
  const ids = (lineage?.chain || []).filter((c) => c.kind === 'model').map((c) => c.id);
  return D.models.find((m) => ids.includes(m.id)) || (d.model_override && D.models.find((m) => m.id === d.model_override)) || null;
}
/** 이 지역 영상에 맞는 모델 후보(해상도 차 ≤ 2.5배 · 카드 업무 클래스 우선) */
export function modelFor(d, imgs = imageryIn(d)) {
  const want = CARD_CLS[d.card_id] || [];
  let best = null;
  for (const i of imgs) for (const m of D.models) {
    if (!m.gsd_trained_m || !['seg', 'obb', 'det'].includes(m.task)) continue;
    const gap = Math.abs(Math.log(i.gsd_m / m.gsd_trained_m));
    if (gap > Math.log(2.5)) continue;
    const score = gap - ((m.classes || []).some((c) => want.includes(c)) ? 1 : 0);
    if (!best || score < best.score) best = { img: i, model: m, score };
  }
  return best;
}
/** 첫 분석 AOI — 영상과 배포본 AOI 가 겹치는 곳 안쪽의 작은 상자(표본 1칸) */
export function sampleBox(d, img) {
  const ib = img.bounds, box = aoiBox(d);
  const b = [Math.max(ib[0], box[0]), Math.max(ib[1], box[1]), Math.min(ib[2], box[2]), Math.min(ib[3], box[3])];
  let cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  if (d.aoi && !inAoi(d.aoi, [cx, cy])) { const c = [[ib[0], ib[1]], [ib[2], ib[1]], [ib[0], ib[3]], [ib[2], ib[3]]].find((p) => inAoi(d.aoi, p)); if (c) { cx = (c[0] * 3 + cx) / 4; cy = (c[1] * 3 + cy) / 4; } }
  const dx = 0.0016, dy = 0.0012;
  return [cx - dx, cy - dy, cx + dx, cy + dy];
}
export const boxPoly = (b) => ({ type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] });

/* ── 운영 건강(명세: GET /deploys?with=health). 재학습 · 정밀도 · 오탐 신고는 retrain.js 한 규칙(콘솔 '오늘' · lx-review 와 같은 원천).
   서버 health 는 기관 단위(한 기관의 모든 배포본에 같은 신고·정밀도)라 업무별로 갈라지지 않는다 → 마지막 학습만 서버 값을 쓴다. ─ */
const NEXT = { retrain: '재학습', sample: '표본 확인', sample_review: '표본 확인', verify: '표본 확인', redeploy: '갱신 배포', update: '갱신 배포', update_deploy: '갱신 배포', none: '없음', watch: '없음' };
const envOf = (value, unit, basis, source) => ({ value, unit, basis, as_of: D.asOf, source });

/** 규칙 · 규칙별 정밀도(lx-review) · 배포본별 규칙 의심 수 — 한 번(서랍 · 운영 탭 공용) */
let HP = null;
export function loadHealth() { return (HP ||= fetchHealth()); }
async function fetchHealth() {
  /* 정밀도 = lx-review 와 같은 함수(그 화면의 data.js 를 그대로 import · 같은 원천 · 같은 계산) */
  /* lx-review app.js 와 같은 순서(probeS2 → loadRules → loadVerdicts · 규칙 통계는 규칙 목록 뒤) — 같은 값이 나오도록 */
  try { await RV.probeS2(); await RV.loadRules(); await RV.loadVerdicts(); } catch (e) { devlog('정밀도', e.message); }
  D.rules = RV.D.rules || [];
  const live = D.deploys.filter((d) => d.stage !== 'draft');
  const fx = await Promise.allSettled(live.map((d) => api(`/survey/findings?deploy_id=${encodeURIComponent(d.id)}&limit=1`)));
  D.byRule = Object.fromEntries(live.map((d, i) => [d.id, fx[i].status === 'fulfilled' ? fx[i].value.by_rule || {} : {}]));
  D.healthReady = true;
  devlog('정밀도', `${RV.D.s2 ? 'S-2' : '검수 기록'} · ` + D.rules.map((r) => `${r.id} ${RV.ruleStat(r.id).k}`).join(' · '));
  return D;
}
const statOf = (id) => { try { return RV.ruleStat(id); } catch { return null; } };
/** 이 배포본에 걸린 열린 오탐 신고(지난 30일 · 같은 기관 · 결과 층 업무가 같은 것) */
export const reportsOf = (d) => reportsFor(d, D.feedback, D.rules);
/** 재학습 묶음(기관 × 업무) — 큰 숫자 · 표 '재학습' 행 · 표 '오탐 신고'가 모두 이 한 계산 */
export const due = () => dueSets(D.feedback, { rules: D.rules });
/** 재학습 묶음 → 배포본 */
export const retrainMap = () => retrainTargets(due(), D.deploys, D.rules);

export function health(d, model = null, due = retrainMap()) {
  const h = d.health || null;
  const reps = reportsOf(d).length;
  const precision = precisionFor(d, { rules: D.rules, statOf, byRule: D.byRule?.[d.id] || null });
  let lastTrain = h ? (h.last_train || h.last_trained_at || null) : null;
  if (!h) {
    const m = model || (d.model_override && D.models.find((x) => x.id === d.model_override)) || null;
    lastTrain = m ? Object.values(m.metrics || {}).map((e) => e?.as_of).filter(Boolean).sort().pop() || null : null;
  }
  const card = cardOf(d.card_id);
  const newer = card?.versions?.length && d.card_version_id && card.versions[card.versions.length - 1] !== d.card_version_id;
  let next = '없음';
  if (due.has(d.id)) next = '재학습';
  else if (newer) next = '갱신 배포';
  else if (!precision || precision.k < SAMPLE_GOAL) next = '표본 확인';
  else if (h && NEXT[h.next_action] && NEXT[h.next_action] !== '재학습') next = NEXT[h.next_action];
  return { precision, reports: envOf(reps, 'count', 'recorded', '기관 확인 기록'), lastTrain, next, due: due.get(d.id) || [] };
}

/** 재학습 필요 {n}건 — 재학습 묶음 수(= 표 '재학습' 행 수 · 콘솔 '오늘'이 dueSets 를 쓰면 같은 값) */
export function retrainEnv() {
  const list = due();
  devlog('재학습', list.map((x) => `${x.key} ${x.n}(${x.sets.join('+')})`).join(' · ') || '0');
  return envOf(list.length, 'count', 'recorded', '기관 확인 기록');
}

/* ── 쓰기 가능 여부: 게이트웨이 openapi 의 (메서드, 경로) — 죽은 버튼 0 ─────── */
let OPS = null;
export async function hasOp(method, path) {
  if (!OPS) OPS = fetch(API.prefix + '/openapi.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.paths || {}).catch(() => ({}));
  const paths = await OPS;
  return Object.entries(paths).some(([p, ops]) => {
    const q = p.replace(/^\/api\/v1/, '');
    return (q === path || new RegExp('^' + q.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path)) && !!ops[method.toLowerCase()];
  });
}
