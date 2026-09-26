// 타일 소스 상수 — 교체 지점을 한 곳에 모아둔다.
export const EOX  = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
export const VSAT_FREE = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
export const VHYB_FREE = 'https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png';
export const DEM  = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const OFM  = 'https://tiles.openfreemap.org/planet';
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const keyed = (key, layer, ext) =>
  `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/{z}/{y}/{x}.${ext}`;

/** 타일 한 장을 <img> 로 받아 본다(CORS 무관 · 폐쇄망이면 오류/시간 초과 → false). */
export function probeImage(url, ms = 3500) {
  return new Promise((res) => {
    const im = new Image(); let done = false;
    const end = (ok) => { if (!done) { done = true; clearTimeout(t); im.onload = im.onerror = null; res(ok); } };
    const t = setTimeout(() => end(false), ms);
    im.onload = () => end(im.naturalWidth > 0); im.onerror = () => end(false);
    im.src = url;
  });
}

// 키가 살아 있는지 실제 타일 1장으로 확인한다. 실패하면 키 없는 xdworld 로 폴백.
// 반환 via: 'keyed'(키 WMTS) | 'free'(키 없는 xdworld) | 'offline'(둘 다 안 됨 — 폐쇄망 · 외부 호출 0 환경).
// offline 이어도 sat/hyb 는 xdworld 템플릿 그대로 둔다(기존 호출부 호환) — 바탕을 켤지는 호출부가 online 을 보고 정한다.
export async function resolveVWorld() {
  const key = (window.VWORLD_KEY || '').trim();
  // 키 없는 xdworld: z5–19. 키 발급형 WMTS: 문서상 z7–18(범위를 벗어나면 이미지가 아닌
  // 예외 응답이 와서 "source image could not be decoded" 가 난다).
  const out = { sat: VSAT_FREE, hyb: VHYB_FREE, keyed: false, minzoom: 5, maxzoom: 19, via: 'offline', online: false };
  if (key) {
    const probe = keyed(key, 'Satellite', 'jpeg').replace('{z}', '9').replace('{y}', '204').replace('{x}', '437');
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), 3500) : 0;
    try {
      const r = await fetch(probe, { cache: 'no-store', signal: ac?.signal });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && /image/.test(ct)) {
        out.sat = keyed(key, 'Satellite', 'jpeg');
        out.hyb = keyed(key, 'Hybrid', 'png');
        out.keyed = true;
        out.minzoom = 7; out.maxzoom = 18;
        out.via = 'keyed'; out.online = true;
      }
    } catch { /* 네트워크/CORS 실패 → 폴백 유지 */ }
    clearTimeout(t);
  }
  if (!out.online && await probeImage(VSAT_FREE.replace('{z}', '9').replace('{x}', '437').replace('{y}', '204'))) {
    out.via = 'free'; out.online = true;
  }
  return out;
}
