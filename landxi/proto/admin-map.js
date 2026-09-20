/* 서비스 관리 › 지도 속성 관리 — 원판 B6-Admin-Map{,-Edit} · 원본 landxi7/admin-map.html + assets/js/map-props.js 1:1(속성 8개).
   조회 ⇄ 편집(?mode=edit). 값 변경 · 기본값 복원 · 취소 · 저장. 저장은 원본과 **같은 키** localStorage `lx-map-props` — 지도 서비스(ximap)가 읽을 값.
   미리보기 판 = MapLibre 실지도: 배경 V-World(위성/일반/야간 · 흑백 = 일반의 무채화 · 빈화면 = 배경 없음) + 남원 2025 실 GeoJSON.
     LX 맵 경계선 = 경작지 필지 윤곽 · 검색 결과 = 화면 안 최대 필지 1 · 탐지 영역 = 비닐하우스(청록 고정 — 원본에 탐지 색 속성 없음, 두께만). */
import { say, icon, esc, $, $$ } from './shell.js';
import { mountAdmin, urlState, swapIn } from './admin.js';
import { resolveVWorld } from './js/sources.js';

export const KEY = 'lx-map-props';
export const DEFAULTS = { lxColor: '#FFF59D', lxWidth: 1, baseMap: 'satellite', searchStrokeColor: '#FFFFFF', searchWidth: 2, searchFillColor: '#FFFFFF', searchFillOpacity: 12, polyWidth: 2, updater: '', updatedAt: '' };
const BASE_OPTS = [['base', '일반'], ['gray', '흑백'], ['night', '야간'], ['satellite', '위성'], ['none', '빈화면']];
const BASE_LABEL = Object.fromEntries(BASE_OPTS);
const TEAL = '#0FA9A0';
const HEX = /^#[0-9a-fA-F]{6}$/;
const GROUPS = [
  { title: 'LX 맵', ic: 'grid', rows: [[{ key: 'lxColor', label: 'LX 맵 경계선 색상', type: 'color' }, { key: 'lxWidth', label: 'LX 맵 경계선 두께', type: 'width' }]] },
  { title: '검색 결과 표시', ic: 'search', rows: [[{ key: 'searchStrokeColor', label: '검색 결과 경계선 색', type: 'color' }, { key: 'searchWidth', label: '검색 결과 경계선 두께', type: 'width' }], [{ key: 'searchFillColor', label: '검색 결과 면 색', type: 'color' }, { key: 'searchFillOpacity', label: '검색 결과 면 투명도', type: 'opacity' }]] },
  { title: '배경 지도 / 탐지 표시', ic: 'layers', rows: [[{ key: 'baseMap', label: '기본 배경 지도', type: 'base' }], [{ key: 'polyWidth', label: '탐지 영역 외곽선 두께', type: 'width' }]] },
];
const FIELDS = GROUPS.flatMap((g) => g.rows.flat());

function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && typeof o === 'object') return { ...DEFAULTS, ...o }; } catch { /* 저장소 차단 · 손상 */ } return { ...DEFAULTS }; }
function store(s) { try { localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...s })); } catch { /* 저장소 차단 */ } }
const clamp = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isNaN(n) ? d : Math.max(lo, Math.min(hi, n)); };
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

const { main } = mountAdmin('map');
const url = urlState({ mode: '' });
let S = url.read(), saved = load(), draft = { ...saved };
const editing = () => S.mode === 'edit';
const cur = () => (editing() ? draft : saved);

main.insertAdjacentHTML('beforeend', `
<div class="mp-top"><div><p class="lb">지도 속성 · 지도 서비스(ximap.html)가 실제 렌더에 쓰는 값과 1:1</p><div class="t"><h2 class="d" id="mp-title"></h2><span id="mp-sub"></span></div></div><span class="sp"></span><div class="acts" id="mp-acts"></div></div>
<hr class="hr fb-rule">
<div class="work"><div class="mp-work">
  <form class="mp-l" id="mp-l" novalidate aria-label="지도 속성"></form>
  <div class="mp-r"><figure class="mp-plate" style="margin:0" aria-label="미리보기 판 — 현재 값으로 다시 그린 지도">
    <div class="mp-map" id="mp-map"></div>
    <span class="mp-lab mp-lab--base" id="lab-base"></span>
    <figcaption class="mp-cap"><span id="mp-cap" aria-live="polite"></span><span class="sp"></span><span class="n">남원 2025 분석 결과 GeoJSON(경작지 · 비닐하우스) · 배경 V-World</span></figcaption>
  </figure></div>
</div></div>`);
const left = $('#mp-l');

