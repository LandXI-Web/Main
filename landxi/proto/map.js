/* 지도 서비스(XI맵) — 지자체·글로벌 고객이 AI 분석 결과를 행정에 쓰는 화면.
   원판 B5-Map · B5-Map-Info · B5-Map-Compare · B7-Map-*(14장) · 기록 design-canvas/v2/notes/B7-map-states.md(38상태 대조표)
   한 벌의 작업공간을 네 페이지가 나눠 쓴다 — ximap(기본) · stats-standard(우 서랍 통계) · report-standard{,-issue}(우 서랍 보고서).
   셸(레일·마스트헤드·제목 행·푸터·토스트·모달·표·페이저)은 shell.js 것을 그대로 쓴다. */
import { mountShell, say, openModal, mountPager, bindRows, icon, esc, nf, $, $$ } from './shell.js';
import * as D from './map-data.js';
import * as GL from './map-gl.js';
import { mountStats } from './map-stats.js';
import { mountReport } from './map-report.js';
import { openPledge } from './map-pledge.js';

/* ── 각진 1.5 stroke 아이콘 — 셸에 없는 것만 여기서 ───────────────────── */
const MIC = {
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.1 2.3 2.1 11.7 0 14M10 3c-2.1 2.3-2.1 11.7 0 14"/>',
  ruler: '<path d="M3.5 12.6 12.6 3.5l3.9 3.9-9.1 9.1z"/><path d="M6.2 9.9l1.6 1.6M8.7 7.4l1.6 1.6M11.2 4.9l1.6 1.6"/>',
  pen: '<path d="M4 16h3l9-9-3-3-9 9z"/><path d="M13 4l3 3"/>',
  star: '<path d="M10 3.2l2.1 4.5 4.9.5-3.7 3.4 1 4.9L10 14l-4.3 2.5 1-4.9L3 8.2l4.9-.5z"/>',
  dl: '<path d="M10 3v10M6 9.5l4 4 4-4M3.5 16.5h13"/>',
  stack: '<path d="M10 3l7 3.6-7 3.6-7-3.6z"/><path d="M3 10.7 10 14.3l7-3.6"/>',
  back: '<path d="M12 4 6 10l6 6"/>',
  fwd: '<path d="M8 4l6 6-6 6"/>',
};
const mic = (n, s = 16) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${MIC[n] || ''}</svg>`;

/* ══ 0. 상태 — URL 에 둔다(뒤로 가기가 동작한다) ═════════════════════════ */
const VIEW = document.documentElement.dataset.view || 'map';
const DEF = { mode: 'basic', on: '', panel: 'result', left: 'on', tab: 'result', fold: '1', side: '', sel: '', q: '', epoch: '', base: '', card: '', result: '', page: '1', rtab: VIEW === 'report' ? 'list' : 'issue' };
const read = () => { const u = new URLSearchParams(location.search), s = { ...DEF }; for (const k of Object.keys(DEF)) if (u.has(k)) s[k] = u.get(k); return s; };
function write(s, push = true) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v && v !== DEF[k]) u.set(k, v);
  const q = u.toString(), url = location.pathname + (q ? '?' + q : '');
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
}
let S = read();
const P = D.mapProps();                                   // 서비스 관리가 저장한 지도 속성 — 실제 렌더에 그대로 쓴다
if (!S.base) S.base = P.baseMap;

/* 들어오는 문맥: ?result= 분석 서비스의 결과 · ?card= 대시보드/카드 발행의 카드 */
if (S.on === 'none') S.on = '';                          // 일부러 아무것도 켜지 않은 상태(빈 상태 확인용)
else if (!S.on) {
  if (S.result && D.layerById(S.result)) S.on = S.result;
  else if (S.card) S.on = D.layersOfCard(S.card).map((l) => l.id).join(',');
  else if (VIEW !== 'map') S.on = D.ALL_LAYERS[0]?.id || '';
}
if (VIEW === 'stats') S.side = 'stats';
if (VIEW === 'report' || VIEW === 'report-issue') S.side = 'report';
const onIds = () => S.on.split(',').filter(Boolean);
const setOn = (ids) => { S.on = [...new Set(ids)].join(','); };
const CTX = D.scopeCtx(S.card || D.cardOfLayer(onIds()[0])?.id || 'card-farm');

/* ══ 1. 셸 ═══════════════════════════════════════════════════════════════ */
const MODES = [{ k: 'basic', label: '기본' }, { k: 'overlay', label: '겹쳐보기' }, { k: 'parallel', label: '나란히보기' }];
const modeTabs = () => `<nav class="ptabs" data-style="line" aria-label="보기 방식">${MODES.map((m) => `<a href="?${new URLSearchParams({ ...S, mode: m.k, side: m.k === 'basic' ? S.side : '' }).toString()}" data-mode="${m.k}"${m.k === S.mode ? ' aria-current="page"' : ''}>${m.label}</a>`).join('')}</nav>`;
const shell = mountShell({ active: 'map', title: '지도 서비스', titleRule: 1, subtitle: '분석 결과를 지도에서 열람하고 통계 · 보고서로 잇습니다', fit: true, headRight: modeTabs() });

/* ══ 2. 뼈대 ═════════════════════════════════════════════════════════════ */
function boot() {
  fitLeft();                                             // 서랍을 열고 들어온 화면이면 설정 판은 띠로
  shell.main.insertAdjacentHTML('beforeend', `
<div class="mw" id="mw" data-mode="${S.mode}" data-left="${S.left}" data-side="">
  <aside class="mw-l" id="mw-l" aria-label="분석 결과 · 레이어">
    <div class="mw-l-rail"><button type="button" id="l-open" aria-label="패널 펼치기">${mic('fwd', 18)}</button><span class="vt">설정 패널 펼치기</span></div>
    <div class="mw-l-h" id="l-h"></div><div class="mw-l-b" id="l-b"></div><div class="mw-l-f" id="l-f" hidden></div>
  </aside>
  <div class="mw-stage">
    <div class="mw-plates" id="plates">
      <div class="mw-plate mw-plate--a"><div class="mw-map" id="map-a"></div><div id="ov-a"></div></div>
      <div class="mw-plate mw-plate--b" hidden><div class="mw-map" id="map-b"></div><div id="ov-b"></div></div>
      <div class="mw-swipe" id="swipe" hidden><button type="button" id="swipe-h" aria-label="비교 경계 옮기기 — 좌우 화살표 키">‹›</button></div>
    </div>
    <div class="mw-bands" id="bands" hidden></div>
    <section class="mb" id="mb" aria-label="분석 정보"></section>
  </div>
  <aside class="mw-side" id="side" aria-label="열람"></aside>
