/* 배포 지도 — K3 무대(ops 모드 · 저채도) 위에 밝은 베일 한 겹 + 잉크 점(기관) · 농도 = 단계.
   국내 = 대한민국 전역 · 해외 = 글로브(밝은 바탕). 점 클릭 → ops-infra ?deploy=. 단계가 바뀌면 점이 제자리에서 차오른다. */
import { createStage, KOREA } from '../../kit/stage.js';
import { h, esc, RM } from '../../kit/util.js';
import { points } from './data.js';

const INFRA = '/landxi/v3/ops-infra/';

export function mountMap(host, { inset = false } = {}) {
  /* inset = 현황 '기관 위치' 작은 칸 안 지도(10-22 첫인상-관리자현황 ⓐ) — 지도 위에 덮는 카드가 없어 여백을 두지 않는다 */
  const st = createStage(host, { mode: 'ops' });
  const wide = () => host.clientWidth >= 960;
  st.pad(inset ? { top: 24, bottom: 24, left: 24, right: 24 } : wide() ? { right: 420 } : { bottom: 220, top: 72 });
  st.ready.then(() => st.home({ ms: 0 }));
  const map = st.map;
  const markers = new Map();
  let scope = 'kr';

  st.ready.then(() => {
    // 밝은 베일 — 위성 바탕을 한 톤 올려 잉크 점이 주인공이 되게(데이터 층 아래)
    map.addLayer({ id: 'oc-veil', type: 'background', paint: { 'background-color': '#F7F8FA', 'background-opacity': 0.52 } }, 'slot-overlay');   // 0.7 → 0.52: 밝은 톤은 두고 바탕 대비만 조금(GPT5-6)
  });
  map.on('moveend', () => requestAnimationFrame(unclash));

  /* 같은 기관이 가까운 두 지역에 배포본을 가지면 이름표가 두 번 겹쳐 보였다(GPT5-6 · 옛 UX-9) — 같은 이름 · 가까운 점(1° 안)은 한 이름표로,
     대표 = 가장 높은 단계(운영 > 시범 > 검증 > 기관에 공유)의 점. 지도 점 자료(data.js points)는 그대로 두고 그리는 쪽에서만 묶는다. */
  const RANK = { ga: 4, pilot: 3, verify: 2, port: 1 };
  function merged() {
    const out = [];
    for (const p of points().sort((a, b) => (RANK[b.stage] || 0) - (RANK[a.stage] || 0))) {
      const o = out.find((x) => x.name === p.name && x.abroad === p.abroad && Math.abs(x.lnglat[0] - p.lnglat[0]) < 1 && Math.abs(x.lnglat[1] - p.lnglat[1]) < 1);
      if (o) { o.port = o.port || p.port; continue; }
      out.push({ ...p });
    }
    return out;
  }
  /** 이름표가 서로 겹치면 아래쪽 이름표를 겹치지 않을 만큼 아래로 비켜 놓는다(점은 제자리) */
  function unclash() {
    const ms = [...markers.values()].filter((m) => !m.el.hidden);
    for (const m of ms) m.el.querySelector('.oc-pt-n').style.transform = '';
    const rs = ms.map((m) => ({ m, r: m.el.querySelector('.oc-pt-n').getBoundingClientRect(), dy: 0 })).sort((a, b) => a.r.top - b.r.top);
    for (let i = 0; i < rs.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = rs[j], b = rs[i];
        const at = a.r.top + a.dy, bt = b.r.top + b.dy;
        if (b.r.left < a.r.right + 4 && a.r.left < b.r.right + 4 && bt < at + a.r.height + 4 && at < bt + b.r.height + 4) b.dy += at + a.r.height + 4 - bt;
      }
      if (rs[i].dy) rs[i].m.el.querySelector('.oc-pt-n').style.transform = `translateY(${Math.round(rs[i].dy)}px)`;
    }
  }

  function sync() {
    const ps = merged();
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
  const vis = () => { for (const m of markers.values()) m.el.hidden = (scope === 'kr') === !!m.p.abroad; requestAnimationFrame(unclash); };

  async function setScope(s) {
    scope = s; vis();
    await st.ready;
    if (s === 'abroad') {
      try { map.setProjection({ type: 'globe' }); } catch { /* 구형 엔진 = 평면 */ }
      const far = [...markers.values()].filter((m) => m.p.abroad).map((m) => m.p.lnglat);
      const c = far.length ? [far.reduce((a, x) => a + x[0], 0) / far.length, far.reduce((a, x) => a + x[1], 0) / far.length] : [100, 35];
      const to = { center: [(c[0] + 127) / 2, (c[1] + 36) / 2], zoom: host.clientWidth < 640 ? (inset ? 0.6 : 1.2) : 2.1, pitch: 0, bearing: 0 };
      const padding = inset ? { top: 0, bottom: 0, left: 0, right: 0 } : host.clientWidth < 960 ? { top: 0, bottom: 200, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 420 };
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
