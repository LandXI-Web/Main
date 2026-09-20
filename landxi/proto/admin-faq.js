/* 서비스 관리 › 자주 묻는 질문 관리 — 원판 B6-Admin-Faq{,-Form} · 원본 landxi7/admin-faq.html 1:1.
   SPLIT: 좌 목록(체크/구분/제목/등록자/등록 일시) + 우 질문 열람(Q/A). 등록 · 수정 = 집중 모드.
   URL: ?id= 선택 · panel=off · mode=new|edit · cat= 구분 패싯 · field/kw 검색 · page/size. */
import { say, confirmDialog, openModal, mountPager, bindRows, bindCounters, icon, esc, $, $$ } from './shell.js';
import { mountAdmin, loadStore, saveStore, urlState, facetBand, searchBtns, nowIso, dt, swapIn, cleanHtml, isBlankHtml, rteHtml, bindRte, makeAskUrl, mountAttach, attachView, metaFoot, fitRows, watchFit } from './admin.js';
import { FAQ_CAT } from './admin-data.js';

const { main } = mountAdmin('faq');
const url = urlState({ id: 0, panel: '', mode: '', cat: 'all', field: 'all', kw: '', page: 1, size: 10 });
let list = loadStore('faqs');
let S = url.read();
let pager, files = [], keepPage = false;
const askUrl = makeAskUrl(openModal);
const byId = (id) => list.find((n) => n.id === id);
const formMode = () => S.mode === 'new' || (S.mode === 'edit' && !!byId(S.id));
const strip = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; };

