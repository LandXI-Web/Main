/* extrude.js — 7문법 #3 세우기(V7). 기본 OFF · 배경지도 서브메뉴 '지형·입체' 한 개.
   A02 비닐하우스 1,674 fill-extrusion · 높이 = 신뢰도 × 12 m(표현 상수 · height_m 아님 → [추정] 칩) · 호버 +20 % · 지형 terrain-namwon(장면 단위)
   pitch ≤ T1 60 / T2 45. 카메라는 점프하지 않는다(1000 비행). */
import { flyLadder } from '../engine/camera.js';
import { D } from './glass.js';
import { sourceSpec } from '../engine/sources.js';

const K = 12;   // m — 신뢰도 1.0 일 때 높이(표현 상수)
export function extrude(ctx, { item, terrain, maxPitch }) {
  const { A } = ctx; const S = { on: false, hover: null };
  const ensure = async () => {
    if (!A.getSource('src-ex')) A.addSource('src-ex', await sourceSpec(item));
    if (!A.getLayer('ex-3d')) {
      const h = ['*', ['coalesce', ['get', 'conf'], 0.5], K, ['case', ['boolean', ['feature-state', 'hover'], false], 1.2, 1]];
      A.addLayer({ id: 'ex-3d', type: 'fill-extrusion', source: 'src-ex', 'source-layer': item.layer, layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#0FA9A0', '#07706A'], 'fill-extrusion-height': h, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.72, 'fill-extrusion-vertical-gradient': true } }, 'slot-result');
      A.on('mousemove', 'ex-3d', (e) => {
        const f = e.features[0]; if (!f) return;
        if (S.hover !== null && S.hover !== f.id) A.setFeatureState({ source: 'src-ex', sourceLayer: item.layer, id: S.hover }, { hover: false });
        S.hover = f.id; A.setFeatureState({ source: 'src-ex', sourceLayer: item.layer, id: f.id }, { hover: true });
        ctx.onHover && ctx.onHover(f, e.lngLat);
      });
      A.on('mouseleave', 'ex-3d', () => { if (S.hover !== null) A.setFeatureState({ source: 'src-ex', sourceLayer: item.layer, id: S.hover }, { hover: false }); S.hover = null; ctx.onHover && ctx.onHover(null); });
    }
    if (terrain && !A.getSource('src-dem')) A.addSource('src-dem', await sourceSpec(terrain));
  };
  return {
    S,
    /** fly=false 면 층·지형만 바꾸고 기울기 비행은 미룬다(우 서랍이 열려 있을 때 — 서랍 iframe 과 지형 재투영이 한 프레임에 겹치지 않게 · p95) */
    async set(on, { fly = true } = {}) {
      S.on = on;
      await ensure();
      A.setLayoutProperty('ex-3d', 'visibility', on ? 'visible' : 'none');
      if (terrain) A.setTerrain(on ? { source: 'src-dem', exaggeration: 1.4 } : null);
      S.pendingFly = !fly;
      if (fly) await this.fly();
    },
    async fly() {
      S.pendingFly = false;
      const pitch = S.on ? Math.min(55, maxPitch) : Math.min(35, maxPitch);
      await flyLadder([A], { center: A.getCenter(), zoom: A.getZoom(), pitch, bearing: S.on ? -18 : 0 }, { duration: D.d1000 });
    },
  };
}
