// 판(plate) — 아카이브 `표시` 의 결과가 서는 지도. 발주 추가 요구: "아카이브가 끝나면 그 결과를
// 지도에서 보는 레이어처럼 본다". 원본(landxi7 dataset-archive)은 카드 클릭이 지도를 그 지점으로
// 날릴 뿐 레이어를 올리지 않는다 — 여기서는 표시된 타일 하나 = 레이어 하나다.
//   · 정사영상 = 그 도엽의 실제 타일 피라미드(imagery.js) — bounds 안에서만 요청한다
//   · 공간정보 = 실제 GeoJSON(results/*) 을 청록 필라멘트로
//   · 실측 범위가 없는 자산은 판에 세우지 않는다 — 판이 `실측 범위 없음` 이라고 말한다
//   · 숨김 = 감쇠, 삭제 아님 — 레이어 목록에 남고 판에서는 꺼진다
import { resolveVWorld } from './js/sources.js';

const TEAL = '#0FA9A0';

export async function mountPlate(el) {
  const v = await resolveVWorld();
  const map = new maplibregl.Map({
    container: el,
    attributionControl: false,
    style: {
      version: 8,
      sources: { vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        { id: 'vsat', type: 'raster', source: 'vsat',
          // 정사영상은 사진처럼 — 약한 무채화·대비. AI 결과(청록)만 색이 산다.
          paint: { 'raster-saturation': -0.5, 'raster-contrast': 0.12, 'raster-brightness-max': 0.8, 'raster-fade-duration': 220 } },
      ],
    },
    center: [127.5, 35.3], zoom: 6.4, maxZoom: 18.5, minZoom: 4.5,
  });
  await new Promise((res) => map.on('load', res));
  return map;
}

/* ── 브래킷 오버레이 — 지도 위 DOM 을 map.project() 로 따라가게 한다. 카드가 아니라 액자다. ── */
export class Brackets {
  constructor(map, host) {
    this.map = map; this.host = host; this.items = [];
    this._sync = () => this.sync();
    map.on('move', this._sync); map.on('zoom', this._sync); map.on('resize', this._sync);
  }
  /** items: [{ id, bounds, title, sub, dim }] */
  set(items) {
    this.items = items || [];
    this.host.innerHTML = this.items.map((it) => `
      <div class="ex${it.dim ? ' ex--dim' : ''}" data-ex="${it.id}">
        <i class="bk bk--tl"></i><i class="bk bk--tr"></i><i class="bk bk--bl"></i><i class="bk bk--br"></i></div>
      <div class="ex-cap n${it.dim ? ' ex-cap--dim' : ''}" data-cap="${it.id}"><span>${it.title}</span>${it.sub ? `<span>${it.sub}</span>` : ''}</div>`).join('');
    this.sync();
  }
  clear() { this.set([]); }
  sync() {
    for (const it of this.items) {
      const box = this.host.querySelector(`[data-ex="${it.id}"]`);
      const cap = this.host.querySelector(`[data-cap="${it.id}"]`);
      if (!box) continue;
      const a = this.map.project([it.bounds[0], it.bounds[3]]);
      const b = this.map.project([it.bounds[2], it.bounds[1]]);
      const w = Math.max(36, Math.abs(b.x - a.x)), h = Math.max(28, Math.abs(b.y - a.y));
      const x = Math.min(a.x, b.x) - (w - Math.abs(b.x - a.x)) / 2;
      const y = Math.min(a.y, b.y) - (h - Math.abs(b.y - a.y)) / 2;
      box.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      box.style.width = `${Math.round(w)}px`; box.style.height = `${Math.round(h)}px`;
      // 캡션은 액자 안 좌상단 — 타일의 단어와 같은 자리. 판 하단의 장소·날짜·GSD 캡션과 겹치지 않는다.
      if (cap) cap.style.transform = `translate(${Math.round(x) + 8}px,${Math.round(y) + 7}px)`;
    }
  }
}

/* ── 레이어 — 타일 하나 = 레이어 하나 ────────────────────────────────── */
const ids = (id) => ({ src: `ly-${id}`, lyr: `ly-${id}`, line: `ly-${id}-line` });

/** 정사영상 도엽 타일 피라미드를 올린다. */
export function addRaster(map, id, im, hidden) {
  const k = ids(id);
  if (map.getSource(k.src)) return;
  map.addSource(k.src, { type: 'raster', tiles: ['../' + im.tiles], tileSize: 256, minzoom: im.minzoom, maxzoom: im.maxzoom, bounds: im.bounds, attribution: '' });
  map.addLayer({ id: k.lyr, type: 'raster', source: k.src,
    layout: { visibility: hidden ? 'none' : 'visible' },
    paint: { 'raster-saturation': -0.34, 'raster-contrast': 0.1, 'raster-brightness-max': 0.94, 'raster-fade-duration': 240, 'raster-opacity': 1 } });
}
/** 실제 GeoJSON 을 청록 필라멘트(선 + 옅은 면)로 올린다. */
export function addVector(map, id, data, hidden) {
  const k = ids(id);
  if (map.getSource(k.src)) return;
  map.addSource(k.src, { type: 'geojson', data });
  map.addLayer({ id: k.lyr, type: 'fill', source: k.src, layout: { visibility: hidden ? 'none' : 'visible' },
    paint: { 'fill-color': TEAL, 'fill-opacity': 0.18 } });
  map.addLayer({ id: k.line, type: 'line', source: k.src, layout: { visibility: hidden ? 'none' : 'visible' },
    paint: { 'line-color': TEAL, 'line-width': 1, 'line-opacity': 0.9 } });
}
export function setHidden(map, id, hidden) {
  const k = ids(id);
  for (const l of [k.lyr, k.line]) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', hidden ? 'none' : 'visible');
}
export function removeLayer(map, id) {
  const k = ids(id);
  for (const l of [k.lyr, k.line]) if (map.getLayer(l)) map.removeLayer(l);
  if (map.getSource(k.src)) map.removeSource(k.src);
}
export const hasLayer = (map, id) => !!map.getSource(ids(id).src);

/** 카메라 이동 — 표시하면 그 범위로 간다(줌 투 익스텐트). 이징 하나, 1250ms. */
export function frame(map, bounds, opts = {}) {
  map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
    padding: opts.pad ?? 28, duration: opts.instant ? 0 : 1250, maxZoom: opts.maxZoom || 17.2, essential: true,
  });
}
export const KOREA_SW = [125.55, 33.85, 129.35, 37.55];