/* ── 조회 ── */
const viewVal = (f, s) => (f.type === 'color' ? `<span class="mp-sw" style="background:${HEX.test(s[f.key]) ? s[f.key] : '#000'}"></span><span class="n">${esc(s[f.key])}</span>`
  : f.type === 'width' ? `<span class="mp-line" style="height:${Math.max(1, s[f.key])}px"></span><span class="n">${s[f.key]} px</span>`
    : f.type === 'opacity' ? `<span class="n">${s[f.key]} %</span>` : esc(BASE_LABEL[s[f.key]] || s[f.key]));
function drawView() {
  left.removeAttribute('data-edit');
  left.innerHTML = GROUPS.map((g, gi) => `<section class="mp-grp"><h3 class="mp-grp-h">${icon(g.ic, 15)}${esc(g.title)}</h3><div class="mp-grp-b">${(gi === 2 ? [g.rows.flat()] : g.rows).map((r) => `<div class="mp-row">${r.map((f) => `<div class="mp-f"><span class="lb">${esc(f.label)}</span><div class="mp-v${f.type === 'base' ? ' mp-v--w' : ''}" data-v="${f.key}">${viewVal(f, saved)}</div></div>`).join('')}</div>`).join('')}</div></section>`).join('')
    + `<section class="mp-grp"><h3 class="mp-grp-h">${icon('clock', 15)}수정 기록</h3><div class="mp-grp-b"><div class="mp-row"><div class="mp-f"><span class="lb">수정자</span><div class="mp-v" id="v-updater">${saved.updater ? esc(saved.updater) : '<span class="g">-</span>'}</div></div><div class="mp-f"><span class="lb">수정 일시</span><div class="mp-v" id="v-updated">${saved.updatedAt ? `<span class="n">${esc(saved.updatedAt)}</span>` : '<span class="g">-</span><span class="mic" style="margin-left:8px">저장 이력 없음 · 기본값 상태</span>'}</div></div></div></div></section>`;
}
/* ── 편집 ── */
const chgTag = (f) => { const unit = f.type === 'opacity' ? ' %' : ' px'; return `<span class="mp-chg" data-chg="${f.key}"${draft[f.key] === saved[f.key] ? ' hidden' : ''}>변경됨 · 저장값 ${saved[f.key]}${unit}</span>`; };
function fieldHtml(f) {
  if (f.type === 'color') return `<div class="mp-f"><label class="lb" for="f-${f.key}-hex">${esc(f.label)}</label><div class="mp-c"><input type="color" id="f-${f.key}" value="${draft[f.key]}" aria-label="${esc(f.label)} 고르기"><input class="inp n" id="f-${f.key}-hex" maxlength="7" placeholder="#000000" value="${draft[f.key]}" spellcheck="false" autocomplete="off"></div></div>`;
  if (f.type === 'base') return `<div class="mp-f"><fieldset class="mp-base"><legend class="lb lb--ink" style="padding:0;float:left;width:100%">${esc(f.label)}</legend>${BASE_OPTS.map(([k, l]) => `<label class="rd"><input type="radio" name="f-baseMap" value="${k}"${draft.baseMap === k ? ' checked' : ''}>${l}</label>`).join('')}</fieldset></div>`;
  const op = f.type === 'opacity';
  return `<div class="mp-f"><label class="lb" for="f-${f.key}">${esc(f.label)} (${op ? '%' : 'px'})</label><div class="mp-n"><input class="inp n" type="number" id="f-${f.key}" min="${op ? 0 : 1}" max="${op ? 100 : 10}" step="1" value="${draft[f.key]}"${draft[f.key] !== saved[f.key] ? ' data-changed' : ''}>${chgTag(f)}</div>${op ? '<p class="help">숫자가 낮을수록 투명, 높을수록 불투명 (0 = 완전 투명)</p>' : ''}</div>`;
}
function drawEdit() {
  left.setAttribute('data-edit', '');
  left.innerHTML = GROUPS.map((g) => `<section class="mp-grp"><h3 class="mp-grp-h">${icon(g.ic, 15)}${esc(g.title)}</h3><div class="mp-grp-b">${g.rows.map((r) => `<div class="mp-row">${r.map(fieldHtml).join('')}${r.length === 1 && r[0].type !== 'base' ? '<div class="mp-f"></div>' : ''}</div>`).join('')}</div></section>`).join('');
}
function syncTags() { for (const f of FIELDS) { if (f.type !== 'width' && f.type !== 'opacity') continue; $(`[data-chg="${f.key}"]`)?.toggleAttribute('hidden', draft[f.key] === saved[f.key]); $(`#f-${f.key}`)?.toggleAttribute('data-changed', draft[f.key] !== saved[f.key]); } }
function fill() { for (const f of FIELDS) { if (f.type === 'base') { const r = $(`input[name="f-baseMap"][value="${draft.baseMap}"]`); if (r) r.checked = true; continue; } $(`#f-${f.key}`).value = draft[f.key]; if (f.type === 'color') $(`#f-${f.key}-hex`).value = draft[f.key]; } syncTags(); }

