/* 프로젝트 · 분석 탭 — 실행 · 실행중 · 완료 + 결과 오버레이 + **결과 수정 · 삭제**(LX 권한).
   역할 정의의 핵심: "AI 분석 모델 개발 / 분석 결과 수정·삭제 등 이 기능들이 LX의 역할"
   원판 B5-Project-Analysis.png · B7-Analysis-{Progress-Overlay,Result-Edit}.png
   지도는 MapLibre + V-World + 실 GeoJSON(assets/data/geo/results/**) — 손 배치 폴리곤 금지. */
import { say, confirmDialog, openModal, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, fig, kv, st, empty, cta, br, link, bars, meter, steps, miss } from './project-ui.js';
import { mountPlate, setResult, clearResult, loadGeo, near, bboxOf, centroid, frame, hasGL, setHybrid, TEAL } from './publish-map.js';

const ACCENT = '#006DF7';
let map = null, base = null, sel = null, ed = null, cur = null;

export function analysisTab(p, S) {
  const runs = D.runsOf(p.id);
  const run = runs.find((r) => r.id === S.an) || runs.find((r) => r.state === '완료') || runs[0] || null;
  const edit = S.mode === 'edit' && run && run.state === '완료';
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
  <section class="split-l"><div class="pj-work" style="--wl:${edit ? '0px' : '248px'}">
    ${edit ? '<div hidden></div>' : `<div>${runForm(p, runs)}</div>`}
    <div>${plate(p, run, edit, S)}${edit ? parcelTable(p, run) : ''}</div></div></section>
  <aside class="split-r panel" aria-label="${edit ? '결과 편집' : '실행 목록'}">${edit ? editPanel(p, run) : listPanel(p, runs, run, S)}</aside></div>`;
}

/* ── 분석 실행 폼(좌) ── */
function runForm(p, runs) {
  const models = D.trainsOf(p.id).filter((t) => t.state === '완료');
  const files = p.files.slice(0, 6);
  return `<div class="pj-seg" style="margin-bottom:12px"><button type="button" role="tab" aria-selected="true">분석 실행</button>
    <span class="mic" style="margin-left:14px">실행중 <span class="n">${runs.filter((r) => r.state !== '완료').length}</span> · 완료 <span class="n">${runs.filter((r) => r.state === '완료').length}</span></span></div>
  <div class="panel-b" style="padding-top:0">
    <p class="lb" style="margin:0 0 6px"><span class="n">1</span> · 분석 과제</p>
    <p style="background:var(--t1);padding:8px 10px;margin:0 0 14px;font-size:15px">${icon('lock', 14)} ${esc(p.name)}</p>
    <p class="lb" style="margin:0 0 6px"><span class="n">2</span> · 모델</p>
    <span class="sel" style="width:100%"><select id="an-model" aria-label="모델">${models.length ? models.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}${t.f1 != null ? ` · F1 ${t.f1.toFixed(2)}` : ''}</option>`).join('') : '<option value="">학습된 모델 없음</option>'}</select></span>
    <p class="lb" style="margin:14px 0 6px"><span class="n">3</span> · 영상 · 아카이브</p>
    <div class="pj-tiles" style="grid-template-columns:1fr 1fr;gap:10px">${files.map((f, i) => `<button type="button" class="pj-tile" data-anfile="${esc(f.id)}" aria-selected="${i === 0}">
      ${fig(f.thumb, f.name, '', { style: '--ar:112/70' })}<span class="pj-tile-c"><span>${esc(f.name)}</span></span></button>`).join('')}</div>
    <hr class="hr" style="margin:14px 0 10px">
    <p class="mic" id="an-pick" style="color:var(--accent);margin:0 0 10px">선택 1 · ${esc(files[0] ? files[0].name : '영상 없음')}</p>
    <button type="button" class="btn btn--block" data-act="an-run"${models.length && files.length ? '' : ' disabled'}>분석 실행</button>
    ${models.length ? '' : `<p class="mic" style="margin-top:8px">학습을 마친 모델이 있어야 분석을 실행할 수 있습니다</p>`}</div>`;
}

