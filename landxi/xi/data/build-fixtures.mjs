/* F1-A 픽스처 생성기 — off 모드 카탈로그 · 배포본 · 합성 리플레이를 실파일에서 만든다.
   실행: node landxi/xi/data/build-fixtures.mjs   (저장소 루트에서 · 읽기: 02. 데이터/manifest.json · assets/data/geo)
   숫자는 manifest.json · emd-stats.json · GeoJSON 실측만 쓴다. 지어낸 값 0.
   F1-CONTRACT §4.1 LayerItem · §4.7 Deploy · §5.1 리플레이(ndjson) 형식. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const DATA = path.resolve(ROOT, '../02. 데이터');
const OUT = path.join(ROOT, 'landxi/xi/data');
const TODAY = '2026-09-24';
const man = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
const M = Object.fromEntries(man.items.map((i) => [i.id, i]));
const envC = (value, unit, basis, source, note) => ({ value, unit, basis, as_of: TODAY, source, ...(note ? { note } : {}) });
const KR = [124.5, 33.0, 131.0, 38.7];

/* ── 외부 사다리(계약 §4.1 URL 그대로) ─────────────────────────────── */
const ext = [
  { id: 'gibs-viirs-truecolor', name: { ko: 'VIIRS 위성 · 어제', en: 'VIIRS true color · yesterday' }, kind: 'raster', role: 'imagery', source: 'external',
    tiles: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    scheme: 'xyz', minzoom: 0, maxzoom: 9, bounds: [-180, -85.05, 180, 85.05], gsd_m: 375, epoch: 'daily', license: 'NASA GIBS · 공개', attribution: 'NASA GIBS · VIIRS NOAA-20',
    export_policy: 'public', security_review: 'n/a', rights_holder: 'NASA', ladder: { stage: 'domestic', from: 0, to: 8, order: 0 } },
  { id: 'gibs-hls-s30', name: { ko: 'HLS S30 30m 위성', en: 'HLS S30 30 m' }, kind: 'raster', role: 'imagery', source: 'external',
    tiles: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png',
    scheme: 'xyz', minzoom: 5, maxzoom: 12, bounds: KR, gsd_m: 30, epoch: 'daily', license: 'NASA GIBS · 공개', attribution: 'NASA GIBS · HLS Sentinel-2 30m',
    export_policy: 'public', security_review: 'n/a', rights_holder: 'NASA/ESA', ladder: { stage: 'domestic', from: 5, to: 10.5, order: 10 } },
  { id: 'xdworld-satellite', name: { ko: 'V-World 위성', en: 'V-World satellite' }, kind: 'raster', role: 'imagery', source: 'external',
    tiles: 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
    scheme: 'xyz', minzoom: 5, maxzoom: 19, bounds: KR, gsd_m: 0.25, epoch: '2026-03', license: '공공누리(V-World)', attribution: 'V-World 위성 · 국토교통부',
    export_policy: 'public', security_review: 'cleared', rights_holder: '국토교통부', ladder: { stage: 'domestic', from: 9.5, to: 19, order: 20 } },
];
for (const e of ext) Object.assign(e, { set: null, path: null, url: null, layer: null, promote_id: null, crs: 'EPSG:3857', tier: 'tile', count: null, signed: false, params: e.id.startsWith('gibs') ? { date: null } : {} });

