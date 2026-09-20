/* 프로젝트 · 라벨링 탭 — 라벨링 데이터 목록 + 실지도 미리보기(V-World + 실 GeoJSON).
   편집 자체는 별지 작업공간 ai-project-label.html(원판 B7-Project-Labeling-Fix.png).
   원판 B5-Project-Labeling.png · 선례 publish-map.js(결과 GeoJSON) */
import { say, esc, $, $$ } from './shell.js';
import * as D from './project-data.js';
import { n, demo, fig, kv, st, empty, cta, br, link, bars, miss } from './project-ui.js';
import { mountPlate, setResult, loadGeo, near, bboxOf, frame, hasGL, setHybrid } from './publish-map.js';

export function labelTab(p, S) {
  const labs = D.labelingOf(p.id);
  const cur = labs.find((l) => l.file === S.file) || labs[0] || null;
  return `<div class="split pj-body" style="--l:776fr;--r:440fr">
    <section class="split-l">
      <div class="pj-seg"><button type="button" role="tab" aria-selected="true">라벨링 데이터 <span class="n">${labs.length}</span></button>
        <span class="pj-seg-r"><span class="mic">클래스 <span class="n">${p.classes.length}</span> · 라벨 합계 <span class="n" style="color:var(--accent)">${n(D.labelTotal(p.id)) }</span></span>
        ${br('클래스 관리', 'cls-open')}${cur ? cta('라벨링 열기 ›', 'lab-open') : ''}</span></div>
      <div class="panel-b" style="padding-top:0">${labs.length ? plate(p, cur) : empty('라벨링한 데이터가 없습니다', '데이터 탭에서 파일을 고르고 라벨링을 시작하세요', 'edit')}</div>
    </section>
    <aside class="split-r panel" aria-label="라벨 조회">
      <header class="panel-h"><h2>라벨 조회</h2><span class="sp"></span><span class="mic n">${labs.length ? labs.indexOf(cur) + 1 : 0} / ${labs.length}</span></header>
      <div class="panel-b">${labs.length ? side(p, cur, labs) : `<p class="mic">클래스 ${p.classes.length}</p>${clsList(p)}`}</div>
      ${cur ? `<footer class="panel-f"><span class="mic">LX 권한 · 라벨 편집</span>${link('클래스 일괄 변경 ›', 'bulk')}${cta('라벨링 열기 ›', 'lab-open')}</footer>` : ''}
    </aside></div>`;
}

function plate(p, cur) {
  const has = !!p.resultId;
  return `<div class="pj-work" style="--wl:246px">
    <div><p class="lb" style="margin-bottom:8px">영상 <span class="n" style="color:var(--accent)">${D.labelingOf(p.id).length}</span></p>
      <div class="pj-runs">${D.labelingOf(p.id).map((l) => `<button type="button" class="pj-run" data-file="${esc(l.file)}" aria-selected="${l.file === cur.file}" style="grid-template-columns:1fr">
        ${fig(l.img.thumb, l.img.name, '', { style: '--ar:230/110' })}
        <span><b>${esc(l.img.name)}</b><span><span class="n">${esc(l.img.gsdLabel)}</span> · 라벨 <span class="n">${n(l.labels)}</span> · <span class="n">${esc(l.last)}</span></span>
        <span>${st(l.state)}${l.demo ? demo() : ''}</span></span></button>`).join('')}</div></div>
    <div>${has ? `<div class="pj-plate" id="lab-plate" aria-label="라벨 미리보기 지도">
        <div class="pj-tools"><span class="pj-tb" aria-hidden="true">${esc(cur.img.name)}</span><span class="sp"></span>
          <button type="button" class="pj-tb" data-act="hyb" aria-pressed="false">지명</button>
          <button type="button" class="pj-tb pj-tb--cta" data-act="lab-open">라벨링 열기 ›</button></div>
        <div class="pj-zoom"><button type="button" data-act="zin" aria-label="확대">＋</button><button type="button" data-act="zout" aria-label="축소">－</button></div>
      </div><p class="mic" style="margin-top:8px">V-World 위성 · 실 결과 GeoJSON <span class="n">${esc(p.resultId)}</span> — 손으로 배치한 도형이 아닙니다</p>`
      : `<div class="pj-plate pj-plate--none"><span>실 결과 도형이 없는 과제입니다<br><span class="mic">라벨은 작업공간에서 직접 그립니다 · 지도에 올릴 도형이 아직 없습니다</span></span></div>`}</div></div>`;
}

