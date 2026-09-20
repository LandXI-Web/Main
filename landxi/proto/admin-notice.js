/* 서비스 관리 › 공지사항 관리 — 원판 B6-Admin-Notice{,-Form,-Form-Error,-Delete} · 원본 landxi7/admin-notice.html 1:1.
   SPLIT: 좌 목록(체크/구분/제목/게시 시작~종료/등록자/등록 일시) + 우 열람 판. 등록 · 수정 = 집중 모드(밴드 · 검색 행을 걷고 목록 2줄 축약 560 / 폼 656).
   URL: ?id= 선택 · panel=off 열람 닫기 · mode=new|edit · cat= 구분 패싯 · field/kw/from/to/q 검색 · page/size. */
import { say, confirmDialog, openModal, mountPager, bindRows, bindCounters, esc, $, $$ } from './shell.js';
import { mountAdmin, loadStore, saveStore, urlState, facetBand, periodHtml, searchBtns, bindPeriod, quickOf, nowIso, dt, swapIn, INF,
  tlBar, tlBig, popupLive, cleanHtml, isBlankHtml, rteHtml, bindRte, makeAskUrl, mountAttach, attachView, metaFoot, weeksAhead, fitRows, watchFit } from './admin.js';
import { NOTICE_CAT } from './admin-data.js';

const { main } = mountAdmin('notice');
const url = urlState({ id: 0, panel: '', mode: '', cat: 'all', field: 'all', kw: '', from: '', to: '', q: 0, page: 1, size: 10 });
let list = loadStore('notices');
let S = url.read();
let pager, files = [], keepPage = false;
const askUrl = makeAskUrl(openModal);
const byId = (id) => list.find((n) => n.id === id);
const catWord = (c) => (c === 'urgent' ? '<span class="st st--warn">긴급</span>' : `<span class="g">${NOTICE_CAT[c] || '-'}</span>`);
const short = (iso) => iso.substring(2, 10).replace(/-/g, '.');
const periodTxt = (n, s) => `${s ? short(n.startAt) : dt(n.startAt)} ~ ${n.endAt === INF ? '무한 게시' : s ? short(n.endAt) : dt(n.endAt)}`;
const formMode = () => S.mode === 'new' || (S.mode === 'edit' && !!byId(S.id));

