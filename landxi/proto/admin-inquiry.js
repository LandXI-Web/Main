/* 서비스 관리 › 문의 관리 — 원판 B6-Admin-Inquiry{,-Reply} · 원본 landxi7/admin-inquiry.html 1:1.
   SPLIT: 좌 목록(제목/상태/등록자·등록 일시/답변자·답변 일시) + 우 질문 · 답변 판(답변 작성 · 수정 · 첨부).
   답변 대기 행을 고르면 집중 모드(mode=reply — 밴드 · 검색 행을 걷고 목록 2줄 축약 560 / 판 656 · 에디터 포커스).
   URL: ?id= 선택 · panel=off · mode=reply · status= 상태 패싯 · field/kw/from/to/q 검색 · page/size. 문의/답변 삭제는 원본 소스에 없다(원판 유보 1). */
import { say, openModal, mountPager, bindRows, icon, esc, $ } from './shell.js';
import { mountAdmin, loadStore, saveStore, urlState, facetBand, periodHtml, searchBtns, bindPeriod, quickOf, nowIso, dt, swapIn,
  cleanHtml, richHtml, isBlankHtml, rteHtml, bindRte, makeAskUrl, mountAttach, attachView, ATT_HINT, ATT_HINT_S, fitRows, watchFit } from './admin.js';

const { main } = mountAdmin('inquiry');
const url = urlState({ id: 0, panel: '', mode: '', status: 'all', field: 'all', kw: '', from: '', to: '', q: 0, page: 1, size: 10 });
let list = loadStore('inquiries');
let S = url.read();
let pager, files = [], keepPage = false;
const askUrl = makeAskUrl(openModal);
const byId = (id) => list.find((n) => n.id === id);
const replied = (q) => q.status === 'replied';
const qWord = (q) => (replied(q) ? '<span class="st st--acc">답변 완료</span>' : '<span class="st st--warn">답변 대기</span>');
const focusMode = () => S.mode === 'reply' && !!byId(S.id);

function filtered() {
  const kw = S.kw.toLowerCase(), has = (s) => (s || '').toLowerCase().includes(kw);
  return list.filter((n) => (S.status === 'all' || n.status === S.status)
    && (!kw || (S.field === 'title' ? has(n.title) : S.field === 'content' ? has(n.content) : S.field === 'author' ? has(n.author) : has(n.title) || has(n.content) || has(n.author)))
    && (!S.from || (n.createdAt || '').slice(0, 10) >= S.from) && (!S.to || (n.createdAt || '').slice(0, 10) <= S.to))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

main.insertAdjacentHTML('beforeend', `
<div id="band"></div>
<form class="filters" id="search" role="search" aria-label="문의 검색" novalidate>
  <span class="f-lab">검색어</span>
  <span class="sel"><select name="field" aria-label="검색 대상"><option value="all">전체</option><option value="title">제목</option><option value="content">내용</option><option value="author">등록자</option></select></span>
  <input class="inp" name="kw" placeholder="검색어" aria-label="검색어">
  <span id="period" class="contents"></span>${searchBtns}
</form>
<div class="work"><div class="split" id="split">
  <section class="split-l" aria-label="문의 목록">
    <div class="tbl-wrap"><table class="tbl" id="tbl" aria-label="문의 목록 — 등록 일시 내림차순"></table></div>
    <div class="empty" id="list-empty" hidden><p class="empty-t">검색 조건에 맞는 문의가 없습니다.</p><p class="empty-w">초기화로 전체 목록 복귀</p></div>
    <nav id="pager" aria-label="문의 목록 페이지"></nav>
  </section>
  <aside class="split-r panel" id="panel" aria-label="문의 열람" aria-live="polite"></aside>
</div></div>`);

const form = $('#search'), tbl = $('#tbl'), panel = $('#panel');
pager = mountPager($('#pager'), { total: 0, page: S.page, size: S.size, onChange: ({ page, size }) => { S.page = page; S.size = S._pref = size; if (!focusMode()) S.id = 0; keepPage = true; commit(); keepPage = false; } });
/* 답변 대기 = 집중 모드로 답변 작성 · 답변 완료 = 분할 그대로 답변 수정 */
bindRows(tbl, (row) => { S.id = +row.dataset.id; S.panel = ''; S.mode = replied(byId(S.id)) ? '' : 'reply'; commit(); if (S.mode === 'reply') $('#v-answer')?.focus(); else $(`tr[data-id="${S.id}"]`)?.focus(); });

function drawBand() {
  const pend = list.filter((q) => !replied(q)).length;
  $('#band').innerHTML = facetBand([
    { label: '미답변 문의 · 상태 = 답변 대기', w: 244, items: [{ id: 'pending', n: pend, unit: '건', tone: 'warn', on: S.status === 'pending' }], note: pend ? '답변 필요' : '', noteWarn: true },
    { label: '상태', items: [{ id: 'all', n: list.length, unit: '전체', on: S.status === 'all' }, { id: 'replied', n: list.length - pend, unit: '답변 완료', on: S.status === 'replied' }] },
  ], '<span class="mic">서비스 지원 › 문의하기(contact.html)와 같은 저장소</span>');
}
$('#band').addEventListener('click', (e) => {
  const f = e.target.closest('[data-facet]'); if (!f) return;
  S.status = f.dataset.facet === 'all' || S.status === f.dataset.facet ? 'all' : f.dataset.facet; S.page = 1; S.id = 0; S.panel = ''; commit(); $(`[data-facet="${f.dataset.facet}"]`)?.focus();
});
function fillForm() { form.elements.field.value = S.field; form.elements.kw.value = S.kw; $('#period').innerHTML = periodHtml('등록일', S); }
bindPeriod(form);
form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(S, { field: form.elements.field.value, kw: form.elements.kw.value.trim(), from: form.elements.from.value, to: form.elements.to.value, q: quickOf(form), page: 1, id: 0, panel: '' }); commit(); const n = filtered().length; say(n ? `문의 ${n}건` : '검색 조건에 맞는 문의가 없습니다.'); });
form.addEventListener('reset', (e) => { e.preventDefault(); Object.assign(S, { field: 'all', kw: '', from: '', to: '', q: 0, status: 'all', page: 1, id: 0, panel: '' }); commit(); form.elements.kw.focus(); });

