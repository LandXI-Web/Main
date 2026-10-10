/* lx-map — 지도 서비스(원칙 149 · 154 · 163 · 확인 대장 10-10 질문 1 ⓑ · 시안 design-r15/map-service-3).
   화면 가득 실제 지도(kit 지도 부품) · 왼쪽 = 내가 돌린 분석 결과가 분석서비스(카드) · 프로젝트 묶음별로 쌓인다(여러 묶음 동시에 · 묶음마다 '이 묶음만 보기').
   층을 켜면 지도에 그려지고 그 범위로 간다 · 도형을 누르면 오른쪽에 속성(분류 · AI가 그린 면적 · 신뢰도 · 영상 시점 · 묶음 · 필지 정보) 칸이 펼쳐진다.
   바탕 = 분석에 쓴 영상 + (LX맵 — 지도 18단계 이상에서 그려짐 · 연속지적 필지 경계 — 15단계 이상).
   값 = 서버 한 출처: 목록 GET /me/analyses(묶음 · 지역 · 영상 · 범위 · 결과 수) · 결과 도형 = 결과 타일(/tiles/pmtiles/{세트}) 속성 그대로 · 필지 = GET /parcels?lng&lat(연속지적).
   XI맵(전국 · 해외 실시간 분석) 요소는 두지 않는다(원칙 147). 작업 id 는 주소(?job=)에만 — 화면 글자에 없다.
   ?job=<작업>  추론 '결과 보기' · 분석하기 '분석 시작' 뒤 안내가 그 결과를 켜고 그 범위로 연다. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { staffMenu } from '../kit/lx-menu.js';
import { createStage } from '../kit/stage.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { addResultLayers, setVis } from '../../xi/fx/arrive.js';

const who = await K.gate('lx-map');
const Q = new URLSearchParams(location.search);
const WANT = Q.get('job');
const S = K.shell({ who, home: 'lx-map', rail: staffMenu('mapsvc') });
K.devDrawer({ who });
document.body.classList.remove('lm-boot');

const nf = (v) => Number(v).toLocaleString('ko-KR');
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
/* 결과 색 = 결과 층 모양(arrive.js resultPaint 'landcover')과 같은 값 — 범례가 지도와 어긋나지 않게 */
const CLS_COLOR = { 경작지: '#0FA9A0', 비닐하우스: '#07706A', 건물: '#010102', 주차장: '#8F99A8' };
const LXMAP_Z = 18, CAD_Z = 15;

/* ── 틀 ── */
const left = h('aside.lm-left', { 'aria-label': '내 분석 결과' });
const stageEl = h('div.lm-stage');
const cap = h('div.lm-cap', { hidden: true });
const hint = h('p.lm-hint', { text: '도형을 누르면 오른쪽에 속성이 펼쳐집니다' });
const props = h('aside.lm-props', { 'aria-label': '속성', hidden: true });
S.main.append(h('div.lm-page', {}, left, h('div.lm-map', {}, stageEl, cap, hint, props)));

const release = K.hold({ onRetry: () => location.reload() });
let D;
try { D = await api('/me/analyses' + (WANT ? '?' + new URLSearchParams({ job: WANT }) : '')); }
catch (e) {
  release();
  K.devlog('analyses', `${e?.code || ''} ${e?.message || e}`);
  const box = h('div'); left.replaceChildren(h('h1.lm-h1', { text: '지도 서비스' }), box);
  K.empty(box, { kind: 'error', title: '분석 결과 목록을 불러오지 못했습니다', onRetry: () => location.reload() });
  throw e;
}