function filtered() {
  const kw = S.kw.toLowerCase(), has = (s) => (s || '').toLowerCase().includes(kw);
  return list.filter((n) => (S.cat === 'all' || n.category === S.cat)
    && (!kw || (S.field === 'title' ? has(n.title) : S.field === 'content' ? has(n.content) : S.field === 'author' ? has(n.author) : has(n.title) || has(n.content) || has(n.author)))
    && (!S.from || n.createdAt.slice(0, 10) >= S.from) && (!S.to || n.createdAt.slice(0, 10) <= S.to))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

main.insertAdjacentHTML('beforeend', `
<div id="band"></div>
<form class="filters" id="search" role="search" aria-label="공지사항 검색" novalidate>
  <span class="f-lab">검색어</span>
  <span class="sel"><select name="field" aria-label="검색 대상"><option value="all">전체</option><option value="title">제목</option><option value="content">내용</option><option value="author">등록자</option></select></span>
  <input class="inp" name="kw" placeholder="검색어" aria-label="검색어">
  <span id="period" class="contents"></span>${searchBtns}
</form>
<div class="work"><div class="split" id="split">
  <section class="split-l" aria-label="공지사항 목록">
    <div class="tbl-wrap"><table class="tbl" id="tbl" aria-label="공지사항 목록 — 등록 일시 내림차순"></table></div>
    <div class="empty" id="list-empty" hidden><p class="empty-t">검색 조건에 맞는 공지사항이 없습니다.</p><p class="empty-w">초기화로 전체 목록 복귀</p></div>
    <nav id="pager" aria-label="공지사항 목록 페이지"></nav>
  </section>
  <aside class="split-r panel" id="panel" aria-label="공지사항 열람" aria-live="polite"></aside>
</div></div>`);

const form = $('#search'), tbl = $('#tbl'), panel = $('#panel');
pager = mountPager($('#pager'), { total: 0, page: S.page, size: S.size, onChange: ({ page, size }) => { S.page = page; S.size = S._pref = size; if (!formMode()) S.id = 0; keepPage = true; commit(); keepPage = false; } });
bindRows(tbl, (row) => { S.id = +row.dataset.id; S.mode = ''; S.panel = ''; commit(); $(`tr[data-id="${S.id}"]`)?.focus(); });

function drawBand() {
  const n = (c) => list.filter((x) => x.category === c).length;
  $('#band').innerHTML = facetBand([
    { label: '공지사항', w: 194, items: [{ id: 'all', n: list.length, unit: '건 전체', on: S.cat === 'all' }] },
    { label: '구분', items: [{ id: 'urgent', n: n('urgent'), unit: '긴급', tone: 'warn', on: S.cat === 'urgent' }, { id: 'general', n: n('general'), unit: '일반', on: S.cat === 'general' }, { id: 'work', n: n('work'), unit: '업무', on: S.cat === 'work' }] },
  ], '<button type="button" class="btn-br" style="width:110px" id="del-sel">선택 삭제</button><button type="button" class="btn" style="width:120px" id="new">+ 등록</button>');
}
$('#band').addEventListener('click', async (e) => {
  const f = e.target.closest('[data-facet]');
  if (f) { S.cat = S.cat === f.dataset.facet ? 'all' : f.dataset.facet; S.page = 1; S.id = 0; S.panel = ''; commit(); $(`[data-facet="${f.dataset.facet}"]`)?.focus(); return; }
  if (e.target.closest('#new')) { S.mode = 'new'; S.id = 0; commit(); return; }
  if (e.target.closest('#del-sel')) {
    const ids = $$('.row-ck:checked', tbl).map((c) => +c.value);
    if (!ids.length) { say('삭제할 항목을 선택해 주세요.'); return; }
    if (!await confirmDialog({ title: '선택 삭제', body: `${ids.length}개 항목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`, okLabel: '삭제', danger: true })) return;
    list = list.filter((n) => !ids.includes(n.id)); saveStore('notices', list); S.id = 0; commit(false); say(`공지사항 ${ids.length}건을 삭제했습니다 · 시연`); $('#new')?.focus();
  }
});

function fillForm() { form.elements.field.value = S.field; form.elements.kw.value = S.kw; $('#period').innerHTML = periodHtml('게시 기간', S); }
bindPeriod(form);
form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(S, { field: form.elements.field.value, kw: form.elements.kw.value.trim(), from: form.elements.from.value, to: form.elements.to.value, q: quickOf(form), page: 1, id: 0, panel: '' }); commit(); const n = filtered().length; say(n ? `공지사항 ${n}건` : '검색 조건에 맞는 공지사항이 없습니다.'); });
form.addEventListener('reset', (e) => { e.preventDefault(); Object.assign(S, { field: 'all', kw: '', from: '', to: '', q: 0, cat: 'all', page: 1, id: 0, panel: '' }); commit(); form.elements.kw.focus(); });

