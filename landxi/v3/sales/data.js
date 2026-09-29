/* data.js — 영업 카탈로그의 숫자·지역 한 곳(쓰기 호출 0).
   출처(명세 §2.13): /registry/cards · /deploys · /survey/stats · /survey/findings · /regions(S-3 · 없으면 K4 가 배포 기록으로 대신).
   계약 준수 어댑터: `/deploys?with=results` · `/survey/stats?by=deploy` 가 서버에 생기면 그대로 쓰고, 아직이면 같은 봉투를 기존 조회에서 만든다.
   내성: 조회마다 503·타임아웃이면 지수 백오프로 재시도하고, 늦게 온 지역·성과 띠·XI맵 착지 코드는 뒤늦게 채운다(onLate).
   지역은 변수 — 지역 이름·좌표 하드코딩 0(결과 크롭의 예시 데이터 파일 이름만 예외). */
import { api, isEnvelope, bboxOf } from '../kit/util.js';
import { joinCards, loadRegions } from '../kit/index.js';
import { loadSummary, itemFor, stageKey, scaleOf, metric, userWords } from '../service-detail/summary.js';

const KR = [124.0, 32.5, 132.5, 39.5];
const inKR = (b) => b && b[0] >= KR[0] && b[2] <= KR[2] && b[1] >= KR[1] && b[3] <= KR[3];
const isTest = (d) => /-test(-\d+)?$/.test(d?.id || '') || /\(테스트\)|\btest\b|테스트/i.test(d?.name || '');
const shortOf = (full = '') => String(full).trim().split(/\s+/).pop() || '';
const nz = (x) => String(x || '').replace(/\s+/g, '');
export const union = (bs) => bs.filter(Boolean).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
/* 필지 대조 모듈이 켜진 배포본만 실태조사(필지 단위 성과)와 잇는다 */
const parcelMod = (d) => Object.entries(d?.modules?.ext || {}).some(([k, v]) => v && /-parcel$/.test(k));
const inBox = (p, b) => p && b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/* ═══ 내성 — 503·429·네트워크·타임아웃은 지수 백오프(0.8s → 1.6s → 3.2s)로 다시 부른다. 400·401·404 는 바로 포기 ═══ */
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const retryable = (e) => e?.code === 'timeout' || !e?.status || e.status >= 500 || e.status === 429 || e.status === 408;
export const net = (window.__salesNet = { tries: {}, fails: {} });
async function retry(key, fn, { tries = 3, base = 800, timeout = 12000 } = {}) {
  let last;
  for (let k = 0; k < tries; k++) {
    net.tries[key] = (net.tries[key] || 0) + 1;
    try {
      let tm;
      const out = await Promise.race([fn(), new Promise((_, no) => { tm = setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'timeout' })), timeout); })]);
      clearTimeout(tm);
      return out;
    } catch (e) {
      last = e;
      if (!retryable(e) || k === tries - 1) break;
      await sleep(base * 2 ** k);
    }
  }
  net.fails[key] = (net.fails[key] || 0) + 1;
  throw last;
}
/* 한 번 더 늦게 — 첫 3회가 다 실패하면 한 라운드(12s 뒤)만 더 해 본다 */
const retryLate = (key, fn, o) => retry(key, fn, o).catch(async () => { await sleep(12000); return retry(key, fn, o); });
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw Object.assign(new Error('http_' + r.status), { status: r.status }); return r.json(); });

/* 결과 크롭 — S-6 `crop_url` 이 오면 그것, 아니면 결과 세트 이름으로 크롭 폴더를 찾는다(없으면 K9 캐릭터) */
const CROPS = '/landxi/assets/proto/crops/';
const CROP_PICK = { 'namwon-farmland-2025': 'namwon-farmland-2025/3@2x.jpg', 'yeosu-marine-2025-aerial': 'yeosu-marine-2025-aerial/3@2x.jpg', 'namwon-change': 'namwon-epoch/1@2x.jpg' };
const setOf = (src) => String(src || '').split('/').pop().replace(/\.geojson$/i, '');
export const cropOf = (card, deploy) => card?.crop_url || (deploy?.scale?.source ? CROPS + (CROP_PICK[setOf(deploy.scale.source)] || setOf(deploy.scale.source) + '/1@2x.jpg') : null);

/* 결과 GeoJSON — 배포본 봉투의 출처를 정적 자산 위치로 푼다(화면에 경로는 쓰지 않는다) */
export function geoUrl(src) {
  if (!src || !/\.geojson$/i.test(src)) return null;
  if (src.startsWith('landxi/')) return '/' + src;
  if (src.startsWith('results/')) return '/landxi/assets/data/geo/' + src;
  return null;
}

