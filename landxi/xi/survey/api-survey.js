/* api-survey.js — 실태조사 데이터 층(F2-A). 계약 v1.1-22 `/api/v1/survey/*` 를 api-v1.js 를 고치지 않고 이 파일 안의 래퍼로 쓴다.
   on  = 게이트웨이(F2-S 라우터가 있으면) · 없으면(404) 정직하게 '서버 경로 없음'으로 떨어져 off 정본을 쓴다.
   off = 02. 데이터/survey 실파일에서 만든 사본(survey/data/*.json · build-survey-data.py) — 숫자는 전부 실값(README 표와 같음).
   선택 경로는 _lxopt=1 로 부른다 — 서비스 워커(sw.js)가 오류 상태를 200 + {__lxerr} 로 감싸 콘솔 오류 0 을 지킨다.
   상태 쓰기(POST …/state)는 서버가 있을 때만 저장 · 없으면 '시연 · 저장 안 됨'(메모리 · 같은 브라우저 탭 사이 BroadcastChannel). */
import { API, session, ApiError, sse } from '../../shared/api-v1.js';
import { opt, optFile, hasSW } from '../engine/opt.js';
export { opt, optFile };

export const AS_OF = '2026-09-24';
const HERE = new URL('./data/', import.meta.url).href;
export const SV = { route: 'unknown', stream: 'unknown', via: { emd: null, findings: null, replay: null }, log: [] };
const log = (k, v) => { SV.log.push([Math.round(performance.now()), k, v]); if (SV.log.length > 200) SV.log.shift(); };

/** 봉투(데이터 파생 — as_of = 수집일) */
export const E = (value, unit, basis = 'inferred', source = 'findings-emd.json', note) => ({ value, unit, basis, as_of: AS_OF, source, ...(note ? { note } : {}) });

/* ── 서버 경로 탐지 ── */
let routeP = null;
export function probeRoute() {
  return (routeP ||= (async () => {
    if (API.mode !== 'on') { SV.route = 'off'; return SV.route; }
    if (!session.get()?.token) { SV.route = 'no_token'; return SV.route; }
    try { await opt('/survey/rules'); SV.route = 'on'; }
    catch (e) { SV.route = e.status === 404 ? 'missing' : e.code === 'no_sw' ? 'no_sw' : 'error:' + e.code; }
    log('route', SV.route);
    return SV.route;
  })());
}
export const routeOn = () => SV.route === 'on';
export const routeNote = () => ({ on: '', off: '서버 연결 없음', no_token: '로그인 세션 없음', missing: '서버 경로 없음 · F2-S 대기', no_sw: '서비스 워커 대기' }[SV.route] ?? '서버 오류');