/* ── 자체 자산(manifest) ─────────────────────────────────────────── */
const own = [];
const resultNote = (o) => /change/.test(o.id) ? '변화 지수(비지도) · 결과 확인 전 · 학습 결과 아님' : `결과 확인 전 · ${String(o.attribution || '').replace(/ · 결과 확인 전$/, '')}${o.id === 'namwon-farmland-2025' ? ' · 공개 판정은 F1-A 브리프 §5 픽스처 값(정본 F1-B 카탈로그)' : ''}`;
const addOwn = (mid, o) => {
  const m = M[mid]; if (!m) return;
  own.push({
    id: o.id, name: o.name, kind: o.kind, role: o.role, source: 'pmtiles', set: o.set, path: m.path,
    url: `http://localhost:8700/tiles/pmtiles/${o.set}.pmtiles`, tiles: null, scheme: 'xyz', layer: o.layer ?? null, promote_id: o.promote_id ?? null,
    minzoom: m.minzoom ?? o.minzoom ?? 0, maxzoom: m.maxzoom ?? o.maxzoom ?? 22, bounds: m.bounds ?? o.bounds ?? null, gsd_m: o.gsd_m ?? null, epoch: o.epoch ?? null, crs: 'EPSG:3857',
    tier: o.role === 'result' ? 'result' : 'tile', license: o.license ?? '확인 중', attribution: o.attribution, export_policy: o.export_policy, security_review: o.security_review ?? 'pending',
    rights_holder: o.rights_holder ?? '확인 중', ladder: o.ladder ?? null,
    count: envC(m.count, m.count_unit === 'tiles' ? 'count' : o.unit ?? 'count', o.role === 'result' ? 'inferred' : o.basis ?? 'measured', `manifest.json#${mid}`, o.role === 'result' ? resultNote(o) : o.countNote), signed: false,
    // 결과 층: 개수는 센 값이지만 대상은 AI 추론(변화는 비지도 지수) · 검수 전 — 게이트웨이 카탈로그(item.basis='inferred')와 같은 배지(결과 문서 계약 변경 요청 1)
    ...(o.role === 'result' ? { basis: 'inferred' } : {}),
  });
};
addOwn('namwon_ap25_2023.pmtiles', { id: 'ap25-namwon-2023', name: { ko: '2023 25cm 항공 · 남원', en: '2023 aerial 25 cm · Namwon' }, kind: 'raster', role: 'imagery', set: 'imagery/namwon_ap25_2023',
  gsd_m: 0.25, epoch: '2023', attribution: '2023 비도시 정사영상(전북) · 권리 확인 중', export_policy: 'tenant', ladder: { stage: 'domestic', from: 10, to: 18, order: 30 } });
for (const [mid, id, ep] of [['namwon_city_2504.pmtiles', 'namwon-city-2504', '2025-04'], ['namwon_city_2510.pmtiles', 'namwon-city-2510', '2025-10']])
  addOwn(mid, { id, name: { ko: `남원 전역 드론 2m · ${ep}`, en: `Namwon drone 2 m · ${ep}` }, kind: 'raster', role: 'imagery', set: `imagery/${mid.replace('.pmtiles', '')}`, gsd_m: 2, epoch: ep,
    attribution: `LX 드론 정사영상(웹 2m) · ${ep}`, license: 'LX 자체 촬영', rights_holder: 'LX', export_policy: 'tenant', ladder: id.endsWith('2504') ? { stage: 'domestic', from: 11, to: 17, order: 40 } : null });
const GSD = { 2504: 0.0108, 2506: 0.0169, 2508: 0.0154, 2510: 0.0168 };
for (const e of ['2504', '2506', '2508', '2510'])
  addOwn(`namwon_${e}.pmtiles`, { id: `namwon-aoi-${e}`, name: { ko: `남원 드론 AOI · 20${e.slice(0, 2)}.${e.slice(2)}`, en: `Namwon drone AOI · 20${e.slice(0, 2)}-${e.slice(2)}` }, kind: 'raster', role: 'imagery', set: `imagery/namwon_${e}`,
    gsd_m: GSD[e], epoch: `20${e.slice(0, 2)}-${e.slice(2)}`, attribution: `LX 드론 정사영상 · ${(GSD[e] * 100).toFixed(2)}cm`, license: 'LX 자체 촬영', rights_holder: 'LX', export_policy: 'tenant',
    ladder: e === '2504' ? { stage: 'domestic', from: 12, to: 19, order: 50 } : null });
addOwn('namwon_change_2504_2510.pmtiles', { id: 'namwon-change-2504-2510', name: { ko: '변화 지수 래스터 2504→2510', en: 'Change index raster' }, kind: 'raster', role: 'result', set: 'imagery/namwon_change_2504_2510', attribution: 'A04 비지도 변화 지수', export_policy: 'tenant', basis: 'measured' });
for (const [mid, id, ep, g] of [['kuksan_a68.pmtiles', 'kuksan-a68', '2025-08', 0.05], ['kuksan_a71.pmtiles', 'kuksan-a71', '2025-08', 0.05], ['jeju_2020.pmtiles', 'jeju-2020', '2020-12', 0.1], ['jeju_2022.pmtiles', 'jeju-2022', '2022-12', 0.12]])
  addOwn(mid, { id, name: { ko: `${id} 정사영상`, en: id }, kind: 'raster', role: 'imagery', set: `imagery/${mid.replace('.pmtiles', '')}`, gsd_m: g, epoch: ep, attribution: `LX 정사영상 · ${id}`, export_policy: 'tenant',
    ladder: { stage: 'domestic', from: 13, to: 19, order: 50 } });