function side(p, cur, labs) {
  const rows = D.labelRows(p.id, cur.file);
  return `${fig(cur.img.thumb, cur.img.name)}
  <h3 class="panel-t" style="margin:12px 0 4px">${esc(cur.img.name)}</h3>
  <p class="mic" style="margin:0 0 12px"><span class="n">${esc(cur.img.gsdLabel)}</span> · 라벨 <span class="n" style="color:var(--accent)">${n(cur.labels)}</span> · ${st(cur.state)}${cur.demo ? demo() : ''}</p>
  ${kv([['도엽', esc(cur.img.name)], ['촬영', `<span class="n">${esc(cur.img.captured)}</span>`], ['최근 작업', `<span class="n">${esc(cur.last)}</span>`],
    ['클래스', `<span class="n">${p.classes.length}</span>`], ['라벨', `<span class="n">${n(cur.labels)}</span>${cur.real ? '' : demo()}`]])}
  <p class="lb" style="margin:16px 0 8px">클래스 ${p.classes.length}</p>${clsList(p)}
  <p class="lb" style="margin:16px 0 8px">라벨 <span class="n" style="color:var(--accent)">${n(cur.labels)}</span></p>
  ${rows.rows.map((r) => `<div class="pj-lrow"><input type="checkbox" aria-label="${esc(r.cls)} #${r.i} 선택"><span class="pj-sw${r.cls.endsWith('다동') || r.cls === '비경작지' ? ' pj-sw--o' : ''}"></span>
    <span>${esc(r.cls)} #${r.i}</span><span class="mic">${esc(r.shape)}</span><span class="x" aria-hidden="true">×</span></div>`).join('')}
  <p class="mic" style="margin-top:8px"><span class="n">${rows.rows.length} / ${n(rows.total)}</span> 행</p>`;
}
const clsList = (p) => p.classes.map((c, i) => `<div class="pj-cls" aria-selected="${i === 0}"><span class="pj-sw${i ? ' pj-sw--o' : ''}"></span><span>${esc(c.name)}</span><span class="sp"></span><span class="pj-chip n">${i + 1}</span><span class="n" style="color:var(--accent)">${n(c.n)}</span></div>`).join('');

export function bindLabel(p, S, go) {
  $$('#main .pj-run[data-file]').forEach((b) => b.addEventListener('click', () => go({ file: b.dataset.file }, { replace: true })));
  let map = null;
  $('#pj-root').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'lab-open') { const f = S.file || (D.labelingOf(p.id)[0] || {}).file || ''; location.href = `ai-project-label.html?pid=${encodeURIComponent(p.id)}${f ? `&file=${encodeURIComponent(f)}` : ''}`; return; }
    if (act === 'cls-open') return say('클래스는 작업공간의 클래스 탭에서 추가·수정합니다 · 시연');
    if (act === 'bulk') { const f = S.file || (D.labelingOf(p.id)[0] || {}).file || ''; location.href = `ai-project-label.html?pid=${encodeURIComponent(p.id)}${f ? `&file=${encodeURIComponent(f)}` : ''}&bulk=1`; return; }
    if (!map) return;
    if (act === 'zin') map.zoomIn(); if (act === 'zout') map.zoomOut();
    if (act === 'hyb') { const on = a.getAttribute('aria-pressed') !== 'true'; a.setAttribute('aria-pressed', String(on)); setHybrid(map, on); }
  });
  const el = $('#lab-plate');
  if (!el || !hasGL() || !p.resultId) return;
  const v = D.VIEW[p.resultId];
  mountPlate(el, { center: v.center, zoom: 15.4 }).then(async (mp) => {
    map = mp;
    const geo = await loadGeo(D.geoUrl(p.resultId));
    const fs = near(geo, v.center, v.km);
    setResult(map, { type: 'FeatureCollection', features: fs }, v.classes);
    frame(map, bboxOf(fs), { pad: 30, instant: true });
  }).catch(() => { el.classList.add('pj-plate--none'); el.innerHTML = '<span>지도를 불러오지 못했습니다<br><span class="mic">네트워크 연결을 확인해 주세요</span></span>'; });
}
