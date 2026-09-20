/* 카드 발행(3단계) · 카드 수정(1·2 잠금) — 원본 landxi7/ai-card-edit.html · 원판 B6-Publish-Card-Edit · Card-Edit-Locked.
   발행: 1 프로젝트 선택 → 2 학습 결과 선택(발행됨 = 비활성) → 3 정보 입력(사용 여부 '사용' 고정) → 발행
   수정: ?cid=6&mc=0 — 1·2 는 잠기고(`수정 시 변경할 수 없습니다.`) 3 만 고친다 → 저장
   URL 이 상태다(발행 모드): ?project=6&result=1 */
import { mountShell, say, bindCounters, icon, esc, $, $$ } from './shell.js';
import * as D from './publish-data.js';
import { fig, Plate, DEMO } from './publish-ui.js';

const q = new URLSearchParams(location.search);
const cid = q.get('cid') && D.PROJECTS[q.get('cid')] ? q.get('cid') : null, isEdit = !!cid;
const mc = Math.max(0, +q.get('mc') || 0);
const st = { pid: null, rid: null };
if (isEdit) { st.pid = cid; st.rid = D.modelCards(cid)[mc] ? mc : 0; }
else if (D.PROJECTS[q.get('project')]) { st.pid = q.get('project'); const r = +q.get('result'); if (q.has('result') && D.modelCards(st.pid)[r] && !D.modelCards(st.pid)[r].useYn) st.rid = r; }

const card = isEdit ? D.modelCards(st.pid)[st.rid] : null;
mountShell({ active: 'publish', title: isEdit ? '카드 수정' : '카드 발행', titleRule: 1, subtitle: isEdit ? '발행된 AI 카드 정보를 수정합니다' : '프로젝트와 학습 결과를 선택하고 모델 정보를 입력해 발행합니다', fit: true, demo: true, crumbIcon: 'layers',
  crumbs: [{ label: '카드 발행 관리', href: 'admin-publish.html' }, { label: '카드 발행', href: 'ai-card.html' }, { label: isEdit ? `${D.PROJECTS[cid].name} · ${card.ver}` : '새 카드' }] });
$('#page-head').dataset.tight = '';