/* ── off 정본 ── */
const memo = {};
const getJson = async (url) => { try { const r = await fetch(url, { cache: 'force-cache' }); return r.ok ? await r.json() : null; } catch { return null; } };
/** 읍면동 39행 · 합계(정본 = F2-S `02. 데이터/survey/findings-emd.json` 이 있으면 그것 · 없으면 이 에픽 사본) */
export function loadEmd() {
  return (memo.emd ||= (async () => {
    const canon = API.mode === 'on' || hasSW() ? normEmd(await optFile('/landxi/data/survey/findings-emd.json')) : null;
    const ok = canon && canon.rows.length === 39 && canon.totals.suspect_parcels > 0;
    const j = ok ? canon : await getJson(HERE + 'findings-emd.json');
    SV.via.emd = ok ? 'F2-S 02. 데이터/survey/findings-emd.json(PostGIS 적재 검증본)' : 'landxi/xi/survey/data/findings-emd.json(02. 데이터 사본)';
    return j;
  })());
}
/** F2-S 정본(items · name · suspects) ↔ 이 에픽 사본(rows · emd · findings) — 같은 모양으로 */
function normEmd(j) {
  if (!j || typeof j !== 'object') return null;
  const src = j.rows || j.items; if (!Array.isArray(src)) return null;
  const rows = src.map((r) => { const bb = r.bbox; return { emd_cd: r.emd_cd, emd: r.emd || r.name, parcels: r.parcels?.value ?? r.parcels, suspect_parcels: r.suspect_parcels?.value ?? r.suspect_parcels, findings: r.findings ?? r.suspects?.value ?? r.suspects,
    by_rule: r.by_rule, by_priority: r.by_priority, bbox: bb, center: r.center || (bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : null), top5: r.top5 || [] }; }).sort((a, b) => (a.center?.[0] ?? 0) - (b.center?.[0] ?? 0));
  const t = j.totals || {};
  return { ...j, rows, totals: { parcels: t.parcels, findings: t.findings ?? t.suspects, suspect_parcels: t.suspect_parcels, by_rule: t.by_rule, by_priority: t.by_priority }, _canon: true };
}
export const loadRules = () => (memo.rules ||= getJson(HERE + 'rules-fixture.json'));
/** 의심 20,872건(열 배열 → 객체) */
export function loadLite() {
  return (memo.lite ||= (async () => {
    const j = await getJson(HERE + 'findings-lite.json'); if (!j) return null;
    const c = Object.fromEntries(j.cols.map((k, i) => [k, i])), D = j.dict;
    const items = j.rows.map((r) => ({
      id: r[c.id], rank: r[c.rank], priority: r[c.priority], score: r[c.score], rule: r[c.rule], pnu: r[c.pnu], emd_cd: r[c.emd_cd], emd: D.emd[r[c.emd]], ri: D.ri[r[c.ri]],
      jibun: r[c.jibun], jimok: D.jimok[r[c.jimok]], parcel_m2: r[c.parcel_m2], evid_m2: r[c.evid_m2], conf: r[c.conf], lng: r[c.lon], lat: r[c.lat],
      yongdo: D.yongdo[r[c.yongdo]], nongup: D.nongup[r[c.nongup]], state: 'open', updated_at: AS_OF,
    }));
    const byId = new Map(items.map((f) => [f.id, f])), byPnu = new Map();
    for (const f of items) (byPnu.get(f.pnu) || byPnu.set(f.pnu, []).get(f.pnu)).push(f);
    SV.via.findings = 'landxi/xi/survey/data/findings-lite.json(02. 데이터 gpkg 사본)';
    return { items, byId, byPnu, source: j.source, dict: D };
  })());
}
/** 필지 속성(대장 공시지가 · 2023/2025 AI 면적 · 근거 문장) — 읍면동 단위 파일 */
export function loadDetail(emd_cd) {
  memo.det ||= {};
  return (memo.det[emd_cd] ||= (async () => {
    const j = await getJson(HERE + `detail/${emd_cd}.json`); if (!j) return new Map();
    const c = Object.fromEntries(j.cols.map((k, i) => [k, i])), D = j.dict, a23 = j.a23_cols, a25 = j.a25_cols;
    return new Map(j.rows.map((r) => [r[c.id], {
      corroboration: D.corroboration[r[c.corroboration]], img_date: D.img_date[r[c.img_date]], evidence: r[c.evidence], ai_ids: r[c.ai_ids], jiga: r[c.jiga], gosi_year: r[c.gosi_year],
      a23: Object.fromEntries(a23.map((k, i) => [k, r[c.a23][i]])), a25: Object.fromEntries(a25.map((k, i) => [k, r[c.a25][i]])), chg: r[c.chg], chg_built_new_m2: r[c.chg_built_new_m2], flags: D.flags[r[c.flags]],
    }]));
  })());
}
/** 필지 이력 6,818(02. 데이터/survey/namwon-parcel-timeline.json · 5.9 MB · 이력을 처음 펼칠 때 한 번) */
export function loadTimeline() {
  return (memo.tl ||= (async () => {
    const j = await getJson('/landxi/data/survey/namwon-parcel-timeline.json');
    return j ? new Map(j.parcels.map((p) => [p.pnu, p])) : new Map();
  })());
}

