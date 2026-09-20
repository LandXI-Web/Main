/* 문의하기 — 위 = 상태 타일 3 + 제목 · 등록일 · 기간 필터, 좌 = 내 문의 목록, 우 = 문의 등록 / 문의 열람.
   원판 B6-Support-Contact · -Error · -Cancel · -View · -View-Pending · -Empty. 원본 기능 1:1:
   등록 폼(제목* n자/60자 · 내용* · 첨부 추가/삭제 · 5개 · 10 MB · 취소 확인 · 저장 → 목록 맨 위 답변 대기 + 토스트) ·
   목록(상태 · 제목 · 등록일 from~to · 기간 전체/1/3/6/12개월 · 초기화/검색 · Enter · 페이저) · 열람(상태/제목/등록 일시/내용/첨부/답변 또는 미답변 안내 · 목록).
   URL: ?status=pending&q=…&from=…&to=…&quick=3&page=2&size=20&inq=110   (inq = 열람 중인 문의)
   데이터: 메모리 + sessionStorage(lx.support.inquiries). 새로고침하면 시드로 돌아간다 — 콘티. */
import { mountPager, bindRows, bindCounters, confirmDialog, say } from './shell.js';
import { boot, setCrumb, readQ, writeQ, fmtDT, fmtSize, fileRow, bindDownloads, stagger, announce, icon, xicon, esc, $, $$ } from './support.js';
import { INQ_SEED, INQ_MAX_FILES, INQ_MAX_MB, AS_OF } from './support-data.js';

const KEY = 'lx.support.inquiries';
const ST = { pending: '답변 대기', replied: '답변 완료' };
const QUICK = [[0, '전체'], [1, '1개월'], [3, '3개월'], [6, '6개월'], [12, '12개월']];

function load() {
  try {
    if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem(KEY);   // 새로고침 = 시드로 복귀
    const raw = sessionStorage.getItem(KEY); if (raw) return JSON.parse(raw);
  } catch { /* 저장소 차단 */ }
  return INQ_SEED.map((q) => ({ ...q }));
}
const save = (list) => { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 저장소 차단 */ } };

if (boot('contact')) init();

