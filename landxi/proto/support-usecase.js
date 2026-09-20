/* 활용사례 — 검색 막대 · 그림 카드(실 정사영상 크롭) · 상세 모달 · 페이저 · 빈 상태. 원판 B6-Support-Usecase · -Modal · -Empty.
   원본 기능 1:1 — 검색 필드(전체/제목/내용) · 검색어 · 초기화/검색 · Enter · 카드(썸네일 · 제목 · 발췌 2줄 · 일자 · 첨부 표식) · 상세(제목/일자/본문/첨부 · Esc) · ?uc=<id> · 페이저 10/20/50.
   URL: ?field=title&q=…&page=1&size=10&uc=2 */
import { mountPager, openModal, ymd } from './shell.js';
import { boot, readQ, writeQ, fileRow, bindDownloads, ucTitle, stagger, announce, icon, esc, $ } from './support.js';
import { USECASES, UC_IMG } from './support-data.js';

if (boot('usecase')) init();

function init() {
  const main = $('#main');
  const FIELDS = { all: '전체', title: '제목', content: '내용' };
  main.insertAdjacentHTML('beforeend', `
<form class="uc-bar sp-bar" id="uc-form" role="search" aria-label="활용사례 검색" data-in>
  <label class="lb" for="uc-q">검색어</label>
  <div class="sp-bar-row">
    <span class="sel"><select id="uc-field" aria-label="검색 필드">${Object.entries(FIELDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></span>
    <label class="inp-ic">${icon('search', 16)}<input id="uc-q" class="inp" type="search" placeholder="검색어" autocomplete="off"></label>
    <span class="sp"></span>
    <button type="reset" class="btn-br">${icon('reset', 15)}초기화</button>
    <button type="submit" class="btn">${icon('search', 15)}검색</button>
  </div>
</form>
<section id="uc-list" aria-label="활용사례 목록" data-in></section>
<nav id="uc-pager" class="uc-pager" aria-label="활용사례 페이지" data-in></nav>`);
  stagger(main);

  const st = { field: 'all', q: '', page: 1, size: 10, uc: 0 };
  const fromUrl = () => {
    const q = readQ();
    st.field = q.field in FIELDS ? q.field : 'all';
    st.q = (q.q || '').trim();
    st.page = Math.max(1, parseInt(q.page, 10) || 1);
    st.size = [10, 20, 50].includes(+q.size) ? +q.size : 10;
    st.uc = USECASES.some((u) => u.id === +q.uc) ? +q.uc : 0;
  };
  const toUrl = (push = true) => writeQ({ field: st.field === 'all' ? '' : st.field, q: st.q, page: st.page > 1 ? st.page : '', size: st.size !== 10 ? st.size : '', uc: st.uc || '' }, { push });
  const filtered = () => {
    const kw = st.q.toLowerCase();
    return USECASES.filter((u) => !kw || (st.field !== 'content' && u.title.toLowerCase().includes(kw)) || (st.field !== 'title' && u.content.toLowerCase().includes(kw)));
  };

  const form = $('#uc-form'), input = $('#uc-q'), field = $('#uc-field'), listEl = $('#uc-list');
  form.addEventListener('submit', (e) => { e.preventDefault(); st.q = input.value.trim(); st.field = field.value; st.page = 1; toUrl(); draw(); announce(`검색 결과 ${filtered().length}건`); });
  form.addEventListener('reset', (e) => { e.preventDefault(); Object.assign(st, { field: 'all', q: '', page: 1 }); toUrl(); draw(); announce(`전체 ${USECASES.length}건`); });
  const pager = mountPager($('#uc-pager'), { total: 0, page: 1, size: 10, onChange: ({ page, size }) => { st.page = page; st.size = size; toUrl(); drawList(); } });

  const figure = (u, no) => { const im = UC_IMG[u.id]; return `<span class="uc-img"><img src="${esc(im.src)}" alt="" loading="lazy">${no ? `<span class="uc-img-no n">${no}</span>` : ''}<span class="uc-img-cap">${icon('image', 14)}${esc(im.cap)}</span></span>`; };
  function drawList() {
    const all = filtered();
    const pages = Math.max(1, Math.ceil(all.length / st.size)); if (st.page > pages) st.page = pages;
    const from = (st.page - 1) * st.size;
    if (!all.length) {
      listEl.innerHTML = `<div class="empty uc-empty">${icon('search', 34)}<p class="empty-t">검색 조건에 맞는 활용 사례가 없습니다.</p><p class="empty-w">${esc(`${FIELDS[st.field]} “${st.q}”`)} — 초기화를 누르면 전체 ${USECASES.length}건으로 돌아간다</p></div>`;
    } else {
      listEl.innerHTML = `<div class="uc-grid">${all.slice(from, from + st.size).map((u, i) => `<button type="button" class="uc-card" data-uc="${u.id}" aria-haspopup="dialog" aria-label="${esc(u.title)} — 상세 보기">
${figure(u, String(from + i + 1).padStart(2, '0'))}
<span class="uc-body"><span class="uc-meta"><span class="n">${ymd(u.date)}</span>${u.attachments.length ? `<i></i><span class="mic">${icon('clip', 14)}첨부 ${u.attachments.length}</span>` : ''}</span>
<span class="uc-t d">${ucTitle(u.title)}</span>
<span class="uc-ex">${esc(u.content.split('\n')[0].slice(0, 118))}…</span></span></button>`).join('')}</div>`;
    }
    $('#uc-pager').classList.toggle('uc-pager--e', !all.length);
    pager.set({ total: all.length, page: st.page, size: st.size });
  }
  listEl.addEventListener('click', (e) => { const c = e.target.closest('[data-uc]'); if (!c) return; st.uc = +c.dataset.uc; toUrl(); openDetail(); });

  /* ── 상세 모달 ── */
  let modal = null;
  function openDetail() {
    const u = USECASES.find((v) => v.id === st.uc);
    if (modal) { const m = modal; modal = null; m.close('swap'); }
    if (!u) return;
    const m = openModal({
      title: '활용 사례', width: 1080,
      content: `<div class="uc-m-l">${figure(u)}<h3 class="uc-m-t d" id="uc-m-t">${ucTitle(u.title)}</h3>
${u.attachments.length ? `<section class="sp-att" aria-label="첨부 파일"><h4 class="sp-att-h"><span class="d">첨부 파일</span><span class="n">${u.attachments.length}</span></h4>${u.attachments.map((a) => fileRow(a)).join('')}</section>` : ''}</div>
<div class="uc-m-r" tabindex="0" role="group" aria-label="본문"><div class="prose">${esc(u.content)}</div></div>`,
      actions: [{ label: '닫기', kind: 'bracket' }],
      onClose: (v) => { if (v === 'swap' || v === 'pop') return; modal = null; if (st.uc) { st.uc = 0; toUrl(); } },
    });
    modal = m;
    m.el.classList.add('uc-modal');
    $('.modal-h h2', m.el).insertAdjacentHTML('afterend', `<span class="n uc-m-date">${ymd(u.date)}</span>`);
    $('.modal-x', m.el)?.insertAdjacentHTML('beforebegin', '<span class="uc-m-esc" aria-hidden="true">Esc</span>');
    bindDownloads(m.el);
  }

  function draw() { input.value = st.q; field.value = st.field; drawList(); }
  window.addEventListener('popstate', () => {
    fromUrl(); draw();
    if (st.uc) openDetail(); else if (modal) { const m = modal; modal = null; m.close('pop'); }
  });
  fromUrl(); draw();
  if (st.uc) openDetail();
}
