/* 로그인 관문 — 클래식 · 블로킹 스크립트. <head> 의 스타일시트보다 앞에 둔다:
     <script src="shell-gate.js"></script>            (proto/ 밖이면 data-base="../proto/")
   그리기 전에 판정한다 — 로그인 뒤 화면이 한 프레임도 새어 나가지 않게. shell.js 의 gate() 와 같은 규칙. */
(function () {
  var ok = false;
  try { ok = localStorage.getItem('lx_logged_in') === '1'; } catch (e) { ok = false; }
  if (ok) return;
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '';
  /* 어느 입구로 보낼 것인가 — 기관 화면은 **그 기관의 입구**로 간다(data-login).
     발주자(2026-09-21): "지자체에서는 나만의 AI 시스템인 것처럼 보여야 한다."
     남원시 화면을 보러 왔는데 LX 로그인으로 튕기면 남의 집 문간이다. */
  var door = (s && s.getAttribute('data-login')) || 'login.html';
  var file = (location.pathname.split('/').pop() || 'index.html') + location.search;
  document.documentElement.style.visibility = 'hidden';
  location.replace(base + door + '?next=' + encodeURIComponent(file));
})();