function drawList() {
  const focus = focusMode(), all = filtered(), pages = Math.max(1, Math.ceil(all.length / S.size));
  S.page = Math.min(Math.max(1, S.page), pages);
  if (S.id && !byId(S.id)) S.id = 0;
  const at = all.findIndex((n) => n.id === S.id);
  if (S.id && at >= 0 && Math.floor(at / S.size) + 1 !== S.page && !keepPage) S.page = Math.floor(at / S.size) + 1;
  const page = all.slice((S.page - 1) * S.size, S.page * S.size);
  if (!S.id && S.panel !== 'off' && page.length) S.id = page[0].id;
  const clip = (q) => ((q.attachments || []).length ? icon('clip', 14) : '');
  tbl.className = focus ? 'tbl tbl--c' : 'tbl';
  tbl.innerHTML = focus
    ? `<thead><tr><th scope="col">문의 목록 · <span class="n">${all.length}</span>건</th></tr></thead><tbody>${page.map((q) => `<tr data-row data-id="${q.id}" tabindex="0" aria-selected="${q.id === S.id}"><td><span class="c1"><span class="t">${esc(q.title)}</span>${clip(q)}</span><span class="c2">${qWord(q)}<span>${esc(q.author || '-')} · <span class="n">${dt(q.createdAt)}</span></span>${q.answeredAt ? `<span>답변 ${esc(q.answeredBy || '-')} · <span class="n">${dt(q.answeredAt)}</span></span>` : ''}</span></td></tr>`).join('')}</tbody>`
    : `<colgroup><col><col style="width:78px"><col style="width:136px"><col style="width:142px"></colgroup>
<thead><tr><th scope="col">제목</th><th scope="col">상태</th><th scope="col">등록자 · 등록 일시</th><th scope="col">답변자 · 답변 일시</th></tr></thead>
<tbody>${page.map((q) => `<tr data-row data-id="${q.id}" tabindex="0" aria-selected="${q.id === S.id}"><td>${esc(q.title)}${clip(q)}</td><td>${qWord(q)}</td><td><span class="two">${esc(q.author || '-')}</span><span class="two"><span class="n">${dt(q.createdAt)}</span></span></td><td>${q.answeredAt ? `<span class="two">${esc(q.answeredBy || '-')}</span><span class="two"><span class="n">${dt(q.answeredAt)}</span></span>` : '<span class="dim">-</span>'}</td></tr>`).join('')}</tbody>`;
  $('#list-empty').hidden = !!all.length;
  $('#pager').classList.toggle('pager--c', focus);
  pager.set({ total: all.length, page: S.page, size: S.size });
  fitRows(S, drawList);          // 남은 높이에 맞춰 한 쪽 행 수를 맞춘다(admin.js 주석)
}

