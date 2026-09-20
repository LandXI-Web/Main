/* 자주 묻는 질문 — **분할 열람**: 위 = 구분 칩 + 검색, 좌 = 질문 목록, 우 = 답변 판.
   공지사항(support-notice.js)과 같은 부품 · 같은 배치다. 화면군 안에서 두 가지 방식이
   섞이면 쓰는 사람이 매번 다시 익혀야 한다.

   왜 아코디언을 걷었나 (발주자 2026-09-20 "분할 열람으로 가자")
     아코디언은 답을 펼치는 만큼 화면이 길어진다. 답 셋을 펼치면 1996×745 에서 103px,
     1280·1366 은 **하나만 펼쳐도** 63~101px 넘쳤다. 질문을 2열로 세워 봤더니 이번에는
     질문이 `…` 로 잘렸다. "한 화면에서 끝난다"와 "글자를 잘라 맞추지 않는다"를 둘 다
     지키려면 구조를 바꾸는 수밖에 없었다.

   공지와 다른 한 가지 — 구분이 7개(전체 + 6)라 공지의 큰 숫자 타일(140px × 4)을 쓰면
   1280 에서 가로로 넘친다. 그래서 같은 위 띠 자리에 **칩 줄**(문의하기의 기간 칩과 같은
   부품)을 두고 건수를 칩 안에 적었다. 자리와 역할은 공지의 타일과 같다.

   원본 기능은 그대로 — 구분 · 검색 필드(전체/질문/답변) · 검색어 · 초기화/검색 · Enter ·
   ?faq=<id> 로 그 질문이 열린 채 뜨기 · `찾는 답이 없으면 문의하기` · 빈 상태.
   목록은 거른 결과를 한 쪽에 다 보여 준다(전체 13건). 쪽당 건수를 줄이지 않는다.
   URL: ?cat=02&field=title&q=…&faq=5   (faq=0 = 판을 닫은 상태 · 없으면 첫 행이 열린다) */
import { bindRows } from './shell.js';
import { boot, setCrumb, readQ, writeQ, stagger, announce, icon, esc, $, $$ } from './support.js';
import { FAQS, FCAT } from './support-data.js';

if (boot('faq')) init();

