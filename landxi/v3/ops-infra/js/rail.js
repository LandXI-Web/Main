/* 배포 메뉴의 탭 줄 — 관리자 왼쪽 메뉴는 한 곳(kit/admin-menu.js · 11-07)으로 옮겼다. RAIL 은 옛 이름 그대로 이어 준다 */
export { ADMIN_MENU as RAIL } from '../../kit/admin-menu.js';
/* 배포 메뉴의 탭(배포된 카드 = 서비스 카드 관리 화면 · lx-cards) */
export const TABS = [['cards', '배포된 카드', '/cards'], ['req', '배포 신청', '/requests'], ['off', '공식 결과', '/official'], ['share', '기관 공유', '/share'], ['usage', '사용 현황', '/usage'], ['cat', '분야', '/categories'], ['imp', '개선 후보', '/improve'], ['api', 'API', '/api'], ['rt', 'XI 재학습', '/retrain'], ['tpl', '학습 서식', '/templates']];
