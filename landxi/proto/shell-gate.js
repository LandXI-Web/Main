/* 로그인 관문 — 클래식 · 블로킹 스크립트. <head> 의 스타일시트보다 앞에 둔다:
     <script src="shell-gate.js"></script>            (proto/ 밖이면 data-base="../proto/")
   그리기 전에 판정한다 — 로그인 뒤 화면이 한 프레임도 새어 나가지 않게. shell.js 의 gate() 와 같은 규칙. */
(function () {
  var ok = false;
  try { ok = localStorage.getItem('lx_logged_in') === '1'; } catch (e) { ok = false; }
  /* 로그인했어도 **역할이 갈 수 없는 화면**이면 들여보내지 않는다(2026-09-21).
     레일에서 치운 것만으로는 부족하다 — 주소를 직접 치면 그대로 열렸다.
     표는 roles.js 가 정본이지만, 관문은 스타일시트보다 먼저 도는 클래식 스크립트라
     모듈을 못 부른다. 그래서 **메뉴 키만** 여기에 옮겨 적고, 늘어나면 같이 고친다. */
  if (ok) {
    var MENU = { 'dashboard.html':'dashboard', 'analysis-ai.html':'analysis', 'ximap.html':'map',
      'stats-standard.html':'map', 'report-standard.html':'map', 'dataset.html':'media', 'ai-project.html':'project', 'ai-project-create.html':'project',
      'ai-project-label.html':'project', 'admin-publish.html':'publish', 'ai-card.html':'publish',
      'ai-card-edit.html':'publish', 'ai-publish-create.html':'publish', 'produce.html':'produce',
      'admin-notice.html':'admin', 'admin-users.html':'admin', 'admin-inquiry.html':'admin',
      'admin-faq.html':'admin', 'admin-map.html':'admin' };
    var MENUS = { admin:['dashboard','media','project','analysis','map','support','publish','produce','admin','my'],
      staff:['dashboard','media','project','analysis','map','support','my'],
      sales:['analysis','usecase','map','my'] };
    var HOME = { admin:'dashboard.html', staff:'ai-project.html', sales:'ximap.html' };
    var r = 'admin';
    try { r = localStorage.getItem('lx_role') || 'admin'; } catch (e) { r = 'admin'; }
    if (!MENUS[r]) r = 'admin';
    var here = location.pathname.split('/').pop() || 'index.html';
    var need = MENU[here];
    if (need && MENUS[r].indexOf(need) < 0) {
      document.documentElement.style.visibility = 'hidden';
      var s2 = document.currentScript, base2 = (s2 && s2.getAttribute('data-base')) || '';
      location.replace(base2 + HOME[r] + '?denied=' + encodeURIComponent(here));
      return;
    }
    return;
  }
  var s = document.currentScript, base = (s && s.getAttribute('data-base')) || '';
  /* 어느 입구로 보낼 것인가 — 기관 화면은 **그 기관의 입구**로 간다(data-login).
     발주자(2026-09-21): "지자체에서는 나만의 AI 시스템인 것처럼 보여야 한다."
     남원시 화면을 보러 왔는데 LX 로그인으로 튕기면 남의 집 문간이다. */
  var door = (s && s.getAttribute('data-login')) || 'login.html';
  var file = (location.pathname.split('/').pop() || 'index.html') + location.search;
  document.documentElement.style.visibility = 'hidden';
  location.replace(base + door + '?next=' + encodeURIComponent(file));
})();
