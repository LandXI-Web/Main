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
//
// ── 기관(지자체)은 이 표에 없다 (Q1 확정 2026-09-24 · 완전 별도) ────────────────
// 기관은 portal.js TENANTS + lx_tenant_session(storage-keys.js) — 이 표와 무관하다.
// 기관 세션은 LX 셸 화면에 들어오지 못하고, LX 세션(관리자 포함)은 기관 작업공간에 들어가지 못한다
// (판정표 MASTER-PLAN §7.2 · shell-gate.js · shell.js gate()). 네 번째 단을 여기에 더하지 않는다.

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
    /* 관리자의 첫 화면은 **운영 현황**이다 — 대시보드가 아니다(2026-09-21).
       발주자: "관리자는 사이트도 다르고 모습도 조금 달라야 한다. 기존 화면은 일반직원 화면일 것 같다."
       대시보드는 직원도 보는 화면이라 관리자의 집이 될 수 없다. */
    /* **관리 기능만 둔다 — 완전히 다른 사이트다** (2026-09-22).
       발주자: "관리자는 프로젝트가 필요할까?"
                "관리자는 기존 사이트와 완전 다르게 새로운 사이트 인 것 처럼..."
                "그리고 관리 기능만 있도록 해야 한다."

       처음엔 레일만 줄였다 — 같은 집에서 문 몇 개를 잠근 꼴이었다. 그게 아니다.
       프로젝트 · 분석 서비스 · 지도 서비스 · 대시보드는 **만드는 화면**이고 직원의 집이다.
       관리자가 거기 상주하면 두 역할이 도로 섞인다. 그래서 아예 갖지 않는다.
       개발 진척을 못 보게 되는 것이 아니다 — **생산 관리 · 개발 관리**가 그 자리다
       (재학습 · 검수 · 감시). 관리자는 만들지 않고 **본다**.

       남기는 여섯:
         운영 현황      제 집 — 결재 대기 + 관리 네 축
         데이터 관리    자산 대장 · 아카이브 (발주자: "데이터관리 아카이브 … 관리에 주안점")
         카드 발행 관리 승인 · 반려
         생산 관리      인프라 · 개발 관리 · 개발 구현
         서비스 관리    사용자 · 공지 · 문의 · FAQ · 지도 설정
         MY
       서비스 지원(공지·FAQ 열람)도 뺐다 — 관리자는 그것을 **관리하는** 쪽이고,
       읽는 화면과 고치는 화면을 둘 다 주면 어느 쪽이 제 일인지 흐려진다. */
    /* **F2-R(2026-09-27) — 관리자 레일 10 = 운영 현황(home · admin-home) + 관제 4 + 기존 5.** (1차엔 9 — 아래 판정 1차 참고) 설계서 §2.2 ③ LX/OPS 의 8(운영 현황 · 인프라 관제 ·
       기관·할당 · 배포 제어 · 카드 발행 · 데이터 관리 · 서비스 관리 · MY)에 **생산 관리**를 더한 9다 —
       원본 기능 삭제 0 원칙(생산 공정 · 재학습 · 검수 화면은 관제로 옮겨지지 않았다).
       관제 넷(ops · infra · tenants · deploys)은 **다른 origin(:8702)** 이다. 4173 의 세션은 거기 없으므로
       레일은 관제 로그인 문(`login.html?next=`)을 가리킨다 — 자동 인계는 2차(정직 표기 · shell.js OPS).
       관리자의 첫 화면은 그대로 admin-home.html(이 origin 의 운영 현황 · 결재 대기)이다. */
    /* F2-R 판정 1차 반영: 레일 10 = **운영 현황(결재 대기 · 이 origin admin-home)** + 관제 4 + 기존 5.
       'ops' 가 관제로 간 뒤 admin-home 이 어느 화면에서도 링크 0 으로 고립됐다 — 'home' 키로 되살린다. */
    menus: ['home', 'ops', 'infra', 'tenants', 'deploys', 'media', 'publish', 'produce', 'admin', 'my'],
    caps: ['approve', 'users', 'notice', 'produce', 'upload', 'build', 'run', 'edit', 'request', 'export'],
    home: 'admin-home.html',
    mapLine: '관제 = LX/OPS :8702 — 인프라 · 기관·할당 · 배포 제어(관제 로그인 한 번 더)',
  },
  {
    id: 'staff', name: 'LX 직원', short: '직원',
    what: 'AI 를 만든다 — 자료 · 프로젝트 · 학습 · 분석. 발행은 요청까지',
    /* 승인 화면(publish)과 운영 화면(admin · produce)은 없다.
       **만든 사람이 스스로 승인하면 검수가 아니다.** 요청까지가 직원의 몫이다. */
    menus: ['dashboard', 'media', 'project', 'analysis', 'map', 'support', 'my'],
    caps: ['upload', 'build', 'run', 'edit', 'request', 'export'],
    home: 'ai-project.html',
    mapLine: '지도 서비스 = XI맵 실시간 분석 — 프레임을 씌우면 GPU 워커가 판독한다',
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
    /* F2-R: 첫 화면 = **새 XI맵**(landxi/xi) — 영업 · 시연(demo:true) 관문은 XI맵이 session.shadow() 로 읽는다.
       구 ximap.html 은 레일에서 빠지되 파일 · 직접 URL 은 그대로 동작한다(원본 기능 삭제 0). */
    home: '../xi/index.html',
    mapLine: '지도 서비스 = XI맵 실시간 분석 — 시연 작업(demo)으로 판독을 보여 준다',
  },
];

