/* 해외 경작지 보기 층(우리 해외 모델 결과 · 바퀴 17 원칙 281) — XI맵 키르기스스탄 · 메인 해외 장면이 함께 쓴다.
   서버 GET /global/crop-view/{z}/{x}/{y}.png(로그인 필요) = 멀리(z5–10)는 작은 경작지도 사라지지 않게 묶은 면 · 가까이(z12–14)는 칸 경계 흰 선.
   14보다 가까이는 지도가 같은 조각을 키운다(줌 인을 계속해도 보임). 숫자는 없다(색 면만) — 군별 숫자는 같은 출처 파일(장부)에서. */
import { API, session } from './util.js';

let proto = false;
async function blank() { return createImageBitmap(new OffscreenCanvas(1, 1)); }
function register() {
  if (proto || !window.maplibregl?.addProtocol) return;
  proto = true;
  window.maplibregl.addProtocol('lxcrop', async (params, ac) => {
    const m = /^lxcrop:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: await blank() };
    const tok = session.get()?.token;
    try {
      const r = await fetch(`${API.prefix}/global/crop-view/${m[1]}/${m[2]}/${m[3]}.png?v=fine13`, { headers: tok ? { authorization: 'Bearer ' + tok } : {}, signal: ac.signal });
      if (!r.ok || r.status === 204) return { data: await blank() };
      return { data: await createImageBitmap(await r.blob()) };
    } catch { return { data: await blank() }; }
  });
}

/** 지도에 경작지 보기 층을 한 번 싣는다 — { id, before, minzoom, bounds, opacity } · 이미 있으면 그대로 */
export function addCropView(map, { id = 'ov-crop', before, minzoom = 5, bounds, opacity = 1 } = {}) {
  register();
  if (!map.getSource(id)) map.addSource(id, { type: 'raster', tiles: ['lxcrop://{z}/{x}/{y}'], tileSize: 256, minzoom: 5, maxzoom: 14, ...(bounds ? { bounds } : {}) });
  if (!map.getLayer(id)) map.addLayer({ id, type: 'raster', source: id, minzoom, paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest', 'raster-fade-duration': 150 } }, before && map.getLayer(before) ? before : undefined);
  return id;
}
