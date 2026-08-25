import { AOI, CONF_RAMP, CLS, CLS_KO, SHOWN } from './style.js';
import { EPOCHS, SVC } from './layers.js';
import { drawHist, fmt } from './hud.js';
import { describe, bake, densest, centroids, label as rlabel } from './results.js';

// 서비스 클릭 → 같은 지도 위에서 실제 분석 결과가 3D 로 얹힌다.
// 실데이터가 없는 서비스는 결과를 지어내지 않고 그렇다고 적는다.

export const STORY_OF = {
  marine: 'marine', farmland: 'jeju', pothole: 'namwon', change: 'kuksan',
};

export function makeStories(ctx) {
  const { map, els, data, op, fly, swipe, optional, detect, veccard } = ctx;
  let cur = null, epochIdx = 2, playTimer = 0;

  const meta = (rows) => rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // ── 실제 AI 산출물 (results.js · GPKG 변환본) ────────
  // 결과가 있는 서비스는 이 경로가 주 장면이 된다. 없으면 아래 레거시 장면으로 간다.
  let site = null, fc = null, desc = null;

  // 결과 레이어의 불투명도는 스칼라가 아니라 **feature-state 리빌과 곱한 표현식**이다.
  // 탐지 시퀀스가 신뢰도 순으로 shown 을 켜면 그 순서대로 화면에 남는다.
  function resOp(id, val, prop) {
    if (!map.getLayer(id)) return;
    try { map.setPaintProperty(id, prop, val > 0 ? ['*', val, SHOWN] : 0); } catch (e) { /* noop */ }
  }
  function clearResults() {
    for (let i = 0; i < 3; i++) {
      resOp(`res${i}-3d`, 0, 'fill-extrusion-opacity');
      resOp(`res${i}-glow`, 0, 'line-opacity');
      resOp(`res${i}-line`, 0, 'line-opacity');
      resOp(`res${i}-dot`, 0, 'circle-opacity');
      resOp(`res${i}-dot`, 0, 'circle-stroke-opacity');
    }
    site = null; fc = null; desc = null;
  }

  const SENSOR = { drone: '드론', aerial: '항공', satellite: '위성' };
  // 실결과가 있어도 버리기 아까운 자체 자산 장면 — 사이트 목록 끝에 붙인다.
  const EXTRA = {
    marine: { key: 'legacy-marine', label: '전남 신안 · 격자', run: () => marine() },
    farmland: { key: 'legacy-jeju', label: '제주 불법건축물 · 2020', run: () => jeju() },
  };

  function legendHTML(d) {
    return d.keys.slice(0, 8).map((k) =>
      `<span class="lg"><i style="background:${d.color.get(k)}"></i>${rlabel(k)} <b>${fmt(d.classes.get(k))}</b></span>`).join('');
  }

  async function showResult(r) {
    clearResults(); swipe.hide();
    const url = '../' + String(r.geojson).replace(/^\.?\//, '');
    fc = await (await fetch(url)).json();
    desc = describe(fc);
    bake(fc, desc);
    map.getSource('res0').setData(fc);
    // 저줌 = 중심점 산포(분포가 보인다), 고줌 = 실제 폴리곤 압출(형상이 보인다).
    map.getSource('res1').setData(centroids(fc));
    for (const sfx of ['-3d', '-line', '-dot']) {
      try { map.setFilter('res0' + sfx, sfx === '-dot' ? ['==', ['geometry-type'], 'Point'] : null); } catch (e) { /* noop */ }
    }
    try {
      map.setLayerZoomRange('res0-3d', 13, 24);
      map.setLayerZoomRange('res0-line', 13.6, 24);
      map.setLayerZoomRange('res1-dot', 0, 13.4);
    } catch (e) { /* noop */ }
    resOp('res0-3d', 0.78, 'fill-extrusion-opacity');
    resOp('res0-glow', 0.45, 'line-opacity');
    resOp('res0-line', 0.72, 'line-opacity');
    resOp('res1-dot', 0.92, 'circle-opacity');
    resOp('res1-dot', 0.85, 'circle-stroke-opacity');
    resOp('res0-dot', 0.95, 'circle-opacity');
    resOp('res0-dot', 0.9, 'circle-stroke-opacity');
    return desc;
  }

  function resultPanel(svc, sites, active, r, d) {
    const st = r.stats || {};
    els.min.textContent = `${svc.ministry} · ${r.region}`;
    els.title.textContent = r.title;
    els.meta.innerHTML = meta([
      ['조사', `${SENSOR[r.sensor] || r.sensor} · ${r.year}`],
      ['객체', `${fmt(st.count != null ? st.count : d.n)} ${r.unit || '건'}`],
      ['신뢰도', d.conf ? `${d.conf.lo.toFixed(2)} – ${d.conf.hi.toFixed(2)}` : '—'],
      ['분석', st.analyzedAt || '—'],
    ]);
    const lo = d.conf ? d.conf.lo : 0, hi = d.conf ? d.conf.hi : 1;
    els.ctl.innerHTML =
      (sites.length > 1 ? `<div class="seg" id="site-seg" role="group" aria-label="조사 지구">${
        sites.map((x) => `<button type="button" data-k="${x.key}" aria-pressed="${x.key === active}">${x.label}</button>`).join('')
      }</div>` : '') +
      `<div class="legend">${legendHTML(d)}</div>` +
      (d.conf ? `<div class="ctl" style="margin-top:8px">
        <label for="rconf">신뢰도 임계값<output id="rconf-out">${lo.toFixed(2)}</output></label>
        <input id="rconf" type="range" min="${lo}" max="${hi}" step="0.002" value="${lo}">
        <canvas id="rhist"></canvas>
        <p class="n"><b id="rconf-n">${fmt(d.n)}</b> / ${fmt(d.n)} 객체 표시</p></div>` : '') +
      `<div class="seg" id="rview-seg" role="group" aria-label="보기 방식">
        <button type="button" data-v="wide" aria-pressed="true">전역 · 분포</button>
        <button type="button" data-v="close" aria-pressed="false">정밀 · 입체</button>
      </div>`;
    els.panel.scrollTop = 0;
    els.foot.textContent = (r.what || '') + ' · 원본 ' + (r.src || 'GPKG') + ' (EPSG:5186 → 4326 변환본). 높이 = 신뢰도.';

    const sl = els.ctl.querySelector('#rconf');
    const cv = els.ctl.querySelector('#rhist');
    const ramp = d.keys.map((k) => d.color.get(k)).slice(0, 5);
    if (sl) {
      const hist = st.confHist && st.confHist.length ? st.confHist : null;
      const apply = () => {
        const v = +sl.value;
        els.ctl.querySelector('#rconf-out').textContent = v.toFixed(3);
        const f = ['>=', ['get', '_conf'], v];
        try {
          map.setFilter('res0-3d', f);
          map.setFilter('res0-line', f);
          map.setFilter('res0-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
          map.setFilter('res1-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
        } catch (e) { /* noop */ }
        let c = 0;
        for (const ft of fc.features) if ((ft.properties._conf != null ? ft.properties._conf : 1) >= v) c++;
        els.ctl.querySelector('#rconf-n').textContent = fmt(c);
        if (hist) drawHist(cv, hist, v, ramp.length ? ramp : CONF_RAMP, st.confBins[0], st.confBins[st.confBins.length - 1]);
      };
      sl.addEventListener('input', apply);
      requestAnimationFrame(apply);
    }
    els.ctl.querySelectorAll('#site-seg button').forEach((b) =>
      b.addEventListener('click', () => enterSite(svc, sites, b.dataset.k)));
    els.ctl.querySelectorAll('#rview-seg button').forEach((b) => b.addEventListener('click', () => {
      els.ctl.querySelectorAll('#rview-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (b.dataset.v === 'close') {
        const dz = densest(fc);
        fly({ center: dz ? dz.center : r.camera.center, zoom: 15.4, pitch: 54, bearing: -16 }, 2100);
      } else {
        fly({ center: r.camera.center, zoom: r.camera.zoom, pitch: r.camera.pitch != null ? r.camera.pitch : 35, bearing: r.camera.bearing || 0 }, 1900);
      }
    }));
  }

  async function enterSite(svc, sites, key) {
    const s2 = sites.find((x) => x.key === key) || sites[0];
    site = s2.key;
    if (s2.run) { clearResults(); s2.run(); return; }
    const r = s2.row;
    ctx.onHud && ctx.onHud({ k2: '데이터', v2: `${fmt(r.stats.count)} ${r.unit || '건'}`, k3: '분석', v3: r.stats.analyzedAt || String(r.year) });
    const d = await showResult(r);
    if (cur !== svc.id) return;
    resultPanel(svc, sites, s2.key, r, d);
    await fly({ center: r.camera.center, zoom: r.camera.zoom, pitch: r.camera.pitch != null ? r.camera.pitch : 35, bearing: r.camera.bearing || 0 }, 2300);
    if (cur !== svc.id) return;
    // 타일이 붙기 전에 탐지 시퀀스를 돌리면 "빈 화면에서 발견"이 된다 — 최대 3초 기다린다.
    await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (cur !== svc.id || map.areTilesLoaded() || performance.now() - t0 > 3000) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });
    if (cur !== svc.id) return;
    // 도착 = 탐지의 순간. 스캔선이 훑고 지나간 뒤에 결과가 신뢰도 순으로 남는다.
    detect && detect.play(fc, 'res0', 'res1');
    // 같은 범위의 벡터만 그린 카드 — "이 영상에서 뽑아낸 것".
    if (veccard) veccard.show(fc, `${r.region} · ${r.title}`);
  }

  function resultStory(svc, rows) {
    const sites = rows.map((r) => ({
      key: r.id, row: r,
      label: `${r.region.split(' ').pop()} ${SENSOR[r.sensor] || r.sensor} ${r.year}`,
    }));
    if (EXTRA[svc.id]) sites.push(EXTRA[svc.id]);
    enterSite(svc, sites, sites[0].key);
  }

  function clearScene() {
    clearTimeout(playTimer);
    detect && detect.stop();
    veccard && veccard.hide();
    clearResults();
    swipe.hide();
    for (const l of ['grid-3d', 'grid-dim', 'det-3d', 'det-dim', 'jeju-det-3d', 'change-3d'])
      op(l, 0, 'fill-extrusion-opacity');
    op('change-edge', 0, 'line-opacity');
    for (const l of ['extent-fill']) op(l, 0, 'fill-opacity');
    for (const l of ['extent-line']) op(l, 0, 'line-opacity');
    for (const id of ['o_kuksan_a68', 'o_kuksan_a71', 'o_jeju_2020', 'o_jeju_2022', 'o_jeju_land'])
      op(id, 0, 'raster-opacity');
    op('jeju-det-edge', 0, 'line-opacity');
  }

  /* ── 해양쓰레기 · 전남 ─────────────────────────────── */
  function marine() {
    const n = data.debris.features.filter(f => f.geometry).length;
    els.min.textContent = '해양수산부 · 전라남도';
    els.title.textContent = '해양쓰레기 실태조사';
    els.meta.innerHTML = meta([
      ['총 탐지', '38,057 건'], ['집계 격자', '9,032 셀'],
      ['상세 폴리곤', `${fmt(n)} 개`], ['최근 실행', '2026-08-12'],
    ]);
    els.ctl.innerHTML = `
      <div class="ctl">
        <label for="conf">신뢰도 임계값<output id="conf-out">0.50</output></label>
        <input id="conf" type="range" min="0.5" max="1" step="0.005" value="0.5"
               aria-describedby="conf-n">
        <canvas id="hist"></canvas>
        <p class="n" id="conf-n"><b>${fmt(n)}</b> / ${fmt(n)} 폴리곤 · 격자 <b id="grid-n">9,032</b></p>
      </div>`;
    els.foot.textContent = '높이 = 신뢰도 · 색 = 신뢰도 램프. 임계값 아래는 삭제하지 않고 회색으로 남긴다.';

    map.setFilter('det-3d', ['>=', ['get', 'confidence'], 0.5]);
    map.setFilter('det-dim', ['<', ['get', 'confidence'], 0.5]);
    op('grid-3d', 0.86, 'fill-extrusion-opacity');
    op('grid-dim', 0.09, 'fill-extrusion-opacity');
    op('det-3d', 0.92, 'fill-extrusion-opacity');
    op('det-dim', 0.12, 'fill-extrusion-opacity');

    const slider = els.ctl.querySelector('#conf');
    const out = els.ctl.querySelector('#conf-out');
    const cv = els.ctl.querySelector('#hist');
    const nEl = els.ctl.querySelector('#conf-n b');
    const gEl = els.ctl.querySelector('#grid-n');
    const apply = () => {
      const v = +slider.value;
      out.textContent = v.toFixed(3);
      map.setFilter('det-3d', ['>=', ['get', 'confidence'], v]);
      map.setFilter('det-dim', ['<', ['get', 'confidence'], v]);
      map.setFilter('grid-3d', ['>=', ['get', 'mean_conf'], v]);
      map.setFilter('grid-dim', ['<', ['get', 'mean_conf'], v]);
      let c = 0; for (const x of data.conf) if (x >= v) c++;
      let g = 0; for (const x of data.gridConf) if (x >= v) g++;
      nEl.textContent = fmt(c); gEl.textContent = fmt(g);
      drawHist(cv, data.bins, v, CONF_RAMP);
    };
    slider.addEventListener('input', apply);
    requestAnimationFrame(apply);

    ctx.onHud && ctx.onHud({ k2: '데이터', v2: '탐지 폴리곤 5,000', k3: '최근 실행', v3: '2026-08-12' });
    fly({ center: [126.392, 34.792], zoom: 9.4, pitch: 54, bearing: -16 }, 2200);
  }

  /* ── 남원 4시점 ────────────────────────────────────── */
  const PAIRS = [
    { id: '2504-2506', label: '04→06' }, { id: '2506-2508', label: '06→08' },
    { id: '2508-2510', label: '08→10' }, { id: '2504-2510', label: '04→10' },
  ];
  let pair = '2504-2510', tilted = false;

  function changeStats(pid) {
    const c = { veg_gain: 0, veg_loss: 0, built_new: 0, other: 0 };
    let n = 0;
    for (const f of (data.change.features || [])) {
      if (f.properties.pair !== pid) continue;
      n++; c[f.properties.cls in c ? f.properties.cls : 'other']++;
    }
    return { n, c };
  }

  function setPair(pid) {
    pair = pid;
    map.setFilter('change-3d', ['==', ['get', 'pair'], pid]);
    map.setFilter('change-edge', ['==', ['get', 'pair'], pid]);
    const st = changeStats(pid);
    const box = els.ctl.querySelector('#chg-stats');
    if (box) box.innerHTML = Object.keys(CLS).map(k =>
      `<span class="lg"><i style="background:${CLS[k]}"></i>${CLS_KO[k]} <b>${st.c[k]}</b></span>`).join('');
    const t = els.ctl.querySelector('#chg-n');
    if (t) t.textContent = String(st.n);
    const note = els.ctl.querySelector('#chg-note');
    if (note) note.textContent = pid === '2504-2510' ? '· 계절 변화 우세' : '';
    els.ctl.querySelectorAll('#pair-seg button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.p === pid)));
  }

  function namwon() {
    els.min.textContent = '국토교통부 · 전북 남원';
    els.title.textContent = '도로안전 다시점 조사';
    const hasChange = !!(data.change.features || []).length;
    els.meta.innerHTML = meta([
      ['정사영상', '4 시점'], ['GSD', '1.08 – 1.69 cm'],
      ['기간', '2025.04 – 2025.10'],
      hasChange ? ['변화 지수', fmt(data.change.features.length) + ' 폴리곤'] : ['탐지', '1,264 건'],
    ]);
    els.ctl.innerHTML = `<div class="seg" id="ep-seg" role="group" aria-label="촬영 시점">${
      EPOCHS.map((e, i) => `<button type="button" data-i="${i}" aria-pressed="${i === epochIdx}">${e.label}</button>`).join('')
    }</div>
    <p class="n" style="margin-top:10px">스와이프 핸들로 <b>2025.04</b> ↔ <b>2025.10</b> 을 가른다.</p>` +
    (hasChange ? `
    <p class="ttl">변화 지수(비지도) · <b id="chg-n">0</b>건 <span id="chg-note"></span></p>
    <div class="seg" id="pair-seg" role="group" aria-label="비교 구간">${
      PAIRS.map(p2 => `<button type="button" data-p="${p2.id}" aria-pressed="${p2.id === pair}">${p2.label}</button>`).join('')
    }</div>
    <div id="chg-stats" class="legend"></div>
    <div class="seg" id="view-seg" role="group" aria-label="보기 방식">
      <button type="button" data-v="flat" aria-pressed="true">평면 · 비교</button>
      <button type="button" data-v="tilt" aria-pressed="false">입체 · 변화</button>
    </div>` : '');
    els.foot.textContent = hasChange
      ? '변화 지수(비지도)는 4시점 정사영상만으로 산출한 상대 지표다. 학습된 탐지 모델의 결과가 아니다. '
        + '04→10 구간은 벼 생육에 따른 계절 변화가 대부분이며, 위반 판정이 아니다. 높이 = score.'
      : '남원 4시점에는 탐지 결과가 없다. 변화탐지 색문법을 얹지 않고 순수 영상 비교로 둔다.';
    ctx.onHud && ctx.onHud({ k2: 'GSD', v2: '1.08 – 1.69 cm', k3: '촬영', v3: '2025.04 – 2025.10' });
    els.ctl.querySelectorAll('#ep-seg button').forEach(b =>
      b.addEventListener('click', () => { setTilt(false); setEpoch(+b.dataset.i); }));
    els.ctl.querySelectorAll('#pair-seg button').forEach(b =>
      b.addEventListener('click', () => setPair(b.dataset.p)));
    els.ctl.querySelectorAll('#view-seg button').forEach(b =>
      b.addEventListener('click', () => setTilt(b.dataset.v === 'tilt')));
    if (hasChange) {
      op('change-3d', 0.88, 'fill-extrusion-opacity');
      op('change-edge', 0.55, 'line-opacity');
      requestAnimationFrame(() => setPair(pair));
    }
    fly({ center: [127.3524, 35.53115], zoom: 17.05, pitch: 0, bearing: 0 }, 2400)
      .then(() => swipe.show({
        bdir: 'namwon_2510', bounds: AOI.namwon, z: 17, la: '2025.04', lb: '2025.10',
      }));
    setEpoch(3, true);
  }

  function setTilt(on) {
    tilted = on;
    els.ctl.querySelectorAll('#view-seg button').forEach(b =>
      b.setAttribute('aria-pressed', String((b.dataset.v === 'tilt') === on)));
    if (on) { swipe.hide(); fly({ center: [127.3524, 35.53115], zoom: 17.3, pitch: 54, bearing: -14 }, 1500); }
    else {
      fly({ center: [127.3524, 35.53115], zoom: 17.05, pitch: 0, bearing: 0 }, 1400)
        .then(() => { if (!tilted && cur === 'pothole') swipe.show({ bdir: 'namwon_2510', bounds: AOI.namwon, z: 17, la: '2025.04', lb: '2025.10' }); });
    }
  }

  function setEpoch(i, silent) {
    epochIdx = i;
    EPOCHS.forEach((e, j) => op('o_' + e.id, j === i ? 1 : 0, 'raster-opacity'));
    document.querySelectorAll('#strip button').forEach((b, j) =>
      b.setAttribute('aria-pressed', String(j === i)));
    const seg = els.ctl.querySelector('#ep-seg');
    if (seg) seg.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    if (!silent) swipe.hide();
    ctx.onEpoch && ctx.onEpoch(i);
  }

  /* ── 국산리 드론 변화탐지 ──────────────────────────── */
  function kuksan() {
    els.min.textContent = 'LX 한국국토정보공사 · 전북 국산리';
    els.title.textContent = '드론 변화탐지';
    els.meta.innerHTML = meta([
      ['드론 정사영상', 'A68 / A71'], ['GSD', '5.0 cm'],
      ['촬영', '2025-08'], ['변화 탐지', '486 건'],
    ]);
    els.ctl.innerHTML = `<p class="n">두 차례 비행(A68 · A71)의 정사영상을 같은 좌표에서 가른다.</p>`;
    els.foot.textContent = '두 소티 사이의 차이가 곧 변화다. 합성 오버레이 없이 원본끼리 비교한다.';
    ctx.onHud && ctx.onHud({ k2: 'GSD', v2: '5.0 cm', k3: '촬영', v3: '2025-08' });
    op('o_kuksan_a68', 1, 'raster-opacity');
    fly({ center: [126.98307, 35.83195], zoom: 15.95, pitch: 0, bearing: 0 }, 2400)
      .then(() => swipe.show({
        bdir: 'kuksan_a71', bounds: AOI.kuksan, z: 16, la: 'A68 소티', lb: 'A71 소티',
      }));
  }

  /* ── 제주 농지·불법건축물 ──────────────────────────── */
  // 두 개의 서로 다른 도엽이다: 불법건축물 검출(2020, 126.897) / 토지형질 분할(2022, 126.822).
  // 한 화면에 억지로 합치지 않고 실제 좌표대로 두 장면으로 나눈다.
  function jejuBuilt() {
    els.meta.innerHTML = meta([
      ['항공 정사영상', '2020.12'], ['GSD', '10 cm'],
      ['불법건축물 검출', '2 건'], ['도엽', '126.897, 33.517'],
    ]);
    els.foot.textContent = '검출 폴리곤을 실제 좌표 위에 8.5 m 로 세웠다. 클래스색은 전 화면에서 동일하다.';
    ctx.onHud && ctx.onHud({ k2: 'GSD', v2: '10 cm', k3: '촬영', v3: '2020-12' });
    swipe.hide();
    op('o_jeju_2022', 0, 'raster-opacity'); op('o_jeju_land', 0, 'raster-opacity');
    op('o_jeju_2020', 1, 'raster-opacity');
    op('jeju-det-3d', 0.62, 'fill-extrusion-opacity');
    op('jeju-det-edge', 0.85, 'line-opacity');
    fly({ center: [126.89735, 33.51505], zoom: 17.45, pitch: 48, bearing: -12 }, 2200);
  }

  function jejuSeg() {
    els.meta.innerHTML = meta([
      ['항공 정사영상', '2022.12'], ['GSD', '12 cm'],
      ['토지형질 분할', 'SegFormer'], ['도엽', '126.822, 33.507'],
    ]);
    els.foot.textContent = '원본 마스크는 흑백 이진 영상이다. 검정은 투명, 흰 영역만 탐지색으로 다시 칠해 얹었다. 이 도엽의 분할 면적은 전체의 0.06 % 로 매우 작다 — 크게 보이도록 꾸미지 않는다.';
    ctx.onHud && ctx.onHud({ k2: 'GSD', v2: '12 cm', k3: '촬영', v3: '2022-12' });
    op('o_jeju_2020', 0, 'raster-opacity');
    op('jeju-det-3d', 0, 'fill-extrusion-opacity'); op('jeju-det-edge', 0, 'line-opacity');
    op('o_jeju_2022', 1, 'raster-opacity');
    fly({ center: [126.8223, 33.50937], zoom: 18.4, pitch: 0, bearing: 0 }, 2000)
      .then(() => { if (cur === 'farmland') swipe.show({
        bdir: 'jeju_landcover', bounds: AOI.jeju, z: 18,
        la: '원본 2022.12', lb: 'AI 분할 마스크', recolor: [15, 169, 160] }); });
  }

  function jeju() {
    els.min.textContent = '농림축산식품부 · 제주';
    els.title.textContent = '농지이용 · 불법건축물';
    els.ctl.innerHTML = `<div class="seg" id="jj-seg" role="group" aria-label="도엽">
        <button type="button" data-v="built" aria-pressed="true">불법건축물 · 2020</button>
        <button type="button" data-v="seg" aria-pressed="false">토지형질 · 2022</button>
      </div>
      <div class="legend"><span class="lg"><i style="background:${CLS.built_new}"></i>불법건축물 <b>2</b></span></div>
      <p class="n" style="margin-top:8px">두 결과는 서로 다른 도엽이다. 실제 좌표를 지키기 위해 장면을 나눴다.</p>`;
    els.ctl.querySelectorAll('#jj-seg button').forEach(b => b.addEventListener('click', () => {
      els.ctl.querySelectorAll('#jj-seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      (b.dataset.v === 'seg' ? jejuSeg : jejuBuilt)();
    }));
    jejuBuilt();
  }

  /* ── 실데이터 준비 중 ──────────────────────────────── */
  function pending(s) {
    els.min.textContent = s.ministry;
    els.title.textContent = s.name;
    els.meta.innerHTML = meta([
      ['집계', `${fmt(s.count)} ${s.unit}`], ['최근 실행', s.lastRun],
      ['좌표', `${s.lnglat[1].toFixed(3)}, ${s.lnglat[0].toFixed(3)}`],
    ]);
    els.ctl.innerHTML = `<div class="pending">실탐지 레이어 준비 중<br>이 서비스의 수치는 라인업 소개용이며, 지도에 얹을 실제 결과물이 아직 없다.<br>없는 것을 그리지 않는다.</div>`;
    els.foot.textContent = '실데이터 4종(해양쓰레기 · 농지 · 도로안전 · 드론 변화탐지)만 결과 레이어를 갖는다.';
    ctx.onHud && ctx.onHud({ k2: '집계', v2: fmt(s.count) + ' ' + s.unit, k3: '최근 실행', v3: s.lastRun });
    fly({ center: s.lnglat, zoom: 10.6, pitch: 48, bearing: -12 }, 2200);
  }

  function enter(id) {
    const s = SVC.find(x => x.id === id);
    if (!s) return;
    clearScene();
    cur = id;
    els.panel.hidden = false;
    els.panel.dataset.story = id;
    // 실제 분석 산출물이 있으면 그것이 주 장면이다.
    const rows = (ctx.results || []).filter((r) => r.service === id);
    if (rows.length) { resultStory(s, rows); return; }
    const story = STORY_OF[id];
    if (story === 'marine') marine();
    else if (story === 'namwon') namwon();
    else if (story === 'kuksan') kuksan();
    else if (story === 'jeju') jeju();
    else pending(s);
  }

  function exit() { clearScene(); cur = null; tilted = false; els.panel.hidden = true; }

  return { enter, exit, clearScene, setEpoch, setPair, get current() { return cur; }, get epoch() { return epochIdx; } };
}