</div>`);
  $('#l-open').onclick = () => { S.left = 'on'; leftPinned = true; commit(); };
  bindSwipe();
  addEventListener('popstate', () => { S = read(); if (!S.base) S.base = P.baseMap; redraw(true); });
  addEventListener('resize', () => { anchors.forEach(place); A?.resize(); B?.resize(); positionOverlays(); });
  renderAll();
  start();
}

/* ══ 3. 판 ═══════════════════════════════════════════════════════════════ */
let A = null, B = null, toolsA = null;
const geo = new Map();                                   // layerId → FeatureCollection
let emdGeo = null, loading = 0, framedEmd = false;
const anchors = [];                                      // 판에 붙는 HTML 표식

function place(a) {
  if (!a.map || !a.el.isConnected) return;
  const p = a.map.project(a.lnglat), w = a.map.getContainer().clientWidth, h = a.map.getContainer().clientHeight;
  a.el.style.left = `${p.x}px`; a.el.style.top = `${p.y}px`;
  if (a.flip) a.el.style.transform = p.x + 330 > w ? 'translate(calc(-100% - 24px),-50%)' : 'translate(24px,-50%)';
  let off = p.x < -80 || p.y < -80 || p.x > w + 80 || p.y > h + 80;
  if (!off && a.minPx && a.bbox) {                       // 화면에서 너무 작은 도형은 이름을 달지 않는다
    const sw = a.map.project([a.bbox[0], a.bbox[1]]), ne = a.map.project([a.bbox[2], a.bbox[3]]);
    off = Math.abs(ne.x - sw.x) < a.minPx;
  }
  a.el.hidden = off;
}
function anchor(map, host, lnglat, html, cls, opt = {}) {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html; el.style.position = 'absolute';
  host.append(el); const a = { map, el, lnglat, ...opt }; anchors.push(a); place(a); return a;
}
const clearAnchors = (pred = () => true) => { for (let i = anchors.length - 1; i >= 0; i--) if (pred(anchors[i])) { anchors[i].el.remove(); anchors.splice(i, 1); } };

async function start() {
  if (!GL.hasGL()) { $('#map-a').insertAdjacentHTML('afterend', '<div class="mw-load"><div class="bx">지도 라이브러리를 불러오지 못했습니다 — 표와 통계는 그대로 동작합니다</div></div>'); await syncData(); renderAll(); return; }
  const first = D.layerById(onIds()[0]);
  A = await GL.createMap($('#map-a'), { center: first?.camera?.center || [127.42136, 35.43203], zoom: first ? 13.2 : 11.4, label: '지도 서비스 — 화살표 키로 이동, +/- 로 확대·축소' });
  GL.applyProps(A, { ...P, baseMap: S.base });
  toolsA = GL.tools(A, onTool);
  A.on('move', () => { anchors.forEach(place); paintHud(); });
  A.on('moveend', paintHud);
  A.on('click', onMapClick);
  A.on('mousemove', (e) => { if (toolsA.mode) return; const f = pick(e.point); A.getCanvas().style.cursor = f ? 'pointer' : ''; });
  await syncData();
  redraw(true);
}

/** 켜 둔 레이어의 실 GeoJSON 을 받아 판에 올린다. */
async function syncData() {
  const want = onIds();
  loading = want.filter((id) => !geo.has(id)).length;
  if (loading) renderPlate();
  await Promise.all(want.map(async (id) => {
    if (geo.has(id)) return;
    const l = D.layerById(id); if (!l) return;
    try { geo.set(id, await D.loadLayer(l)); } catch { geo.set(id, { type: 'FeatureCollection', features: [] }); }
  }));
  loading = 0;
  if (!A) return;
  for (const k of GL.resultKeys(A)) if (!want.includes(k)) GL.removeResult(A, k);
  for (const id of want) {
    const l = D.layerById(id); if (!l || !geo.get(id)) continue;
    if (!A.getSource(id)) GL.addResult(A, id, geo.get(id), { polyWidth: P.polyWidth, opacity: opacityOf(id) });
  }
  GL.setExtent(A, want.map((id) => D.layerById(id)?.bbox).filter(Boolean).filter(() => extentOn));
}

/* ── 레이어별 표시 옵션(투명도 · 탐지 결과 · 원본 영상 · 분석 영역) ───── */
const opac = new Map(); let extentOn = true, detectOn = true;
const opacityOf = (id) => (opac.has(id) ? opac.get(id) : (id === 'namwon-greenhouse-2025' ? 70 : 100));

/* ══ 4. 다시 그리기 ══════════════════════════════════════════════════════ */
/* 왼쪽 설정 판 자리 잡기 — 통계·보고서 서랍을 열면 한 화면에 판이 셋이 된다
   (설정 판 · 지도 · 서랍). 셋을 다 밀어 넣으면 1280×720 에서 지도가 40px 가 됐다.
   서랍이 열려 있는 동안에는 설정 판을 띠로 접는다. 지우는 게 아니라 이 화면이
   원래 가진 접기 장치다 — 띠에 `설정 패널 펼치기` 가 그대로 남고, 사용자가
   직접 펼치면(l-open) 그 뜻을 따라 다시 접지 않는다. */
let leftPinned = false;
function fitLeft() {
  if (leftPinned || !drawerOpen()) return;
  S.left = 'off';
}
function commit(push = true) { write(S, push); redraw(); }
async function redraw(fromUrl = false) {
  fitLeft();
  $('#mw').dataset.mode = S.mode;
  $('#mw').dataset.left = S.left;
  $('#mw').dataset.side = S.side === 'stats' || S.side === 'report' ? 'drawer' : S.side === 'info' ? 'info' : '';
  await syncData();
  A?.resize(); B?.resize();                      // 서랍·패널 폭이 바뀐 뒤라야 fit 이 제대로 잡힌다
  renderAll();
  await ensureMode();
  A?.resize(); B?.resize();
  anchors.forEach(place);
  void fromUrl;
}
function renderAll() { renderLeft(); renderPlate(); renderBottom(); renderSide(); renderHead(); }

function renderHead() {
  const on = onIds().map(D.layerById).filter(Boolean);
  const where = on[0]?.region?.replace('전북 ', '').replace('전남 ', '') || '남원시';
  const bits = S.mode === 'overlay' ? ['겹쳐보기', cmp.baseE.label + ' | ' + cmp.cmpE.label]
    : S.mode === 'parallel' ? ['나란히보기', cmp.baseE.label + ' ∥ ' + cmp.cmpE.label, '지도 2 독립']
      : S.side === 'stats' ? ['통계 자세히 보기', on[0]?.title || '']
        : S.side === 'report' ? [S.rtab === 'list' ? '보고서 발급 내역' : '보고서 발급 요청', on[0]?.title || '']
          : S.side === 'info' ? ['객체 선택', on.find((l) => l.id === selLayer)?.title || ''] : [`결과 레이어 ${on.length}`, `V-World ${D.baseName(S.base)}`, `기준일 ${(on[0]?.analyzedAt || '2026-06-08').replace(/-/g, '.')}`];
  const sub = $('#page-sub'); if (sub) sub.innerHTML = esc([where, ...bits.filter(Boolean)].join(' · '));
  $$('#page-head .ptabs a').forEach((a) => {
    a.href = '?' + new URLSearchParams({ ...S, mode: a.dataset.mode, side: a.dataset.mode === 'basic' ? S.side : '', sel: '' }).toString();
    a.toggleAttribute('aria-current', a.dataset.mode === S.mode);
    if (a.dataset.mode === S.mode) a.setAttribute('aria-current', 'page');
  });
}

/* ══ 5. 왼쪽 패널 ════════════════════════════════════════════════════════ */
const drawerOpen = () => S.side === 'stats' || S.side === 'report';
const groups = D.resultGroups();
const openGroups = new Set(groups.live.map((g) => g.service));
const treeOpen = new Set(D.LAYER_TREE.flatMap((s) => [s.name, ...s.groups.map((g) => g.name)]));
const treeOn = new Set(['lt-farm-2', 'lt-fac-2']);
let ownFilter = 'mine';

function renderLeft() {
  const h = $('#l-h'), b = $('#l-b'), f = $('#l-f');
  if (S.mode !== 'basic') return renderCompareLeft(h, b, f);
  f.hidden = true;
  const nOn = onIds().length;
  h.innerHTML = `<button type="button" class="cl" id="l-close" aria-label="패널 접기">${mic('back', 18)}</button>
    <div class="tb" role="tablist">
      <button type="button" role="tab" id="t-result" aria-selected="${S.panel === 'result'}">AI 분석 결과<span class="n">${D.ALL_LAYERS.length}</span></button>
      <button type="button" role="tab" id="t-layer" aria-selected="${S.panel === 'layer'}">레이어<span class="n">${D.TREE_LEAVES.length}</span></button>
    </div><span class="sp"></span>
    <button type="button" id="t-view" class="mic" aria-expanded="false">보기 설정 ${icon('chevD', 14)}</button>`;
  $('#l-close').onclick = () => { S.left = 'off'; commit(); };
  $('#t-result').onclick = () => { S.panel = 'result'; commit(); };
  $('#t-layer').onclick = () => { S.panel = 'layer'; commit(); };
  $('#t-view').onclick = openViewSettings;
  b.innerHTML = S.panel === 'layer' ? treeHtml() : resultHtml();
  if (S.panel === 'layer') bindTree(b); else bindResult(b);
  $('#page-head .ptabs')?.setAttribute('aria-label', '보기 방식');
  void nOn;
}
/* `모두 열기` 는 여닫이다 — 전부 열려 있으면 `모두 접기` 가 된다.
   처음 상태가 이미 전부 열림이라 눌러도 아무 일이 없었다(전반 점검이 죽은 버튼으로 잡았다). */
const allOpen = () => (S.panel === 'layer'
  ? D.LAYER_TREE.every((s) => treeOpen.has(s.name) && s.groups.every((g) => treeOpen.has(g.name)))
  : groups.live.every((g) => openGroups.has(g.service)));
function chipsRow() {
  return `<div class="mw-l-chips" role="group" aria-label="목록 거르기">
    <button type="button" class="chip-b" data-own="mine" aria-pressed="${ownFilter === 'mine'}">내 것</button>
    <button type="button" class="chip-b" data-own="shared" aria-pressed="${ownFilter === 'shared'}">공유 받은 것</button>
    <button type="button" class="btn-br btn-br--s" id="l-all">${allOpen() ? '모두 접기' : '모두 열기'}</button>
    <button type="button" class="btn-br btn-br--s" id="l-list">목록 보기</button></div>`;
}
function resultHtml() {
  const on = new Set(onIds());
  const vis = (it) => (ownFilter === 'shared' ? it.shared : true);
  return chipsRow() + groups.live.map((g) => {
    const items = g.items.filter(vis);
    if (!items.length) return '';
    const k = items.filter((i) => on.has(i.id)).length;
    const open = openGroups.has(g.service);
    return `<section class="mg"><button type="button" class="mg-h" data-grp="${esc(g.service)}" aria-expanded="${open}">${icon('chevD', 14)}${esc(g.name)}<span class="n">${k}/${items.length}</span></button>
      ${open ? items.map((it) => cardHtml(it, on.has(it.id))).join('') : ''}</section>`;
  }).join('') + soonHtml();
}
/* 결과 카드 — 세로 세 줄(제목·시점·건수)을 두 줄로 접는다.
   시점과 건수는 한 줄에서 좌·우로 나란히 놓고, 더 보기·공유 표식은 제목 줄 끝으로 올린다.
   지우는 것은 없다. 자리만 바꿔 카드 한 장이 92px → 60px 가 된다(745px 화면에서 5장이 다 보인다).
   되돌린 판단: 한 줄(제목·시점·건수를 가로로)도 재 봤는데 372px 판에서는 제목이
   말줄임으로 잘려 법전에 걸린다 — 판이 넓어지는 짧은 화면에서만 한 줄로 편다(아래 .mw-l--wide). */
function cardHtml(it, isOn) {
  return `<div class="mc" data-on="${isOn ? 1 : 0}">
    <label class="ck mc-ck"><input type="checkbox" data-layer="${esc(it.id)}"${isOn ? ' checked' : ''}><span class="sr">${esc(it.title)} 켜기</span></label>
    <img src="${esc(it.thumb)}" alt="" loading="lazy">
    <div class="mc-b">
      <p class="mc-l1"><b class="mc-t">${esc(it.title)}</b>${it.shared ? `<span class="mc-share" title="공유 받은 레이어">${icon('clip', 14)}</span>` : ''}<button type="button" class="mc-x" data-menu="${esc(it.id)}" aria-label="${esc(it.title)} 더 보기">${icon('list', 15)}</button></p>
      <p class="mc-l2"><span class="mc-m">${esc(it.meta)}</span><span class="mc-n">${nf.format(it.count)} ${esc(it.unit)}</span></p>
    </div>
  </div>${isOn ? optHtml(it) : ''}`;
}
function optHtml(it) {
  const v = opacityOf(it.id);
  return `<div class="mc-op"><span>투명도</span><input type="range" min="0" max="100" value="${v}" data-op="${esc(it.id)}" aria-label="${esc(it.title)} 투명도"><span class="v n">${v} %</span></div>
  <div class="mc-ck2">
    <label class="ck"><input type="checkbox" data-sub="detect" data-layer="${esc(it.id)}"${detectOn ? ' checked' : ''}>탐지 결과</label>
    <label class="ck"><input type="checkbox" data-sub="ortho" data-layer="${esc(it.id)}"${S.epoch ? ' checked' : ''}>원본 영상</label>
    <label class="ck"><input type="checkbox" data-sub="extent" data-layer="${esc(it.id)}"${extentOn ? ' checked' : ''}>분석 영역</label>
  </div>`;
}
/* 준비 중(결과 레이어 0) — 한 줄에 하나씩 쌓으면 6개만 보이고 나머지는 `그 외 5` 로 접혀
   279px 를 먹었다. 이름은 짧으니 가로로 흘린다: 279px → 100px 안쪽이 되고
   접어 두었던 5개까지 **전부** 보인다(줄여서 맞춘 게 아니라 늘려서 맞췄다). */
function soonHtml() {
  return `<div class="mw-soon"><h4>준비 중 · 결과 레이어 없음 <span class="z">${groups.soon.length}</span></h4>
    <ul>${groups.soon.map((g) => `<li>${esc(g.name)}<span class="z">0</span></li>`).join('')}</ul></div>`;
}
function bindResult(b) {
  b.onclick = (e) => {
    const own = e.target.closest('[data-own]'); if (own) { ownFilter = own.dataset.own; renderLeft(); return; }
    if (e.target.closest('#l-all')) { const close = allOpen(); groups.live.forEach((g) => (close ? openGroups.delete(g.service) : openGroups.add(g.service))); renderLeft(); return; }
    if (e.target.closest('#l-list')) { openListView(); return; }
    const g = e.target.closest('[data-grp]');
    if (g) { openGroups.has(g.dataset.grp) ? openGroups.delete(g.dataset.grp) : openGroups.add(g.dataset.grp); renderLeft(); return; }
    const m = e.target.closest('[data-menu]'); if (m) { openLayerMenu(D.layerById(m.dataset.menu)); }
  };
  b.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.sub) {
      if (t.dataset.sub === 'detect') { detectOn = t.checked; for (const k of GL.resultKeys(A)) for (const s of ['-pt', '-fill', '-line', '-dash']) if (A.getLayer(k + s)) A.setLayoutProperty(k + s, 'visibility', detectOn ? 'visible' : 'none'); }
      if (t.dataset.sub === 'extent') { extentOn = t.checked; GL.setExtent(A, extentOn ? onIds().map((i) => D.layerById(i)?.bbox).filter(Boolean) : []); }
      if (t.dataset.sub === 'ortho') { S.epoch = t.checked ? (S.epoch || D.EPOCHS[1].id) : ''; applyEpoch(); }
      return;
    }
    if (t.dataset.layer) {
      const id = t.dataset.layer, cur = new Set(onIds());
      t.checked ? cur.add(id) : cur.delete(id);
      setOn([...cur]); S.sel = ''; if (!cur.size) S.side = VIEW === 'map' ? '' : S.side;
      if (t.checked) { const l = D.layerById(id); await syncData(); if (A && l?.bbox) GL.fit(A, l.bbox, { maxZoom: 13.6 }); }
      commit();
    }
  };
  b.oninput = (e) => {
    const id = e.target.dataset.op; if (!id) return;
    opac.set(id, +e.target.value);
    e.target.parentElement.querySelector('.v').textContent = `${e.target.value} %`;
    if (A) GL.setResultOpacity(A, id, +e.target.value);
  };
}
function treeHtml() {
  return chipsRow() + `<div class="mt"><p class="mt-note">발행된 레이어 · 체크 = 지도에 겹침<em class="tag" style="margin-left:auto">시연</em></p>` + D.LAYER_TREE.map((s) => {
    const leaves = s.groups.flatMap((g) => g.leaves);
    const k = leaves.filter((l) => treeOn.has(l.id)).length;
    const so = treeOpen.has(s.name);
    return `<section class="mt-s"><button type="button" data-tg="${esc(s.name)}" aria-expanded="${so}">${icon('chevD', 14)}${esc(s.name)}<span class="n">${k}/${leaves.length}</span></button>
      ${so ? s.groups.map((g) => {
    const go = treeOpen.has(g.name);
    return `<div class="mt-g"><button type="button" data-tg="${esc(g.name)}" aria-expanded="${go}">${icon('chevD', 13)}${esc(g.name)}</button>
        ${go ? g.leaves.map((l) => `<label class="mt-l ck" data-on="${treeOn.has(l.id) ? 1 : 0}"><input type="checkbox" data-leaf="${esc(l.id)}"${treeOn.has(l.id) ? ' checked' : ''}><span class="dt">${esc(l.date)}</span>${esc(l.name)}${l.shared ? `<span class="sh">${icon('clip', 13)}</span>` : ''}</label>`).join('') : ''}</div>`;
  }).join('') : ''}</section>`;
  }).join('') + '</div>';
}
function bindTree(b) {
  b.onclick = (e) => {
    const own = e.target.closest('[data-own]'); if (own) { ownFilter = own.dataset.own; renderLeft(); return; }
    if (e.target.closest('#l-all')) { const close = allOpen(); D.LAYER_TREE.forEach((s) => { close ? treeOpen.delete(s.name) : treeOpen.add(s.name); s.groups.forEach((g) => (close ? treeOpen.delete(g.name) : treeOpen.add(g.name))); }); renderLeft(); return; }
    if (e.target.closest('#l-list')) { openListView(); return; }
    const t = e.target.closest('[data-tg]'); if (!t) return;
    treeOpen.has(t.dataset.tg) ? treeOpen.delete(t.dataset.tg) : treeOpen.add(t.dataset.tg); renderLeft();
  };
  b.onchange = (e) => { const id = e.target.dataset.leaf; if (!id) return; e.target.checked ? treeOn.add(id) : treeOn.delete(id); renderLeft(); paintHud(); };
}
/** 목록 보기(원본 17) — 같은 카드의 평면 나열. */
function openListView() {
  const rows = groups.live.flatMap((g) => g.items.map((it) => ({ g, it })));
  openModal({ title: '목록 보기', width: 720, tag: '시연',
    content: `<div class="tbl-wrap"><table class="tbl tbl--s"><colgroup><col style="width:180px"><col><col style="width:150px"><col style="width:110px"></colgroup>
      <thead><tr><th>과제</th><th>분석 결과</th><th>시점 · 센서</th><th class="r">건수</th></tr></thead>
      <tbody>${rows.map(({ g, it }) => `<tr><td>${esc(g.name)}</td><td>${esc(it.title)}</td><td>${esc(it.meta)}</td><td class="num r">${nf.format(it.count)} ${esc(it.unit)}</td></tr>`).join('')}</tbody></table></div>`,
    actions: [{ label: '닫기', kind: 'bracket' }] });
}
function openLayerMenu(l) {
  if (!l) return;
  openModal({ title: l.title, width: 520,
    content: `<dl class="kv" style="--kw:110px">
      <div><dt>분석 대상</dt><dd>${esc(l.what || l.method || '—')}</dd></div>
      <div><dt>지역</dt><dd>${esc(l.region)}</dd></div>
      <div><dt>${esc(CTX.unitLabel)}</dt><dd>${esc(CTX.unitExample)}</dd></div>
      <div><dt>좌표계</dt><dd class="n">${esc(CTX.global ? CTX.crs : l.crs)}</dd></div>
      <div><dt>분석 일자</dt><dd class="n">${esc(l.analyzedAt)}</dd></div>
      <div><dt>건수</dt><dd class="n">${nf.format(l.count)} ${esc(l.unit)}</dd></div>
      <div><dt>클래스</dt><dd>${l.classes.map((c) => `<span class="chip chip--teal">${esc(D.clsLabel(c))}</span>`).join(' ')}</dd></div></dl>`,
    actions: [{ label: '닫기', kind: 'bracket' }] });
}
function openViewSettings() {
  openModal({ title: '보기 설정', width: 460,
    content: `<div class="checks">
      <label class="ck"><input type="checkbox" id="v-detect"${detectOn ? ' checked' : ''}>탐지 결과</label>
      <label class="ck"><input type="checkbox" id="v-ext"${extentOn ? ' checked' : ''}>분석 영역</label>
      <label class="ck"><input type="checkbox" id="v-hyb"${hybOn ? ' checked' : ''}>지명 · 도로 겹침</label></div>`,
    actions: [{ label: '닫기', kind: 'bracket' }, { label: '적용', kind: 'primary', onClick: () => {
      detectOn = $('#v-detect').checked; extentOn = $('#v-ext').checked; hybOn = $('#v-hyb').checked;
      if (A) { GL.setHybrid(A, hybOn); GL.setExtent(A, extentOn ? onIds().map((i) => D.layerById(i)?.bbox).filter(Boolean) : []); for (const k of GL.resultKeys(A)) for (const s of ['-pt', '-fill', '-line', '-dash']) if (A.getLayer(k + s)) A.setLayoutProperty(k + s, 'visibility', detectOn ? 'visible' : 'none'); }
      renderLeft();
    } }] });
}
let hybOn = false;

/* ══ 6. 판 위 — 검색 · HUD · 도구 · 범례 · 시점 · 스케일 ════════════════ */
let sub = '';                                             // 열린 서브메뉴: basemap · measure · draw · lx
const TOOLS = [
  { k: 'search', ic: () => icon('search', 16), label: '검색' },
  { k: 'basemap', ic: () => mic('globe'), label: '배경지도 변경' },
  { k: 'measure', ic: () => mic('ruler'), label: '측정 및 분석' },
  { k: 'draw', ic: () => mic('pen'), label: '그리기 도구' },
  { k: 'export', ic: () => mic('dl'), label: '내보내기' },
  { k: 'aoi', ic: () => mic('star'), label: '관심 구역 설정' },
  { k: 'lx', ic: () => mic('stack'), label: 'LX 레이어', tl: 'LX' },
];
function renderPlate() {
  const host = $('#ov-a'); if (!host) return;
  clearAnchors((a) => a.map === A);
  const on = onIds().map(D.layerById).filter(Boolean);
  const hasL = on.length > 0;
  host.innerHTML = `
  ${S.q !== '' ? searchPanelHtml() : `<div class="mw-ov mw-ov--tl"><label class="mw-find">${icon('search', 15)}<input id="find" placeholder="명칭 또는 지도 검색" aria-label="명칭 또는 지도 검색" value=""></label><div id="hud"></div></div>`}
  <div class="mw-ov mw-ov--tr">${S.side === '' && hasL ? `<button type="button" class="btn-br btn-br--s" id="open-side">${mic('back', 14)} 분석 결과/성과</button>` : ''}${hasL ? '<button type="button" class="btn" id="export">내보내기</button>' : ''}</div>
  <div class="mw-tools" role="group" aria-label="지도 도구">${TOOLS.map((t) => `<button type="button" data-tool="${t.k}" aria-pressed="${sub === t.k}" aria-label="${esc(t.label)}" title="${esc(t.label)}">${t.ic()}${t.tl ? `<span class="tl">${t.tl}</span>` : ''}</button>`).join('')}</div>
  <div class="mw-zoom"><button type="button" id="z-in" data-audit-skip aria-label="확대">＋</button><button type="button" id="z-out" data-audit-skip aria-label="축소">－</button></div><!-- 확대·축소는 지도 캔버스를 바꾼다(DOM 이 아니라) — 전반 점검의 죽은 버튼 판정에서 뺀다 -->
  ${subHtml()}
  ${guideHtml()}
  <div class="mw-ov mw-ov--br" id="legend">${hasL ? legendHtml(on) : noneHtml()}</div>
  ${drawerOpen() ? '' : `<div class="mw-ov mw-ov--bl" id="strip">${stripHtml()}</div>`}
  <div class="mw-ov mw-ov--br" id="scale" style="bottom:14px"></div>
  ${loading ? `<div class="mw-load"><div class="bx">불러오는 중…<span class="n" id="load-n">결과 레이어 ${loading}</span></div></div>` : ''}`;
  positionOverlays();
  $('#mw').toggleAttribute('data-tooling', !!toolsA?.mode);
  bindPlate(host);
  paintHud(); paintScale();
  if (S.tab === 'region' || S.side === 'stats') paintRegion(regQ.sel);
  else if (S.side === 'report') { /* 보고서 서랍이 대상 지역을 켠다 */ }
  else { if (A?.getLayer('emd-fill')) GL.setEmd(A, [], {}); if (S.tab === 'result' && !loading) paintNumbers(); }
  if (S.sel) paintSelection();
}
/* 판 아래쪽 상자 셋(시점 스트립 · 스케일 · 범례)의 자리.
   넓은 판에서는 왼쪽(스트립)과 오른쪽(스케일·범례)이 만나지 않는다.
   판이 좁아지면 — 왼쪽 판을 넓혀 한 화면에 맞춘 짧은 모니터, 또는 통계·보고서
   서랍을 연 상태 — 셋이 겹쳐 셋 다 못 읽게 된다. 그때는 세로로 쌓는다.
   (1280×720 에서 스케일 막대가 시점 그림 위에 얹히는 것을 눈으로 보고 고쳤다) */
function positionOverlays() {
  const legend = $('#legend'), scale = $('#scale'), strip = $('#strip');
  if (!legend) return;
  const w = $('#plates')?.clientWidth || 0;
  const narrow = w < 980;
  $('#mw')?.toggleAttribute('data-narrow', narrow);
  if (scale) scale.style.bottom = '14px';
  const sh = strip ? (narrow ? strip.offsetHeight : 0) : 0;
  if (strip) strip.style.bottom = narrow ? '48px' : '14px';
  legend.style.bottom = narrow ? `${48 + sh + 10}px` : '48px';
}
function noneHtml() {
  return `<div class="mw-none"><p class="t">범례 없음</p><p class="m">선택된 작업이 없어요</p><p class="w">왼쪽에서 분석 결과를 체크하세요</p></div>`;
}
const hidden = new Set();
function legendHtml(on) {
  const rows = on.flatMap((l) => l.classes.map((c) => ({ l, c })));
  return `<div class="mw-legend"><h4>범례 · ${esc(on[0].unit)} 수 · 클릭 = 숨김</h4><ul>${rows.map(({ l, c }) => {
    const n = l.classCounts[c] || 0, off = hidden.has(l.id + '|' + c);
    return `<li><button type="button" class="li" style="display:flex;align-items:center;gap:10px;width:100%" data-cls="${esc(l.id)}|${esc(c)}" aria-pressed="${!off}"><span class="sw${D.isDashCls(c) ? ' sw--dash' : ''}"></span>${esc(D.clsLabel(c))}<span class="v">${nf.format(n)}</span></button></li>`;
  }).join('')}</ul></div>`;
}
function stripHtml() {
  const cur = S.epoch;
  return `<div class="mw-strip"><div class="h"><span>정사영상 시점 · 남원 농경지 · 드론 · GSD ${D.EPOCHS.map((e) => e.gsdCm).join(' / ')} cm</span><span class="sp"></span><span>LX 정사영상</span></div>
  <ul>${D.EPOCHS.map((e) => `<li><button type="button" data-epoch="${esc(e.id)}" aria-pressed="${cur === e.id}"><img src="${esc(e.thumb)}" alt=""><span class="lb2">${esc(e.label)}${cur === e.id ? '<span class="on">표시 중</span>' : ''}</span></button></li>`).join('')}</ul></div>`;
}
/* 배경지도 견본 — 남원 z13 실타일(키 없는 xdworld). 위성은 실 정사영상 크롭. */
const VW13 = (layer, ext) => `background-image:url(https://xdworld.vworld.kr/2d/${layer}/service/13/6995/3231.${ext})`;
const SWATCH = { base: VW13('Base', 'png'), gray: VW13('Base', 'png') + ';filter:saturate(0)', night: VW13('midnight', 'png'), satellite: VW13('Satellite', 'jpeg'), none: '' };
function subHtml() {
  if (sub === 'basemap') return `<div class="mw-sub mw-sub--wide" role="group" aria-label="배경지도 변경"><h4>배경지도 변경</h4>${D.BASE_MAPS.map((b) => `<button type="button" data-base="${b.id}" aria-pressed="${S.base === b.id}"><span class="sw${b.id === 'none' ? ' sw--none' : ''}" style="${SWATCH[b.id] || ''}"></span>${esc(b.name)}${b.id === P.baseMap ? '<span class="df">기본</span>' : ''}</button>`).join('')}</div>`;
  if (sub === 'measure') return `<div class="mw-sub${toolsA?.mode ? ' mw-sub--down' : ''}" role="group" aria-label="측정 및 분석"><h4>측정 및 분석</h4>
    <button type="button" data-msr="">${icon('x', 15)}취소</button>
    <button type="button" data-msr="distance" aria-pressed="${toolsA?.mode === 'distance'}">${mic('ruler', 15)}거리<span class="u">m · km</span></button>
    <button type="button" data-msr="area" aria-pressed="${toolsA?.mode === 'area'}">${icon('grid', 15)}면적<span class="u">m² · km²</span></button>
    <button type="button" data-msr="radius" aria-pressed="${toolsA?.mode === 'radius'}">${mic('globe', 15)}반경<span class="u">m · km</span></button></div>`;
  if (sub === 'draw') return `<div class="mw-sub${toolsA?.mode ? ' mw-sub--down' : ''}" role="group" aria-label="그리기 도구"><h4>그리기 도구</h4>
    <button type="button" data-msr="">${icon('x', 15)}취소</button>
    <button type="button" data-msr="point" aria-pressed="${toolsA?.mode === 'point'}">${icon('pin', 15)}점</button>
    <button type="button" data-msr="line" aria-pressed="${toolsA?.mode === 'line'}">${mic('ruler', 15)}선</button>
    <button type="button" data-msr="circle" aria-pressed="${toolsA?.mode === 'circle'}">${mic('globe', 15)}원</button>
    <button type="button" data-msr="polygon" aria-pressed="${toolsA?.mode === 'polygon'}">${icon('grid', 15)}면</button></div>`;
  if (sub === 'lx') return `<div class="mw-sub mw-sub--wide" role="group" aria-label="LX 레이어"><h4>LX 레이어</h4>
    <button type="button" data-lx="emd" aria-pressed="${S.tab === 'region'}">${mic('stack', 15)}읍면동 경계</button>
    <button type="button" data-lx="hyb" aria-pressed="${hybOn}">${icon('layers', 15)}지명 · 도로</button>
    <button type="button" data-lx="ext" aria-pressed="${extentOn}">${icon('grid', 15)}분석 영역</button></div>`;
  return '';
}
function guideHtml() {
  const m = toolsA?.mode;
  if (m === 'aoi') return `<div class="mw-guide mw-guide--tool"><span>${mic('star', 16)}</span><p>지도 위에 도형을 그려 관심 구역을 지정하세요</p><span class="acts"><button type="button" class="btn-br" id="g-undo">되돌리기</button><button type="button" class="btn-br" id="g-clear">전체 지우기</button><button type="button" class="btn-br" id="g-cancel">취소</button><button type="button" class="btn" id="g-save">저장</button></span></div>`;
  if (m && sub === 'measure') { const w = m === 'distance' ? ['거리', '를'] : m === 'area' ? ['면적', '을'] : ['반경', '을'];
    return `<div class="mw-guide"><div><h4>${w[0]} 측정</h4><p>지도를 클릭하여 ${w[0]}${w[1]} 측정하세요. 더블클릭으로 완료</p></div><button type="button" class="mic" id="g-x" style="margin-left:auto">${icon('x', 16)}</button></div>`; }
  if (m && sub === 'draw') return `<div class="mw-guide"><div><h4>그리기 도구</h4><p>지도를 클릭하여 도형을 그리세요. 더블클릭으로 완료</p></div><button type="button" class="mic" id="g-x" style="margin-left:auto">${icon('x', 16)}</button></div>`;
  return '';
}
function bindPlate(host) {
  host.onclick = (e) => {
    const t = e.target.closest('.mw-tools [data-tool]');   // 작업공간에도 data-tooling 이 있으니 도구 열 안에서만 찾는다
    if (t) {
      const k = t.dataset.tool;
      if (k === 'search') { S.q = S.q === '' ? D.SEARCH_SEED.q : ''; sub = ''; commit(); return; }
      if (k === 'export') { doExport(); return; }
      if (k === 'aoi') { sub = ''; toolsA?.set(toolsA.mode === 'aoi' ? null : 'aoi'); renderPlate(); return; }
      sub = sub === k ? '' : k; if (sub !== 'measure' && sub !== 'draw') toolsA?.set(null); renderPlate(); return;
    }
    const b = e.target.closest('[data-base]'); if (b) { S.base = b.dataset.base; GL.setBase(A, S.base); if (B) GL.setBase(B, S.base); sub = ''; commit(); return; }
    const m = e.target.closest('[data-msr]'); if (m) { toolsA?.set(m.dataset.msr || null); renderPlate(); return; }
    const lx = e.target.closest('[data-lx]');
    if (lx) {
      if (lx.dataset.lx === 'emd') { S.tab = S.tab === 'region' ? 'result' : 'region'; sub = ''; commit(); return; }
      if (lx.dataset.lx === 'hyb') { hybOn = !hybOn; GL.setHybrid(A, hybOn); renderPlate(); return; }
      if (lx.dataset.lx === 'ext') { extentOn = !extentOn; GL.setExtent(A, extentOn ? onIds().map((i) => D.layerById(i)?.bbox).filter(Boolean) : []); renderPlate(); return; }
    }
    const ep = e.target.closest('[data-epoch]'); if (ep) { S.epoch = S.epoch === ep.dataset.epoch ? '' : ep.dataset.epoch; applyEpoch(); commit(); return; }
    const cl = e.target.closest('[data-cls]'); if (cl) { hidden.has(cl.dataset.cls) ? hidden.delete(cl.dataset.cls) : hidden.add(cl.dataset.cls); applyHidden(); renderPlate(); return; }
    if (e.target.closest('#export')) { doExport(); return; }
    if (e.target.closest('#z-in')) { A?.zoomIn(); return; }
    if (e.target.closest('#z-out')) { A?.zoomOut(); return; }
    if (e.target.closest('#open-side')) { S.side = 'info'; S.sel = S.sel || ''; commit(); return; }
    if (e.target.closest('#g-x') || e.target.closest('#g-cancel')) { toolsA?.cancel(); sub = ''; renderPlate(); return; }
    if (e.target.closest('#g-undo')) { toolsA?.undo(); return; }
    if (e.target.closest('#g-clear')) { toolsA?.clear(); return; }
    if (e.target.closest('#g-save')) { const r = toolsA.saveAoi(); say(`관심 구역 ${r.n}개 · ${r.ha.toFixed(1)} ha 를 저장했습니다 · 시연`); renderPlate(); return; }
    bindSearchPanel(e);
  };
  const find = $('#find');
  if (find) find.onkeydown = (e) => { if (e.key === 'Enter') { S.q = find.value.trim() || D.SEARCH_SEED.q; commit(); } };
}
function applyHidden() {
  if (!A) return;
  for (const id of onIds()) {
    const off = [...hidden].filter((h) => h.startsWith(id + '|')).map((h) => h.split('|')[1]);
    GL.setResultFilter(A, id, off.length ? ['!', ['in', ['get', 'cls'], ['literal', off]]] : null);
  }
}
function applyEpoch() {
  if (!A) return;
  const ep = S.epoch ? D.epochById(S.epoch) : null;
  GL.setEpoch(A, ep);
  if (ep) GL.fit(A, ep.bounds, { maxZoom: 16.4 });
  renderPlate();
}
function paintHud() {
  const el = $('#hud'); if (!el || !A) return;
  const on = onIds().map(D.layerById).filter(Boolean);
  if (!on.length) { el.innerHTML = `<div class="mw-bar mw-hint">결과 레이어 0 · 체크하면 지도가 그 분석의 자리로 이동합니다</div>`; return; }
  const parts = [], tot = [];
  for (const l of on) {
    const g = geo.get(l.id); if (!g) continue;
    const v = GL.inView(A, g);
    for (const c of l.classes) parts.push(`${D.clsLabel(c)} ${nf.format(v.cls[c] || 0)}`);
    tot.push(nf.format(l.count));
  }
  el.innerHTML = `<div class="mw-bar mw-hint">창 안 · ${parts.join(' · ')} ${esc(on[0].unit)} ${S.side === 'stats' ? `· 표의 행 = 지도의 ${esc(CTX.unitExample)}` : S.side === 'report' ? '· 체크한 대상 지역이 켜집니다' : S.tab === 'region' ? `· ${esc(CTX.unitExample)} 채움 = 분석 면적` : S.tab === 'result' && !collapsed() ? '· 표의 행 = 판 위 번호' : '· 클릭 = 탐지 정보'} / 전체 ${tot.join(' · ')}</div>`;
  paintScale();
}
function paintScale() {
  const el = $('#scale'); if (!el || !A) return;
  const s = GL.scaleBar(A);
  el.innerHTML = `<span class="mw-scale"><i style="width:${s.px}px"></i>${esc(s.label)}<span>${s.center.lng.toFixed(4)} E · ${s.center.lat.toFixed(4)} N</span><span>z${A.getZoom().toFixed(0)}</span><span>${esc(D.baseName(S.base))}</span></span>`;
}
function onTool(st) {
  clearAnchors((a) => a.el.classList.contains('mw-tip'));
  if (!st.mode) return;
  for (const d of st.done) anchor(A, $('#ov-a'), d.at, esc(d.label), 'mw-tip');
  if (st.live && st.liveLabel) {
    const g = st.live.geometry, c = g.type === 'Point' ? g.coordinates : (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates);
    const mid = Array.isArray(c[0]) ? c[Math.floor(c.length / 2)] : c;
    anchor(A, $('#ov-a'), mid, esc(st.liveLabel), 'mw-tip mw-tip--acc');
    if (st.pts) anchor(A, $('#ov-a'), Array.isArray(c[0]) ? c[c.length - 1] : c, '클릭하여 꼭지점 추가', 'mw-tip mw-tip--ink');
  }
}

/* ══ 7. 검색 ═════════════════════════════════════════════════════════════ */
let srTab = 'all', srPick = null;
function searchPanelHtml() {
  const q = S.q, seed = D.SEARCH_SEED;
  const hit = q === seed.q || seed.q.includes(q) || q === '';
  const gs = hit ? seed.groups.filter((g) => srTab === 'all' || g.key === srTab) : [];
  const total = hit ? D.SEARCH_TOTAL : 0;
  return `<div class="srp" role="region" aria-label="검색 결과">
    <div class="sr-q">${icon('search', 15)}<input id="find" value="${esc(q)}" aria-label="명칭 또는 지도 검색"><button type="button" id="sr-clear" aria-label="지우기">${icon('x', 15)}</button></div>
    <div class="sr-t" role="tablist">${[['all', '전체'], ['name', '명칭'], ['road', '도로명'], ['jibun', '지번']].map(([k, l]) => `<button type="button" role="tab" data-srt="${k}" aria-selected="${srTab === k}">${l}</button>`).join('')}<button type="button" class="x" id="sr-close" aria-label="검색 닫기">${icon('x', 16)}</button></div>
    ${total ? `<p class="sr-sum"><span>“<b>${esc(q)}</b>” 검색결과</span><span class="bar">|</span><span>총 <b class="n">${nf.format(total)}</b> 건</span><em class="tag">시연</em></p>` : ''}
    <div class="sr-b">${total ? gs.map((g) => `<section class="sr-g"><h4 class="sr-g-h">${esc(g.label)}<span class="c">${nf.format(g.total)}</span> 건<span class="more">${esc(g.label)} 더 보기 ›</span></h4>
      ${g.rows.map((r) => `<button type="button" class="sr-r" data-go="${esc(r.lnglat.join(','))}" data-t="${esc(r.title)}" data-c="${esc(r.cat)}" aria-selected="${srPick === r.title}"><span class="t">${esc(r.title)}</span><span class="c">${esc(r.cat)}</span><span class="a">${esc(r.addr)}</span></button>`).join('')}</section>`).join('')
    : `<div class="empty">${icon('search', 28)}<p class="empty-t">검색 결과가 없습니다</p><p class="empty-w">다른 명칭 · 도로명 · 지번으로 다시 찾아 보세요</p></div>`}</div></div>`;
}
function bindSearchPanel(e) {
  const t = e.target.closest('[data-srt]'); if (t) { srTab = t.dataset.srt; renderPlate(); return; }
  if (e.target.closest('#sr-close')) { S.q = ''; srPick = null; GL.setSearchShapes(A, []); commit(); return; }
  if (e.target.closest('#sr-clear')) { const i = $('#find'); i.value = ''; i.focus(); return; }
  const go = e.target.closest('[data-go]');
  if (go) {
    const [x, y] = go.dataset.go.split(',').map(Number);
    srPick = go.dataset.t;
    A?.flyTo({ center: [x, y], zoom: 16.2, duration: 700, essential: true });
    GL.setSearchShapes(A, [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x, y] } }]);
    renderPlate();
    clearAnchors((a) => a.el.classList.contains('sr-mark'));
    anchor(A, $('#ov-a'), [x, y], `<div class="mw-call" style="position:static;width:auto"><h4><b>${esc(go.dataset.t)}</b><span class="s">${esc(go.dataset.c)}</span></h4><dl><dt>좌표</dt><dd>${x.toFixed(4)} E · ${y.toFixed(4)} N</dd></dl></div>`, 'sr-mark');
  }
}