function filtered() {
  const kw = S.kw.toLowerCase();
  return list.filter((n) => {
    if (S.cat !== 'all' && n.category !== S.cat) return false;
    if (!kw) return true;
    const q = (n.question || '').toLowerCase(), a = strip(n.answer).toLowerCase();
    return S.field === 'question' ? q.includes(kw) : S.field === 'answer' ? a.includes(kw) : q.includes(kw) || a.includes(kw);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

main.insertAdjacentHTML('beforeend', `
<div id="band"></div>
<form class="filters" id="search" role="search" aria-label="자주 묻는 질문 검색" novalidate>
  <span class="f-lab">검색어</span>
  <span class="sel"><select name="field" aria-label="검색 대상"><option value="all">전체</option><option value="question">질문</option><option value="answer">답변</option></select></span>
  <input class="inp" name="kw" placeholder="검색어 — 질문 · 답변" aria-label="검색어">${searchBtns}
</form>
<div class="work"><div class="split" id="split">
  <section class="split-l" aria-label="질문 목록">
    <div class="tbl-wrap"><table class="tbl" id="tbl" aria-label="질문 목록 — 등록 일시 내림차순"></table></div>
    <div class="empty" id="list-empty" hidden><p class="empty-t">검색 조건에 맞는 질문이 없습니다.</p><p class="empty-w">초기화로 전체 목록 복귀</p></div>
    <nav id="pager" aria-label="질문 목록 페이지"></nav>
  </section>
  <aside class="split-r panel" id="panel" aria-label="질문 열람" aria-live="polite"></aside>
</div></div>`);

const form = $('#search'), tbl = $('#tbl'), panel = $('#panel');
pager = mountPager($('#pager'), { total: 0, page: S.page, size: S.size, onChange: ({ page, size }) => { S.page = page; S.size = S._pref = size; if (!formMode()) S.id = 0; keepPage = true; commit(); keepPage = false; } });
bindRows(tbl, (row) => { S.id = +row.dataset.id; S.mode = ''; S.panel = ''; commit(); $(`tr[data-id="${S.id}"]`)?.focus(); });

function drawBand() {
  $('#band').innerHTML = facetBand([{ label: '자주 묻는 질문 · 구분', items: [{ id: 'all', n: list.length, unit: '전체', on: S.cat === 'all' }, ...Object.entries(FAQ_CAT).map(([k, l]) => ({ id: k, n: list.filter((f) => f.category === k).length, unit: l, on: S.cat === k }))] }],
    '<button type="button" class="btn-br" style="width:110px" id="del-sel">선택 삭제</button><button type="button" class="btn" style="width:120px" id="new">+ 등록</button>');
}
$('#band').addEventListener('click', async (e) => {
  const f = e.target.closest('[data-facet]');
  if (f) { S.cat = S.cat === f.dataset.facet ? 'all' : f.dataset.facet; S.page = 1; S.id = 0; S.panel = ''; commit(); $(`[data-facet="${f.dataset.facet}"]`)?.focus(); return; }
  if (e.target.closest('#new')) { S.mode = 'new'; S.id = 0; commit(); return; }
  if (e.target.closest('#del-sel')) {
    const ids = $$('.row-ck:checked', tbl).map((c) => +c.value);
    if (!ids.length) { say('삭제할 항목을 선택해 주세요.'); return; }
    if (!await confirmDialog({ title: '선택 삭제', body: `${ids.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, okLabel: '삭제', danger: true })) return;
    list = list.filter((n) => !ids.includes(n.id)); saveStore('faqs', list); S.id = 0; commit(false); say(`질문 ${ids.length}건을 삭제했습니다 · 시연`); $('#new')?.focus();
  }
});
form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(S, { field: form.elements.field.value, kw: form.elements.kw.value.trim(), page: 1, id: 0, panel: '' }); commit(); const n = filtered().length; say(n ? `질문 ${n}건` : '검색 조건에 맞는 질문이 없습니다.'); });
form.addEventListener('reset', (e) => { e.preventDefault(); Object.assign(S, { field: 'all', kw: '', cat: 'all', page: 1, id: 0, panel: '' }); commit(); form.elements.kw.focus(); });

function drawList() {
  const focus = formMode(), all = filtered(), pages = Math.max(1, Math.ceil(all.length / S.size));
  S.page = Math.min(Math.max(1, S.page), pages);
  if (S.id && !byId(S.id)) S.id = 0;
  const at = all.findIndex((n) => n.id === S.id);
  if (S.id && at >= 0 && Math.floor(at / S.size) + 1 !== S.page && !keepPage) S.page = Math.floor(at / S.size) + 1;
  const page = all.slice((S.page - 1) * S.size, S.page * S.size);
  if (!S.id && !focus && S.panel !== 'off' && page.length) S.id = page[0].id;
  const clip = (f) => ((f.attachments || []).length ? icon('clip', 14) : '');
  tbl.className = focus ? 'tbl tbl--c' : 'tbl';
  tbl.innerHTML = focus
    ? `<thead><tr><th scope="col">질문 목록 · <span class="n">${all.length}</span>건</th></tr></thead><tbody>${page.map((f) => `<tr data-row data-id="${f.id}" tabindex="0" aria-selected="${f.id === S.id}"><td><span class="c1"><span class="t">${esc(f.question)}</span></span><span class="c2">${esc(FAQ_CAT[f.category] || '-')} · <span class="n">${dt(f.createdAt)}</span>${(f.attachments || []).length ? ' · 첨부 ' + f.attachments.length : ''}</span></td></tr>`).join('')}</tbody>`
    : `<colgroup><col style="width:34px"><col style="width:104px"><col><col style="width:58px"><col style="width:152px"></colgroup>
<thead><tr><th scope="col"><label class="ck"><input type="checkbox" id="ck-all" aria-label="이 쪽 전체 선택"></label></th><th scope="col">구분</th><th scope="col">제목</th><th scope="col">등록자</th><th scope="col">등록 일시</th></tr></thead>
<tbody>${page.map((f) => `<tr data-row data-id="${f.id}" tabindex="0" aria-selected="${f.id === S.id}"><td><label class="ck"><input type="checkbox" class="row-ck" value="${f.id}" aria-label="${esc(f.question)} 선택"></label></td><td class="g">${esc(FAQ_CAT[f.category] || '-')}</td><td>${esc(f.question)}${clip(f)}</td><td>${esc(f.author || '-')}</td><td class="num"><span class="n">${dt(f.createdAt)}</span></td></tr>`).join('')}</tbody>`;
  $('#list-empty').hidden = !!all.length;
  $('#pager').classList.toggle('pager--c', focus);
  pager.set({ total: all.length, page: S.page, size: S.size });
  fitRows(S, drawList);          // 남은 높이에 맞춰 한 쪽 행 수를 맞춘다(admin.js 주석)
}
tbl.addEventListener('change', (e) => { if (e.target.id === 'ck-all') $$('.row-ck', tbl).forEach((c) => { c.checked = e.target.checked; }); });

function drawView(animate) {
  const f = byId(S.id);
  panel.setAttribute('aria-label', '질문 열람');
  if (!f) { panel.innerHTML = '<header class="panel-h"><h2>질문 열람</h2></header><div class="empty"><p class="empty-t">선택된 질문이 없습니다</p><p class="empty-w">목록에서 행을 고르면 여기서 열람 · 수정 · 삭제</p></div>'; return; }
  panel.innerHTML = `
<header class="panel-h"><h2>질문 열람</h2><span class="sp"></span><span class="n no">No. ${f.id}</span></header>
<div class="panel-b" id="panel-b">
  <p class="f-cat" style="margin:0">${esc(FAQ_CAT[f.category] || '-')}<span class="mic">구분</span></p>
  <div class="f-q"><span class="d" aria-hidden="true">Q</span><h3>${esc(f.question)}</h3></div>
  <div class="f-a grow"><span class="d" aria-hidden="true">A</span><div class="body-html" tabindex="0" role="region" aria-label="답변">${cleanHtml(f.answer)}</div></div>
  <div class="f-att n-att"><span class="k">첨부 파일</span><div class="v">${attachView(f.attachments)}</div></div>
  ${metaFoot(f)}
</div>
<footer class="panel-f"><button type="button" class="btn-br" data-act="list" style="margin-right:auto">목록</button><button type="button" class="btn-br" data-act="delete">삭제</button><button type="button" class="btn" data-act="edit">수정</button></footer>`;
  if (animate) swapIn($('#panel-b'));
}

const ERR = { cat: '구분을 선택해 주세요.', question: '제목을 입력해 주세요.', answer: '내용을 입력해 주세요.' };
const ERR_EL = { cat: '#f-cat', question: '#f-question', answer: '#f-answer' };
function drawForm() {
  const f = S.mode === 'edit' ? byId(S.id) : null;
  files = f ? structuredClone(f.attachments || []) : [];
  panel.setAttribute('aria-label', f ? '질문 수정' : '질문 등록');
  panel.innerHTML = `
<header class="panel-h"><h2>${f ? '질문 수정' : '질문 등록'}</h2><span class="sp"></span>${f ? `<span class="n no">No. ${f.id}</span>` : '<span class="req-note"><em>*</em> 필수 입력</span>'}</header>
<form class="panel-b fm is-in" id="fm" novalidate style="gap:14px">
  <div class="row">
    <div class="field" style="width:168px;flex:none"><div class="field-h"><label class="field-l" for="f-cat">구분<em class="req">*</em></label></div><span class="sel"><select id="f-cat" aria-describedby="e-cat"><option value="">선택</option>${Object.entries(FAQ_CAT).map(([k, l]) => `<option value="${k}"${f && f.category === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span><p class="err" id="e-cat" hidden>${ERR.cat}</p></div>
    <div class="field" style="flex:1"><div class="field-h"><label class="field-l" for="f-question">제목<em class="req">*</em></label><span class="cnt" data-for="f-question"></span></div><input id="f-question" class="inp" maxlength="200" placeholder="질문을 입력해 주세요." value="${esc(f ? f.question : '')}" aria-describedby="e-question"><p class="err" id="e-question" hidden>${ERR.question}</p></div>
  </div>
  <div class="field grow"><div class="field-h"><span class="field-l">내용<em class="req">*</em></span></div>${rteHtml({ id: 'f-answer', label: '내용', placeholder: '답변을 입력하세요', html: f ? f.answer : '', describedby: 'e-answer' })}<p class="err" id="e-answer" hidden>${ERR.answer}</p></div>
  <div class="field"><div class="field-h"><span class="field-l">첨부 파일</span></div><div id="f-att"></div></div>
</form>
<footer class="panel-f"><button type="button" class="btn-br" data-act="cancel">취소</button><button type="button" class="btn" data-act="save">저장</button></footer>`;
  const fm = $('#fm');
  bindCounters(fm); bindRte(fm, askUrl); mountAttach($('#f-att'), files);
  for (const ev of ['input', 'change']) fm.addEventListener(ev, (e) => { const k = Object.keys(ERR_EL).find((x) => ERR_EL[x] === '#' + e.target.id); if (k) clearErr(k); });
  fm.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  $('#f-cat')?.focus();
}
function setErr(k) { $('#e-' + k).hidden = false; const el = $(ERR_EL[k]); el.setAttribute('aria-invalid', 'true'); el.closest('.rte')?.setAttribute('aria-invalid', 'true'); }
function clearErr(k) { const p = $('#e-' + k); if (!p || p.hidden) return; p.hidden = true; const el = $(ERR_EL[k]); el.removeAttribute('aria-invalid'); el.closest('.rte')?.removeAttribute('aria-invalid'); }
function save() {
  const v = { cat: $('#f-cat').value, question: $('#f-question').value.trim(), answer: cleanHtml($('#f-answer').innerHTML) };
  Object.keys(ERR).forEach(clearErr);
  const bad = []; if (!v.cat) bad.push('cat'); if (!v.question) bad.push('question'); if (isBlankHtml(v.answer)) bad.push('answer');
  if (bad.length) { bad.forEach(setErr); $(ERR_EL[bad[0]]).focus(); say(`입력을 확인해 주세요 — ${bad.length}곳`); return; }
  const rec = { category: v.cat, question: v.question, answer: v.answer, attachments: files.slice() };
  const old = S.mode === 'edit' ? byId(S.id) : null;
  if (old) Object.assign(old, rec, { updater: '관리자', updatedAt: nowIso(list) });
  else { const id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1; list.unshift({ id, ...rec, author: '관리자', createdAt: nowIso(list), updater: '', updatedAt: '' }); S.id = id; Object.assign(S, { cat: 'all', field: 'all', kw: '', page: 1 }); }
  saveStore('faqs', list); S.mode = ''; S.panel = ''; commit(); say(old ? '질문을 수정했습니다 · 시연' : '질문을 등록했습니다 · 시연');
  $(`tr[data-id="${S.id}"]`)?.focus();
}

panel.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'list') { S.id = 0; S.panel = 'off'; commit(); $('tr[data-row]')?.focus(); }
  if (act === 'edit') { S.mode = 'edit'; commit(); }
  if (act === 'cancel') { S.mode = ''; commit(); ($('[data-act="edit"]') || $('#new'))?.focus(); }
  if (act === 'save') save();
  if (act === 'delete') {
    if (!await confirmDialog({ title: '확인', body: '이 질문/답변을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', okLabel: '삭제', danger: true })) return;
    list = list.filter((n) => n.id !== S.id); saveStore('faqs', list); S.id = 0; commit(false); say('질문을 삭제했습니다 · 시연'); $('tr[data-row]')?.focus();
  }
});

function render(animate) {
  if (S.mode === 'edit' && !byId(S.id)) S.mode = '';
  const focus = formMode();
  $('#band').hidden = focus; form.hidden = focus;
  $('#split').classList.toggle('split--form', focus); $('#split').dataset.mode = focus ? 'focus' : '';
  if (!focus) { drawBand(); form.elements.field.value = S.field; form.elements.kw.value = S.kw; }
  drawList();
  if (focus) drawForm(); else drawView(animate);
}
function commit(push = true) { render(true); url.write(S, push); }
addEventListener('popstate', () => { S = url.read(); render(true); });

render();
url.write(S, false);

/* 창 크기가 바뀌면 한 쪽 행 수를 다시 맞춘다(모니터마다 최적화) */
watchFit(() => { if (!S._pref) { S.size = 10; drawList(); } });
