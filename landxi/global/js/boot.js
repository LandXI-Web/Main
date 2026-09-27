/* Land-XI Global — 부트 · 장면 기계 · 투어
   ?tenant=kgz-agri|kgz-land|lx · svc=<deploy_id> · job=<job_id> · locale=en|ko · build=lx|tenant|public|export · from=namwon · tour=1
   두 모드(계약 §1): on = 게이트웨이(또는 F1-D 하니스 · localStorage.lx_api_base) · off = 픽스처 + 리플레이. 콘솔 오류 0.
   F2-D(1차 판정 must_fix 3 · 4 · 6①): 남원 진입은 후퇴 경로만 받고 출발(ready→후퇴 ≤ 5 s) · 두 하강 경로는 글로브 체류와 비행에 겹쳐 받는다 ·
   착지 즉시 카드(≤ 500 ms) · 경유점 정지 ≤ 500 · 히어로·목록은 후퇴가 z ≤ 3 에 닿은 뒤 등장.
   F2-D 2차(판정 불합격 8건): 게이트 = 후퇴 첫 1 s 에 보이는 타일(V-World z ≥ 7 · EOX z ≤ 8 짝수 줌 · GIBS) · 상한 3.5 s ·
   대표 하강(글로브→으슥아타) EOX 경로는 준비 즉시 prio 1 로 HTTP 캐시에(착지 직후 눌러도 부족 ≥ 2 > 500 ms 0 · 데우기 대기 0) ·
   히어로는 글로브 원판이 히어로·목록 열과 겹치지 않을 때 · 재방문 표식 = 착지 화면 타일 수신 · XI맵 링크에 ?job= 을 붙이지 않는다. */
import { API, probe, session, mastLabel, fixture } from '/landxi/shared/api-v1.js';
import { initI18n, t, applyStatic } from './i18n.js';
import { D, createStage, styleReady, idle, fly, ease, wait, addGibs, dateScrubber, addCountries, countryList, prov, pin, clearPins, clearLocks, perfOf, ensureMapB, prefetchFlight, flySamples, tilesFor, pull, warmInMap, warmCams, tileDeficit, arriveCross, prepCross, reduced, dcTrim, dcHold } from './globe-stage.js';
import { loadCatalog, addLadder, ladderChip, show, opacity, rawTiles } from './ladder-global.js';
import { loadDeploys } from './cards-global.js';
import { ysykataScene, loadYsData, CAM_YS } from './ndvi-theater.js';
import { sprawlScene, loadSprawl, CAM_SK, CAM_SK_BLD, swipeSpecs } from './sprawl.js';
import { meiktilaScene, loadMeiktila, CAM_MK, CAM_MK_DETAIL } from './disaster-swipe.js';

const q = new URLSearchParams(location.search);
const root = document.getElementById('root');
const DATA = new URL('../data/', import.meta.url);
const CAM_GLOBE = { center: [84, 12], zoom: +(1.8 + Math.log2(Math.max(600, innerHeight) / 900)).toFixed(2), pitch: 0, bearing: 0, padding: { top: 132, right: 352, bottom: 0, left: 470 } };
const CAM_NAMWON = { center: [127.39, 35.415], zoom: 12.3, pitch: 0, bearing: 0 };
const PAD_REGION = { top: 64, right: 0, bottom: 0, left: 380 };
// 글로브 경유점 = 글로브 카메라 그대로(판정 3차: 경유 z 2.4 → 메이크틸라 곡률 0.67 s · 재방문(글로브 출발)과 첫 방문(경유 출발)의 하강 경로가 달라
// EOX 342 장이 다시 나갔다) → 모든 하강이 같은 출발 카메라 = 같은 경로 타일(한 번 받으면 재방문 네트워크 0).
const CAM_TRANSIT = CAM_GLOBE;
/** 히어로 · 사업국 목록 — 글로브 투영 원판이 히어로 열(x ≤ 440)·목록 열(x ≥ 1068)과 겹치지 않을 때만(판정 2차: z 3 에서 원판 ≈ 2,000 px 가
    H1·목록 뒤로 비쳤다). 원판 = 지금 카메라 중심에서 70–90° 떨어진 점들의 투영 최대 반경(원근 포함 · 실측). */
const HERO_COL = 440, LIST_COL = 1068;
function discBox(map) {
  const c = map.getCenter(), p0 = map.project(c), R = Math.PI / 180;
  let r = 0;
  for (const brg of [0, 90, 180, 270]) for (let d = 70; d <= 90; d += 2) {
    const la1 = c.lat * R, lo1 = c.lng * R, dd = d * R, b = brg * R;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(dd) + Math.cos(la1) * Math.sin(dd) * Math.cos(b));
    const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(dd) * Math.cos(la1), Math.cos(dd) - Math.sin(la1) * Math.sin(la2));
    const p = map.project([((lo2 / R + 540) % 360) - 180, Math.max(-85, Math.min(85, la2 / R))]);
    if (isFinite(p.x) && isFinite(p.y)) r = Math.max(r, Math.hypot(p.x - p0.x, p.y - p0.y));
  }
  return { x0: p0.x - r, x1: p0.x + r, y0: p0.y - r, y1: p0.y + r, r };
}
const discClear = (map) => { const b = discBox(map); return b.x0 >= HERO_COL && b.x1 <= Math.min(LIST_COL, innerWidth); };
// 남원 진입은 첫 칠부터 남원 장면(글로브 제목·목록이 회색 바탕 위에 번쩍이지 않게)
if (q.get('from') === 'namwon') root.dataset.scene = 'namwon';

/* 재방문 표식 — 하강 경로를 한 번 받은 장면(EOX max-age 7 d · 이 브라우저 HTTP 캐시)은 머리 출발 대기 0.
   숫자·결과가 아니라 대기 여부만 정한다(저장 실패 = 첫 방문처럼 380 머리 출발). */