/* 상태 — 줄 하나 = 결과 세트 하나 */
const ST = { groups: [], items: new Map(), solo: null, base: 'img', open: new Set(), pick: null };
function absorb(d) {
  for (const g of d.groups || []) {
    let G = ST.groups.find((x) => x.key === g.key);
    if (!G) { G = { key: g.key, name: g.name, kind: g.kind, items: [] }; ST.groups.push(G); }
    for (const it of g.items || []) {
      if (ST.items.has(it.job)) continue;
      const x = { ...it, g: G, on: false, ids: null };
      ST.items.set(it.job, x); G.items.push(x);
    }
    G.items.sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
  }
  ST.groups.sort((a, b) => String(b.items[0]?.finished_at || '').localeCompare(String(a.items[0]?.finished_at || '')));
}
absorb(D);
const all = () => [...ST.items.values()];
const shown = (x) => x.on && (!ST.solo || x.g.key === ST.solo);

/* 처음 켤 것 — 주소의 결과(?job) · 없으면 가장 최근 결과 하나 */
const first = (WANT && ST.items.get(WANT)) || ST.groups[0]?.items[0] || null;
if (first) { first.on = true; ST.open.add(first.g.key); }
if (ST.groups[0]) ST.open.add(ST.groups[0].key);

/* ── 지도 ── */
const ST0 = createStage(stageEl, { bounds: first?.bounds || K.KOREA, interactive: true });
await ST0.ready;
const map = ST0.map;
window.__lm = { map };   // 점검 손잡이(화면에 보이지 않음 · 캡처 · e2e 가 도형 자리를 찾는다)
const pad = () => ({ top: 72, bottom: 48, left: 48, right: props.hidden ? 48 : 400 });
let CAT = [];
try { CAT = (await api('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build: 'lx', locale: 'ko' }))).items || []; }
catch (e) { K.devlog('catalog', String(e?.message || e)); }

/* V-World WMS 를 게이트웨이 중계(/proxy/vworld/wms · 키는 서버)로 — LX맵(편집지적도 lt_c_landinfobasemap)과 연속지적(lp_pa_cbnd_bubun 선) 두 층.
   V-World 는 LX맵을 약 0.6m/화소보다 가까울 때만 그린다 → 512 화소 타일 · 지도 18단계부터(XI맵 필지 카드와 같은 값). 지역 고정값 없음(전국). */
const R3857 = 20037508.342789244;
const blank = () => createImageBitmap(new OffscreenCanvas(1, 1));
window.maplibregl.addProtocol('lmwms', async (params, ac) => {
  const m = /^lmwms:\/\/([\w]+)\/([\w]*)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
  if (!m) return { data: await blank() };
  const [lay, sty, z, x, y] = [m[1], m[2], +m[3], +m[4], +m[5]], s = (2 * R3857) / 2 ** z, x0 = -R3857 + x * s, y1 = R3857 - y * s;
  const q = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: lay, STYLES: sty, CRS: 'EPSG:3857',
    BBOX: [x0, y1 - s, x0 + s, y1].map((v) => v.toFixed(2)).join(','), WIDTH: '512', HEIGHT: '512', FORMAT: 'image/png', TRANSPARENT: 'true' });
  const tok = session.get()?.token;
  try {
    const r = await fetch(API.prefix + '/proxy/vworld/wms?' + q, { headers: tok ? { authorization: 'Bearer ' + tok } : {}, signal: ac.signal });
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return { data: await blank() };
    return { data: await createImageBitmap(await r.blob()) };
  } catch { return { data: await blank() }; }
});
map.addSource('lm-lxmap', { type: 'raster', tiles: ['lmwms://lt_c_landinfobasemap//{z}/{x}/{y}'], tileSize: 512, minzoom: LXMAP_Z - 1, maxzoom: 19 });
map.addLayer({ id: 'lm-lxmap', type: 'raster', source: 'lm-lxmap', minzoom: LXMAP_Z, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } }, 'slot-result');
map.addSource('lm-cad', { type: 'raster', tiles: ['lmwms://lp_pa_cbnd_bubun/lp_pa_cbnd_bubun_line/{z}/{x}/{y}'], tileSize: 512, minzoom: CAD_Z - 1, maxzoom: 19 });
map.addLayer({ id: 'lm-cad', type: 'raster', source: 'lm-cad', minzoom: CAD_Z, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } }, 'slot-result');

