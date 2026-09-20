/* 카드 발행 요청(전역 진입 · pid 없음) — 원본 landxi7/ai-publish-create.html + assets/js/page-ai-publish6.js · 원판 B6-Publish-Request.
   선택 카드 3(내 프로젝트 · 학습 결과 · 분석 결과) → 과제 유형(신규 과제 / 과제 고도화) → 과제 정보 → 발행 요청.
   프로젝트 스코프(?pid=N)의 발행 요청은 프로젝트 화면군의 몫이다 — 여기는 전역 진입만.
   URL 이 상태다: ?project=7&result=r7-1&type=enhance&an=AN-7-2,AN-7-3&edit=1
   발행 요청은 세션에 `대기` 로 들어가 카드 발행 관리의 큐 맨 위에 선다. */
import { mountShell, say, openModal, bindCounters, icon, esc, $, $$ } from './shell.js';
import * as D from './publish-data.js';
import { fig, classChips } from './publish-ui.js';

const PAGE = 'ai-publish-create.html', BACK = 'ai-project.html';
const st = { pid: null, result: null, analyses: [], type: 'new', editOpen: false, info: {} };
(function read() {
  const q = new URLSearchParams(location.search);
  if (D.PROJECTS[q.get('project')]) { st.pid = q.get('project'); st.result = (D.TRAIN[st.pid] || []).find((t) => t.id === q.get('result')) || null; }
  if (st.result) { const ids = (q.get('an') || '').split(',').filter(Boolean); st.analyses = D.analysisCandidates(st.pid).filter((a) => ids.includes(a.id)); }
  st.type = q.get('type') === 'enhance' ? 'enhance' : 'new'; st.editOpen = q.get('edit') === '1';
})();
function syncUrl() {
  const q = new URLSearchParams();
  if (st.pid) q.set('project', st.pid); if (st.result) q.set('result', st.result.id); if (st.type === 'enhance') q.set('type', 'enhance'); if (st.analyses.length) q.set('an', st.analyses.map((a) => a.id).join(',')); if (st.editOpen && st.type === 'enhance') q.set('edit', '1');
  const s = q.toString(); history.replaceState(null, '', PAGE + (s ? `?${s}` : ''));
}

mountShell({ active: 'project', title: '카드 발행 요청', titleRule: 2, subtitle: '분석 과제(프로젝트)와 학습 결과를 선택하고 모델 세부 정보를 입력해 발행을 요청합니다', demo: true, crumbIcon: 'layers',
  crumbs: [{ label: 'AI 개발 프로젝트', href: BACK }, { label: '카드 발행 요청' }] });
$('#page-head').dataset.tight = '';
$('#main').insertAdjacentHTML('beforeend', `<form class="rq" id="rq" novalidate aria-label="카드 발행 요청">
  <div class="rq-body"><div class="rq-picks" id="rq-picks" role="group" aria-label="선택"></div><p class="err rq-perr" id="rq-perr" role="alert" hidden></p><div class="rq-form" id="rq-form"></div></div>
  <div class="rq-f"><a class="txt-b" href="${BACK}">${icon('list', 14)} 목록</a><span class="sp"></span><a class="txt-b" href="${BACK}" style="color:var(--grey)">취소</a><button type="submit" class="btn btn--l">발행 요청</button></div></form>`);

const pj = () => (st.pid ? D.PROJECTS[st.pid] : null);
const anThumb = (i) => { const p = pj(); if (!p?.thumb) return null; return p.real ? `../assets/proto/crops/${p.real}/${(i % 8) + 1}-clean.jpg` : p.thumb; };