/** 실결과 = 운영·시범 단계 · 결과 수 봉투 · 테스트 아님 · 국내 */
const hasResult = (d) => d && ['ga', 'canary'].includes(d.stage) && isEnvelope(d.scale) && Number.isFinite(+d.scale.value) && !isTest(d) && inKR(bboxOf(d.aoi));

async function deploysWithResults() {
  // with=results 는 서버가 모르면 그냥 무시한다(같은 목록) — 계약 그대로 부른다. 느린 게이트웨이(실측 12.4s)를 감안해 한 번에 20s 까지 기다린다
  const j = await retry('deploys', () => api('/deploys?with=results'), { timeout: 20000 });
  return { items: j.items || [], as_of: j.as_of };
}

/** 지역 목록 — /regions(S-3)를 직접 재시도한다. 키트 K4 는 첫 실패를 세션 내내 캐시하므로(키트 요청) 여기서는 성공할 때까지 캐시하지 않는다 */
const splitName = (full = '') => { const p = String(full).trim().split(/\s+/); return p.length >= 2 ? { sido: p[0], name: p.slice(1).join(' ') } : { sido: p[0] || '', name: p[0] || '' }; };
async function regionsLoad() {
  try {
    const j = await retry('regions', () => api('/regions'));
    const out = (j.items || []).map((r) => ({ ...splitName(r.name?.ko || r.name), ...r, name: r.name?.ko ? splitName(r.name.ko).name : r.name, full: r.name?.ko || r.name }));
    out.source = 'regions';
    return out;
  } catch (e) {
    if (e?.status === 404) return loadRegions({ force: true });   // S-3 이전 서버 — K4 어댑터(배포 기록)
    throw e;
  }
}

/** 성과 띠 — /survey/stats?by=deploy(계약) 가 있으면 그 봉투, 없으면 같은 지표를 기존 조회에서(xi-clean 과 같은 조회 · 숫자 한 출처).
    by=deploy 는 아직 서버에 없다 → by=emd(대장과 다른 필지 합) · by=state(판정 완료) · findings(현장 확인 필요 = XI맵 HUD 와 같은 조회).
    실패는 던진다(뒤늦게 다시 부를 수 있게) · 기록이 비었으면 null */
async function surveyBand() {
  const [emd, st, fd] = await Promise.all([
    retry('survey-emd', () => api('/survey/stats?by=emd')),
    retry('survey-state', () => api('/survey/stats?by=state')),
    retry('survey-findings', () => api('/survey/findings?' + new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score' }))),
  ]);
  const items = emd.items || [];
  if (!items.length) return null;
  const asOf = emd.as_of || st.as_of;
  const cover = union(items.map((i) => i.bbox).filter((b) => b?.length === 4));
  const sumSus = items.reduce((a, i) => a + (+i.suspect_parcels?.value || 0), 0);
  const sus = items.find((i) => isEnvelope(i.suspect_parcels))?.suspect_parcels;
  const byState = Object.fromEntries((st.items || []).map((i) => [i.key, i.n]));
  const judged = ['closed', 'dismissed'].reduce((a, k) => a + (+byState[k]?.value || 0), 0);
  const judgedEnv = byState.closed || byState.dismissed;
  const pnus = new Set((fd.items || []).map((f) => f.pnu));
  const total = fd.total?.value ?? pnus.size, exact = (fd.items || []).length >= total;
  const need = exact ? pnus.size : Math.round(pnus.size * (total / Math.max(1, (fd.items || []).length)));
  return {
    cover,
    stats: [
      { key: 'field_check', label: '현장 확인 필요 필지', env: { value: need, unit: '필지', basis: exact ? 'inferred' : 'estimate', as_of: fd.as_of || asOf, source: 'AI 실태조사 결과', note: '현장 확인 전' } },
      { label: '대장과 다른 필지', env: sus ? { ...sus, value: sumSus } : null },
      { label: '판정 완료', env: judgedEnv ? { ...judgedEnv, value: judged, unit: '필지' } : null },
    ],
  };
}

/* 배포본 → 표기 지역 한 곳. /regions(S-3)는 배포 구역과 겹치는 시군구마다 배포본을 달아 주므로 '처음 찾은 곳'은 이웃 군이 될 수 있다.
   ① 배포본 sgg_cd ② 배포본 지역 이름과 같은 시군구 ③ 시군구 이름이 아닌 넓은 구역(시도 단위)은 그 이름 그대로(지역 이름 하드코딩 0) */
function pickRegion(regions, d) {
  if (!d || !regions?.length) return null;
  const nm = nz(d.region_name?.ko);
  const mine = regions.filter((r) => (r.deploys || []).some((x) => x.id === d.id));
  const pool = mine.length ? mine : regions;
  const bySgg = d.sgg_cd && regions.find((r) => r.sgg_cd === d.sgg_cd);
  if (bySgg) return bySgg;
  const byName = nm && (pool.find((r) => nz(r.full) === nm) || pool.find((r) => nz(r.name).length >= 2 && nm.endsWith(nz(r.name)) && nm.length > nz(r.name).length));
  if (byName) return byName;
  if (regions.source !== 'regions') return mine[0] || null;          // K4 어댑터(배포 기록) — 이미 배포본 지역 한 곳
  if (!nm) return null;
  return { name: shortOf(d.region_name.ko), full: d.region_name.ko, wide: true };
}

/* ═══ XI맵 착지 — XI맵(xi-clean)이 `?region=` 을 푸는 바로 그 경계 파일(전국 시군구)의 code 로 푼다 ═══
   /regions 코드(S-3)는 새 시도 코드라 XI맵 경계 파일 code 와 다를 수 있다(서버·xi-clean 티켓) → 화면은 경계 파일 code 만 링크에 쓴다.
   ① 배포본 sgg_cd 가 경계 파일에 있으면 그것 ② 배포본 지역 이름 = 경계 '시도 시군구' ③ 결과가 실제로 놓인 시군구(결과 점이 가장 많이 든 곳)
   ④ 배포 구역 가운데. 못 풀면 null → `이 서비스 열기` 대신 `자세히` 만 둔다(죽은 버튼 0). */
const SGG_URL = '/landxi/assets/data/geo/sigungu.geojson';
let SGG = null;
function sggIndex() {
  if (!SGG) SGG = retry('sigungu', () => getJson(SGG_URL), { timeout: 15000 }).then((fc) => (fc.features || []).map((f) => {
    const g = f.geometry, p = f.properties || {};
    const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return { code: String(p.code), name: p.name, sido: p.sido, full: `${p.sido} ${p.name}`, bbox: bboxOf(f), polys };
  })).catch((e) => { SGG = null; throw e; });
  return SGG;
}
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inFeat = (pt, f) => inBox(pt, f.bbox) && f.polys.some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));

