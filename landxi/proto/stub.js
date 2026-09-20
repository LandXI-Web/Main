// 자리 화면 — 아직 구현되지 않은 메뉴가 **그 화면의 설계 원판**을 보여준다(2026-09-20 전수 검토 A5 · 선택 1).
// 막다른 길 0: 대시보드·데이터 관리 레일, 관리 타일, 공지, 로그인의 찾기/신청 링크가 전부 여기로 닿는다.
// 원판 목록은 빌드 산출물 stub-data.json(tools/review/stub-data.mjs 가 canvas.json + masters STATUS 에서 만든다).
const KEY = document.documentElement.dataset.stub || new URLSearchParams(location.search).get('m') || 'project';
const BASE = document.documentElement.dataset.base || '';            // proto/ 기준 상대 경로
const AUTH = KEY === 'auth';
if (!AUTH && localStorage.getItem('lx_logged_in') !== '1') location.replace(BASE + 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));

const NAV = [['dashboard', '대시보드', 'dashboard.html'], ['media', '데이터\n관리', 'dataset.html'], ['project', '프로젝트', 'ai-project.html'], ['analysis', '분석\n서비스', 'analysis-ai.html'], ['map', '지도\n서비스', 'ximap.html']];
const NAV2 = [['support', '서비스\n지원', 'notice.html'], ['publish', '카드 발행\n관리', 'admin-publish.html'], ['admin', '서비스\n관리', 'admin-notice.html'], ['my', 'MY', 'mypage.html']];
const IC = { dashboard: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>', media: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>', project: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>', analysis: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>', map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>', support: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>', publish: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>', admin: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>', my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>', out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>', mark: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M8.5 8.5h3v3h-3z" fill="currentColor" stroke="none"/>' };
const svg = (k, s = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${IC[k]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const data = await fetch(BASE + 'stub-data.json').then((r) => r.json());
const G = data.groups[KEY] || data.groups.project;
document.title = `${G.name} — 설계 원판 · Land-XI`;

const item = ([k, n, h]) => `<a class="ri" href="${BASE}${h}"${k === G.rail ? ' aria-current="page"' : ''}>${svg(k)}<span>${esc(n)}</span></a>`;
const rail = AUTH ? '' : `<nav class="rail" aria-label="주 메뉴"><a class="mk" href="${BASE}dashboard.html" aria-label="Land-XI 대시보드">${svg('mark', 19)}<b>LAND XI</b></a><div class="rt">${NAV.map(item).join('')}</div><div class="rb">${NAV2.map(item).join('')}<button class="ri" id="lo" type="button">${svg('out')}<span>로그아웃</span></button></div></nav>`;

document.body.innerHTML = `<a class="skip" href="#main">본문으로 건너뛰기</a>${rail}
<main id="main" class="${AUTH ? 'wide' : ''}">
<header class="mh"><span class="chip">설계 원판</span><span class="mh-t">이 메뉴는 아직 구현 전입니다 — 아래는 검토 중인 <b>디자인 원판</b>이고, 눌러도 동작하지 않습니다.</span><span class="sp"></span><a href="${BASE}review/index.html">검토 허브 ›</a><a href="${BASE}review/masters.html">원판 갤러리 ›</a></header>
<div class="hd"><h1>${esc(G.name)}</h1><span class="dn">${esc(G.decision || '')}</span><span class="cnt"><b id="ix">1</b> / ${G.boards.length}</span></div>
<div class="rule"></div>
<figure class="fg"><div class="im"><img id="im" alt=""><span class="wm">원판 · 구현 전</span><button class="nv pv" id="pv" type="button" aria-label="이전 원판">‹</button><button class="nv nx" id="nx" type="button" aria-label="다음 원판">›</button></div><figcaption id="cap"></figcaption></figure>
<div class="th" id="th" role="listbox" aria-label="원판 목록">${G.boards.map((b, i) => `<button type="button" role="option" data-i="${i}" title="${esc(b.title)}"><img src="${BASE}../../design-canvas/v2/renders/${b.id}.png" alt="" loading="lazy"><span>${esc(b.short)}</span></button>`).join('')}</div>
</main>`;

let cur = 0; const im = document.getElementById('im'), cap = document.getElementById('cap'), ix = document.getElementById('ix'), th = [...document.querySelectorAll('#th button')];
function show(i, push = true) { cur = (i + G.boards.length) % G.boards.length; const b = G.boards[cur]; im.src = `${BASE}../../design-canvas/v2/renders/${b.id}.png`; im.alt = b.title; cap.innerHTML = `<b>${esc(b.title)}</b><span>${esc(b.note || '')}</span>`; ix.textContent = cur + 1; th.forEach((t, k) => { t.setAttribute('aria-selected', String(k === cur)); if (k === cur) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }); if (push) history.replaceState(null, '', `#${b.id}`); }
document.getElementById('pv').onclick = () => show(cur - 1); document.getElementById('nx').onclick = () => show(cur + 1);
th.forEach((t) => (t.onclick = () => show(+t.dataset.i)));
addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
document.getElementById('lo')?.addEventListener('click', () => { try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ } location.href = BASE + 'scrub/index.html'; });
// 딥링크: #원판id, 또는 원본 파일명으로 들어온 경우 그 화면의 첫 원판
const want = location.hash.slice(1) || document.documentElement.dataset.first || '';
show(Math.max(0, G.boards.findIndex((b) => b.id === want || (want && b.id.includes(want)))), false);