/* ── 지도 판 ── */
function plate(p, run, edit, S) {
  if (!run) return `<div class="pj-plate pj-plate--none"><span>분석 실행이 없습니다<br><span class="mic">모델과 영상을 고르고 분석 실행을 누르세요</span></span></div>`;
  if (!run.result) {
    const pct = Math.round((run.step / run.of) * 100);
    return `<div class="pj-plate pj-plate--none" style="flex-direction:column;gap:14px">
      ${fig(D.archiveById(run.file) ? D.archiveById(run.file).thumb : p.thumb, run.name, '', { style: '--ar:16/9;width:70%' })}
      <span style="width:70%"><b style="display:block;font-family:var(--disp);font-size:20px;margin-bottom:6px">${esc(run.name)}</b>
        <span class="mic" style="display:block;margin-bottom:8px">${st(run.state)} · <span class="n">${run.step} / ${run.of}</span> · 시작 <span class="n">${esc(run.at)}</span>${demo()}</span>
        ${meter(pct)}<span class="mic" style="display:block;margin-top:8px">${steps(D.RUN_STEPS, run.step - 1)}</span></span></div>`;
  }
  const changed = edit ? D.editsOf(p.id, run.result) : null;
  const nch = changed ? changed.moved.length + changed.dropped.length + Object.keys(changed.area).length : 0;
  return `<div class="pj-plate" id="an-plate" aria-label="${esc(run.name)} 결과 지도">
    <div class="pj-tools">${edit ? `
      <button type="button" class="pj-tb" data-act="tool" data-tool="move" aria-pressed="true">${icon('grid', 14)}이동</button>
      <button type="button" class="pj-tb" data-act="tool" data-tool="drop" aria-pressed="false">${icon('x', 14)}삭제</button>
      <span class="mic" style="color:var(--accent);padding:0 4px">변경 <b class="n" id="an-nch">${nch}</b></span>
      <span class="sp"></span><button type="button" class="pj-tb" data-act="ed-cancel">취소</button>
      <button type="button" class="pj-tb pj-tb--cta" data-act="ed-save">저장</button>`
      : `<span class="pj-tb" aria-hidden="true">${esc(run.name)}</span><span class="sp"></span>
      <button type="button" class="pj-tb" data-act="hyb" aria-pressed="false">지명</button>
      <button type="button" class="pj-tb pj-tb--cta" data-act="ed-open">결과 수정 ›</button>`}</div>
    <div class="pj-zoom"><button type="button" data-act="zin" aria-label="확대">＋</button><button type="button" data-act="zout" aria-label="축소">－</button></div>
  </div>`;
}

/* ── 필지 행정정보 표(편집 모드에서 펼침) ── */
function parcelTable(p, run) {
  const e = D.editsOf(p.id, run.result);
  return `<div class="pj-tblwrap"><div class="pj-tbl-h">필지 행정정보 <span class="mic">총 <span class="n">${D.PARCELS.length}</span>건 중 <span class="n">1~${D.PARCELS.length}</span>행</span><em class="tag">시연</em><span class="sp" style="flex:1"></span><span class="mic">면적(m²) 셀만 수정</span></div>
  <table class="tbl tbl--s"><colgroup><col style="width:48px"><col style="width:56px"><col style="width:72px"><col style="width:76px"><col style="width:56px"><col style="width:52px"><col><col style="width:96px"></colgroup>
    <thead><tr><th>연번</th><th>시도</th><th>시군구</th><th>읍면동</th><th class="r">본번</th><th class="r">부번</th><th>탐지 클래스</th><th class="r">면적(m²)</th></tr></thead>
    <tbody>${D.PARCELS.map((r) => { const gone = e.dropped.includes(String(r.i));
      return `<tr${gone ? ' class="pj-gone"' : ''} data-parcel="${r.i}"><td class="num">${r.i}</td><td>${esc(r.sido)}</td><td>${esc(r.sgg)}</td><td>${esc(r.emd)}</td>
      <td class="num r">${r.bon}</td><td class="num r">${r.bu ?? '—'}</td><td>${esc(r.cls)}</td>
      <td class="r">${gone ? `<span class="num">${n(r.area)}</span>` : `<input class="inp inp--s inp--num" data-area="${r.i}" value="${e.area[r.i] ?? r.area}" aria-label="${r.i}번 면적(m²)">`}</td></tr>`; }).join('')}</tbody></table></div>`;
}