function init() {
  const main = $('#main');
  let inquiries = load();
  let files = [];                                                        // 등록 폼에 달아 둔 첨부
  main.insertAdjacentHTML('beforeend', `
<div class="sp-top ct-top" data-in>
  <div class="band band--auto sp-band" role="group" aria-label="상태로 거르기" id="ct-tiles"></div>
  <form class="ct-filter" id="ct-filter" role="search" aria-label="내 문의 검색">
    <div class="ct-f1">
      <div><label class="lb" for="ct-q">제목</label><label class="inp-ic">${icon('search', 16)}<input id="ct-q" class="inp" type="search" placeholder="제목 검색" autocomplete="off"></label></div>
      <div><span class="lb" id="ct-d-l">등록일</span><div class="ct-dates" role="group" aria-labelledby="ct-d-l"><input id="ct-from" class="inp" type="date" aria-label="등록일 시작"><span class="tilde">~</span><input id="ct-to" class="inp" type="date" aria-label="등록일 끝"></div></div>
    </div>
    <div class="ct-f2">
      <span class="chips" role="group" aria-label="기간 빠른 선택" id="ct-quick">${QUICK.map(([m, l]) => `<button type="button" class="chip-b" data-m="${m}" aria-pressed="${m === 0}">${l}</button>`).join('')}</span>
      <span class="sp"></span>
      <button type="reset" class="btn-br">${icon('reset', 15)}초기화</button>
      <button type="submit" class="btn">${icon('search', 15)}검색</button>
    </div>
  </form>
</div>
<div class="split sp-split" style="--l:692fr;--r:531fr">
  <section class="split-l" data-in aria-labelledby="ct-h">
    <h2 class="ct-h d" id="ct-h">${icon('list', 16)}내 문의 목록 <span class="n" id="ct-n"></span></h2>
    <div class="tbl-wrap"><table class="tbl sp-tbl ct-tbl" id="ct-tbl">
      <colgroup><col><col style="width:96px"><col style="width:162px"></colgroup>
      <thead><tr><th scope="col">제목</th><th scope="col">상태</th><th scope="col" class="r">등록 일시</th></tr></thead>
      <tbody id="ct-rows"></tbody></table></div>
    <div id="ct-empty" hidden></div>
    <nav id="ct-pager" class="ct-pager" aria-label="내 문의 페이지"></nav>
  </section>
  <aside class="split-r ct-pane" data-in aria-label="문의 등록 · 열람">
    <div class="ct-tabs" role="tablist" aria-label="문의" id="ct-tabs"></div>
    <form class="ct-body" id="ct-form" role="tabpanel" aria-labelledby="ct-tab-form" novalidate>
      <p class="mic ct-form-hint">서비스 이용 중 궁금하신 점을 남겨주세요. 담당자가 확인 후 답변 드립니다.</p>
      <div class="ct-fh"><label for="inq-title">제목<em class="req" aria-hidden="true">*</em></label><span class="cnt" data-for="inq-title"></span></div>
      <input id="inq-title" class="inp" type="text" maxlength="60" placeholder="문의 제목을 입력하세요" aria-required="true" aria-describedby="inq-title-e" autocomplete="off">
      <p class="err" id="inq-title-e" hidden>제목을 입력해 주세요.</p>
      <div class="ct-fh"><label for="inq-content">내용<em class="req" aria-hidden="true">*</em></label></div>
      <textarea id="inq-content" class="inp" rows="6" aria-required="true" aria-describedby="inq-content-e" placeholder="문의하실 내용을 구체적으로 작성해 주세요.&#10;기능 관련 문의라면 어느 메뉴·어느 단계에서 발생했는지 함께 적어주시면 빠른 답변에 도움이 됩니다."></textarea>
      <p class="err" id="inq-content-e" hidden>문의 내용을 입력해 주세요.</p>
      <div class="ct-att-h"><span class="ct-fl lb" style="color:var(--ink);margin:0">첨부 파일</span><span class="mic">이미지 · PDF · 문서 · 파일당 최대 10.0 MB · 최대 5개</span>
        <input type="file" id="inq-files" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt" multiple hidden>
        <button type="button" class="btn-br" id="inq-file-btn">${icon('plus', 14)}파일 추가</button></div>
      <div id="inq-att" aria-live="polite"></div>
      <div class="ct-acts"><button type="button" class="btn-br" id="inq-cancel">취소</button><button type="submit" class="btn" id="inq-save">저장</button></div>
    </form>
    <div class="ct-body" id="ct-view" role="tabpanel" aria-labelledby="ct-tab-view" hidden></div>
  </aside>
</div>`);
  stagger(main);
  bindCounters(main);

  const st = { status: '', q: '', from: '', to: '', quick: 0, page: 1, size: 10, inq: 0 };
  const fromUrl = () => {
    const q = readQ();
    st.status = q.status in ST ? q.status : '';
    st.q = (q.q || '').trim();
    st.from = /^\d{4}-\d\d-\d\d$/.test(q.from || '') ? q.from : '';
    st.to = /^\d{4}-\d\d-\d\d$/.test(q.to || '') ? q.to : '';
    st.quick = q.quick != null && QUICK.some(([m]) => m === +q.quick) ? +q.quick : (st.from || st.to ? -1 : 0);
    st.page = Math.max(1, parseInt(q.page, 10) || 1);
    st.size = [10, 20, 50].includes(+q.size) ? +q.size : 10;
    st.inq = parseInt(q.inq, 10) || 0;
  };
  const toUrl = (push = true) => writeQ({ status: st.status, q: st.q, from: st.from, to: st.to, quick: st.quick > 0 ? st.quick : '', page: st.page > 1 ? st.page : '', size: st.size !== 10 ? st.size : '', inq: st.inq || '' }, { push });
  const filtered = () => {
    const kw = st.q.toLowerCase();
    return inquiries.filter((n) => (!st.status || n.status === st.status) && (!kw || n.title.toLowerCase().includes(kw))
      && (!st.from || n.createdAt.substring(0, 10) >= st.from) && (!st.to || n.createdAt.substring(0, 10) <= st.to))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  /* ── 상태 타일 ── */
  const tiles = $('#ct-tiles');
  function drawTiles() {
    const items = [['', '전체', inquiries.length], ['pending', ST.pending, inquiries.filter((q) => q.status === 'pending').length], ['replied', ST.replied, inquiries.filter((q) => q.status === 'replied').length]];
    tiles.innerHTML = items.map(([k, l, n]) => `<button type="button" class="tile${n === 0 ? ' tile--zero' : ''}" data-status="${k}" aria-pressed="${st.status === k}"><span class="tile-l">${l}</span><span class="tile-v"><b>${n}</b><span>건</span></span><span class="tile-s"></span></button>`).join('');
    $('#ct-n').textContent = `(${inquiries.length})`;
  }
  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]'); if (!b) return;
    st.status = b.dataset.status; st.page = 1; toUrl(); draw(); $(`[data-status="${st.status}"]`, tiles)?.focus();
    announce(`${b.querySelector('.tile-l').textContent} · ${filtered().length}건`);
  });

  /* ── 필터 ── */
  const fForm = $('#ct-filter'), fQ = $('#ct-q'), fFrom = $('#ct-from'), fTo = $('#ct-to'), quick = $('#ct-quick');
  const setQuick = (m) => $$('.chip-b', quick).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.m === m)));
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const m = +b.dataset.m;                                              // 원본: 날짜 칸만 채운다 — 거르기는 검색을 눌러야
    const d = new Date(`${AS_OF}T00:00:00`); d.setMonth(d.getMonth() - m);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    fFrom.value = m > 0 ? iso(d) : ''; fTo.value = m > 0 ? AS_OF : '';
    fForm.dataset.quick = m; setQuick(m);
  });
  [fFrom, fTo].forEach((el) => el.addEventListener('change', () => { fForm.dataset.quick = -1; setQuick(-1); }));
  fForm.addEventListener('submit', (e) => {
    e.preventDefault();
    st.q = fQ.value.trim(); st.from = fFrom.value; st.to = fTo.value; st.quick = +(fForm.dataset.quick ?? 0); st.page = 1;
    toUrl(); draw(); announce(`검색 결과 ${filtered().length}건`);
  });
  fForm.addEventListener('reset', (e) => { e.preventDefault();
    Object.assign(st, { status: '', q: '', from: '', to: '', quick: 0, page: 1 });
    toUrl(); draw(); announce(`전체 ${inquiries.length}건`);
  });

  /* ── 목록 ── */
  const rowsEl = $('#ct-rows'), emptyEl = $('#ct-empty');
  const pager = mountPager($('#ct-pager'), { total: 0, page: 1, size: 10, onChange: ({ page, size }) => { st.page = page; st.size = size; toUrl(); drawList(); } });
  bindRows(rowsEl, (row) => { st.inq = +row.dataset.id; toUrl(); drawPane(true); });
  function drawList() {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / st.size)); if (st.page > pages) st.page = pages;
    rowsEl.innerHTML = all.slice((st.page - 1) * st.size, st.page * st.size).map((q) => `<tr data-row data-id="${q.id}" tabindex="0" aria-selected="${q.id === st.inq}">
<td><span class="sp-ttl"><span class="sp-ttl-t">${esc(q.title)}</span>${q.attachments?.length ? `<span class="ct-clip">${icon('clip', 14)}<span class="sr">첨부 ${q.attachments.length}</span></span>` : ''}</span></td>
<td><span class="ct-st ct-st--${q.status}">${ST[q.status]}</span></td>
<td class="num r">${fmtDT(q.createdAt)}</td></tr>`).join('');
    const none = !all.length;
    $('#ct-tbl tbody').hidden = none; emptyEl.hidden = !none;
    if (none) emptyEl.innerHTML = `<div class="empty ct-empty">${icon('search', 34)}<p class="empty-t">등록된 문의가 없습니다.</p><p class="empty-w">${inquiries.length ? '검색 조건에 맞는 문의가 없다 — 초기화를 누르면 전체 ' + inquiries.length + '건으로 돌아간다' : '오른쪽 문의 등록에서 저장하면 이 목록 맨 위에 답변 대기로 올라온다'}</p></div>`;
    pager.set({ total: all.length, page: st.page, size: st.size });
  }

  /* ── 우 판: 문의 등록 / 문의 열람 ── */
  const tabs = $('#ct-tabs'), formEl = $('#ct-form'), viewEl = $('#ct-view');
  function drawPane(swap = false) {
    const q = inquiries.find((v) => v.id === st.inq);
    if (!q) st.inq = 0;
    $$('[data-row]', rowsEl).forEach((r) => r.setAttribute('aria-selected', String(+r.dataset.id === st.inq)));
    setCrumb(q ? '문의 열람' : '문의하기');
    tabs.innerHTML = `<button type="button" role="tab" class="ct-tab d" id="ct-tab-form" aria-selected="${!q}" aria-controls="ct-form" tabindex="${q ? -1 : 0}">${xicon('pen', 16)}문의 등록</button>`
      + (q ? `<button type="button" role="tab" class="ct-tab d" id="ct-tab-view" aria-selected="true" aria-controls="ct-view" tabindex="0">${icon('notice', 16)}문의 열람</button>
<span class="ct-vmeta"><span class="lb">상태</span><span class="ct-st ct-st--${q.status}">${ST[q.status]}</span><i></i><span class="lb">등록 일시</span><span class="n">${fmtDT(q.createdAt)}</span></span>` : '');
    formEl.hidden = !!q; viewEl.hidden = !q;
    if (!q) { viewEl.innerHTML = ''; if (swap) { formEl.classList.remove('sp-swap'); void formEl.offsetWidth; formEl.classList.add('sp-swap'); } return; }
    const replied = q.status === 'replied' && q.answer;
    viewEl.innerHTML = `<article class="sp-read${swap ? ' sp-swap' : ''}" aria-labelledby="ct-vt">
<h2 class="ct-vt d" id="ct-vt">${esc(q.title)}</h2>
<hr class="hr hr--ink">
<div class="ct-vscroll" tabindex="0" role="group" aria-label="문의 내용과 답변">
<div class="prose ct-vprose" aria-label="문의 내용">${esc(q.content)}</div>
${q.attachments?.length ? `<section class="ct-vatt" aria-label="첨부 파일"><p class="lb ct-vatt-h">첨부 파일</p>${q.attachments.map((a) => fileRow(a)).join('')}</section>` : ''}
<section class="ct-ans${replied ? ' ct-ans--replied' : ''}" aria-label="답변"><h3 class="d">답변</h3><div class="prose">${replied ? esc(q.answer) : '담당자가 확인 후 답변 드릴 예정입니다. 답변까지 영업일 기준 1-2일 소요됩니다.'}</div></section>
</div>
<div class="ct-acts ct-acts--l"><button type="button" class="btn-br" id="ct-back">${icon('list', 15)}목록</button></div>
</article>`;
    announce(`문의 열람 · ${ST[q.status]} · ${q.title}`);
  }
  function backToForm(focusRow = true) {
    const id = st.inq; if (!id) return;
    st.inq = 0; toUrl(); drawPane(true);
    if (focusRow) ($(`[data-row][data-id="${id}"]`, rowsEl) || $('#ct-tab-form')).focus(); else $('#ct-tab-form').focus();
  }
  tabs.addEventListener('click', (e) => { if (e.target.closest('#ct-tab-form') && st.inq) backToForm(false); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = $$('[role="tab"]', tabs); if (all.length < 2) return;
    e.preventDefault(); all[(all.indexOf(document.activeElement) + 1) % 2].focus();
  });
  viewEl.addEventListener('click', (e) => { if (e.target.closest('#ct-back')) backToForm(); });
  bindDownloads(viewEl);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.inq && !document.body.hasAttribute('data-modal') && !e.target.closest?.('#rail')) backToForm(); });

  /* ── 등록 폼 ── */
  const fTitle = $('#inq-title'), fContent = $('#inq-content'), fFiles = $('#inq-files'), attEl = $('#inq-att');
  const setErr = (el, on) => { el.setAttribute('aria-invalid', String(on)); if (!on) el.removeAttribute('aria-invalid'); $(`#${el.id}-e`).hidden = !on; };
  fTitle.addEventListener('input', () => setErr(fTitle, false));
  fContent.addEventListener('input', () => setErr(fContent, false));
  function drawFiles() {
    attEl.innerHTML = files.length
      ? `<div class="ct-att-list">${files.map((f, i) => `<div class="ct-att-row">${icon('clip', 15)}<span class="ct-att-n">${esc(f.name)}</span><span class="n mic">(${esc(fmtSize(f.size))})</span><button type="button" class="link link--ink" data-rm="${i}" aria-label="${esc(f.name)} 삭제">삭제</button></div>`).join('')}</div>`
      : '<div class="empty empty--s ct-att-none">첨부된 파일이 없습니다.</div>';
  }
  function addFiles(list) {
    for (const f of list) {
      if (files.length >= INQ_MAX_FILES) { say(`첨부 제한 · 첨부 파일은 최대 ${INQ_MAX_FILES}개까지 등록할 수 있습니다.`); break; }
      if (f.size > INQ_MAX_MB * 1024 * 1024) { say(`용량 초과 · ${f.name} 파일이 ${INQ_MAX_MB}MB 를 초과합니다.`); continue; }
      files.push({ name: f.name, size: f.size });
    }
    drawFiles();
  }
  $('#inq-file-btn').addEventListener('click', () => fFiles.click());
  fFiles.addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  attEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    files.splice(+b.dataset.rm, 1); drawFiles();
    ($('[data-rm]', attEl) || $('#inq-file-btn')).focus();
  });
  function resetForm() {
    fTitle.value = ''; fContent.value = ''; files = []; drawFiles(); setErr(fTitle, false); setErr(fContent, false);
    fTitle.dispatchEvent(new Event('input'));
  }
  const dirty = () => !!(fTitle.value || fContent.value || files.length);
  $('#inq-cancel').addEventListener('click', async () => {
    if (!dirty()) { resetForm(); return; }
    if (await confirmDialog({ title: '작성 취소', body: '작성 중인 내용이 모두 삭제됩니다. 계속하시겠습니까?', okLabel: '확인', cancelLabel: '취소', danger: true })) { resetForm(); fTitle.focus(); }
  });
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fTitle.value.trim(), content = fContent.value.trim();
    setErr(fTitle, !title); setErr(fContent, !content);
    if (!title || !content) { (!title ? fTitle : fContent).focus(); return; }   // 원본: 첫 미입력 칸으로 포커스
    const now = new Date(), p = (n) => String(n).padStart(2, '0');
    const item = { id: Date.now(), title, content, status: 'pending', createdAt: `${AS_OF}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`, attachments: files.slice(), answer: '', answeredAt: '' };
    inquiries.unshift(item); save(inquiries);
    resetForm(); st.page = 1; toUrl(false); draw();
    say('등록 완료 · 문의가 등록되었습니다. 답변은 영업일 기준 1-2일 내 제공됩니다.');
    $(`[data-row][data-id="${item.id}"]`, rowsEl)?.focus();
  });

  function draw() {
    fQ.value = st.q; fFrom.value = st.from; fTo.value = st.to; fForm.dataset.quick = st.quick; setQuick(st.quick);
    drawTiles(); drawList(); drawPane();
  }
  window.addEventListener('popstate', () => { fromUrl(); draw(); });
  drawFiles(); fromUrl(); draw();
}
