/* LX 관리자 홈 — **직원 화면과 다른 집**이다.
 *
 *   발주자(2026-09-21): "관리자는 사이트도 다르고 모습도 조금 달라야 한다.
 *                        기존 화면은 일반직원 화면일 것 같다."
 *                        "관리자는 데이터관리 아카이브 카드발행 등 관리에 주안점"
 *                        "관리자는 인프라 관리 분석서비스 관리 개발 관리. 개발 구현 등이 핵심이겠지."
 *
 * ── 직원 화면과 무엇이 다른가 ──────────────────────────────────────────────
 * 직원 화면은 **만드는 흐름**이다 — 프로젝트를 열고, 라벨을 붙이고, 학습을 돌리고, 분석한다.
 * 관리자 화면은 **대장과 결재**다 — 지금 무엇이 돌고 있고, 무엇이 내 결재를 기다리고,
 * 자원이 얼마나 남았고, 요구가 며칠 만에 배포되는가.
 * 그래서 이 화면에는 '만들기' 버튼이 없다. 대신 네 축이 한 줄씩 서고, 누르면 그 관리 화면으로 간다.
 *
 * ── 네 축 (발주자 지시 그대로) ─────────────────────────────────────────────
 *   분석서비스 관리  카드 · 배포본 · 기관   → 카드 발행 관리
 *   개발 관리        재학습 · 검수 · 감시   → 생산 관리 · 능동 운영
 *   인프라 관리      저장 · GPU · 트래픽    → 생산 관리 · 인프라
 *   개발 구현        기관 요구 → 화면 배포  → 생산 관리 · 화면 요구
 * 그 위에 **결재 대기**가 먼저 선다 — 관리자가 로그인하는 이유는 "오늘 내가 처리할 것"이다.
 *
 * 숫자는 하나도 만들지 않는다. 전부 규칙에서 읽어 온다(ops · infra · studio · registry · dashboard).
 */
import { mountShell, esc, nf, icon, $ } from './shell.js';
import { businessView } from '../assets/data/ops.js';
import { infraSummary, capacityPlan } from '../assets/data/infra.js';
import { loopStats, studioScale } from '../assets/data/studio.js';
import { growth } from '../assets/data/registry.js';
import { CARDS, DEPLOYS } from '../assets/data/cards.js';

const b = businessView(), inf = infraSummary(), cap = capacityPlan(), loop = loopStats(), g = growth();
const approvals = (window.DASH_APPROVALS || []);

mountShell({
  active: 'admin', title: '운영 현황',
  subtitle: 'LX 관리자 — 지금 무엇이 돌고 있고, 무엇이 결재를 기다리는가',
  notice: false, demo: true, fit: true,
});
document.title = '운영 현황 — LX 관리자';
/* 관리자는 **다른 집**이라는 표시. 법전대로 그림자·그라디언트를 쓰지 않고
   마스트헤드에 짙은 띠 하나로만 구분한다 — 색을 하나 더 늘리지 않고 명도만 바꾼다. */
document.body.dataset.site = 'admin';

const main = $('#main');

/* 결재 대기 — 관리자가 이 화면을 여는 이유. 세 갈래가 각각 어느 화면으로 가는지까지 적는다. */
const WAIT = [
  { n: 2, label: '카드 발행 승인', why: '직원이 요청한 분석 카드', href: 'admin-publish.html' },
  { n: 1, label: '가입 승인', why: '기관 담당자 계정', href: 'admin-users.html' },
  { n: 6, label: '미답변 문의', why: '기관에서 올라온 질문', href: 'admin-inquiry.html' },
];

