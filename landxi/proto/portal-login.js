/* 기관 입구 — 남원시 화면을 보러 온 사람이 만나는 첫 문.
 *
 *   발주자(2026-09-21): "사실 다른 사이트라고 생각하고 해야지. 지자체에서는 나만의 AI 시스템인
 *                        것처럼 보여야 한다. LX에 위탁은 하지만."
 *
 * 골격은 생성기가 찍고(portal-gen.mjs), 이 파일은 **그 기관의 것**으로 채운다.
 * 얼굴은 지어내지 않는다 — 그 기관이 실제로 판독한 자리에서 고른다. 하나도 없으면
 * 얼굴 대신 무엇을 할 사이트인지 한 줄이 선다. 남의 영상을 빌려다 걸지 않는다.
 */
import { esc } from './shell.js';
import { serviceCards, portalSummary, evidenceOf, tenantById } from '../assets/data/portal.js';
import { themeOf } from '../assets/data/brand.js';
import { emblemOf } from '../assets/data/emblems.js';

const body = document.body;
const TENANT = body.dataset.tenant || 'namwon';
const th = themeOf(TENANT);
const t = tenantById(TENANT);
const $ = (s) => document.querySelector(s);
const slot = (id) => document.querySelector(`[data-slot="${id}"]`);

/* 어디로 들여보낼 것인가 — 관문이 붙여 준 ?next 가 있으면 그리로, 없으면 그 기관의 홈.
   **바깥 주소로는 보내지 않는다.** next 는 같은 폴더의 파일 이름일 때만 따른다. */
const HOME = 'portal.html';
const nextOf = () => {
  const raw = new URLSearchParams(location.search).get('next') || '';
  return /^[\w.-]+\.html(\?[^#]*)?$/.test(raw) ? raw : HOME;
};

/* ── 얼굴 — 이 기관이 무엇을 찾는 곳인가 ─────────────────────────────
   정사영상 크롭을 걸었다가 걷었다. 확대한 사진 조각은 어느 서비스인지 알아볼 수 없다
   (2026-09-21 발주자: "저렇게 정사영상 해놓으면 좀 허접하자나").
   대신 그 기관이 **운영 중인 첫 서비스의 얼굴판**을 건다 — 카드 덱과 같은 판, 같은 약속. */
const cards = serviceCards(TENANT);
const pick = cards.find((c) => c.status === '운영') || cards[0];
const em = pick ? emblemOf(pick.cardId) : '';
if (em) {
  slot('face').innerHTML = `${em}<p class="pl-face-c">${esc(pick.name)}</p>`;
} else {
  slot('face').classList.add('pl-face--none');
  slot('face').innerHTML = '<p class="pl-face-c">서비스가 배포되면 이 자리에 그 서비스의 얼굴이 걸립니다.</p>';
}

/* ── 소개 한 줄 — 이 기관이 지금 무엇을 가지고 있는가(세지 않고 읽는다) ── */
const s = portalSummary(TENANT);
slot('intro').textContent = s.total
  ? `${th.short}가 쓰는 AI 서비스 ${s.total}개 · 운영 중 ${s.live}개. 드론·항공 정사영상을 판독해 우리 업무에 바로 씁니다.`
  : `${th.platform || th.short}. 서비스가 배포되면 여기에서 바로 쓸 수 있습니다.`;
document.title = `로그인 — ${th.platform || th.short}`;

/* ── 들어가기 ──────────────────────────────────────────────────────────
   콘티다. 아이디·비밀번호를 맞춰 보지 않고, 채웠는지만 본다 — 시연 계정이 따로 없다.
   빈 칸이면 **첫 빈 칸으로 포커스**를 보낸다(다른 화면의 폼과 같은 규칙). */
const err = $('#pl-e');
$('#pl-f').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = $('#pl-id'), pw = $('#pl-pw');
  const miss = !id.value.trim() ? id : !pw.value.trim() ? pw : null;
  if (miss) {
    err.textContent = '아이디와 비밀번호를 모두 입력해 주세요.';
    err.hidden = false; miss.focus(); return;
  }
  err.hidden = true;
  try { localStorage.setItem('lx_logged_in', '1'); } catch { /* 저장소 차단 */ }
  location.href = nextOf();
});