left.addEventListener('input', (e) => {
  const t = e.target;
  if (t.name === 'f-baseMap') draft.baseMap = t.value;
  const f = FIELDS.find((x) => t.id === `f-${x.key}` || t.id === `f-${x.key}-hex`);
  if (f) {
    if (f.type === 'color') { const hex = t.value.trim(); if (!HEX.test(hex)) return; draft[f.key] = hex.toUpperCase(); const other = $(t.id.endsWith('-hex') ? `#f-${f.key}` : `#f-${f.key}-hex`); other.value = t.id.endsWith('-hex') ? hex.toLowerCase() : draft[f.key]; }
    else if (t.value !== '') draft[f.key] = f.type === 'opacity' ? clamp(t.value, 0, 100, 0) : clamp(t.value, 1, 10, 1);
  }
  syncTags(); paint();
});
left.addEventListener('change', (e) => {                                   // 범위를 벗어난 값 · 덜 쓴 HEX 는 자리를 뜰 때 바로잡는다
  const f = FIELDS.find((x) => e.target.id === `f-${x.key}` || e.target.id === `f-${x.key}-hex`); if (!f) return;
  if (f.type === 'color') $(`#f-${f.key}-hex`).value = draft[f.key]; else if (f.type !== 'base') e.target.value = draft[f.key];
});
left.addEventListener('submit', (e) => { e.preventDefault(); save(); });

function save() {
  saved = { ...draft, updater: '관리자', updatedAt: stamp() }; store(saved);
  S.mode = ''; commit(); say('지도 속성 기본값을 저장했습니다.'); $('#a-edit')?.focus();
}
$('#mp-acts').addEventListener('click', (e) => {
  const id = e.target.closest('button')?.id;
  if (id === 'a-edit') { draft = { ...saved }; S.mode = 'edit'; commit(); $('#f-lxColor-hex')?.focus(); }
  if (id === 'a-cancel') { draft = { ...saved }; S.mode = ''; commit(); $('#a-edit')?.focus(); }
  if (id === 'a-default') { draft = { ...draft, ...DEFAULTS, updater: draft.updater, updatedAt: draft.updatedAt }; fill(); paint(); say('기본값을 폼에 채웠습니다 — 저장해야 반영됩니다'); }
  if (id === 'a-save') save();
});

function render() {
  const ed = editing();
  $('#mp-title').textContent = ed ? '속성 변경' : '속성 조회';
  $('#mp-sub').textContent = ed ? '지도 표시 속성을 변경합니다. 변경 후 저장하세요' : 'LX 맵 구분 스타일 · 기본 배경 지도 · 탐지 결과 색상·두께';
  $('#mp-acts').innerHTML = ed ? '<button type="button" class="btn-br" id="a-default" style="width:120px">기본값 복원</button><span class="gap"></span><button type="button" class="btn-br" id="a-cancel" style="width:84px">취소</button><button type="button" class="btn" id="a-save">저장</button>' : '<button type="button" class="btn" id="a-edit">수정</button>';
  if (ed) drawEdit(); else drawView();
  swapIn(left); paint();
}
function commit(push = true) { render(); url.write(S, push); }
addEventListener('popstate', () => { S = url.read(); draft = { ...saved }; render(); });

