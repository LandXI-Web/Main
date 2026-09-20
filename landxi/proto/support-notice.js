/* 공지사항 — 선택 2 "분할 열람": 위 = 구분 건수 타일 4 + 검색, 좌 = 목록, 우 = 열람 판. 원판 B6-Support-Notice-Opt2 · -Detail · -Empty.
   원본 기능 1:1 — 구분(전체/긴급/일반/업무) · 제목+내용 검색 · 초기화 · Enter · 고정 글 위 · 열람(구분/제목/등록일/내용/첨부/목록 · Esc) · ?notice=<id> · 페이저 10/20/50 · 빈 상태.
   URL: ?cat=urgent&q=…&page=2&size=20&notice=7   (notice=0 = 열람 판을 닫은 상태 · 없으면 첫 행이 열린다) */
import { mountPager, bindRows, ymd } from './shell.js';
import { boot, setCrumb, readQ, writeQ, fileRow, bindDownloads, stagger, announce, icon, esc, $, $$ } from './support.js';
import { NOTICES, NCAT, NCAT_ORDER } from './support-data.js';

if (boot('notice')) init();

function init() {
  const main = $('#main');
  const deepId = parseInt(readQ().notice, 10) || 0;                      // 주소에 ?notice= 를 달고 들어왔는가(대시보드 공지 띠)
  const fromDash = /dashboard\.html/.test(document.referrer);
  main.insertAdjacentHTML('beforeend', `
<div class="sp-top" data-in>
  <div class="band band--auto sp-band" role="group" aria-label="구분으로 거르기" id="n-tiles"></div>
  <form class="sp-search" id="n-search" role="search" aria-label="공지사항 검색">
    <label class="lb" for="n-q">검색어</label>
    <div class="sp-search-row">
      <label class="inp-ic sp-q">${icon('search', 16)}<input id="n-q" class="inp" type="search" placeholder="제목 또는 내용 검색" autocomplete="off"></label>
      <span class="sp"></span>
      <button type="reset" class="btn-br">${icon('reset', 15)}초기화</button>
      <button type="submit" class="btn">${icon('search', 15)}검색</button>
    </div>
    <p class="mic sp-hint">제목과 내용을 함께 찾는다 · Enter 로 검색</p>
  </form>
</div>
<div class="split sp-split" style="--l:616fr;--r:607fr">
  <section class="split-l" data-in aria-label="공지사항 목록">
    <div class="tbl-wrap"><table class="tbl tbl--l sp-tbl" id="n-tbl">
      <colgroup><col style="width:68px"><col><col style="width:116px"></colgroup>
      <thead><tr><th scope="col">구분</th><th scope="col">제목</th><th scope="col" class="r">등록일</th></tr></thead>
      <tbody id="n-rows"></tbody></table></div>
    <div id="n-empty" hidden></div>
    <nav id="n-pager" aria-label="공지사항 페이지"></nav>
  </section>
  <aside class="split-r sp-pane" id="n-pane" data-in aria-label="공지사항 열람"></aside>
</div>`);
  stagger(main);

  const st = { cat: 'all', q: '', page: 1, size: 10, sel: null };
  const fromUrl = () => {
    const q = readQ();
    st.cat = NCAT_ORDER.includes(q.cat) ? q.cat : 'all';
    st.q = (q.q || '').trim();
    st.page = Math.max(1, parseInt(q.page, 10) || 1);
    st.size = [10, 20, 50].includes(+q.size) ? +q.size : 10;
    st.sel = q.notice == null ? null : (parseInt(q.notice, 10) || 0);
  };
  const toUrl = (push = true) => writeQ({ cat: st.cat === 'all' ? '' : st.cat, q: st.q, page: st.page > 1 ? st.page : '', size: st.size !== 10 ? st.size : '', notice: st.sel == null ? '' : st.sel }, { push });

  const filtered = () => {
    const kw = st.q.toLowerCase();
    return NOTICES.filter((n) => (st.cat === 'all' || n.category === st.cat) && (!kw || n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw)));
  };
  const count = (c) => NOTICES.filter((n) => c === 'all' || n.category === c).length;
  const catSpan = (c) => `<span class="sp-cat sp-cat--${c}">${esc(NCAT[c] || c)}</span>`;

  /* ── 타일 ── */
  const tiles = $('#n-tiles');
  function drawTiles() {
    tiles.innerHTML = NCAT_ORDER.map((c) => {
      const n = count(c), cls = n === 0 ? ' tile--zero' : c === 'urgent' ? ' tile--warn' : '';
      return `<button type="button" class="tile${cls}" data-cat="${c}" aria-pressed="${st.cat === c}"><span class="tile-l">${c === 'all' ? '전체' : NCAT[c]}</span><span class="tile-v"><b>${n}</b><span>건</span></span><span class="tile-s n">${c === 'all' ? `고정 ${NOTICES.filter((v) => v.pinned).length}` : ''}</span></button>`;
    }).join('');
  }
  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    st.cat = b.dataset.cat; st.page = 1; st.sel = null; toUrl(); draw();
    $(`[data-cat="${st.cat}"]`, tiles)?.focus();
    announce(`${b.querySelector('.tile-l').textContent} · ${filtered().length}건`);
  });

  /* ── 검색 ── */
  const form = $('#n-search'), input = $('#n-q');
  form.addEventListener('submit', (e) => { e.preventDefault(); st.q = input.value.trim(); st.page = 1; st.sel = null; toUrl(); draw(); announce(`검색 결과 ${filtered().length}건`); });
  form.addEventListener('reset', (e) => { e.preventDefault(); st.cat = 'all'; st.q = ''; st.page = 1; st.sel = null; toUrl(); draw(); announce(`전체 ${NOTICES.length}건`); });

  /* ── 목록 ── */
  const rowsEl = $('#n-rows'), emptyEl = $('#n-empty'), tblWrap = $('.tbl-wrap', main);
  const pager = mountPager($('#n-pager'), { total: 0, page: 1, size: 10, onChange: ({ page, size }) => { st.page = page; st.size = size; toUrl(); drawList(); } });
  bindRows(rowsEl, (row) => { st.sel = +row.dataset.id; toUrl(); drawPane(true); });

  function drawList() {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / st.size)); if (st.page > pages) st.page = pages;
    const view = all.slice((st.page - 1) * st.size, st.page * st.size);
    const selId = currentId(all);
    rowsEl.innerHTML = view.map((n) => `<tr data-row data-id="${n.id}" tabindex="0" aria-selected="${n.id === selId}">
<td>${catSpan(n.category)}</td>
<td><span class="sp-ttl">${n.pinned ? `<span class="sp-pin" title="상단 고정">${icon('pin', 15)}<span class="sr">상단 고정</span></span>` : ''}<span class="sp-ttl-t">${esc(n.title)}</span></span></td>
<td class="num r">${ymd(n.date)}</td></tr>`).join('');
    const none = all.length === 0;
    $('#n-tbl tbody').hidden = none; tblWrap.classList.toggle('is-empty', none);
    emptyEl.hidden = !none;
    if (none) emptyEl.innerHTML = `<div class="empty sp-empty">${icon('search', 34)}<p class="empty-t">검색 조건에 맞는 공지사항이 없습니다.</p><p class="empty-w">${esc([st.q ? `검색어 “${st.q}”` : '', `구분 ${st.cat === 'all' ? '전체' : NCAT[st.cat]}`].filter(Boolean).join(' · '))} — 초기화를 누르면 전체 ${NOTICES.length}건으로 돌아간다</p></div>`;
    pager.set({ total: all.length, page: st.page, size: st.size });
  }
  /* 열람 중인 글: 명시(notice=<id>) → 그 글 · 닫음(0) → 없음 · 미지정 → 지금 쪽의 첫 행(선택 2 의 기본 상태) */
  function currentId(all = filtered()) {
    if (st.sel === 0) return 0;
    if (st.sel) return NOTICES.some((n) => n.id === st.sel) ? st.sel : 0;
    return all[(st.page - 1) * st.size]?.id || 0;
  }

  /* ── 열람 판 ── */
  const pane = $('#n-pane');
  function drawPane(swap = false) {
    const all = filtered(), id = currentId(all), n = NOTICES.find((v) => v.id === id);
    $$('[data-row]', rowsEl).forEach((r) => r.setAttribute('aria-selected', String(+r.dataset.id === id)));
    const deep = !!n && deepId === n.id;
    setCrumb(deep ? '공지사항 열람' : '공지사항');
    if (!n) {
      pane.innerHTML = `<div class="empty sp-pane-empty${swap ? ' sp-swap' : ''}">${icon('notice', 30)}<p class="empty-w">${all.length ? '열람 판 — 목록에서 공지를 고르면 여기에 열린다' : '열람 판 — 목록에 행이 없어 비어 있다'}</p></div>`;
      return;
    }
    pane.innerHTML = `<article class="sp-read${swap ? ' sp-swap' : ''}" aria-labelledby="n-title">
<div class="sp-meta">${catSpan(n.category)}<i></i><span class="lb">등록일</span><span class="n sp-meta-d">${ymd(n.date)}</span>${n.pinned ? `<i></i><span class="sp-meta-pin">${icon('pin', 14)}<span class="mic">상단 고정</span></span>` : ''}<span class="sp"></span><span class="n mic sp-meta-q">?notice=${n.id}</span>${deep ? `<span class="mic sp-meta-deep">${fromDash ? '대시보드 공지 스트립에서 진입' : '공지 링크로 진입'}</span>` : ''}</div>
<h2 class="panel-t sp-read-t" id="n-title">${esc(n.title)}</h2>
<hr class="hr hr--ink">
<div class="prose sp-prose">${esc(n.content)}</div>
${n.attachments.length ? `<section class="sp-att" aria-label="첨부 파일"><h3 class="sp-att-h"><span class="d">첨부 파일</span><span class="n">${n.attachments.length}</span></h3>${n.attachments.map((a) => fileRow(a)).join('')}</section>` : ''}
<footer class="sp-read-f"><button type="button" class="btn-br" id="n-back">${icon('list', 15)}목록</button><span class="mic">Esc 로도 닫힌다</span></footer>
</article>`;
    announce(`${NCAT[n.category]} 공지 열람 · ${n.title}`);
  }
  function closePane() {
    const id = currentId(); if (!id) return;
    st.sel = 0; toUrl(); drawPane(true);
    ($(`[data-row][data-id="${id}"]`, rowsEl) || $('[data-row]', rowsEl) || input).focus();
  }
  pane.addEventListener('click', (e) => { if (e.target.closest('#n-back')) closePane(); });
  bindDownloads(pane);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.body.hasAttribute('data-modal')) return;
    if (e.target.closest?.('#rail')) return;
    closePane();
  });

  function draw() { input.value = st.q; drawTiles(); drawList(); drawPane(); }
  window.addEventListener('popstate', () => { fromUrl(); draw(); });
  fromUrl(); draw();
}
