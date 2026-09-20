/* 공개 게시판 — 공지사항 · 활용 사례 (2026-09-20)
   발주자: "메인과 톤앤매너를 맞춰 새로 공지사항이랑 활용 사례 게시판 만들어야겠다"

   로그인 전에 보는 화면은 메인의 연장이어야 한다. 그래서 앱 셸(레일·마스트헤드·탭)을
   쓰지 않고 메인과 같은 부품(system.css)으로 짠다.
   데이터는 서비스 지원과 **같은 것**을 읽는다(support-data.js) — 화면이 둘일 뿐 내용은 하나다.
   공지를 두 곳에 따로 쓰기 시작하면 반드시 어긋난다.

   URL 이 상태다. `?id=` 가 있으면 읽기, 없으면 목록. 뒤로 가기가 그대로 동작한다. */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (s) => String(s || '').replace(/-/g, '.');

const CAT = { urgent: ['긴급', true], work: ['업무', false], system: ['시스템', false], notice: ['안내', false] };
const SIZE = 8;

/** 마스트헤드 — 메인과 같은 마크·같은 글자. 오른쪽은 로그인 하나뿐이다. */
function mast() {
  return `<header class="lx-masthead st-mast">
    <div class="lx-grid lx-masthead__in">
      <a class="lx-masthead__mark" href="../scrub/index.html">LAND-XI</a>
      <nav class="lx-masthead__nav" aria-label="주요">
        <a class="lx-nav lx-link" href="notice.html"${page === 'notice' ? ' aria-current="page"' : ''}>공지사항</a>
        <a class="lx-nav lx-link" href="usecase.html"${page === 'usecase' ? ' aria-current="page"' : ''}>활용 사례</a>
      </nav>
      <div class="lx-masthead__meta">
        <a class="lx-nav lx-link st-signin" href="../login.html">로그인</a>
      </div>
    </div>
  </header>`;
}
function foot() {
  return `<footer class="st-foot"><div class="lx-grid">
    <p>LX 한국국토정보공사 · 고객센터 063-713-1213 · (우)54870 전북 전주시 덕진구 기지로 120</p>
  </div></footer>`;
}

const page = document.body.dataset.page;              // 'notice' | 'usecase'
const rows = () => (page === 'notice' ? (window.SP_NOTICES || []) : (window.SP_USECASES || []));
const readQ = () => new URLSearchParams(location.search);
const go = (q, push = true) => {
  const u = location.pathname + (q ? `?${q}` : '');
  if (push) history.pushState(null, '', u); else history.replaceState(null, '', u);
  render();
};

render();
addEventListener('popstate', render);

function render() {
  const q = readQ();
  const id = q.get('id');
  const pg = Math.max(1, +(q.get('p') || 1));
  const item = id ? rows().find((r) => String(r.id) === String(id)) : null;

  document.body.innerHTML = `
    ${mast()}
    <main class="st-main" id="main" tabindex="-1">
      <div class="lx-grid st-head">
        <div class="lx-c8">
          <p class="lx-label"><i class="lx-ret is-in"></i>${page === 'notice' ? 'NOTICE' : 'USE CASE'}</p>
          <h1 class="lx-h1">${page === 'notice' ? '공지사항' : '활용 사례'}</h1>
          <p class="lx-lead">${page === 'notice'
    ? '주요 운영 공지와 업데이트 소식입니다.'
    : '현장에서 실제로 쓰인 사례입니다. 무엇을 풀었고 무엇이 달라졌는지 적었습니다.'}</p>
        </div>
        <span class="st-rule"></span>
      </div>
      <div class="lx-grid">${item ? read(item) : (page === 'notice' ? list(pg) : cards(pg))}</div>
    </main>
    ${foot()}`;
  bind();
  if (item) $('#main').focus({ preventScroll: true });
  scrollTo(0, 0);
}

