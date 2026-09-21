/* 필름 뒤 세 칸 — 활용 사례(좌우 슬라이딩) · 게스트 게시판 · 푸터. (2026-09-22)
 *
 *   발주자: "마우스 휠로 끝까지 내리면 로그인 시작하기 에서 끝나지만 더 내려가면
 *            활용 사례가 카드 처럼 좌우로 슬라이딩 하는 그런 느낌을 살리는 칸이 필요하고
 *            그 아래 내려가면 공지사항이나 문의하기 등 게스트 들이 볼 수 있는 게시판 공간이
 *            있어야 한다. 그리고 하단에는 패밀리 사이트 문의하기 등 기본 정보들이 있어야 하고"
 *
 * 자료는 **공개 게시판과 같은 것**을 읽는다(support-data.js · portal.js · brand.js).
 * 메인에만 따로 적기 시작하면 반드시 어긋난다 — 공개 게시판을 만들 때 세운 규칙 그대로다.
 * 스크롤 엔진은 건드리지 않는다. 이 칸들은 #top 바깥이고, 고정된 무대 위를 덮으며 올라온다.
 */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ymd = (s) => String(s || '').replace(/-/g, '.');

/* ── 활용 사례 — 카드가 가로로 흐른다 ───────────────────────────────────
   세로로 쌓지 않는다. 가로 흐름은 **이 칸의 기능**이라 판 안쪽 스크롤 금지와 다른 이야기다
   (업무 화면에서 내용이 숨는 것과, 갤러리를 옆으로 넘기는 것은 다르다).
   그래도 스크롤바에 기대지 않고 ‹ › 로도 넘어가게 둔다 — 휠만으로는 가로로 못 가는 사람이 있다. */
const ucs = (window.SP_USECASES || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
const strip = $('#sb-t-strip');
if (strip) {
  strip.innerHTML = ucs.length ? ucs.map((r) => `<li class="sb-t-card">
    <a href="../site/usecase.html?id=${encodeURIComponent(r.id)}">
      <figure>${r.thumb ? `<img src="../../${esc(r.thumb)}" alt="" loading="lazy" decoding="async">` : ''}</figure>
      <b>${esc(r.title)}</b>
      <span class="n">${esc(ymd(r.date))}</span>
    </a></li>`).join('')
    : '<li class="sb-t-none">등록된 사례가 없습니다.</li>';

  /* 한 번에 한 장씩. 카드 폭을 **재서** 옮긴다 — 화면마다 카드 폭이 달라서 고정값을 쓸 수 없다. */
  const step = (dir) => {
    const card = strip.querySelector('.sb-t-card');
    const w = card ? card.getBoundingClientRect().width + 20 : 320;
    strip.scrollBy({ left: dir * w, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  document.querySelectorAll('[data-uc]').forEach((b) => b.addEventListener('click', () => step(+b.dataset.uc)));
  /* 끝에 닿으면 화살표를 죽인다 — 눌러도 안 움직이는 버튼을 남기지 않는다. */
  const sync = () => {
    const max = strip.scrollWidth - strip.clientWidth - 1;
    document.querySelectorAll('[data-uc]').forEach((b) => {
      b.disabled = +b.dataset.uc < 0 ? strip.scrollLeft <= 0 : strip.scrollLeft >= max;
    });
  };
  strip.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  sync();
}

/* ── 공지사항 — 고정 글 먼저, 그다음 최신순. 공개 게시판과 같은 정렬이다. ── */
const nt = $('#sb-t-notice');
if (nt) {
  const rows = (window.SP_NOTICES || []).slice()
    .sort((a, b) => (b.pinned - a.pinned) || String(b.date).localeCompare(String(a.date))).slice(0, 5);
  nt.innerHTML = rows.length ? rows.map((r) => `<li>
    <a href="../site/notice.html?id=${encodeURIComponent(r.id)}">
      ${r.pinned ? '<em>고정</em>' : ''}<span>${esc(r.title)}</span><i class="n">${esc(ymd(r.date))}</i></a></li>`).join('')
    : '<li class="sb-t-none">등록된 공지가 없습니다.</li>';
}

/* ── 기관 플랫폼 · 패밀리 사이트 — 선언에서 읽는다(손으로 적지 않는다). ── */
Promise.all([
  import('../../assets/data/portal.js'),
  import('../../assets/data/brand.js'),
]).then(([p, b]) => {
  const list = p.TENANTS.filter((t) => t.kind === 'user').map((t) => {
    const th = b.themeOf(t.id);
    return { name: th.platform || `${th.short} 플랫폼`, href: `../portal-login-${t.id}.html` };
  });
  const pf = $('#sb-t-pf');
  if (pf) pf.innerHTML = list.map((f) => `<li><a class="lx-link" href="${esc(f.href)}">${esc(f.name)} ›</a></li>`).join('');
  const fam = $('#sb-t-fam');
  if (fam) {
    fam.innerHTML = [{ name: 'Land-XI 소개', href: 'index.html' }, ...list]
      .map((f) => `<li><a href="${esc(f.href)}">${esc(f.name)}</a></li>`).join('');
  }
}).catch(() => { /* 선언을 못 읽으면 그 자리는 비워 둔다 — 지어내지 않는다 */ });
