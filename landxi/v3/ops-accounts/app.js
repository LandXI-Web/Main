/* ops-accounts — LX 관리자 계정 화면: 가입 신청(LX 직원 · 모든 기관) · 비밀번호 재설정 요청 · 계정 목록(잠금/풀기 · 역할 · 임시 비밀번호) ·
   로그인 실패 · 처리 기록. 원칙 72(LX 관리자는 다 보고 돕는다) · 확인 대장 FR-4.
   관문(K2) → 셸(K1 · LX 관리자 대시보드 메뉴 — 계정 관리) → 계정 화면(view.js — 기관 관리자 화면과 같은 모양).
   LX 관리자는 기관 가입 신청을 보기만 한다(승인 · 반려는 그 기관 관리자 — 원칙 72 · 서버도 거절). 기관 계정은 확인 · 잠금 · 지원(임시 비밀번호).
   관리자 아닌 계정은 들이지 않는다(서버도 403). */
import { gate, FRONT } from '../kit/auth-gate.js';
import { shell } from '../kit/shell.js';
import { mountAccounts } from './view.js';
import { adminMenu } from '../kit/admin-menu.js';

const who = await gate('ops-accounts');
if (who.key !== 'lx/admin') { location.replace(FRONT + '?denied=ops-accounts'); await new Promise(() => {}); }
const S = shell({ who, home: 'ops-accounts', title: 'LX 관리자 대시보드', rail: adminMenu('accounts') });   // 관리자 메뉴 · 숫자 한 곳(kit/admin-menu.js · 11-07)
// 역할 칩 — 이름이 역할 문구와 같으면 한 번만('LX 관리자')
{ const r = document.querySelector('.k-role'), b = r?.querySelector('b');
  if (b && r.textContent.slice(b.textContent.length).trim() === b.textContent.trim()) b.remove(); }
document.body.classList.remove('acc-boot');
window.__accounts = mountAccounts(S.main, { who, scope: 'lx' });
