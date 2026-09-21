/* 프로젝트 · 라벨링 작업공간(별지) — 실지도 위 라벨 편집.
   원판 B7-Project-Labeling-Fix.png(B5-Project-Labeling.png 의 툴바 겹침 · 번호표 잘림을 고친 판)
   툴바 6 + 저장 CTA · `닫기` 는 헤더 우측(§15.7 ⑬ 중복 해소) · 번호표는 도형 왼쪽 위 · `×` 회색.
   도형은 실 결과 GeoJSON(assets/data/geo/results/**)에서 온다 — 손 배치 폴리곤 금지.
   새로 그린 라벨만 사용자가 만든 것이고, 저장은 `시연`이다. */
import { mountShell, openModal, confirmDialog, say, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, fig, st, empty, cta, br, link, miss } from './project-ui.js';
import { mountPlate, loadGeo, near, bboxOf, centroid, frame, hasGL, setHybrid, TEAL } from './publish-map.js';

const q = new URLSearchParams(location.search);
const pid = q.get('pid') || 'pj-greenhouse';
const p = D.detail(pid);
const labs = p ? D.labelingOf(pid) : [];
let cur = labs.find((l) => l.file === q.get('file')) || labs[0] || null;
const back = `ai-project.html?pid=${encodeURIComponent(pid)}&tab=labeling${cur ? `&file=${encodeURIComponent(cur.file)}` : ''}`;

document.body.dataset.lab = '';
mountShell({ active: 'project', asOf: false, fit: true, rail: true, keepDocTitle: true,
  mastHtml: `<span class="pj-mast"><a class="link link--ink" href="${esc(back)}">‹ ${esc(p ? p.name : '프로젝트')}</a>
    <b class="pj-mast-t">라벨링</b>
    <span class="mic">${esc(cur ? `${cur.img.name} · 도엽 ${labs.indexOf(cur) + 1} · ${(cur.img.gsd || 0).toFixed(3)} m/px` : '영상 없음')}</span>
    <span class="sp" style="flex:1"></span>
    <button type="button" class="btn btn--s" data-act="save" style="height:32px">저장</button>
    <a class="link link--ink" href="${esc(back)}">닫기</a></span>` });
document.title = `라벨링 · ${p ? p.name : ''} — Land-XI`;

/* ── 라벨 상태(이 화면 안) ─────────────────────────────────────────────────
   시드 = 실 결과 도형 15개(첫 화면 목록 행 수와 같다) + 사용자가 새로 그린 것. */
const TOOLS = [['rect', '사각형', '사각형'], ['circle', '원형', '사각형'], ['poly', '폴리곤', '폴리곤']];
let tool = 'rect', clsIx = 0, rows = [], geoFeat = [], map = null, tags = [], picked = new Set(), selRow = null;

const main = $('#main');
/* 라벨 목록 쪽 넘김 상태 — build() 가 이 파일 맨 위에서 도므로 **선언이 그보다 앞서야** 한다.
   아래에 두었다가 `Cannot access 'PG_H' before initialization` 으로 화면이 통째로 죽었다(2026-09-22). */
let rowPage = 1;
const ROW_H = 33, PG_H = 38;

main.innerHTML = p && cur ? shell() : `<div class="pj-body" style="padding:56px">${empty('라벨링할 데이터가 없습니다', '데이터 탭에서 파일을 고르고 라벨링을 시작하세요', 'edit')}</div>`;
if (p && cur) { build(); wire(); }

