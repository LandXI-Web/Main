/* lx-review data.js — ④ 검수 자료 한 곳. 숫자는 전부 서버 봉투(또는 서버 기록을 센 값 → 봉투).
   명세 §2.6 API: /survey/findings · /survey/parcels/{pnu} · 판정 /survey/findings/{fid}/state · 정밀도 /survey/rules/{id}/stats
   · 재교정 /survey/rules/{id}/recalibrate · 적용 요청 /survey/rules/{id}/activate (세 경로 모두 서버에 있음 · openapi 확인 2026-09-27)

   정밀도 출처는 한 곳 = LX 표본 검수. 서버 /survey/rules/{id}/stats 는 지금 survey_findings.verdict 전체(기관 현장 판정 포함)를
   세므로 LX 표본 정밀도로 쓸 수 없다. 그래서 판정·통계는 한 경로(어댑터)로 고정한다:
   · 판정 = POST /feedback { kind: 오탐→'fp' · 그 밖 'other', set: 'review:{규칙}', fid, pnu, note: '검수:{맞음|오탐|모름}' }
   · 정밀도 = GET /feedback 의 LX 행(tenant 'lx')만 규칙별로 센다(맞음 ÷ (맞음 + 오탐)) · 표본 ≥ 100 → measured, 아니면 estimate
   서버가 stats 에 LX 표본 전용 필드(lx: {judged, precision} · realm lx 판정만)를 주면 probeS2 가 켜져 S-2 로 넘어간다.
   · 결재(떼기 · 임계 적용 요청) = 실경로 POST /survey/rules/{id}/activate → approvals 행(관리자 결재함).
   시험 규칙(?stage=1): 세트 'review-stage:{규칙}' 에만 쓰고 그것만 센다 — 실보드 · 학습 표본(kind fp) · 결재함과 섞이지 않는다. */
import { api, hasRoute, bboxOf, LS } from '../kit/util.js';
import { env } from '../../shared/api-v1.js';

export const GOAL = 100;          // 표본 목표(✓ 조건)
export const SAMPLE = 20;         // 한 번에 보는 표본
export const GATE = 0.8;          // 떼기 정밀도 임계 — 서버 규칙이 gate 를 주면 그것을 쓴다
const VERDICT = { tp: '맞음', fp: '오탐', unk: '모름' };
/* 서버 판정 값(S-2 VERDICTS) — 한글 낱말은 note 로만 */
export const S2V = { tp: 'match', fp: 'match_fp', unk: 'unclear' };
const CODE = Object.fromEntries(Object.entries(VERDICT).map(([k, v]) => [v, k]));
export const CLS = { bld: '건물', crop: '경작지', gh: '비닐하우스', park: '주차장' };

/* 시험 규칙은 개발 서랍(?dev=1)과 함께일 때만 — 사용자 화면에는 나오지 않는다 */
export const STAGE = new URLSearchParams(location.search).get('stage') === '1' && new URLSearchParams(location.search).get('dev') === '1';
const SET = STAGE ? 'review-stage:' : 'review:';
export const D = { s2: false, s2why: '', stage: STAGE, set: SET, rules: [], byId: {}, fb: [], orgN: 0, pending: {}, ruleStats: {}, log: [] };
const get = (p) => api(p).catch((e) => { D.log.push({ p, e: e.code || e.message }); return null; });

/** S-2 로 갈 수 있는가 — 경로가 있고, stats 가 LX 표본 전용 필드(lx)를 줄 때만. 지금 서버는 기관 판정을 섞어 세므로 false.
    첫 보드 뒤에 loadRuleStats() 결과로 판정한다(규칙별 stats 를 두 번 받지 않는다). */
