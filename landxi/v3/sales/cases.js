/* cases.js — 히어로 지도(둥근 24 카드 속 실결과 지도) + ② 활용 사례(한 번에 하나 · 성과 띠 E · 카메라가 지역 사이를 난다).
   지도는 전부 K3 무대(createStage). Hyper Performance 는 숫자가 아니라 장면: 지역에 도착하면 AI 결과가 서→동으로 차오른다(1000ms). */
import { createStage, numHtml } from '../kit/index.js';
import { esc, RM } from '../kit/util.js';
import { loadResult, union } from './data.js';
import { seaSafe } from './sea.js';

const EMPTY = { type: 'FeatureCollection', features: [] };

/* 서→동 차오름: 점을 경도 순으로 ms 동안 채운다(한 화면에 움직이는 것 하나) */
function sweep(map, srcId, pts, ms = 1000) {
  const src = map.getSource(srcId); if (!src) return;
  const token = {}; map.__sweep = token;
  if (RM() || !pts.length) { src.setData({ type: 'FeatureCollection', features: pts }); return; }
  const t0 = performance.now();
  const step = (t) => {
    if (map.__sweep !== token) return;
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    src.setData({ type: 'FeatureCollection', features: pts.slice(0, Math.ceil(pts.length * e)) });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ═══ 히어로 — 전국 → 실결과가 있는 지역 · 그 지역 AI 결과가 차오른다 ═══
   지도 바탕은 데이터를 기다리지 않는다(지역 목록이 늦어도 카드가 비지 않게) — 바탕이 다 앉으면 드러내고, 결과는 오는 대로 차오른다. */
export async function mountHero(el, dataP) {
  const st = createStage(el, { interactive: false, scale: false });
  seaSafe(st);
  window.__sales.hero = st;
  // 카드는 --bg-0 바탕을 지키다가, 타일이 다 앉으면(K3 idle) 380ms 한 번에 드러낸다(타일 낱장 노출 0)
  let shown;
  const on = new Promise((ok) => (shown = ok));
  const reveal = () => {
    if (el.classList.contains('is-on')) return;
    el.classList.add('is-on');
    window.__sales.tHero = Math.round(performance.now() - window.__sales.t0);
    setTimeout(shown, RM() ? 0 : 420);
  };
  setTimeout(reveal, 9000);   // 외부 타일이 끝내 늦으면 그때 드러낸다
  await st.ready;             // 바탕 영상 층이 붙은 뒤의 idle = 첫 화면 타일이 다 앉은 때
  const settle = () => (st.map.areTilesLoaded() ? reveal() : st.map.once('idle', settle));
  st.map.once('idle', settle);
  await st.geo('pts', EMPTY, 'ai');
  const { cases, pins } = await dataP;
  const res = await Promise.all(cases.map(loadResult));
  const pts = res.filter(Boolean).flatMap((r) => r.pts).sort((a, b) => a.geometry.coordinates[0] - b.geometry.coordinates[0]);
  // 지역 이름표 — 그 지역 결과의 동쪽 끝 옆(좌표는 데이터에서만)
  for (const p of pins) {
    const bb = union(cases.map((c, i) => (c.profile === p.profile ? res[i]?.bbox || c.bbox : null)));
    const m = document.createElement('div'); m.className = 'sl-pin'; m.innerHTML = `<i></i>${esc(p.short)}`;
    new maplibregl.Marker({ element: m, anchor: 'left', offset: [12, 0] }).setLngLat([bb[2], (bb[1] + bb[3]) / 2]).addTo(st.map);
  }
  await on;
  sweep(st.map, 'k-pts', pts, 1250); window.__sales.heroReady = true;
  return st;
}

/* ═══ ② 활용 사례 — 목록(지역 · 서비스) + 펼친 사례의 성과 띠 + 오른쪽 지도 ═══ */
export function mountCases({ list, el, cap, cases, openHref, detailHref }) {
  let st = null, cur = -1, auto = null, touched = false;
  const ready = new Promise((resolve) => {
    // 화면에 들어올 때 만든다(첫 뷰의 WebGL 은 히어로 하나)
    const io = new IntersectionObserver(async (en) => {
      if (!en.some((x) => x.isIntersecting)) return;
      io.disconnect();
      st = createStage(el, {});
      seaSafe(st);
      st.map.scrollZoom.disable(); st.map.dragRotate.disable(); st.map.touchZoomRotate.disableRotation();
      window.__sales.caseStage = st;
      await st.ready;
      await st.geo('res', EMPTY, 'ai');
      await st.geo('pt', EMPTY, 'ai');
      for (const id of ['k-res-f', 'k-res-h', 'k-res-l']) if (st.map.getLayer(id)) st.map.setLayerZoomRange(id, 12, 24);
      if (st.map.getLayer('k-pt-p')) { st.map.setLayerZoomRange('k-pt-p', 0, 13.5); st.map.setPaintProperty('k-pt-p', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 6, 2, 10, 3, 13, 4.5]); }
      resolve(st);
    }, { rootMargin: '400px' });
    io.observe(el);
  });

  // 펼친 칸 — 성과 띠(있을 때만) + 행동 하나. XI맵 착지 코드가 없으면 `이 서비스 열기` 대신 `자세히`(죽은 버튼 0)
  const moreHtml = (c) => {
    const band = c.stats.length
      ? `<div class="t-card sl-band">${c.stats.map((s) => `<div class="s"><div class="t-label">${esc(s.label)}</div><div class="v">${numHtml(s.env)}</div></div>`).join('')}</div>`
      : '';
    const open = openHref(c), det = detailHref?.(c);
    const act = open ? `<a class="t-btn" href="${esc(open)}" data-region="${esc(c.xi?.code || '')}">이 서비스 열기</a>`
      : det ? `<a class="t-btn t-btn--2" href="${esc(det)}">자세히</a>` : '';
    return band + act;
  };
  const whoText = (c) => `${c.region} · ${c.year}`;
  list.innerHTML = cases.map((c, i) => `<li class="sl-item" data-i="${i}" data-case="${esc(c.id)}">
      <button type="button" class="sl-item-h" aria-expanded="false"><span class="who">${esc(whoText(c))}</span><span class="what">${esc(c.cardName)}</span></button>
      <div class="more">${moreHtml(c)}</div></li>`).join('');
  const sig = (c) => whoText(c) + '|' + moreHtml(c);
  const last = cases.map(sig);
  const items = [...list.querySelectorAll('.sl-item')];

  async function select(i, { user = false } = {}) {
    if (user) { touched = true; clearTimeout(auto); }
    if (i === cur) return;
    cur = i;
    items.forEach((li, k) => { li.setAttribute('aria-current', k === i ? 'true' : 'false'); li.firstElementChild.setAttribute('aria-expanded', String(k === i)); });
    const c = cases[i];
    window.__sales.caseNow = c.id;
    const s = await ready; if (cur !== i) return;
    cap.textContent = `${c.xi?.name || c.short} · ${c.year} 영상`; cap.hidden = false;
    s.geo('res', EMPTY); s.geo('pt', EMPTY);
    const r = await loadResult(c); if (cur !== i) return;
    await s.go(r?.bbox || c.bbox, { maxZoom: 15.5 });
    if (cur !== i) return;
    if (r) { s.geo('res', r.fc); sweep(s.map, 'k-pt', r.pts, 1000); }
    window.__sales.caseArrived = c.id;
    if (!touched) { clearTimeout(auto); auto = setTimeout(() => { if (!touched) select((cur + 1) % cases.length); }, 9000); }
  }
  items.forEach((li, i) => li.firstElementChild.addEventListener('click', () => select(i, { user: true })));
  const io2 = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting) && cur < 0) select(0); }, { threshold: 0.25 });
  io2.observe(list);
  /* 늦게 온 지역 이름 · 성과 띠 · 착지 코드 — 바뀐 사례만 그 자리에서 고친다(펼침·선택 상태 유지) */
  function update() {
    cases.forEach((c, i) => {
      const now = sig(c); if (now === last[i]) return;
      last[i] = now;
      items[i].querySelector('.who').textContent = whoText(c);
      items[i].querySelector('.more').innerHTML = moreHtml(c);
    });
    const c = cases[cur]; if (c && !cap.hidden) cap.textContent = `${c.xi?.name || c.short} · ${c.year} 영상`;
  }
  return { select: (i) => select(i, { user: true }), update };
}