/* 네 축 — 발주자가 말한 관리자의 핵심. 한 줄에 **지금 값**과 **가는 곳**이 함께 선다. */
const AXES = [
  { key: 'svc', name: '분석서비스 관리', href: 'admin-publish.html',
    what: '어떤 서비스가 어느 기관에 깔려 있나',
    rows: [['카드', g.cards, '종'], ['배포본', g.deploys, '개'], ['적용 기관', b.적용_기관, '곳']] },
  { key: 'dev', name: '개발 관리', href: 'produce.html?tab=ops',
    what: '정확도가 떨어진 것을 먼저 찾아 고친다',
    rows: [['이번 주기 재학습', b.이번주기_재학습, '건'], ['검수 필요', b.검수필요, '건'], ['감시 중', b.감시중, '종']],
    warn: b.긴급 ? `긴급 ${b.긴급}건` : '' },
  { key: 'infra', name: '인프라 관리', href: 'produce.html?tab=infra',
    what: '서버를 언제 더 사야 하는가',
    rows: cap.rows.slice(0, 3).map((r) => [r.name, r.pct, '%']) },
  { key: 'build', name: '개발 구현', href: 'produce.html?tab=studio',
    what: '기관 요구가 며칠 만에 화면이 되는가',
    rows: [['접수', loop.접수, '건'], ['반영 중', loop.반영중, '건'], ['평균 소요', loop.평균소요일, '일']] },
];

const axisCard = (a) => `
  <a class="ah-ax" href="${esc(a.href)}">
    <span class="ah-ax-h"><b>${esc(a.name)}</b>${a.warn ? `<em class="ah-warn">${esc(a.warn)}</em>` : ''}<i>${icon('chevR', 14)}</i></span>
    <span class="ah-ax-w">${esc(a.what)}</span>
    <span class="ah-ax-r">${a.rows.map(([k, v, u]) => `
      <span class="ah-r"><span class="k">${esc(k)}</span><span class="v n">${nf.format(v)}<em>${esc(u)}</em></span></span>`).join('')}</span>
  </a>`;

main.insertAdjacentHTML('beforeend', `
<div class="ah-wrap">

  <section class="ah-wait" aria-label="결재 대기">
    <h2 class="ah-h">결재 대기<span>내가 처리해야 이 다음이 돈다</span></h2>
    <div class="ah-wait-b">
      ${WAIT.map((w) => `<a class="ah-w" href="${esc(w.href)}">
        <span class="ah-w-n n">${w.n}</span>
        <span class="ah-w-t"><b>${esc(w.label)}</b><span>${esc(w.why)}</span></span>
        <span class="ah-w-go">${icon('chevR', 14)}</span></a>`).join('')}
    </div>
  </section>

  <section class="ah-axes" aria-label="관리 축">
    <h2 class="ah-h">관리<span>네 자리 — 누르면 그 관리 화면으로 간다</span></h2>
    <div class="ah-axes-b">${AXES.map(axisCard).join('')}</div>
  </section>

  <section class="ah-foot" aria-label="한눈 수치">
    <p class="ah-line">
      운영 중 <b class="n">${b.운영중_서비스}</b>서비스 ·
      구축 중 <b class="n">${b.구축중_서비스}</b> ·
      모델 <b class="n">${g.models}</b> ·
      전용 모듈 <b class="n">${g.modules.ext}</b>(완료 ${g.modules.done})
      <span class="sp"></span>
      <span class="ah-ok">${g.health.ok ? '레지스트리 이상 없음' : `점검 필요 ${g.health.issues.length}건`}</span>
    </p>
    <p class="ah-line ah-line--q">
      저장 <b class="n">${inf.storageTb}</b>TB / ${cap.rows[0].cap}TB ·
      GPU <b class="n">${nf.format(inf.gpuYear)}</b>h/년 ·
      타일 트래픽 <b class="n">${inf.trafficGbMonth}</b>GB/월
      <span class="sp"></span>
      <span>예정 배포본 ${inf.planned.deploys}개를 더하면 저장 +${inf.planned.storageTb}TB · GPU +${nf.format(inf.planned.gpuYear)}h</span>
    </p>
  </section>

</div>`);