function drawList() {
  const focus = formMode(), all = filtered(), pages = Math.max(1, Math.ceil(all.length / S.size));
  S.page = Math.min(Math.max(1, S.page), pages);
  if (S.id && !byId(S.id)) S.id = 0;
  const at = all.findIndex((n) => n.id === S.id);
  if (S.id && at >= 0 && Math.floor(at / S.size) + 1 !== S.page && !keepPage) S.page = Math.floor(at / S.size) + 1;
  const page = all.slice((S.page - 1) * S.size, S.page * S.size);
  if (!S.id && !focus && S.panel !== 'off' && page.length) S.id = page[0].id;
  const pop = (n) => (popupLive(n) ? '<span class="pop">팝업</span>' : '');
  tbl.className = focus ? 'tbl tbl--c' : 'tbl';
  tbl.innerHTML = focus
    ? `<thead><tr><th scope="col">공지사항 목록 · <span class="n">${all.length}</span>건 — 게시 기간 막대: 파랑 = 게시 중 · 회색 = 종료 · 세로선 = 기준일</th></tr></thead><tbody>${page.map((n) => `<tr data-row data-id="${n.id}" tabindex="0" aria-selected="${n.id === S.id}"><td><span class="c1"><span class="k">${catWord(n.category)}</span><span class="t">${esc(n.title)}</span>${pop(n)}</span><span class="c2 c2--in"><span class="n per-t">${periodTxt(n, true)}</span>${tlBar(n)}</span></td></tr>`).join('')}</tbody>`
    : `<colgroup><col style="width:34px"><col style="width:48px"><col><col style="width:170px"><col style="width:58px"><col style="width:152px"></colgroup>
<thead><tr><th scope="col"><label class="ck"><input type="checkbox" id="ck-all" aria-label="이 쪽 전체 선택"></label></th><th scope="col">구분</th><th scope="col">제목</th><th scope="col">게시 시작 ~ 게시 종료</th><th scope="col">등록자</th><th scope="col">등록 일시</th></tr></thead>
<tbody>${page.map((n) => `<tr data-row data-id="${n.id}" tabindex="0" aria-selected="${n.id === S.id}"><td><label class="ck"><input type="checkbox" class="row-ck" value="${n.id}" aria-label="${esc(n.title)} 선택"></label></td><td>${catWord(n.category)}</td><td>${esc(n.title)}${pop(n)}</td><td><span class="per"><span class="n">${periodTxt(n, true)}</span>${tlBar(n)}</span></td><td>${esc(n.author || '-')}</td><td class="num"><span class="n">${dt(n.createdAt)}</span></td></tr>`).join('')}</tbody>`;
  $('#list-empty').hidden = !!all.length;
  $('#pager').classList.toggle('pager--c', focus);
  pager.set({ total: all.length, page: S.page, size: S.size });
  fitRows(S, drawList);          // 남은 높이에 맞춰 한 쪽 행 수를 맞춘다(admin.js 주석)
}
tbl.addEventListener('change', (e) => { if (e.target.id === 'ck-all') $$('.row-ck', tbl).forEach((c) => { c.checked = e.target.checked; }); });

function drawView(animate) {
  const n = byId(S.id);
  panel.setAttribute('aria-label', '공지사항 열람');
  if (!n) { panel.innerHTML = '<header class="panel-h"><h2>공지사항 열람</h2></header><div class="empty"><p class="empty-t">선택된 공지사항이 없습니다</p><p class="empty-w">목록에서 행을 고르면 여기서 열람 · 수정 · 삭제</p></div>'; return; }
  panel.innerHTML = `
<header class="panel-h"><h2>공지사항 열람</h2><span class="sp"></span><span class="n no">No. ${n.id}</span></header>
<div class="panel-b" id="panel-b">
  <div class="n-top"><div class="n-cat">${catWord(n.category)}<span class="mic">구분</span></div><h3 class="n-title">${esc(n.title)}</h3></div>
  <!-- 기간 글자와 기간 축은 같은 것을 글/그림으로 말한다 — 위아래로 쌓지 않고 좌우로 놓는다.
       아래 첨부 · 등록자 줄도 마찬가지. 그렇게 비운 자리를 내용(.grow)이 가져간다. -->
  <div class="n-meta">
    <dl class="vrows"><div class="vrow"><dt>게시 기간</dt><dd><span class="n">${periodTxt(n)}</span></dd></div>
      <div class="vrow"><dt>팝업 설정</dt><dd>${n.popupOn ? `메인화면 팝업 표시 · <span class="n">${dt(n.popupFrom)} ~ ${dt(n.popupTo)}</span>` : '<span class="g" style="color:var(--grey)">표시 안 함</span>'}</dd></div></dl>
    ${tlBig([n.startAt, n.endAt], n.popupOn ? [n.popupFrom, n.popupTo] : null)}
  </div>
  <div class="n-body grow"><span class="k">내용</span><div class="body-html" tabindex="0" role="region" aria-label="공지 내용">${cleanHtml(n.content)}</div></div>
  <div class="n-foot">
    <div class="n-att"><span class="k">첨부 파일</span><div class="v">${attachView(n.attachments)}</div></div>
    ${metaFoot(n)}
  </div>
</div>
<footer class="panel-f"><button type="button" class="btn-br" data-act="list" style="margin-right:auto">목록</button><button type="button" class="btn-br" data-act="delete">삭제</button><button type="button" class="btn" data-act="edit">수정</button></footer>`;
  if (animate) swapIn($('#panel-b'));
}