/* ── 우측 판 ── */
function listPanel(p, runs, run, S) {
  if (!runs.length) return `<header class="panel-h"><h2>실행 목록</h2></header><div class="panel-b">${empty('분석 실행이 없습니다', '학습을 마친 모델로 분석을 실행하면 여기에 쌓입니다', 'list')}</div>`;
  return `<header class="panel-h"><h2>실행 목록</h2><span class="sp"></span><span class="mic n" style="color:var(--accent)">${runs.length}</span></header>
  <div class="panel-b"><div class="pj-runs">${runs.map((r) => { const f = D.archiveById(r.file), pct = Math.round((r.step / r.of) * 100);
    return `<button type="button" class="pj-run" data-an="${esc(r.id)}" aria-selected="${run && r.id === run.id}">
      ${fig(f ? f.thumb : p.thumb, '', '', { style: '--ar:96/58' })}
      <span><b>${esc(r.name)}</b><span>${esc(f ? f.name : '—')}${r.took ? ` · ${esc(r.took)}` : ''}${demo()}</span>
        <span>${st(r.state)} · <span class="n">${r.step}/${r.of}</span></span>${meter(pct)}</span></button>`; }).join('')}</div>
    ${run && run.result ? resultSummary(p, run) : ''}</div>
  ${run ? `<footer class="panel-f"><span class="mic">${esc(D.RUN_STEPS.join(' · '))}</span>${link('결과 다운로드 ›', 'dl')}${link('공유 설정 ›', 'share')}${run.state === '완료' ? cta('결과 수정 ›', 'ed-open') : ''}</footer>` : ''}`;
}
function resultSummary(p, run) {
  const r = D.resultOf(run.result), s = r.stats;
  return `<hr class="hr hr--ink" style="margin:16px 0 12px">
  <p class="lb" style="margin:0 0 8px">${esc(r.title)}</p>
  <div class="pj-kpi" style="grid-template-columns:1fr 1fr"><div><b class="n">${n(s.count)}</b><span>${esc(r.unit)}</span></div>
    <div><b class="n" style="color:var(--ink)">${(s.areaHa || 0).toFixed(1)}</b><span>ha · 면적 합계</span></div></div>
  <p class="lb" style="margin:16px 0 8px">클래스</p>
  <div class="pj-bars">${Object.entries(s.classes).map(([k, v], i) => `<span>${esc(k)}</span><span><i style="width:${Math.round((v / s.count) * 100)}%;background:${i ? 'var(--ink)' : 'var(--teal)'}"></i></span><span class="n">${n(v)}</span>`).join('')}</div>
  <p class="mic" style="margin-top:12px">신뢰도 평균 <span class="n">${s.confMean != null ? s.confMean.toFixed(2) : '—'}</span> · 중앙값 <span class="n">${s.confMedian != null ? s.confMedian.toFixed(2) : '—'}</span></p>`;
}
function editPanel(p, run) {
  const e = D.editsOf(p.id, run.result), r = D.resultOf(run.result), s = r.stats;
  const nch = e.moved.length + e.dropped.length + Object.keys(e.area).length;
  const delta = -e.dropped.length;
  return `<header class="panel-h"><h2>${esc(run.name)}</h2><span class="sp"></span><span style="color:var(--accent)">결과 편집 중</span></header>
  <div class="panel-b">
    <div class="pj-diff" id="an-diff">${diffHtml(e)}</div>
    <div class="pj-kpi" style="grid-template-columns:1fr 1fr;margin-top:16px">
      <div><b class="n">${n(s.count + delta)}</b><span>탐지 ${esc(r.unit)} · 저장 시 <span class="n">${delta >= 0 ? '+' : ''}${delta}</span></span></div>
      <div><b class="n" style="color:var(--ink)">${((s.areaHa || 0) + delta * 0.2).toFixed(1)}</b><span>면적 합계 · <span class="n">${(delta * 0.2).toFixed(1)}</span> ha</span></div></div>
    <p class="lb" style="margin:16px 0 8px">클래스</p>
    <div class="pj-bars">${Object.entries(s.classes).map(([k, v], i) => `<span>${esc(k)}</span><span><i style="width:${Math.round((v / s.count) * 100)}%;background:${i ? 'var(--ink)' : 'var(--teal)'}"></i></span><span class="n">${n(v)}</span>`).join('')}</div>
    <hr class="hr" style="margin:16px 0 12px">
    <p class="lb" style="margin:0 0 8px">편집 도구 — LX 권한</p>
    ${kv([['이동', '도형을 골라 지도를 눌러 옮김 · 꼭짓점 이동'], ['삭제', '도형을 눌러 삭제 · 표의 면적(m²)만 직접 수정']], 'kv--l')}
    <p class="mic" style="margin-top:10px">편집을 저장하거나 취소하면 다시 활성</p></div>
  <footer class="panel-f"><span class="mic">LX = 분석 결과 수정·삭제 권한</span>${br('취소', 'ed-cancel')}${cta('저장', 'ed-save')}</footer>`;
}
/* 저장 전 변경 목록 — 편집할 때마다 다시 그린다(화면이 실제로 바뀐다). */
function diffHtml(e) {
  const nch = e.moved.length + e.dropped.length + Object.keys(e.area).length;
  return `<b>저장 전 변경 <span class="n" id="an-nch2">${nch}</span></b>
    <dl>${e.moved.map((i) => `<dt>이동</dt><dd>#${esc(i)} · ${esc(rowLabel(i))}</dd><dd class="r">면적 ${n(e.area[i] ?? areaOf(i))} m²</dd>`).join('')}
      ${e.dropped.map((i) => `<dt class="rm">삭제</dt><dd>#${esc(i)} · ${esc(rowLabel(i))}</dd><dd class="r">${n(areaOf(i))} m²</dd>`).join('')}
      ${Object.keys(e.area).filter((k) => !e.moved.includes(k)).map((i) => `<dt>면적</dt><dd>#${esc(i)} · ${esc(rowLabel(i))}</dd><dd class="r">${n(e.area[i])} m²</dd>`).join('')}</dl>
    ${nch ? '' : '<p class="mic" style="margin:6px 0 0">지도에서 도형을 고르면 변경이 여기에 쌓입니다</p>'}`;
}
const rowLabel = (i) => { const r = D.PARCELS.find((x) => String(x.i) === String(i)); return r ? `${r.emd} ${r.bon}${r.bu ? '-' + r.bu : ''} · ${r.cls}` : `필지 ${i}`; };
const areaOf = (i) => { const r = D.PARCELS.find((x) => String(x.i) === String(i)); return r ? r.area : 0; };

/* ── 동작 ─────────────────────────────────────────────────────────────────── */
export function bindAnalysis(p, S, go) {
  const runs = D.runsOf(p.id);
  const run = runs.find((r) => r.id === S.an) || runs.find((r) => r.state === '완료') || runs[0] || null;
  const edit = S.mode === 'edit' && run && run.state === '완료';
  cur = run; ed = edit ? { ...D.editsOf(p.id, run.result), tool: 'move' } : null; sel = null;

  $$('#main .pj-run[data-an]').forEach((b) => b.addEventListener('click', () => go({ an: b.dataset.an, mode: '' }, { replace: true })));
  $$('#main [data-anfile]').forEach((b) => b.addEventListener('click', () => {
    $$('#main [data-anfile]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    const f = D.archiveById(b.dataset.anfile); $('#an-pick').textContent = `선택 1 · ${f ? f.name : ''}`;
  }));
  $$('#main [data-area]').forEach((i) => i.addEventListener('change', () => {
    if (!ed) return; const k = i.dataset.area, v = +i.value;
    if (v === areaOf(k)) delete ed.area[k]; else ed.area[k] = v;
    D.setEdits(p.id, run.result, strip(ed)); bump();
  }));

  $('#pj-root').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'an-run': return startRun(p, go);
      case 'ed-open': return go({ an: run.id, mode: 'edit' });
      case 'ed-cancel': D.clearEdits(p.id, run.result); go({ mode: '' }); return say('편집을 취소했습니다 · 시연');
      case 'ed-save': return saveEdits(p, run, go);
      case 'share': return openShare(p, run);
      case 'dl': return say('결과를 내려받습니다 · 시연');
      case 'tool': ed.tool = a.dataset.tool; $$('#main [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b === a))); return;
      case 'hyb': { const on = a.getAttribute('aria-pressed') !== 'true'; a.setAttribute('aria-pressed', String(on)); if (map) setHybrid(map, on); return; }
      case 'zin': return map && map.zoomIn();
      case 'zout': return map && map.zoomOut();
      default: return undefined;
    }
  });

  const el = $('#an-plate');
  map = null;
  if (!el || !hasGL() || !run || !run.result) return;
  const v = D.VIEW[run.result];
  mountPlate(el, { center: v.center, zoom: 15.6 }).then(async (mp) => {
    map = mp;
    const geo = await loadGeo(D.geoUrl(run.result));
    base = { type: 'FeatureCollection', features: near(geo, v.center, v.km).map((f, i) => ({ ...f, id: i + 1, properties: { ...f.properties, _i: String(i + 1) } })) };
    setResult(map, base, v.classes);
    frame(map, bboxOf(base.features), { pad: 34, instant: true });
    if (edit) wireEdit(p, run, v);
  }).catch(() => { el.classList.add('pj-plate--none'); el.innerHTML = '<span>지도를 불러오지 못했습니다<br><span class="mic">네트워크 연결을 확인해 주세요</span></span>'; });
}
const strip = (e) => ({ moved: e.moved, dropped: e.dropped, area: e.area });

/* 편집 레이어 — 선택(파랑 + 꼭짓점) · 삭제(흰 점선) · 원위치(점선 고스트) */
function wireEdit(p, run, v) {
  const empty = { type: 'FeatureCollection', features: [] };
  for (const [id, type, paint] of [
    ['ed-ghost', 'line', { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.9 }],
    ['ed-drop', 'line', { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.95 }],
    ['ed-fill', 'fill', { 'fill-color': ACCENT, 'fill-opacity': 0.3 }],
    ['ed-line', 'line', { 'line-color': ACCENT, 'line-width': 2 }],
  ]) { map.addSource(id, { type: 'geojson', data: empty }); map.addLayer({ id, type, source: id, paint }); }
  map.addSource('ed-pt', { type: 'geojson', data: empty });
  map.addLayer({ id: 'ed-pt', type: 'circle', source: 'ed-pt', paint: { 'circle-color': ACCENT, 'circle-radius': 3.6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4 } });

  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['res-fill', 'res-line', 'ed-fill'] })[0];
    if (!hit) { if (sel && ed.tool === 'move') moveTo(p, run, e.lngLat); return; }
    const i = hit.properties._i;
    if (ed.tool === 'drop') { toggleDrop(p, run, i); return; }
    sel = i; paint(); bump();
  });
  map.getCanvas().style.cursor = 'crosshair';
  paint();
}
function feat(i) { return base.features.find((f) => f.properties._i === String(i)) || null; }
function shift(f, d) {
  const move = (c) => (typeof c[0] === 'number' ? [c[0] + d[0], c[1] + d[1]] : c.map(move));
  return { ...f, geometry: { ...f.geometry, coordinates: move(f.geometry.coordinates) } };
}
function paint() {
  if (!map || !ed) return;
  const fc = (fs) => ({ type: 'FeatureCollection', features: fs });
  const dropped = ed.dropped.map(feat).filter(Boolean);
  const selF = sel ? feat(sel) : null;
  const moved = selF && ed.moveDelta && ed.moveDelta[sel] ? shift(selF, ed.moveDelta[sel]) : selF;
  map.getSource('ed-drop').setData(fc(dropped));
  map.getSource('ed-ghost').setData(fc(selF && moved !== selF ? [selF] : []));
  map.getSource('ed-fill').setData(fc(moved && !ed.dropped.includes(sel) ? [moved] : []));
  map.getSource('ed-line').setData(fc(moved && !ed.dropped.includes(sel) ? [moved] : []));
  const ring = moved ? (moved.geometry.type === 'Polygon' ? moved.geometry.coordinates[0] : moved.geometry.coordinates[0][0]) : [];
  map.getSource('ed-pt').setData(fc(ring.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }))));
}
function moveTo(p, run, lngLat) {
  const f = feat(sel); if (!f) return;
  const c = centroid(f);
  ed.moveDelta ||= {};
  ed.moveDelta[sel] = [lngLat.lng - c[0], lngLat.lat - c[1]];
  if (!ed.moved.includes(sel)) ed.moved.push(sel);
  D.setEdits(p.id, run.result, strip(ed)); paint(); bump();
  say(`#${sel} 도형을 옮겼습니다 · 저장 전`);
}
function toggleDrop(p, run, i) {
  const k = String(i);
  ed.dropped = ed.dropped.includes(k) ? ed.dropped.filter((x) => x !== k) : [...ed.dropped, k];
  D.setEdits(p.id, run.result, strip(ed)); paint(); bump();
  const row = $(`#main tr[data-parcel="${k}"]`); if (row) row.classList.toggle('pj-gone', ed.dropped.includes(k));
}
function bump() {
  if (!ed) return;
  const k = ed.moved.length + ed.dropped.length + Object.keys(ed.area).length;
  const a = $('#an-nch'); if (a) a.textContent = k;
  const d = $('#an-diff'); if (d) d.innerHTML = diffHtml(strip(ed));
}
async function saveEdits(p, run, go) {
  const k = ed ? ed.moved.length + ed.dropped.length + Object.keys(ed.area).length : 0;
  if (!k) { say('저장할 변경이 없습니다.'); return; }
  const yes = await confirmDialog({ title: '분석 결과 저장', body: `변경 ${k}건을 분석 결과에 반영할까요?\n이동 ${ed.moved.length} · 삭제 ${ed.dropped.length} · 면적 ${Object.keys(ed.area).length}`, okLabel: '저장' });
  if (!yes) return;
  D.clearEdits(p.id, run.result);
  go({ mode: '' }); say(`분석 결과를 수정했습니다 · 변경 ${k}건 · 시연`);
}
function startRun(p, go) {
  const t = D.trainsOf(p.id).find((x) => x.id === $('#an-model').value);
  const f = $$('#main [data-anfile][aria-selected="true"]')[0];
  const fid = f ? f.dataset.anfile : (p.files[0] || {}).id;
  D.addRun(p.id, { name: `${p.name} #${D.runsOf(p.id).length + 1}`, file: fid, state: '분석중', step: 1, of: 5, at: '2026-06-08 09:40', model: t ? t.name : '—' });
  go({ an: '', mode: '' }); say('분석을 실행했습니다 · 시연');
}