function init() {
  const main = $('#main');
  const FIELDS = { all: '전체', title: '질문', content: '답변' };
  const deep = 'faq' in readQ();                                         // ?faq= 를 달고 들어왔는가
  main.insertAdjacentHTML('beforeend', `
<div class="sp-top fq-top" data-in>
  <div class="fq-cats-w">
    <p class="lb" id="fq-cat-l">구분</p>
    <div class="chips fq-cats" role="group" aria-labelledby="fq-cat-l" id="fq-cats"></div>
  </div>
  <form class="sp-search fq-search" id="fq-form" role="search" aria-label="자주 묻는 질문 검색">
    <label class="lb" for="fq-q">검색어</label>
    <div class="sp-search-row">
      <span class="sel fq-field"><select id="fq-field" aria-label="검색 필드">${Object.entries(FIELDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></span>
      <label class="inp-ic sp-q">${icon('search', 16)}<input id="fq-q" class="inp" type="search" placeholder="질문 · 답변 검색" autocomplete="off"></label>
      <button type="reset" class="btn-br">${icon('reset', 15)}초기화</button>
      <button type="submit" class="btn">${icon('search', 15)}검색</button>
    </div>
  </form>
</div>
<div class="split sp-split fq-split" style="--l:560fr;--r:663fr">
  <section class="split-l" data-in aria-label="질문 목록">
    <div class="tbl-wrap"><table class="tbl tbl--l sp-tbl fq-tbl" id="fq-tbl">
      <colgroup><col style="width:116px"><col></colgroup>
      <thead><tr><th scope="col">구분</th><th scope="col">질문</th></tr></thead>
      <tbody id="fq-rows"></tbody></table></div>
    <div id="fq-empty" hidden></div>
  </section>
  <aside class="split-r sp-pane fq-pane" id="fq-pane" data-in aria-label="답변"></aside>
</div>`);
  stagger(main);

  const st = { cat: 'all', field: 'all', q: '', sel: null };
  const fromUrl = () => {
    const p = readQ();
    st.cat = p.cat in FCAT ? p.cat : 'all';
    st.field = p.field in FIELDS ? p.field : 'all';
    st.q = (p.q || '').trim();
    /* 예전 아코디언은 `?faq=1,3` 처럼 여러 개를 열 수 있었다. 이제는 한 번에 하나라
       첫 번째 유효한 번호만 본다 — 옛 주소로 들어와도 막다른 길이 되지 않게. */
    if (p.faq == null) { st.sel = null; return; }
    const first = String(p.faq).split(',').map((v) => parseInt(v, 10)).find((v) => FAQS.some((f) => f.id === v));
    st.sel = first == null ? 0 : first;
  };
  const toUrl = (push = true) => writeQ({ cat: st.cat === 'all' ? '' : st.cat, field: st.field === 'all' ? '' : st.field,
    q: st.q, faq: st.sel == null ? '' : st.sel }, { push });

  const filtered = () => {
    const kw = st.q.toLowerCase();
    return FAQS.filter((f) => (st.cat === 'all' || f.category === st.cat) && (!kw
      || (st.field !== 'content' && f.q.toLowerCase().includes(kw)) || (st.field !== 'title' && f.a.toLowerCase().includes(kw))));
  };

  /* ── 구분 칩 ── */
  const cats = $('#fq-cats');
  function drawCats() {
    const items = [['all', '전체', FAQS.length], ...Object.entries(FCAT).map(([k, l]) => [k, l, FAQS.filter((f) => f.category === k).length])];
    cats.innerHTML = items.map(([k, l, n]) => `<button type="button" class="chip-b fq-cat" data-cat="${k}" aria-pressed="${st.cat === k}">${esc(l)}<span class="n">${n}</span></button>`).join('');
  }
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    st.cat = b.dataset.cat; st.sel = null; toUrl(); draw();
    $(`[data-cat="${st.cat}"]`, cats)?.focus();
    announce(`${b.firstChild.textContent} · ${filtered().length}건`);
  });
  cats.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = $$('.fq-cat', cats), i = all.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length].focus();
  });

  /* ── 검색 ── */
  const form = $('#fq-form'), input = $('#fq-q'), field = $('#fq-field');
  form.addEventListener('submit', (e) => { e.preventDefault(); st.q = input.value.trim(); st.field = field.value; st.sel = null; toUrl(); draw(); announce(`검색 결과 ${filtered().length}건`); });
  form.addEventListener('reset', (e) => { e.preventDefault(); st.cat = 'all'; st.field = 'all'; st.q = ''; st.sel = null; toUrl(); draw(); announce(`전체 ${FAQS.length}건`); });

  /* ── 목록 ── */
  const rowsEl = $('#fq-rows'), emptyEl = $('#fq-empty'), tblWrap = $('.tbl-wrap', main);
  bindRows(rowsEl, (row) => { st.sel = +row.dataset.id; toUrl(); drawPane(true); });

  function drawList() {
    const all = filtered(), selId = currentId(all);
    rowsEl.innerHTML = all.map((f) => `<tr data-row data-id="${f.id}" tabindex="0" aria-selected="${f.id === selId}">
<td><span class="sp-cat">${esc(FCAT[f.category])}</span></td>
<td><span class="sp-ttl"><span class="sp-ttl-t">${esc(f.q)}</span></span></td></tr>`).join('');
    const none = all.length === 0;
    $('#fq-tbl tbody').hidden = none; tblWrap.classList.toggle('is-empty', none);
    emptyEl.hidden = !none;
    if (none) {
      const why = [`구분 ${st.cat === 'all' ? '전체' : FCAT[st.cat]}`, st.q ? `${FIELDS[st.field]} “${st.q}”` : ''].filter(Boolean).join(' · ');
      emptyEl.innerHTML = `<div class="empty sp-empty">${icon('search', 34)}<p class="empty-t">검색 조건에 맞는 질문이 없습니다.</p><p class="empty-w">${esc(why)} — 초기화를 누르면 전체 ${FAQS.length}건으로 돌아간다</p></div>`;
    }
  }
  /* 열람 중인 질문: 명시(faq=<id>) → 그 질문 · 닫음(0) → 없음 · 미지정 → 첫 행(공지와 같다) */
  function currentId(all = filtered()) {
    if (st.sel === 0) return 0;
    if (st.sel) return FAQS.some((f) => f.id === st.sel) ? st.sel : 0;
    return all[0]?.id || 0;
  }

  /* ── 답변 판 ── */
  const pane = $('#fq-pane');
  /* `찾는 답이 없으면 문의하기` — 예전에는 왼쪽 구분 레일 밑에 있었다. 레일을 걷었으니
     답변 판 아래로 옮긴다. 답을 읽고도 해결이 안 됐을 때 바로 눈에 닿는 자리다.
     고른 것이 없을 때도 같은 자리에 둔다 — 링크가 사라지면 안 된다. */
  const more = '<p class="fq-more"><span class="mic">찾는 답이 없으면</span><a class="link" href="contact.html">문의하기 ›</a></p>';
  function drawPane(swap = false) {
    const all = filtered(), id = currentId(all), f = FAQS.find((v) => v.id === id);
    $$('[data-row]', rowsEl).forEach((r) => r.setAttribute('aria-selected', String(+r.dataset.id === id)));
    setCrumb(f && deep ? '자주 묻는 질문 열람' : '자주 묻는 질문');
    if (!f) {
      pane.innerHTML = `<div class="empty sp-pane-empty fq-pane-empty${swap ? ' sp-swap' : ''}">${icon('notice', 30)}<p class="empty-w">${all.length ? '답변 판 — 왼쪽에서 질문을 고르면 여기에 열린다' : '답변 판 — 목록에 질문이 없어 비어 있다'}</p>${more}</div>`;
      return;
    }
    const no = FAQS.findIndex((v) => v.id === f.id) + 1;
    pane.innerHTML = `<article class="sp-read fq-read${swap ? ' sp-swap' : ''}" aria-labelledby="fq-title">
<div class="sp-meta"><span class="sp-cat">${esc(FCAT[f.category])}</span><i></i><span class="lb">질문</span><span class="n sp-meta-d">${String(no).padStart(2, '0')} / ${FAQS.length}</span></div>
<h2 class="panel-t sp-read-t"><span class="fq-m d" aria-hidden="true">Q</span><span id="fq-title">${esc(f.q)}</span></h2>
<hr class="hr hr--ink">
<div class="fq-ans"><span class="fq-m d" aria-hidden="true">A</span><div class="prose sp-prose">${esc(f.a)}</div></div>
<footer class="sp-read-f"><button type="button" class="btn-br" id="fq-back">${icon('list', 15)}목록</button><span class="mic">Esc 로도 닫힌다</span><span class="sp"></span>${more}</footer>
</article>`;
    announce(`${FCAT[f.category]} · ${f.q}`);
  }
  function closePane() {
    const id = currentId(); if (!id) return;
    st.sel = 0; toUrl(); drawPane(true);
    ($(`[data-row][data-id="${id}"]`, rowsEl) || $('[data-row]', rowsEl) || input).focus();
  }
  pane.addEventListener('click', (e) => { if (e.target.closest('#fq-back')) closePane(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.body.hasAttribute('data-modal')) return;
    if (e.target.closest?.('#rail')) return;
    closePane();
  });

  function draw() { input.value = st.q; field.value = st.field; drawCats(); drawList(); drawPane(); }
  window.addEventListener('popstate', () => { fromUrl(); draw(); });
  fromUrl(); draw();
  /* ?faq=<id> 로 들어오면 그 행에 포커스를 둔다(원본은 그 항목으로 스크롤했다) */
  if (deep && currentId()) requestAnimationFrame(() => $(`[data-row][data-id="${currentId()}"]`, rowsEl)?.focus({ preventScroll: true }));
}