export async function probeS2() {
  const has = await hasRoute('/survey/rules/R1/stats') && await hasRoute('/survey/rules/R1/activate');
  if (!has) { D.s2 = false; D.s2why = 'stats·activate 경로 없음'; return false; }
  const j = STAGE ? null : Object.values(D.ruleStats || {}).find((x) => x?.lx) || null;
  D.s2 = !!(j && j.lx && j.lx.judged);
  D.s2why = STAGE ? '시험 규칙 — 어댑터 고정' : D.s2 ? 'stats.lx(LX 표본 전용)' : 'stats 가 기관 현장 판정을 함께 셈 — LX 전용 필드 대기';
  return D.s2;
}

export async function loadRules() {
  const j = await get('/survey/rules');
  D.rules = (j?.items || []).map((r) => {
    const cls = (r.requires || []).map((k) => (/_(bld|crop|gh|park)_/.exec(k) || [])[1]).find(Boolean) || null;
    return { ...r, cls };
  });
  D.byId = Object.fromEntries(D.rules.map((r) => [r.id, r]));
  return D.rules;
}

/** 의심 큐 — 우선 A · 열림/배정 · 지역 bbox · 규칙 */
export async function loadQueue({ bbox, rule, emd, limit = 2000 } = {}) {
  const q = new URLSearchParams({ priority: 'A', state: 'open,assigned', sort: 'score', limit: String(limit) });
  if (bbox) q.set('bbox', bbox.map((v) => v.toFixed(5)).join(','));
  if (emd?.length) q.set('emd_cd', emd.join(','));
  if (rule) q.set('rule', rule);
  return get('/survey/findings?' + q);
}

export const parcel = (pnu) => get(`/survey/parcels/${pnu}?with=facts,findings,geom`);

/** AI 판독 폴리곤 층 — 카탈로그의 결과 벡터 층(서버 detections 와 같은 도형 · promote_id) 중 이 필지를 덮는 것.
    필지 카드의 findings[].ai_ids 로 거른다(지역 고정 0 · 카탈로그가 정한다). /results/{set}/features?bbox= 는 서버 500 이라 쓰지 않는다. */
let CAT = null;
export const resultLayers = () => (CAT ||= get('/catalog/layers').then((j) => (j?.items || []).filter((i) => i.role === 'result' && i.kind === 'vector' && i.layer && i.url)));
export async function aiLayersAt([x, y] = []) {
  const L = await resultLayers();
  return L.filter((i) => !i.bounds || (x >= i.bounds[0] && x <= i.bounds[2] && y >= i.bounds[1] && y <= i.bounds[3]));
}

/* ── 검수 기록 ───────────────────────────────────────── */
/** 규칙별 통계(결재 대기 표시용) — 첫 보드를 그린 뒤에 부른다(지연 로드). 반드시 loadRules() 뒤. */
export async function loadRuleStats(ids = D.rules.map((r) => r.id)) {
  if (STAGE) return D.ruleStats;
  await Promise.all(ids.map(async (id) => { const j = await get(`/survey/rules/${id}/stats`); if (j) D.ruleStats[id] = j; }));
  D.pending = Object.fromEntries(Object.entries(D.ruleStats).map(([k, v]) => [k, !!v?.pending_activation]));
  D.s2 = Object.values(D.ruleStats).some((x) => x?.lx?.judged);
  D.s2why = D.s2 ? 'stats.lx(LX 표본 전용)' : 'stats 에 lx 필드 없음 — 어댑터';
  return D.ruleStats;
}
/** 반드시 loadRules() 뒤에 부른다 */
export async function loadVerdicts() { await loadRuleStats(); return loadFeedback(); }

/** LX 표본 판정 기록 — 규칙 목록과 무관하게 바로 부를 수 있다(/me 와 나란히) */
export async function loadFeedback() {
  const j = await get('/feedback');
  /* LX 가 쓴 행(tenant_id 'lx')만, 그리고 이 화면이 쓰는 정확한 문구만 센다. 기관 판정은 세지 않고 이 화면 판정을 덮어쓰지도 않는다. */
  D.fb = (j?.items || []).filter(isLx).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  D.orgN = (j?.items || []).filter((f) => String(f.set_id || '').startsWith(SET) && !isLx(f)).length;
  return D.fb;
}