const ERR = { cat: '구분을 선택해 주세요.', title: '제목을 입력해 주세요.', period: '게시 기간을 입력해 주세요.', popup: '팝업 기간을 입력해 주세요.', content: '내용을 입력해 주세요.' };
function drawForm() {
  const n = S.mode === 'edit' ? byId(S.id) : null, inf = !!n && n.endAt === INF, on = !!n && n.popupOn;
  files = n ? structuredClone(n.attachments || []) : [];
  panel.setAttribute('aria-label', n ? '공지사항 수정' : '공지사항 등록');
  panel.innerHTML = `
<header class="panel-h"><h2>${n ? '공지사항 수정' : '공지사항 등록'}</h2><span class="sp"></span>${n ? `<span class="n no">No. ${n.id}</span>` : '<span class="req-note"><em>*</em> 필수 입력</span>'}</header>
<form class="panel-b fm is-in" id="fm" novalidate>
  <div class="row">
    <div class="field" style="width:132px;flex:none"><div class="field-h"><label class="field-l" for="f-cat">구분<em class="req">*</em></label></div><span class="sel"><select id="f-cat" aria-describedby="e-cat"><option value="">선택</option>${Object.entries(NOTICE_CAT).map(([k, l]) => `<option value="${k}"${n && n.category === k ? ' selected' : ''}>${l}</option>`).join('')}</select></span><p class="err" id="e-cat" hidden>${ERR.cat}</p></div>
    <div class="field" style="flex:1"><div class="field-h"><label class="field-l" for="f-title">제목<em class="req">*</em></label><span class="cnt" data-for="f-title"></span></div><input id="f-title" class="inp" maxlength="200" placeholder="제목을 입력해 주세요." value="${esc(n ? n.title : '')}" aria-describedby="e-title"><p class="err" id="e-title" hidden>${ERR.title}</p></div>
  </div>
  <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-h" style="padding:0"><span class="field-l">게시 기간<em class="req">*</em></span></legend>
    <div class="field-row"><input id="f-from-date" class="inp" type="date" aria-label="게시 시작 날짜" aria-describedby="e-period" value="${n ? n.startAt.slice(0, 10) : ''}"><input id="f-from-time" class="inp" type="time" aria-label="게시 시작 시각" value="${n ? n.startAt.slice(11, 16) : '00:00'}"><span class="tilde">~</span><input id="f-to-date" class="inp" type="date" aria-label="게시 종료 날짜" value="${n && !inf ? n.endAt.slice(0, 10) : ''}"${inf ? ' disabled' : ''}><input id="f-to-time" class="inp" type="time" aria-label="게시 종료 시각" value="${n && !inf ? n.endAt.slice(11, 16) : '23:59'}"${inf ? ' disabled' : ''}><label class="ck" style="margin-left:12px"><input type="checkbox" id="f-unlimited"${inf ? ' checked' : ''}>무한 게시</label></div>
    <p class="err" id="e-period" hidden>${ERR.period}</p></fieldset>
  <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="field-h" style="padding:0"><span class="field-l">팝업 설정<em class="req">*</em></span></legend>
    <div class="field-row"><label class="ck" style="margin-right:8px"><input type="checkbox" id="f-popup"${on ? ' checked' : ''}>메인화면 팝업 표시</label><input id="f-pf-date" class="inp" type="date" aria-label="팝업 시작 날짜" aria-describedby="e-popup" value="${on ? n.popupFrom.slice(0, 10) : ''}"><input id="f-pf-time" class="inp" type="time" aria-label="팝업 시작 시각" value="${on ? n.popupFrom.slice(11, 16) : '00:00'}"><span class="tilde">~</span><input id="f-pt-date" class="inp" type="date" aria-label="팝업 종료 날짜" value="${on ? n.popupTo.slice(0, 10) : ''}"><input id="f-pt-time" class="inp" type="time" aria-label="팝업 종료 시각" value="${on ? n.popupTo.slice(11, 16) : '23:59'}"></div>
    <div class="weeks" role="group" aria-label="팝업 기간 빠른 선택"><span class="mic">팝업 기간 빠른 선택</span>${[1, 2, 3, 4].map((w) => `<button type="button" class="chip-b" data-weeks="${w}">${w}주일</button>`).join('')}</div>
    <p class="err" id="e-popup" hidden>${ERR.popup}</p></fieldset>
  <div id="f-tl"></div>
  <div class="field grow"><div class="field-h"><span class="field-l" id="l-content">내용<em class="req">*</em></span></div>${rteHtml({ id: 'f-content', label: '내용', placeholder: '내용을 입력하세요', html: n ? n.content : '', describedby: 'e-content' })}<p class="err" id="e-content" hidden>${ERR.content}</p></div>
  <div class="field"><div class="field-h"><span class="field-l">첨부 파일</span></div><div id="f-att"></div></div>
</form>
<footer class="panel-f"><button type="button" class="btn-br" data-act="cancel">취소</button><button type="button" class="btn" data-act="save">저장</button></footer>`;
  const fm = $('#fm');
  bindCounters(fm); bindRte(fm, askUrl); mountAttach($('#f-att'), files);
  const popupFields = () => { const v = $('#f-popup').checked; ['f-pf-date', 'f-pf-time', 'f-pt-date', 'f-pt-time'].forEach((id) => { $('#' + id).disabled = !v; }); $$('[data-weeks]', fm).forEach((b) => { b.disabled = !v; }); };
  const timeline = () => { const v = read(); $('#f-tl').innerHTML = v.fromDate && (v.unlimited || v.toDate) ? tlBig([v.startAt, v.endAt], v.popupOn && v.pfd && v.ptd ? [v.popupFrom, v.popupTo] : null) : ''; };
  popupFields(); timeline();
  fm.addEventListener('change', (e) => {
    if (e.target.id === 'f-unlimited') { const v = e.target.checked; $('#f-to-date').disabled = v; $('#f-to-time').disabled = v; if (v) $('#f-to-date').value = ''; }
    if (e.target.id === 'f-popup') popupFields();
    timeline();
  });
  fm.addEventListener('click', (e) => { const b = e.target.closest('[data-weeks]'); if (!b || b.disabled) return; const r = weeksAhead(+b.dataset.weeks); $('#f-pf-date').value = r.from; $('#f-pf-time').value = '00:00'; $('#f-pt-date').value = r.to; $('#f-pt-time').value = '23:59'; clearErr('popup'); timeline(); });
  /* 고치면 그 칸의 오류가 걷힌다(원본과 같이) */
  const un = { 'f-cat': 'cat', 'f-title': 'title', 'f-from-date': 'period', 'f-to-date': 'period', 'f-unlimited': 'period', 'f-popup': 'popup', 'f-pf-date': 'popup', 'f-pt-date': 'popup', 'f-content': 'content' };
  for (const ev of ['input', 'change']) fm.addEventListener(ev, (e) => { const k = un[e.target.id]; if (k) clearErr(k); });
  fm.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  $('#f-cat')?.focus();
}
const ERR_EL = { cat: ['#f-cat'], title: ['#f-title'], period: ['#f-from-date', '#f-to-date'], popup: ['#f-pf-date', '#f-pt-date'], content: ['#f-content'] };
function setErr(k, msg) { const p = $('#e-' + k); p.textContent = msg || ERR[k]; p.hidden = false; ERR_EL[k].forEach((s) => { const el = $(s); el.setAttribute('aria-invalid', 'true'); if (k === 'content') el.closest('.rte').setAttribute('aria-invalid', 'true'); }); }
function clearErr(k) { const p = $('#e-' + k); if (!p || p.hidden) return; p.hidden = true; ERR_EL[k].forEach((s) => { const el = $(s); el.removeAttribute('aria-invalid'); if (k === 'content') el.closest('.rte').removeAttribute('aria-invalid'); }); }
function read() {
  const v = { cat: $('#f-cat').value, title: $('#f-title').value.trim(), fromDate: $('#f-from-date').value, fromTime: $('#f-from-time').value || '00:00', unlimited: $('#f-unlimited').checked, toDate: $('#f-to-date').value, toTime: $('#f-to-time').value || '23:59',
    popupOn: $('#f-popup').checked, pfd: $('#f-pf-date').value, pft: $('#f-pf-time').value || '00:00', ptd: $('#f-pt-date').value, ptt: $('#f-pt-time').value || '23:59', content: cleanHtml($('#f-content').innerHTML) };
  v.startAt = `${v.fromDate}T${v.fromTime}:00`; v.endAt = v.unlimited ? INF : `${v.toDate}T${v.toTime}:00`;
  v.popupFrom = v.popupOn ? `${v.pfd}T${v.pft}:00` : null; v.popupTo = v.popupOn ? `${v.ptd}T${v.ptt}:00` : null;
  return v;
}
function save() {
  const v = read(); Object.keys(ERR).forEach(clearErr);
  const bad = [];
  if (!v.cat) bad.push(['cat']);
  if (!v.title) bad.push(['title']);
  if (!v.fromDate) bad.push(['period']); else if (!v.unlimited && !v.toDate) bad.push(['period', '게시 종료 날짜를 입력하거나 "무한 게시"를 선택해 주세요.']);
  if (v.popupOn && (!v.pfd || !v.ptd)) bad.push(['popup']);
  if (isBlankHtml(v.content)) bad.push(['content']);
  if (bad.length) { bad.forEach(([k, m]) => setErr(k, m)); $(ERR_EL[bad[0][0]][0]).focus(); say(`입력을 확인해 주세요 — ${bad.length}곳`); return; }
  const rec = { category: v.cat, title: v.title, startAt: v.startAt, endAt: v.endAt, popupOn: v.popupOn, popupFrom: v.popupFrom, popupTo: v.popupTo, content: v.content, attachments: files.slice() };
  const old = S.mode === 'edit' ? byId(S.id) : null;
  if (old) Object.assign(old, rec, { updater: '관리자', updatedAt: nowIso(list) });
  else { const id = list.reduce((m, x) => Math.max(m, x.id), 0) + 1; list.unshift({ id, ...rec, author: '관리자', createdAt: nowIso(list), updater: '', updatedAt: '' }); S.id = id; Object.assign(S, { cat: 'all', field: 'all', kw: '', from: '', to: '', q: 0, page: 1 }); }
  saveStore('notices', list); S.mode = ''; S.panel = ''; commit(); say(old ? '공지사항을 수정했습니다 · 시연' : '공지사항을 등록했습니다 · 시연');
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
    if (!await confirmDialog({ title: '확인', body: '이 공지사항을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.', okLabel: '삭제', danger: true })) return;
    list = list.filter((n) => n.id !== S.id); saveStore('notices', list); S.id = 0; commit(false); say('공지사항을 삭제했습니다 · 시연'); $('tr[data-row]')?.focus();
  }
});

function render(animate) {
  if (S.mode === 'edit' && !byId(S.id)) S.mode = '';
  const focus = formMode();
  $('#band').hidden = focus; form.hidden = focus; $('.fb-rule')?.toggleAttribute('hidden', focus);
  $('#split').classList.toggle('split--form', focus); $('#split').dataset.mode = focus ? 'focus' : '';
  if (!focus) { drawBand(); fillForm(); }
  drawList();
  if (focus) drawForm(); else drawView(animate);
}
function commit(push = true) { render(true); url.write(S, push); }
addEventListener('popstate', () => { S = url.read(); render(true); });

render();
url.write(S, false);

/* 창 크기가 바뀌면 한 쪽 행 수를 다시 맞춘다(모니터마다 최적화) */
watchFit(() => { if (!S._pref) { S.size = 10; drawList(); } });
