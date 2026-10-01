/* gov-accounts — 기관 관리자 계정 화면: 자기 기관의 가입 신청 · 비밀번호 재설정 요청 · 계정 목록(잠금/풀기 · 역할 · 임시 비밀번호) ·
   로그인 실패 · 처리 기록. 확인 대장 D4-ⓑ(기관 사용자 가입 신청 + 승인) · 원칙 39(관할 밖 0 — 서버가 자기 기관 것만 내준다).
   LX 관리자 화면(ops-accounts)과 같은 모양(view.js 하나). 기관 관리자(manager)만 — 부서 사용자 · LX 계정은 들이지 않는다(서버도 403). */
import { gate, FRONT } from '../kit/auth-gate.js';
import { shell } from '../kit/shell.js';
import { mountAccounts } from '../ops-accounts/view.js';
import { govRail } from '../gov-select/menu.js';

const who = await gate('gov-accounts');
if (who.me?.realm !== 'tenant' || who.me?.role !== 'manager' || who.key === 'tenant/demo') {
  location.replace(FRONT + '?denied=gov-accounts'); await new Promise(() => {});
}
const S = shell({ who, home: 'gov-accounts', rail: who.key === 'tenant/local' ? govRail({ who, current: 'accounts' }) : null });   // 기관 메뉴(gov-select/menu.js)
document.body.classList.remove('acc-boot');
window.__accounts = mountAccounts(S.main, { who, scope: 'tenant' });