function drawPanel(animate) {
  const q = byId(S.id), focus = focusMode();
  if (!q) { panel.innerHTML = '<header class="panel-h"><h2>문의 열람</h2></header><div class="empty"><p class="empty-t">선택된 문의가 없습니다</p><p class="empty-w">목록에서 행을 고르면 여기서 질문 열람 · 답변 작성</p></div>'; return; }
  const rep = replied(q);
  files = structuredClone(q.answerAttachments || []);
  panel.setAttribute('aria-label', rep ? '문의 열람 · 답변 수정' : '문의 열람 · 답변 작성');
  panel.innerHTML = `
<header class="panel-h"><h2>${rep ? '문의 열람 · 답변 수정' : '문의 열람 · 답변 작성'}</h2><span class="sp"></span><span class="n no">No. ${q.id}</span></header>
<div class="panel-b" id="panel-b">
  <div class="q-head"><span class="q-badge">질문</span>${qWord(q)}<span class="sp"></span><span class="q-by">등록자 ${esc(q.author || '-')}${q.authorDept ? ' · ' + esc(q.authorDept) : ''} · <span class="n">${dt(q.createdAt, 19)}</span></span></div>
  <h3 class="q-title">${esc(q.title)}</h3>
  <div class="q-text" tabindex="0" role="region" aria-label="질문 내용">${richHtml(q.content)}</div>
  <div class="q-att"><span class="k">첨부 파일</span><div>${attachView(q.attachments)}</div></div>
  <div class="q-ans grow">
    <div class="q-ans-h"><span class="q-badge q-badge--a">답변</span>${rep ? `<span class="by">답변자 ${esc(q.answeredBy || '-')} · <span class="n">${dt(q.answeredAt, 19)}</span></span>` : '<span class="st st--warn" style="font-size:14.5px;font-weight:400">미답변</span>'}<span class="sp"></span><span class="mic" id="l-answer">답변 내용</span></div>
    ${rteHtml({ id: 'v-answer', label: '답변 내용', placeholder: "답변을 입력하세요. 저장 시 문의 상태가 '답변 완료'로 변경됩니다.", html: q.answer ? richHtml(q.answer) : '', reply: true })}
    <div id="v-att"></div>
  </div>
</div>
<footer class="panel-f"><button type="button" class="btn-br" data-act="list" style="margin-right:auto">목록</button>${rep ? '' : `<span class="mic" style="margin-right:0">저장 시 '답변 완료'로 변경</span>`}<button type="button" class="btn" data-act="save" style="min-width:124px">답변 저장</button></footer>`;
  bindRte(panel, askUrl);
  mountAttach($('#v-att'), files, { hint: focus ? ATT_HINT : ATT_HINT_S, inline: true });
  if (animate) swapIn($('#panel-b'));
}

panel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'list') { S.id = 0; S.mode = ''; S.panel = 'off'; commit(); $('tr[data-row]')?.focus(); return; }
  const q = byId(S.id); if (!q) return;
  const answer = cleanHtml($('#v-answer').innerHTML);
  if (isBlankHtml(answer)) { say('답변 내용을 입력해 주세요.'); $('#v-answer').focus(); return; }
  Object.assign(q, { answer, answerAttachments: files.slice(), answeredAt: nowIso(list), answeredBy: '관리자', status: 'replied' });
  saveStore('inquiries', list); S.mode = ''; commit(); say('답변이 저장되었습니다');
  $(`tr[data-id="${S.id}"]`)?.focus();
});

function render(animate) {
  if (S.mode === 'reply' && !byId(S.id)) S.mode = '';
  const focus = focusMode();
  $('#band').hidden = focus; form.hidden = focus;
  $('#split').classList.toggle('split--form', focus); $('#split').dataset.mode = focus ? 'focus' : '';
  if (!focus) { drawBand(); fillForm(); }
  drawList(); drawPanel(animate);
}
function commit(push = true) { render(true); url.write(S, push); }
addEventListener('popstate', () => { S = url.read(); render(true); });

render();
url.write(S, false);

/* 창 크기가 바뀌면 한 쪽 행 수를 다시 맞춘다(모니터마다 최적화) */
watchFit(() => { if (!S._pref) { S.size = 10; drawList(); } });