const OWN = /^검수:(?:(?:맞음|오탐|모름)$|떼기|임계요청)/;
/** 이 화면(LX 표본 검수)이 쓴 행인가 */
const isLx = (f) => String(f.set_id || '').startsWith(SET) && (f.tenant_id == null || f.tenant_id === 'lx') && OWN.test(f.note || '');

/** 판정 표 — fid → 마지막 판정(LX 표본 검수만) */
export function verdictMap(rule) {
  const m = new Map();
  for (const f of D.fb) {
    if (rule && f.set_id !== SET + rule) continue;
    const v = /^검수:(맞음|오탐|모름)$/.exec(f.note || '');
    if (v && f.fid) m.set(f.fid, { v: CODE[v[1]], at: f.at });
  }
  return m;
}

/** 규칙별 표본·정밀도(봉투) · 떼기 여부 */
export function ruleStat(rule) {
  const rs = D.ruleStats?.[rule], s2 = D.s2 && rs?.lx;
  if (s2) {
    /* 서버 봉투(S-2): lx.judged(필지당 마지막 LX 판정) · lx.precision '%'(0–100) · gate '%' · gate_samples · reviewed · pending_activation */
    const k = s2.judged?.value ?? 0, p = s2.precision, v = s2.verdicts || {};
    const goal = rs.gate_samples?.value ?? GOAL;
    const precision = p && p.value != null ? { ...p, value: Math.round(p.value * 10) / 1000, unit: 'ratio', basis: k >= goal ? 'measured' : 'estimate' } : null;
    const g = rs.gate?.value;
    return { k, goal, tp: v.match?.value ?? 0, fp: v.match_fp?.value ?? 0, unk: v.unclear?.value ?? 0, precision, gate: g != null ? (g > 1 ? g / 100 : g) : GATE,
      reviewed: !!(rs.reviewed ?? D.byId[rule]?.reviewed), pending: !!rs.pending_activation };
  }
  const m = verdictMap(rule);
  const goal = rs?.gate_samples?.value ?? GOAL;   // 조건(표본) = 서버 gate_samples 한 곳 · 서버 값이 없을 때만 명세 100
  let tp = 0, fp = 0, unk = 0, last = null;
  for (const x of m.values()) { if (x.v === 'tp') tp++; else if (x.v === 'fp') fp++; else unk++; if (!last || x.at > last) last = x.at; }
  const k = tp + fp + unk, n = tp + fp;       // 표본 = 판정한 필지 전부 · 정밀도 = 맞음 ÷ (맞음 + 오탐)
  const precision = n ? { ...env(Math.round((tp / n) * 100) / 100, 'ratio', k >= goal ? 'measured' : 'estimate', 'LX 표본 검수', `맞음 ${tp} · 오탐 ${fp} · 모름 ${unk}`), as_of: last || new Date().toISOString() } : null;
  const reviewed = D.fb.some((f) => f.set_id === SET + rule && /^검수:떼기/.test(f.note || ''));
  const pending = !!D.pending[rule] || (STAGE && D.fb.some((f) => f.set_id === SET + rule && /^검수:임계요청/.test(f.note || '')));
  return { k, goal, tp, fp, unk, precision, gate: D.byId[rule]?.gate ?? GATE, reviewed, pending };
}

