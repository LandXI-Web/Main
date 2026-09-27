/* V-World 연속지적 경계(LP_PA_CBND_BUBUN) — AI 판독이 아직 없는 관할에서 결합된 필지를 지도에 칠할 도형.
   게이트웨이 프록시(/proxy/vworld/data · 키는 서버 · 서버 캐시 7일)로 PNU 100개씩 묶어 부른다. 좌표는 6자리로 줄여 캐시한다. */
import { api } from '../kit/util.js';

const r6 = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] : c.map(r6));

/** pnus → [{ type:'Feature', properties:{ pnu, addr }, geometry }] */
export async function vwParcels(pnus, onProg) {
  const uniq = [...new Set(pnus.filter(Boolean))];
  const chunks = []; for (let i = 0; i < uniq.length; i += 100) chunks.push(uniq.slice(i, i + 100));
  const total = chunks.length || 1; let done = 0;
  const out = [];
  const one = async () => {
    while (chunks.length) {
      const c = chunks.shift();
      const qs = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LP_PA_CBND_BUBUN', format: 'json', size: '1000', page: '1', geometry: 'true', attribute: 'true', crs: 'EPSG:4326', attrFilter: 'pnu:in:' + c.join(',') });
      try {
        const j = await api('/proxy/vworld/data?' + qs.toString());
        for (const f of j?.response?.result?.featureCollection?.features || []) {
          if (!f.geometry || !f.properties?.pnu) continue;
          out.push({ type: 'Feature', properties: { pnu: f.properties.pnu, addr: f.properties.addr || '' }, geometry: { type: f.geometry.type, coordinates: r6(f.geometry.coordinates) } });
        }
      } catch { /* 이 묶음은 도형 없이(필지 결합은 그대로) */ }
      onProg?.(++done / total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, total) }, one));
  return out;
}

export function bboxOfFeature(f) {
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(walk); };
  walk(f.geometry.coordinates);
  return a;
}