/* ══ 8. 피처 클릭 → 콜아웃 + 탐지 정보 ══════════════════════════════════ */
let selLayer = '', selFeat = null;
function pick(pt) {
  const keys = GL.resultKeys(A).flatMap((k) => [k + '-fill', k + '-line', k + '-dash']).filter((l) => A.getLayer(l));
  if (!keys.length) return null;
  const hits = A.queryRenderedFeatures([[pt.x - 4, pt.y - 4], [pt.x + 4, pt.y + 4]], { layers: keys });
  return hits[0] || null;
}
function onMapClick(e) {
  if (toolsA?.mode) return;
  const f = pick(e.point);
  if (!f) return;
  const lid = f.layer.id.replace(/-(fill|line|dash)$/, '');
  const full = geo.get(lid)?.features.find((x) => x.properties.id === f.properties.id) || f;
  selLayer = lid; selFeat = full; S.sel = full.properties.id; S.side = 'info';
  commit();
}
function paintSelection() {
  if (!A) return;
  if (!selFeat || selFeat.properties.id !== S.sel) {
    for (const id of onIds()) { const g = geo.get(id); const f = g?.features.find((x) => x.properties.id === S.sel); if (f) { selFeat = f; selLayer = id; break; } }
  }
  if (!selFeat) return;
  GL.setHighlight(A, [selFeat]);
  const c = D.centroid(selFeat), p = selFeat.properties, l = D.layerById(selLayer);
  clearAnchors((a) => a.el.classList.contains('mw-call') || a.el.classList.contains('mw-bracket'));
  anchor(A, $('#ov-a'), c, '', 'mw-bracket');
  const q = D.pnuParts(p.pnu), ad = D.adminOf(p.pnu);
  anchor(A, $('#ov-a'), c, `<h4><span class="k">${esc(D.clsLabel(p.cls))}</span><span class="s">${esc(l?.title || '')}</span></h4>
    <dl><dt>면적</dt><dd>${nf.format(Math.round(p.area))} m²</dd>
    <dt>필지 내 객체</dt><dd>${p.nobj || 0} 개</dd>
    <dt>${esc(CTX.unitLabel)}</dt><dd>${esc(ad.sido)} ${esc(ad.sgg)} ${esc(p.emd || '')}</dd>
    <dt>지번</dt><dd>${q.ri} ${q.san} ${q.bon || '—'}-${q.bu}</dd>
    <dt>조치 상태</dt><dd>${esc(D.actLabel(D.actOf(p.id)))}</dd></dl>`, 'mw-call');
  const a = anchors[anchors.length - 1];
  const w = A.getContainer().clientWidth, px = A.project(c).x;
  a.el.style.transform = px + 330 > w ? 'translate(calc(-100% - 24px),-50%)' : 'translate(24px,-50%)';
  a.flip = true;
}

