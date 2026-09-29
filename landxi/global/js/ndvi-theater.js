/* K-1 으슥아타 · G-J1 — dp-kgz-agri-farm-26(canary)
   경계 락온 · WorldCover 비율 막대(비율만 유효) · 월별 S2 모자이크 스크럽 3→10(F1-A fx/timescrub · 정지 750 · 이동 1000)
   G-J1: 프레임(ADM2 평원) → 견적(eta_s) → 제출(kind index) → SSE(on) / 리플레이(off) → shard = 월 8칸이 히스토그램 자리(kepler 시간 재생)에 도착.
   F2-D(1차 판정 must_fix 2 · 라이브 = 판정 영상): index.month 에 hist/p10/p50/p90 가 있으면 슬롯 분포 막대 · 없으면 'distribution pending (gateway)'
   결손 표기 → job.done 뒤 GET /results/{set}/index(계약 v1.1-20)로 채움 · CSV = 서버 값. HUD 는 job.progress · index.month 에서만 읽는다.
   지수 계산 · 모델 추론 아님. */
import { API, api, quote as apiQuote, submit as apiSubmit, sse, replay, fixture, env, job as apiJob, session } from '../../shared/api-v1.js';
/** 인증 라우트(견적 · 제출 · 작업)는 세션이 있을 때만 — 게스트 · 세션 없음이면 부르지 않는다(401 콘솔 오류 0 · 판정 3차) */
const authed = () => API.mode === 'on' && !!session.get();
import { t, num, area, basisLabel } from './i18n.js';
import { D, lockOn, sweep, prov, pin, wait, tween, idle } from './globe-stage.js';
import { MONTHS, show, opacity } from './ladder-global.js';
import { cardHead, gap, reveal } from './cards-global.js';
import { timescrub } from '../../xi/fx/timescrub.js';
import { lineage } from '../../xi/fx/lineage.js';

const DATA = new URL('../data/', import.meta.url);
/** 관제(:8702) — 같은 job id 로 작업 행을 펼친다(계약 v1.1-29 · infra.html?job=). 관제 세션은 다른 origin 이라 여기서 알 수 없다 →
    관제 로그인의 ?next= 로 연다(관리자 세션이 있으면 login.html 이 곧바로 infra.html?job= 로 넘긴다 · 없으면 로그인 뒤 같은 곳). */
export const OPS = 'http://localhost:8702/landxi/ops/';
export const opsJobHref = (id) => `${OPS}login.html?next=${encodeURIComponent('infra.html?job=' + id)}`;
export const YS = { code: '92254566B31675215078110', bbox: [74.6868, 42.419, 75.183, 43.0039], plain: [74.70, 42.75, 75.20, 43.00] };
export const CAM_YS = { center: [74.93, 42.86], zoom: 9.55, pitch: 0, bearing: 0 };
const ring = (b) => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
const LO = -0.1, HI = 0.8;               // 칸 세로축 = NDVI(곡선·평균·분포 같은 축)
const yk = (v) => Math.max(0, Math.min(1, (v - LO) / (HI - LO)));
const ndviColor = (v) => (v < 0.1 ? 'var(--ndvi-0)' : v < 0.2 ? 'var(--ndvi-1)' : v < 0.3 ? 'var(--ndvi-2)' : v < 0.4 ? 'var(--ndvi-3)' : 'var(--ndvi-4)');
const MON_EN = { '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct' };
const monLabel = (m) => (document.documentElement.lang === 'ko' ? `${+m.slice(5)}월` : MON_EN[m.slice(5)]);
/** 봉투 또는 맨 숫자 → 숫자(게이트웨이 /results/{set}/index 는 p10… 를 봉투로 · SSE index.month 는 맨 숫자로 준다) */
const V = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x ?? null);
const LN_EN = { dataset: 'dataset', run: 'training run', model: 'model', card_version: 'card version', deploy: 'deploy', tenant: 'tenant', job: 'job' };

/** 게이트웨이 라우트 존재 확인(openapi 한 번) — 없는 경로를 불러 404 콘솔 오류를 내지 않는다. */
let ROUTES = null;
export async function hasRoute(re) {
  if (API.mode !== 'on') return false;
  if (!ROUTES) ROUTES = fetch(API.prefix + '/openapi.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => Object.keys(j?.paths || {})).catch(() => []);
  return (await ROUTES).some((p) => re.test(p));
}

export async function loadYsData() {
  const [adm2, lc, nd] = await Promise.all(['kgz-adm2.geojson', 'ysykata-landcover.json', 'ysykata-ndvi-2025.json'].map((f) => fixture(new URL(f, DATA))));
  return { adm2, lc, nd };
}

/** 경계 층(글로벌 사다리 위) — ADM2 헤어라인 · 으슥아타 강조 · 프레임 밖 딤. */
export function addBoundaries(map, d) {
  if (map.getSource('adm2')) return;
  map.addSource('adm2', { type: 'geojson', data: d.adm2 });
  map.addLayer({ id: 'adm2-line', type: 'line', source: 'adm2', filter: ['!=', ['get', 'level'], 'bbox'],
    paint: { 'line-color': '#FFFFFF', 'line-width': 0.8, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6.5, 0.55] } });
  map.addLayer({ id: 'ys-halo', type: 'line', source: 'adm2', filter: ['==', ['get', 'code'], YS.code],
    paint: { 'line-color': 'rgba(15,169,160,.25)', 'line-width': 5, 'line-opacity': 0, 'line-opacity-transition': { duration: D[500], delay: 0 } } });
  map.addLayer({ id: 'ys-line', type: 'line', source: 'adm2', filter: ['==', ['get', 'code'], YS.code],
    paint: { 'line-color': '#0FA9A0', 'line-width': 1.4, 'line-opacity': 0, 'line-opacity-transition': { duration: D[500], delay: 0 } } });
  map.addSource('frame', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'frame-dim', type: 'fill', source: 'frame', filter: ['==', ['get', 'k'], 'dim'],
    paint: { 'fill-color': '#010102', 'fill-opacity': 0, 'fill-opacity-transition': { duration: D[500], delay: 0 } } });
  map.addLayer({ id: 'frame-line', type: 'line', source: 'frame', filter: ['==', ['get', 'k'], 'aoi'],
    paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0, 'line-opacity-transition': { duration: D[500], delay: 0 } } });
}

