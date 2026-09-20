/* 로그인 관문 — 클래식 · 블로킹 스크립트. <head> 의 스타일시트보다 앞에 둔다:
     <script src="shell-gate.js"></script>            (proto/ 밖이면 data-base="../proto/")
   그리기 전에 판정한다 — 로그인 뒤 화면이 한 프레임도 새어 나가지 않게. shell.js 의 gate() 와 같은 규칙. */
(function () {
  var ok = false;
  try { ok = localStorage.getItem('lx_logged_in') === '1'; } catch (e) { ok = false; }
  if (ok) return;
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '';
  var file = (location.pathname.split('/').pop() || 'index.html') + location.search;
  document.documentElement.style.visibility = 'hidden';
  location.replace(base + 'login.html?next=' + encodeURIComponent(file));
})();