export const DEFAULT_ROLE = 'admin';
export const roleById = (id) => ROLES.find((r) => r.id === id) || null;

/** 이 역할이 그 일을 할 수 있나. 모르는 역할이면 **아무것도 못 한다**(열어 두지 않는다). */
export const can = (roleId, cap) => !!roleById(roleId)?.caps.includes(cap);

/** 이 역할이 그 화면에 **들어갈 수 있나**(관문이 묻는다). */
export const sees = (roleId, menuKey) => !!roleById(roleId)?.menus.includes(menuKey);

/** 이 역할의 **레일에 서나**(셸이 묻는다). rail 을 따로 적지 않은 역할은 menus 그대로다.
    들어갈 수는 있어도 레일에 안 세우는 화면이 있다 — 관리자의 프로젝트가 그렇다. */
export const onRail = (roleId, menuKey) => {
  const r = roleById(roleId); if (!r) return false;
  return (r.rail || r.menus).includes(menuKey);
};

/** 역할이 갈 수 없는 화면에 주소로 바로 들어왔을 때 — 어디로 돌려보낼 것인가. */
export const homeOf = (roleId) => roleById(roleId)?.home || 'dashboard.html';

/* ── 다른 무대 — 이 셸(proto · :4173) 밖의 새 화면(F2-R) ─────────────────────────
   XI맵(landxi/xi) 은 같은 origin — localStorage(lx_logged_in · lx_role) 를 XI맵 session.shadow() 가 그대로 읽는다.
   관제(landxi/ops) 는 **다른 origin(:8702)** — 세션이 건너가지 않는다. 그래서 관제 로그인 문의 ?next= 로 보낸다. */
export const XI_MAP = '../xi/index.html';
/** 관제 origin — 지금 주소의 호스트를 따른다(localhost ↔ 127.0.0.1 섞임 0). */
export const OPS_ORIGIN = (() => { try { return `${location.protocol}//${location.hostname}:8702`; } catch { return 'http://localhost:8702'; } })();
/** 관제 화면 주소 — 관제 로그인 문을 거쳐 그 화면으로(next 는 관제 쪽 화이트리스트가 판정 · F2-C). */
export const opsUrl = (page = 'index.html', q = '') => `${OPS_ORIGIN}/landxi/ops/login.html?next=${encodeURIComponent(page + (q ? (q.startsWith('?') ? q : '?' + q) : ''))}`;
/** 외부 origin 메뉴 — 관리자만(sees 가 menus 로 거른다 · 직원·영업 menus 에 없다). */
export const EXTERNAL_MENUS = ['ops', 'infra', 'tenants', 'deploys'];