addOwn('terrain-namwon.pmtiles', { id: 'terrain-namwon', name: { ko: '남원 지형(Terrarium)', en: 'Namwon terrain' }, kind: 'terrain', role: 'terrain', set: 'terrain/terrain-namwon', attribution: 'A08 지형', export_policy: 'tenant' });
addOwn('namwon_lc_gt_2020.pmtiles', { id: 'namwon-lc-gt-2020-raster', name: { ko: 'AI Hub 토지피복 GT 2020(래스터)', en: 'Land cover GT 2020' }, kind: 'raster', role: 'reference', set: 'imagery/namwon_lc_gt_2020', attribution: 'AI Hub 125 · 2020', export_policy: 'tenant' });
const REF = [['sido.pmtiles', 'sido', 'sido', '시도'], ['sigungu.pmtiles', 'sigungu', 'sigungu', '시군구'], ['namwon-emd.pmtiles', 'namwon-emd', 'namwon_emd', '남원 읍면동'], ['korea-outline.pmtiles', 'korea-outline', 'korea_outline', '국토 외곽']];
for (const [mid, id, layer, ko] of REF) addOwn(mid, { id, name: { ko, en: id }, kind: 'vector', role: 'reference', set: `reference/${id}`, layer, promote_id: id === 'namwon-emd' ? 'cd' : id === 'korea-outline' ? null : 'code', attribution: 'A11 행정경계', export_policy: 'public', security_review: 'n/a', unit: '동' });
addOwn('namwon-buildings.pmtiles', { id: 'namwon-buildings', name: { ko: '남원 건물(3D)', en: 'Namwon buildings' }, kind: 'vector', role: 'reference', set: 'reference/namwon-buildings', layer: 'namwon_buildings', attribution: 'A08', export_policy: 'tenant', unit: 'count' });
addOwn('namwon-lc-gt-2020.pmtiles', { id: 'namwon-lc-gt-2020', name: { ko: 'AI Hub 토지피복 GT 2020', en: 'Land cover GT 2020' }, kind: 'vector', role: 'reference', set: 'vector/namwon-lc-gt-2020', layer: 'lc_gt', attribution: 'AI Hub 125', export_policy: 'tenant', unit: 'count' });
// 결과(계약 §4.2 sets.yaml)
addOwn('namwon-landcover-2023.pmtiles', { id: 'namwon-landcover-2023', name: { ko: '남원 토지피복 AI 2023 · 25cm 재추론', en: 'Namwon land cover AI 2023' }, kind: 'vector', role: 'result', set: 'results/lx/namwon-landcover-2023',
  layer: 'landcover', promote_id: 'id', attribution: 'C01 2023 25cm × aerial25/best · 결과 확인 전', export_policy: 'tenant', unit: 'polygons', basis: 'inferred', countNote: '결과 확인 전 · C01 2023 25cm × aerial25/best' });
addOwn('namwon-farmland-2025.pmtiles', { id: 'namwon-farmland-2025', name: { ko: '남원 농지이용 2025 · 드론', en: 'Namwon farmland 2025' }, kind: 'vector', role: 'result', set: 'results/lx/namwon-farmland-2025',
  layer: 'namwon_farmland_2025', promote_id: 'id', attribution: 'LX 드론 2025 × namwon/cultivate_uncultivate', export_policy: 'public', security_review: 'cleared', unit: '필지', basis: 'measured',
  countNote: '공개 판정은 F1-A 브리프 §5 지시에 따른 픽스처 값 — 정본은 F1-B 카탈로그' });
addOwn('namwon-greenhouse-2025.pmtiles', { id: 'namwon-greenhouse-2025', name: { ko: '남원 비닐하우스 2025 · 드론', en: 'Namwon greenhouse 2025' }, kind: 'vector', role: 'result', set: 'results/lx/namwon-greenhouse-2025',
  layer: 'namwon_greenhouse_2025', promote_id: 'id', attribution: 'LX 드론 2025 × namwon/Vinyl_house', export_policy: 'tenant', unit: '동', basis: 'measured' });
