/* 메인(소개) — 로그인한 LX 계정이면 '로그인' 자리를 '내 화면으로'(그 사람의 첫 화면 · 자동 이동 없음 — 10-01 사용자).
   세션 확인은 키트 관문 한 곳(whoami — GET /me). 손님 · 끝난 세션 · 기관 세션은 그대로 '로그인'(Land-XI 로그인은 LX 전용 · 원칙 78). */
import { whoami, logout } from '../kit/auth-gate.js';

const who = await whoami().catch(() => null);
if (who?.me?.realm === 'lx' && who.landing) {
  const rel = '../' + String(who.landing).split('/landxi/v3/')[1];          // 상대경로(사본 /Main/ 아래에서도)
  for (const a of document.querySelectorAll('a[data-login]')) { (a.querySelector('.m-lb') || a).textContent = '내 화면으로'; a.href = rel; a.dataset.me = '1'; }
  /* 10-24 사용자: 머리줄 '내 화면으로' 옆에 로그아웃 */
  const nav = document.querySelector('.m-nav a[data-login]');
  if (nav && !document.querySelector('.m-nav [data-logout]')) {
    const out = document.createElement('a'); out.href = '#'; out.dataset.logout = '1'; out.textContent = '로그아웃';
    out.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    nav.after(out); document.querySelector('.m-nav')?.classList.add('is-me');
  }
}