export function ysykataScene(stage, ctx) {
  const { map, root } = stage;
  const card = root.querySelector('#card'), hud = root.querySelector('#hud'), scrub = root.querySelector('#scrub');
  const d = ctx.ys;
  const S = { month: '2025-06', job: null, arrived: {}, shardMs: {}, playing: false, sub: null, chain: Promise.resolve(), dist: {}, distFrom: null, filled: Promise.resolve(), fast: false };
  let TS = null;   // fx timescrub

  /* ── 카드 ─────────────────────────────────────────────────────────── */
  function renderCard() {
    const dep = ctx.deploys.byId['dp-kgz-agri-farm-26'];
    const cls = d.lc.classes.filter((c) => c.pct.value >= 1).slice(0, 6);
    const crop = d.lc.classes.find((c) => c.code === 40);
    card.innerHTML = cardHead(dep, { title: document.documentElement.lang === 'ko' ? '농지 이용 실태 · 으슥아타' : 'Farmland use · Ysyk-Ata', place: t('ys.place'), cyr: 'Ысык-Ата' }) + `
      <section class="g-sec"><div class="g-sec__t"><span>${t('ys.lc')}</span><b data-crop>${t('ys.lc.crop')} ${num(crop.pct.value, 1)}%</b></div>
        <ul class="g-bars" id="ys-bars">${cls.map((c) => `<li class="g-bar" ${c.code === 40 ? 'data-hl' : ''}><span>${document.documentElement.lang === 'ko' ? c.name_ko : c.name_en}</span><span class="g-bar__track"><span class="g-bar__fill" style="--w:${Math.min(100, c.pct.value / 45 * 100)}%"></span></span><em>${num(c.pct.value, 1)}%</em></li>`).join('')}</ul>
        <div id="ys-lc-prov" style="margin-top:8px"></div></section>
      <section class="g-sec" id="ys-job"><div class="g-sec__t"><span>${t('ys.frame')}</span><b>${t('ys.frame.v')}</b></div>
        <dl class="g-quote" id="ys-quote"><div><dt>${t('ys.quote.area')}</dt><dd>—</dd></div><div><dt>${t('ys.quote.shards')}</dt><dd>—</dd></div><div><dt>${t('ys.quote.gpu')}</dt><dd>—</dd></div></dl>
        <div class="g-note g-eta" id="ys-eta"></div>
        <div class="g-run"><button class="g-btn" id="ys-run" disabled>${t('ys.run')}</button><span class="g-note" id="ys-run-note">${t('ys.quote.pool')}</span></div>
        <div id="ys-gap"></div></section>`;
    const lp = card.querySelector('#ys-lc-prov');
    lp.appendChild(prov(crop.pct));
    if (crop.area_ha) { const h = document.createElement('div'); h.className = 'g-note'; h.style.marginTop = '6px'; h.innerHTML = `<b style="color:var(--cw-ink)">${t('ys.lc.crop')} ${area(crop.area_ha, 'ha')}</b> · 10 m recount · adapter_worldcover`; lp.appendChild(h); }
    card.querySelector('#ys-run').onclick = () => run();
    reveal(card);
  }
  const bars = () => card.querySelector('#ys-bars')?.setAttribute('data-on', '');

  /* ── 월 스크러버(F1-A fx/timescrub) + 히스토그램 자리(kepler 시간 재생) ───── */
  function renderScrub() {
    scrub.hidden = false;
    scrub.innerHTML = `<div class="g-scrub__head"><span><b>${t('scrub.h')}</b></span><span class="g-scrub__idx" id="scrub-idx">${t('scrub.idx')}</span>
        <button type="button" class="xi-play g-ts__play" aria-pressed="false" aria-label="${t('scrub.play')}"><span class="i-play">▶</span><span class="i-pause">❚❚</span></button></div>
      <div class="g-scrub__plot"><div class="g-slots">${MONTHS.map((m) => `<div class="g-slot" data-m="${m}"><div class="g-slot__n"></div><div class="g-slot__hist"></div><div class="g-slot__bar"></div><div class="g-slot__v"></div></div>`).join('')}</div>
        <svg id="curve" aria-hidden="true"><path class="g-curve--ghost" d=""/><path class="g-curve" d="" /></svg></div>
      <div class="g-ts xi-track"><input type="range" min="0" max="7" step="0.01" value="3" aria-label="${t('scrub.month')}"><ol class="xi-ticks"></ol>
        <div class="xi-hist" hidden></div><p class="xi-scrub-label" hidden></p><p class="xi-scrub-void" hidden></p></div>
      <div class="g-scrub__foot"><span id="scrub-prov"></span><span class="g-note" id="scrub-note"></span></div>`;
    const L = ctx.ladder;
    TS = timescrub(scrub, {
      map,
      onChange: (e, Lr) => {
        const a = MONTHS[Lr.a], b = Lr.b != null ? MONTHS[Lr.b] : null;
        S.month = MONTHS[Math.round(e)];
        for (const [i, mm] of MONTHS.entries()) {
          const w = i === Lr.a ? 1 : i === Lr.b ? Lr.f : 0;
          if (S.ndviOn && S.arrived[mm]) opacity(map, L.ndvi[mm], 0.88 * w);
        }
        scrub.querySelectorAll('.g-slot').forEach((sl) => sl.toggleAttribute('data-cur', sl.dataset.m === (Lr.f >= 0.5 && b ? b : a)));
        ctx.chip.month(S.month);
      },
    });
    // 처음엔 보이는 달만 받는다(8개월 PC 모자이크가 한꺼번에 줄 서면 착지 화면 EOX·PC 타일이 뒤로 밀린다 — 실측 1.3 s 뭉개짐)
    TS.build(MONTHS.map((m) => ({ id: m, layer: L.months[m], label: monLabel(m), gsd: '10 m' })), [], { warm: false, initial: MONTHS.indexOf(S.month) });
    const warmMonths = () => { if (TS && !TS.S.warm && !scrub.hidden) { TS.S.warm = true; TS.set(TS.S.e, { url: false }); } };
    idle(map, D[2400]).then(() => setTimeout(warmMonths, D[500]));
    Object.defineProperty(S, 'ts', { value: TS, enumerable: false, configurable: true, writable: true });   // 테스트·판정용(직렬화 제외)
  }
  function setMonth(m) { if (TS) TS.set(MONTHS.indexOf(m), { url: false }); else S.month = m; }
  /** 재생 — fx timescrub(정지 750 × 8 · 이동 1000 × 7). 끝나면 resolve. */
  async function play() {
    if (!TS) return;
    S.playing = true;
    TS.set(0, { url: false });
    TS.play();
    await new Promise((r) => { const f = () => (TS.S.playing ? setTimeout(f, D[120]) : r()); setTimeout(f, D[120]); });
    S.playing = false;
  }

  /* ── G-J1 ────────────────────────────────────────────────────────── */
  function frame() {
    addBoundaries(map, d);   // 멱등 — 장면 진입 전에 불려도 층이 있게
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    map.getSource('frame').setData({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { k: 'dim' }, geometry: { type: 'Polygon', coordinates: [world, ring(YS.plain).reverse()] } },
      { type: 'Feature', properties: { k: 'aoi' }, geometry: { type: 'Polygon', coordinates: [ring(YS.plain)] } }] });
    map.setPaintProperty('frame-dim', 'fill-opacity', 0.32);
    map.setPaintProperty('frame-line', 'line-opacity', 1);
    lockOn(stage, YS.plain);
    // NDVI 지수 타일(PC expression)은 타일러 계산이 느리다 → 프레임 시점에 투명으로 미리 받기(데이터 요청 · 장식 모션 아님)
    MONTHS.forEach((m) => { show(map, ctx.ladder.ndvi[m], true); opacity(map, ctx.ladder.ndvi[m], 0); });
  }
  // kind index 는 imagery_id 를 보내지 않는다(계약 v1.1-13) — 원천은 options.source
  const body = () => ({ kind: 'index', model_id: 'index/ndvi_pc', deploy_id: 'dp-kgz-agri-farm-26', card_id: 'card-global-farm',
    aoi: { type: 'Polygon', coordinates: [ring(YS.plain)] }, options: { months: MONTHS, cloud_max: 15, mask: 'worldcover-40', source: 'pc-s2-mosaic' }, priority: 0, demo: API.mode !== 'on' });

  async function quote() {
    let q;
    if (authed()) {
      try { q = await apiQuote(body()); } catch { q = null; }
    }
    if (!q) {   // off: 같은 형(계약 §4.4) — 면적은 구면 bbox 공식으로 실측 계산 · eta 는 기록된 실행의 총 소요(추정)
      const R = 6371.0088, b = YS.plain, rad = Math.PI / 180;
      const a = R * R * (b[2] - b[0]) * rad * (Math.sin(b[3] * rad) - Math.sin(b[1] * rad));
      const rec = ctx.replayMeta;
      q = { area_km2: env(+a.toFixed(1), 'km2', 'measured', 'spherical bbox area (R 6371.0088 km)'), shards: 8, shards_env: env(8, 'count', 'measured', 'options.months'),
            gpu_s: env(0, 'gpu_s', 'estimate', 'cpu worker · no GPU'),
            eta_s: env(rec?.total_ms ? Math.round(rec.total_ms / 1000) : null, 's', 'estimate', `recorded run ${rec?.date || ''}`),
            allowed: true, reasons: [], pool: 'cpu' };
    }
    const dd = card.querySelectorAll('#ys-quote dd');
    dd[0].innerHTML = `${num(q.area_km2.value, 0)}<small>${t('unit.km2')}</small>`;
    dd[1].innerHTML = `${q.shards}<small>${document.documentElement.lang === 'ko' ? '개월' : 'months'}</small>`;
    dd[2].innerHTML = `${num(q.gpu_s.value ?? 0, 0)}<small>gpu·s</small>`;
    // 견적 eta_s(계약 v1.1-11 · estimate) — 없으면 정직한 결손
    const eta = card.querySelector('#ys-eta');
    const ev = q.eta_s && q.eta_s.value != null ? q.eta_s : null;
    S.etaS = ev ? ev.value : null;
    const src = ev ? etaSource(ev, q.shards) : '';
    eta.innerHTML = ev ? t('ys.eta', { s: num(ev.value, 0), src }) : `<span class="g-xchip" style="margin-left:0">${t('ys.eta.pending')}</span>`;
    eta.title = ev ? `${basisLabel(ev.basis)} · ${src}` : '';
    const btn = card.querySelector('#ys-run'); btn.disabled = !q.allowed;
    S.quote = q;
    return q;
  }

  /** 견적 근거 — 게이트웨이 봉투의 source 는 국문 문장(jobs.py eta_estimate: 'perf:shard_ms:… 최근 72건 중앙값 40172 ms × 8 shard').
      화면 문장은 봉투의 숫자(건수 · 중앙값 ms · shard 수)로 로케일 문장을 직접 조립한다(판정 3차: 영문판 #ys-eta 국문 노출 → 0).
      모르는 형이면 숫자 없이 일반 문장(× shard 수) — 원문은 CSV·계보가 아니라 여기서만 쓰이므로 버린다. */
  function etaSource(ev, shards) {
    const raw = String(ev.source || '');
    const m = raw.match(/(perf:shard_ms|index_results\.metrics\.ms)\S*\s+\D*?(\d+)\D+?(\d+(?:\.\d+)?)\s*ms\s*[×x]\s*(\d+)/);
    if (m) return t(m[1].startsWith('perf') ? 'ys.eta.src' : 'ys.eta.src.db', { n: num(+m[2], 0), ms: num(+m[3], 0), k: num(+m[4], 0) });
    if (/[가-힣]/.test(raw)) return t('ys.eta.src.other', { k: num(shards || 8, 0) });
    return raw;
  }

  function hudShow() {
    hud.hidden = false; S.hudV = null;
    hud.innerHTML = `<div class="g-hud__k g-in">${t('hud.k')}</div><div class="g-hud-big" id="hud-big">—</div>
      <div class="g-hud__line g-in-2" id="hud-line">${t('hud.line', { n: '—', worker: 'cpu-0' })}</div>
      <div class="g-hud__line g-in-3" id="hud-shard">${t('hud.shard', { a: 0, b: 8 })}</div>
      <div class="g-hud__line g-hud__eta g-in-3" id="hud-eta"></div>
      <div class="g-hud__tag g-in-4" id="hud-tag"></div>`;
  }
  /* ── 진행 카운터 — job.progress{shards_done, shards_total, elapsed_s}(계약 v1.1-9) 우선 · 없으면 shard.done 로 a/b ·
     on 모드는 1 Hz 로 경과 초(사건 elapsed_s 가 오면 그것으로 보정) · 견적 eta_s 에서 남은 시간(추정). */
  const P = { t0: null, wall0: null, total: 8, done: 0, ms: [], cur: null, curAt: null, tick: 0, srv: null, srvAt: null };
  const secs = (v) => num(v, v < 10 ? 1 : 0);
  function elapsedS(at) {
    if (P.srv != null && P.srvAt) return P.srv + (performance.now() - P.srvAt) / 1000;
    if (at && P.t0) { const dd = (Date.parse(at) - P.t0) / 1000; if (isFinite(dd) && dd >= 0) return dd; }
    return P.wall0 ? (performance.now() - P.wall0) / 1000 : 0;
  }
  function hudProgress(at) {
    const el = hud.querySelector('#hud-shard'); if (!el) return;
    const el_s = elapsedS(at);
    el.innerHTML = `${t('hud.shard', { a: P.done, b: P.total })} · <b>${secs(el_s)}</b> s ${t('hud.elapsed')}`;
    const eta = hud.querySelector('#hud-eta'); if (!eta) return;
    const left = P.total - P.done;
    if (P.ms.length) {
      const last = P.ms[P.ms.length - 1] / 1000;
      eta.innerHTML = left > 0 ? t('hud.eta', { last: secs(last), next: secs(last) }) : t('hud.eta.done', { mean: secs(P.ms.reduce((a, b) => a + b, 0) / P.ms.length / 1000) });
      eta.title = t('hud.eta.basis');
    } else if (S.etaS != null && left > 0) {
      eta.innerHTML = t('hud.eta.quote', { s: secs(Math.max(0, S.etaS - el_s)) });
      eta.title = t('hud.eta.quote.basis');
    }
  }
  function startTicker() {
    clearInterval(P.tick);
    if (API.mode !== 'on' || !S.live || S.fast) return;   // 리플레이는 기록 시각(사건 at)으로만 — 가짜 진행 0
    P.tick = setInterval(() => {
      if (S.job !== 'running') return clearInterval(P.tick);
      hudProgress(null);
      if (P.cur && P.curAt) { const sl = scrub.querySelector(`.g-slot[data-m="${P.cur}"][data-state="running"] .g-slot__n`); if (sl) sl.textContent = `${secs((performance.now() - P.curAt) / 1000)} s`; }
    }, D[1000]);
  }
  /** 큰 숫자 — 첫 값은 한 번에 g-in · 다음부터는 이전 값 → 새 값 트윈 380. */
  function hudNum(v) {
    const el = hud.querySelector('#hud-big');
    const span = el.querySelector('.g-hud-big__v');
    if (!span || S.hudV == null) {
      el.innerHTML = `<span class="g-hud-big__v g-in">${num(v, 2)}</span><small>NDVI</small>`;
      S.hudV = v; return;
    }
    const from = S.hudV; S.hudV = v;
    const tk = (S.hudTk = (S.hudTk || 0) + 1);
    tween(D[380], (k) => { if (tk === S.hudTk) span.textContent = num(from + (v - from) * k, 2); });
  }

  function drawCurve(final) {
    const svg = scrub.querySelector('#curve'); if (!svg) return;
    const w = svg.clientWidth, h = svg.clientHeight;
    const gapPx = 10, cw = (w - gapPx * 7) / 8;
    const pts = MONTHS.map((m, i) => S.arrived[m] ? [i * (cw + gapPx) + cw / 2, h - yk(S.arrived[m].v) * h] : null);
    const got = pts.filter(Boolean);
    const dd = got.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const path = svg.querySelector('.g-curve');
    path.setAttribute('d', dd);
    svg.querySelectorAll('circle').forEach((c) => c.remove());
    got.forEach((p) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('class', 'g-curve__pt'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 4); svg.appendChild(c); });
    if (final && path.getTotalLength && !S.fast) {   // 곡선 완성 — 선 긋기 750
      const L = path.getTotalLength(); path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
      tween(D[750], (k) => { path.style.strokeDashoffset = String(L * (1 - k)); });
    }
  }

  /** 분포 막대(히스토그램 자리) — hist.bins 경계(10 또는 20 구간 · 계약 v1.1-10) · 세로 = NDVI 축(−0.1…0.8) · 폭 = 화소 수(좌우 대칭)
      + p10–p90 괄호 · p50 점. 반환 = 그렸는가. 없으면 슬롯에 data-dist="pending". */
  function drawDist(m, x) {
    const slot = scrub.querySelector(`.g-slot[data-m="${m}"]`); if (!slot) return false;
    const box = slot.querySelector('.g-slot__hist');
    const h = x && x.hist;
    if (!h || !Array.isArray(h.counts) || !h.counts.length) { slot.dataset.dist = 'pending'; return false; }
    const n = h.counts.length;
    const edges = Array.isArray(h.bins) && h.bins.length === n + 1 ? h.bins : Array.from({ length: n + 1 }, (_, j) => -0.2 + j / n);
    const inAxis = (j) => edges[j + 1] > LO && edges[j] < HI;
    const mx = Math.max(1, ...h.counts.filter((c, j) => inAxis(j)));
    let html = h.counts.map((c, j) => {
      if (!inAxis(j)) return '';
      const a = Math.max(LO, edges[j]), b = Math.min(HI, edges[j + 1]), w = (c / mx) * 100;
      return `<i style="bottom:${(yk(a) * 100).toFixed(2)}%;height:${((yk(b) - yk(a)) * 100).toFixed(2)}%;width:${w.toFixed(1)}%;left:${((100 - w) / 2).toFixed(1)}%;background:${ndviColor((a + b) / 2)}"></i>`;
    }).join('');
    const p10 = V(x.p10), p50 = V(x.p50), p90 = V(x.p90);
    if (p10 != null && p90 != null) {
      const b0 = yk(p10), b1 = yk(p90), mid = p50 != null ? (yk(p50) - b0) / Math.max(1e-6, b1 - b0) : 0.5;
      html += `<b class="g-slot__pq" style="bottom:${(b0 * 100).toFixed(1)}%;height:${((b1 - b0) * 100).toFixed(1)}%" title="p10 ${p10} · p50 ${p50 ?? '—'} · p90 ${p90}"><i style="bottom:${(mid * 100).toFixed(1)}%"></i></b>`;
    }
    box.innerHTML = html;
    slot.dataset.dist = 'on';
    S.dist[m] = { hist: h, p10, p50, p90, valid_px: V(x.valid_px) };
    return true;
  }
  /** 분포 표기 — 라이브(on)에서 도착 칸에 분포가 없으면 'distribution pending (gateway)' 결손 · 서버에서 채우면 출처 표기. */
  function distNote() {
    const idx = scrub.querySelector('#scrub-idx'); if (!idx) return;
    const done = MONTHS.filter((m) => S.arrived[m]);
    const pending = done.filter((m) => !S.dist[m]);
    if (done.length && pending.length) { idx.innerHTML = `<span class="g-xchip" style="margin-left:0">${t('scrub.pending')}</span>`; idx.dataset.dist = 'pending'; }
    else if (done.length) { idx.innerHTML = `<b>${t('scrub.dist')}</b>${S.distFrom ? ` · <span class="g-scrub__from">${S.distFrom}</span>` : ''}`; idx.dataset.dist = 'on'; }
    else { idx.innerHTML = `<b>${t('scrub.idx')}</b>`; delete idx.dataset.dist; }
  }

  function onEvent(name, data) {
    if (!data) return;
    if (name === 'job.queued') { hud.querySelector('#hud-shard').textContent = `queued · ${data.pool || 'cpu'} · #${data.position ?? 0}`; S.jobId ||= data.job_id; }
    if (name === 'job.started') {
      P.t0 = Date.parse(data.at) || null; P.wall0 = performance.now(); P.total = data.shards_total || 8; P.done = 0; P.ms = []; P.srv = null;
      hudProgress(data.at); startTicker();
    }
    if (name === 'shard.started') {
      const m = data.month || data.shard_id.slice(1);
      scrub.querySelector(`.g-slot[data-m="${m}"]`)?.setAttribute('data-state', 'running');
      P.cur = m; P.curAt = performance.now();
      if (data.worker) S.worker = data.worker;
      if (!S.fast) setMonth(m);
    }
    if (name === 'shard.done') {
      P.done = Math.min(P.total, P.done + 1); if (data.ms) P.ms.push(data.ms);
      S.shardMs[(data.shard_id || '').replace(/^m/, '')] = data.ms;
      hudProgress(data.at);
    }
    if (name === 'shard.failed') { hud.querySelector('#hud-eta').textContent = `shard.failed · ${data.shard_id} · ${data.error || ''}`; }
    if (name === 'index.month') S.chain = S.chain.then(() => arrive(data));   // 도착은 순서대로 하나씩(스윕 1000 → 현상 500)
    if (name === 'job.progress') {
      P.done = Math.max(P.done, data.shards_done || 0); P.total = data.shards_total || P.total;
      if (data.elapsed_s != null && !data.replay) { P.srv = +data.elapsed_s; P.srvAt = performance.now(); }
      S.progressSeen = (S.progressSeen || 0) + 1;
      hudProgress(data.at);
    }
    if (name === 'job.done') { clearInterval(P.tick); S.chain = S.chain.then(() => done(data)); }
    if (name === 'job.failed') { clearInterval(P.tick); hud.querySelector('#hud-eta').textContent = `job.failed · ${data.error || ''}`; S.job = 'failed'; }
  }
  async function arrive(ev) {
    const m = ev.month, v = ev.ndvi_mean?.value;
    const slot = scrub.querySelector(`.g-slot[data-m="${m}"]`);
    S.arrived[m] = { v, n: V(ev.n_scenes), env: ev.ndvi_mean, p10: V(ev.p10), p50: V(ev.p50), p90: V(ev.p90), valid_px: V(ev.valid_px), basis: ev.basis || ev.ndvi_mean?.basis, from: ev.replay ? 'replay' : 'SSE index.month' };
    // 스윕 1000 → 결과 현상 500(지나간 뒤에만) · 딥링크 재현(?job=)은 스윕 없이
    show(map, ctx.ladder.ndvi[m], true);
    if (!S.fast) await sweep(stage, YS.plain);
    S.ndviOn = true;
    if (!S.fast) setMonth(m); else { for (const mm of MONTHS) opacity(map, ctx.ladder.ndvi[mm], mm === m ? 0.88 : 0); }
    drawDist(m, ev);
    slot.style.setProperty('--h', `${(yk(v) * 100).toFixed(1)}%`);
    slot.style.setProperty('--c', ndviColor(v));
    slot.querySelector('.g-slot__v').textContent = num(v, 2);
    slot.querySelector('.g-slot__n').textContent = `n ${V(ev.n_scenes)}`;
    slot.setAttribute('data-state', 'done');
    distNote();
    hudNum(v);
    hud.querySelector('#hud-line').textContent = t('hud.line', { n: V(ev.n_scenes), worker: S.worker || 'cpu-0' });
    drawCurve(false);
    const sp = scrub.querySelector('#scrub-prov');
    if (sp && !sp.firstChild && ev.ndvi_mean) sp.appendChild(prov({ ...ev.ndvi_mean, basis: ev.basis === 'demo' ? 'demo' : ev.ndvi_mean.basis }));
  }

  /** job.done 뒤 — GET /results/{job}/index(계약 v1.1-20)로 월별 분포 · 분위수를 서버 값으로 채운다(CSV = 서버 값).
      라우트가 아직 없으면(F2-B 전) 부르지 않고 결손 표기를 유지한다(404 콘솔 오류 0). */
  async function fillFromServer(jobId) {
    if (API.mode !== 'on' || !S.live || !jobId) return { skipped: 'mode' };
    if (!(await hasRoute(/^\/api\/v1\/results\/\{[^}]+\}\/index$/))) { S.serverIndex = { route: false }; return { skipped: 'route' }; }
    let j = null;
    try { j = await api(`/results/${encodeURIComponent(jobId)}/index?format=json`); } catch (e) { S.serverIndex = { route: true, error: e.code || e.message }; return { error: e.code }; }
    const list = Array.isArray(j) ? j : j.items || j.months || j.rows || [];
    let n = 0;
    for (const r of list) {
      const mt = r.metrics || r;
      const m = r.month || r.key || String(r.shard_id || '').replace(/^m/, '');
      if (!MONTHS.includes(m)) continue;
      const x = { hist: mt.hist, p10: mt.p10, p50: mt.p50, p90: mt.p90, valid_px: mt.valid_px };
      if (S.arrived[m]) Object.assign(S.arrived[m], { p10: V(x.p10) ?? S.arrived[m].p10, p50: V(x.p50) ?? S.arrived[m].p50, p90: V(x.p90) ?? S.arrived[m].p90, valid_px: V(x.valid_px) ?? S.arrived[m].valid_px, from: 'GET /results/{job}/index' });
      if (drawDist(m, x)) n++;
    }
    S.serverIndex = { route: true, rows: list.length, drawn: n };
    if (n) S.distFrom = 'GET /results/{set}/index';
    distNote();
    return { rows: list.length, drawn: n };
  }

  function done(ev) {
    drawCurve(true);
    const replayed = API.mode !== 'on' || !S.live;
    S.result = { job_id: ev.job_id || S.jobId, result_set: ev.result_set || (S.jobId ? `results/${ctx.tenant}/${S.jobId}` : null), elapsed_s: ev.elapsed_s, at: ev.at, replayed };
    const btn = card.querySelector('#ys-run');
    btn.textContent = t('ys.rerun'); btn.disabled = false; btn.classList.add('g-btn--ghost');
    btn.onclick = () => rerun();
    card.querySelector('#ys-gap').replaceChildren(gap(t('ys.gap'), t('ys.gap.why')));
    P.done = Math.max(P.done, ev.counts?.months || 0);
    hudProgress(ev.at);
    hud.querySelector('#hud-shard').innerHTML = `job.done · <b>${num(ev.elapsed_s, 1)}</b> s · ${P.done}/${P.total} shard`;
    S.job = 'done';
    S.filled = fillFromServer(S.result.job_id).catch(() => ({ error: 'fill' })).then((r) => { renderNext(); root.dispatchEvent(new CustomEvent('f2d:dist-filled', { detail: r })); return r; });
    root.dispatchEvent(new CustomEvent('f1d:gj1-done', { detail: { ...ev, job_id: S.result.job_id } }));
  }
  function rerun() {
    S.job = null; S.arrived = {}; S.shardMs = {}; S.result = null; S.live = false; S.dist = {}; S.distFrom = null; S.fast = false;
    scrub.querySelectorAll('.g-slot').forEach((sl) => { sl.removeAttribute('data-state'); delete sl.dataset.dist; sl.querySelector('.g-slot__hist').innerHTML = ''; sl.querySelector('.g-slot__v').textContent = ''; sl.querySelector('.g-slot__n').textContent = ''; });
    scrub.querySelector('#curve .g-curve')?.setAttribute('d', ''); scrub.querySelectorAll('#curve circle').forEach((c) => c.remove());
    card.querySelector('#ys-next')?.remove();
    distNote();
    const btn = card.querySelector('#ys-run'); btn.classList.remove('g-btn--ghost'); btn.onclick = () => run();
    run();
  }

  /* ── 완성형: 시작 → 결과 → 다음 행동 ─────────
     결과 열기(월별 표) · 내보내기 CSV·GeoJSON(서버 값 · 봉투 포함) · 계보(F1-A fx/lineage) + 관제 실링크(:8702 infra.html?job=) · 보고서에 첨부. */
  function rows() {
    return MONTHS.filter((m) => S.arrived[m]).map((m) => ({ month: m, ndvi_mean: S.arrived[m].v, p10: S.arrived[m].p10 ?? null, p50: S.arrived[m].p50 ?? null, p90: S.arrived[m].p90 ?? null,
      valid_px: S.arrived[m].valid_px ?? null, n_scenes: S.arrived[m].n, shard_ms: S.shardMs[m] ?? null, basis: S.result?.replayed ? 'recorded' : (S.arrived[m].basis || 'measured'),
      source: S.arrived[m].env?.source || 'PC S2 L2A B04/B08 · WorldCover 40 mask', values_from: S.arrived[m].from || '' }));
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, D[1000]);
  }
  const fileBase = () => String(S.result?.result_set || S.result?.job_id || 'gj1-ysykata').replace(/[\\/]+/g, '_');
  function toCsv() {
    const head = ['month', 'ndvi_mean', 'p10', 'p50', 'p90', 'valid_px', 'n_scenes', 'shard_ms', 'basis', 'source', 'values_from', 'job_id', 'result_set'];
    return '﻿' + [head.join(','), ...rows().map((r) => [r.month, r.ndvi_mean, r.p10 ?? '', r.p50 ?? '', r.p90 ?? '', r.valid_px ?? '', r.n_scenes, r.shard_ms ?? '', r.basis, `"${r.source}"`, `"${r.values_from}"`, S.result.job_id, S.result.result_set || ''].join(','))].join('\n');
  }
  function toGeojson() {
    return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(YS.plain)] },
      properties: { deploy_id: 'dp-kgz-agri-farm-26', kind: 'index', model_id: 'index/ndvi_pc', job_id: S.result.job_id, result_set: S.result.result_set, replayed: S.result.replayed,
        note: 'Index calc · not model inference · T43TEH · WorldCover 40 cropland mask', license: 'Contains modified Copernicus Sentinel data 2025 · ESA WorldCover 2021 CC BY 4.0',
        exported_at: new Date().toISOString(), months: rows() } }] }, null, 1);
  }
  function reportHtml() {
    const R = rows(), w = 640, h = 180, x = (m) => 40 + MONTHS.indexOf(m) * ((w - 60) / 7), y = (v) => h - 24 - yk(v) * (h - 44);
    const path = R.map((r, i) => `${i ? 'L' : 'M'}${x(r.month).toFixed(1)} ${y(r.ndvi_mean).toFixed(1)}`).join(' ');
    const r0 = S.result;
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>G-J1 · Ysyk-Ata NDVI 2025 · ${r0.job_id}</title>
<style>body{font:15px/1.5 Pretendard,Inter,system-ui,sans-serif;color:#010102;margin:40px;max-width:760px}h1{font-size:24px;margin:0 0 4px}small{color:#5B6472}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border-bottom:1px solid #DDE2EA;padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}.chip{display:inline-block;border:1px dashed #5B6472;padding:2px 8px;margin-right:6px;font-size:14px}@media print{button{display:none}}</style>
<h1>Farmland NDVI · Ysyk-Ata (Ысык-Ата) · 2025</h1><small>dp-kgz-agri-farm-26 · ${r0.job_id} · ${r0.result_set || ''} · ${r0.replayed ? 'demo · replay of recorded run' : 'live run'}</small>
<p><span class="chip">Index calc · not model inference</span><span class="chip">measured · PC S2 L2A B04/B08 · WorldCover 40 mask</span></p>
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${path}" fill="none" stroke="#0FA9A0" stroke-width="2"/>${R.map((r) => `<circle cx="${x(r.month)}" cy="${y(r.ndvi_mean)}" r="4" fill="#0FA9A0"/><text x="${x(r.month)}" y="${h - 4}" font-size="12" text-anchor="middle">${r.month.slice(5)}</text>`).join('')}</svg>
<table><tr><th>Month</th><th>NDVI mean</th><th>p10</th><th>p50</th><th>p90</th><th>Scenes</th><th>Shard s</th></tr>${R.map((r) => `<tr><td>${r.month}</td><td>${r.ndvi_mean.toFixed(3)}</td><td>${r.p10 ?? '—'}</td><td>${r.p50 ?? '—'}</td><td>${r.p90 ?? '—'}</td><td>${r.n_scenes}</td><td>${r.shard_ms ? (r.shard_ms / 1000).toFixed(1) : '—'}</td></tr>`).join('')}</table>
<p><small>Crop type classification: AI task · training data required (not in this report). Contains modified Copernicus Sentinel data 2025.</small></p><button onclick="print()">Print / PDF</button></html>`;
  }
  function openTable(sec, b) {
    const tb = sec.querySelector('#ys-table'); const on = tb.hidden; tb.hidden = !on; b.setAttribute('aria-expanded', String(on));
    if (on) tb.innerHTML = `<table class="g-table"><tr><th>${t('ys.t.m')}</th><th>NDVI</th><th>p10</th><th>p50</th><th>p90</th><th>${t('ys.t.s')}</th></tr>${rows().map((x) => `<tr><td>${monLabel(x.month)}</td><td>${num(x.ndvi_mean, 3)}</td><td>${x.p10 != null ? num(x.p10, 3) : '—'}</td><td>${x.p50 != null ? num(x.p50, 3) : '—'}</td><td>${x.p90 != null ? num(x.p90, 3) : '—'}</td><td>${x.shard_ms ? num(x.shard_ms / 1000, 1) : '—'}</td></tr>`).join('')}</table>`;
  }
  function renderNext() {
    card.querySelector('#ys-next')?.remove();
    const sec = document.createElement('section');
    sec.className = 'g-sec g-in'; sec.id = 'ys-next';
    const r = S.result, canReport = ctx.tenant !== 'guest';
    // 관제 실링크 — 라이브 작업만(게이트웨이 jobs 표에 있는 id). 리플레이의 기록 job 은 관제에 없다 → 정직한 결손 칩.
    const live = !r.replayed && r.job_id;
    const opsHref = live ? opsJobHref(r.job_id) : null;
    sec.innerHTML = `<div class="g-sec__t"><span>${t('ys.next')}</span><b>${r.replayed ? t('ys.next.demo') : t('ys.live')}</b></div>
      <div class="g-actions"><button class="g-btn" data-a="open" aria-expanded="false">${t('ys.open')}</button><button class="g-btn g-btn--ghost" data-a="csv">CSV</button><button class="g-btn g-btn--ghost" data-a="geojson">GeoJSON</button>
        ${canReport ? `<button class="g-btn g-btn--ghost" data-a="report">${t('ys.report')}</button>` : ''}</div>
      <div class="g-lineage"><span class="g-lineage__chain"></span>${opsHref ? `<a class="g-lineage__ops" href="${opsHref}" data-job="${r.job_id}">${t('ys.ops')}</a>` : `<span class="g-lineage__wait" data-job="${r.job_id || ''}">${t('ys.ops.replay')}</span>`}</div>
      <div class="g-note" id="ys-next-note">${r.replayed ? t('ys.next.replay') : ''}</div>
      <div id="ys-table" hidden></div>`;
    // 계보(F1-A fx/lineage) — 배포본 → 기관 → 작업 · 영문판은 종류 이름을 영문으로(fx 는 국문 고정 → 결과 문서 인터페이스 요청 3)
    const ch = sec.querySelector('.g-lineage__chain');
    lineage(ch, [{ kind: 'deploy', id: 'dp-kgz-agri-farm-26' }, { kind: 'tenant', id: S.jobTenant || (ctx.tenant === 'guest' ? 'public' : ctx.tenant) }, { kind: 'job', id: r.job_id || '—', label: r.job_id || '—' }]);
    if (document.documentElement.lang !== 'ko') {
      ch.querySelectorAll('.xi-ln').forEach((n) => { const k = n.dataset.kind; const i = n.querySelector('i'); if (i && LN_EN[k]) i.textContent = LN_EN[k]; });
      ch.setAttribute('aria-label', 'lineage ' + [...ch.querySelectorAll('.xi-ln')].map((n) => `${LN_EN[n.dataset.kind] || n.dataset.kind} ${n.querySelector('b')?.textContent || ''}`).join(' → '));
    }
    card.appendChild(sec);
    requestAnimationFrame(() => sec.scrollIntoView({ block: 'nearest', behavior: S.fast ? 'auto' : 'smooth' }));
    const note = sec.querySelector('#ys-next-note');
    if (S.serverIndex && !r.replayed) note.textContent = S.serverIndex.drawn ? t('ys.dist.filled', { n: S.serverIndex.drawn }) : S.serverIndex.route === false ? t('ys.dist.noroute') : '';
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'open') openTable(sec, b);
      if (b.dataset.a === 'csv') { download(fileBase() + '.csv', toCsv(), 'text/csv'); note.textContent = t('ys.saved', { f: fileBase() + '.csv' }); }
      if (b.dataset.a === 'geojson') { download(fileBase() + '.geojson', toGeojson(), 'application/geo+json'); note.textContent = t('ys.saved', { f: fileBase() + '.geojson' }); }
      if (b.dataset.a === 'report') {
        try {
          const k = 'lx_report_tray'; const tray = JSON.parse(localStorage.getItem(k) || '[]').filter((x) => x.job_id !== r.job_id);
          tray.push({ job_id: r.job_id, result_set: r.result_set, title: 'Ysyk-Ata NDVI 2025', at: new Date().toISOString() });
          localStorage.setItem(k, JSON.stringify(tray)); note.textContent = t('ys.attached', { n: tray.length });
        } catch { /* 저장소 없음 — 보고서 창만 */ }
        const u = URL.createObjectURL(new Blob([reportHtml()], { type: 'text/html' })); window.open(u, '_blank', 'noopener');
        b.textContent = t('ys.report.done');
      }
    });
    if (API.mode === 'on' && S.live && r.job_id) {   // 게이트웨이의 작업 기록과 대조(계보 = 실제 job 행)
      apiJob(r.job_id).then((j) => { const x = j.job || j; const g = `gateway · ${x.state} · ${x.shards_done ?? '?'}/${x.shards_total ?? '?'} shard · ${x.result_set || ''}`; note.textContent = note.textContent ? `${note.textContent} · ${g}` : g; }).catch(() => {});
    }
  }

  async function run({ speed } = {}) {
    if (S.job) return;
    S.job = 'running';
    const btn = card.querySelector('#ys-run'); btn.disabled = true; btn.textContent = t('ys.running');
    hudShow();
    distNote();
    if (authed()) {
      try {
        const r = await apiSubmit(body());
        S.live = true; P.wall0 = performance.now();
        hud.querySelector('#hud-tag').textContent = t('hud.live');
        S.sub = sse(r.events_url.replace(/^\/api\/v1/, ''), { on: onEvent });
        S.jobId = r.job.id; S.jobTenant = r.job.tenant_id || null;
        return;
      } catch { /* 워커 없음 → 리플레이(계약 §10 worker_unavailable) */ }
    }
    const rec = ctx.replayMeta;
    const sp = speed || ctx.replaySpeed || 1;
    hud.querySelector('#hud-tag').textContent = t('hud.replay', { x: Math.round(sp), date: rec?.date || '2026-09-24' });
    API.reason = '저장 결과 재생';   // api-v1 mastLabel 이 이 값으로 영문 'Demo · replaying stored results' 를 고른다(표시는 영문)
    S.sub = replay(new URL('replay/gj1-ysykata.ndjson', DATA).href, { on: onEvent, speed: sp });
    root.dispatchEvent(new CustomEvent('f1d:mode'));
  }

  /** ?job= 딥링크(계약 v1.1-29 · 기관 화면) — 그 작업의 사건 스트림을 처음부터 다시 읽어(스윕 없이) 슬롯·곡선을 복원하고 결과 절을 연다.
      off 모드는 기록 실행(리플레이) id 만 연다. */
  async function openJob(id) {
    S.fast = true;
    frame();
    hudShow();
    const opened = new Promise((r) => root.addEventListener('f1d:gj1-done', r, { once: true }));
    if (API.mode === 'on') {
      let x = null;
      if (authed()) { try { const j = await apiJob(id); x = j.job || j; } catch { x = null; } }
      if (!x || (x.kind && x.kind !== 'index')) {
        card.querySelector('#ys-gap').replaceChildren(gap(t('ys.job.missing'), `${id}`));
        S.fast = false; return false;
      }
      S.job = 'running'; S.live = true; S.jobId = id; S.jobTenant = x.tenant_id || null;
      const btn = card.querySelector('#ys-run'); btn.disabled = true; btn.textContent = t('ys.job.open');
      hud.querySelector('#hud-tag').textContent = t('hud.deeplink', { id });
      S.sub = sse(`/events/jobs/${encodeURIComponent(id)}`, { on: onEvent });
    } else {
      run({ speed: 400 });
    }
    await opened;
    await S.filled;
    S.sub && S.sub.close && S.sub.close();
    const sec = card.querySelector('#ys-next');
    const b = sec?.querySelector('[data-a="open"]');
    if (b && b.getAttribute('aria-expanded') !== 'true') openTable(sec, b);
    sec?.scrollIntoView({ block: 'nearest' });
    S.fast = false;
    root.dispatchEvent(new CustomEvent('f2d:job-opened', { detail: { job_id: id } }));
    return true;
  }

  return {
    S, renderCard, renderScrub, setMonth, play, frame, quote, run, bars, hudShow, openJob, rows, toCsv, fillFromServer,
    async enter({ tour = false } = {}) {
      addBoundaries(map, d);
      stage.inKgz = true; stage.pcOn = true;
      const L = ctx.ladder;
      for (const m of MONTHS) { show(map, L.months[m], m === S.month); opacity(map, L.months[m], m === S.month ? 1 : 0); }   // 보이는 달만(나머지는 착지 화면이 찬 뒤 스크러버가 켠다)
      map.setPaintProperty('ys-line', 'line-opacity', 1);
      map.setPaintProperty('ys-halo', 'line-opacity', 1);
      lockOn(stage, YS.bbox, { name: 'Ysyk-Ata', cyr: 'Ысык-Ата', sub: 'ADM2 · geoBoundaries' });
      pin(stage, [74.59, 42.87], `<b>Bishkek</b><span class="g-cyr" lang="ru">Бишкек</span>`, 'g-place');
      renderCard();
      await wait(tour ? D[500] : D[380]);
      bars();
    },
    leave() {
      S.playing = false; TS && TS.stop(); S.sub && S.sub.close && S.sub.close(); stage.pcOn = false; clearInterval(P.tick);
      for (const m of MONTHS) { show(map, ctx.ladder.months[m], false); show(map, ctx.ladder.ndvi[m], false); }
      ['ys-line', 'ys-halo', 'frame-line'].forEach((l) => map.getLayer(l) && map.setPaintProperty(l, 'line-opacity', 0));
      map.getLayer('frame-dim') && map.setPaintProperty('frame-dim', 'fill-opacity', 0);
      hud.hidden = true; scrub.hidden = true;
    },
  };
}
export { CAM_YS as camera };
