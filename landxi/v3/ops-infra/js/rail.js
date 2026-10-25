/* LX 관리자 왼쪽 메뉴 한 곳 — 관리자 화면(ops-infra)과 서비스 카드 관리(lx-cards · 관리자로 열 때)가 같이 쓴다 */
const OPS = '/landxi/v3/ops-core/';
export const RAIL = [
  { id: 'overview', label: '현황', icon: 'map', href: OPS + '#/overview' },
  { id: 'infra', label: '인프라', icon: 'gear', href: '#/infra' },
  { id: 'tenants', label: '기관', icon: 'org', href: '#/tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: '#/deploys' },
  { id: 'approvals', label: '요청 관리', icon: 'inbox', href: OPS + '#/approvals' },
  { id: 'reviews', label: '검토 요청', icon: 'list', href: '/landxi/v3/lx-inbox/' },   // LX 관리자 대시보드와 같은 메뉴(원칙 43)
  { id: 'accounts', label: '계정 관리', icon: 'check', href: '/landxi/v3/ops-accounts/' },   // 가입 신청 · 재설정 · 계정(구현 2차 T5 · 정리 — 메뉴로 잇기)
  { id: 'shared', label: '공유 데이터', icon: 'data', href: '#/shared' },   // 영상 목록 · 올리기 · 정보 고치기 · 공개/비공개 · 지우기(10-13 관리자-공유데이터 · 원칙 238)
];
/* 배포 메뉴의 탭(배포된 카드 = 서비스 카드 관리 화면 · lx-cards) */
export const TABS = [['req', '배포 신청', ''], ['share', '기관 공유', '/share'], ['usage', '사용 현황', '/usage'], ['cat', '분야', '/categories'], ['imp', '개선 후보', '/improve'], ['api', 'API', '/api'], ['rt', 'XI 재학습', '/retrain'], ['tpl', '학습 서식', '/templates'], ['cards', '배포된 카드', '/cards']];