async function landingOf(c) {
  const fs = await sggIndex();
  const d = c.deploy;
  if (d.sgg_cd) { const f = fs.find((x) => x.code === String(d.sgg_cd)); if (f) return f; }
  const nm = nz(d.region_name?.ko);
  const byName = nm && fs.find((x) => nz(x.full) === nm);
  if (byName) return byName;
  const r = await loadResult(c);
  const pts = r?.pts?.length ? r.pts.map((p) => p.geometry.coordinates) : [];
  const tally = new Map();
  for (const p of pts) { const f = fs.find((x) => inFeat(p, x)); if (f) tally.set(f, (tally.get(f) || 0) + 1); }
  const best = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  return fs.find((x) => inFeat(c.center, x)) || null;
}

/** 화면 한 벌 — 카드·배포본이 오면 곧바로 돌려주고, 지역·성과 띠·착지 코드는 짧게(2.5s) 기다린 뒤 늦은 것은 onLate(D)로 채운다 */
export async function load({ onLate } = {}) {
  // 지역·성과 띠·경계는 배포본과 상관없다 — 느린 /deploys 를 기다리지 않고 나란히 부른다
  const regionsP = retryLate('regions', regionsLoad, { tries: 1, timeout: 60000 });
  const bandP = retryLate('band', surveyBand, { tries: 1, timeout: 60000 });
  sggIndex().catch(() => {});
  regionsP.catch(() => {}); bandP.catch(() => {});
  // 카탈로그 진열 = 명세 S-6 `?public=1`(실결과가 있는 배포본의 카드만) · 상태·수 = 요약(summary) 한 출처
  const [cardsR, dep, sum] = await Promise.all([retry('cards', () => api('/registry/cards?public=1')), deploysWithResults(), loadSummary()]);
  const cards = (cardsR.items || []).filter((c) => c.scope !== 'global').map((c) => ({ ...c, name: userWords(c.name) }));
  const live = dep.items.filter(hasResult);

  // ① 서비스 — 실배포·실결과가 있는 카드만(K7). 결과 없는 카드는 진열하지 않는다(빈 카드 0) · 하나도 없을 때만 K9 한 장
  //   숫자·상태 칩은 요약에서(요약이 없으면 숫자 없이 배포 단계만 — 배포 기록의 수를 숫자 자리에 쓰지 않는다)
  const RANK = { ga: 0, pilot: 1, none: 2 };
  const rows = joinCards(cards, live).filter((r) => hasResult(r.deploy)).map((r) => {
    const it = sum ? itemFor(sum, r.card.id, r.deploy) : null;
    return { ...r, item: it, state: it ? stageKey(it.stage) || 'none' : sum ? 'none' : r.state, deploy: { ...r.deploy, scale: it ? scaleOf(it) : null }, src: r.deploy.scale };
  }).filter((r) => r.state !== 'none')
    .sort((a, b) => (RANK[a.state] - RANK[b.state]) || ((+b.deploy.scale?.value || 0) - (+a.deploy.scale?.value || 0)));
  const pending = cards.filter((c) => !rows.some((r) => r.card.id === c.id));

  // ② 활용 사례 — 실결과 배포본 하나 = 사례 하나 · 고정 먼저 · 앞 사례와 다른 지역이 이어지게(순서는 한 번 정하면 늦은 채움에도 그대로)
  const cs = live.map((d) => {
    const bb = bboxOf(d.aoi);
    const card = cards.find((c) => c.id === d.card_id);
    const short = shortOf(d.region_name?.ko);
    return {
      id: d.id, deploy: d, card, cardName: userWords(card?.name || d.name), item: sum ? itemFor(sum, d.card_id, d, { strict: true }) : null, region: short, short, profile: d.region_profile, year: d.year, pinned: !!d.pinned,
      bbox: bb, center: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], src: d.scale.source, stats: [], xi: null, parcel: parcelMod(d),
    };
  }).sort((a, b) => (b.pinned - a.pinned) || (b.parcel - a.parcel) || (+b.deploy.scale.value - +a.deploy.scale.value));
  const cases = [];
  while (cs.length) { const last = cases.at(-1); const k = cs.findIndex((c) => !last || c.profile !== last.profile); cases.push(cs.splice(k < 0 ? 0 : k, 1)[0]); }

  const D = {
    cards, rows, pending, cases, pins: [], regions: [], band: null, asOf: dep.as_of,
    where: (d) => { const c = cases.find((x) => x.id === d?.id); return c ? { name: c.region } : null; },
    xiOf: (d) => cases.find((x) => x.id === d?.id)?.xi || null,
  };
  // 표기 지역 · 성과 띠 · 착지 — 온 만큼 사례에 적는다(여러 번 불려도 같은 결과)
  const apply = () => {
    for (const c of cases) {
      const rg = pickRegion(D.regions, c.deploy);
      const sumName = shortOf(c.item?.region_name);   // 요약 항목의 지역(메인 · 서비스 상세와 같은 이름) 먼저
      if (sumName) { c.region = sumName; c.short = sumName; }
      else if (rg?.name) { c.region = rg.name; c.short = rg.name; }
      const covered = D.band && inBox(c.center, D.band.cover) && c.parcel;
      // 업무 결과(실태조사 기록)가 없는 사례는 띠 없이 — AI 결과 수는 카드(K7)에만.
      // '현장 확인 필요'는 요약(summary)의 그 사례 항목 값(모든 화면 같은 값) · 요약에 값이 없으면 그 칸을 뺀다
      const need = metric(c.item, 'field_check');
      c.stats = covered ? D.band.stats.map((x) => (x.key === 'field_check' ? (sum ? (need ? { ...x, env: need } : null) : x) : x)).filter((x) => x && x.env) : [];
    }
    D.pins = [];
    for (const c of cases) if (!D.pins.some((p) => p.profile === c.profile)) D.pins.push({ profile: c.profile, short: c.short });
  };
  apply();

  let first = true;
  const late = () => { apply(); if (!first) onLate?.(D); };
  const jobs = [
    regionsP.then((r) => { D.regions = r || []; late(); }).catch(() => {}),
    bandP.then((b) => { D.band = b; late(); }).catch(() => {}),
    ...cases.map((c) => landingOf(c).catch(() => landingOf(c)).then((f) => { c.xi = f ? { code: f.code, name: f.name } : null; late(); }).catch(() => {})),
  ];
  await Promise.race([Promise.all(jobs), sleep(2500)]);
  first = false; apply();
  D.settled = Promise.all(jobs);
  return D;
}

/* 결과 모양(서→동 차오름용 점 + 면) — 한 번만 받는다(실패는 캐시하지 않고 다음에 다시) */
const cache = new Map();
function centroid(g) {
  let x = 0, y = 0, n = 0;
  const walk = (c) => { if (typeof c[0] === 'number') { x += c[0]; y += c[1]; n++; } else c.forEach(walk); };
  walk(g.coordinates); return n ? [x / n, y / n] : null;
}
export function loadResult(c) {
  if (!cache.has(c.id)) {
    const u = geoUrl(c.src);
    const p = !u ? Promise.resolve(null) : retry('result', () => getJson(u), { timeout: 15000 }).then((fc) => {
      if (!fc?.features?.length) return null;
      const pts = fc.features.map((f) => { const q = f.geometry && centroid(f.geometry); return q && { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: q } }; }).filter(Boolean);
      pts.sort((a, b) => a.geometry.coordinates[0] - b.geometry.coordinates[0]);
      return { fc, pts, bbox: bboxOf(fc) };
    }).catch(() => { cache.delete(c.id); return null; });
    cache.set(c.id, p);
  }
  return cache.get(c.id);
}