/* ── 선택 카드 3 ── */
function drawPicks() {
  const p = pj(), r = st.result, n = st.analyses.length;
  const cardHtml = (kind, no, label, meta, value, sub, { on, has, disabled, src }) => `<button type="button" class="rq-p" data-pick="${kind}"${on ? ' data-on' : ''}${disabled ? ' disabled' : ''} aria-label="${label} — ${esc(value)}">${src === undefined ? '<figure class="imgcard imgcard--none"><span>미선택</span></figure>' : fig(src, { alt: '' })}
    <span class="b"><span class="k">${no} · ${label}<em class="${meta === '필수' ? 'req-m' : ''}">${meta}</em></span><span class="v">${esc(value)}</span><span class="s"><span${kind === 'result' ? ' class="n"' : ''}>${esc(sub)}</span><span class="go">${on || has ? '변경 ›' : disabled ? '' : '선택 ›'}</span></span></span></button>`;
  $('#rq-picks').innerHTML =
    cardHtml('project', 1, '내 프로젝트', '필수', p ? p.name : '프로젝트를 선택해 주세요', p ? `${p.type} · ${D.dataTypeLabel(p.dataType)}` : '학습을 마친 AI 개발 프로젝트', { on: false, has: !!p, src: p ? (p.thumbClean || p.thumb) : undefined })
    + cardHtml('result', 2, '학습 결과', '필수', r ? r.labeling : p ? '학습 결과를 선택해 주세요' : '프로젝트를 먼저 선택하세요', r ? `IoU ${r.iou.toFixed(2)} · F1 ${r.f1.toFixed(2)} · ${r.date}` : '발행할 학습 결과', { on: false, has: !!r, disabled: !p, src: r ? p.thumb : undefined })
    + cardHtml('analysis', 3, '분석 결과', '선택', n ? `${n}건 선택됨` : r ? '잘 된 분석 결과를 선택해 주세요' : '학습 결과 선택 후 추가', '잘 된 분석 결과를 선택해 주세요', { on: n > 0, disabled: !r, src: n ? anThumb(D.analysisCandidates(st.pid).findIndex((a) => a.id === st.analyses[0].id)) : undefined });
}