const PF_KEY = 'lx_f2d_pf', PF_TTL = 6 * 86400000;
const pfSeen = (k) => { try { const m = JSON.parse(localStorage.getItem(PF_KEY) || '{}'); return !!m[k] && Date.now() - m[k] < PF_TTL; } catch { return false; } };
const pfMark = (k) => { try { const m = JSON.parse(localStorage.getItem(PF_KEY) || '{}'); m[k] = Date.now(); localStorage.setItem(PF_KEY, JSON.stringify(m)); } catch { /* 저장소 없음 */ } };

async function main() {
  const t0 = performance.now();
  // ── 세션 · 테넌트 · 빌드(계약 §3 · §4.1) ───────────────────────────
  await probe();
  const sh = session.shadow();
  const realm = sh.realm;
  const tenant = realm === 'tenant' ? sh.tenant_id : realm === 'lx' ? (q.get('tenant') || 'lx') : 'guest';
  const build = q.get('build') || (realm === null ? 'public' : realm === 'tenant' ? 'tenant' : 'lx');
  const locale = await initI18n(q, tenant);
  applyStatic();

  const [lx, cat, deploys, ys, sprawl, mk, rep] = await Promise.all([
    fixture(new URL('lx-countries.json', DATA)), loadCatalog(build, locale), loadDeploys(tenant === 'guest' ? null : tenant), loadYsData(), loadSprawl(), loadMeiktila(),
    fetch(new URL('replay/gj1-ysykata.ndjson', DATA), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);
  const lines = rep.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const totalMs = lines.length ? lines[lines.length - 1].t : 0;

  // ── 마스트 ─────────────────────────────────────────────────────────
  document.getElementById('tenant-chip').textContent = tenant === 'guest' ? t('tenant.guest') : t('tenant.' + tenant) + (build !== 'lx' ? ` · build=${build}` : '');
  const mode = document.getElementById('mode-chip');
  const setMode = () => {
    const on = API.mode === 'on';
    mode.dataset.kind = on ? 'live' : 'demo';
    mode.querySelector('span').textContent = on ? t('mode.live', { what: (probe.cache?.health?.harness ? 'F1-D harness ' + API.base.replace(/^https?:\/\//, '') : 'gateway ' + API.base.replace(/^https?:\/\//, '')) }) : mastLabel(locale);
  };
  const pr = await probe(); probe.cache = pr; setMode();
  root.addEventListener('f1d:mode', setMode);
  document.querySelectorAll('#lang a').forEach((a) => { a.setAttribute('aria-current', String(a.dataset.l === locale)); const u = new URL(location.href); u.searchParams.set('locale', a.dataset.l); a.href = u.search; });
  document.getElementById('list-sub').textContent = t('list.sub', { n: lx.countries.length });
  document.getElementById('hero-prov').appendChild(prov(lx.count, `<span>${lx.fetched_at.slice(0, 10)}</span>`));

  // ── 지도 ───────────────────────────────────────────────────────────
  const fromNamwon = q.get('from') === 'namwon';
  const stage = createStage(root, fromNamwon ? CAM_NAMWON : CAM_GLOBE);
  const { map } = stage;
  await styleReady(map);
  stage.gibs = addGibs(map);
  const ladder = await addLadder(map, cat);
  addCountries(map, lx);
  // EOX 가 4 부터 불투명 → GIBS 는 5 위에서 받지 않는다(가려진 타일 요청 0 · 글로브 타일이 캐시에서 밀려나지 않게)
  if (ladder.base) ['gibs-bm', 'gibs-a', 'gibs-b'].forEach((id) => map.setLayerZoomRange(id, 0, 5));
  const chip = ladderChip(stage, ladder, document.getElementById('ladder'));
  map.on('zoom', chip.render);
  const ctx = { lx, cat, deploys, ys, sprawl, mk, ladder, chip, tenant, build, realm, replaySpeed: totalMs ? totalMs / 8000 : 1, replayMeta: { date: lines[0]?.data?.at?.slice(0, 10) || '2026-09-24', total_ms: totalMs } };
  const scenes = { ys: ysykataScene(stage, ctx), sk: sprawlScene(stage, ctx), mk: meiktilaScene(stage, ctx) };
  const scrubber = dateScrubber(stage, stage.gibs, document.getElementById('date'));
  countryList(stage, lx, document.getElementById('list'), (s) => go(s));
  // 국내 XI맵 링크 — ?job= 을 붙이지 않는다(판정 2차: XI맵이 글로벌 index 작업 id 를 받으면 남원 계보를 보여 준다 = 죽은 딥링크).
  // XI맵이 kind=index · dp-kgz-* 작업을 복원하면(F2-A 요청 · 결과 문서 §5) 그때 다시 붙인다. 관제 계보는 카드의 'Ops lineage →'(실링크).

  // ── 선명한 하강: 경로 타일 미리 받기 ─────────────────────────────────
  const pfEl = document.getElementById('pf');
  const baseSpecs = [ladder.base && { id: ladder.base, from: 2.8 }, { id: 'xdworld-satellite', from: 5 }].filter(Boolean);
  const pfLog = (window.__f1dPf ||= []);
  // ── 비행 대역(두 번째 지도 GPU 데우기) 폐기 — F2-D 2차 판정: 대역이 데워지기 전(캠 8 개 5.4 s)에 누르면 부족 ≥ 2 가 1.6–1.7 s ·
  // 판정 영상은 그 대기(19 s)를 잘라 냈다. 실측(logs/exp-*.json): 하강 경로 타일이 HTTP 캐시에 다 있으면 본 지도 혼자 부족 ≥ 2 최장 ≈ 200 ms
  // (으슥아타) · 370 ms(메이크틸라 Δz 11.5) → 대역 대신 '비행이 지나는 순서(짝수 줌 먼저)'의 HTTP 캐시 선행만 쓴다(preYs · bgPrefetch · 의도).
  /** 하강 — 경로 미리 받기는 비행과 겹친다(판정 1차 must_fix 4 · 칩 3.0–4.4 s 대기 → 0).
      첫 방문만 머리 출발 D[380](칩 없음 · 궤적 앞 1 s 는 이미 받은 글로브 줌) · 재방문은 0. 착지 즉시 반환(타일 idle 을 기다리지 않는다). */
  async function descend(cam, dur, key, opt = {}) {
    if (reduced()) return fly(map, cam, dur);   // 움직임 줄이기 = 즉시 점프(비행 경로가 없으니 미리 받기·대기 없음)
    const tp = performance.now(), rec = { to: cam.center, key, revisit: pfSeen(key), leg_ready: legReady(key) };
    pfLog.push(rec);
    // 비행이 지나는 순서(짝수 줌 먼저 · 착지 줌 맨 뒤 — 판정 2차: 도착 화면부터 받으면 z4–8 이 늦어 부족 ≥ 2 가 1.6 s)
    const p = prefetchFlight(map, cam, [...baseSpecs, ...(opt.extra || [])], { conc: 8, from: opt.from || null, order: 'need' });
    p.then((r) => { Object.assign(rec, r, { pull_ms: r.ms }); }).catch(() => {});
    await Promise.race([p, wait(rec.revisit || rec.leg_ready ? 0 : D[380])]);   // 배경 다리가 이미 받았으면 머리 출발 대기 0
    rec.head_ms = Math.round(performance.now() - tp);
    await fly(map, cam, dur);
    landMark(key, rec);
  }
  /** 재방문 표식 = 착지 화면 타일 수신(판정 2차: 경로 98 % 조건은 1.5 s 보고 떠나면 표식 0 → 재방문 hold 381). 대기 여부만 정한다. */
  function landMark(key, rec) {
    const tl = performance.now(), ids = [ladder.base, key === 'meiktila' && 'mk-pre'].filter((id) => id && map.getSource(id));
    const f = () => {
      if (cur !== key) return;   // 떠났으면 표식 없음(착지 화면을 다 받지 못함)
      if (ids.every((id) => map.isSourceLoaded(id))) { pfMark(key); if (rec) rec.land_tiles_ms = Math.round(performance.now() - tl); return; }
      if (performance.now() - tl < D[2400] * 4) setTimeout(f, D[120]);
    };
    setTimeout(f, D[120]);
  }
  // 무거운 도착 원천(PC 월별 모자이크 · NDVI 지수 · 스와이프 모자이크)은 투어 부트 뒤 배경에서 미리(병렬 4 · 도착 전 캐시)
  const bgPrefetch = async () => {
    const at = (cam) => [{ ...flySamples(map, cam, { n: 1, from: cam })[1] }];
    const R = (c) => ({ ...c, padding: PAD_REGION });
    // 하강 경로 EOX 는 투어와 무관하게 prefetchNext(착지 idle 뒤 다음 다리)가 받는다 — 여기서는 소쿨룩 건물 줌 다리와 도착 원천만
    await pull(tilesFor(map, flySamples(map, R(CAM_SK_BLD), { from: R(CAM_SK), mode: 'ease', n: 48 }), baseSpecs, { order: 'need' }), { conc: 8, prio: 2, gate: bgGate });
    window.__f1dBg = { legs: 1, at: Math.round(performance.now()) };
    const cur = ['2025-06', '2025-03', '2025-04', '2025-05', '2025-07', '2025-08', '2025-09', '2025-10'];
    const ys = at({ ...CAM_YS, padding: PAD_REGION });
    await pull(tilesFor(map, ys, cur.map((m) => ({ id: 'pc-' + m, final: true }))), { conc: 4 });
    await pull(tilesFor(map, at({ ...CAM_SK_BLD, padding: PAD_REGION }), swipeSpecs(ctx)), { conc: 4 });
    await pull(tilesFor(map, ys, cur.map((m) => ({ id: 'ndvi-' + m, final: true }))), { conc: 4 });
  };

  /* ── 다음 하강 미리 받기(판정 3차 · 사용자 페이스) — 투어 여부와 무관하게, 지금 장면에 착지해 타일 idle 이 되면
     다음에 누를 수 있는 하강 다리를 prio 2(배경 · 비행 중엔 멈춤)로 HTTP 캐시에 받는다. 다리마다 착지 화면 먼저 → 비행 경로(짝수 줌 먼저).
     모든 하강은 같은 출발 카메라(CAM_GLOBE = 경유점)라 다리 = 글로브 → 장면 하나씩 · 키르기스 두 장면 사이는 짧은 다리. */
  const RG = (c) => ({ ...c, padding: PAD_REGION });
  const LEGS = { mk: [CAM_GLOBE, RG(CAM_MK)], ys: [CAM_GLOBE, RG(CAM_YS)], sk: [CAM_GLOBE, RG(CAM_SK)], ys2sk: [RG(CAM_YS), RG(CAM_SK)], sk2ys: [RG(CAM_SK), RG(CAM_YS)] };
  // 다음에 누를 수 있는 다리만(글로브 → 소쿨룩은 으슥아타 다리와 z ≤ 8 이 겹치고 두 장면 사이는 짧은 다리가 받는다 — 공개 원천 부하 ↓)
  const NEXT = { globe: ['ys', 'mk'], ysykata: ['mk', 'ys2sk'], sokuluk: ['mk', 'sk2ys'], meiktila: ['mk', 'ys'] };   // 메이크틸라의 'mk' = 착지 뒤 경로 마저(재방문 네트워크 0)
  // 경로 명세는 EOX 전 줌(글로브 출발 z3 포함 — 지도가 글로브에서 받는 조상 타일도 저장소에 · 재방문 네트워크 0)
  const legSpecs = [ladder.base && { id: ladder.base }, { id: 'xdworld-satellite', from: 5 }].filter(Boolean);
  const legUrls = (k) => { const [a, b] = LEGS[k]; return { land: tilesFor(map, flySamples(map, b, { n: 1, from: b }).slice(-1), legSpecs), path: tilesFor(map, flySamples(map, b, { from: a, n: 96 }), legSpecs, { order: 'need' }) }; };
  const bgGate = () => (stage.flying ? new Promise((r) => { const f = () => (stage.flying ? setTimeout(f, D[120]) : r()); f(); }) : null);
  const legDone = new Set(), nextLog = (window.__f2dNext ||= []);
  const legReady = (s) => legDone.has({ ysykata: 'ys', sokuluk: 'sk', meiktila: 'mk' }[s]);
  let nextQ = Promise.resolve();
  function prefetchNext(scene) {
    if (reduced() || !ladder.base) return nextQ;
    return (nextQ = nextQ.then(async () => {
      await idle(map, D[2400]);   // 지금 착지 화면이 먼저
      for (const k of NEXT[scene] || []) {
        if (legDone.has(k)) continue;
        const t1 = performance.now(), { land, path } = legUrls(k);
        const a = await pull(land, { conc: 24, prio: 2, gate: bgGate });
        const b = await pull(path, { conc: 24, prio: 2, gate: bgGate });
        if (a.ok === a.tiles && b.ok === b.tiles) legDone.add(k);
        nextLog.push({ leg: k, after: scene, land: land.length, path: path.length, ok: a.ok + b.ok, ms: Math.round(performance.now() - t1), at: Math.round(t1) });
      }
    }).catch(() => {}));
  }
  // 손을 올릴 때(의도) — 그 하강 다리를 prio 1 로 앞당긴다(배경 다리보다 먼저 · 착지 화면 먼저)
  const intentLeg = { ysykata: 'ys', sokuluk: 'sk', meiktila: 'mk' };
  const intent = (s) => {
    const k = intentLeg[s]; if (!k || s === cur || legDone.has(k) || reduced()) return;
    const leg = cur === 'ysykata' && k === 'sk' ? 'ys2sk' : cur === 'sokuluk' && k === 'ys' ? 'sk2ys' : k;
    const { land, path } = legUrls(leg);
    pull(land, { conc: 24, prio: 1 }).then(() => pull(path, { conc: 24, prio: 1 })).catch(() => {});
  };
  document.getElementById('scenes').addEventListener('pointerenter', (e) => { const b = e.target.closest && e.target.closest('button[data-scene]'); if (b) intent(b.dataset.scene); }, true);
  document.getElementById('list').addEventListener('pointerenter', (e) => { const r = e.target.closest && e.target.closest('.gs-row[data-open]'); if (r) intent(r.dataset.open); }, true);

  // ── 장면 기계(같은 지도 · 카메라 이동만) ──────────────────────────
  let namwonPf = null, standIn = null;
  let cur = fromNamwon ? 'namwon' : 'globe';
  root.dataset.scene = cur;
  const navBtns = document.querySelectorAll('#scenes button');
  const mark = (s) => navBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.scene === s)));
  mark(cur);
  function leaveAll() {
    scenes.ys.leave(); scenes.sk.leave(); scenes.mk.leave();
    clearPins(stage); clearLocks(stage);
    const cardEl = document.getElementById('card'); cardEl.hidden = true; cardEl.scrollTop = 0;
    delete root.dataset.swipe;
    if (map.getLayer('mk-pre')) show(map, 'mk-pre', false);
  }
  /** 히어로 · 목록 — 후퇴 비행이 z ≤ 3(순백 위 글로브)에 닿은 뒤에만 'globe' 장면(g-in 500). 그 전엔 'retreat'(둘 다 숨김). */
  function heroAtZ3() {
    root.dataset.scene = 'retreat';
    const f = () => { if (cur !== 'globe') return map.off('zoom', f); if (map.getZoom() <= 3 && discClear(map)) { map.off('zoom', f); root.dataset.scene = 'globe'; const b = discBox(map); (window.__f2dHero ||= []).push({ t: Math.round(performance.now()), z: +map.getZoom().toFixed(2), disc: [Math.round(b.x0), Math.round(b.x1)] }); } };
    map.on('zoom', f);
    return () => { map.off('zoom', f); if (cur === 'globe') root.dataset.scene = 'globe'; };
  }
  /** 클릭 경로 실측(판정 1차 must_fix 4) — 클릭 → 비행 시작 → 착지 → 카드. */
  const clicks = (window.__f2dClicks ||= []);
  const allowed = (s) => tenant === 'lx' || tenant === 'guest' || s === 'globe' || (tenant === 'kgz-agri' && s === 'ysykata') || (tenant === 'kgz-land' && s === 'sokuluk');
  /** 장면 이동 — 도는 동안 비행 대역 데우기 정지(stage.flying). */
  async function go(s, opt = {}) {
    if (!allowed(s)) return;
    stage.flying = true; dcHold(true);   // 비행 중 영속 캐시 저장 멈춤(지도 타일 읽기 우선)
    try { return await goRun(s, opt); } finally { stage.flying = false; dcHold(false); prefetchNext(cur); }
  }
  async function goRun(s, opt = {}) {
    if (s === cur && !opt.force) return;
    const rec = { scene: s, from: cur, t0: Math.round(performance.now()), revisit: pfSeen(s) };
    if (namwonPf) { await namwonPf; rec.boot_wait = Math.round(performance.now() - rec.t0); }   // 남원 진입 후퇴 경로 받기 중이면 끝난 뒤(칩이 보이는 대기)
    const prev = cur; cur = s; mark(s);
    leaveAll();
    clicks.push(rec);
    const landed = () => { rec.land = Math.round(performance.now() - rec.t0); };
    const carded = () => { rec.card = Math.round(performance.now() - rec.t0); rec.land_to_card = rec.card - rec.land; };
    if (s === 'globe') {
      stage.inKgz = false; chip.set(null);
      const done = heroAtZ3();
      await fly(map, CAM_GLOBE, D[2400]);
      done(); landed(); carded();
      return;
    }
    root.dataset.scene = s;
    // 대륙 간(미얀마 → 키르기스스탄)은 글로브 경유 두 비행(각 --e-fly · 100 ms 당 Δz ≤ 1.5) — 한 번의 flyTo 는 z 13.9 → ≈ 5 → 10 을 2400 에 넣어 1.76
    if ((s === 'ysykata' || s === 'sokuluk') && prev === 'meiktila' && !reduced()) { root.dataset.scene = 'transit'; await fly(map, CAM_TRANSIT, D[2400]); root.dataset.scene = s; }
    if (s === 'ysykata') {
      stage.inKgz = true;
      await descend({ ...CAM_YS, padding: PAD_REGION }, D[2400], s, { extra: [{ id: ladder.months['2025-06'], final: true }] });   // 착지 화면의 PC 월 모자이크까지
      landed();
      const p = scenes.ys.enter(opt); carded();   // 카드는 enter 의 동기 구간에서 이미 올라왔다(내용 준비됨)
      await p;
      scenes.ys.renderScrub();
      return;
    }
    if (s === 'sokuluk') {
      stage.inKgz = true;
      scenes.sk.prepB().catch(() => {});
      await descend({ ...CAM_SK, padding: PAD_REGION }, prev === 'ysykata' ? D[1600] : D[2400], s);
      landed();
      const p = scenes.sk.enter(); carded();
      await p;
      return;
    }
    if (s === 'meiktila') {
      const prep = scenes.mk.prepare();
      const camMk = { ...CAM_MK, padding: PAD_REGION }, cover = (B, on) => scenes.mk.coverLayers(B, on);
      if (reduced()) { if (prev !== 'globe') await fly(map, CAM_TRANSIT, D[2400]); await prep; show(map, 'mk-pre', true); await fly(map, camMk, D[2400]); landed(); scenes.mk.enter(); carded(); return; }
      // 도착 화면 준비(두 번째 지도) · 하강 경로 미리 받기를 경유 비행과 완전히 겹친다(판정 1차 must_fix 4② · 경유점 정지 ≤ 500)
      const ready = prep.then(() => prepCross(stage, camMk, cover));
      const pfMk = prefetchFlight(map, camMk, baseSpecs, { from: prev !== 'globe' ? CAM_TRANSIT : null, conc: 8, order: 'need' });
      const pfRec = { to: camMk.center, key: s, revisit: pfSeen(s), leg_ready: legReady(s) }; pfLog.push(pfRec);
      pfMk.then((r) => { Object.assign(pfRec, r, { pull_ms: r.ms }); }).catch(() => {});
      prep.then(() => { if (cur === 'meiktila') show(map, 'mk-pre', true); });
      // 스와이프 사후 층(두 번째 지도 b-maxar · export/게스트 = S2 T46QGJ 사후 그래뉼 · PC 1 h 캐시)과 사전 층(mk-pre)의 착지 · 세부 화면 타일을
      // 하강과 겹쳐 HTTP 캐시에(판정 3차: export 에서 swipeOn 직후 0.5–1.5 s 오른쪽 빈 화면 · deficitB 99) — 켜면 캐시에서 ≤ 500 ms 안에 찬다
      const warmPost = prep.then(() => {
        const B = stage.mapB, bs = B ? B.getStyle().sources : {};
        const specs = [...['b-maxar', 'b-base'].filter((id) => bs[id]).map((id) => ({ src: bs[id], final: true })), map.getSource('mk-pre') && { id: 'mk-pre', final: true }].filter(Boolean);
        const at = (c) => tilesFor(map, flySamples(map, c, { n: 1, from: c }).slice(-1), specs);
        return pull([...new Set([...at(camMk), ...at(RG(CAM_MK_DETAIL))])], { conc: 8, prio: 1 });
      }).then((r) => { pfRec.post = r; }).catch(() => {});
      stage.warmPost = warmPost;
      if (prev !== 'globe') {
        root.dataset.scene = 'transit';
        await fly(map, CAM_TRANSIT, D[2400]);   // 장거리 --e-fly(곡률이 보이는 글로브까지)
        root.dataset.scene = s;
      }
      const tw = performance.now();
      // 경유점(또는 글로브) 정지 — 준비·미리 받기가 남았으면 최대 D[380] 만 더(비행 동안 이미 받았다)
      await Promise.race([Promise.all([prep, pfMk]), wait(pfRec.revisit || pfRec.leg_ready ? 0 : D[180])]);   // 머리 출발 180(3200 비행 · 클릭 → 카드 ≤ 3.5 s)
      const hold = Math.round(performance.now() - tw);
      (window.__f1dTransit ||= []).push({ hold_ms: hold, via: prev !== 'globe' ? 'transit' : 'globe' });
      rec.hold = hold;
      let land; const landedP = new Promise((r) => { land = r; });
      const crossing = arriveCross(stage, camMk, D[2400], cover, { move: fly, prepared: ready, at: 0.4, fade: [ladder.base, 'mk-pre', 'xdworld-satellite'].filter(Boolean), onLand: land });
      stage.crossing = crossing;
      await landedP;
      landed();
      landMark(s, pfRec);
      const p = scenes.mk.enter(); carded();   // 착지 즉시 카드 — 크로스페이드(0.5 m 완성 화면)는 뒤에서 이어진다
      await p;
    }
  }
  navBtns.forEach((b) => b.addEventListener('click', () => go(b.dataset.scene)));
  if (cur === 'namwon') {
    chip.set({ name: t('ladder.xd'), lic: t('lic.vworld') });
    pin(stage, CAM_NAMWON.center, `<b>Namwon</b><span class="g-cyr">${t('place.namwon')}</span>`, 'g-place');
  }

  // ── 준비 신호(첫 타일 idle 뒤 · 계약 §12) ─────────────────────────
  // 남원(한국 안 · z > 8)에서는 V-World 가 화면을 다 덮는다 → EOX 층을 꺼 두어 후퇴 첫 순간 V-World 요청이 EOX 와 줄 서지 않게.
  // V-World 는 z 8 → 7 에서 불투명도 1 → 0(ladder-global · 판정 2차: z7→5 에서 한국 밖 회색 무자료 타일 사각형) — 그 아래는 EOX.
  const KOREA_Z = 8.2;
  const eoxKorea = (hold) => {
    if (!ladder.base) return;
    const on = !hold || map.getZoom() <= KOREA_Z;
    map.setLayoutProperty(ladder.base, 'visibility', on ? 'visible' : 'none');
    if (!on && !eoxKorea.w) { eoxKorea.w = () => { if (map.getZoom() <= KOREA_Z) { map.setLayoutProperty(ladder.base, 'visibility', 'visible'); map.off('zoom', eoxKorea.w); eoxKorea.w = null; } }; map.on('zoom', eoxKorea.w); }
  };
  if (fromNamwon) eoxKorea(true);
  /** 게이트 상한 — 이 뒤엔 받은 만큼(조상 타일 · 부족 ≤ 1 짝수 줌 먼저)으로 출발(판정 2차: 478 장 전부 대기 = 5.5 s). */
  const GATE_MAX = 3500;
  if (fromNamwon) {
    // 남원 진입 게이트 = 후퇴 첫 1 s 에 보이는 타일 + 그 아래 줌의 조상(판정 2차 must_fix · 478 장 전부 5.5 s → 상한 3.5 s):
    //  ① V-World z12.3→7 화면 안(국내 · 메모리 lxm · ≈ 0.2 s) · GIBS z < 4(EOX 가 반투명인 줌만) · Blue Marble 착지 — pull(prio 0)
    //  ② EOX 는 짝수 타일 줌 3 카메라(z≈7.3 · 5.3 · 3.4 = 타일 8 · 6 · 4)를 본 지도가 직접 받아 GPU 에 올린다(대역 뒤 · 이웃 줌은 부모·자식 = 부족 ≤ 1).
    //     본 지도는 남원에 머물지 않으면 z12 에서 z3 조상이 없어 후퇴 z7→3 이 빈 구면(부족 99 · 800 ms 실측) — 그래서 이 3 장면만.
    //  두 하강 경로는 글로브 체류와 비행에 겹쳐 받는다(preYs · descend · go('meiktila')).
    standIn = (async () => {
      const B = ensureMapB(stage); await stage.mapBReady;
      stage.bHold = true; B.jumpTo(CAM_NAMWON);
      const vw = map.getStyle().sources['xdworld-satellite'];
      if (vw && !B.getSource('b-vw')) { B.addSource('b-vw', { type: 'raster', tiles: vw.tiles, tileSize: 256, minzoom: vw.minzoom, maxzoom: vw.maxzoom, bounds: vw.bounds }); B.addLayer({ id: 'b-vw', type: 'raster', source: 'b-vw', paint: { 'raster-fade-duration': 0 } }); }
      root.dataset.bcover = '1';
      await idle(B, D[2400] * 2);
    })();
    const specsR = [{ id: 'xdworld-satellite', from: 6.8 }, { id: 'gibs-a', to: 4 }, { id: 'gibs-bm', final: true }, ladder.base && { id: ladder.base, from: 2.8, to: KOREA_Z, even: true }].filter(Boolean);   // EOX 짝수 줌 경로 전체(HTTP 캐시) — 3 카메라 밖 경로 화면의 EOX·GIBS 조각보(판정 영상 z4–5) 0
    const tw = performance.now();
    namwonPf = standIn.then(async () => {
      const tr = performance.now();
      const pathR = flySamples(map, CAM_GLOBE, { n: 24 });
      const urls = tilesFor(map, pathR, specsR, { endFirst: true });   // 착지 글로브(가장 오래 보이는 화면)부터
      // 착지 글로브 카메라 먼저(GIBS z3 · 해빙층 — 판정 2차 후속 실측: 게이트 상한에 걸리면 착지 글로브 가장자리 타일이 1–2 s 비었다) → EOX 타일 줌 4 · 6 · 8
      const camsR = [{ ...CAM_GLOBE }, ...warmCams(pathR, { lo: 2.8, hi: KOREA_Z }).filter((c) => Math.round(c.zoom + 1) % 2 === 0).reverse()];
      const N = urls.length + camsR.length;
      pfEl.hidden = false;
      const prog = (a) => { pfEl.innerHTML = `<span>${t('pf.label')}</span><i style="--k:${Math.round((a / Math.max(1, N)) * 100)}%"></i><b>${a}/${N}</b>`; };
      let pa = 0, ca = 0; const step = () => prog(pa + ca);
      prog(0);
      const cap = wait(GATE_MAX).then(() => ({ capped: true }));
      const pulling = pull(urls, { conc: 20, prio: 0, onProgress: (a) => { pa = a; step(); } }).then((x) => ({ ...x, at: performance.now() }));
      stage.freeze = true;
      eoxKorea(false);
      const W = ['eox-s2cloudless-2025', 'gibs-a', 'gibs-bm', 'gibs-cap'].filter((id) => map.getSource(id));
      let alive = true; cap.then(() => { alive = false; });
      for (const [i, cam] of camsR.entries()) { if (!alive) break; await warmInMap(map, [cam], W, D[1250]); ca = i + 1; step(); }
      const warmMs = Math.round(performance.now() - tr);
      const r = await Promise.race([pulling, cap]);
      map.jumpTo(CAM_NAMWON);
      eoxKorea(true);
      stage.freeze = false; stage.onMove.forEach((f) => f());
      await idle(map, D[500]);
      root.dataset.bcover = '0';                  // 대역 → 본 지도(같은 화면 · 500) — 걷히는 동안 출발(--e-fly 첫 500 ms 는 z 0.3 미만)
      pfEl.hidden = true;
      wait(D[500]).then(() => { delete root.dataset.bcover; stage.bHold = false; if (stage.mapB.getLayer('b-vw')) stage.mapB.setLayoutProperty('b-vw', 'visibility', 'none'); });
      window.__f1dWarm = { tiles: urls.length, ok: r.ok ?? null, capped: !!r.capped, cams: camsR.length, cams_done: ca, warm_ms: warmMs, ms: Math.round(performance.now() - tw), ready_to_go_ms: Math.round(performance.now() - tr), gate_max: GATE_MAX };
      return r;
    });
  }
  // 대표 하강(글로브 → 으슥아타) EOX 경로 — 준비 즉시 prio 1(게이트 뒤 줄) · 비행이 지나는 순서(짝수 줌 먼저 · 착지 줌 맨 뒤) ·
  // 판정 2차: 착지 직후 눌러도 부족 ≥ 2 > 500 ms 구간 0(대역 데우기 5.4 s 대기 대신 · 실측 결과 문서 §1)
  const preYsP = !reduced() && ladder.base ? (async () => {
    const t1 = performance.now();
    const urls = tilesFor(map, flySamples(map, { ...CAM_YS, padding: PAD_REGION }, { n: 48, from: CAM_GLOBE }), [{ id: ladder.base, from: 2.8 }], { order: 'need' });
    const r = await pull(urls, { conc: 24, prio: 1 });
    return (window.__f2dPreYs = { ...r, ms: Math.round(performance.now() - t1), from: Math.round(t1) });
  })().catch(() => null) : Promise.resolve(null);
  stage.preYs = preYsP;
  if (q.get('tour') === '1') (namwonPf || Promise.resolve()).then(() => bgPrefetch()).catch(() => {});   // 후퇴 경로가 먼저(대역 다툼 0) · 도착 원천(PC · NDVI · 스와이프)
  if (!fromNamwon) preYsP.then(() => { if (cur === 'globe') prefetchNext('globe'); });   // 글로브 부트 — 대표 하강(preYs) 뒤 나머지 다리(남원 진입은 후퇴 착지 뒤 go 가 부른다)
  if (standIn) await standIn; else await idle(map, 8000);   // 첫 화면 타일 idle 뒤 준비(남원 진입은 대역 지도가 보이면 · 게이트는 칩으로 계속)
  document.documentElement.dataset.lx = 'ready';
  window.__f2dReady = Math.round(performance.now());
  setTimeout(() => dcTrim().then((r) => { window.__f2dDc = r; }).catch(() => {}), D[2400] * 4);   // 영속 타일 캐시 상한(오래된 것부터)
  window.__f1d = {
    stage, ctx, scenes, go, scrubber, tenant, build, realm, descend, pre: (cam, from = null, mode = 'fly') => prefetchFlight(map, cam, baseSpecs, { from, mode, conc: 6 }), tileDeficit: () => tileDeficit(map), tileDeficitB: () => (stage.mapB ? tileDeficit(stage.mapB) : null),
    prefetch: (cam, extra = [], opt = {}) => prefetchFlight(map, cam, [...baseSpecs, ...extra], { conc: 8, ...opt }),
    perf: (from = 0) => perfOf(stage, from), mark: () => stage.perf.length, cams: { globe: CAM_GLOBE, transit: CAM_TRANSIT, region: PAD_REGION, namwon: CAM_NAMWON },
    tools: { tilesFor, pull, flySamples, warmCams },
    state: () => ({ scene: cur, mode: API.mode, reason: API.reason, zoom: map.getZoom(), pitch: map.getPitch(), swipe: stage.swipeAt, ys: scenes.ys.S, errors: stage.errors.slice(-5), boot_ms: Math.round(performance.now() - t0) }),
  };

  // 서비스 딥링크(?svc=) · 작업 딥링크(?job= · 계약 v1.1-29 — 그 작업의 결과 절을 연다)
  const svc = q.get('svc'), job = q.get('job');
  if (job && allowed('ysykata')) go('ysykata').then(() => scenes.ys.openJob(job)).catch(() => {});
  else if (svc === 'dp-kgz-agri-farm-26') go('ysykata');
  if (svc === 'dp-kgz-land-change-26') go('sokuluk');
  if (svc === 'dp-mm-meiktila-25') go('meiktila');
  if (q.get('tour') === '1') tour(stage, scenes, go, scrubber, setMode, fromNamwon, namwonPf);
}

/* ── 판정 영상 투어(≈ 60 s + 대기 · 1440×900 · F2-D 브리프 표) ─────────── */
async function tour(stage, scenes, go, scrubber, setMode, fromNamwon, namwonPf) {
  const { map } = stage;
  const mark = (k) => { (window.__f1dMarks ||= []).push({ k, t: Math.round(performance.now()) }); };
  const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); return el; };
  window.__f1dTour = 'running';
  mark('ready');
  if (namwonPf) await namwonPf;   // 후퇴 경로 미리 받기(칩 'Pre-fetching imagery n/m') — 이것만이 출발 조건
  window.__f1dTour = 'rolling';
  mark('start');
  const F = window.__f1d;
  // 다음 하강 경로(글로브 → 으슥아타 · 착지 화면 먼저)를 후퇴 비행과 글로브 체류 동안 조용히 받는다 — 출발 조건 아님
  const preYs = F.prefetch({ ...CAM_YS, padding: PAD_REGION }, [{ id: 'pc-2025-06', final: true }], { from: F.cams.globe, order: 'need', prio: 1 });
  if (fromNamwon) {   // 0–6 s: 남원 V-World → 글로브 후퇴 2400(--e-fly) — 같은 지도 · 페이지 이동 0 · 히어로는 z ≤ 3 뒤
    stage.chip = null;
    clearPins(stage);
    await go('globe', { force: true });
  }
  mark('globe');
  await wait(D[1250]);
  await scrubber.set(scrubber.days[scrubber.days.length - 2]);   // 날짜 스크러버 한 칸(GIBS 타일 페이드 500) — 글로브 체류
  await wait(D[1000]);
  await scrubber.set(scrubber.days[scrubber.days.length - 1]);
  // 판정 2차: 데우기 대기 0(영상에서 잘라 낸 대기 없음) — 글로브 체류(날짜 두 칸 ≈ 2.3 s)만 두고 누른다. 대표 하강 경로는 준비 즉시 prio 1 로 받고 있다.
  window.__f2dTourWait = { ys_prefetch_done_at_click: await Promise.race([stage.preYs.then(() => true), wait(0).then(() => false)]) };
  mark('descend');
  // 6–12 s: Ysyk-Ata 클릭(목록 행) → --e-fly 2400 · 곡률 → 착지 즉시 카드
  const tc = performance.now();
  const pGo = new Promise((r) => { const iv = setInterval(() => { if (!document.getElementById('card').hidden && window.__f1d.state().scene === 'ysykata') { clearInterval(iv); r(); } }, 16); });
  click('.gs-row[data-open="ysykata"]') || go('ysykata');
  await pGo;
  mark('ysykata');
  (window.__f2dTourClick ||= []).push({ scene: 'ysykata', click_to_card_ms: Math.round(performance.now() - tc) });
  await wait(D[1250]);
  // 12–30 s: 프레임 → 견적(eta_s) → 실행 → 8칸 실도착(job.progress · 분포 막대) → job.done → 결과 절 · CSV · Ops lineage
  scenes.ys.frame();
  await wait(D[750]);
  await scenes.ys.quote();
  await wait(D[1250]);
  const done = new Promise((r) => stage.root.addEventListener('f1d:gj1-done', r, { once: true }));
  mark('run');
  click('#ys-run');
  await done;
  mark('gj1-done');
  await scenes.ys.S.filled;   // 분포(서버 /results/{set}/index) 채움까지
  const preSk = F.pre({ ...CAM_SK, padding: PAD_REGION });
  click('#ys-next [data-a="open"]');
  await wait(D[1250]);
  click('#ys-next [data-a="csv"]');
  mark('csv');
  await wait(D[1250]);
  mark('lineage');
  window.__f2dLineage = document.querySelector('#ys-next a.g-lineage__ops')?.href || null;
  await wait(D[1250]);
  await Promise.race([preSk, wait(D[1000])]);
  // 30–40 s: 소쿨룩 · 헤더 sticky · 핀 라벨 안쪽 · 'Run change detection' 사전 점검(정직)
  mark('sokuluk-go');
  await go('sokuluk');
  mark('sokuluk');
  scenes.sk.grid(true);
  await scenes.sk.filament(true);
  await wait(D[750]);
  const pre = new Promise((r) => stage.root.addEventListener('f1d:sk-preflight', r, { once: true }));
  click('#sk-run');
  await Promise.race([pre, wait(D[2400] * 2)]);
  await wait(D[1250]);
  document.getElementById('card').scrollTo({ top: 400, behavior: 'smooth' });   // 헤더 sticky 가 보이게
  await wait(D[1250]);
  scenes.sk.grid(false);
  scenes.sk.filament(false);
  mark('sokuluk-done');
  // 40–52 s: 경유점 정지 ≤ 500 → 메이크틸라 하강(비행) → 전후 스와이프(F1-A fx swipe)
  await go('meiktila');
  mark('meiktila');
  await wait(D[500]);
  if (stage.crossing) await Promise.race([stage.crossing, wait(D[2400])]);
  await ease(map, { ...CAM_MK_DETAIL, padding: PAD_REGION }, D[1600]);
  scenes.mk.bOn();   // 오른쪽(사후) 영상은 지금부터 받는다
  await Promise.all([idle(map, D[2400]), stage.mapB ? idle(stage.mapB, D[2400]) : null]);
  const s2 = scenes.mk.swipeOn(80);
  scenes.mk.lockVisible();
  await s2.glide(34, D[1250]);
  await s2.glide(60, D[1000]);
  await wait(D[1000]);
  mark('end');
  window.__f1dTour = 'done';
}

main().catch((e) => {   // 부트 실패도 화면에 정직하게(콘솔 오류 0 — 경고 수준으로만 남김)
  document.documentElement.dataset.lx = 'failed';
  const c = document.getElementById('card');
  c.hidden = false; c.innerHTML = `<div class="gs-void"><b>Boot failed</b> · ${String(e && e.message || e)}</div>`;
  console.warn('[f1d] boot', e);
});