/* 분석에 쓴 영상 — 카탈로그의 그 영상(구운 타일 또는 원본 동적 타일 · 서명 주소) */
const imgOn = new Set();
async function addImagery(id) {
  if (!id || imgOn.has(id)) return;
  imgOn.add(id);
  const it = CAT.find((x) => x.id === id && x.role === 'imagery');
  if (!it) return;
  try {
    const spec = await sourceSpec(it);
    const sid = 'lm-img-' + id;
    if (map.getSource(sid)) return;
    const cog = it.source === 'cog';
    map.addSource(sid, cog ? { ...spec, bounds: it.bounds, minzoom: 8, maxzoom: 19 } : spec);
    map.addLayer({ id: sid, type: 'raster', source: sid, ...(cog ? { minzoom: 8 } : {}), paint: { 'raster-fade-duration': 300 } }, 'slot-imagery');
  } catch (e) { K.devlog('imagery', `${id} ${e?.message || e}`); }
}

/* 결과 층 — 결과 세트 하나 = 결과 타일 하나(지역 결과 층과 같은 길) */
async function addSet(x) {
  if (x.ids) return;
  const item = { id: 'lm-' + x.job, kind: 'vector', set: x.set, layer: 'results', promote_id: 'id', signed: false, source: 'pmtiles' };
  const sid = 'lm-r-' + x.job;
  try { map.addSource(sid, await sourceSpec(item)); } catch (e) { K.devlog('result', `${e?.message || e}`); x.ids = []; return; }
  x.ids = addResultLayers(map, sid, sid, { kind: 'landcover', sourceLayer: 'results', visible: false });
  map.on('click', `${sid}-fill`, (e) => { const f = e.features?.[0]; if (f) openProps(f, x, e.lngLat); });
  map.on('mouseenter', `${sid}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', `${sid}-fill`, () => { map.getCanvas().style.cursor = ''; });
}
async function apply() {
  for (const x of all()) {
    if (shown(x)) { await addSet(x); await addImagery(x.imagery?.id); }
    if (x.ids) setVis(map, x.ids, shown(x));
  }
  map.setLayoutProperty('lm-lxmap', 'visibility', ST.base === 'lx' ? 'visible' : 'none');
  map.setLayoutProperty('lm-cad', 'visibility', ST.base === 'cad' ? 'visible' : 'none');
  drawLeft(); drawCap();
}
const fly = (b) => { if (b) map.fitBounds(b, { padding: pad(), duration: 900, maxZoom: 15 }); };

/* ── 왼쪽 ── */
function drawLeft() {
  const on = all().filter(shown);
  const tot = on.reduce((a, x) => a + (Number(val(x.found)) || 0), 0);
  const sum = h('div.lm-sum', {},
    h('div', {}, h('b.num', {}, nf(tot), h('i', { text: '건' })), h('small', { text: `켜진 결과 · 묶음 ${new Set(on.map((x) => x.g.key)).size}개` })),
    h('div', {}, h('b.num', {}, nf(ST.items.size), h('i', { text: '건' })), h('small', { text: `내가 돌린 분석 · 묶음 ${ST.groups.length}개` })));
  const run = (D.running || []).length ? h('p.lm-run', {}, h('i'), `분석 중 ${D.running.length}건 — 끝나면 여기에 쌓입니다`) : null;
  const groups = ST.groups.map((G) => {
    const onN = G.items.filter((x) => x.on).length;
    const open = ST.open.has(G.key);
    const solo = ST.solo === G.key;
    const head = h('header.lm-gh', {},
      h('button.lm-gt', { type: 'button', 'aria-expanded': String(open), onclick: () => { open ? ST.open.delete(G.key) : ST.open.add(G.key); drawLeft(); } },
        h('span.lm-gn', { text: G.name }), h('small.num', {}, onN ? h('b', { text: String(onN) }) : null, onN ? ' / ' : '', `${G.items.length}건`), h('i', { 'aria-hidden': 'true', text: open ? '−' : '+' })),
      ST.groups.length > 1 ? h('button.lm-solo', { type: 'button', 'aria-pressed': String(solo), text: solo ? '모든 묶음 보기' : '이 묶음만 보기',
        onclick: () => soloOf(G) }) : null);
    const ul = h('ul.lm-ly', { hidden: !open });
    for (const x of G.items) {
      const cls = (x.by_class || []).filter((c) => c.n).map((c) => `${c.cls} ${nf(c.n)}`).join(' · ');
      ul.append(h('li', { class: [x.on && 'is-on', ST.pick === x.job && 'is-pick', x.on && !shown(x) && 'is-muted'].filter(Boolean).join(' ') },
        h('button.lm-sw', { type: 'button', role: 'switch', 'aria-checked': String(x.on), 'aria-label': `${G.name} ${x.region} 켜기`, onclick: () => toggle(x) }, h('i')),
        h('button.lm-li', { type: 'button', onclick: () => (x.on ? fly(x.bounds) : toggle(x)) },
          h('b', { text: `${x.region} · ${day(x.finished_at)}` }),
          h('span', { text: [x.imagery?.word ? `${x.imagery.word}영상` : '', x.scope].filter(Boolean).join(' · ') }),
          (x.by_class || []).length > 1 ? h('span.lm-cls', { text: cls }) : null),
        h('span.lm-v.num', { text: `${val(x.found) == null ? '—' : nf(val(x.found))}건` })));
    }
    return h('section.lm-grp', { class: [G.kind === 'project' && 'is-proj', solo && 'is-solo'].filter(Boolean).join(' '), dataset: { g: G.key } }, head, ul);
  });
  const bases = [['img', '영상', '분석에 쓴 영상'], ['lx', 'LX맵', `편집지적도 · ${LXMAP_Z}단계 이상`], ['cad', '연속지적', `필지 경계 · ${CAD_Z}단계 이상`]];
  const baseEl = h('div.lm-base', { role: 'radiogroup', 'aria-label': '바탕' }, ...bases.map(([k, t, s]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(ST.base === k), onclick: () => setBase(k) }, h('i'), h('span', { text: t }), h('small', { text: s }))));
  const clsOn = [...new Set(on.flatMap((x) => (x.by_class || []).filter((c) => c.n).map((c) => c.cls)))];
  const legend = h('ul.lm-lg', {}, ...clsOn.map((c) => h('li', {}, h('i', { style: `--c:${CLS_COLOR[c] || '#0FA9A0'}` }), c)),
    ST.base === 'cad' ? h('li', {}, h('i.cad'), '필지 경계') : null);
  left.replaceChildren(
    h('div.lm-top', {}, h('h1.lm-h1', { text: '지도 서비스' }), h('p.lm-sub', { text: '내가 돌린 분석 결과가 분석서비스별로 쌓입니다. 켜면 지도에 그려지고 그 범위로 갑니다.' }), sum, run),
    h('div.lm-groups', {}, ...groups),
    h('div.lm-bot', {}, h('h2', { text: '바탕' }), baseEl, clsOn.length || ST.base === 'cad' ? h('h2', { text: '범례' }) : null, legend,
      h('p.lm-foot', { text: '다른 직원이 돌린 분석은 나오지 않습니다(프로젝트 추론은 참여자 모두). 전국 · 해외 실시간 분석은 XI맵에서 합니다.' })));
}
function drawCap() {
  const on = all().filter(shown);
  cap.hidden = !on.length;
  cap.replaceChildren(...on.slice(0, 4).map((x) => h('span', { text: `${x.g.name} · ${x.region} · ${nf(val(x.found) ?? 0)}건` })),
    ...(on.length > 4 ? [h('small', { text: `외 ${on.length - 4}개 층` })] : []));
}
async function toggle(x) {
  x.on = !x.on;
  if (x.on && ST.solo && ST.solo !== x.g.key) ST.solo = null;   // 다른 묶음 층을 켜면 '이 묶음만'을 푼다
  await apply();
  if (x.on) fly(x.bounds);
  else if (ST.pick && props.dataset.job === x.job) closeProps();
}
async function soloOf(G) {
  if (ST.solo === G.key) { ST.solo = null; await apply(); return; }
  ST.solo = G.key; ST.open.add(G.key);
  let fresh = null;
  if (!G.items.some((x) => x.on)) { fresh = G.items[0]; fresh.on = true; }
  await apply();
  const b = union(G.items.filter((x) => x.on).map((x) => x.bounds));
  fly(fresh?.bounds || b);
}
const union = (bs) => bs.filter(Boolean).reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b), null);
function setBase(k) {
  ST.base = k; apply();
  const z = k === 'lx' ? LXMAP_Z : k === 'cad' ? CAD_Z : 0;
  if (z && map.getZoom() < z) K.toast(`${k === 'lx' ? 'LX맵' : '연속지적'}은 지도를 더 가까이 확대하면 보입니다`, { action: { label: '이 자리 확대', onClick: () => map.easeTo({ zoom: z + 0.5, duration: 900 }) } });
}

/* ── 오른쪽 속성 칸 — 결과 값(결과 타일 속성 그대로) + 필지 정보(연속지적 GET /parcels) ── */
let HOVER = null;
function closeProps() {
  props.hidden = true; delete props.dataset.job; ST.pick = null;
  if (HOVER) { try { map.setFeatureState(HOVER, { hover: false }); } catch { /* 층이 내려갔으면 그대로 */ } HOVER = null; }
  drawLeft();
}
async function openProps(f, x, lngLat) {
  const p = f.properties || {};
  if (HOVER) { try { map.setFeatureState(HOVER, { hover: false }); } catch { /* */ } }
  HOVER = f.id != null ? { source: f.source, sourceLayer: f.sourceLayer, id: f.id } : null;
  if (HOVER) { try { map.setFeatureState(HOVER, { hover: true }); } catch { /* */ } }
  ST.pick = x.job; props.dataset.job = x.job; props.hidden = false;
  const area = p.area_m2 != null ? Number(p.area_m2) : null;
  const conf = p.conf != null ? Math.round(Number(p.conf) * 100) : null;
  const row = (k, ...v) => h('div', {}, h('dt', { text: k }), h('dd', {}, ...v));
  const parcel = h('dl.lm-kv', {}, row('지번', h('span.lm-none', { text: '불러오는 중' })));
  const near = [lngLat.lng, lngLat.lat];
  props.replaceChildren(
    h('header.lm-ph', {}, h('div', {}, h('h2', { text: p.cls || '결과' }), h('small', { text: x.g.name }),
      h('small', { text: [x.region, p.emd && !String(x.region).includes(p.emd) ? p.emd : ''].filter(Boolean).join(' · ') })),
      h('button.lm-x', { type: 'button', 'aria-label': '속성 닫기', text: '×', onclick: closeProps })),
    h('div.lm-big', {},
      h('div', {}, h('b.num', {}, area != null ? nf(Math.round(area)) : '—', h('i', { text: '㎡' })), h('small', { text: 'AI가 그린 면적' })),
      h('div', {}, h('b.num', {}, conf != null ? String(conf) : '—', h('i', { text: '%' })), h('small', { text: '신뢰도' }))),
    h('h3', { text: '분석 결과' }),
    h('dl.lm-kv', {},
      row('분류', h('b', { text: p.cls || '—' })),
      row('신뢰도', h('span.lm-conf', {}, h('i', { style: `--w:${conf ?? 0}%` })), h('span.num', { text: conf != null ? `${conf}%` : '—' })),
      row('영상 시점', h('b', { text: x.imagery?.word || '—' }), x.imagery?.name ? h('small', { text: x.imagery.name }) : null),
      row('분석한 날', h('span.num', { text: day(x.finished_at) || '—' })),
      row('묶음', h('span', { text: x.g.name })),
      row('읍면동', h('span', { text: p.emd || '—' }))),
    h('h3', {}, '필지 정보', h('small', { text: '연속지적' })),
    parcel,
    h('div.lm-acts', {}, h('button.t-btn.t-btn--2', { type: 'button', text: 'LX맵으로 이 자리 보기',
      onclick: () => { ST.base = 'lx'; apply(); map.easeTo({ center: near, zoom: Math.max(map.getZoom(), LXMAP_Z + 0.5), duration: 900 }); } })),
    h('p.lm-src', { text: '결과는 AI 분석 값(결과 확인 전) · 필지는 연속지적도' }));
  drawLeft();
  try {
    const pc = await api(`/parcels?lng=${lngLat.lng.toFixed(6)}&lat=${lngLat.lat.toFixed(6)}`);
    if (props.dataset.job !== x.job) return;
    const pa = val(pc.area_m2), price = val(pc.price_krw_m2);
    parcel.replaceChildren(
      row('지번', h('b', { text: [pc.emd, pc.ri, pc.jibun].filter(Boolean).join(' ') || '—' })),
      row('지목', h('span', { text: pc.jimok || '—' })),
      row('필지 면적', h('span.num', { text: pa != null ? `${nf(Math.round(pa))} ㎡` : '—' })),
      row('결과 비율', h('span.num', { text: pa && area ? `${Math.min(100, Math.round((area / pa) * 100))}%` : '—' }), h('small', { text: `필지 가운데 AI가 ${p.cls || '결과'}로 그린 몫` })),
      row('공시지가', h('span.num', { text: price != null ? `${nf(price)} 원/㎡` : '—' }), pc.price_krw_m2?.as_of && price != null ? h('small', { text: `${String(pc.price_krw_m2.as_of).replace('-', '.')} 기준` }) : null));
  } catch (e) {
    K.devlog('parcels', `${e?.code || ''} ${e?.message || e}`);
    if (props.dataset.job === x.job) parcel.replaceChildren(row('지번', h('span.lm-none', { text: '이 자리의 필지 정보를 읽지 못했습니다' })));
  }
}

/* ── 처음 ── */
if (!ST.items.size) {
  const box = h('div');
  left.replaceChildren(h('div.lm-top', {}, h('h1.lm-h1', { text: '지도 서비스' }), h('p.lm-sub', { text: '내가 돌린 분석 결과가 분석서비스별로 쌓입니다.' })), box);
  K.empty(box, { kind: 'first', title: '아직 돌린 분석이 없습니다', text: '분석하기에서 서비스를 골라 분석하면 결과가 여기에 쌓입니다', action: { label: '분석하기', href: '../lx-analyze/' }, compact: true });
} else {
  await apply();
  if (first) fly(first.bounds);
}
if (WANT && !ST.items.has(WANT)) {
  const r = (D.running || []).find((x) => x.job === WANT);
  K.toast(r ? `${r.name} · ${r.region} — 분석 중입니다. 끝나면 여기에 층으로 쌓입니다` : '그 결과는 이 계정의 지도 서비스에 없습니다');
}
S.fresh(D.as_of);
release();
document.body.dataset.ready = '1';
map.once('idle', () => { document.documentElement.dataset.mapReady = '1'; });

/* 분석 중인 것이 있으면 30초마다 목록을 다시 — 끝난 결과는 꺼진 줄로 쌓이고 알림 한 줄(켜기) */
async function poll() {
  if (!(D.running || []).length) return;
  try {
    const n = await api('/me/analyses');
    const before = new Set(ST.items.keys());
    absorb(n); D.running = n.running || [];
    const fresh = all().filter((x) => !before.has(x.job));
    if (fresh.length) {
      const x = fresh[0];
      ST.open.add(x.g.key);
      K.toast(`분석이 끝났습니다 · ${x.g.name} ${x.region} ${nf(val(x.found) ?? 0)}건`, { action: { label: '켜기', onClick: () => { if (!x.on) toggle(x); } }, ms: 8000 });
    }
    drawLeft();
  } catch { /* 다음 차례에 */ }
  setTimeout(poll, 30000);
}
setTimeout(poll, 30000);
