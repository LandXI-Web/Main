/* Land-XI Global — 부트 · 장면 기계 · 투어
   ?tenant=kgz-agri|kgz-land|lx · svc=<deploy_id> · locale=en|ko · build=lx|tenant|public|export · from=namwon · tour=1
   두 모드(계약 §1): on = 게이트웨이(또는 F1-D 하니스 · localStorage.lx_api_base) · off = 픽스처 + 리플레이. 콘솔 오류 0. */
import { API, probe, session, mastLabel, fixture } from '/landxi/shared/api-v1.js';
import { initI18n, t, applyStatic } from './i18n.js';
import { D, createStage, styleReady, idle, fly, ease, wait, addGibs, dateScrubber, addCountries, countryList, prov, pin, clearPins, clearLocks, perfOf, ensureMapB, prefetchFlight, flySamples, tilesFor, pull, warmInMap, warmCams, tileDeficit, arriveCross, prepCross, reduced } from './globe-stage.js';
import { loadCatalog, addLadder, ladderChip, show, opacity } from './ladder-global.js';
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
// 글로브 경유점 — 줌 2.4(GIBS 타일 z3 = 글로브에서 이미 받은 줌 · 한 단계도 낮지 않게)
const CAM_TRANSIT = { center: [88, 26], zoom: 2.4, pitch: 0, bearing: 0, padding: PAD_REGION };
// 남원 진입은 첫 칠부터 남원 장면(글로브 제목·목록이 회색 바탕 위에 번쩍이지 않게)
if (q.get('from') === 'namwon') root.dataset.scene = 'namwon';

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
  document.getElementById('tenant-chip').textContent = tenant === 'guest' ? 'Guest · public build' : t('tenant.' + tenant) + (build !== 'lx' ? ` · build=${build}` : '');
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

  // ── 선명한 하강: 경로 타일 미리 받기 · GIBS 데우기(판정 1차 불합격 · 하강 뭉개짐) ──────
  const pfEl = document.getElementById('pf');
  const PAD_GLOBE = CAM_GLOBE.padding;
  const baseSpecs = [ladder.base && { id: ladder.base, from: 2.8 }, { id: 'xdworld-satellite', from: 5 }].filter(Boolean);
  /** 하강 전 — 경로 타일을 받는 동안 '영상 미리 받기 n/m' · 최대 PF_MAX 뒤에는 그냥 난다(결손 대신 지연 · 정직 표기). */
  const PF_MAX = 3200;
  async function prefetch(cam, extra = [], opt = {}) {
    let shown = false;
    const tm = setTimeout(() => { shown = true; pfEl.hidden = false; }, D[380]);
    const prog = (a, b) => { pfEl.innerHTML = `<span>${t('pf.label')}</span><i style="--k:${Math.round((a / Math.max(1, b)) * 100)}%"></i><b>${a}/${b}</b>`; };
    prog(0, 0);
    const r = await Promise.race([prefetchFlight(map, cam, [...(opt.only ? [] : baseSpecs), ...extra], { conc: 8, ...opt, onProgress: prog }), wait(opt.max || PF_MAX).then(() => ({ timeout: true }))]);
    clearTimeout(tm); if (shown) await wait(D[180]); pfEl.hidden = true;
    (window.__f1dPf ||= []).push({ to: cam.center, ...r });
    return r;
  }
  /** 비행 → 목표 카메라 타일 idle(최대 1600) 뒤에만 카드·HUD. */
  async function descend(cam, dur, extra = [], opt = {}) {
    if (reduced()) return fly(map, cam, dur);   // 움직임 줄이기 = 즉시 점프(비행 경로가 없으니 미리 받기·대기 없음)
    await prefetch(cam, extra, opt);
    await fly(map, cam, dur);
    await idle(map, D[1600]);
  }
  // 무거운 도착 원천(PC 월별 모자이크 · NDVI 지수 · 스와이프 모자이크)은 부트 뒤 배경에서 미리(병렬 6 · 도착 전 캐시)
  const bgPrefetch = async () => {
    const at = (cam) => [{ ...flySamples(map, cam, { n: 1, from: cam })[1] }];
    // ① 투어·목록이 가는 하강 경로의 EOX(7일 캐시) — 사용자가 누르기 전에 캐시에
    const R = (c) => ({ ...c, padding: PAD_REGION });
    const legs = [[CAM_GLOBE, R(CAM_YS)], [R(CAM_YS), R(CAM_SK)], [R(CAM_SK), R(CAM_SK_BLD), 'ease'], [R(CAM_SK_BLD), CAM_TRANSIT], [CAM_TRANSIT, R(CAM_MK)]];
    for (const [i, [a, b2, mode]] of legs.entries()) await pull(tilesFor(map, flySamples(map, b2, { from: a, mode: mode || 'fly' }), baseSpecs), { conc: i ? 6 : 8 });   // EOX 공정 사용 — 폭주하면 CORS 없는 거절(콘솔 오류)
    window.__f1dBg = { legs: legs.length, at: Math.round(performance.now()) };
    const cur = ['2025-06', '2025-03', '2025-04', '2025-05', '2025-07', '2025-08', '2025-09', '2025-10'];
    const ys = at({ ...CAM_YS, padding: PAD_REGION });
    await pull(tilesFor(map, ys, cur.map((m) => ({ id: 'pc-' + m, final: true }))), { conc: 4 });
    await pull(tilesFor(map, at({ ...CAM_SK_BLD, padding: PAD_REGION }), swipeSpecs(ctx)), { conc: 4 });
    await pull(tilesFor(map, ys, cur.map((m) => ({ id: 'ndvi-' + m, final: true }))), { conc: 4 });
  };

  // 배경 미리 받기는 판정 투어에서만(원천 공정 사용 — 화면을 열 때마다 수백 장을 당기지 않는다).
  // 평소에는 사용자가 장면 단추·국가 행에 손을 올릴 때(의도) 그 하강 경로만 조용히 받는다.

  const intentCam = { ysykata: { ...CAM_YS, padding: PAD_REGION }, sokuluk: { ...CAM_SK, padding: PAD_REGION }, meiktila: { ...CAM_MK, padding: PAD_REGION } };
  const intent = (s) => { const c = intentCam[s]; if (c && (cur === 'globe' || cur === 'namwon')) prefetchFlight(map, c, baseSpecs, { conc: 6 }).catch(() => {}); };
  document.getElementById('scenes').addEventListener('pointerenter', (e) => { const b = e.target.closest && e.target.closest('button[data-scene]'); if (b) intent(b.dataset.scene); }, true);
  document.getElementById('list').addEventListener('pointerenter', (e) => { const r = e.target.closest && e.target.closest('.gs-row[data-open]'); if (r) intent(r.dataset.open); }, true);

  // ── 장면 기계(같은 지도 · 카메라 이동만) ──────────────────────────
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
  const allowed = (s) => tenant === 'lx' || tenant === 'guest' || s === 'globe' || (tenant === 'kgz-agri' && s === 'ysykata') || (tenant === 'kgz-land' && s === 'sokuluk');
  async function go(s, opt = {}) {
    if (!allowed(s)) return;
    if (s === cur && !opt.force) return;
    if (namwonPf) await namwonPf;   // 남원 진입 데우기(본 지도 점프) 중이면 끝난 뒤 출발 — 칩 'Pre-fetching imagery n/m' 이 보이는 대기
    const prev = cur; cur = s; mark(s);
    leaveAll();
    if (s === 'globe') {
      root.dataset.scene = 'globe'; stage.inKgz = false; chip.set(null);
      await fly(map, CAM_GLOBE, D[2400]);
      return;
    }
    root.dataset.scene = s;
    if (s === 'ysykata') {
      stage.inKgz = true;
      await descend({ ...CAM_YS, padding: PAD_REGION }, D[2400]);
      await scenes.ys.enter(opt);
      scenes.ys.renderScrub();
      return;
    }
    if (s === 'sokuluk') {
      stage.inKgz = true;
      scenes.sk.prepB().catch(() => {});
      await descend({ ...CAM_SK, padding: PAD_REGION }, prev === 'ysykata' ? D[1600] : D[2400]);
      await scenes.sk.enter();
      return;
    }
    if (s === 'meiktila') {
      const prep = scenes.mk.prepare();
      const camMk = { ...CAM_MK, padding: PAD_REGION }, cover = (B, on) => scenes.mk.coverLayers(B, on);
      if (reduced()) { if (prev !== 'globe') await fly(map, CAM_TRANSIT, D[2400]); await prep; show(map, 'mk-pre', true); await fly(map, camMk, D[2400]); await scenes.mk.enter(); return; }
      // 판정 2차 불합격(경유점 정지 2.4–4.5 s · 10 % 컷): 도착 화면 준비 · 하강 경로 미리 받기를 경유 비행과 겹쳐 돌리고
      // 경유점에서는 멈추지 않는다(남은 미리 받기가 380 을 넘으면 'Pre-fetching imagery n/m' 칩) · 크로스페이드는 비행 40 % 이후 500.
      const ready = prep.then(() => prepCross(stage, camMk, cover));
      const pfMk = prefetchFlight(map, camMk, baseSpecs, { from: CAM_TRANSIT, conc: 6 });
      if (prev !== 'globe') {
        root.dataset.scene = 'transit';
        await prefetch(CAM_TRANSIT, [], { max: D[2400] });
        // --e-cam 의 꼬리(뒤 1/3 · 진행 ≥ 99 %)는 거의 멈춘 글로브 — 그 꼬리에서 바로 하강으로 이어 탄다(경유점 정지 0)
        fly(map, CAM_TRANSIT, D[2400]);
        await wait(D[1600]);
        root.dataset.scene = s;
      }
      const tw = performance.now();
      await prep;
      show(map, 'mk-pre', true);
      await Promise.race([pfMk, wait(D[380])]);
      await prefetch(camMk, [], { from: CAM_TRANSIT, max: D[2400] });   // 대부분 캐시 적중(진행 중 공유) — 남으면 칩으로 보인다
      (window.__f1dTransit ||= []).push({ hold_ms: Math.round(performance.now() - tw) });
      await arriveCross(stage, camMk, D[2400], cover, { move: fly, prepared: ready, at: 0.4, fade: [ladder.base, 'mk-pre', 'xdworld-satellite'].filter(Boolean) });
      await scenes.mk.enter();
    }
  }
  navBtns.forEach((b) => b.addEventListener('click', () => go(b.dataset.scene)));
  if (cur === 'namwon') {
    chip.set({ name: t('ladder.xd'), lic: 'V-World · 공공누리' });
    pin(stage, CAM_NAMWON.center, `<b>Namwon</b><span class="g-cyr">남원 · Jeonbuk</span>`, 'g-place');
  }

  // ── 준비 신호(첫 타일 idle 뒤 · 계약 §12) ─────────────────────────
  let namwonPf = null, standIn = null;
  // 남원(한국 안 · z > 7)에서는 V-World 가 화면을 다 덮는다 → EOX 층을 꺼 두어 후퇴 첫 순간 V-World 요청이 EOX 와 줄 서지 않게.
  // 후퇴가 z 7 아래로 내려오면 켠다(그 줌 EOX 는 부트에서 데워 둠).
  const KOREA_Z = 7;
  const eoxKorea = (hold) => {
    if (!ladder.base) return;
    const on = !hold || map.getZoom() <= KOREA_Z;
    map.setLayoutProperty(ladder.base, 'visibility', on ? 'visible' : 'none');
    if (!on && !eoxKorea.w) { eoxKorea.w = () => { if (map.getZoom() <= KOREA_Z) { map.setLayoutProperty(ladder.base, 'visibility', 'visible'); map.off('zoom', eoxKorea.w); eoxKorea.w = null; } }; map.on('zoom', eoxKorea.w); }
  };
  if (fromNamwon) eoxKorea(true);
  if (fromNamwon) {
    // 판정 2차 불합격(부트 가림막 15.5 s 흰 화면) → 가림막 없음. 남원 V-World 를 두 번째 지도(대역 · 같은 카메라 · 라이브 타일)로 바로 보이고,
    // 본 지도는 그 뒤에서 후퇴 경로(V-World z12→5 · EOX · GIBS z≤5)와 경유점→메이크틸라 하강 경로의 타일을 자기 GPU 캐시에 올린다.
    // 받는 동안 'Pre-fetching imagery n/m'(타일 수 + 데우기 카메라 수). 끝나면 대역이 500 으로 걷히고 본 지도가 같은 남원 화면을 이어받는다.
    standIn = (async () => {
      const B = ensureMapB(stage); await stage.mapBReady;
      stage.bHold = true; B.jumpTo(CAM_NAMWON);
      const vw = map.getStyle().sources['xdworld-satellite'];
      if (vw && !B.getSource('b-vw')) { B.addSource('b-vw', { type: 'raster', tiles: vw.tiles, tileSize: 256, minzoom: vw.minzoom, maxzoom: vw.maxzoom, bounds: vw.bounds }); B.addLayer({ id: 'b-vw', type: 'raster', source: 'b-vw', paint: { 'raster-fade-duration': 0 } }); }
      root.dataset.bcover = '1';
      await idle(B, D[2400] * 2);
    })();
    const specsR = [ladder.base && { id: ladder.base, to: KOREA_Z }, { id: 'xdworld-satellite', from: 5 }, { id: 'gibs-a', to: 5 }, { id: 'gibs-bm', final: true }].filter(Boolean);
    const camMk = { ...CAM_MK, padding: PAD_REGION };
    const tw = performance.now();
    namwonPf = standIn.then(async () => {
      const pathR = flySamples(map, CAM_GLOBE, { n: 16 }), pathM = flySamples(map, camMk, { from: CAM_TRANSIT, n: 14 });
      const pathY = flySamples(map, { ...CAM_YS, padding: PAD_REGION }, { from: CAM_GLOBE, n: 14 });   // 글로브→으슥아타 하강(HTTP 캐시만)
      const urls = [...new Set([...tilesFor(map, pathR, specsR), ...tilesFor(map, pathM, baseSpecs), ...tilesFor(map, pathY, baseSpecs)])];
      const camsR = warmCams(flySamples(map, CAM_GLOBE, { n: 40 }));
      const hiR = camsR.filter((c) => c.zoom > KOREA_Z), cams = [...hiR, ...camsR.filter((c) => c.zoom <= KOREA_Z), ...warmCams(flySamples(map, camMk, { from: CAM_TRANSIT, n: 40 }), { lo: 2.6 })];
      const N = urls.length + cams.length;
      pfEl.hidden = false;
      const prog = (a) => { pfEl.innerHTML = `<span>${t('pf.label')}</span><i style="--k:${Math.round((a / Math.max(1, N)) * 100)}%"></i><b>${a}/${N}</b>`; };
      prog(0);
      // 병렬: HTTP·메모리 미리 받기(경로 전 표본) ∥ 본 지도 데우기 점프(타일 줌마다 1 카메라 · 같은 URL 은 진행 중 요청을 공유)
      let pa = 0, ca = 0; const step = () => prog(pa + ca);
      const pulling = Promise.race([pull(urls, { conc: 20, onProgress: (a) => { pa = a; step(); } }), wait(D[2400] * 8).then(() => ({ timeout: true }))]);
      stage.freeze = true;
      const W = ['xdworld-satellite', ladder.base, 'gibs-a', 'gibs-bm'].filter(Boolean);
      await warmInMap(map, hiR, W, D[1600], (i) => { ca = i + 1; step(); });   // 한국 안 줌 — EOX 숨김(V-World 아래라 보이지 않는 요청 0)
      eoxKorea(false);
      await warmInMap(map, cams.slice(hiR.length), W, D[1600], (i) => { ca = hiR.length + i + 1; step(); });
      eoxKorea(true);
      const r = await pulling;
      const pullMs = Math.round(performance.now() - tw);
      map.jumpTo(CAM_NAMWON);
      stage.freeze = false; stage.onMove.forEach((f) => f());
      await idle(map, D[2400]);
      root.dataset.bcover = '0';                  // 대역 → 본 지도(같은 화면 · 500)
      pfEl.hidden = true;
      await wait(D[500]);
      delete root.dataset.bcover; stage.bHold = false;
      if (stage.mapB.getLayer('b-vw')) stage.mapB.setLayoutProperty('b-vw', 'visibility', 'none');
      window.__f1dWarm = { ...r, cams: cams.length, pull_ms: pullMs, ms: Math.round(performance.now() - tw) };
      return r;
    });
  }
  if (q.get('tour') === '1') (namwonPf || Promise.resolve()).then(() => bgPrefetch()).catch(() => {});   // 후퇴 경로가 먼저(대역 다툼 0)
  if (standIn) await standIn; else await idle(map, 8000);   // 남원 진입: 대역 지도가 보이면 준비(데우기는 칩으로 계속)
  document.documentElement.dataset.lx = 'ready';
  window.__f1d = {
    stage, ctx, scenes, go, scrubber, tenant, build, realm, prefetch, descend, pre: (cam, from = null, mode = 'fly') => prefetchFlight(map, cam, baseSpecs, { from, mode, conc: 6 }), tileDeficit: () => tileDeficit(map), tileDeficitB: () => (stage.mapB ? tileDeficit(stage.mapB) : null),
    perf: (from = 0) => perfOf(stage, from), mark: () => stage.perf.length,
    state: () => ({ scene: cur, mode: API.mode, reason: API.reason, zoom: map.getZoom(), pitch: map.getPitch(), swipe: stage.swipeAt, ys: scenes.ys.S, errors: stage.errors.slice(-5), boot_ms: Math.round(performance.now() - t0) }),
  };

  // 서비스 딥링크(?svc=)
  const svc = q.get('svc');
  if (svc === 'dp-kgz-agri-farm-26') go('ysykata');
  if (svc === 'dp-kgz-land-change-26') go('sokuluk');
  if (svc === 'dp-mm-meiktila-25') go('meiktila');
  if (q.get('tour') === '1') tour(stage, scenes, go, scrubber, setMode, fromNamwon, namwonPf);
}

