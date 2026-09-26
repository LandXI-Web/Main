/* K-1 으슥아타 · G-J1 — dp-kgz-agri-farm-26(canary)
   경계 락온 · WorldCover 비율 막대(비율만 유효) · 월별 S2 모자이크 스크럽 3→10(timescrub · 크로스페이드 500 · 정수 750 정지 · 6s)
   G-J1: 프레임(ADM2 평원) → 견적 → 제출(kind index) → SSE(on) / 리플레이(off) → shard = 월 8칸이 히스토그램 자리에 순서대로 도착.
   HUD 는 job.progress · index.month 에서만 읽는다. 지수 계산 · 모델 추론 아님. */
import { API, quote as apiQuote, submit as apiSubmit, sse, replay, fixture, env, job as apiJob } from '/landxi/shared/api-v1.js';
import { t, num, area } from './i18n.js';
import { D, fly, lockOn, sweep, prov, pin, wait, tween, STAGGER } from './globe-stage.js';
import { MONTHS, show, opacity } from './ladder-global.js';
import { cardHead, gap, reveal } from './cards-global.js';

const DATA = new URL('../data/', import.meta.url);
export const YS = { code: '92254566B31675215078110', bbox: [74.6868, 42.419, 75.183, 43.0039], plain: [74.70, 42.75, 75.20, 43.00] };
export const CAM_YS = { center: [74.93, 42.86], zoom: 9.55, pitch: 0, bearing: 0 };
const ring = (b) => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
const LO = -0.1, HI = 0.8;               // 칸 세로축 = NDVI(곡선·평균·분포 같은 축)
const yk = (v) => Math.max(0, Math.min(1, (v - LO) / (HI - LO)));
const ndviColor = (v) => (v < 0.1 ? 'var(--ndvi-0)' : v < 0.2 ? 'var(--ndvi-1)' : v < 0.3 ? 'var(--ndvi-2)' : v < 0.4 ? 'var(--ndvi-3)' : 'var(--ndvi-4)');
const MON_EN = { '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct' };
const monLabel = (m) => (document.documentElement.lang === 'ko' ? `${+m.slice(5)}월` : MON_EN[m.slice(5)]);

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
  const S = { month: '2025-06', job: null, arrived: {}, shardMs: {}, playing: false, sub: null, chain: Promise.resolve() };

  /* ── 카드 ─────────────────────────────────────────────────────────── */
  function renderCard() {
    const dep = ctx.deploys.byId['dp-kgz-agri-farm-26'];
    const cls = d.lc.classes.filter((c) => c.pct.value >= 1).slice(0, 6);
    const crop = d.lc.classes.find((c) => c.code === 40);
    card.innerHTML = cardHead(dep, { title: document.documentElement.lang === 'ko' ? '농지 이용 실태 · 으슥아타' : 'Farmland use · Ysyk-Ata', place: t('ys.place'), cyr: 'Ысык-Ата' }) + `
      <section class="g-sec g-in-3"><div class="g-sec__t"><span>${t('ys.lc')}</span><b data-crop>${t('ys.lc.crop')} ${num(crop.pct.value, 1)}%</b></div>
        <ul class="g-bars" id="ys-bars">${cls.map((c) => `<li class="g-bar" ${c.code === 40 ? 'data-hl' : ''}><span>${document.documentElement.lang === 'ko' ? c.name_ko : c.name_en}</span><span class="g-bar__track"><span class="g-bar__fill" style="--w:${Math.min(100, c.pct.value / 45 * 100)}%"></span></span><em>${num(c.pct.value, 1)}%</em></li>`).join('')}</ul>
        <div id="ys-lc-prov" style="margin-top:8px"></div></section>
      <section class="g-sec g-in-4" id="ys-job"><div class="g-sec__t"><span>${t('ys.frame')}</span><b>${t('ys.frame.v')}</b></div>
        <dl class="g-quote" id="ys-quote"><div><dt>${t('ys.quote.area')}</dt><dd>—</dd></div><div><dt>${t('ys.quote.shards')}</dt><dd>—</dd></div><div><dt>${t('ys.quote.gpu')}</dt><dd>—</dd></div></dl>
        <div class="g-run"><button class="g-btn" id="ys-run" disabled>${t('ys.run')}</button><span class="g-note" id="ys-run-note">${t('ys.quote.pool')}</span></div>
        <div id="ys-gap"></div></section>`;
    const lp = card.querySelector('#ys-lc-prov');
    lp.appendChild(prov(crop.pct));
    if (crop.area_ha) { const h = document.createElement('div'); h.className = 'g-note'; h.style.marginTop = '6px'; h.innerHTML = `<b style="color:var(--cw-ink)">${t('ys.lc.crop')} ${area(crop.area_ha, 'ha')}</b> · 10 m recount · adapter_worldcover`; lp.appendChild(h); }
    card.querySelector('#ys-run').onclick = () => run();
    reveal(card);
  }
  const bars = () => card.querySelector('#ys-bars')?.setAttribute('data-on', '');

  /* ── 월 스크러버 + 히스토그램 자리 ─────────────────────────────────── */
  function renderScrub() {
    scrub.hidden = false;
    scrub.innerHTML = `<div class="g-scrub__head"><span><b>${t('scrub.h')}</b></span><span id="scrub-idx">${t('scrub.idx')}</span></div>
      <div class="g-scrub__plot"><div class="g-slots">${MONTHS.map((m) => `<div class="g-slot" data-m="${m}"><div class="g-slot__n"></div><div class="g-slot__hist"></div><div class="g-slot__bar"></div><div class="g-slot__v"></div></div>`).join('')}</div>
        <svg id="curve" aria-hidden="true"><path class="g-curve--ghost" d=""/><path class="g-curve" d="" /></svg>
        <div class="g-months">${MONTHS.map((m) => `<button class="g-month" data-m="${m}" aria-current="${m === S.month}">${monLabel(m)}</button>`).join('')}</div></div>
      <div class="g-scrub__foot"><span id="scrub-prov"></span><span class="g-note" id="scrub-note"></span></div>`;
    scrub.addEventListener('click', (e) => { const b = e.target.closest('.g-month'); if (b) { S.playing = false; setMonth(b.dataset.m); } });
  }
  function setMonth(m, withNdvi = S.ndviOn) {
    S.month = m;
    const L = ctx.ladder;
    for (const mm of MONTHS) {
      opacity(map, L.months[mm], mm === m ? 1 : 0);
      if (withNdvi && S.arrived[mm]) opacity(map, L.ndvi[mm], mm === m ? 0.88 : 0);
    }
    scrub.querySelectorAll('.g-month').forEach((b) => b.setAttribute('aria-current', String(b.dataset.m === m)));
    ctx.chip.month(m);
  }
  /** timescrub — 3→10 · 크로스페이드 500 · 정수 750 정지 · 6s(8 × 750). */
  async function play() {
    S.playing = true;
    for (const m of MONTHS) { if (!S.playing) return; setMonth(m); await wait(D[750]); }
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
  // kind index 는 imagery_id 를 보내지 않는다 — 'pc-s2-mosaic' 은 외부 사다리 항목이라 게이트웨이 imagery 표에 없다(404 · 콘솔 오류).
  // 원천은 options.source 로 기록(계약 변경 요청 §4.4 · F1-D-result.md)
  const body = () => ({ kind: 'index', model_id: 'index/ndvi_pc', deploy_id: 'dp-kgz-agri-farm-26', card_id: 'card-global-farm',
    aoi: { type: 'Polygon', coordinates: [ring(YS.plain)] }, options: { months: MONTHS, cloud_max: 15, mask: 'worldcover-40', source: 'pc-s2-mosaic' }, priority: 0, demo: API.mode !== 'on' });

  async function quote() {
    let q;
    if (API.mode === 'on') {
      try { q = await apiQuote(body()); } catch { q = null; }
    }
    if (!q) {   // off: 같은 형(계약 §4.4) — 면적은 구면 bbox 공식으로 실측 계산
      const R = 6371.0088, b = YS.plain, rad = Math.PI / 180;
      const a = R * R * (b[2] - b[0]) * rad * (Math.sin(b[3] * rad) - Math.sin(b[1] * rad));
      q = { area_km2: env(+a.toFixed(1), 'km2', 'measured', 'spherical bbox area (R 6371.0088 km)'), shards: 8, shards_env: env(8, 'count', 'measured', 'options.months'),
            gpu_s: env(0, 'gpu_s', 'estimate', 'cpu 워커 — GPU 미사용'), allowed: true, reasons: [], pool: 'cpu' };
    }
    const dd = card.querySelectorAll('#ys-quote dd');
    dd[0].innerHTML = `${num(q.area_km2.value, 0)}<small>${t('unit.km2')}</small>`;
    dd[1].innerHTML = `${q.shards}<small>${document.documentElement.lang === 'ko' ? '개월' : 'months'}</small>`;
    dd[2].innerHTML = `${num(q.gpu_s.value ?? 0, 0)}<small>gpu·s</small>`;
    const btn = card.querySelector('#ys-run'); btn.disabled = !q.allowed;
    S.quote = q;
    return q;
  }

  function hudShow() {
    hud.hidden = false; S.hudV = null;
    hud.innerHTML = `<div class="g-hud__k g-in">${t('hud.k')}</div><div class="g-hud-big" id="hud-big">—</div>
      <div class="g-hud__line g-in-2" id="hud-line">${t('hud.line', { n: '—', worker: 'cpu-0' })}</div>
      <div class="g-hud__line g-in-3" id="hud-shard">${t('hud.shard', { a: 0, b: 8 })}</div>
      <div class="g-hud__line g-hud__eta g-in-3" id="hud-eta"></div>
      <div class="g-hud__tag g-in-4" id="hud-tag"></div>`;
  }
  /* ── 진행 카운터(판정 1차 불합격 · 라이브 HUD 정지) ─────────────────────
     실 게이트웨이 cpu 워커는 shard.started / shard.done / index.month 만 낸다(job.progress 없음 — 계약 변경 요청).
     → shard.done 에서 a/b · 경과 · 월별 실측 ms 를 갱신하고, 견적 eta(null) 대신 '다음 칸 ≈ 최근 월 실측' 을 추정으로 표시.
     on 모드는 1 Hz 로 경과 초와 진행 중 칸의 초를 올린다(시계 = 이 브라우저 · 사건 시각이 오면 그것으로 보정). */
  const P = { t0: null, wall0: null, total: 8, done: 0, ms: [], cur: null, curAt: null, tick: 0 };
  const secs = (v) => num(v, v < 10 ? 1 : 0);
  function elapsedS(at) {
    if (at && P.t0) { const d = (Date.parse(at) - P.t0) / 1000; if (isFinite(d) && d >= 0) return d; }
    return P.wall0 ? (performance.now() - P.wall0) / 1000 : 0;
  }
  function hudProgress(at) {
    const el = hud.querySelector('#hud-shard'); if (!el) return;
    el.innerHTML = `${t('hud.shard', { a: P.done, b: P.total })} · <b>${secs(elapsedS(at))}</b> s ${t('hud.elapsed')}`;
    const eta = hud.querySelector('#hud-eta');
    if (P.ms.length && eta) {
      const last = P.ms[P.ms.length - 1] / 1000, left = P.total - P.done;
      eta.innerHTML = left > 0 ? t('hud.eta', { last: secs(last), next: secs(last) }) : t('hud.eta.done', { mean: secs(P.ms.reduce((a, b) => a + b, 0) / P.ms.length / 1000) });
      eta.title = t('hud.eta.basis');
    }
  }
  function startTicker() {
    clearInterval(P.tick);
    if (API.mode !== 'on' || !S.live) return;   // 리플레이는 기록 시각(사건 at)으로만 — 가짜 진행 0
    P.tick = setInterval(() => {
      if (S.job !== 'running') return clearInterval(P.tick);
      hudProgress(null);
      if (P.cur && P.curAt) { const sl = scrub.querySelector(`.g-slot[data-m="${P.cur}"][data-state="running"] .g-slot__n`); if (sl) sl.textContent = `${secs((performance.now() - P.curAt) / 1000)} s`; }
    }, D[1000]);
  }
  /** 큰 숫자 — 첫 값은 한 번에 g-in · 다음부터는 이전 값 → 새 값 트윈 380(0 으로 깜빡이는 자리 재조립 0 · 판정 2차). */
  function hudNum(v) {
    const el = hud.querySelector('#hud-big');
    let span = el.querySelector('.g-hud-big__v');
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
    const w = svg.clientWidth, h = svg.clientHeight - 24;
    const gapPx = 10, cw = (w - gapPx * 7) / 8;
    const pts = MONTHS.map((m, i) => S.arrived[m] ? [i * (cw + gapPx) + cw / 2, h - yk(S.arrived[m].v) * h] : null);
    const got = pts.filter(Boolean);
    const d = got.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const path = svg.querySelector('.g-curve');
    path.setAttribute('d', d);
    svg.querySelectorAll('circle').forEach((c) => c.remove());
    got.forEach((p) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('class', 'g-curve__pt'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 4); svg.appendChild(c); });
    if (final && path.getTotalLength) {   // 곡선 완성 — 선 긋기 750
      const L = path.getTotalLength(); path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
      tween(D[750], (k) => { path.style.strokeDashoffset = String(L * (1 - k)); });
    }
  }

  function onEvent(name, data) {
    if (!data) return;
    if (name === 'job.queued') { hud.querySelector('#hud-shard').textContent = `queued · ${data.pool || 'cpu'} · #${data.position ?? 0}`; S.jobId ||= data.job_id; }
    if (name === 'job.started') {
      P.t0 = Date.parse(data.at) || null; P.wall0 = performance.now(); P.total = data.shards_total || 8; P.done = 0; P.ms = [];
      hudProgress(data.at); startTicker();
    }
    if (name === 'shard.started') {
      const m = data.month || data.shard_id.slice(1);
      scrub.querySelector(`.g-slot[data-m="${m}"]`)?.setAttribute('data-state', 'running');
      P.cur = m; P.curAt = performance.now();
      setMonth(m, false);
    }
    if (name === 'shard.done') {   // 실 게이트웨이의 유일한 진행 신호 — a/b · 경과 · 월별 소요(ms 실측)
      P.done = Math.min(P.total, P.done + 1); if (data.ms) P.ms.push(data.ms);
      S.shardMs[(data.shard_id || '').replace(/^m/, '')] = data.ms;
      hudProgress(data.at);
    }
    if (name === 'shard.failed') { hud.querySelector('#hud-eta').textContent = `shard.failed · ${data.shard_id} · ${data.error || ''}`; }
    if (name === 'index.month') S.chain = S.chain.then(() => arrive(data));   // 도착은 순서대로 하나씩(스윕 1000 → 현상 500)
    if (name === 'job.progress') { P.done = Math.max(P.done, data.shards_done || 0); P.total = data.shards_total || P.total; hudProgress(data.at); }
    if (name === 'job.done') { clearInterval(P.tick); S.chain = S.chain.then(() => done(data)); }
  }
  async function arrive(ev) {
    const m = ev.month, v = ev.ndvi_mean?.value;
    const slot = scrub.querySelector(`.g-slot[data-m="${m}"]`);
    S.arrived[m] = { v, n: ev.n_scenes, env: ev.ndvi_mean, p10: ev.p10, p50: ev.p50, p90: ev.p90, basis: ev.basis || ev.ndvi_mean?.basis };
    // 스윕 1000 → 결과 현상 500(지나간 뒤에만)
    show(map, ctx.ladder.ndvi[m], true);
    await sweep(stage, YS.plain);
    for (const mm of MONTHS) opacity(map, ctx.ladder.ndvi[mm], mm === m ? 0.88 : 0);
    S.ndviOn = true;
    // 히스토그램 자리: 10 구간 분포 + 평균 막대
    const hist = ev.hist?.counts;
    if (hist) {   // 세로 = NDVI 구간(−0.1…0.8) · 가로 폭 = 화소 수(좌우 대칭)
      const mx = Math.max(...hist.slice(1), 1);
      slot.querySelector('.g-slot__hist').innerHTML = hist.slice(1).map((c, j) => {
        const lo = -0.1 + 0.1 * j, w = (c / mx) * 100;
        return `<i style="bottom:${(yk(lo) * 100).toFixed(2)}%;height:${(100 / 9).toFixed(2)}%;width:${w.toFixed(1)}%;left:${((100 - w) / 2).toFixed(1)}%;background:${ndviColor(lo + 0.05)}"></i>`;
      }).join('');
    }
    slot.style.setProperty('--h', `${(yk(v) * 100).toFixed(1)}%`);
    slot.style.setProperty('--c', ndviColor(v));
    slot.querySelector('.g-slot__v').textContent = num(v, 2);
    slot.querySelector('.g-slot__n').textContent = `n ${ev.n_scenes}`;
    slot.setAttribute('data-state', 'done');
    hudNum(v);
    hud.querySelector('#hud-line').textContent = t('hud.line', { n: ev.n_scenes, worker: 'cpu-0' });
    drawCurve(false);
    const sp = scrub.querySelector('#scrub-prov');
    if (sp && !sp.firstChild && ev.ndvi_mean) sp.appendChild(prov({ ...ev.ndvi_mean, basis: ev.basis === 'demo' ? 'demo' : ev.ndvi_mean.basis }));
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
    renderNext();
    S.job = 'done';
    root.dispatchEvent(new CustomEvent('f1d:gj1-done', { detail: ev }));
  }
  function rerun() {
    S.job = null; S.arrived = {}; S.shardMs = {}; S.result = null; S.live = false;
    scrub.querySelectorAll('.g-slot').forEach((sl) => { sl.removeAttribute('data-state'); sl.querySelector('.g-slot__hist').innerHTML = ''; sl.querySelector('.g-slot__v').textContent = ''; sl.querySelector('.g-slot__n').textContent = ''; });
    scrub.querySelector('#curve .g-curve')?.setAttribute('d', ''); scrub.querySelectorAll('#curve circle').forEach((c) => c.remove());
    card.querySelector('#ys-next')?.remove();
    const btn = card.querySelector('#ys-run'); btn.classList.remove('g-btn--ghost'); btn.onclick = () => run();
    run();
  }

  /* ── 완성형: 시작 → 결과 → 다음 행동(판정 1차 불합격 · 'Done' 버튼뿐) ─────────
     결과 열기(월별 표) · 내보내기 CSV·GeoJSON(받은 index.month 그대로 · 봉투 포함) · job 계보 칩(관제 딥링크) · 보고서에 첨부(기관·LX). */
  function rows() {
    return MONTHS.filter((m) => S.arrived[m]).map((m) => ({ month: m, ndvi_mean: S.arrived[m].v, p10: S.arrived[m].p10 ?? null, p50: S.arrived[m].p50 ?? null, p90: S.arrived[m].p90 ?? null,
      n_scenes: S.arrived[m].n, shard_ms: S.shardMs[m] ?? null, basis: S.result?.replayed ? 'recorded' : (S.arrived[m].basis || 'measured'),
      source: S.arrived[m].env?.source || 'PC S2 L2A B04/B08 · WorldCover 40 mask' }));
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, D[1000]);
  }
  const fileBase = () => String(S.result?.result_set || S.result?.job_id || 'gj1-ysykata').replace(/[\\/]+/g, '_');
  function toCsv() {
    const head = ['month', 'ndvi_mean', 'p10', 'p50', 'p90', 'n_scenes', 'shard_ms', 'basis', 'source', 'job_id', 'result_set'];
    return '﻿' + [head.join(','), ...rows().map((r) => [r.month, r.ndvi_mean, r.p10 ?? '', r.p50 ?? '', r.p90 ?? '', r.n_scenes, r.shard_ms ?? '', r.basis, `"${r.source}"`, S.result.job_id, S.result.result_set || ''].join(','))].join('\n');
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
  function renderNext() {
    card.querySelector('#ys-next')?.remove();
    const sec = document.createElement('section');
    sec.className = 'g-sec g-in'; sec.id = 'ys-next';
    const r = S.result, canReport = ctx.tenant !== 'guest';
    // 관제(landxi/ops)는 아직 ?job= 을 받지 않는다(행 펼침 0) — 죽은 링크 대신 결손 칩 · F1-∑/F1-C 도착 시 링크로 교체(계약 변경 요청 9)
    sec.innerHTML = `<div class="g-sec__t"><span>${t('ys.next')}</span><b>${r.replayed ? t('ys.next.demo') : t('ys.live')}</b></div>
      <div class="g-actions"><button class="g-btn" data-a="open" aria-expanded="false">${t('ys.open')}</button><button class="g-btn g-btn--ghost" data-a="csv">CSV</button><button class="g-btn g-btn--ghost" data-a="geojson">GeoJSON</button>
        ${canReport ? `<button class="g-btn g-btn--ghost" data-a="report">${t('ys.report')}</button>` : ''}</div>
      <div class="g-lineage"><span class="g-lineage__id">${r.job_id || '—'}</span><span>${r.result_set || ''}</span>${r.job_id ? `<span class="g-lineage__wait" data-job="${r.job_id}" title="/landxi/ops/index.html?job=${encodeURIComponent(r.job_id)}">${t('ys.ops.wait')}</span>` : ''}</div>
      <div class="g-note" id="ys-next-note">${r.replayed ? t('ys.next.replay') : ''}</div>
      <div id="ys-table" hidden></div>`;
    card.appendChild(sec);
    requestAnimationFrame(() => sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const note = sec.querySelector('#ys-next-note');
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'open') {
        const tb = sec.querySelector('#ys-table'); const on = tb.hidden; tb.hidden = !on; b.setAttribute('aria-expanded', String(on));
        if (on) tb.innerHTML = `<table class="g-table"><tr><th>${t('ys.t.m')}</th><th>NDVI</th><th>${t('ys.t.n')}</th><th>${t('ys.t.s')}</th></tr>${rows().map((x) => `<tr><td>${monLabel(x.month)}</td><td>${num(x.ndvi_mean, 3)}</td><td>${x.n_scenes}</td><td>${x.shard_ms ? num(x.shard_ms / 1000, 1) : '—'}</td></tr>`).join('')}</table>`;
      }
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
      apiJob(r.job_id).then((j) => { const x = j.job || j; note.textContent = `gateway · ${x.state} · ${x.shards_done ?? '?'}/${x.shards_total ?? '?'} shard · ${x.result_set || ''}`; }).catch(() => {});
    }
  }


  async function run({ speed } = {}) {
    if (S.job) return;
    S.job = 'running';
    const btn = card.querySelector('#ys-run'); btn.disabled = true; btn.textContent = t('ys.running');
    hudShow();
    scrub.querySelector('#scrub-idx').innerHTML = `<b>${t('scrub.idx')}</b>`;
    if (API.mode === 'on') {
      try {
        const r = await apiSubmit(body());
        S.live = true; P.wall0 = performance.now();
        hud.querySelector('#hud-tag').textContent = t('hud.live');
        S.sub = sse(r.events_url.replace(/^\/api\/v1/, ''), { on: onEvent });
        S.jobId = r.job.id;
        return;
      } catch { /* 워커 없음 → 리플레이(계약 §10 worker_unavailable) */ }
    }
    const rec = ctx.replayMeta;
    const sp = speed || ctx.replaySpeed || 1;
    hud.querySelector('#hud-tag').textContent = t('hud.replay', { x: Math.round(sp), date: rec?.date || '2026-09-24' });
    API.reason = '저장 결과 재생';   // api-v1 replay() 는 이미 '서버 연결 없음'이면 덮지 않는다(계약 변경 요청) → 마스트 '시연 · 저장 결과 재생'
    S.sub = replay(new URL('replay/gj1-ysykata.ndjson', DATA).href, { on: onEvent, speed: sp });
    root.dispatchEvent(new CustomEvent('f1d:mode'));
  }

  return {
    S, renderCard, renderScrub, setMonth, play, frame, quote, run, bars, hudShow,
    async enter({ tour = false } = {}) {
      addBoundaries(map, d);
      stage.inKgz = true; stage.pcOn = true;
      const L = ctx.ladder;
      MONTHS.forEach((m) => show(map, L.months[m], true));   // 8개월 미리 받기(투명)
      setMonth('2025-06');
      map.setPaintProperty('ys-line', 'line-opacity', 1);
      map.setPaintProperty('ys-halo', 'line-opacity', 1);
      lockOn(stage, YS.bbox, { name: 'Ysyk-Ata', cyr: 'Ысык-Ата', sub: 'ADM2 · geoBoundaries' });
      pin(stage, [74.59, 42.87], `<b>Bishkek</b><span class="g-cyr" lang="ru">Бишкек</span>`, 'g-place');
      renderCard();
      await wait(tour ? D[500] : D[380]);
      bars();
    },
    leave() {
      S.playing = false; S.sub && S.sub.close && S.sub.close(); stage.pcOn = false; clearInterval(P.tick);
      for (const m of MONTHS) { show(map, ctx.ladder.months[m], false); show(map, ctx.ladder.ndvi[m], false); }
      ['ys-line', 'ys-halo', 'frame-line'].forEach((l) => map.getLayer(l) && map.setPaintProperty(l, 'line-opacity', 0));
      map.getLayer('frame-dim') && map.setPaintProperty('frame-dim', 'fill-opacity', 0);
      hud.hidden = true; scrub.hidden = true;
    },
  };
}
export { CAM_YS as camera };