let seq = 0;
const cid = (fid) => `rv-${fid}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** 판정 저장 — verdict = 'tp'|'fp'|'unk' */
export async function judge(f, verdict) {
  const word = VERDICT[verdict];
  if (D.s2) {
    /* LX 표본 검수 = 판정만 영구 기록(state 'sample' · 기관 필지 상태는 그대로) — 응답의 lx_stats 로 보드를 바로 갱신 */
    const j = await api(`/survey/findings/${f.id}/state`, { method: 'POST', body: { state: 'sample', verdict: S2V[verdict], verdict_code: verdict, note: '검수:' + word, client_id: cid(f.id) } });
    if (j?.lx_stats && D.ruleStats[f.rule]) D.ruleStats[f.rule] = { ...D.ruleStats[f.rule], lx: j.lx_stats };
  } else {
    await api('/feedback', { method: 'POST', body: { kind: verdict === 'fp' && !STAGE ? 'fp' : 'other', set: SET + f.rule, fid: f.id, pnu: f.pnu, lnglat: f.lnglat, note: '검수:' + word } });
  }
  D.fb.push({ tenant_id: 'lx', set_id: SET + f.rule, fid: f.id, note: '검수:' + word, at: new Date().toISOString() });
}

/** 검수 전 떼기 */
export async function unTag(rule, st) {
  if (D.s2) {
    /* S-2: 서버가 조건(표본 ≥ 100 · 정밀도 ≥ 임계)을 다시 판정 → approvals 행. 관리자 승인 시 규칙 reviewed:true → 꼬리표 '✓ 검수됨' */
    await api(`/survey/rules/${rule}/activate`, { method: 'POST', body: { review: true, note: `검수 전 떼기 · 표본 ${st.k} · 정밀도 ${st.precision?.value}` } });
    D.pending[rule] = true; if (D.ruleStats[rule]) D.ruleStats[rule].pending_activation = true;
    return;
  }
  if (!STAGE) await api(`/survey/rules/${rule}/activate`, { method: 'POST', body: { note: `검수 전 떼기 · 표본 ${st.k} · 정밀도 ${st.precision?.value}` } });
  await api('/feedback', { method: 'POST', body: { kind: 'other', set: SET + rule, note: `검수:떼기 표본 ${st.k} 정밀도 ${st.precision?.value}` } });
  D.fb.push({ tenant_id: 'lx', set_id: SET + rule, note: '검수:떼기', at: new Date().toISOString() });
  if (!STAGE) D.pending[rule] = true;
}

/** 임계 제안 — 서버 재교정이 있으면 그것, 없으면 판정 표본으로 면적 임계 하나를 다시 잡는다(맞음 90 % 이상 남기면서 오탐을 가장 많이 거르는 값) */
export async function suggest(rule, queue) {
  const r = D.byId[rule];
  const th = (r?.thresholds || []).find((t) => t.value?.unit === 'm2') || null;
  if (!th) return { th: (r?.thresholds || [])[0] || null, next: null };
  if (D.s2 && await hasRoute(`/survey/rules/${rule}/recalibrate`)) {
    /* 응답 = {id, key, current(봉투), proposed(봉투 · 표본 부족이면 value null), samples, need} — 제안만, 적용은 activate */
    const j = await api(`/survey/rules/${rule}/recalibrate?scope=lx`, { method: 'POST', body: { scope: 'lx' } }).catch(() => null);
    const ok = j && j.key === th.key && j.proposed?.value != null && j.proposed.value !== th.value?.value;
    return { th, next: ok ? { ...j.proposed, unit: th.value?.unit || j.proposed.unit } : null };
  }
  const m = verdictMap(rule), byId = new Map(queue.map((f) => [f.id, f]));
  const pts = [...m].map(([fid, x]) => ({ v: x.v, a: byId.get(fid)?.evid_m2?.value })).filter((p) => p.v !== 'unk' && Number.isFinite(p.a));
  const tps = pts.filter((p) => p.v === 'tp').map((p) => p.a).sort((a, b) => a - b);
  const fps = pts.filter((p) => p.v === 'fp').map((p) => p.a);
  if (tps.length + fps.length < SAMPLE || !fps.length) return { th, next: null };
  const cur = th.value.value;
  const keep = tps[Math.floor(tps.length * 0.1)] ?? cur;           // 맞음 90 % 를 남기는 하한
  const cands = [cur, ...fps.map((a) => Math.ceil(a + 1))].filter((c) => c >= cur && c <= keep);
  let best = cur, bestCut = 0;
  for (const c of cands) { const cut = fps.filter((a) => a < c).length; if (cut > bestCut) { best = c; bestCut = cut; } }
  return { th, next: best > cur ? { ...th.value, value: best, basis: 'estimate', source: '검수 표본', note: `오탐 ${bestCut}건을 거르는 값` } : null };
}

export async function requestThreshold(rule, th, next) {
  if (!STAGE) await api(`/survey/rules/${rule}/activate`, { method: 'POST', body: { thresholds: { [th.key]: next.value }, note: `검수 표본 기준 ${th.label} ${th.value.value}→${next.value}` } });
  else await api('/feedback', { method: 'POST', body: { kind: 'other', set: SET + rule, note: `검수:임계요청 ${th.label} ${th.value.value}→${next.value}` } });
  D.fb.push({ tenant_id: 'lx', set_id: SET + rule, note: '검수:임계요청', at: new Date().toISOString() });
  if (!STAGE) { D.pending[rule] = true; if (D.ruleStats[rule]) D.ruleStats[rule].pending_activation = true; }
}

/* ── 표본 ───────────────────────────────────────────── */
/** 판정 안 된 의심 중 20개 — 규칙 안에서 점수 층을 고르게(상·중·하) · 같은 규칙이면 새로고침해도 같은 묶음 */
export function drawSample(rule, queue) {
  const key = 'lx_review_sample_' + (STAGE ? 'stage_' : '') + rule;
  const judged = verdictMap(rule);
  const kept = (LS.get(key, []) || []).map((id) => queue.find((f) => f.id === id)).filter(Boolean);
  if (kept.length && kept.some((f) => !judged.has(f.id))) return kept;
  const pool = queue.filter((f) => f.rule === rule && !judged.has(f.id));
  const n = Math.min(SAMPLE, pool.length), out = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(((i + 0.5) / n) * pool.length)]);
  LS.set(key, out.map((f) => f.id));
  return out;
}
export const forgetSample = (rule) => LS.set('lx_review_sample_' + (STAGE ? 'stage_' : '') + rule, []);

/** 지역 — URL ?region= · 없으면 의심이 가장 많은(첫 순위) 필지가 있는 지역 */
export function regionFor(regions, finding) {
  const url = new URLSearchParams(location.search).get('region');
  if (url) { const r = regions.find((x) => x.sgg_cd === url || x.full === url || x.name === url); if (r) return r; D.unknownRegion = url; }
  if (!finding) return null;
  /* 시군구 코드(PNU 앞 5자리)가 먼저 — 상자는 이웃 시군구와 겹친다 */
  const cd = String(finding.emd_cd || finding.pnu || '').slice(0, 5);
  const byCd = /^\d{5}$/.test(cd) && regions.find((r) => r.sgg_cd === cd);
  if (byCd) return byCd;
  const [x, y] = finding.lnglat || [];
  const hit = regions.filter((r) => r.bbox && x >= r.bbox[0] && x <= r.bbox[2] && y >= r.bbox[1] && y <= r.bbox[3]);
  if (hit.length) return hit.sort((a, b) => (a.bbox[2] - a.bbox[0]) - (b.bbox[2] - b.bbox[0]))[0];
  const parts = String(finding.addr || '').split(/\s+/);
  return { sgg_cd: null, name: parts[1] || parts[0] || '', full: parts.slice(0, 2).join(' '), bbox: null, approx: true };
}
/** 이 지역의 필지인가 — 시군구 코드(PNU 앞 5자리)가 있으면 그것, 없으면 주소 앞머리(배포 기록의 지역 이름) */
export function inRegion(region, f) {
  if (!region) return true;
  if (/^\d{5}$/.test(region.sgg_cd || '')) return String(f.emd_cd || f.pnu || '').startsWith(region.sgg_cd);
  if (region.full) return String(f.addr || '').replace(/\s+/g, '').startsWith(String(region.full).replace(/\s+/g, ''));
  return true;
}
export const bboxOfPoints = (items) => bboxOf({ type: 'MultiPoint', coordinates: items.map((f) => f.lnglat).filter((c) => c && Number.isFinite(c[0])) });