/* ══ 9. 하단 표 ══════════════════════════════════════════════════════════ */
const TTABS = [{ k: 'space', label: '공간 정보' }, { k: 'region', label: '지역 구분' }, { k: 'result', label: '분석 결과' }];
let infoTab = 'detect', page = 1, size = 10, tblQ = { emd: '', cls: '', act: '', q: '' }, regQ = { emd: '' };
const collapsed = () => S.fold !== '0';
function renderBottom() {
  const el = $('#mb'); if (!el) return;
  const on = onIds().map(D.layerById).filter(Boolean);
  if (!on.length || drawerOpen() || S.mode !== 'basic') { el.hidden = true; return; }
  el.hidden = false;
  el.removeAttribute('data-fold');
  if (collapsed()) { el.className = 'mb'; el.setAttribute('data-fold', ''); el.innerHTML = `<div class="mb-collapsed"><b>필지 행정정보</b><span class="mic">총 ${nf.format(on[0].count)}건 중 1~10행 · 연번 · 시도 · 시군구 · ${esc(CTX.unitExample)} · 리 · 산 · 본번 · 부번 · 탐지 클…</span><span class="sp"></span>${TTABS.map((t) => `<button type="button" class="mic" data-ttab="${t.k}">${t.label}</button>`).join('<span class="dim"> · </span>')}<button type="button" class="mic" id="mb-open">${icon('search', 14)} 펼치기 ${icon('chevD', 14)}</button></div>`; $('#mb-open').onclick = () => { S.fold = '0'; commit(); };
    el.querySelector('.mb-collapsed').addEventListener('click', (e) => { const t = e.target.closest('[data-ttab]'); if (!t) return; S.tab = t.dataset.ttab; S.fold = '0'; commit(); });
    return; }
  const L = on.find((l) => l.id === (selLayer || on[0].id)) || on[0];
  const card = D.cardOfLayer(L.id);
  el.innerHTML = `
  <div class="mb-h"><span class="crumb">${esc(groups.live.find((g) => g.service === L.service)?.name || '')} ${icon('chevR', 13)} <b>${esc(card?.version ? 'XI-VFM ' + card.version : 'XI-VFM')}</b> ${icon('chevR', 13)} <b>${esc(L.title)}</b></span>
    <span class="acts">
      <button type="button" id="mb-find">${icon('search', 15)}검색</button>
      ${S.tab === 'region' ? `<button type="button" id="mb-region">${mic('globe', 15)}지역 설정</button>` : ''}
      <button type="button" id="mb-fold">분석 정보 접기 ${icon('chevD', 14)}</button></span></div>
  <div class="mb-t" role="tablist">${TTABS.map((t) => `<button type="button" role="tab" data-ttab="${t.k}" aria-selected="${S.tab === t.k}">${t.label}</button>`).join('')}
    ${S.tab === 'result' ? `<span class="sub" role="tablist">${[['base', '기본 정보'], ['detect', '탐지 정보']].map(([k, l]) => `<button type="button" role="tab" data-itab="${k}" aria-selected="${infoTab === k}">${l}</button>`).join('')}</span>` : ''}
    <span class="sp"></span><span class="mic">${S.tab === 'result' ? `필지 행정정보 = PNU 에서 파생 · 기준일 ${esc(L.analyzedAt.replace(/-/g, '.'))}` : S.tab === 'region' ? `집계 단위 = ${esc(CTX.unitExample)} · 합계 ${nf.format(Math.round(D.totalArea(geo.get(L.id) || { features: [] })))} ㎡` : `좌표계 ${esc(CTX.global ? CTX.crs : L.crs)}`}</span></div>
  <div class="mb-b" id="mb-b"></div>
  <div class="mb-f" id="mb-f"><nav id="pager"></nav></div>`;
  el.querySelector('.mb-t').onclick = (e) => {
    const t = e.target.closest('[data-ttab]'); if (t) { S.tab = t.dataset.ttab; page = 1; commit(); return; }
    const i = e.target.closest('[data-itab]'); if (i) { infoTab = i.dataset.itab; renderBottom(); }
  };
  $('#mb-fold').onclick = () => { S.fold = '1'; commit(); };
  $('#mb-find').onclick = () => { $('#mb-b .mb-filters')?.scrollIntoView({ block: 'nearest' }); $('#mb-b .inp')?.focus(); };
  $('#mb-region')?.addEventListener('click', () => $('#reg-set')?.focus());
  if (S.tab === 'space') return renderSpace(L);
  if (S.tab === 'region') return renderRegion(L);
  renderResultTable(L);
}
function renderSpace(L) {
  const g = geo.get(L.id); if (!g) return;
  const b = L.bbox || D.bboxOf(g.features);
  $('#mb-b').innerHTML = `<div class="tbl-wrap"><table class="tbl tbl--s"><colgroup><col style="width:180px"><col></colgroup><tbody>
    <tr><th>분석 대상</th><td>${esc(L.what || L.method || '—')}</td></tr>
    <tr><th>원천 좌표계</th><td class="num">${esc(L.crs)} → 표출 ${esc(CTX.global ? 'EPSG:4326 (WGS84)' : 'EPSG:4326')}</td></tr>
    <tr><th>${esc(CTX.unitLabel)} 단위</th><td>${esc(CTX.unitExample)}</td></tr>
    <tr><th>범위(경위도)</th><td class="num">${b.map((v) => v.toFixed(4)).join(' , ')}</td></tr>
    <tr><th>도형 수</th><td class="num">${nf.format(g.features.length)} ${esc(L.unit)}</td></tr>
    <tr><th>면적 합계</th><td class="num">${nf.format(Math.round(D.totalArea(g)))} ㎡ · ${D.ha(D.totalArea(g)).toFixed(1)} ha</td></tr>
    <tr><th>클래스</th><td>${L.classes.map((c) => `<span class="chip chip--teal">${esc(D.clsLabel(c))} ${nf.format(L.classCounts[c] || 0)}</span>`).join(' ')}</td></tr>
    <tr><th>분석 일자</th><td class="num">${esc(L.analyzedAt.replace(/-/g, '.'))}</td></tr>
  </tbody></table></div>`;
  $('#mb-f').hidden = true;
}
function renderResultTable(L) {
  const g = geo.get(L.id); if (!g) return;
  const all = D.detectRows(g, L);
  const emds = [...new Set(all.map((r) => r.emd))].sort();
  const rows = all.filter((r) => (!tblQ.emd || r.emd === tblQ.emd) && (!tblQ.cls || r.cls === tblQ.cls) && (!tblQ.act || r.act === tblQ.act)
    && (!tblQ.q || `${r.emd} ${r.bon} ${r.clsLabel} ${r.pnu}`.includes(tblQ.q)));
  const ad = D.adminOf(all[0]?.pnu);
  const from = (page - 1) * size, part = rows.slice(from, from + size);
  const base = infoTab === 'base';
  $('#mb-f').hidden = false;
  $('#mb-b').innerHTML = `
  <form class="mb-filters" id="tblq" role="search">
    <span class="f"><span class="lb">시도</span><span class="sel"><select aria-label="시도"><option>${esc(ad.sido)}</option></select></span></span>
    <span class="f"><span class="lb">시군구</span><span class="sel"><select aria-label="시군구"><option>${esc(ad.sgg)}</option></select></span></span>
    <span class="f"><span class="lb">${esc(CTX.unitExample)}</span><span class="sel"><select name="emd" aria-label="${esc(CTX.unitExample)}"><option value="">전체</option>${emds.map((e) => `<option${tblQ.emd === e ? ' selected' : ''}>${esc(e)}</option>`).join('')}</select></span></span>
    <span class="f"><span class="lb">탐지 클래스</span><span class="sel"><select name="cls" aria-label="탐지 클래스"><option value="">전체</option>${L.classes.map((c) => `<option value="${esc(c)}"${tblQ.cls === c ? ' selected' : ''}>${esc(D.clsLabel(c))}</option>`).join('')}</select></span></span>
    <span class="f"><span class="lb">조치 상태</span><span class="sel"><select name="act" aria-label="조치 상태"><option value="">전체</option>${D.ACT_STEPS.map((s) => `<option value="${s.k}"${tblQ.act === s.k ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></span></span>
    <span class="f" style="flex:1;min-width:220px"><span class="lb">검색어</span><input class="inp" name="q" placeholder="검색어를 입력하세요" aria-label="검색어" value="${esc(tblQ.q)}"></span>
    <span class="g"><button type="reset" class="btn-br">초기화</button><button class="btn" style="width:96px">검색</button></span></form>
  <div class="tbl-wrap"><table class="tbl tbl--s">
    <colgroup><col style="width:64px"><col style="width:132px"><col style="width:96px"><col style="width:96px"><col style="width:84px"><col style="width:60px"><col style="width:86px"><col style="width:74px"><col><col style="width:110px"></colgroup>
    <thead><tr><th>연번</th><th>시도</th><th>시군구</th><th>${esc(CTX.unitExample)}</th><th>리(코드)</th><th>산</th><th class="r">본번</th><th class="r">부번</th><th>${base ? '조치 상태' : '탐지 클래스'}</th><th class="r">면적(㎡)</th></tr></thead>
    <tbody id="tbody">${part.map((r, i) => `<tr data-row tabindex="0" aria-selected="${S.sel === r.id}" data-id="${esc(r.id)}">
      <td class="num">${from + i + 1}</td><td>${esc(r.sido)}</td><td>${esc(r.sgg)}</td><td>${esc(r.emd)}</td><td class="num">${esc(r.ri)}</td><td class="c">${esc(r.san)}</td><td class="num r">${esc(String(r.bon))}</td><td class="num r">${esc(String(r.bu))}</td>
      <td>${base ? `<span class="st${r.act === 'done' ? ' st--acc' : r.act === 'doing' ? ' st--warn' : ''}">${esc(D.actLabel(r.act))}</span>` : esc(r.clsLabel)}</td><td class="num r">${nf.format(Math.round(r.area))}</td></tr>`).join('')}</tbody></table></div>
    ${rows.length ? '' : `<div class="empty empty--s">${icon('search', 26)}<p class="empty-t">검색 조건에 맞는 결과가 없습니다</p></div>`}`;
  mountPager($('#pager'), { total: rows.length, page, size, sizes: [...new Set([size, 10, 20, 50])].sort((a, b) => a - b), onChange: (st) => { page = st.page; sizePref = size = st.size; renderBottom(); frameRows(); } });
  fitBottomRows();
  bindRows($('#tbody'), (tr) => {
    S.sel = tr.dataset.id; S.side = 'info';
    const r = part.find((x) => x.id === tr.dataset.id);
    if (r && A) A.flyTo({ center: r.lnglat, zoom: Math.max(A.getZoom(), 16.4), duration: 700, essential: true });
    commit();
  });
  const form = $('#tblq');
  form.onsubmit = (e) => { e.preventDefault(); const f = new FormData(form); tblQ = { emd: f.get('emd') || '', cls: f.get('cls') || '', act: f.get('act') || '', q: (f.get('q') || '').trim() }; page = 1; renderBottom(); };
  form.onreset = () => { setTimeout(() => { tblQ = { emd: '', cls: '', act: '', q: '' }; page = 1; renderBottom(); }, 0); };
  paintNumbers(part);
  // 번호가 창 밖이면 판을 그 쪽으로 — 표의 행 번호가 판 위 번호와 같아야 한다
  queueMicrotask(() => { if (part.length && !anchors.some((a) => a.el.classList.contains('mw-num') && !a.el.hidden)) frameRows(); });
}
/* 아래 표의 한 쪽 행 수를 남은 높이에 맞춘다 — 통계 · 보고서 서랍과 같은 장치다.
   쪽넘김이 `총 2,098건 중 1~N 행` 을 계속 말하므로 지운 것이 아니고,
   사용자가 페이지 크기를 직접 고르면(sizePref) 그 뜻을 따른다. */
let sizePref = 0, fitPass = 0;
function fitBottomRows() {
  if (sizePref) { fitPass = 0; return; }
  const box = $('#mb-b'), tb = $('#tbody');
  if (!box || !tb || !tb.rows.length) { fitPass = 0; return; }
  const rh = Math.max(20, tb.rows[0].getBoundingClientRect().height);
  const over = box.scrollHeight - box.clientHeight;
  let next = size;
  if (over > 2) next = Math.max(2, size - Math.ceil(over / rh));
  else if (size < 10 && -over >= rh) next = Math.min(10, size + Math.floor(-over / rh));
  if (next !== size && fitPass < 6) { fitPass++; size = next; page = 1; renderBottom(); return; }
  fitPass = 0;
}
/** 표의 번호가 판 위 번호이려면 그 쪽의 도형이 창 안에 있어야 한다. */
function frameRows() {
  const fs = lastPart.map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: r.lnglat } }));
  if (A && fs.length) GL.fit(A, D.bboxOf(fs), { pad: 120, maxZoom: 16.6 });
}
let lastPart = [];
function paintNumbers(part) {
  if (part) lastPart = part;
  if (!A) return;
  clearAnchors((a) => a.el.classList.contains('mw-num'));
  if (!part) return;
  GL.setNumbers(A, part.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: r.lnglat } })));
  for (const [i, r] of part.entries()) {
    const a = anchor(A, $('#ov-a'), r.lnglat, String((page - 1) * size + i + 1), 'mw-num');
    a.el.dataset.on = S.sel === r.id ? '1' : '0';
  }
}
function renderRegion(L) {
  const g = geo.get(L.id); if (!g) return;
  const rows = D.byEmd(g).filter((r) => !regQ.emd || r.emd === regQ.emd);
  const max = Math.max(...rows.map((r) => r.area), 1);
  const ad = D.adminOf(g.features[0]?.properties.pnu);
  const from = (page - 1) * size, part = rows.slice(from, from + size);
  const cls = L.classes;
  $('#mb-f').hidden = false;
  $('#mb-b').innerHTML = `
  <form class="mb-filters" id="regq">
    <span class="f"><span class="lb">시도</span><span class="sel"><select aria-label="시도"><option>${esc(ad.sido)}</option></select></span></span><span class="arrow">${icon('chevR', 14)}</span>
    <span class="f"><span class="lb">시군구</span><span class="sel"><select aria-label="시군구"><option>${esc(ad.sgg)}</option></select></span></span><span class="arrow">${icon('chevR', 14)}</span>
    <span class="f"><span class="lb">${esc(CTX.unitExample)}</span><span class="sel"><select name="emd" aria-label="${esc(CTX.unitExample)}"><option value="">전체</option>${D.byEmd(g).map((r) => `<option${regQ.emd === r.emd ? ' selected' : ''}>${esc(r.emd)}</option>`).join('')}</select></span></span>
    <span class="mic" style="padding-bottom:8px">설정하면 표가 한 단계 내려가고 지도가 그 지역으로 이동합니다</span>
    <span class="g"><button type="reset" class="btn-br">초기화</button><button class="btn" id="reg-set" style="width:96px">설정</button></span></form>
  <div class="tbl-wrap"><table class="tbl tbl--s">
    <colgroup><col style="width:64px"><col style="width:140px"><col style="width:100px"><col style="width:110px">${cls.map(() => '<col style="width:124px">').join('')}<col style="width:124px"><col></colgroup>
    <thead><tr><th>연번</th><th>시도</th><th>시군구</th><th>${esc(CTX.unitExample)}</th>${cls.map((c) => `<th class="r">${esc(D.clsLabel(c))}(㎡)</th>`).join('')}<th class="r">전체(㎡)</th><th>${cls.map((c, i) => `${i ? ' · ' : ''}${esc(D.clsLabel(c))} ${D.isDashCls(c) ? '□' : '■'}`).join('')} · 가장 큰 ${esc(CTX.unitExample)} 대비</th></tr></thead>
    <tbody id="tbody">${part.map((r, i) => `<tr data-row tabindex="0" aria-selected="${regQ.sel === r.emd}" data-emd="${esc(r.emd)}">
      <td class="num">${from + i + 1}</td><td>${esc(ad.sido)}</td><td>${esc(ad.sgg)}</td><td><b>${esc(r.emd)}</b></td>
      ${cls.map((c) => `<td class="num r">${nf.format(Math.round(r.cls[c] || 0))}</td>`).join('')}
      <td class="num r">${nf.format(Math.round(r.area))}</td>
      <td><span class="bar" style="width:${Math.round((r.area / max) * 100)}%"><i style="width:${Math.round(((r.cls[cls[0]] || 0) / (r.area || 1)) * 100)}%"></i></span></td></tr>`).join('')}</tbody></table></div>`;
  mountPager($('#pager'), { total: rows.length, page, size, sizes: [...new Set([size, 10, 20, 50])].sort((a, b) => a - b), onChange: (st) => { page = st.page; sizePref = size = st.size; renderBottom(); } });
  fitBottomRows();
  bindRows($('#tbody'), (tr) => { regQ.sel = tr.dataset.emd; paintRegion(tr.dataset.emd); });
  const form = $('#regq');
  form.onsubmit = (e) => { e.preventDefault(); regQ.emd = new FormData(form).get('emd') || ''; page = 1; renderBottom(); paintRegion(regQ.emd); };
  form.onreset = () => setTimeout(() => { regQ = { emd: '' }; page = 1; renderBottom(); paintRegion(); }, 0);
  paintRegion(regQ.sel);
}
async function paintRegion(selEmd) {
  if (!A) return;
  if (!emdGeo) { try { emdGeo = await D.loadEmd(); } catch { emdGeo = { features: [] }; } }
  const L = D.layerById(onIds()[0]); const g = L ? geo.get(L.id) : null;
  if (!g) return;
  const agg = new Map(D.byEmd(g).map((r) => [r.emd, r]));
  const q = D.quintile([...agg.values()].map((r) => r.area));
  const fs = emdGeo.features.map((f) => {
    const r = agg.get(f.properties.nm);
    return { ...f, properties: { ...f.properties, area: r?.area || 0, n: r?.n || 0, step: r ? q(r.area) : 0, fill: r ? GL.EMD_FILL[q(r.area) - 1] || GL.EMD_FILL[0] : 'rgba(0,0,0,0)', sel: f.properties.nm === selEmd } };
  });
  GL.setEmd(A, fs, { lxColor: P.lxColor, lxWidth: P.lxWidth });
  if (!selEmd && !framedEmd) { framedEmd = true; GL.fit(A, D.bboxOf(fs.filter((f) => f.properties.area > 0)), { pad: 70, maxZoom: 11.4 }); }
  clearAnchors((a) => a.el.classList.contains('mw-num') || a.el.classList.contains('mw-emd') || a.el.classList.contains('mw-call'));
  for (const f of fs) if (f.properties.area > 0) anchor(A, $('#ov-a'), D.centroid(f), esc(f.properties.nm), 'mw-emd', { bbox: D.bboxOf([f]), minPx: 52 });
  const max = Math.max(...[...agg.values()].map((r) => r.area), 1);
  const legend = $('#legend');
  if (legend) legend.innerHTML = `<div class="mw-legend"><h4>범례 · ${esc(CTX.unitExample)}별 분석 면적</h4><ul><li style="gap:0;padding:6px 12px">${GL.EMD_FILL.map((c) => `<span class="sw" style="background:${c};width:38px;border-right:0"></span>`).join('')}</li><li style="padding-top:0"><span class="mic">적음 · 5분위</span><span class="v">최대 ${nf.format(Math.round(max))} ㎡</span></li></ul></div>`;
  if (selEmd) {
    const f = fs.find((x) => x.properties.nm === selEmd);
    if (f) {
      GL.fit(A, D.bboxOf([f]), { pad: 140, maxZoom: 12.6 });
      const r = agg.get(selEmd);
      anchor(A, $('#ov-a'), D.centroid(f), `<h4><b>${esc(selEmd)}</b><span class="s">${nf.format(r?.n || 0)} ${esc(L.unit)}</span></h4><dl>${(L.classes || []).map((c) => `<dt>${esc(D.clsLabel(c))}</dt><dd>${nf.format(Math.round(r?.cls[c] || 0))} m²</dd>`).join('')}</dl>`, 'mw-call');
    }
  }
}

/* ══ 10. 오른쪽 — 탐지 정보 판 · 통계/보고서 서랍 ═══════════════════════ */
function renderSide() {
  const el = $('#side'); if (!el) return;
  if (S.side === 'stats') return mountStats(el, ctxFor(), { onClose: closeSide, onPledge: doExport, onFocusEmd: (nm) => paintRegionFromStats(nm), commit });
  if (S.side === 'report') return mountReport(el, ctxFor(), { onClose: closeSide, onPledge: doExport, onFocusEmd: (nms) => paintReportEmds(nms), tab: S.rtab, setTab: (t) => { S.rtab = t; commit(); } });
  if (S.side === 'info') return renderInfo(el);
  el.innerHTML = '';
}
const closeSide = () => { S.side = ''; S.sel = ''; commit(); };
function ctxFor() {
  const L = D.layerById(selLayer) || D.layerById(onIds()[0]) || D.ALL_LAYERS[0];
  return { layer: L, geo: geo.get(L?.id), ctx: CTX, emdGeo, card: D.cardOfLayer(L?.id) };
}
function renderInfo(el) {
  if (!S.sel) { el.innerHTML = `<div class="mi"><div class="mi-h"><p class="lb">분석 결과/성과</p><button type="button" class="x" id="side-x" aria-label="닫기">${icon('x', 18)}</button></div><div class="empty">${icon('pin', 28)}<p class="empty-t">선택된 객체가 없어요</p><p class="empty-w">지도에서 탐지 도형을 누르거나 아래 표에서 행을 고르세요</p></div></div>`; $('#side-x').onclick = closeSide; return; }
  if (!selFeat || selFeat.properties.id !== S.sel) paintSelection();
  const p = selFeat?.properties; if (!p) return;
  const L = D.layerById(selLayer), g = geo.get(selLayer);
  const ad = D.adminOf(p.pnu), q = D.pnuParts(p.pnu), act = D.actOf(p.id);
  const cls = D.byClass(g), total = cls.reduce((a, c) => a + c.area, 0);
  const idx = Math.max(0, g.features.indexOf(selFeat)) % 4 + 1;
  el.innerHTML = `<div class="mi">
    <div class="mi-h"><p class="lb">탐지 정보</p><button type="button" class="x" id="side-x" aria-label="닫기">${icon('x', 18)}</button></div>
    <h2>${esc(D.clsLabel(p.cls))}</h2>
    <p class="mi-sub">${esc(L.title)} · ${esc(ad.sido)} ${esc(ad.sgg)} ${esc(p.emd)} · <span class="st${act === 'done' ? ' st--acc' : act === 'doing' ? ' st--warn' : ''}">${esc(D.actLabel(act))}</span></p>
    <figure class="mi-fig"><img src="${esc(D.CROP)}${esc(L.id)}/${idx}.jpg" alt="${esc(D.clsLabel(p.cls))} 실사 크롭"><figcaption>${D.centroid(selFeat)[0].toFixed(5)} E · ${D.centroid(selFeat)[1].toFixed(5)} N · ${esc(D.baseName(S.base))}</figcaption></figure>
    <dl class="kv">
      <div><dt>탐지 클래스</dt><dd>${esc(D.clsLabel(p.cls))}</dd></div>
      <div><dt>면적</dt><dd class="n">${nf.format(Math.round(p.area))} m²</dd></div>
      <div><dt>필지 고유번호</dt><dd class="n">${esc(p.pnu || '—')}</dd></div>
      <div><dt>지번</dt><dd class="n">${esc(q.ri)} ${esc(q.san)} ${q.bon || '—'}-${q.bu}</dd></div>
      <div><dt>${esc(CTX.unitLabel)}</dt><dd>${esc(ad.sido)} ${esc(ad.sgg)} ${esc(p.emd)}</dd></div>
      <div><dt>필지 내 객체</dt><dd class="n">${p.nobj || 0} 개</dd></div>
      <div><dt>탐지 일시</dt><dd class="n">${esc(L.analyzedAt.replace(/-/g, '.'))} · ${esc(L.meta)}</dd></div>
      <div><dt>원본 자료</dt><dd>LX 정사영상 · ${esc(L.region)}</dd></div></dl>
    <section class="mi-act"><h3>조치 상태 변경</h3>
      <div class="mi-steps" role="group" aria-label="조치 상태">${D.ACT_STEPS.map((s) => `<button type="button" data-act="${s.k}"${s.k === act ? ' aria-current="step"' : ''}>${esc(s.label)}</button>`).join('')}</div>
      <div class="mi-memo"><input class="inp" id="memo" placeholder="조치 메모 · 예) 4/15 현장 확인" value="${esc(D.actMemo(p.id))}" aria-label="조치 메모"><button type="button" class="btn-br" id="act-close">${icon('x', 14)} 닫기</button><button type="button" class="btn" id="act-save">저장</button></div>
      <p class="mic" style="margin:10px 0 0">${icon('chevR', 13)} <button type="button" class="link" id="to-table">이전으로 · 탐지 목록</button></p></section>
    <section class="mi-sum"><h3>분석 개요 · 클래스별 면적 · 합계 ${nf.format(Math.round(total))} m²</h3>
      ${cls.map((c) => `<div class="row"><span class="sw${D.isDashCls(c.cls) ? ' sw--dash' : ''}"></span>${esc(c.label)}<span class="m"><i style="width:${c.pct.toFixed(1)}%"></i></span><span class="v">${nf.format(Math.round(c.area))} m² · ${Math.round(c.pct)} %</span></div>`).join('')}</section>
  </div>
  <div class="mi-f"><button type="button" class="btn-br" id="go-stats">${icon('grid', 15)} 통계 자세히 보기</button><button type="button" class="btn-br" id="go-report">${icon('clip', 15)} 보고서 발급</button></div>`;
  $('#side-x').onclick = closeSide;
  $('#act-close').onclick = closeSide;
  $('#to-table').onclick = () => { S.tab = 'result'; infoTab = 'detect'; commit(); };
  el.querySelector('.mi-steps').onclick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; D.setAct(p.id, b.dataset.act); renderSide(); renderBottom(); };
  $('#act-save').onclick = () => { D.setAct(p.id, D.actOf(p.id), $('#memo').value); say('조치 상태를 저장했습니다 · 시연'); renderBottom(); };
  $('#go-stats').onclick = () => { location.href = `stats-standard.html?result=${encodeURIComponent(selLayer)}&on=${encodeURIComponent(S.on)}`; };
  $('#go-report').onclick = () => { location.href = `report-standard-issue.html?result=${encodeURIComponent(selLayer)}&on=${encodeURIComponent(S.on)}`; };
}
async function paintRegionFromStats(nm) {
  S.tab = 'region'; await paintRegion(nm);
}
async function paintReportEmds(names) {
  if (!A) return;
  if (!emdGeo) { try { emdGeo = await D.loadEmd(); } catch { emdGeo = { features: [] }; } }
  const set = new Set(names);
  const fs = emdGeo.features.map((f) => ({ ...f, properties: { ...f.properties, fill: set.has(f.properties.nm) ? 'rgba(27,163,232,.42)' : 'rgba(0,0,0,0)', sel: set.has(f.properties.nm) } }));
  GL.setEmd(A, fs, { lxColor: P.lxColor, lxWidth: P.lxWidth });
  clearAnchors((a) => a.el.classList.contains('mw-num') || a.el.classList.contains('mw-emd'));
  for (const f of fs) if (set.has(f.properties.nm)) anchor(A, $('#ov-a'), D.centroid(f), esc(f.properties.nm), 'mw-emd', { bbox: D.bboxOf([f]), minPx: 46 });
  if (set.size) GL.fit(A, D.bboxOf(fs.filter((f) => set.has(f.properties.nm))), { pad: 90, maxZoom: 11.6 });
}

/* ══ 11. 겹쳐보기 · 나란히보기 ══════════════════════════════════════════ */
const cmp = { baseE: D.EPOCHS[0], cmpE: D.EPOCHS[3], layer: 'namwon-change-2504-2510', ratio: 50 };
function renderCompareLeft(h, b, f) {
  h.innerHTML = `<button type="button" class="cl" id="l-close" aria-label="패널 접기">${mic('back', 18)}</button>
    <div class="tb"><button type="button" aria-selected="true">비교할 분석 선택<span class="n">2</span></button></div>`;
  $('#l-close').onclick = () => { S.left = 'off'; commit(); };
  b.innerHTML = chipsRow().replace('모두 열기', '과제별').replace('목록 보기', '목록')
    + `<p class="mv-h">정사영상 시점 · 남원 농경지 · 드론 ${D.EPOCHS.length}</p>`
    + D.EPOCHS.map((e) => `<div class="mv" data-ep="${esc(e.id)}" aria-selected="${cmp.baseE.id === e.id || cmp.cmpE.id === e.id}">
        <img src="${esc(e.thumb)}" alt=""><div><b class="mv-t">남원 농경지 · ${esc(e.label)}</b><p class="mv-m">드론 · GSD ${esc(e.gsdCm)} cm · 0.62 km²</p><p class="mv-m">LX 정사영상</p></div>
        ${cmp.baseE.id === e.id ? '<span class="mv-k">기준</span>' : cmp.cmpE.id === e.id ? '<span class="mv-k mv-k--b">비교 대상</span>' : ''}</div>`).join('')
    + `<p class="mv-h" style="border-top:1px solid var(--line);padding-top:10px">결과 레이어 · 비교 대상에 겹침</p>`
    + D.ALL_LAYERS.filter((l) => l.region.includes('남원')).map((l) => `<label class="mv ck" data-cmp="${esc(l.id)}"><input type="checkbox" data-cmpl="${esc(l.id)}"${cmp.layer === l.id ? ' checked' : ''}><img src="${esc(l.thumb)}" alt=""><div><b class="mv-t">${esc(l.title)}</b><p class="mc-n">${nf.format(l.count)} ${esc(l.unit)}</p></div></label>`).join('');
  f.hidden = false;
  f.innerHTML = `<span class="mic">다시 누르면 해제</span><span class="sp"></span><button type="button" class="btn-br" id="cmp-cancel" style="width:84px">취소</button><button type="button" class="btn" id="cmp-apply" style="width:96px">적용</button>`;
  b.onclick = (e) => {
    const ep = e.target.closest('[data-ep]'); if (!ep) return;
    const id = ep.dataset.ep;
    if (cmp.baseE.id === id) return; if (cmp.cmpE.id === id) { cmp.cmpE = cmp.baseE; cmp.baseE = D.epochById(id); } else cmp.cmpE = D.epochById(id);
    renderLeft(); applyCompare();
  };
  b.onchange = (e) => { const id = e.target.dataset.cmpl; if (!id) return; cmp.layer = e.target.checked ? id : ''; renderLeft(); applyCompare(); };
  $('#cmp-cancel').onclick = () => { S.mode = 'basic'; commit(); };
  $('#cmp-apply').onclick = () => { applyCompare(); say(`${cmp.baseE.label} → ${cmp.cmpE.label} 를 적용했습니다`); };
}
async function ensureMode() {
  const plateB = $('.mw-plate--b'), swipeEl = $('#swipe'), bands = $('#bands');
  if (S.mode === 'basic') { plateB.hidden = true; swipeEl.hidden = true; bands.hidden = true; if ($('#ov-b')) $('#ov-b').innerHTML = ''; return; }
  plateB.hidden = false; swipeEl.hidden = S.mode !== 'overlay'; bands.hidden = false;
  if (!B && GL.hasGL()) {
    B = await GL.createMap($('#map-b'), { center: cmp.cmpE.bounds ? [(cmp.cmpE.bounds[0] + cmp.cmpE.bounds[2]) / 2, (cmp.cmpE.bounds[1] + cmp.cmpE.bounds[3]) / 2] : [127.3524, 35.5312], zoom: 15.6, label: '비교 대상 지도' });
    GL.applyProps(B, { ...P, baseMap: S.base });
    B.on('move', () => { anchors.forEach(place); if (S.mode === 'overlay' && !syncing) sync(B, A); });
    B.on('click', onMapClickB);
    A.on('move', () => { if (S.mode === 'overlay' && !syncing) sync(A, B); });
  }
  await applyCompare();
  renderBands();
  renderCompareOverlays();
}
let syncing = false;
function sync(from, to) { syncing = true; to.jumpTo({ center: from.getCenter(), zoom: from.getZoom() }); syncing = false; }
async function applyCompare() {
  if (!A || !B) return;
  GL.setEpoch(A, cmp.baseE); GL.setEpoch(B, cmp.cmpE);
  const L = D.layerById(cmp.layer);
  for (const m of [A, B]) for (const k of GL.resultKeys(m)) GL.removeResult(m, k);
  if (L) {
    if (!geo.has(L.id)) { try { geo.set(L.id, await D.loadLayer(L)); } catch { geo.set(L.id, { type: 'FeatureCollection', features: [] }); } }
    GL.addResult(B, L.id, geo.get(L.id), { polyWidth: P.polyWidth });
    if (S.mode === 'overlay') GL.addResult(A, L.id, geo.get(L.id), { polyWidth: P.polyWidth });
  }
  GL.fit(A, cmp.baseE.bounds, { pad: 20, maxZoom: 16.4, instant: true });
  GL.fit(B, cmp.cmpE.bounds, { pad: 20, maxZoom: 16.4, instant: true });
  renderCompareOverlays(); renderBands(); renderCompareSide();
}
function renderCompareOverlays() {
  const a = $('#ov-a'), b = $('#ov-b'); if (!a) return;
  const L = D.layerById(cmp.layer);
  const tools = (side) => `<div class="mw-tools" role="group" aria-label="${side} 지도 도구">${TOOLS.map((t) => `<button type="button" aria-label="${esc(t.label)}" title="${esc(t.label)}">${t.ic()}${t.tl ? `<span class="tl">${t.tl}</span>` : ''}</button>`).join('')}</div>
    <div class="mw-zoom"><button type="button" data-z="in" data-side="${side}" aria-label="확대">＋</button><button type="button" data-z="out" data-side="${side}" aria-label="축소">－</button></div>`;
  a.innerHTML = `<div class="mw-ov mw-ov--tl"><div class="mw-bar">기준 <b>${esc(cmp.baseE.label)}</b> ${esc(cmp.baseE.gsdCm)} cm <button type="button" class="link" id="ch-base" style="color:#7FC4FF">변경 ›</button></div>
    <div class="mw-bar mw-hint">${L && S.mode === 'overlay' ? `${esc(L.title)} 겹침` : '원본 영상 · 결과 레이어 없음'}</div></div>
    ${tools('좌')}<div class="mw-ov mw-ov--bl" id="scale-a"></div>`;
  b.innerHTML = `<div class="mw-ov mw-ov--tl"><div class="mw-bar">비교 대상 <b>${esc(cmp.cmpE.label)}</b> ${esc(cmp.cmpE.gsdCm)} cm <button type="button" class="link" id="ch-cmp" style="color:#7FC4FF">변경 ›</button></div>
    ${L ? `<div class="mw-bar mw-hint">변화 ${nf.format(L.count)} ${esc(L.unit)} · ${D.ha(L.areaM2).toFixed(1)} ha · ${esc(L.method || L.title)}</div>` : ''}</div>
    ${tools('우')}${L && S.mode === 'parallel' ? legendBox(L) : ''}
    <div class="mw-ov mw-ov--bl" id="scale-b"></div>`;
  if (L && S.mode === 'overlay') a.insertAdjacentHTML('beforeend', legendBox(L));
  const zoomIt = (e) => { const z = e.target.closest('[data-z]'); if (!z) return; const m = z.dataset.side === '우' ? B : A; z.dataset.z === 'in' ? m.zoomIn() : m.zoomOut(); };
  a.onclick = (e) => { if (e.target.closest('#ch-base')) { say('왼쪽 목록에서 기준 시점을 고르세요'); return; } zoomIt(e); };
  b.onclick = (e) => { if (e.target.closest('#ch-cmp')) { say('왼쪽 목록에서 비교 대상 시점을 고르세요'); return; } zoomIt(e); };
  const sc = (m, id) => { if (!m || !$(id)) return; const s = GL.scaleBar(m, 90); $(id).innerHTML = `<span class="mw-scale"><i style="width:${s.px}px"></i>${esc(s.label)}<span>${id === '#scale-a' ? '좌' : '우'} 지도</span></span>`; };
  sc(A, '#scale-a'); sc(B, '#scale-b');
  A?.on('move', () => sc(A, '#scale-a')); B?.on('move', () => sc(B, '#scale-b'));
}
const legendBox = (L) => `<div class="mw-ov mw-ov--br" style="bottom:14px"><div class="mw-legend"><h4>범례 · ${esc(L.method || L.title)} · ${esc(L.unit)}</h4><ul>${L.classes.map((c) => `<li><span class="sw${D.isDashCls(c) ? ' sw--dash' : ''}"></span>${esc(D.clsLabel(c))}<span class="v">${nf.format(L.classCounts[c] || 0)}</span></li>`).join('')}</ul></div></div>`;
function renderBands() {
  const el = $('#bands'); if (!el || S.mode === 'basic') return;
  const L = D.layerById(cmp.layer), base = D.layerById('namwon-farmland-2025');
  el.innerHTML = `<div class="mw-band"><b>기준 · ${esc(cmp.baseE.label)}</b><span class="sp"></span><span class="n">${nf.format(base?.count || 0)} ${esc(base?.unit || '')}</span></div>
    <div class="mw-band"><b>비교 대상 · ${esc(cmp.cmpE.label)}</b><span class="sp"></span><span class="n">${L ? nf.format(L.count) + ' ' + L.unit : '결과 없음'}</span></div>`;
}
function renderCompareSide() {
  const el = $('#side'); if (!el) return;
  const L = D.layerById(cmp.layer);
  if (S.mode !== 'overlay' || !L) { if (S.mode !== 'basic') { $('#mw').dataset.side = ''; el.innerHTML = ''; } return; }
  $('#mw').dataset.side = 'info';
  const base = D.layerById('namwon-farmland-2025');
  const rows = [['정사영상', cmp.baseE.label, cmp.cmpE.label], ['GSD', cmp.baseE.gsdCm + ' cm', cmp.cmpE.gsdCm + ' cm'], ['촬영', '드론', '드론'], ['범위', '0.62 km²', '0.62 km²'], ['결과 레이어', `농지 ${nf.format(base.count)}`, `변화 ${nf.format(L.count)}`]];
  const max = Math.max(...Object.values(L.classCounts));
  el.innerHTML = `<div class="mi"><div class="mi-h"><p class="lb">비교 결과</p><button type="button" class="x" id="side-x" aria-label="닫기">${icon('x', 18)}</button></div>
    <h2>${esc(cmp.baseE.label)} → ${esc(cmp.cmpE.label)}</h2>
    <p class="mi-sub">남원 농경지 · ${esc(L.method || '변화 지수(비지도)')} · 학습 모델 탐지 아님</p>
    <div class="dw-big"><span class="k1"><b>${nf.format(L.count)}</b><span class="u">건</span><span class="s">변화 폴리곤</span></span><span><b>${D.ha(L.areaM2).toFixed(1)}</b><span class="u">ha</span><span class="s">변화 면적 합계</span></span></div>
    <div class="tbl-wrap"><table class="tbl tbl--s"><thead><tr><th>항목</th><th>기준</th><th>비교 대상</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${esc(r[1])}</td><td class="num">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
    <section class="mi-sum"><h3>클래스별 · 건</h3>${Object.entries(L.classCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div class="row"><span class="sw${D.isDashCls(c) ? ' sw--dash' : ''}"></span>${esc(D.clsLabel(c))}<span class="m"><i style="width:${(n / max) * 100}%"></i></span><span class="v">${nf.format(n)}</span></div>`).join('')}</section></div>
    <div class="mi-f"><button type="button" class="btn-br" id="go-stats">${icon('grid', 15)} 통계 자세히</button><button type="button" class="btn" id="go-report">보고서 발급</button></div>`;
  $('#side-x').onclick = () => { $('#mw').dataset.side = ''; el.innerHTML = ''; };
  $('#go-stats').onclick = () => { location.href = 'stats-standard.html?result=namwon-farmland-2025'; };
  $('#go-report').onclick = () => { location.href = 'report-standard-issue.html?result=namwon-farmland-2025'; };
}
function onMapClickB(e) {
  if (!B) return;
  const keys = GL.resultKeys(B).flatMap((k) => [k + '-fill', k + '-line', k + '-dash']).filter((l) => B.getLayer(l));
  if (!keys.length) return;
  const f = B.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: keys })[0];
  if (!f) return;
  const c = [e.lngLat.lng, e.lngLat.lat];
  clearAnchors((a) => a.el.classList.contains('mw-call') || a.el.classList.contains('mw-bracket'));
  anchor(B, $('#ov-b'), c, `<h4><span class="k">${esc(D.clsLabel(f.properties.cls))}</span><span class="s">${esc(D.layerById(cmp.layer)?.title || '')}</span></h4>
    <dl><dt>면적</dt><dd>${nf.format(Math.round(f.properties.area_m2 || f.properties.area || 0))} m²</dd><dt>시점</dt><dd>${esc(cmp.baseE.label)} → ${esc(cmp.cmpE.label)}</dd></dl>`, 'mw-call');
  if (S.mode === 'parallel') { anchor(A, $('#ov-a'), c, '', 'mw-bracket mw-bracket--ghost'); anchor(A, $('#ov-a'), c, '같은 자리 · ' + esc(cmp.baseE.label), 'mw-tip mw-tip--ink'); }
}
function bindSwipe() {
  const h = $('#swipe-h'), plates = $('#plates'); if (!h) return;
  const set = (pct) => { cmp.ratio = Math.max(6, Math.min(94, pct)); $('#mw').style.setProperty('--swipe', cmp.ratio + '%'); $('#swipe').style.left = cmp.ratio + '%'; };
  set(cmp.ratio);
  let drag = false;
  h.addEventListener('pointerdown', (e) => { drag = true; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointerup', () => { drag = false; });
  h.addEventListener('pointermove', (e) => { if (!drag) return; const r = plates.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); });
  h.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { set(cmp.ratio - 4); e.preventDefault(); } if (e.key === 'ArrowRight') { set(cmp.ratio + 4); e.preventDefault(); } });
}

/* ══ 12. 내보내기 = 보안 서약서 ═════════════════════════════════════════ */
function doExport() {
  const targets = onIds().map(D.layerById).filter(Boolean);
  openPledge({ targets, onDone: (v) => { say(`다운로드가 시작되었습니다 · ${v.name} · ${v.from}~${v.to} · ${v.purpose}`, 6000); } });
}

/* 키보드 — Esc 로 도구·서브메뉴·검색을 닫는다 */
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || $('.modal')) return;
  if (toolsA?.mode) { toolsA.cancel(); sub = ''; renderPlate(); return; }
  if (sub) { sub = ''; renderPlate(); return; }
  if (S.q !== '') { S.q = ''; commit(); }
});

window.__lxMap = { get A() { return A; }, get B() { return B; }, get state() { return S; }, get geo() { return geo; }, props: P };

/* 모든 선언이 선 뒤에 화면을 세운다(위쪽 const 들의 TDZ 를 피한다). */
if (shell) { document.body.dataset.map = ''; boot(); }