const opt = (list, v) => `<option value="">선택</option>${list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
const F = card || {};
const field = (id, label, span, inner, { req = true, max = 0, msg = '', lock = false } = {}) => `<div class="field field--${span}" id="${id}-f"${lock ? ' data-lock' : ''}><div class="field-h"><label class="field-l" for="${id}">${label}${req ? '<em class="req">*</em>' : ''}</label>${max ? `<span class="cnt" data-for="${id}"></span>` : ''}</div>${inner}${msg ? `<p class="err" id="${id}-e" role="alert" hidden>${msg}</p>` : ''}</div>`;
const formHtml = `
<form class="ce-col" id="ce-form" novalidate aria-labelledby="ce-h3">
  <h2 class="ce-h" id="ce-h3"><b>3</b><span>정보 입력</span></h2>
  <div class="ce-form"><div class="form">
    ${field('mdlNm', '모델 명', 12, `<input class="inp inp--num" id="mdlNm" maxlength="200" placeholder="예: v1" value="${esc(F.ver || '')}" aria-describedby="mdlNm-e">`, { max: 200, msg: '모델 명을 입력해 주세요.' })}
    ${field('datasetSeCd', '모델 유형', 4, `<span class="sel"><select id="datasetSeCd" aria-describedby="datasetSeCd-e">${opt(D.MODEL_TYPES, F.typeCd)}</select></span>`, { msg: '모델 유형을 선택해 주세요.' })}
    ${field('algoId', '알고리즘', 4, `<span class="sel"><select id="algoId" class="n" aria-describedby="algoId-e">${opt(D.ALGOS, F.algoId)}</select></span>`, { msg: '알고리즘을 선택해 주세요.' })}
    ${field('mdlUseYn', '사용 여부', 4, `<span class="sel"><select id="mdlUseYn" aria-describedby="mdlUseYn-e"${isEdit ? '' : ' disabled'}>${opt([['Y', '사용'], ['N', '미사용']], isEdit ? (F.useYn ? 'Y' : 'N') : 'Y')}</select>${isEdit ? '' : icon('lock', 14)}</span>`, { msg: '사용 여부를 선택해 주세요.', lock: !isEdit })}
    ${field('mdlCn', '모델 설명', 12, `<input class="inp" id="mdlCn" maxlength="500" placeholder="모델 설명을 입력해 주세요." value="${esc(F.desc || '')}">`, { req: false, max: 500 })}
    ${field('dockerImage', '도커 이미지 명', 6, `<input class="inp inp--num" id="dockerImage" maxlength="200" placeholder="도커 이미지 명을 입력해 주세요." value="${esc(F.image && isEdit ? F.image : '')}" aria-describedby="dockerImage-e">`, { max: 200, msg: '도커 이미지 명을 입력해 주세요.' })}
    ${field('dockerTag', '도커 이미지 태그', 6, `<input class="inp inp--num" id="dockerTag" maxlength="100" placeholder="도커 이미지 태그를 입력해 주세요." value="${esc(isEdit ? F.tag : '')}" aria-describedby="dockerTag-e">`, { max: 100, msg: '도커 이미지 태그를 입력해 주세요.' })}
    ${field('detTp', '탐지 형태', 6, `<span class="sel"><select id="detTp" aria-describedby="detTp-e">${opt(D.DET_TYPES, isEdit ? F.detCd : '')}</select></span>`, { msg: '탐지 형태를 선택해 주세요.' })}
    ${field('tileSz', '타일링 크기(pixel)', 6, `<input class="inp" type="number" id="tileSz" min="64" max="8192" step="1" placeholder="64 ~ 8192" value="${isEdit ? F.tile : ''}" aria-describedby="tileSz-e">`, { msg: '타일링 크기를 입력해 주세요.' })}
    ${field('mdlExplnScrn', '모델 설명 화면', 12, `<input class="inp inp--num" id="mdlExplnScrn" maxlength="200" placeholder="예: /jn/aidetect/sea_trash_drone.html" value="${esc(isEdit ? F.screen : '')}" aria-describedby="mdlExplnScrn-e">`, { max: 200, msg: '모델 설명 화면을 입력해 주세요.' })}
  </div></div>
  <div class="ce-f"><span class="mic">${isEdit ? '' : '발행 모드 · 사용 여부는 ‘사용’ 고정'}</span><button type="button" class="txt-b" id="f-cancel">취소</button><button type="submit" class="btn btn--l" id="f-submit">${isEdit ? '저장' : '발행'}</button></div>