/* ── 판정 영상 투어(≈43 s · 1440×900 · F1-D 브리프 표) ─────────────────── */
async function tour(stage, scenes, go, scrubber, setMode, fromNamwon, namwonPf) {
  const { map } = stage;
  const mark = (k) => { (window.__f1dMarks ||= []).push({ k, t: Math.round(performance.now()) }); };
  window.__f1dTour = 'running';
  await idle(map, D[2400] * 2);   // 첫 장면 타일 도착 뒤 시작
  if (namwonPf) await namwonPf;   // 후퇴 경로 미리 받기 완료가 출발 조건(칩으로 보이는 대기 · 첫 1 s 뭉개짐 0)
  window.__f1dTour = 'rolling';
  mark('start');
  if (fromNamwon) {   // 0–5 s: 남원 카메라(V-World 위성) → 글로브 후퇴 2400 — 같은 지도 · 페이지 이동 0
    stage.chip = null;
    await wait(D[750]);
    clearPins(stage);
    await go('globe', { force: true });
  }
  mark('globe');
  const F = window.__f1d;
  const preYs = F.pre({ ...CAM_YS, padding: PAD_REGION }, CAM_GLOBE);   // 다음 하강 경로를 글로브에 머무는 동안 조용히 받는다
  await wait(D[750]);
  await scrubber.set(scrubber.days[scrubber.days.length - 2]);   // 날짜 스크러버 한 칸(타일 페이드 500)
  await wait(D[750]);
  await scrubber.set(scrubber.days[scrubber.days.length - 1]);   // 어제로 복귀(데운 GIBS 층 · 다시 받지 않음)
  await Promise.race([preYs, wait(D[1250])]);
  mark('descend');
  const pYs = go('ysykata', { tour: true });                        // 5–10 s: 비슈케크 · 으슥아타 하강 2400 · 락온
  await pYs;
  mark('ysykata');
  await wait(D[500]);
  // 10–14 s: WorldCover 비율 막대(이미 성장) + 월별 3→10(6 s · 8 × 750)
  await scenes.ys.play();
  mark('play-done');
  // 14–26 s: 프레임 → 견적 → 실행 · 8칸 도착 · job.done
  scenes.ys.frame();
  await wait(D[500]);
  await scenes.ys.quote();
  await wait(D[750]);
  const done = new Promise((r) => root.addEventListener('f1d:gj1-done', r, { once: true }));
  scenes.ys.run();
  await done;
  mark('gj1-done');
  const preSk = F.pre({ ...CAM_SK, padding: PAD_REGION });
  document.querySelector('#ys-next [data-a="open"]')?.click();   // 시작 → 결과 → 다음 행동: 결과 표를 연다
  await wait(D[1250]);
  await Promise.race([preSk, wait(D[1000])]);
  // 26–34 s: 소쿨룩 1600 · Δ 격자 · 필라멘트 · 시범지 · Overture 압출(pitch 45) · 스와이프 2017↔2025
  await go('sokuluk');
  mark('sokuluk');
  scenes.sk.grid(true);
  await scenes.sk.filament(true);
  await wait(D[500]);
  scenes.sk.grid(false);
  scenes.sk.filament(false);
  clearPins(stage);
  const camBld = { ...CAM_SK_BLD, padding: { top: 64, right: 0, bottom: 0, left: 380 } };
  await F.prefetch(camBld, [], { mode: 'ease' });
  // z10 → z14 · pitch 45: 캐시에서도 타일 100여 장 해독 지연(≈ 0.5–1.5 s) → 두 번째 지도로 도착 화면을 먼저 완성해 크로스페이드
  await arriveCross(stage, camBld, D[1600], (B, on) => { if (B.getLayer('b-eox')) B.setLayoutProperty('b-eox', 'visibility', on ? 'visible' : 'none'); }, { at: 0.1, waitPrep: true });
  await scenes.sk.buildings(true);
  await scenes.sk.swipeOn(true);
  const sw = stage.swipeAt !== undefined ? scenes.sk.S.swipe : null;
  if (sw) { await sw.glide(22, D[1000]); await sw.glide(62, D[1000]); }
  mark('sokuluk-done');
  // 34–43 s: 글로브 후퇴 → 미얀마 하강 · Maxar 전후 스와이프 · EMS 38 · 차트 · CC BY-NC
  await go('meiktila');
  mark('meiktila');
  await wait(D[500]);
  await ease(map, { ...CAM_MK_DETAIL, padding: { top: 64, right: 0, bottom: 0, left: 380 } }, D[1600]);
  scenes.mk.bOn();   // 오른쪽(사후) 영상은 지금부터 받는다
  await Promise.all([idle(map, D[2400]), stage.mapB ? idle(stage.mapB, D[2400]) : null]);   // 0.5 m 타일 도착(데이터 이벤트)까지
  const s2 = scenes.mk.swipeOn(80);
  scenes.mk.lockVisible();
  await s2.glide(34, D[1250]);
  await s2.glide(60, D[1000]);
  await wait(D[1000]);
  mark('end');
  window.__f1dTour = 'done';
}
function clearLocksSoft(stage) { stage.locks.splice(0).forEach((l) => l.remove()); }

main().catch((e) => {   // 부트 실패도 화면에 정직하게(콘솔 오류 0 — 경고 수준으로만 남김)
  document.documentElement.dataset.lx = 'failed';
  const c = document.getElementById('card');
  c.hidden = false; c.innerHTML = `<div class="gs-void"><b>Boot failed</b> · ${String(e && e.message || e)}</div>`;
  console.warn('[f1d] boot', e);
});
