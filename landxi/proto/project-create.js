/* 프로젝트 만들기 — 폼 한 화면(①) + 검토(②).
   원판 B5-Project-Create.png · B5-Project-Create-Review.png · 빈 목록의 안내 B7-Projects-Empty.png
   ?step=review 로 검토. 만들면 세션 저장에 들어가 목록에 실제로 나타난다(새로 고치면 시드 복귀). */
import { mountShell, say, mountPager, bindCounters, icon, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { demo, guess, fig, kv, cta, br, link, miss, n } from './project-ui.js';
import { resolveVWorld } from './js/sources.js';

const PAGE = 'ai-project-create.html';
const F = { name: '', det: 'detect', dataType: 'ortho', files: [], reco: 'auto', ds: [], invite: [], role: '편집자' };
let step = new URLSearchParams(location.search).get('step') === 'review' ? 'review' : 'form';
let page = 1; const SIZE = 6;

mountShell({ active: 'project', title: step === 'review' ? '프로젝트 만들기' : '프로젝트 만들기', titleRule: 0, asOf: false, fit: true,
  crumbIcon: 'chevR', crumbs: [{ label: '프로젝트 목록', href: 'ai-project.html' }, { label: '프로젝트 만들기' }],
  subtitle: step === 'review' ? '<span style="color:var(--accent)">검토</span>' : '' });
$('#page-head')?.setAttribute('data-pj', '');

/* 시드 기본값 — 아카이브 첫 2건(남원 4월 A구역 · 운봉읍 드론) */
F.files = D.ARCHIVE.filter((a) => a.kind === '정사영상').slice(0, 2).map((a) => a.id);
F.name = '남원 비닐하우스 2026';

const main = $('#main');
render();

function gsdRange() {
  const gs = F.files.map((f) => D.archiveById(f)).filter((a) => a && a.gsd).map((a) => a.gsd * 100);
  if (!gs.length) return null;
  return { min: Math.min(...gs), max: Math.max(...gs) };
}
function recoLabel() {
  const g = gsdRange(); if (!g) return '≤ 0.02 m/px';
  return `≤ ${(Math.ceil(g.max) / 100).toFixed(2)} m/px`;
}

function render() {
  $$('#main > :not(#page-head)').forEach((e) => e.remove());
  main.insertAdjacentHTML('beforeend', `<div id="pj-root"><div class="split pj-body" style="--l:776fr;--r:440fr">
    <section class="split-l"><div class="panel-b" style="padding-top:0">${step === 'review' ? reviewLeft() : formLeft()}</div></section>
    <aside class="split-r panel" aria-label="새 프로젝트">${sidePanel()}</aside></div></div>`);
  bind();
  if (step === 'form') drawMap();
}

/* ── ① 폼: 좌 = 아카이브에서 선택 + 선택 영상 범위 지도 ── */
function formLeft() {
  const all = D.ARCHIVE, slice = all.slice((page - 1) * SIZE, page * SIZE);
  return `<div class="pj-hist-h" style="align-items:baseline"><p class="lb" style="margin:0">영상 불러오기</p></div>
  <h2 style="margin:0 0 12px;font-family:var(--disp);font-weight:700;font-size:26px">아카이브에서 선택
    <span class="mic" style="float:right;color:var(--accent);font-size:14px;line-height:34px">${all.length}건 · 선택 <span class="n">${F.files.length}</span></span></h2>
  <div class="pj-bar" style="padding-bottom:12px">
    <span class="sel sel--s"><select id="cr-kind" aria-label="유형"><option>전체</option><option>정사영상</option><option>이미지셋</option><option>공간정보</option></select></span>
    <label class="inp-ic">${icon('search', 14)}<input class="inp inp--s" id="cr-q" placeholder="검색어" aria-label="검색어"></label>
    <button type="button" class="link link--ink" data-act="cr-reset">초기화</button><button type="button" class="link link--ink" data-act="cr-search">검색</button>
    <span class="sp" style="flex:1"></span><nav id="cr-pager"></nav></div>
  <div class="pj-tiles" style="grid-template-columns:repeat(3,1fr)">${slice.map((a) => tile(a)).join('')}</div>
  <div style="margin-top:18px"><div class="pj-plate" id="cr-map" style="height:220px;background:#fff;border:1px solid var(--line)"></div>
    <p class="mic" style="margin-top:8px">남원 · 선택 영상 범위 · 읍면동 경계 = 행정안전부</p></div>`;
}
function tile(a) {
  const on = F.files.includes(a.id);
  return `<button type="button" class="pj-tile" data-pick="${esc(a.id)}" aria-selected="${on}">
    <span style="position:relative;display:block">${a.thumb ? fig(a.thumb, a.name, '', { style: '--ar:240/147' }) : '<figure class="imgcard imgcard--none" style="--ar:240/147">SHP</figure>'}
      ${on ? `<span style="position:absolute;right:8px;top:8px;width:20px;height:20px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center">${icon('check', 14)}</span>` : ''}</span>
    <span class="pj-tile-c"><span>${esc(a.name)}</span>${a.demo ? demo() : ''}</span>
    <span class="pj-tile-c" style="padding-top:0"><span class="mic n">${esc(a.captured)} · ${esc(a.gsdLabel)}</span></span></button>`;
}

/* ── ② 검토 ── */
function reviewLeft() {
  const first = D.archiveById(F.files[0]);
  const g = gsdRange();
  const rows = [
    ['탐지 유형', F.det === 'segment' ? 'Segmentation' : 'Object Detection'],
    ['학습데이터 유형', F.dataType === 'ortho' ? '정사영상 (ortho)' : '이미지셋 (imageset)'],
    ['권장 해상도', `${recoLabel()} · 자동 · GSD ${g ? `${g.min.toFixed(2)} – ${g.max.toFixed(2)} cm` : '—'}`],
    [`영상 ${F.files.length}`, F.files.length ? `<span style="display:inline-flex;gap:6px;vertical-align:-14px">${F.files.slice(0, 2).map((f) => fig(D.archiveById(f).thumb, '', '', { style: '--ar:52/30;width:52px;display:inline-block' })).join('')}</span> ${esc(F.files.map((f) => D.archiveById(f).name).join(' · '))}` : miss('영상 없음')],
    [`학습데이터 ${F.ds.length}`, F.ds.length ? esc(F.ds.join(' · ')) : miss('선택 없음 — 라벨링 탭에서 나중에')],
    [`구성원 ${1 + F.invite.length}`, `소유자 · 내 계정${F.invite.length ? ` · ${esc(F.invite.join(' · '))} ${esc(F.role)}` : ''}`],
  ];
  return `<p class="lb" style="margin:0 0 6px">대표 이미지 · 자동 (영상 ${F.files.length ? 1 : 0})<span class="sp" style="flex:1"></span></p>
  ${fig(first ? first.thumb : null, '대표 이미지', '', { style: '--ar:778/300' })}
  <h2 style="margin:16px 0 14px;font-family:var(--disp);font-weight:700;font-size:34px;letter-spacing:-.02em">${esc(F.name || '이름 없는 프로젝트')}</h2>
  <table class="tbl tbl--l"><colgroup><col style="width:172px"><col><col style="width:72px"></colgroup><tbody>
    ${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td><td class="r"><button type="button" class="link" data-act="back">수정 ›</button></td></tr>`).join('')}
  </tbody></table>`;
}

/* ── 우측 판: 새 프로젝트 ── */
function sidePanel() {
  const g = gsdRange();
  if (step === 'review') {
    return `<header class="panel-h"><h2>새 프로젝트</h2><span class="sp"></span><span class="mic" style="color:var(--accent)">모든 항목 입력</span></header>
    <div class="panel-b">${kv([['프로젝트명', esc(F.name)], ['탐지 유형', F.det === 'segment' ? 'Segmentation' : 'Object Detection'],
      ['학습데이터 유형', F.dataType === 'ortho' ? '정사영상 (ortho)' : '이미지셋 (imageset)'],
      ['영상', `<span class="n">${F.files.length}</span> · <span class="n">${g ? `${g.min.toFixed(2)} – ${g.max.toFixed(2)} cm` : '—'}</span>`],
      ['권장 해상도', `<span class="n">${recoLabel()}</span>${guess()}`],
      ['학습데이터', F.ds.length ? esc(F.ds.join(' · ')) : miss('선택 없음')],
      ['구성원', `<span class="n">${1 + F.invite.length}</span> · 소유자${F.invite.length ? ` + 편집자 ${F.invite.length}` : ''}`]])}</div>
    <footer class="panel-f"><a class="link link--ink" href="ai-project.html">목록</a>${br('취소', 'back')}${cta('프로젝트 만들기', 'make')}</footer>`;
  }
  return `<header class="panel-h"><h2>새 프로젝트</h2></header>
  <div class="panel-b"><form class="form" id="cr-form" style="display:block">
    <div class="field"><div class="field-h"><label class="field-l" for="cr-name">프로젝트명<em class="req">*</em></label><span class="cnt" data-for="cr-name"></span></div>
      <input id="cr-name" class="inp" maxlength="100" value="${esc(F.name)}"></div>
    <p class="lb" style="margin:16px 0 8px">탐지 유형 <em class="req">*</em></p>
    <div class="pj-pick">
      <label>${fig(D.MARK.gh[0], 'Object Detection')}<span class="pj-pick-m">${icon('check', 14)}</span><input type="radio" name="cr-det" value="detect"${F.det === 'detect' ? ' checked' : ''}><b>Object Detection</b><span>바운딩 박스로 객체 위치 탐지</span></label>
      <label>${fig(D.MARK.fl[0], 'Segmentation')}<span class="pj-pick-m">${icon('check', 14)}</span><input type="radio" name="cr-det" value="segment"${F.det === 'segment' ? ' checked' : ''}><b>Segmentation</b><span>폴리곤으로 정밀 윤곽 탐지</span></label></div>
    <div class="field" style="margin-top:16px"><label class="field-l" for="cr-dt">학습데이터 유형</label>
      <span class="sel"><select id="cr-dt"><option value="ortho"${F.dataType === 'ortho' ? ' selected' : ''}>정사영상 (ortho)</option><option value="imageset"${F.dataType === 'imageset' ? ' selected' : ''}>이미지셋 (imageset)</option></select></span></div>
    <div style="background:var(--t1);padding:12px 14px;margin:16px 0">
      <p class="lb" style="margin:0 0 8px">영상 불러오기</p>
      <p style="display:flex;align-items:center;gap:12px;margin:0 0 10px">${br('아카이브에서 선택', 'focus-arch')}
        <span style="display:inline-flex;gap:6px">${F.files.slice(0, 2).map((f) => fig(D.archiveById(f).thumb, '', '', { style: '--ar:52/30;width:52px' })).join('')}</span>
        <span><b style="font-size:15px">선택 ${F.files.length}</b><br><span class="mic n">${(() => { const g2 = gsdRange(); return g2 ? `${g2.min.toFixed(2)} – ${g2.max.toFixed(2)} cm` : '—'; })()}</span></span></p>
      <p class="lb" style="margin:0 0 6px">권장 해상도 <em class="tag">자동</em></p>
      <span class="sel" style="width:100%"><select id="cr-reco"><option>${recoLabel()}</option><option>≤ 0.05 m/px</option><option>≤ 0.10 m/px</option></select></span>
      <p class="mic" style="margin:8px 0 0">선택 영상 GSD ${(() => { const g2 = gsdRange(); return g2 ? `${g2.min.toFixed(2)} – ${g2.max.toFixed(2)} cm` : '—'; })()} → ${esc(recoLabel().replace('≤ ', '').replace(' m/px', ''))} 급</p></div>
    <p class="lb" style="margin:0 0 6px">학습데이터 불러오기</p>
    <p style="display:flex;align-items:center;gap:12px;margin:0 0 16px">${br('데이터셋 · 라벨링 데이터', 'pick-ds')}<span class="mic">선택 <span class="n">${F.ds.length}</span></span></p>
    <p class="lb" style="margin:0 0 6px">구성원 초대</p>
    <p style="display:flex;align-items:center;gap:10px;margin:0 0 16px"><input class="inp inp--s" id="cr-inv" placeholder="아이디" aria-label="초대할 아이디" style="flex:1">
      <button type="button" class="link link--ink" data-act="inv-check">확인</button>
      <span class="sel sel--s"><select id="cr-role" aria-label="역할"><option>편집자</option><option>뷰어</option></select></span></p>
    <hr class="hr"><p style="display:flex;align-items:baseline;margin:12px 0 0;font-size:15px"><b>소유자 · 내 계정</b><span class="sp" style="flex:1"></span><span class="mic n">${1 + F.invite.length} 명</span></p>
  </form></div>
  <footer class="panel-f"><a class="link link--ink" href="ai-project.html">목록</a>${br('취소', 'cancel')}${cta('프로젝트 만들기', 'review')}</footer>`;
}

/* ── 동작 ── */
function bind() {
  bindCounters($('#pj-root'));
  if (step === 'form') {
    mountPager($('#cr-pager'), { total: D.ARCHIVE.length, page, size: SIZE, sizes: [SIZE], onChange: (s) => { page = s.page; keep(); render(); } });
    $$('#main [data-pick]').forEach((b) => b.addEventListener('click', () => {
      keep(); const id = b.dataset.pick;
      F.files = F.files.includes(id) ? F.files.filter((x) => x !== id) : [...F.files, id];
      render();
    }));
  }
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'review': keep(); if (!F.name.trim()) { say('프로젝트명을 입력해 주세요.'); $('#cr-name').focus(); return; }
        if (!F.files.length) { say('영상을 한 건 이상 고르세요.'); return; }
        step = 'review'; history.pushState(null, '', PAGE + '?step=review'); render(); return;
      case 'back': step = 'form'; history.pushState(null, '', PAGE); render(); return;
      case 'cancel': location.href = 'ai-project.html'; return;
      case 'make': return make();
      case 'focus-arch': $('#cr-q')?.focus(); return;
      case 'pick-ds': keep(); F.ds = F.ds.length ? [] : ['비닐하우스 라벨 v3']; render(); say(F.ds.length ? '학습데이터 1건을 선택했습니다 · 시연' : '학습데이터 선택을 해제했습니다'); return;
      case 'inv-check': { keep(); const v = $('#cr-inv').value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { $('#cr-inv').setAttribute('aria-invalid', 'true'); say('아이디를 확인해 주세요.'); return; }
        F.invite = [...new Set([...F.invite, v.split('@')[0]])]; render(); say(`${v.split('@')[0]} 님을 초대 목록에 넣었습니다 · 시연`); return; }
      case 'cr-reset': $('#cr-q').value = ''; $('#cr-kind').selectedIndex = 0; page = 1; keep(); render(); return;
      case 'cr-search': say('검색 조건을 적용했습니다 · 시연'); return;
      default: return undefined;
    }
  });
  addEventListener('popstate', () => { step = new URLSearchParams(location.search).get('step') === 'review' ? 'review' : 'form'; render(); }, { once: true });
}
function keep() {
  if (step !== 'form') return;
  F.name = ($('#cr-name') || {}).value ?? F.name;
  F.det = ($('input[name="cr-det"]:checked') || {}).value || F.det;
  F.dataType = ($('#cr-dt') || {}).value || F.dataType;
  F.role = ($('#cr-role') || {}).value || F.role;
}
function make() {
  const mid = F.det === 'segment' ? 'best-road' : 'best-vinylhouse';
  const id = D.addProject({ name: F.name.trim(), mid, crop: F.det === 'segment' ? 'fl' : 'gh', files: F.files, created: '2026-06-08 09:30', reco: recoLabel() });
  location.href = `ai-project.html?pid=${encodeURIComponent(id)}&tab=overview`;
}

/* ── 선택 영상 범위 지도 — 남원 읍면동 경계(행안부) + 선택 도엽 범위. 손 배치 도형 0 ── */
async function drawMap() {
  const el = $('#cr-map'); if (!el || typeof window.maplibregl === 'undefined') return;
  let emd = null;
  try { emd = await fetch('../assets/data/geo/namwon-emd.geojson').then((r) => r.json()); } catch { /* 없으면 경계 없이 */ }
  const boxes = { type: 'FeatureCollection', features: F.files.map((f, i) => {
    const a = D.archiveById(f); if (!a || !a.bounds) return null;
    const [w, s, e2, n2] = a.bounds;
    return { type: 'Feature', properties: { nm: `${i + 1} · ${a.name}` }, geometry: { type: 'Polygon', coordinates: [[[w, s], [e2, s], [e2, n2], [w, n2], [w, s]]] } };
  }).filter(Boolean) };
  const map = new maplibregl.Map({ container: el, attributionControl: false, dragRotate: false,
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#FFFFFF' } }] },
    center: [127.42, 35.43], zoom: 8.6, maxZoom: 14, minZoom: 6 });
  map.on('load', () => {
    if (emd) {
      map.addSource('emd', { type: 'geojson', data: emd });
      map.addLayer({ id: 'emd-f', type: 'fill', source: 'emd', paint: { 'fill-color': '#F3F4F6', 'fill-opacity': 0.9 } });
      map.addLayer({ id: 'emd-l', type: 'line', source: 'emd', paint: { 'line-color': '#DDDDDD', 'line-width': 1 } });
    }
    map.addSource('sel', { type: 'geojson', data: boxes });
    map.addLayer({ id: 'sel-f', type: 'fill', source: 'sel', paint: { 'fill-color': '#006DF7', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'sel-l', type: 'line', source: 'sel', paint: { 'line-color': '#006DF7', 'line-width': 1.6 } });
    if (boxes.features.length) {
      let b = [180, 90, -180, -90];
      boxes.features.forEach((f) => f.geometry.coordinates[0].forEach((c) => { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; }));
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 0, maxZoom: 11 });
    } else if (emd) {
      map.fitBounds([[127.16, 35.24], [127.66, 35.62]], { padding: 20, duration: 0 });
    }
    el.dataset.map = 'ready';
  });
}
