/* lx-map.js — createMap({container, stage, mode}) : MapLibre 5.6.0 한 벌.
   · projection: 글로브(z < 4) → 메르카토르(z 5.5)  — 한 지도, 페이지 이동 없음
   · 스타일 전이 0(법전 §3 · MapLibre 기본 300ms 는 사다리 밖) · raster-fade-duration 500 · 심볼 fade 0
   · pmtiles 등록 · maxPitch 는 tier.js 판정(T1 60 / T2 45) · 순백 글로브(대기 0 · 바깥 #FFFFFF)
   F1-D(landxi/global)는 이 파일을 import 해 stage:'global' 로 같은 엔진을 쓴다(여기서는 옵션과 'stagechange' 만). */
import { registerPmtiles } from './sources.js';

export const STYLE_BASE = (mode) => ({
  version: 8,
  name: 'landxi-xi',
  transition: { duration: 0, delay: 0 },
  ...(mode === 'globe' ? { projection: { type: ['interpolate', ['linear'], ['zoom'], 3.6, 'vertical-perspective', 5.4, 'mercator'] } } : {}),
  sky: { 'atmosphere-blend': 0 },
  sources: {},
  // 바탕은 전 줌에서 종이(#F2F4F6 · 법전 v2 흰 바탕). 2차 판정: z7 부터 먹색(#0B1016)으로 보간하던 것이 VIIRS 가 빠지고
  // V-World 가 아직 안 그려진 한 프레임에 캔버스 전체를 먹색으로 번쩍였다 — 먹색 바탕은 두지 않는다(밑은 VIIRS 가 겹쳐 받친다 · ladder.js).
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#F2F4F6' } }],
});

/** z 순서의 표지 층 — 영상 위 · 결과 아래(참조) · 결과 위(선택) 로 층을 끼워 넣는다. */
export const SLOTS = ['slot-imagery', 'slot-reference', 'slot-result', 'slot-overlay'];

export function createMap({ container, stage = 'domestic', mode = 'globe', center = [115, 22], zoom = 1.4, pitch = 0, bearing = 0,
  maxPitch = 60, interactive = true, transparent = false } = {}) {
  registerPmtiles();
  // 파싱 워커: MapLibre 기본 3 → 코어 절반(최대 8). 두 캔버스가 129,420 폴리곤 타일을 함께 파싱한다(도착 대기 단축 · 결과 문서 §성능)
  if (!window.__lxWorkers) { window.__lxWorkers = Math.min(8, Math.max(3, Math.floor((navigator.hardwareConcurrency || 4) / 2))); try { window.maplibregl.setWorkerCount(window.__lxWorkers); } catch { /* 이미 만들어짐 */ } }
  const style = STYLE_BASE(mode);
  if (transparent) style.layers = [];
  for (const s of SLOTS) style.layers.push({ id: s, type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#000' } });
  const map = new window.maplibregl.Map({
    container, style, center, zoom, pitch, bearing, maxPitch, interactive,
    attributionControl: false, renderWorldCopies: false, fadeDuration: 0,
    maxZoom: 21, minZoom: 0.6, dragRotate: true, pitchWithRotate: true, touchPitch: true,
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: false },
    locale: { 'NavigationControl.ZoomIn': '확대', 'NavigationControl.ZoomOut': '축소' },
  });
  map.__stage = stage;
  map.__mode = mode;
  map.getCanvas().setAttribute('aria-label', transparent ? '결과 겹침 캔버스' : 'XI맵 — 영상 지도');
  return map;
}

/** 스타일 로드 대기 */
export const loaded = (map) => new Promise((res) => (map.isStyleLoaded() ? res() : map.once('load', res)));
/** 타일 적재 + 페이드 + 카메라 정지까지(= idle). 상한 ms. */
export const idle = (map, ms = 4000) => Promise.race([new Promise((res) => { map.once('idle', res); map.triggerRepaint(); }), new Promise((res) => setTimeout(res, ms))]);
