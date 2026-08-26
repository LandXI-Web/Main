// 판(plate) — 데이터 관리의 지도. 새 위젯이 아니라 원본 `#ds-map` 의 자리다.
// 마스터 design-canvas/v2/B2-DataMgmt-{Upload,List}.dc.html 가 판 위에 두는 것은 셋뿐이다.
//   1) 실측 범위 = 코너 브래킷(실선) + 좌표·GSD 캡션
//   2) 좌표계가 없는 파일 = 점선 무채 액자 + 이유 한 줄 (결손 규칙 · 취향 §5-10)
//   3) 선택한 데이터셋 = 락온 브래킷(액센트 1회) + 파일명 캡션
// 브래킷은 이미지 안 헤어라인 벡터다 — 떠 있는 HUD 스티커가 아니다(취향 §4).
import { resolveVWorld } from './js/sources.js';
import { EXTENTS } from './ds-data.js';

const ACCENT = '#006DF7';

// 여백은 지도 컨테이너 기준이다 — 컨테이너가 이미 원장 오른쪽에서 시작하므로
// 원장 폭을 다시 더하면 안 된다. 더할 것은 판 위에 얹힌 계기의 폭뿐이다.
/** 판 위 계기(상세 드로어·발행중 카드·발행 폼)를 피하는 여백. */
export const padFor = (o = {}) => ({
  left: o.drawer ? 396 : 40, top: 92,
  right: o.side ? 364 : 56, bottom: o.form ? 212 : 118,
});
/** 전국 판은 마스터처럼 세로를 꽉 채운다 — 위·아래 여백을 거의 두지 않는다. */
export const padWide = () => ({ left: 12, top: 0, right: 12, bottom: 0 });

export async function mountPlate(el) {
  const v = await resolveVWorld();
  const map = new maplibregl.Map({
    container: el,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        {
          id: 'vsat', type: 'raster', source: 'vsat',
          // 마스터의 판 처리 그대로 — saturate(.5) contrast(1.12) brightness(.8).
          paint: {
            'raster-saturation': -0.5,
            'raster-contrast': 0.12,
            'raster-brightness-min': 0.0,
            'raster-brightness-max': 0.8,
            'raster-fade-duration': 220,
          },
        },
      ],
    },
    center: [127.6, 36.15],
    zoom: 6.1,
    maxZoom: 18.5,
    minZoom: 4.5,
  });
  await new Promise((res) => map.on('load', res));
  return map;
}

/* ── 브래킷 오버레이 ────────────────────────────────────────────────────
   지도 위 DOM 을 map.project() 로 따라가게 한다. 카드가 아니라 액자다. */
export class Brackets {
  constructor(map, host) {
    this.map = map; this.host = host; this.items = [];
    this._sync = () => this.sync();
    map.on('move', this._sync);
    map.on('zoom', this._sync);
    map.on('resize', this._sync);
  }

  /** items: [{ id, bounds, title, sub, kind: 'measured'|'pending'|'lock' }] */
  set(items) {
    this.items = items || [];
    this.host.innerHTML = this.items.map((it) => `
      <div class="ex ex--${it.kind}" data-ex="${it.id}">
        <i class="bk bk--tl"></i><i class="bk bk--tr"></i><i class="bk bk--bl"></i><i class="bk bk--br"></i>
      </div>
      <div class="ex-cap ex-cap--${it.kind}${it.up ? ' ex-cap--up' : ''}" data-cap="${it.id}">
        <span class="n t">${it.title}</span>${it.sub ? `<span class="n s">${it.sub}</span>` : ''}
      </div>`).join('');
    this.sync();
  }

  clear() { this.items = []; this.host.innerHTML = ''; }

  sync() {
    for (const it of this.items) {
      const box = this.host.querySelector(`[data-ex="${it.id}"]`);
      const cap = this.host.querySelector(`[data-cap="${it.id}"]`);
      if (!box) continue;
      const a = this.map.project([it.bounds[0], it.bounds[3]]);
      const b = this.map.project([it.bounds[2], it.bounds[1]]);
      // 아주 작은 범위도 액자로 읽히게 최소 크기를 준다(원본 도엽은 화면에서 몇 px 이다).
      const w = Math.max(64, Math.abs(b.x - a.x));
      const h = Math.max(44, Math.abs(b.y - a.y));
      const x = Math.min(a.x, b.x) - (w - Math.abs(b.x - a.x)) / 2;
      const y = Math.min(a.y, b.y) - (h - Math.abs(b.y - a.y)) / 2;
      box.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      box.style.width = `${Math.round(w)}px`;
      box.style.height = `${Math.round(h)}px`;
      // 액자끼리 붙어 서면 캡션이 겹친다 — 마스터처럼 일부는 액자 위로 올린다.
      if (cap) {
        const cy = it.up ? y - cap.offsetHeight - 8 : y + h + 8;
        cap.style.transform = `translate(${Math.round(x)}px,${Math.round(cy)}px)`;
      }
    }
  }

  destroy() {
    this.map.off('move', this._sync); this.map.off('zoom', this._sync); this.map.off('resize', this._sync);
  }
}

/** 업로드 탭 — 마스터가 판에 두는 4개(실측 3 · 미확정 1). */
export const uploadItems = () => EXTENTS.map((e) => ({
  id: e.id, bounds: e.bounds, title: e.title, sub: e.sub, up: !!e.capAbove,
  kind: e.measured ? 'measured' : 'pending',
}));

/** 선택 데이터셋 — 락온 브래킷 하나(액센트는 화면당 1회). */
export const lockItem = (row, bounds) => ({
  id: 'lock-' + row.id, bounds, kind: 'lock', up: true,
  title: row.name || row.file, sub: `${row.file} · ${row.size}`,
});

/** 카메라 이동 — 화면 전환은 같은 지도의 카메라 이동이다(취향 §5-4). */
export function frame(map, bounds, pad, opts = {}) {
  map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
    padding: pad, duration: opts.instant ? 0 : 1250, maxZoom: opts.maxZoom || 15.4, essential: true,
  });
}

/** 선택한 데이터셋의 **자기 정사영상**을 판에 올린다 — 마스터의 판이 그 영상이다.
    실자산이 없으면 아무것도 올리지 않는다(없는 것을 그리지 않는다). */
export function showOrtho(map, im) {
  const SRC = 'sel-ortho', LYR = 'sel-ortho';
  if (map.getLayer(LYR)) map.removeLayer(LYR);
  if (map.getSource(SRC)) map.removeSource(SRC);
  if (!im || !im.tiles) return false;
  map.addSource(SRC, {
    type: 'raster', tiles: ['../' + im.tiles], tileSize: 256,
    minzoom: im.minzoom, maxzoom: im.maxzoom, bounds: im.bounds, attribution: '',
  });
  map.addLayer({
    id: LYR, type: 'raster', source: SRC,
    // 사진처럼 다룬다 — 약한 무채화·대비(취향 §4).
    paint: { 'raster-saturation': -0.34, 'raster-contrast': 0.1, 'raster-brightness-max': 0.94, 'raster-fade-duration': 240 },
  });
  return true;
}

export const KOREA = [125.6, 33.05, 129.7, 38.65];
/** 마스터가 보여 주는 판 = 실자산이 모여 있는 서남부. 전국 판을 그 범위로 자른다. */
export const KOREA_SW = [125.55, 33.85, 129.35, 37.55];
export { ACCENT };
