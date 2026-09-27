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

/* 이 화면은 셸(레일·마스트헤드)을 쓰지 않는다. 토큰 때문에 shell.css 만 빌려 쓴다.
   그런데 shell.css 에는 **셸이 서기 전 한 프레임을 감추는** 규칙이 있다 —
   `html:not([data-shell]) body.lx #main { visibility:hidden }`.
   셸을 안 부르니 `data-shell` 이 영영 안 붙어, 화면이 통째로 비어 보였다(2026-09-21 라이브에서 드러남).
   글자는 다 있는데 눈에만 안 보이는 종류라 넘침·오류 검사에 걸리지 않았다.
   이 화면은 제가 다 그렸으므로 **섰다고 선언한다.** 맨 위에서 한다 — 그려지기 전에. */
document.documentElement.dataset.shell = 'ready';

const body = document.body;
const TENANT = body.dataset.tenant || 'namwon';
const th = themeOf(TENANT);
const t = tenantById(TENANT);
const $ = (s) => document.querySelector(s);
const slot = (id) => document.querySelector(`[data-slot="${id}"]`);

/* 어디로 들여보낼 것인가 — 관문이 붙여 준 ?next 가 있으면 그리로, 없으면 그 기관의 홈(TENANTS.home).
   **바깥 주소로는 보내지 않는다.** next 는 같은 폴더의 파일 이름일 때만 따른다.
   LX 세션으로 작업공간을 두드려 ?denied= 로 온 사람은, 기관 아이디로 들어온 뒤 **두드리던 그 화면**으로 간다. */
const HOME = t.home || 'portal.html';
const q = new URLSearchParams(location.search);
const SAFE0 = /^[\w.-]+\.html(\?[^#]*)?$/;
/* F2-R — 기관도 새 XI맵(실태조사 모드)으로 곧장 들어간다: `../xi/index.html?…` 한 줄만 더 허용(경로 고정 · 쿼리만 자유 · login.js 와 같은 규칙). */
const XI_NEXT = /^\.\.\/xi\/(?:index\.html)?(?:\?[^\s#\\]*)?$/;
const SAFE = { test: (v) => SAFE0.test(v) || XI_NEXT.test(v) };
const denied = q.get('denied');
const want = q.get('next') || (denied && /^portal[-.]/.test(denied) ? denied : '');
const nextOf = () => (SAFE.test(want) ? want : HOME);

/* ── 세션(MASTER-PLAN §7.1) — 기관 계정은 LX 계정과 **완전 별도**다(Q1). ── */
const tenantSession = () => { try { return JSON.parse(localStorage.getItem('lx_tenant_session') || 'null'); } catch { return null; } };
/* 이미 이 기관으로 들어와 있다 — 관문이 잠깐 보낸 것이다. 문 앞에 세워 두지 않는다. */
if (tenantSession()?.tenant === TENANT) location.replace(nextOf());

/* S8 — LX 세션으로 기관 작업공간을 두드렸다. 문 위에 **왜 막혔는지** 한 줄. LX 세션을 여기서 지우지 않는다
   (기관 아이디로 로그인하는 순간 R-S1 이 지운다). 주소에서 denied 는 걷는다(R-S5). */
if (denied !== null) {
  const line = document.createElement('p');
  line.className = 'pl-deny'; line.id = 'pl-deny'; line.setAttribute('role', 'status');
  line.textContent = '기관 작업공간은 기관 계정으로만 들어갑니다 — LX 계정은 로그아웃 뒤 기관 아이디로 로그인하세요';
  $('#pl-f').before(line);
  q.delete('denied');
  if (SAFE.test(want) && !q.get('next')) q.set('next', want);            // 두드리던 화면은 next 로 남긴다
  history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
}

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
  /* 기관 signIn(R-S1) — 기관 세션을 세우고 LX 세션은 지운다. 전에는 lx_logged_in 을 세워
     기관 로그인이 곧 LX 관리자 권한이 되었다(portal P0-1 · DEFAULT_ROLE admin). */
  try {
    localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: TENANT, at: new Date().toISOString() }));
    localStorage.removeItem('lx_logged_in');
    localStorage.removeItem('lx_role');
  } catch { /* 저장소 차단 */ }
  location.href = nextOf();
});
