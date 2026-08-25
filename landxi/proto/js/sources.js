// 타일 소스 상수 — 교체 지점을 한 곳에 모아둔다.
export const EOX  = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
export const VSAT_FREE = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
export const VHYB_FREE = 'https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png';
export const DEM  = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const OFM  = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const keyed = (key, layer, ext) =>
  `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;

// 키가 살아 있는지 실제 타일 1장으로 확인한다. 실패하면 키 없는 xdworld 로 폴백.
export async function resolveVWorld() {
  const key = (window.VWORLD_KEY || '').trim();
  // 키 없는 xdworld: z5–19. 키 발급형 WMTS: 문서상 z7–18(범위를 벗어나면 이미지가 아닌
  // 예외 응답이 와서 "source image could not be decoded" 가 난다).
  const out = { sat: VSAT_FREE, hyb: VHYB_FREE, keyed: false, minzoom: 5, maxzoom: 19 };
  if (!key) return out;
  const probe = keyed(key, 'Satellite', 'jpeg').replace('{z}', '9').replace('{y}', '204').replace('{x}', '437');
  try {
    const r = await fetch(probe, { cache: 'no-store' });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && /image/.test(ct)) {
      out.sat = keyed(key, 'Satellite', 'jpeg');
      out.hyb = keyed(key, 'Hybrid', 'png');
      out.keyed = true;
      out.minzoom = 7; out.maxzoom = 18;
    }
  } catch { /* 네트워크/CORS 실패 → 폴백 유지 */ }
  return out;
}