addOwn('namwon-change.pmtiles', { id: 'namwon-change', name: { ko: '남원 변화 지수 2025 · 비지도', en: 'Namwon change 2025' }, kind: 'vector', role: 'result', set: 'results/lx/namwon-change',
  layer: 'namwon_change', attribution: 'A04 비지도 변화 지수 · 학습 결과 아님', export_policy: 'tenant', unit: 'count', basis: 'measured' });
addOwn('namwon-change-grid.pmtiles', { id: 'namwon-change-grid', name: { ko: '남원 변화 격자', en: 'Namwon change grid' }, kind: 'vector', role: 'result', set: 'results/lx/namwon-change-grid', layer: 'namwon_change_grid', attribution: 'A04 격자 집계', export_policy: 'tenant', unit: 'count' });
for (const k of ['yeosu-marine-2025-aerial', 'yeosu-marine-2026-drone'])
  addOwn(k + '.pmtiles', { id: k, name: { ko: `여수 해양쓰레기 ${k.includes('2025') ? '2025 항공' : '2026 드론'}`, en: k }, kind: 'vector', role: 'result', set: `results/lx/${k}`, layer: k.replace(/-/g, '_'), attribution: 'A06', export_policy: 'tenant', unit: 'count' });
addOwn('marine-debris.pmtiles', { id: 'marine-debris', name: { ko: '서남해 해양쓰레기', en: 'Marine debris' }, kind: 'vector', role: 'result', set: 'results/lx/marine-debris', layer: 'marine_debris', attribution: 'A07', export_policy: 'tenant', unit: 'count' });
addOwn('jeju-illegal.pmtiles', { id: 'jeju-illegal', name: { ko: '제주 불법건축물', en: 'Jeju illegal' }, kind: 'vector', role: 'result', set: 'results/lx/jeju-illegal', layer: 'jeju_illegal', attribution: 'A10', export_policy: 'tenant', unit: 'count' });
const parcels = M['namwon-parcels.pmtiles'] || null;   // P8(F1-B) — 없으면 카탈로그에 없다 → 화면은 '필지 · P8 대기'
// P8 필지(C04 국토정보기본도 2.0 · 2021-12) — 소유자 성명 없음(owner_kind 만) · 내보내기 금지 · 공개 빌드 제외
addOwn('namwon-parcels.pmtiles', { id: 'parcels-namwon', name: { ko: '남원 필지 · 2021-12', en: 'Namwon parcels · 2021-12' }, kind: 'vector', role: 'reference', set: 'reference/parcels-namwon',
  layer: 'parcels', promote_id: 'pnu', bounds: [127.183907, 35.303476, 127.67407, 35.560821],   // parcels/namwon-parcels.meta.json ogrinfo bounds
  attribution: 'C04 국토정보기본도 2.0 · 2021-12 기준', export_policy: 'never', security_review: 'pending', unit: '필지', epoch: '2021-12' });

const LADDER = { domestic: ['gibs-viirs-truecolor', 'gibs-hls-s30', 'xdworld-satellite', 'ap25-namwon-2023', 'namwon-city-2504', 'namwon-city-2510', 'namwon-aoi-2504', 'namwon-aoi-2506', 'namwon-aoi-2508', 'namwon-aoi-2510'],
  global: ['gibs-viirs-truecolor', 'eox-s2cloudless-2025', 'gibs-hls-s30', 'pc-s2-mosaic', 'pc-worldcover-2021', 'maxar-mm-meiktila'] };