/* ── 공지 목록 ─────────────────────────────────────────────────────────── */
function list(pg) {
  const all = [...rows()].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const slice = all.slice((pg - 1) * SIZE, pg * SIZE);
  if (!slice.length) return '<p class="st-empty">등록된 공지가 없습니다.</p>';
  return `<ol class="st-list">${slice.map((r, i) => {
    const [label, hot] = CAT[r.category] || ['안내', false];
    return `<li class="st-row"><a href="?id=${r.id}" data-id="${r.id}">
      <span class="st-no">${r.pinned ? '고정' : String(all.length - ((pg - 1) * SIZE + i)).padStart(2, '0')}</span>
      <span class="st-t"><em class="st-tag${hot ? ' st-tag--on' : ''}">${esc(label)}</em>${esc(r.title)}</span>
      <span class="st-d">${esc(ymd(r.date))}</span>
    </a></li>`;
  }).join('')}</ol>${pager(all.length, pg)}`;
}

/* ── 활용 사례 — 그림이 먼저 말한다 ────────────────────────────────────── */
function cards(pg) {
  const all = [...rows()].sort((a, b) => b.date.localeCompare(a.date));
  const slice = all.slice((pg - 1) * 6, pg * 6);
  if (!slice.length) return '<p class="st-empty">등록된 사례가 없습니다.</p>';
  return `<ul class="st-cards">${slice.map((r) => `
    <li class="st-card"><a href="?id=${r.id}" data-id="${r.id}">
      <figure>${r.thumb ? `<img src="../../${esc(r.thumb)}" alt="" loading="lazy" decoding="async">` : ''}</figure>
      <h2 class="st-t">${esc(r.title)}</h2>
      <p class="lx-cap">${esc(ymd(r.date))}</p>
    </a></li>`).join('')}</ul>${pager(all.length, pg, 6)}`;
}

/* ── 읽기 ─────────────────────────────────────────────────────────────── */
function read(r) {
  const [label] = CAT[r.category] || ['안내'];
  return `<article class="st-read">
    <header class="st-read-h">
      <h2 class="st-t">${page === 'notice' ? `<em class="st-tag">${esc(label)}</em>` : ''}${esc(r.title)}</h2>
      <p class="lx-cap">${esc(ymd(r.date))}</p>
    </header>
    <div class="st-body">${esc(r.content)}</div>
    ${(r.attachments || []).length ? `<ul class="st-files">${r.attachments.map((a) => `
      <li><button type="button" data-dl="${esc(a.name)}">${esc(a.name)}<span class="n">${esc(a.size)}</span></button></li>`).join('')}</ul>` : ''}
    <a class="st-back" href="${location.pathname}">‹ 목록으로</a>
  </article>`;
}

function pager(total, pg, size = SIZE) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last < 2) return '';
  const n = [];
  for (let i = 1; i <= last; i++) n.push(`<button type="button" data-p="${i}"${i === pg ? ' aria-current="page"' : ''}>${i}</button>`);
  return `<nav class="st-pager" aria-label="쪽 넘김">
    <button type="button" data-p="${pg - 1}"${pg === 1 ? ' disabled' : ''}>이전</button>
    ${n.join('')}
    <button type="button" data-p="${pg + 1}"${pg === last ? ' disabled' : ''}>다음</button></nav>`;
}

function bind() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (a) { e.preventDefault(); go(`id=${a.dataset.id}`); return; }
    const p = e.target.closest('[data-p]');
    if (p && !p.disabled) { go(+p.dataset.p > 1 ? `p=${p.dataset.p}` : ''); return; }
    const back = e.target.closest('.st-back');
    if (back) { e.preventDefault(); go(''); return; }
    const dl = e.target.closest('[data-dl]');
    // 첨부는 실제 파일이 없다 — 받는 척하지 않고 그 사실을 말한다(콘티 원칙).
    if (dl) { say(`${dl.dataset.dl} — 시연 화면이라 실제 파일은 붙어 있지 않습니다`); }
  }, { once: true });
}

let sayEl = null;
function say(msg) {
  if (!sayEl) {
    sayEl = document.createElement('p');
    sayEl.setAttribute('role', 'status');
    sayEl.style.cssText = 'position:fixed;left:var(--lx-margin);bottom:16px;margin:0;z-index:30;'
      + 'font-family:var(--lx-num);font-size:var(--lx-cap);color:var(--lx-grey-2);'
      + 'background:var(--lx-paper);border:1px solid var(--lx-hair);padding:8px 12px';
    document.body.append(sayEl);
  }
  sayEl.textContent = msg;
  clearTimeout(say.t); say.t = setTimeout(() => { sayEl.textContent = ''; }, 4200);
}
