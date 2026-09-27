/* 배포 지도 — K3 무대(ops 모드 · 저채도) 위에 밝은 베일 한 겹 + 잉크 점(기관) · 농도 = 단계.
   국내 = 대한민국 전역 · 해외 = 글로브(밝은 바탕). 점 클릭 → ops-infra ?deploy=. 단계가 바뀌면 점이 제자리에서 차오른다. */
import { createStage, KOREA } from '/landxi/v3/kit/stage.js';
import { h, esc, RM } from '/landxi/v3/kit/util.js';
import { points } from './data.js';

const INFRA = '/landxi/v3/ops-infra/';

export function mountMap(host) {
  const st = createStage(host, { mode: 'ops' });
  const wide = () => host.clientWidth >= 960;
  st.pad(wide() ? { right: 420 } : { bottom: 220, top: 72 });
  st.ready.then(() => st.home({ ms: 0 }));
  const map = st.map;
  const markers = new Map();
  let scope = 'kr';

  st.ready.then(() => {
    // 밝은 베일 — 위성 바탕을 한 톤 올려 잉크 점이 주인공이 되게(데이터 층 아래)
    map.addLayer({ id: 'oc-veil', type: 'background', paint: { 'background-color': '#F7F8FA', 'background-opacity': 0.7 } }, 'slot-overlay');
  });

  function sync() {
    const ps = points();
    const seen = new Set();
    for (const p of ps) {
      seen.add(p.key);
      let m = markers.get(p.key);
      if (!m) {
        const el = h('a.oc-pt', { href: INFRA + '?deploy=' + encodeURIComponent(p.lead.id), dataset: { stage: p.stage } },
          h('i.oc-pt-d'), h('span.oc-pt-n', { text: p.name }));
        el.classList.add('is-new');
        m = { el, mk: new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-9, 0] }).setLngLat(p.lnglat).addTo(map), p };
        markers.set(p.key, m);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-new')));
      }
      const was = m.el.dataset.stage;
      m.el.dataset.stage = p.stage;
      m.el.dataset.port = p.port ? '1' : '';
      m.el.dataset.abroad = p.abroad ? '1' : '';
      m.el.href = INFRA + '?deploy=' + encodeURIComponent(p.lead.id);
      m.el.querySelector('.oc-pt-n').textContent = p.name;
      if (was && was !== p.stage && !RM()) { m.el.classList.remove('is-changed'); void m.el.offsetWidth; m.el.classList.add('is-changed'); }
      m.p = p;
    }
    for (const [k, m] of markers) if (!seen.has(k)) { m.mk.remove(); markers.delete(k); }
    vis();
  }
  const vis = () => { for (const m of markers.values()) m.el.hidden = (scope === 'kr') === !!m.p.abroad; };

  async function setScope(s) {
    scope = s; vis();
    await st.ready;
    if (s === 'abroad') {
      try { map.setProjection({ type: 'globe' }); } catch { /* 구형 엔진 = 평면 */ }
      const far = [...markers.values()].filter((m) => m.p.abroad).map((m) => m.p.lnglat);
      const c = far.length ? [far.reduce((a, x) => a + x[0], 0) / far.length, far.reduce((a, x) => a + x[1], 0) / far.length] : [100, 35];
      const to = { center: [(c[0] + 127) / 2, (c[1] + 36) / 2], zoom: host.clientWidth < 640 ? 1.2 : 2.1, pitch: 0, bearing: 0 };
      const padding = host.clientWidth < 960 ? { top: 0, bottom: 200, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 420 };
      RM() ? map.jumpTo({ ...to, padding }) : map.flyTo({ ...to, padding, duration: 1800, essential: true });
    } else {
      try { map.setProjection({ type: 'mercator' }); } catch { /* */ }
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      st.home({ ms: 1600 });
    }
  }
  map.on('dragstart', () => host.classList.add('is-moved'));
  return { st, map, sync, setScope, get scope() { return scope; }, KOREA, esc };
}