/* ── 상태(메모리 · 시연) + 같은 브라우저 탭 사이 동기(BroadcastChannel) ── */
export const STATE_KO = { open: '미조치', assigned: '현장조사 배정', inspected: '현장 확인', closed: '종결', dismissed: '오탐' };
const MOVES = { open: ['assigned', 'dismissed'], assigned: ['inspected', 'dismissed'], inspected: ['closed'], closed: [], dismissed: [] };
export const canMove = (from, to) => (MOVES[from] || []).includes(to);
const overlay = new Map();   // id → {state, assignee, planned_for, reason, updated_at, by, basis}
const chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lx-survey-demo') : null;
const listeners = new Set();
export function onFindingState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function fire(ev) { for (const fn of listeners) { try { fn(ev); } catch (e) { console.warn('[survey] state', e); } } }
chan?.addEventListener('message', (m) => { const ev = m.data; if (ev?.type !== 'finding.state') return; overlay.set(ev.id, ev.row); fire({ ...ev, via: 'tab' }); });
/** 서버 응답에 실린 상태를 조용히 심는다(이벤트 없음 · 목록/카드 조회 때) */
export function seedState(it) {
  if (!it?.id || !it.state) return;
  const cur = overlay.get(it.id);
  if (cur && !cur.saved) return;   // 이 탭의 시연 쓰기는 덮지 않는다
  overlay.set(it.id, { state: it.state, assignee: it.assignee, planned_for: it.planned_for, reason: it.reason, updated_at: it.updated_at || AS_OF, by: it.updated_by || '', basis: it.state_basis || (it.state === 'open' ? 'inferred' : 'measured'), saved: true });
}
/** 기관 스트림(finding.state)·다른 경로에서 온 상태 변화를 받아 들인다(서버가 정본 · 저장됨) */
export function ingestFindingState(d, via = 'stream') {
  if (!d?.id) return;
  const row = { state: d.to || d.state, assignee: d.assignee, planned_for: d.planned_for, reason: d.reason, updated_at: d.at || new Date().toISOString(), by: d.by || '', basis: d.basis || 'measured', saved: true };
  overlay.set(d.id, row);
  fire({ type: 'finding.state', id: d.id, pnu: d.pnu, rule: d.rule, from: d.from, to: row.state, row, via, at: row.updated_at, lag_ms: d.at ? Date.now() - Date.parse(d.at) : null });
}
export const stateOf = (f) => overlay.get(f.id)?.state || f.state || 'open';
export const rowOf = (f) => ({ ...f, ...(overlay.get(f.id) || {}) });

/** 상태 쓰기 — on(F2-S 경로) = POST 뒤 서버 응답으로만 칩 교체(낙관적 갱신 0) · 없으면 시연(메모리) */
export async function setState(f, to, { reason = '', assignee = '', planned_for = '' } = {}) {
  const from = stateOf(f);
  if (!canMove(from, to)) throw new ApiError('finding_state_invalid', `${STATE_KO[from]} → ${STATE_KO[to]} 전이 불가`, null, 409);
  const client_id = 'cx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (routeOn()) {
    const r = await opt(`/survey/findings/${encodeURIComponent(f.id)}/state`, { method: 'POST', body: { state: to, reason, assignee, planned_for, client_id } });
    const row = { state: r?.state || to, assignee: r?.assignee ?? assignee, planned_for: r?.planned_for ?? planned_for, reason: r?.reason ?? reason, updated_at: r?.updated_at || new Date().toISOString(), by: r?.updated_by || '', basis: r?.basis || 'measured', saved: true };
    overlay.set(f.id, row);
    const ev = { type: 'finding.state', id: f.id, pnu: f.pnu, rule: f.rule, from, to: row.state, row, via: 'api', at: row.updated_at };
    fire(ev); chan?.postMessage(ev);
    return { row, saved: true };
  }
  const row = { state: to, assignee, planned_for, reason, updated_at: new Date().toISOString(), by: session.shadow().role || 'guest', basis: 'demo', saved: false };
  overlay.set(f.id, row);
  const ev = { type: 'finding.state', id: f.id, pnu: f.pnu, rule: f.rule, from, to, row, via: 'demo', at: row.updated_at };
  fire(ev); chan?.postMessage(ev);
  return { row, saved: false };
}

