// 자리 화면 — 아직 구현되지 않은 메뉴가 **그 화면의 설계 원판**을 보여준다(2026-09-20 전수 검토 A5 · 선택 1).
// 막다른 길 0: 대시보드·데이터 관리 레일, 관리 타일, 공지, 로그인의 찾기/신청 링크가 전부 여기로 닿는다.
// 원판 목록은 빌드 산출물 stub-data.json(tools/review/stub-data.mjs 가 canvas.json + masters STATUS 에서 만든다).
// 레일 · 관문 · 마스트헤드 · 제목 행 · 푸터는 공용 셸(shell.js)이 세운다 — 자리 화면과 구현 화면이 같은 레일을 쓴다(A4).
import { mountShell, esc } from './shell.js';

const KEY = document.documentElement.dataset.stub || new URLSearchParams(location.search).get('m') || 'project';
const BASE = document.documentElement.dataset.base || '';            // proto/ 기준 상대 경로
const AUTH = KEY === 'auth';                                         // 가입 · 찾기 = 로그인 전 화면 — 레일 · 관문 없음

const data = await fetch(BASE + 'stub-data.json').then((r) => r.json());
const G = data.groups[KEY] || data.groups.project;

document.body.innerHTML = `<main id="main">
<figure class="fg"><div class="im"><img id="im" alt=""><span class="wm">원판 · 구현 전</span><button class="nv pv" id="pv" type="button" aria-label="이전 원판">‹</button><button class="nv nx" id="nx" type="button" aria-label="다음 원판">›</button></div><figcaption id="cap"></figcaption></figure>
<div class="th" id="th" role="listbox" aria-label="원판 목록">${G.boards.map((b, i) => `<button type="button" role="option" data-i="${i}" title="${esc(b.title)}"><img src="${BASE}../../design-canvas/v2/renders/${b.id}.png" alt="" loading="lazy"><span>${esc(b.short)}</span></button>`).join('')}</div>
</main>`;
document.body.classList.add('stub');

const shell = mountShell({
  active: G.rail, base: BASE, rail: !AUTH, title: G.name, subtitle: esc(G.decision || ''), asOf: false, keepDocTitle: true,
  mastHtml: `<span class="chip chip--on">설계 원판</span><span class="mh-t">이 메뉴는 아직 구현 전입니다 — 아래는 검토 중인 <b>디자인 원판</b>이고, 눌러도 동작하지 않습니다.</span><span class="sp"></span><a class="link" href="${BASE}review/index.html">검토 허브 ›</a><a class="link" href="${BASE}review/masters.html">원판 갤러리 ›</a>`,
  headRight: `<span class="cnt n"><b id="ix">1</b> / ${G.boards.length}</span>`,
});
if (shell) {
  document.title = `${G.name} — 설계 원판 · Land-XI`;
  let cur = 0; const im = document.getElementById('im'), cap = document.getElementById('cap'), ix = document.getElementById('ix'), th = [...document.querySelectorAll('#th button')];
  const show = (i, push = true) => { cur = (i + G.boards.length) % G.boards.length; const b = G.boards[cur]; im.src = `${BASE}../../design-canvas/v2/renders/${b.id}.png`; im.alt = b.title; cap.innerHTML = `<b>${esc(b.title)}</b><span>${esc(b.note || '')}</span>`; ix.textContent = cur + 1; th.forEach((t, k) => { t.setAttribute('aria-selected', String(k === cur)); if (k === cur) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }); if (push) history.replaceState(null, '', `#${b.id}`); };
  document.getElementById('pv').onclick = () => show(cur - 1); document.getElementById('nx').onclick = () => show(cur + 1);
  th.forEach((t) => (t.onclick = () => show(+t.dataset.i)));
  addEventListener('keydown', (e) => { if (e.target.closest?.('input,select,textarea,#rail')) return; if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  // 딥링크: #원판id, 또는 원본 파일명으로 들어온 경우 그 화면의 첫 원판
  const want = location.hash.slice(1) || document.documentElement.dataset.first || '';
  show(Math.max(0, G.boards.findIndex((b) => b.id === want || (want && b.id.includes(want)))), false);
}