const all = [...ext, ...own];
const OWN_IMG = (i) => i.role === 'imagery' && ['pmtiles', 'xyz', 'cog'].includes(i.source);
const build = (filter) => { const items = all.filter(filter); const ids = new Set(items.map((i) => i.id)); return { items, ladder: { domestic: LADDER.domestic.filter((id) => ids.has(id)), global: LADDER.global.filter((id) => ids.has(id)) }, as_of: TODAY }; };
const NAMWON_RESULTS = new Set(['namwon-landcover-2023', 'namwon-farmland-2025', 'namwon-greenhouse-2025', 'namwon-change', 'namwon-change-grid', 'namwon-change-2504-2510']);
const catalog = {
  _note: 'F1-A off 모드 카탈로그 픽스처 · build-fixtures.mjs 가 02. 데이터/manifest.json 에서 생성 · 정본은 GET /api/v1/catalog/layers(F1-B)',
  _parcels: parcels ? 'present' : 'absent — P8 대기',
  lx: build(() => true),
  'tenant:namwon': build((i) => (i.role === 'result' ? NAMWON_RESULTS.has(i.id) && i.export_policy !== 'never' : OWN_IMG(i) ? i.export_policy !== 'never' && /namwon/.test(i.id) : true)),
  public: build((i) => (i.role === 'imagery' ? !OWN_IMG(i) : i.role === 'result' ? i.export_policy === 'public' : i.role === 'reference' ? i.export_policy === 'public' : false)),
};
fs.writeFileSync(path.join(OUT, 'catalog-fixture.json'), JSON.stringify(catalog, null, 1));

/* ── 배포본(계약 §6 시드) ───────────────────────────────────────── */
const nwAoi = { type: 'MultiPolygon', coordinates: [[[[127.18411, 35.30246], [127.67407, 35.30246], [127.67407, 35.56051], [127.18411, 35.56051], [127.18411, 35.30246]]]] };
const CORE = ['mod-auth', 'mod-map', 'mod-result', 'mod-stats', 'mod-report', 'mod-feedback', 'mod-usage'];
const dp = (o) => ({ name: o.id, tenant_id: 'namwon', card_version_id: null, version: null, prev_card_version_id: null, region_profile: 'namwon',
  region_name: { ko: '전북특별자치도 남원시', en: 'Namwon-si, Jeonbuk' }, aoi: nwAoi, pinned: false, gpu_pool: 'a6000', from_deploy_id: null,
  modules: { core: CORE, ext: {} }, model_override: null, snapshot_current: null, snapshot_prev: null, scale: null, basis: 'history', approvals: [],
  created_at: '2026-09-24T09:00:00+09:00', updated_at: '2026-09-24T09:00:00+09:00', ...o });
const ITEMS1 = [
  dp({ id: 'dp-nw-farm-25', name: '남원 영농관리 2025', card_id: 'card-farm', card_version_id: 'card-farm@2.1', version: 'v2.1', prev_card_version_id: 'card-farm@2.0', stage: 'ga', year: 2025, status_history: '운영',
    modules: { core: CORE, ext: { 'mod-farm-cycle': true, 'mod-farm-parcel': true } }, snapshot_current: 'results/namwon/dp-nw-farm-25@2.1', snapshot_prev: 'results/namwon/dp-nw-farm-25@2.0',
    scale: envC(2098, '필지', 'measured', 'results/namwon-farmland-2025.geojson', "cards.js '비닐하우스 9,664 동' 은 출처 없음 → 미표시"),
    approvals: [{ id: 'ap_seed_farm', decision: 'approve', by: 'u_lx_admin', at: '2026-09-24T09:00:00+09:00', reason: '시드' }] }),
];
const LINEAGE = { 'dp-nw-farm-25': [{ kind: 'dataset', id: 'E:/aerial_dataset', label: '항공 토지피복 학습데이터' }, { kind: 'run', id: 'aerial_v2_finetune44' }, { kind: 'model', id: 'aerial25/best' },
      { kind: 'card_version', id: 'card-farm@2.0' }, { kind: 'deploy', id: 'dp-nw-farm-25' }, { kind: 'tenant', id: 'namwon' }, { kind: 'job', id: 'P4-2026-09-24', label: '남원 전역 재추론 22,737칩' }] };