/* ── 의심 목록(GET /survey/findings 와 같은 모양) ── */
const SORTS = { score: (a, b) => b.score - a.score || a.rank - b.rank, evid_m2: (a, b) => b.evid_m2 - a.evid_m2 || a.rank - b.rank, updated: (a, b) => String(rowOf(b).updated_at).localeCompare(String(rowOf(a).updated_at)) || a.rank - b.rank };
const V = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
export const normItem = (it) => {
  const a = String(it.addr || '').split(' '), i = a.indexOf(it.emd || it.emd_nm);
  const ll = it.lnglat || it.geometry?.coordinates || it.geom?.coordinates || [it.lon ?? it.lng, it.lat];
  return {
    id: it.id, rank: V(it.rank), priority: it.priority, score: V(it.score), rule: it.rule || it.rule_id, rule_nm: it.rule_nm, pnu: it.pnu, emd_cd: it.emd_cd || String(it.pnu || '').slice(0, 8),
    emd: it.emd || it.emd_nm, ri: it.ri || (i >= 0 && a.length > i + 2 ? a[i + 1] : ''), jibun: it.jibun || a.slice(i >= 0 ? i + 2 : -1).join(' '), jimok: it.jimok, parcel_m2: V(it.parcel_m2), evid_m2: V(it.evid_m2),
    conf: V(it.conf), lng: ll?.[0], lat: ll?.[1], yongdo: it.yongdo, nongup: it.nongup, state: it.state || 'open', updated_at: it.updated_at || AS_OF,
    assignee: it.assignee, planned_for: it.planned_for, _api: true,
  };
};
/** q = { rule:[..], priority:[..], emd_cd, state:[..], q, sort, limit, offset } → { items, total:Env, counts:{state:Env}, by_rule, via } */
export async function findings(q = {}) {
  if (routeOn()) {
    try {
      const p = new URLSearchParams();
      if (q.rule?.length) p.set('rule', q.rule.join(','));
      if (q.priority?.length) p.set('priority', q.priority.join(','));
      if (q.emd_cd) p.set('emd_cd', q.emd_cd);
      if (q.state?.length) p.set('state', q.state.join(','));
      if (q.q) p.set('q', q.q);
      p.set('sort', q.sort || 'score'); p.set('limit', String(q.limit || 50)); p.set('offset', String(q.offset || 0));
      const j = await opt('/survey/findings?' + p);
      const items = (j.items || []).map(normItem);
      for (const f of items) seedState(f);
      const tot = j.total && typeof j.total === 'object' ? j.total : E(j.total ?? items.length, 'count', 'inferred', 'GET /survey/findings');
      const counts = Object.fromEntries(Object.entries(j.counts || {}).map(([k, v]) => [k, v && typeof v === 'object' ? v : E(v, 'count', 'inferred', 'GET /survey/findings · counts')]));
      const by_rule = Object.fromEntries(Object.entries(j.by_rule || {}).map(([k, v]) => [k, V(v)]));
      return { items, total: tot, counts, by_rule, as_of: j.as_of, via: 'api', db_ms: j.db_ms ?? j.took_ms };
    } catch (e) { log('findings api', e.code); }
  }
  const L = await loadLite(); if (!L) return { items: [], total: E(0, 'count', 'inferred', 'findings-lite.json 없음'), counts: {}, by_rule: {}, via: 'none' };
  const R = q.rule?.length ? new Set(q.rule) : null, P = q.priority?.length ? new Set(q.priority) : null, ST = q.state?.length ? new Set(q.state) : null;
  const s = (q.q || '').trim();
  const base = L.items.filter((f) => (!R || R.has(f.rule)) && (!P || P.has(f.priority)) && (!q.emd_cd || f.emd_cd === q.emd_cd)
    && (!s || f.pnu.includes(s) || `${f.emd} ${f.ri} ${f.jibun}`.includes(s) || `${f.ri} ${f.jibun}`.includes(s)));
  const counts = { open: 0, assigned: 0, inspected: 0, closed: 0, dismissed: 0 };
  for (const f of base) counts[stateOf(f)]++;
  const rows = ST ? base.filter((f) => ST.has(stateOf(f))) : base;
  const by_rule = {}; for (const f of rows) by_rule[f.rule] = (by_rule[f.rule] || 0) + 1;
  rows.sort(SORTS[q.sort] || SORTS.score);
  const off = q.offset || 0, lim = q.limit || 50;
  const src = 'findings-lite.json(off 정본 · 02. 데이터 gpkg)';
  return {
    items: rows.slice(off, off + lim).map(rowOf), total: E(rows.length, 'count', 'inferred', src, '의심 건(규칙별 1행) · 검수 전'),
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, E(v, 'count', [...overlay.values()].some((o) => !o.saved) && k !== 'open' ? 'demo' : 'inferred', src)])),
    by_rule, as_of: AS_OF, via: 'file',
  };
}
/** 한 건 + 설명(explain) — on = GET /survey/findings/{id} · off = 사본 + 규칙 정의로 같은 모양 */
export async function finding(id) {
  if (routeOn()) { try { const j = await opt('/survey/findings/' + encodeURIComponent(id)); return { ...normItem(j), explain: j.explain, history: j.history, _raw: j, via: 'api' }; } catch (e) { log('finding api', e.code); } }
  const L = await loadLite(); const f = L?.byId.get(id); if (!f) return null;
  return { ...rowOf(f), via: 'file' };
}
/** 필지 대장 vs 현황 — on = GET /survey/parcels/{pnu}?with=facts,findings,history · off = null(카드가 타일 속성 + 사본으로 조립) */
export async function parcel(pnu) {
  if (!routeOn()) return null;
  try { return await opt(`/survey/parcels/${encodeURIComponent(pnu)}?with=facts,findings,history`); } catch (e) { log('parcel api', e.code); return null; }
}