function shell() {
  return `<div class="pj-lab">
    <section class="pj-lab-l" aria-label="영상 목록">
      <p class="pj-lab-h">영상 <span class="n">${labs.length}</span><span class="sp" style="flex:1"></span><span class="mic" aria-hidden="true">‹</span></p>
      ${labs.map((l) => `<button type="button" class="pj-shot" data-file="${esc(l.file)}" aria-selected="${l.file === cur.file}">
        ${fig(l.img.thumb, l.img.name, '', { style: '--ar:256/122' })}
        <b>${esc(l.img.name)}</b>
        <span><span class="n">${(l.img.gsd || 0).toFixed(3)} m/px</span> · 라벨 <span class="n">${n(l.labels)}</span>${l.last !== '-' ? ` · <span class="n">${esc(l.last)}</span>` : ''}</span>
        <span>${st(l.state)}${l.demo ? demo() : ''}<span class="r"><span class="link">복제 ›</span></span></span></button>`).join('')}
    </section>
    <section aria-label="라벨 편집 지도"><div class="pj-plate" id="lab-map">
      <div class="pj-tools">
        ${TOOLS.map(([k, label]) => `<button type="button" class="pj-tb" data-tool="${k}" aria-pressed="${k === tool}">${icon(k === 'poly' ? 'layers' : 'grid', 14)}${esc(label)}</button>`).join('')}
        <button type="button" class="pj-tb" data-act="dup">${icon('clip', 14)}도형 복사</button>
        <button type="button" class="pj-tb" data-act="import">${icon('down', 14)}공간 정보 불러오기</button>
        <button type="button" class="pj-tb" data-act="undo">${icon('reset', 14)}실행 취소</button></div>
      <div class="pj-zoom"><button type="button" data-act="search" aria-label="검색">${icon('search', 14)}</button>
        <button type="button" data-act="hyb" aria-label="지명" aria-pressed="false">${icon('layers', 14)}</button>
        <button type="button" data-act="zin" aria-label="확대">＋</button><button type="button" data-act="zout" aria-label="축소">－</button></div>
      <div id="lab-tags" aria-hidden="true"></div></div></section>
    <aside class="pj-lab-r" aria-label="클래스 · 라벨">
      <p class="pj-lab-h">클래스 <span class="n">${p.classes.length}</span></p>
      <div id="lab-cls"></div>
      <button type="button" class="pj-invite" data-act="cls-add" style="margin:8px 14px">${icon('plus', 14)}클래스 추가</button>
      <p class="pj-lab-h" style="padding-top:16px">라벨 <span class="n">${n(cur.labels)}</span></p>
      <p style="padding:0 14px 8px"><label class="inp-ic" style="width:100%">${icon('search', 14)}<input class="inp inp--s" id="lab-q" placeholder="라벨 검색" aria-label="라벨 검색"></label></p>
      <div id="lab-rows" style="flex:1;min-height:0;overflow:hidden"></div>
      <div class="pj-lab-f"><label class="ck"><input type="checkbox" id="lab-all">전체 선택</label>
        <span class="n" id="lab-nsel" style="color:var(--accent)">선택 0</span><span class="sp" style="flex:1"></span>
        ${link('클래스 일괄 변경 ›', 'bulk')}</div></aside></div>`;
}

