/* 자주 묻는 질문 — 좌 = 구분 레일(원본 select 6 + 전체 · 건수), 우 = 검색 막대 + 아코디언. 원판 B6-Support-FAQ · -FAQ-Empty.
   원본 기능 1:1 — 구분 · 검색 필드(전체/질문/답변) · 검색어 · 초기화/검색 · Enter · 아코디언(여러 개 열림) · ?faq=<id> 자동 펼침 · 빈 상태.
   URL: ?cat=02&field=title&q=…&faq=5,7   (faq = 열린 항목. 원본처럼 숫자 하나만 와도 된다) */
import { boot, readQ, writeQ, stagger, announce, icon, esc, $, $$ } from './support.js';
import { FAQS, FCAT } from './support-data.js';

if (boot('faq')) init();

function init() {
  const main = $('#main');
  const FIELDS = { all: '전체', title: '질문', content: '답변' };
  main.insertAdjacentHTML('beforeend', `
<div class="fq">
  <aside class="fq-side" data-in aria-label="구분">
    <p class="lb" id="fq-cat-l">구분</p>
    <div class="fq-cats" role="group" aria-labelledby="fq-cat-l" id="fq-cats"></div>
    <div class="fq-more"><p class="mic">찾는 답이 없으면</p><a class="btn-br" href="contact.html">문의하기 ›</a></div>
  </aside>
  <section class="fq-main" aria-label="질문 목록">
    <form class="fq-bar sp-bar" id="fq-form" role="search" aria-label="자주 묻는 질문 검색" data-in>
      <label class="lb" for="fq-q">검색어</label>
      <div class="sp-bar-row">
        <span class="sel"><select id="fq-field" aria-label="검색 필드">${Object.entries(FIELDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></span>
        <label class="inp-ic">${icon('search', 16)}<input id="fq-q" class="inp" type="search" placeholder="검색어" autocomplete="off"></label>
        <span class="sp"></span>
        <button type="reset" class="btn-br">${icon('reset', 15)}초기화</button>
        <button type="submit" class="btn">${icon('search', 15)}검색</button>
      </div>
    </form>
    <div class="fq-list" id="fq-list" data-in></div>
  </section>
</div>`);
  stagger(main);

  const st = { cat: 'all', field: 'all', q: '', open: new Set() };
  const fromUrl = () => {
    const q = readQ();
    st.cat = q.cat in FCAT ? q.cat : 'all';
    st.field = q.field in FIELDS ? q.field : 'all';
    st.q = (q.q || '').trim();
    st.open = new Set(String(q.faq || '').split(',').map((v) => parseInt(v, 10)).filter((v) => FAQS.some((f) => f.id === v)));
  };
  const toUrl = (push = true) => writeQ({ cat: st.cat === 'all' ? '' : st.cat, field: st.field === 'all' ? '' : st.field, q: st.q, faq: [...st.open].join(',') }, { push });
  const filtered = () => {
    const kw = st.q.toLowerCase();
    return FAQS.filter((f) => (st.cat === 'all' || f.category === st.cat) && (!kw
      || (st.field !== 'content' && f.q.toLowerCase().includes(kw)) || (st.field !== 'title' && f.a.toLowerCase().includes(kw))));
  };

  const cats = $('#fq-cats'), list = $('#fq-list'), form = $('#fq-form'), input = $('#fq-q'), field = $('#fq-field');
  function drawCats() {
    const items = [['all', '전체', FAQS.length], ...Object.entries(FCAT).map(([k, l]) => [k, l, FAQS.filter((f) => f.category === k).length])];
    cats.innerHTML = items.map(([k, l, n]) => `<button type="button" class="fq-cat" data-cat="${k}" aria-pressed="${st.cat === k}"><span>${esc(l)}</span><span class="sp"></span><span class="n">${n}</span></button>`).join('');
  }
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    st.cat = b.dataset.cat; toUrl(); draw(); $(`[data-cat="${st.cat}"]`, cats)?.focus();
    announce(`${b.firstElementChild.textContent} · ${filtered().length}건`);
  });
  cats.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = $$('.fq-cat', cats), i = all.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length].focus();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); st.q = input.value.trim(); st.field = field.value; toUrl(); draw(); announce(`검색 결과 ${filtered().length}건`); });
  form.addEventListener('reset', (e) => { e.preventDefault(); st.cat = 'all'; st.field = 'all'; st.q = ''; toUrl(); draw(); announce(`전체 ${FAQS.length}건`); });

  function drawList() {
    const all = filtered();
    if (!all.length) {
      const why = [`구분 ${st.cat === 'all' ? '전체' : FCAT[st.cat]}`, st.q ? `${FIELDS[st.field]} “${st.q}”` : ''].filter(Boolean).join(' · ');
      list.innerHTML = `<div class="empty fq-empty">${icon('search', 34)}<p class="empty-t">검색 조건에 맞는 질문이 없습니다.</p><p class="empty-w">${esc(why)} — 초기화를 누르면 전체 ${FAQS.length}건으로 돌아간다</p></div>`;
      return;
    }
    list.innerHTML = all.map((f) => {
      const on = st.open.has(f.id);
      return `<div class="fq-item" data-id="${f.id}"><h3><button type="button" class="fq-q" id="fq-q-${f.id}" aria-expanded="${on}" aria-controls="fq-a-${f.id}"><span class="d fq-m" aria-hidden="true">Q</span><span class="fq-c">${esc(FCAT[f.category])}</span><span class="fq-t">${esc(f.q)}</span>${icon('chevD', 16)}</button></h3>
<div class="fq-a" id="fq-a-${f.id}" role="region" aria-labelledby="fq-q-${f.id}"${on ? '' : ' hidden'}><span class="d fq-m" aria-hidden="true">A</span><span class="fq-c"></span><div class="prose">${esc(f.a)}</div></div></div>`;
    }).join('');
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.fq-q'); if (!b) return;
    const id = +b.closest('.fq-item').dataset.id, on = !st.open.has(id);
    on ? st.open.add(id) : st.open.delete(id);
    b.setAttribute('aria-expanded', String(on));
    const a = $(`#fq-a-${id}`); a.hidden = !on; a.classList.toggle('sp-swap', on);
    toUrl(false);
  });
  list.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !e.target.matches('.fq-q')) return;
    const all = $$('.fq-q', list), i = all.indexOf(e.target); e.preventDefault();
    (e.key === 'Home' ? all[0] : e.key === 'End' ? all[all.length - 1] : all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]).focus();
  });

  function draw() { input.value = st.q; field.value = st.field; drawCats(); drawList(); }
  window.addEventListener('popstate', () => { fromUrl(); draw(); });
  fromUrl(); draw();
  /* ?faq=<id> 로 들어오면 그 항목으로 간다(원본) */
  const first = [...st.open][0];
  if (first) requestAnimationFrame(() => { const b = $(`#fq-q-${first}`); if (b) { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); } });
}