/** 화면 → 그 화면을 보려면 있어야 하는 메뉴 권한.
 *  레일에 없는 화면을 주소로 직접 열어도 막으려면 이 표가 필요하다.
 *  여기 없는 화면은 **로그인만 하면 누구나** 본다(서비스 지원 · 마이페이지 등). */
export const SCREEN_MENU = {
  'admin-home.html': 'home',
  /* 활용 사례는 **막지 않는다** — 영업용 레일에서는 제 이름으로 서고,
     관리자·직원에게는 서비스 지원 안의 탭이다. 여기 적으면 그 둘이 못 본다. */
  'dashboard.html': 'dashboard',
  'dataset.html': 'media',
  'ai-project.html': 'project', 'ai-project-create.html': 'project', 'ai-project-label.html': 'project',
  'analysis-ai.html': 'analysis',
  /* 지도 서비스의 정본 = 새 XI맵(F2-R). 그 화면은 셸 밖 앱이라 이 표로 막지 않는다(XI맵이 session.shadow() 로 스스로 관문) —
     여기 적는 것은 '어느 메뉴의 화면인가'를 말하기 위해서다(deniedLine · 레일 활성). 구 ximap.html 은 직접 URL 로만. */
  '../xi/index.html': 'map',
  'ximap.html': 'map', 'stats-standard.html': 'map', 'report-standard.html': 'map',
  'report-standard-issue.html': 'map', 'map-drift.html': 'map',
  /* 서비스 지원 — 영업 레일에는 support 가 없어 막힌다(활용 사례 usecase.html 은 표에 없어 열린다). */
  'notice.html': 'support', 'faq.html': 'support', 'contact.html': 'support', 'manual.html': 'support',
  'admin-publish.html': 'publish', 'ai-card.html': 'publish', 'ai-card-edit.html': 'publish',
  /* 발행 **요청** 폼 — 직원의 것이다(승인 화면 publish 가 아니다 · 2026-09-24 §7.2). */
  'ai-publish-create.html': 'project',
  'produce.html': 'produce',
  'admin-notice.html': 'admin', 'admin-users.html': 'admin', 'admin-inquiry.html': 'admin',
  'admin-faq.html': 'admin', 'admin-map.html': 'admin',
};

/** 딥링크 열람 — 그 인자를 달고 오면 **또 하나의 메뉴**로도 열린다(F2-R · v1.1-29).
 *  ai-card.html?card= 는 카드 버전 · 배포 계보를 **읽기만** 하는 자리다. 카드를 만든 직원(project)이
 *  XI맵 계보 칩 '카드 ↗' 로 왔을 때 되돌려 보내지 않는다. 인자 없이 열면 여전히 관리자 화면(publish)이다. */
/** 레일 활성 키 정본 — 화면이 mountShell({active}) 로 넘긴 키보다 먼저 선다(키 정리 · F2-R 판정 1차).
 *  admin-home.js 는 active:'admin' 을 넘기지만 그 화면은 '운영 현황'(home) 이다. */
export const RAIL_ACTIVE = { 'admin-home.html': 'home' };

export const SCREEN_DEEP = { 'ai-card.html': { param: 'card', menu: 'project' } };
/** 이 화면(+쿼리)을 이 역할이 볼 수 있나 — 관문 두 곳(shell.js gate · shell-gate.js)이 같은 답을 낸다. */
export function screenOpen(roleId, file, search = '') {
  const need = SCREEN_MENU[file];
  if (!need || sees(roleId, need)) return true;
  const d = SCREEN_DEEP[file];
  return !!(d && new URLSearchParams(search).get(d.param) && sees(roleId, d.menu));
}