/* 라벨 목록 = 실 결과 도형에서 만든다(클래스는 도형의 cls 속성 그대로). */
function build() {
  const base = D.labelRows(pid, cur.file);
  rows = base.rows.map((r) => ({ ...r, id: `s${r.i}`, seeded: true }));
  drawCls(); drawRows();
}
function drawCls() {
  $('#lab-cls').innerHTML = p.classes.map((c, i) => `<div class="pj-cls" role="button" tabindex="0" data-cls="${i}" aria-selected="${i === clsIx}">
    <span class="pj-sw${i ? ' pj-sw--o' : ''}"></span><span>${esc(c.name)}</span><span class="sp"></span>
    <span class="pj-chip n">${i + 1}</span><span class="n" style="color:var(--accent)">${n(countCls(c.name) || c.n)}</span>
    <span class="mic" aria-hidden="true">↑↓</span><button type="button" class="x" data-act="cls-x" data-i="${i}" aria-label="${esc(c.name)} 클래스 삭제">×</button></div>`).join('');
  $$('#lab-cls [data-cls]').forEach((el) => {
    const pick = () => { clsIx = +el.dataset.cls; drawCls(); };
    el.addEventListener('click', (e) => { if (!e.target.closest('[data-act]')) pick(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}
function countCls(name) { return rows.filter((r) => r.cls === name).length; }
/* 라벨 목록은 **잰 높이만큼만** 세우고 나머지는 쪽으로 넘긴다 (2026-09-21).
   전에는 판(252px) 안에 열다섯 줄을 다 넣고 스크롤시켰다 — 366px 가 숨어 있었다.
   발주자는 판 안쪽 스크롤도 화면이 안 끝난 것으로 본다. 지우지 않는다: 큰 모니터에서는
   더 많은 줄이, 낮은 화면에서는 더 적은 줄이 서고, 못 선 줄은 ‹ › 로 넘겨 본다. */
function drawRows() {
  const f = ($('#lab-q') || {}).value ? $('#lab-q').value.trim().toLowerCase() : '';
  const all = rows.filter((r) => !f || `${r.cls} #${r.i}`.toLowerCase().includes(f));
  const per = Math.max(3, Math.floor((($('#lab-rows').clientHeight || 252) - PG_H) / ROW_H));
  const pages = Math.max(1, Math.ceil(all.length / per));
  if (rowPage > pages) rowPage = pages;
  const list = all.slice((rowPage - 1) * per, rowPage * per);
  $('#lab-rows').innerHTML = list.map((r) => `<div class="pj-lrow" data-row="${esc(r.id)}" aria-selected="${selRow === r.id}">
    <input type="checkbox" data-ck="${esc(r.id)}"${picked.has(r.id) ? ' checked' : ''} aria-label="${esc(r.cls)} #${r.i} 선택">
    <span class="pj-sw${p.classes.findIndex((c) => c.name === r.cls) ? ' pj-sw--o' : ''}"></span>
    <span>${esc(r.cls)} #${r.i}${r.seeded ? '' : ' <em class="tag">새 라벨</em>'}</span>
    <span class="mic">${esc(r.shape)}</span>
    <button type="button" class="x" data-act="row-x" data-id="${esc(r.id)}" aria-label="${esc(r.cls)} #${r.i} 삭제">×</button></div>`).join('')
    + `<p class="mic pj-lpg"><button type="button" data-pg="-1" aria-label="앞 쪽"${rowPage <= 1 ? ' disabled' : ''}>‹</button>
      <span class="n">${rowPage} / ${pages}</span>
      <button type="button" data-pg="1" aria-label="다음 쪽"${rowPage >= pages ? ' disabled' : ''}>›</button>
      <span class="sp" style="flex:1"></span><span class="n">${all.length} / ${n(cur.labels)}</span> 행</p>`;
  $$('#lab-rows [data-pg]').forEach((b) => b.addEventListener('click', () => { rowPage += +b.dataset.pg; drawRows(); }));
  $$('#lab-rows [data-row]').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]') || e.target.matches('input')) return;
    selRow = el.dataset.row; drawRows(); paintTags();
  }));
  $$('#lab-rows [data-ck]').forEach((c) => c.addEventListener('change', () => {
    if (c.checked) picked.add(c.dataset.ck); else picked.delete(c.dataset.ck); nsel();
  }));
  nsel();
}
function nsel() { const el = $('#lab-nsel'); if (el) el.textContent = `선택 ${picked.size}`; }

/* ── 동작 ── */
function wire() {
  $$('#main .pj-shot[data-file]').forEach((b) => b.addEventListener('click', () => {
    location.href = `ai-project-label.html?pid=${encodeURIComponent(pid)}&file=${encodeURIComponent(b.dataset.file)}`;
  }));
  $('#lab-q').addEventListener('input', () => { rowPage = 1; drawRows(); });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawRows, 160); });
  $('#lab-all').addEventListener('change', (e) => { if (e.target.checked) rows.forEach((r) => picked.add(r.id)); else picked.clear(); drawRows(); });
  $$('#main [data-tool]').forEach((b) => b.addEventListener('click', () => {
    tool = b.dataset.tool; $$('#main [data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    say(`${TOOLS.find(([k]) => k === tool)[1]} 도구 — 지도를 눌러 라벨을 추가합니다`);
  }));
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'save': say(`라벨 ${n(rows.length)}건을 저장했습니다 · 시연`); return;
      case 'undo': { const i = rows.findIndex((r) => !r.seeded); const last = [...rows].reverse().find((r) => !r.seeded);
        if (!last) { say('되돌릴 작업이 없습니다.'); return; } rows = rows.filter((r) => r !== last); drawRows(); drawCls(); paintTags(); say('실행을 취소했습니다'); return; }
      case 'dup': { const src = rows.find((r) => r.id === selRow) || rows[0]; if (!src) return;
        rows = [...rows, { ...src, id: `u${Date.now()}`, i: rows.length + 1, seeded: false }]; drawRows(); drawCls(); paintTags(); say('도형을 복사했습니다 · 시연'); return; }
      case 'import': say('공간 정보(shp)를 불러옵니다 — 데이터 관리 아카이브 · 시연'); return;
      case 'cls-add': return addClass();
      case 'cls-x': return say('클래스에 달린 라벨이 있어 삭제할 수 없습니다 · 시연');
      case 'row-x': { rows = rows.filter((r) => r.id !== a.dataset.id); picked.delete(a.dataset.id); drawRows(); drawCls(); paintTags(); return; }
      case 'bulk': return bulk();
      case 'search': say('지도 검색 — 지명·좌표로 이동 · 시연'); return;
      case 'hyb': { const on = a.getAttribute('aria-pressed') !== 'true'; a.setAttribute('aria-pressed', String(on)); if (map) setHybrid(map, on); return; }
      case 'zin': return map && map.zoomIn();
      case 'zout': return map && map.zoomOut();
      default: return undefined;
    }
  });
  mount();
}
function addClass() {
  const m = openModal({ title: '클래스 추가', width: 440,
    content: `<div class="form" style="display:block"><div class="field"><label class="field-l" for="cl-n">클래스명<em class="req">*</em></label><input id="cl-n" class="inp" maxlength="40"></div></div>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '추가', kind: 'primary', onClick: () => {
      const v = $('#cl-n', m.el).value.trim(); if (!v) return false;
      p.classes = [...p.classes, { name: v, n: 0 }]; drawCls(); say(`클래스 “${v}”를 추가했습니다 · 시연`); return true;
    } }] });
}
function bulk() {
  if (!picked.size) { say('변경할 라벨을 먼저 고르세요.'); return; }
  const m = openModal({ title: '클래스 일괄 변경', width: 420, content: `
    <p class="mic" style="margin:0 0 8px">선택 <b class="n">${picked.size}</b>건 → 클래스</p>
    <span class="sel" style="width:100%"><select id="bk-c" aria-label="바꿀 클래스">${p.classes.map((c, i) => `<option value="${i}"${i === (clsIx + 1) % p.classes.length ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></span>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '변경', kind: 'primary', onClick: () => {
      const name = p.classes[+$('#bk-c', m.el).value].name;
      rows = rows.map((r) => (picked.has(r.id) ? { ...r, cls: name } : r));
      const k = picked.size; picked.clear(); drawRows(); drawCls(); paintTags();
      say(`${k}건의 클래스를 “${name}”로 변경했습니다 · 시연`); return true;
    } }] });
}

/* ── 지도 ── */
async function mount() {
  const el = $('#lab-map'); if (!el || !hasGL()) return;
  const rid = p.resultId;
  if (!rid) { el.classList.add('pj-plate--none'); el.innerHTML = '<span>이 과제에는 실 결과 도형이 없습니다<br><span class="mic">도구로 직접 라벨을 그립니다 · 배경은 V-World 위성</span></span>'; return; }
  const v = D.VIEW[rid];
  try {
    map = await mountPlate(el, { center: v.center, zoom: 16 });
    const geo = await loadGeo(D.geoUrl(rid));
    geoFeat = near(geo, v.center, v.km).slice(0, rows.length);
    const fc = () => ({ type: 'FeatureCollection', features: geoFeat.map((f, i) => ({ ...f, properties: { ...f.properties, _id: rows[i] ? rows[i].id : `g${i}` } })) });
    map.addSource('lb', { type: 'geojson', data: fc() });
    map.addLayer({ id: 'lb-f', type: 'fill', source: 'lb', paint: { 'fill-color': TEAL, 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'lb-l', type: 'line', source: 'lb', paint: { 'line-color': TEAL, 'line-width': 1.6 } });
    map.addSource('lb-sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'lb-sel-f', type: 'fill', source: 'lb-sel', paint: { 'fill-color': '#4FA3FF', 'fill-opacity': 0.42 } });
    map.addLayer({ id: 'lb-sel-l', type: 'line', source: 'lb-sel', paint: { 'line-color': TEAL, 'line-width': 2 } });
    frame(map, bboxOf(geoFeat), { pad: 46, instant: true });
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['lb-f', 'lb-l'] })[0];
      if (hit) { selRow = hit.properties._id; drawRows(); paintTags(); return; }
      addAt(e.lngLat);
    });
    map.on('move', placeTags);
    map.getCanvas().style.cursor = 'crosshair';
    paintTags();
  } catch { el.classList.add('pj-plate--none'); el.innerHTML = '<span>지도를 불러오지 못했습니다<br><span class="mic">네트워크 연결을 확인해 주세요</span></span>'; }
}
function addAt(lngLat) {
  const c = p.classes[clsIx], d = 0.00022;
  const box = [[lngLat.lng - d, lngLat.lat - d], [lngLat.lng + d, lngLat.lat - d], [lngLat.lng + d, lngLat.lat + d], [lngLat.lng - d, lngLat.lat + d], [lngLat.lng - d, lngLat.lat - d]];
  const id = `u${Date.now()}`;
  geoFeat = [...geoFeat, { type: 'Feature', properties: { cls: c.name, _id: id }, geometry: { type: 'Polygon', coordinates: [box] } }];
  rows = [...rows, { id, i: rows.length + 1, cls: c.name, shape: TOOLS.find(([k]) => k === tool)[2], seeded: false }];
  map.getSource('lb').setData({ type: 'FeatureCollection', features: geoFeat });
  selRow = id; drawRows(); drawCls(); paintTags();
  say(`${c.name} 라벨을 추가했습니다 · 저장 전`);
}
function paintTags() {
  if (!map) return;
  const sel = geoFeat.find((f) => f.properties._id === selRow) || null;
  map.getSource('lb-sel')?.setData({ type: 'FeatureCollection', features: sel ? [sel] : [] });
  const box = $('#lab-tags'); if (!box) return;
  tags = geoFeat.slice(0, 6).map((f, i) => {
    const r = rows.find((x) => x.id === f.properties._id) || rows[i] || { i: i + 1, cls: f.properties.cls || '' };
    return { c: centroid(f), label: `#${r.i} ${String(r.cls).replace(/^.*_/, '')}` };
  });
  box.innerHTML = tags.map((t, i) => `<span class="pj-tag" data-tag="${i}" style="background:${TEAL};border-color:${TEAL};color:#fff">${esc(t.label)}</span>`).join('');
  placeTags();
}
function placeTags() {
  if (!map) return;
  $$('#lab-tags .pj-tag').forEach((el, i) => {
    const t = tags[i]; if (!t) return;
    const pt = map.project(t.c);
    el.style.left = `${Math.round(pt.x) - 6}px`;
    el.style.top = `${Math.round(pt.y) - 26}px`;
  });
}