/* ── 대조 작업(kind:'survey') — on = POST /jobs + SSE · 경로 없으면 리플레이(정직 표기) ── */
export async function runSurveyJob({ rules = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], deploy_id = 'dp-nw-farm-25', onEvent, onSubmitted, speed = 1 }) {
  const body = { kind: 'survey', survey_id: 'farmland', deploy_id, rules, options: {}, priority: 0 };
  if (API.mode === 'on' && session.get()?.token && hasSW()) {
    try {
      const r = await opt('/jobs', { method: 'POST', body });
      onSubmitted && onSubmitted(r.job);
      const h = sse(r.events_url.replace(/^\/api\/v1/, ''), { events: ['job.queued', 'job.started', 'shard.started', 'shard.done', 'shard.failed', 'job.progress', 'job.done', 'job.failed', 'job.cancelled', 'survey.finding', 'survey.rule_skipped'], on: (name, d) => onEvent(name, d, { live: true }) });
      SV.via.replay = 'api';
      return { live: true, job: r.job, close: () => h.close() };
    } catch (e) { log('survey job', e.code); SV.jobErr = e.code; }
  }
  // 리플레이: F2-S 녹음(02. 데이터/survey/replay/survey-namwon.ndjson · recorded) 이 있으면 그것 · 없으면 findings-emd 39행 합성(demo)
  let text = null, rec = false;
  const canon = await optFile('/landxi/data/survey/replay/survey-namwon.ndjson');
  if (canon && canon.text) { text = await canon.text(); rec = true; }
  if (!text) { try { text = await (await fetch(HERE + 'replay/survey-namwon.ndjson', { cache: 'no-store' })).text(); } catch { text = ''; } }
  SV.via.replay = rec ? 'F2-S 녹음 · 02. 데이터/survey/replay/survey-namwon.ndjson' : 'findings-emd.json 39행 합성(survey/data/replay)';
  const lines = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let closed = false; const timers = [];
  const done = new Promise((res) => {
    let n = 0;
    for (const ln of lines) timers.push(setTimeout(() => { if (closed) return; onEvent(ln.event, { ...ln.data, basis: rec ? 'recorded' : 'demo', replay: true }, { live: false, recorded: rec }); if (++n === lines.length) res(); }, ln.t / speed));
    if (!lines.length) res();
  });
  return { live: false, recorded: rec, job: null, close() { closed = true; timers.forEach(clearTimeout); }, done };
}

/* ── 기관 스트림(v1.1-16 · deploy.changed · finding.state) — 없으면 null(호출부가 폴링) ── */
export async function tenantStream(on) {
  if (API.mode !== 'on' || !session.get()?.token || !hasSW()) { SV.stream = 'none'; return null; }
  const ac = new AbortController();
  try {
    const u = `${API.prefix}/events/tenant?access_token=${encodeURIComponent(session.get().token)}&_lxopt=1`;
    const r = await fetch(u, { signal: ac.signal, cache: 'no-store' });
    const ct = r.headers.get('content-type') || '';
    ac.abort();
    if (!r.ok || !/event-stream/.test(ct)) { SV.stream = 'missing'; return null; }
  } catch { SV.stream = 'missing'; return null; }
  SV.stream = 'on';
  return sse('/events/tenant', { events: ['job.state', 'deploy.changed', 'finding.state', 'usage.delta'], on });
}

/* ── 보고서 초안(F2-S · LLM 없이 docx) ── */
export async function draftDocx({ emd_cd, rule, top = 20 }) {
  if (!routeOn()) return null;
  const p = new URLSearchParams({ format: 'docx', top: String(top) }); if (emd_cd) p.set('emd_cd', emd_cd); if (rule) p.set('rule', rule);
  try {
    const r = await opt('/survey/reports/draft?' + p);
    if (r instanceof Response) { const cd = r.headers.get('content-disposition') || ''; const m = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd); return { blob: await r.blob(), name: m ? decodeURIComponent(m[1]) : `실태조사_초안_${emd_cd || '남원'}.docx` }; }
  } catch (e) { log('draft', e.code); }
  return null;
}