const ITEMS2 = [
  dp({ id: 'dp-nw-living-23', name: '남원 생활환경 2023', card_id: 'card-living', card_version_id: 'card-living@1.3', version: 'v1.3', stage: 'ga', year: 2023, status_history: '운영' }),
  dp({ id: 'dp-nw-road-26', name: '남원 도로안전 2026', card_id: 'card-road', card_version_id: 'card-road@2.1', version: 'v2.1', stage: 'canary', year: 2026, status_history: '구축' }),
  dp({ id: 'dp-nw-crowd-27', name: '남원 인파관리 2027', card_id: 'card-crowd', stage: 'draft', year: 2027, status_history: '예정' }),
  dp({ id: 'dp-nw-change', name: '남원 변화탐지 2025', card_id: 'card-change', card_version_id: 'card-change@1.0', version: 'v1.0', stage: 'canary', year: 2025, status_history: '구축',
    snapshot_current: 'results/lx/namwon-change', scale: envC(456, 'count', 'measured', 'landxi/assets/data/geo/namwon-change.geojson', '비지도 변화 지수 · 학습 결과 아님') }),
  dp({ id: 'dp-gj-marine-25', name: '광주전남 해양쓰레기 2025', tenant_id: 'gwangju-jeonnam', card_id: 'card-marine', card_version_id: 'card-marine@1.2', version: 'v1.2', stage: 'ga', year: 2025, status_history: '운영',
    region_profile: 'gwangju-jeonnam', region_name: { ko: '광주전남특별시', en: 'Gwangju-Jeonnam' }, snapshot_current: 'results/lx/yeosu-marine-2025-aerial' }),
  dp({ id: 'dp-gj-marine-27', name: '광주전남 해양쓰레기 2027', tenant_id: 'gwangju-jeonnam', card_id: 'card-marine', stage: 'draft', year: 2027, status_history: '예정',
    region_profile: 'gwangju-jeonnam', region_name: { ko: '광주전남특별시', en: 'Gwangju-Jeonnam' } }),
  dp({ id: 'dp-kgz-agri-farm-26', name: 'Ysyk-Ata farmland 2026', tenant_id: 'kgz-agri', card_id: 'card-global-farm', card_version_id: 'card-global-farm@0.1', version: 'v0.1', stage: 'canary', year: 2026, status_history: '구축',
    region_profile: 'kgz-ysykata', region_name: { ko: '키르기스스탄 으슥아타', en: 'Ysyk-Ata, Kyrgyzstan' }, gpu_pool: 'cpu',
    aoi: { type: 'MultiPolygon', coordinates: [[[[74.7, 42.75], [75.2, 42.75], [75.2, 43.0], [74.7, 43.0], [74.7, 42.75]]]] } }),
  dp({ id: 'dp-mm-meiktila-25', name: 'Meiktila disaster 2025', tenant_id: 'lx', card_id: 'card-global-disaster', card_version_id: 'card-global-disaster@0.1', version: 'v0.1', stage: 'shadow', year: 2025, status_history: '예시',
    region_profile: 'mm-meiktila', region_name: { ko: '미얀마 메이크틸라', en: 'Meiktila, Myanmar' } }),
  dp({ id: 'dp-kgz-land-change-26', name: '소쿨룩 시가지 변화 · 2026', tenant_id: 'kgz-land', card_id: 'card-change', card_version_id: 'card-change@1.0', version: 'v1.0', stage: 'draft', year: 2026, status_history: '예정',
    region_profile: 'kgz-sokuluk', region_name: { ko: '키르기스스탄 소쿨룩', en: 'Sokuluk, Kyrgyzstan' }, from_deploy_id: 'dp-nw-change', gpu_pool: 'cpu' }),
];
const deploys = { _note: 'F1-A off 모드 배포본 픽스처 · 계약 §6 시드 + dp-kgz-land-change-26(off 전용) · cards.js DEPLOYS 이관(basis history) · 버전 이력는 GET /registry/lineage 형식(chain)', as_of: TODAY,
  items: [...ITEMS1, ...ITEMS2], total: ITEMS1.length + ITEMS2.length, off_only: ['dp-kgz-land-change-26'], lineage: Object.fromEntries(Object.entries(LINEAGE).map(([k, chain]) => [k, { chain }])) };
fs.writeFileSync(path.join(OUT, 'deploys-fixture.json'), JSON.stringify(deploys, null, 1));