</form>`;

const main = $('#main');
if (isEdit) {
  const p = D.PROJECTS[cid], cards = D.modelCards(cid);
  main.insertAdjacentHTML('beforeend', `<div class="ce" data-locked>
    <div class="ce-col"><div class="ce-ev"><div data-slot="plate"></div></div>
      <div class="ce-lock"><div><h2 class="ce-h" data-off><b>1</b><span>프로젝트 선택</span></h2><div class="box">${icon('lock')}<span>${esc(p.name)}</span></div><p class="why">수정 시 변경할 수 없습니다.</p></div>
        <div><h2 class="ce-h" data-off><b>2</b><span>학습 결과 선택</span></h2><div class="box">${icon('lock')}<span>${esc(card.name)}<span class="n">${esc(card.published)}</span></span></div><p class="why">수정 시 변경할 수 없습니다.</p></div></div>
      <dl class="kv ce-meta"><div><dt>발행</dt><dd><span class="n">${esc(card.published)}</span> · 발행자 김○○ ${DEMO}</dd></div><div><dt>최종 수정</dt><dd><span class="n">${esc(card.modified)}</span> · 수정자 김○○</dd></div><div><dt>이 프로젝트의 카드</dt><dd>${cards.map((c) => `${esc(c.ver)} ${c.useYn ? '사용' : '미사용'}`).join(' · ')}</dd></div></dl></div>
    <i aria-hidden="true"></i>${formHtml}</div>`);
} else {
  main.insertAdjacentHTML('beforeend', `<div class="ce">
    <section class="ce-col" aria-labelledby="ce-h1"><h2 class="ce-h" id="ce-h1"><b>1</b><span>프로젝트 선택</span></h2><p class="err" id="ce-e1" role="alert" hidden>프로젝트를 선택해주세요.</p><div class="ce-list" id="proj-list" role="group" aria-labelledby="ce-h1"></div></section><i aria-hidden="true"></i>
    <section class="ce-col" aria-labelledby="ce-h2"><h2 class="ce-h" id="ce-h2"><b>2</b><span>학습 결과 선택</span></h2><p class="err" id="ce-e2" role="alert" hidden>학습 결과를 선택해주세요.</p><div id="result-wrap" style="display:contents"></div></section><i aria-hidden="true"></i>
    ${formHtml}</div>`);
}
bindCounters(main);
const plate = new Plate();

function evidence() {
  const slot = $('[data-slot="plate"]'); if (slot) plate.place(slot);
  const real = D.PROJECTS[st.pid]?.real ? D.REAL[D.PROJECTS[st.pid].real] : null;
  plate.show(st.pid, { mode: 'evidence', compact: !isEdit, capL: real ? `${D.PROJECTS[st.pid].name} · ${real.place} 일대` : '' });
  const note = $('#ce-ev-note'); if (!note) return;
  const s = real?.res.stats;
  note.innerHTML = real ? `실측 <span class="n">${s.count.toLocaleString('ko-KR')}</span> ${real.unit} · 분석 <span class="n">${s.analyzedAt}</span><br>${real.classes.map((c) => `${esc(c.label.replace(/.*\((.*)\)/, '$1'))} <span class="n">${(s.classes[c.key] || 0).toLocaleString('ko-KR')}</span>`).join(' · ')} · 평균 신뢰도 <span class="n">${s.confMean.toFixed(2)}</span>` : '실 결과 없음 — 이 과제의 결과 GeoJSON 이 아직 없습니다';
}
function drawProjects() {
  $('#proj-list').innerHTML = Object.entries(D.PROJECTS).map(([k, p]) => `<button type="button" class="ce-p" data-pid="${k}" aria-pressed="${k === st.pid}">${fig(p.thumbClean || p.thumb, { alt: '' })}<span><b>${esc(p.name)}</b><span class="m">학습 ${p.trainRuns} · ${p.type.replace(/ \(.*/, '')} · ${D.dataTypeLabel(p.dataType)}</span></span></button>`).join('');
}
function drawResults() {
  const w = $('#result-wrap'); plate.park();
  if (!st.pid) { w.innerHTML = '<div class="empty empty--s" style="margin-top:12px">프로젝트를 먼저 선택하세요</div>'; return; }
  const list = D.modelCards(st.pid);
  if (!list.length) { w.innerHTML = '<div class="empty empty--s" style="margin-top:12px">학습 완료된 결과가 없습니다</div>'; return; }
  const free = list.map((r, i) => i).filter((i) => !list[i].useYn);
  if (free.length === 1 && st.rid == null) st.rid = free[0];                       // 원본: 발행 가능한 결과가 하나뿐이면 자동 선택
  const order = [...free, ...list.map((r, i) => i).filter((i) => list[i].useYn)];
  w.innerHTML = `<p class="ce-note">이미 발행된 학습 결과는 선택할 수 없습니다.</p><div class="ce-list" style="flex:0 1 auto" role="radiogroup" aria-labelledby="ce-h2">${order.map((i) => { const r = list[i]; return `<button type="button" class="ce-r" role="radio" data-rid="${i}" aria-checked="${i === st.rid}"${r.useYn ? ' disabled' : ''}><span class="rdo"></span><span><b>${esc(r.name)}</b><span class="n">${esc(r.published)}</span></span>${r.useYn ? '<span class="chip">발행됨</span>' : ''}</button>`; }).join('')}</div>
    <div class="ce-ev"><div data-slot="plate"></div><p id="ce-ev-note"></p></div>`;
  evidence();
}
function syncUrl() { const n = new URLSearchParams(); if (st.pid) n.set('project', st.pid); if (st.rid != null) n.set('result', st.rid); const s = n.toString(); history.replaceState(null, '', `ai-card-edit.html${s ? `?${s}` : ''}`); }

if (isEdit) evidence();
else {
  drawProjects(); drawResults();
  if (st.pid) $('#datasetSeCd').value = D.PROJ_TO_TYPE[st.pid] || '';
  $('#proj-list').addEventListener('click', (e) => {
    const b = e.target.closest('.ce-p'); if (!b) return;
    if (st.pid !== b.dataset.pid) st.rid = null;
    st.pid = b.dataset.pid; $('#ce-e1').hidden = true; $('#datasetSeCd').value = D.PROJ_TO_TYPE[st.pid] || '';      // 원본: 프로젝트 → 모델 유형 자동
    drawProjects(); drawResults(); syncUrl(); $(`.ce-p[data-pid="${st.pid}"]`).focus();
  });
  $('#result-wrap').addEventListener('click', (e) => { const b = e.target.closest('.ce-r'); if (!b || b.disabled) return; st.rid = +b.dataset.rid; $('#ce-e2').hidden = true; $$('.ce-r').forEach((x) => x.setAttribute('aria-checked', String(x === b))); syncUrl(); });
  $('#result-wrap').addEventListener('keydown', (e) => {
    const b = e.target.closest('.ce-r'); if (!b || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const all = $$('.ce-r:not(:disabled)'), n = all[all.indexOf(b) + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); n.click(); }
  });
}

const REQUIRED = ['mdlNm', 'datasetSeCd', 'algoId', 'mdlUseYn', 'dockerImage', 'dockerTag', 'detTp', 'tileSz', 'mdlExplnScrn'];
const form = $('#ce-form');
form.addEventListener('input', (e) => { const er = $(`#${e.target.id}-e`); if (er) { er.hidden = true; e.target.removeAttribute('aria-invalid'); } });
form.addEventListener('change', (e) => { const er = $(`#${e.target.id}-e`); if (er) { er.hidden = true; e.target.removeAttribute('aria-invalid'); } });
$('#f-cancel').addEventListener('click', () => { if (history.length > 1 && document.referrer) history.back(); else location.href = 'ai-card.html'; });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!st.pid) { $('#ce-e1').hidden = false; say('프로젝트를 선택해주세요.'); $('.ce-p')?.focus(); return; }
  if (st.rid == null) { $('#ce-e2').hidden = false; say('학습 결과를 선택해주세요.'); $('.ce-r:not(:disabled)')?.focus(); return; }
  let first = null;
  for (const id of REQUIRED) { const el = $(`#${id}`), bad = !String(el.value).trim(); $(`#${id}-e`).hidden = !bad; if (bad) { el.setAttribute('aria-invalid', 'true'); first ||= el; } else el.removeAttribute('aria-invalid'); }
  if (first) { say($(`#${first.id}-e`).textContent); first.focus(); return; }
  const nm = $('#mdlNm').value.trim();
  D.patchModelCard(st.pid, st.rid, { ver: nm, typeCd: $('#datasetSeCd').value, algoId: $('#algoId').value, useYn: $('#mdlUseYn').value === 'Y', desc: $('#mdlCn').value.trim(), image: $('#dockerImage').value.trim(), tag: $('#dockerTag').value.trim(), detCd: $('#detTp').value, tile: +$('#tileSz').value, screen: $('#mdlExplnScrn').value.trim() });
  say(`"${nm}" ${isEdit ? '카드가 수정되었습니다.' : '카드가 발행되었습니다.'}`);
  $('#f-submit').disabled = true;
  setTimeout(() => { location.href = 'ai-card.html'; }, 1000);
});