/* ══ 미리보기 판 — MapLibre ═══════════════════════════════════════════════ */
const VIEW = { center: [127.533, 35.4268], zoom: 16 };
const GEO = '../assets/data/geo/results/';
let map = null, ready = false, labels = {};

/** 지금 값으로 지도를 다시 칠한다. window.__lxMapPreview 는 e2e 가 읽는 거울. */
function paint() {
  const s = cur();
  $('#lab-base').textContent = `기본 배경 지도 · ${BASE_LABEL[s.baseMap] || s.baseMap}`;
  $('#mp-cap').textContent = editing() ? '미리보기 — 저장 전 값으로 다시 그림' : '미리보기 — 저장된 값';
  window.__lxMapPreview = { ready, mode: editing() ? 'draft' : 'saved', ...Object.fromEntries(FIELDS.map((f) => [f.key, s[f.key]])) };
  if (!ready) return;
  const vis = (id, on) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  vis('b-sat', s.baseMap === 'satellite'); vis('b-base', s.baseMap === 'base' || s.baseMap === 'gray'); vis('b-night', s.baseMap === 'night');
  map.setPaintProperty('b-base', 'raster-saturation', s.baseMap === 'gray' ? -1 : 0);
  map.setPaintProperty('bg', 'background-color', s.baseMap === 'none' ? '#FFFFFF' : '#0A1018');
  map.setPaintProperty('lx-line', 'line-color', s.lxColor); map.setPaintProperty('lx-line', 'line-width', s.lxWidth);
  map.setPaintProperty('sr-fill', 'fill-color', s.searchFillColor); map.setPaintProperty('sr-fill', 'fill-opacity', s.searchFillOpacity / 100);
  map.setPaintProperty('sr-line', 'line-color', s.searchStrokeColor); map.setPaintProperty('sr-line', 'line-width', s.searchWidth);
  map.setPaintProperty('det-line', 'line-width', s.polyWidth);
  const set = (k, text, col) => { const el = labels[k]; if (!el) return; el.textContent = text; el.style.borderLeftColor = col; };
  set('lx', `LX 맵 경계선 ${s.lxWidth} px`, s.lxColor);
  set('sr', `검색 결과 · 선 ${s.searchWidth} px · 면 ${s.searchFillOpacity} %`, s.searchStrokeColor);
  set('det', `탐지 영역 외곽선 ${s.polyWidth} px`, TEAL);
}