/* 공유 설정 — 기관 · 역할(원본 권한 마스터) */
function openShare(p, run) {
  const ORGS = [['LX 한국국토정보공사', ['LX 관리자', 'LX 일반 사용자', 'LX 하천 관리']],
    ['남원시청', ['남원시청 관리자', '사료작물 분석', '농지 활용 분석', '영농 정보 분석', '일반사용자']],
    ['전라남도', ['전라남도 관리자', '해운항만과', '신안군']]];
  const m = openModal({ title: '공유 설정', tag: '시연', width: 520, content: `
    <p class="mic" style="margin:0 0 12px">분석 결과를 공유할 기관·역할을 선택하세요.</p>
    ${ORGS.map(([org, roles]) => `<div class="panel-h" style="margin-top:8px"><h3>${esc(org)}</h3><span class="sp"></span><span class="mic n" id="sh-${esc(org)}">0 / ${roles.length}</span></div>
      ${roles.map((r, i) => `<label class="ck" style="display:flex;gap:10px;padding:7px 10px;border-bottom:1px solid var(--line)"><input type="checkbox" class="sh-ck" data-org="${esc(org)}"${org === 'LX 한국국토정보공사' && i === 0 ? ' checked' : ''}><span>${esc(r)}</span><span class="sp" style="flex:1"></span><span class="mic">${esc(org)}</span></label>`).join('')}`).join('')}
    <p class="mic" style="margin-top:12px"><b class="n" id="sh-n" style="color:var(--accent)">선택 1 / 11</b></p>`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: () => { say(`공유 설정을 저장했습니다 · ${$$('.sh-ck:checked', m.el).length}개 역할 · 시연`); return true; } }] });
  const tot = () => { $('#sh-n', m.el).textContent = `선택 ${$$('.sh-ck:checked', m.el).length} / ${$$('.sh-ck', m.el).length}`; };
  $$('.sh-ck', m.el).forEach((c) => c.addEventListener('change', tot)); tot();
}