/* ── 합성 리플레이: A02 농경지 2025 를 bbox 8×6 격자로(계약 §5.1 · '시연 · 저장 결과 재생') ── */
const A02 = JSON.parse(fs.readFileSync(path.join(ROOT, 'landxi/assets/data/geo/results/namwon-farmland-2025.geojson'), 'utf8'));
const AOI = [127.52, 35.425, 127.545, 35.443];   // 운봉읍 평야 — A02 운봉읍 237필지 중 밀집 구역(프레임 시연 기본값)
const cen = (g) => { const r = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]; let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
const feats = A02.features.map((f) => ({ c: cen(f.geometry), cls: f.properties.cls }));
const COLS = 8, ROWS = 6, W = (AOI[2] - AOI[0]) / COLS, H = (AOI[3] - AOI[1]) / ROWS;
const lines = [], t0 = 0; let t = 0; const JOB = 'job_replay_a02_unbong';
const at = (ms) => new Date(Date.parse('2026-09-24T10:00:00+09:00') + ms).toISOString().replace('Z', '+00:00');
lines.push({ t: 0, event: 'job.queued', data: { job_id: JOB, position: 0, pool: 'a6000', at: at(0) } });
lines.push({ t: 400, event: 'job.started', data: { job_id: JOB, shards_total: COLS * ROWS, workers: ['a6000-0', 'a6000-1'], at: at(400) } });
t = 500; let done = 0; const counts = { 경작지: 0, 비경작지: 0 };
const order = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) order.push([r, c]);
order.forEach(([r, c], k) => {
  const bbox = [+(AOI[0] + c * W).toFixed(6), +(AOI[3] - (r + 1) * H).toFixed(6), +(AOI[0] + (c + 1) * W).toFixed(6), +(AOI[3] - r * H).toFixed(6)];
  const sid = `r${String(r).padStart(3, '0')}c${String(c).padStart(3, '0')}`, worker = k % 2 ? 'a6000-1' : 'a6000-0';
  const inCell = feats.filter((f) => f.c[0] >= bbox[0] && f.c[0] < bbox[2] && f.c[1] >= bbox[1] && f.c[1] < bbox[3]);
  const cl = {}; for (const f of inCell) { cl[f.cls] = (cl[f.cls] || 0) + 1; counts[f.cls] = (counts[f.cls] || 0) + 1; }
  const ts = t + k * 120, te = ts + 380;
  lines.push({ t: ts, event: 'shard.started', data: { job_id: JOB, shard_id: sid, bbox, worker, at: at(ts) } });
  lines.push({ t: te, event: 'shard.done', data: { job_id: JOB, shard_id: sid, bbox, n: inCell.length, classes: cl, polys_url: `/landxi/assets/data/geo/results/namwon-farmland-2025.geojson?bbox=${bbox.join(',')}`, ms: null, worker, at: at(te) } });
  done++;
  if (done % 4 === 0 || done === COLS * ROWS) lines.push({ t: te + 1, event: 'job.progress', data: { job_id: JOB, shards_done: done, shards_total: COLS * ROWS, counts: { ...counts },
    chips_per_s: { value: null, unit: 'chips_per_s', basis: 'demo', as_of: TODAY, source: '합성 리플레이 · 계량 없음', note: 'A02 저장 결과를 격자로 나눠 재생' }, elapsed_s: +(te / 1000).toFixed(1), gpu: [], at: at(te + 1) } });
});
const tEnd = t + (COLS * ROWS - 1) * 120 + 380 + 300, total = Object.values(counts).reduce((a, b) => a + b, 0);
lines.push({ t: tEnd, event: 'job.done', data: { job_id: JOB, counts, counts_env: { value: total, unit: '필지', basis: 'demo', as_of: TODAY, source: 'namwon-farmland-2025.geojson · 운봉 격자', note: '저장 결과 재생' },
  gpu_s: { value: null, unit: 'gpu_s', basis: 'demo', as_of: TODAY, source: '합성 리플레이', note: 'GPU 사용 없음' }, elapsed_s: +(tEnd / 1000).toFixed(1), result_set: 'results/lx/namwon-farmland-2025', at: at(tEnd) } });
lines.push({ t: tEnd + 500, event: 'snapshot.ready', data: { job_id: JOB, set: 'results/lx/namwon-farmland-2025', url: 'pmtiles:///landxi/data/vector/pmtiles/namwon-farmland-2025.pmtiles', features: total, at: at(tEnd + 500) } });
fs.writeFileSync(path.join(OUT, 'replay/j1-hwangdeung.ndjson'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
console.log('catalog lx', catalog.lx.items.length, 'tenant', catalog['tenant:namwon'].items.length, 'public', catalog.public.items.length, '· deploys', deploys.items.length, '· replay lines', lines.length, 'parcels', total, JSON.stringify(counts));