/* ── 과제 유형 + 과제 정보 ── */
function capture() { for (const id of ['rq-task', 'rq-task-sel', 'rq-model', 'rq-intro', 'rq-purpose']) { const el = $(`#${id}`); if (el) st.info[id] = el.value; } }
function thumbs() {
  const p = pj(), enh = st.type === 'enhance';
  return { dash: st.info.dash ?? (enh && p ? (p.thumbClean || p.thumb) : ''), card: st.info.card ?? (enh && p ? p.thumb : '') };   // 원본: 고도화 = 기존 과제의 썸네일을 프리필
}
function infoFields(readOnly) {
  const p = pj(), t = thumbs(), intro = st.info['rq-intro'] ?? p?.desc ?? '', purpose = st.info['rq-purpose'] ?? p?.purpose ?? '';
  const auto = (k, v, c) => `<div class="${c}"><p class="flab">${k}<em class="tag tag--auto">자동</em></p><div class="auto">${v ? esc(v) : '<span style="color:var(--grey)">프로젝트 선택 시 자동 입력</span>'}</div></div>`;
  const th = (id, label, hint, src, c) => `<div class="${c}" id="${id}-f"><p class="flab">${label}${readOnly ? '' : '<em class="req">*</em>'}</p><div data-pv>${src ? fig(src, { alt: label }) : '<figure class="imgcard imgcard--none"><span>이미지 없음</span></figure>'}</div>
    ${readOnly ? '' : `<div class="pickrow"><input type="file" id="${id}" accept=".jpg,.jpeg,.png" hidden aria-label="${label} 파일"><button type="button" class="link-b" data-thumb="${id}">이미지 선택 ›</button><span class="mic n">${hint}</span></div><p class="err" role="alert" hidden>이미지를 선택해 주세요.</p>`}</div>`;
  return `<div class="rq-info">${auto('탐지 형태', p?.type, 'c3')}${auto('데이터 유형', p ? D.dataTypeLabel(p.dataType) : '', 'c3')}<div class="c6"><p class="flab">클래스<em class="tag tag--auto">자동</em></p>${p ? classChips(p.classes) : '<div class="auto"><span style="color:var(--grey)">프로젝트 선택 시 자동 출력</span></div>'}</div>
    ${th('rq-dash', '대시보드 썸네일 이미지', 'JPG, PNG · 권장 크기 300x260', t.dash, 'c2')}${th('rq-card', '카드 썸네일 이미지', 'JPG, PNG · 권장 크기 480x320', t.card, 'c3')}
    ${readOnly ? `<div class="c6 rq-read" style="grid-column:span 7"><p class="flab">소개</p><p>${esc(intro) || '—'}</p><p class="flab" style="margin-top:14px">개발 목적</p><p>${esc(purpose) || '—'}</p></div>`
    : `<div style="grid-column:span 7"><p class="flab"><label for="rq-intro">소개</label><span class="sp"></span><span class="cnt" data-for="rq-intro"></span></p><textarea class="inp" id="rq-intro" maxlength="1000" placeholder="서비스 소개를 입력해 주세요.">${esc(intro)}</textarea>
       <p class="flab" style="margin-top:12px"><label for="rq-purpose">개발 목적</label><span class="sp"></span><span class="cnt" data-for="rq-purpose"></span></p><textarea class="inp" id="rq-purpose" maxlength="1000" placeholder="개발 목적을 입력해 주세요.">${esc(purpose)}</textarea></div>`}</div>
    ${readOnly && (t.dash || t.card) ? '<p class="mic" style="margin:8px 0 0">기존 이미지 · 고도화 시 자동 프리필</p>' : ''}`;
}
function drawForm() {
  const p = pj(), enh = st.type === 'enhance';
  const taskSel = `<span class="sel"><select id="rq-task-sel" aria-describedby="rq-task-sel-e"><option value="">기존 과제를 선택해 주세요</option>${Object.values(D.PROJECTS).map((x) => `<option${(st.info['rq-task-sel'] ?? p?.name) === x.name ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></span><p class="err" id="rq-task-sel-e" role="alert" hidden>기존 과제를 선택해 주세요.</p>`;
  const taskInp = `<input class="inp" id="rq-task" maxlength="200" placeholder="예: 도로안전 정사영상" value="${esc(st.info['rq-task'] ?? p?.name ?? '')}" aria-describedby="rq-task-e"><p class="err" id="rq-task-e" role="alert" hidden>과제명을 입력해 주세요.</p>`;
  $('#rq-form').innerHTML = `<div class="rq-row">
      <div><p class="flab" id="rq-tl">과제 유형</p><fieldset class="rq-type" aria-labelledby="rq-tl"><label class="rd"><input type="radio" name="rq-type" value="new"${enh ? '' : ' checked'}>신규 과제</label><label class="rd"><input type="radio" name="rq-type" value="enhance"${enh ? ' checked' : ''}>과제 고도화</label></fieldset></div>
      <div><p class="flab"><label for="${enh ? 'rq-task-sel' : 'rq-task'}">과제명</label><em class="req">*</em></p>${enh ? taskSel : taskInp}</div>
      <div><p class="flab"><label for="rq-model">모델명</label><em class="req">*</em></p><input class="inp inp--num" id="rq-model" maxlength="200" placeholder="${enh ? '예: v2.0' : '예: v1.0'}" value="${esc(st.info['rq-model'] ?? '')}" aria-describedby="rq-model-e"><p class="err" id="rq-model-e" role="alert" hidden>모델명을 입력해 주세요.</p></div></div>
    ${enh ? `<p class="rq-hint">선택한 과제의 정보를 재사용하며, 새 모델만 추가합니다. 과제 정보 변경이 필요하면 아래 [과제 정보 수정]을 열어 주세요.</p>
      <div class="rq-acc"><button type="button" class="rq-acc-h" id="rq-acc-t" aria-expanded="${st.editOpen}" aria-controls="rq-acc-b">과제 정보 수정<span class="mic">탐지 형태 · 데이터 유형 · 소개 · 개발 목적 · 썸네일 2 · 클래스 — 기존 값 유지</span>${icon('chevD', 14)}</button>${st.editOpen ? `<div class="rq-acc-b" id="rq-acc-b">${infoFields(false)}</div>` : ''}</div>${st.editOpen ? '' : infoFields(true)}`
    : infoFields(false)}`;
  bindCounters($('#rq-form'));
}

/* ── 선택 모달 ── */
function pickProject() {
  const m = openModal({ title: '내 프로젝트 선택', width: 480, content: `<div role="group" aria-label="내 프로젝트">${Object.entries(D.PROJECTS).map(([k, p]) => `<button type="button" class="pk" data-pid="${k}"${k === st.pid ? ' aria-current="true"' : ''}><b>${esc(p.name)}</b><span>${esc(p.type)} · ${D.dataTypeLabel(p.dataType)}</span></button>`).join('')}</div>` });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('.pk'); if (!b) return;
    if (st.pid !== b.dataset.pid) { st.result = null; st.analyses = []; for (const k of ['rq-task', 'rq-task-sel', 'rq-intro', 'rq-purpose', 'dash', 'card']) delete st.info[k]; }
    st.pid = b.dataset.pid; m.close(); after('project');
  });
}
function pickResult() {
  const list = D.TRAIN[st.pid] || [];
  const m = openModal({ title: '학습 결과 선택', width: 480, content: list.length ? `<div role="group" aria-label="학습 결과">${list.map((r, i) => `<button type="button" class="pk" data-i="${i}"${st.result?.id === r.id ? ' aria-current="true"' : ''}><b>${esc(r.labeling)}</b><span class="n">${esc(r.date)} · F1 ${r.f1}</span></button>`).join('')}</div>` : '<div class="empty empty--s">학습 결과가 없습니다</div>' });
  m.el.addEventListener('click', (e) => { const b = e.target.closest('.pk'); if (!b) return; const r = list[+b.dataset.i]; if (st.result?.id !== r.id) st.analyses = []; st.result = r; m.close(); after('result'); });
}
function pickAnalyses() {
  const list = D.analysisCandidates(st.pid), chosen = st.analyses.map((a) => a.id);
  const m = openModal({ title: '분석 결과', tag: '시연', width: 440,
    content: `<p class="pick-note">잘 된 분석 결과를 선택해 관리자가 검증할 수 있도록 해 주세요.</p>${list.length ? list.map((r, i) => `<label class="pk-an"><input type="checkbox" value="${r.id}"${chosen.includes(r.id) ? ' checked' : ''}>${fig(anThumb(i), { alt: '' })}<span><b>${esc(r.name)}</b><span class="n">${esc(r.region)} · ${esc(r.date)} · ${r.dets}건 탐지</span></span></label>`).join('') : '<div class="empty empty--s">완료된 분석 결과가 없습니다</div>'}`,
    actions: [{ label: '취소', kind: 'bracket' }, { label: '적용', kind: 'primary', onClick: (c) => { const ids = $$('input:checked', c.el).map((x) => x.value); st.analyses = list.filter((r) => ids.includes(r.id)); after('analysis'); } }] });
  const sum = document.createElement('span'); sum.className = 'pk-sum'; sum.setAttribute('aria-live', 'polite'); $('.modal-f', m.el).prepend(sum);
  const draw = () => { sum.innerHTML = `선택 <b class="n">${$$('input:checked', m.el).length}</b>건`; }; draw();
  m.el.addEventListener('change', draw);
}
function after(kind) { drawPicks(); drawForm(); syncUrl(); $('#rq-perr').hidden = true; requestAnimationFrame(() => $(`.rq-p[data-pick="${kind}"]`)?.focus()); }

/* ── 이벤트 ── */
const form = $('#rq');
$('#rq-picks').addEventListener('click', (e) => { const b = e.target.closest('.rq-p'); if (!b || b.disabled) return; capture(); ({ project: pickProject, result: pickResult, analysis: pickAnalyses })[b.dataset.pick](); });
form.addEventListener('change', (e) => {
  if (e.target.name === 'rq-type') { capture(); st.type = e.target.value; drawForm(); syncUrl(); $(`input[name="rq-type"][value="${st.type}"]`).focus(); return; }
  if (e.target.type === 'file' && e.target.files[0]) { const key = e.target.id === 'rq-dash' ? 'dash' : 'card', rd = new FileReader(); rd.onload = () => { capture(); st.info[key] = rd.result; drawForm(); $(`[data-thumb="${e.target.id}"]`)?.focus(); }; rd.readAsDataURL(e.target.files[0]); }
  const er = $(`#${e.target.id}-e`); if (er) { er.hidden = true; e.target.removeAttribute('aria-invalid'); }
});
form.addEventListener('input', (e) => { const er = $(`#${e.target.id}-e`); if (er) { er.hidden = true; e.target.removeAttribute('aria-invalid'); } });
form.addEventListener('click', (e) => {
  const t = e.target.closest('[data-thumb]'); if (t) $(`#${t.dataset.thumb}`).click();
  if (e.target.closest('#rq-acc-t')) { capture(); st.editOpen = !st.editOpen; drawForm(); syncUrl(); $('#rq-acc-t').focus(); }
});
form.addEventListener('submit', (e) => {
  e.preventDefault(); capture();
  const miss = !st.pid ? ['project', '프로젝트를 선택해 주세요'] : !st.result ? ['result', '학습 결과를 선택해 주세요'] : null;
  $$('.rq-p').forEach((b) => b.removeAttribute('aria-invalid'));
  if (miss) { const b = $(`.rq-p[data-pick="${miss[0]}"]`); b.setAttribute('aria-invalid', 'true'); const er = $('#rq-perr'); er.textContent = miss[1]; er.hidden = false; (b.disabled ? $('.rq-p[data-pick="project"]') : b).focus(); return; }
  const enh = st.type === 'enhance', taskId = enh ? 'rq-task-sel' : 'rq-task'; let first = null;
  for (const id of [taskId, 'rq-model']) { const el = $(`#${id}`), bad = !el.value.trim(); $(`#${id}-e`).hidden = !bad; if (bad) { el.setAttribute('aria-invalid', 'true'); first ||= el; } }
  const t = thumbs();
  if (!enh) for (const [id, v] of [['rq-dash', t.dash], ['rq-card', t.card]]) { const er = $(`#${id}-f .err`); if (er) er.hidden = !!v; if (!v) first ||= $(`[data-thumb="${id}"]`); }
  if (first) { first.focus(); return; }
  const p = pj(), task = $(`#${taskId}`).value.trim(), model = $('#rq-model').value.trim(), now = new Date(), z = (n) => String(n).padStart(2, '0');
  const id = D.addRequest({ card: `${task} ${model}`, type: enh ? '과제 고도화' : '신규 과제', project: p.name, training: st.result.labeling, model, perms: [], requester: '홍○○', masked: true,
    date: `${now.getFullYear()}.${z(now.getMonth() + 1)}.${z(now.getDate())} ${z(now.getHours())}:${z(now.getMinutes())}`, status: '대기', intro: (st.info['rq-intro'] ?? p.desc ?? '').trim(), purpose: (st.info['rq-purpose'] ?? p.purpose ?? '').trim(),
    ...(t.card ? { cardThumb: t.card } : {}), ...(t.dash ? { dashThumb: t.dash } : {}), analyses: st.analyses.map((a) => a.name) });
  say('카드 발행을 요청했습니다.'); $('button[type="submit"]', form).disabled = true;
  setTimeout(() => { location.href = `admin-publish.html?open=${id}`; }, 700);
});

drawPicks(); drawForm();
