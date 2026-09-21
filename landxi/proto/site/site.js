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
        <a class="lx-nav lx-link" href="platform.html"${page === 'platform' ? ' aria-current="page"' : ''}>활용 서비스</a>
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

const page = document.body.dataset.page;              // 'notice' | 'usecase' | 'platform'
const rows = () => (page === 'notice' ? (window.SP_NOTICES || []) : (window.SP_USECASES || []));

const LABEL = { notice: 'NOTICE', usecase: 'USE CASE', platform: 'PLATFORMS' };
const HEAD = { notice: '공지사항', usecase: '활용 사례', platform: '활용 서비스' };
const LEAD = {
  notice: '주요 운영 공지와 업데이트 소식입니다.',
  usecase: '현장에서 실제로 쓰인 사례입니다. 무엇을 풀었고 무엇이 달라졌는지 적었습니다.',
  platform: 'Land-XI 로 세운 기관 플랫폼입니다. 각 기관이 제 이름으로 운영하고, AI 판독과 모델 갱신은 LX 가 맡습니다.',
};

/* ── 활용 서비스 — 기관 플랫폼으로 가는 길 ──────────────────────────────
   발주자(2026-09-21): "활용서비스 탭을 하나 만들고 거기에 남원시 GeoVision 플랫폼,
                        전남광주 AI 플랫폼 이런 형태로 접근 루트를 만들자."

   기관 포털은 LX 사이트의 하위 화면이 아니라 **다른 사이트**다. 그래서 이 판은 목록이 아니라
   **입구**다 — 누르면 그 기관의 제 문(portal-login-<기관>.html)으로 간다. LX 로그인이 아니다.
   숫자와 얼굴은 전부 그 기관의 실제 배포본·판독 결과에서 온다. 지어내지 않는다. */
let PLATFORMS = [];
async function loadPlatforms() {
  const [p, b, c] = await Promise.all([
    import('../../assets/data/portal.js'),
    import('../../assets/data/brand.js'),
    import('../../assets/data/emblems.js'),
  ]);
  PLATFORMS = p.TENANTS.filter((t) => t.kind === 'user').map((t) => {
    const th = b.themeOf(t.id), s = p.portalSummary(t.id);
    /* 얼굴은 **그 기관의 대표 서비스 판**이다(emblems.js) — 카드 덱·기관 입구와 같은 판.
       정사영상 크롭을 걸었다가 걷었다: 확대한 사진 조각은 어느 서비스인지 알아볼 수 없다. */
    const list = p.serviceCards(t.id);
    const pick = list.find((x) => x.status === '운영') || list[0];
    const face = pick && c.emblemOf(pick.cardId) ? { svg: c.emblemOf(pick.cardId), cap: pick.name } : null;
    return { id: t.id, name: th.platform || `${th.short} 플랫폼`, org: th.name, accent: th.accent,
      total: s.total, live: s.live, years: s.years, face,
      href: `../portal-login-${t.id}.html`,
      cards: p.serviceCards(t.id).map((x) => `${x.name} · ${x.year}`) };
  });
}

function platforms() {
  if (!PLATFORMS.length) return '<p class="st-empty">플랫폼을 불러오는 중입니다.</p>';
  return `<ul class="st-pf">${PLATFORMS.map((f) => {
    const span = f.years.length ? `${f.years[0]}–${f.years[f.years.length - 1]}년 사업` : '';
    return `<li class="st-pf-i"><a href="${esc(f.href)}" style="--pf:${esc(f.accent)}">
      <span class="st-pf-face">${f.face
    ? `${f.face.svg}<em>${esc(f.face.cap)}</em>`
    : '<em>판독 결과가 들어오면 이 자리에 실제로 찾아 준 자리가 걸립니다.</em>'}</span>
      <span class="st-pf-b">
        <span class="st-pf-org">${esc(f.org)}${span ? ` · ${esc(span)}` : ''}</span>
        <strong class="st-pf-n">${esc(f.name)}</strong>
        <span class="st-pf-s">${f.cards.map((n) => `<em>${esc(n)}</em>`).join('')}</span>
        <span class="st-pf-f"><b>${f.total}</b>개 서비스<i></i>운영 중 <b>${f.live}</b>개<span class="sp"></span><u>들어가기 →</u></span>
      </span>
    </a></li>`;
  }).join('')}</ul>`;
}
const readQ = () => new URLSearchParams(location.search);
const go = (q, push = true) => {
  const u = location.pathname + (q ? `?${q}` : '');
  if (push) history.pushState(null, '', u); else history.replaceState(null, '', u);
  render();
};

render();
// 활용 서비스는 기관 데이터를 읽어야 그린다 — 먼저 한 번 그려 틀을 세우고, 오면 다시 그린다.
if (page === 'platform') loadPlatforms().then(render);
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
          <p class="lx-label"><i class="lx-ret is-in"></i>${LABEL[page] || 'USE CASE'}</p>
          <h1 class="lx-h1">${HEAD[page] || '활용 사례'}</h1>
          <p class="lx-lead">${LEAD[page] || ''}</p>
        </div>
        <span class="st-rule"></span>
      </div>
      <div class="lx-grid">${page === 'platform' ? platforms()
    : item ? read(item) : (page === 'notice' ? list(pg) : cards(pg))}</div>
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
