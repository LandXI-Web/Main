// 위계 — 누가 무엇을 보고, 무엇을 할 수 있나.
//
//   발주자(2026-09-21): "위계도 좀 문제인게. LX 관리자 - LX 직원 - 영업용 계정
//                        3가지가 분리 되어 운영되어야 하는데"
//                        "여전히 LX 관리자도 부분 구현되어 있고 완벽하지 않네"
//
// ── 무엇이 없었나 ──────────────────────────────────────────────────────────
// 기관 포털은 이미 걸러지고 있었다(portal.js TENANTS.menus — 기관 레일에 LX 전용 메뉴가 안 뜬다).
// 그런데 **LX 쪽은 위계가 아예 없었다.** 로그인만 하면 열 개 메뉴가 전부 떴고,
// 카드 발행을 승인하는 화면도 · 사용자 권한을 바꾸는 화면도 누구에게나 열려 있었다.
// 영업용 계정으로 시연하다 관리 화면이 보이면 그 자리에서 신뢰를 잃는다.
//
// ── 세 단 ──────────────────────────────────────────────────────────────────
//   admin  LX 관리자    플랫폼을 운영한다. 승인 · 사용자 · 공지 · 생산 공정까지.
//   staff  LX 직원      AI 를 만든다. 자료 · 프로젝트 · 학습 · 분석 · 발행 **요청**.
//                       승인은 못 한다 — 만든 사람이 스스로 승인하면 검수가 아니다.
//   sales  영업용 계정  보여 준다. 결과를 **열람만** 한다. 만들지도 지우지도 않는다.
//
// ── 두 축으로 나눈다 ───────────────────────────────────────────────────────
//   menus  레일에 무엇이 서는가        — 못 가는 곳은 **아예 안 보인다**(흐리게 두지 않는다)
//   caps   그 화면 안에서 무엇을 하는가 — 승인 · 편집 · 삭제 · 발행 요청 · 내보내기
// 화면은 이 선언만 읽는다. 화면 안에 `if (역할 === '관리자')` 를 쓰지 않는다 —
// 단이 늘어도 화면 코드를 고치지 않기 위해서다(성장 규칙 R5 와 같은 뜻).

/** 할 수 있는 일 — 화면이 버튼을 세울지 말지 이 이름으로 묻는다. */
export const CAPS = {
  approve: '카드 발행 승인 · 반려',
  users: '사용자 권한 · 가입 승인',
  notice: '공지 · FAQ · 문의 답변',
  produce: '생산 공정 · 인프라 · 포털 생산',
  upload: '자료 올리기',
  build: 'AI 프로젝트 · 라벨링 · 학습',
  run: '분석 실행',
  edit: '분석 결과 수정 · 삭제',
  request: '카드 발행 요청',
  export: '결과 내려받기 · 보고서',
};

export const ROLES = [
  {
    id: 'admin', name: 'LX 관리자', short: '관리자',
    what: '플랫폼을 운영한다 — 발행 승인 · 사용자 · 공지 · 생산 공정',
    menus: ['dashboard', 'media', 'project', 'analysis', 'map', 'support', 'publish', 'produce', 'admin', 'my'],
    caps: ['approve', 'users', 'notice', 'produce', 'upload', 'build', 'run', 'edit', 'request', 'export'],
    home: 'dashboard.html',
  },
  {
    id: 'staff', name: 'LX 직원', short: '직원',
    what: 'AI 를 만든다 — 자료 · 프로젝트 · 학습 · 분석. 발행은 요청까지',
    /* 승인 화면(publish)과 운영 화면(admin · produce)은 없다.
       **만든 사람이 스스로 승인하면 검수가 아니다.** 요청까지가 직원의 몫이다. */
    menus: ['dashboard', 'media', 'project', 'analysis', 'map', 'support', 'my'],
    caps: ['upload', 'build', 'run', 'edit', 'request', 'export'],
    home: 'ai-project.html',
  },
  {
    id: 'sales', name: '영업용 계정', short: '영업',
    what: '보여 준다 — 할 수 있는 것 · 해낸 것 · 지금 보는 것',
    /* 발주자(2026-09-21): "영업용은 분석서비스 카드만 표출되고 bp 사례만... 그리고 xi map 이라고 해서
       전국단위 위성항공드론 정사영상을 실시간 분석할 수 있는 프레임과 그 결과를 보는...
       핵심 지오에이아이맵 개념이다"

       그래서 세 자리뿐이다 — 영업이 하는 말의 순서 그대로다.
         분석 서비스   **할 수 있는 것** — 카드만 본다(프로젝트·학습 자산은 남의 살림이다)
         활용 사례     **해낸 것** — BP 사례. 말이 아니라 실적으로 증명한다
         XI Map       **지금 보는 것** — 전국 위성·항공·드론 정사영상 위에서 실시간으로 판독하고
                      그 결과를 보는 자리. 이 플랫폼의 핵심 Geo-AI 맵이다

       대시보드를 뺐다 — 재학습 대기 · 디스크 96% 같은 **내부 운영 지표**는 영업이 열 자리가 아니다.
       자료·프로젝트도 없다. 고치지도 못한다 — 시연 중 실수로 지워지는 일이 없어야 한다. */
    menus: ['analysis', 'usecase', 'map', 'my'],
    caps: ['export'],
    home: 'ximap.html',
  },
];

export const DEFAULT_ROLE = 'admin';
export const roleById = (id) => ROLES.find((r) => r.id === id) || null;

/** 이 역할이 그 일을 할 수 있나. 모르는 역할이면 **아무것도 못 한다**(열어 두지 않는다). */
export const can = (roleId, cap) => !!roleById(roleId)?.caps.includes(cap);

/** 이 역할의 레일에 그 메뉴가 서나. */
export const sees = (roleId, menuKey) => !!roleById(roleId)?.menus.includes(menuKey);

/** 역할이 갈 수 없는 화면에 주소로 바로 들어왔을 때 — 어디로 돌려보낼 것인가. */
export const homeOf = (roleId) => roleById(roleId)?.home || 'dashboard.html';

/** 화면 → 그 화면을 보려면 있어야 하는 메뉴 권한.
 *  레일에 없는 화면을 주소로 직접 열어도 막으려면 이 표가 필요하다.
 *  여기 없는 화면은 **로그인만 하면 누구나** 본다(서비스 지원 · 마이페이지 등). */
export const SCREEN_MENU = {
  /* 활용 사례는 **막지 않는다** — 영업용 레일에서는 제 이름으로 서고,
     관리자·직원에게는 서비스 지원 안의 탭이다. 여기 적으면 그 둘이 못 본다. */
  'dashboard.html': 'dashboard',
  'dataset.html': 'media',
  'ai-project.html': 'project', 'ai-project-create.html': 'project', 'ai-project-label.html': 'project',
  'analysis-ai.html': 'analysis',
  'ximap.html': 'map', 'stats-standard.html': 'map', 'report-standard.html': 'map',
  'admin-publish.html': 'publish', 'ai-card.html': 'publish', 'ai-card-edit.html': 'publish',
  'ai-publish-create.html': 'publish',
  'produce.html': 'produce',
  'admin-notice.html': 'admin', 'admin-users.html': 'admin', 'admin-inquiry.html': 'admin',
  'admin-faq.html': 'admin', 'admin-map.html': 'admin',
};