const ringOf = (f) => { let c = f.geometry.coordinates; while (typeof c[0][0] !== 'number') c = c[0]; return c; };
const centroid = (f) => { const r = ringOf(f); let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; };
const eastmost = (f) => ringOf(f).reduce((m, p) => (p[0] > m[0] ? p : m));
const westmost = (f) => ringOf(f).reduce((m, p) => (p[0] < m[0] ? p : m));
async function mountMap() {
  const host = $('#mp-map');
  if (!window.maplibregl) { host.insertAdjacentHTML('afterend', '<p class="mp-fail">지도 라이브러리를 불러오지 못했습니다 — 값은 그대로 저장됩니다</p>'); return; }
  const v = await resolveVWorld();
  const swap = (layer, ext) => (v.keyed ? v.sat.replace('Satellite', layer).replace('.jpeg', '.' + ext) : `https://xdworld.vworld.kr/2d/${layer}/service/{z}/{x}/{y}.${ext}`);
  const src = (tiles) => ({ type: 'raster', tiles: [tiles], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' });
  map = new maplibregl.Map({
    container: host, attributionControl: false, center: VIEW.center, zoom: VIEW.zoom, minZoom: 12, maxZoom: 18.5, dragRotate: false, pitchWithRotate: false,
    style: { version: 8, sources: { vsat: src(v.sat), vbase: src(swap('Base', 'png')), vnight: src(swap('midnight', 'png')) },
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        { id: 'b-sat', type: 'raster', source: 'vsat', paint: { 'raster-saturation': -0.08, 'raster-contrast': 0.03, 'raster-fade-duration': 220 } },
        { id: 'b-base', type: 'raster', source: 'vbase', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 220 } },
        { id: 'b-night', type: 'raster', source: 'vnight', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 220 } }] },
  });
  map.touchZoomRotate.disableRotation();
  map.getCanvas().setAttribute('aria-label', '미리보기 지도 — 화살표 키로 이동, +/- 로 확대·축소');
  await new Promise((res) => map.on('load', res));
  const [farm, green] = await Promise.all(['namwon-farmland-2025.geojson', 'namwon-greenhouse-2025.geojson'].map((f) => fetch(GEO + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })));
  /* 미리보기 범위(±0.012°) 안의 실제 폴리곤만 올린다 */
  const near = (f) => { const [x, y] = centroid(f); return Math.abs(x - VIEW.center[0]) < 0.012 && Math.abs(y - VIEW.center[1]) < 0.012; };
  const parcels = farm.features.filter(near), dets = green.features.filter(near);
  /* 검색 결과 = 화면 가운데 가까이(±0.0025°)의 가장 큰 필지 1 · 꼬리표 닻 = 가운데에서 서로 다른 쪽으로 떨어진 실제 도형 */
  const dist = (f, p) => Math.hypot(centroid(f)[0] - p[0], centroid(f)[1] - p[1]);
  const nearest = (arr, p) => arr.reduce((m, f) => (!m || dist(f, p) < dist(m, p) ? f : m), null);
  const mid = parcels.filter((f) => dist(f, VIEW.center) < 0.0025);
  const hit = (mid.length ? mid : parcels).reduce((m, f) => ((f.properties.area || 0) > (m?.properties.area || 0) ? f : m), null);
  const fc = (features) => ({ type: 'FeatureCollection', features });
  map.addSource('lx', { type: 'geojson', data: fc(parcels.filter((f) => f !== hit)) });
  map.addSource('sr', { type: 'geojson', data: fc(hit ? [hit] : []) });
  map.addSource('det', { type: 'geojson', data: fc(dets) });
  map.addLayer({ id: 'lx-line', type: 'line', source: 'lx', layout: { 'line-join': 'miter' }, paint: { 'line-color': saved.lxColor, 'line-width': saved.lxWidth } });
  map.addLayer({ id: 'sr-fill', type: 'fill', source: 'sr', paint: { 'fill-color': saved.searchFillColor, 'fill-opacity': saved.searchFillOpacity / 100 } });
  map.addLayer({ id: 'sr-line', type: 'line', source: 'sr', layout: { 'line-join': 'miter' }, paint: { 'line-color': saved.searchStrokeColor, 'line-width': saved.searchWidth } });
  map.addLayer({ id: 'det-fill', type: 'fill', source: 'det', paint: { 'fill-color': TEAL, 'fill-opacity': 0.16 } });
  map.addLayer({ id: 'det-line', type: 'line', source: 'det', layout: { 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': saved.polyWidth } });
  /* 꼬리표는 실제 도형에 붙는다(지도를 움직이면 따라간다) */
  const [cx, cy] = hit ? centroid(hit) : VIEW.center;
  map.jumpTo({ center: [cx, cy] });                                          // 검색 결과 필지를 판 가운데에
  const anchor = { sr: hit, lx: nearest(parcels.filter((f) => f !== hit), [cx - 0.0028, cy + 0.0016]), det: nearest(dets, [cx - 0.0016, cy - 0.0020]) };
  for (const k of ['lx', 'sr', 'det']) { if (!anchor[k]) continue; const el = document.createElement('span'); el.className = 'mp-lab'; labels[k] = el; const west = k === 'sr'; new maplibregl.Marker({ element: el, anchor: west ? 'right' : 'left', offset: [west ? -6 : 6, 0] }).setLngLat(west ? westmost(anchor[k]) : eastmost(anchor[k])).addTo(map); }
  ready = true; window.__lxMap = map; paint();
}

render();
url.write(S, false);
mountMap().catch(() => { $('#mp-map').insertAdjacentHTML('afterend', '<p class="mp-fail">미리보기 자료를 불러오지 못했습니다 — 값은 그대로 저장됩니다</p>'); });
