/* 관문 — 클래식 · 블로킹 스크립트. <head> 의 스타일시트보다 앞에 둔다:
     <script src="shell-gate.js"></script>                                  LX 화면 (proto/ 밖이면 data-base="../proto/")
     <script src="shell-gate.js" data-login="portal-login-<기관>.html"></script>  기관 포털 화면(생성기가 찍는다)
   그리기 전에 판정한다 — 남의 화면이 한 프레임도 새어 나가지 않게. shell.js 의 gate() 와 같은 표.

   ── 판정표 (MASTER-PLAN §7.2 · proto-session.spec.mjs 20칸) ─────────────────────
                       LX 세션                         기관 세션(같은/다른)              세션 없음                 두 세션 동시
   LX 화면             역할 menus 검사 → 통과          <기관 홈>?denied=<file>           login.html?next=<file+q>   세 키 지우고 login.html
                       또는 HOME[role]?denied=<file>
   포털 화면           <그 기관의 문>?denied=<file>     같은 기관 통과 · 다른 기관 =       <그 기관의 문>?next=<file>  〃
                       (관리자 포함)                    <자기 기관 홈>?denied=<file>
   기관(지자체) 계정은 roles.js 와 무관하다(Q1 완전 별도) — portal.js TENANTS + lx_tenant_session.

   표는 roles.js · portal.js 가 정본이지만, 이 파일은 스타일시트보다 먼저 도는 클래식 스크립트라
   모듈을 못 부른다. 그래서 **키만** 여기에 옮겨 적는다 — 늘어나면 같이 고친다(R-S3). */
(function () {
  var s = document.currentScript;
  var base = (s && s.getAttribute('data-base')) || '';
  var door = (s && s.getAttribute('data-login')) || '';              // 있으면 포털 화면
  var file = location.pathname.split('/').pop() || 'index.html';

  /* roles.js SCREEN_MENU 미러 */
  var MENU = { 'admin-home.html':'ops', 'dashboard.html':'dashboard', 'analysis-ai.html':'analysis', 'ximap.html':'map',
    'stats-standard.html':'map', 'report-standard.html':'map', 'report-standard-issue.html':'map', 'map-drift.html':'map',
    'notice.html':'support', 'faq.html':'support', 'contact.html':'support', 'manual.html':'support',
    'dataset.html':'media', 'ai-project.html':'project', 'ai-project-create.html':'project',
    'ai-project-label.html':'project', 'ai-publish-create.html':'project',
    'admin-publish.html':'publish', 'ai-card.html':'publish', 'ai-card-edit.html':'publish', 'produce.html':'produce',
    'admin-notice.html':'admin', 'admin-users.html':'admin', 'admin-inquiry.html':'admin',
    'admin-faq.html':'admin', 'admin-map.html':'admin' };
  /* roles.js ROLES[].menus · home 미러 */
  var MENUS = { admin:['ops','media','publish','produce','admin','my'],
    staff:['dashboard','media','project','analysis','map','support','my'],
    sales:['analysis','usecase','map','my'] };
  var HOME = { admin:'admin-home.html', staff:'ai-project.html', sales:'ximap.html' };
  /* portal.js TENANTS[].home 미러(R-S3 · 광주전남은 임시 — E1-2 가 교체) */
  var TENANT_HOME = { 'namwon':'portal.html', 'gwangju-jeonnam':'portal-dp-gj-marine-25.html' };

  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var del = function (k) { try { localStorage.removeItem(k); } catch (e) { /* 저장소 차단 */ } };
  var go = function (url) { document.documentElement.style.visibility = 'hidden'; location.replace(base + url); };
  var enc = encodeURIComponent;

  var lx = get('lx_logged_in') === '1';
  var tenant = null;
  try { var o = JSON.parse(get('lx_tenant_session') || 'null'); if (o && TENANT_HOME[o.tenant]) tenant = o.tenant; } catch (e) { tenant = null; }

  /* 손상 — 두 세션이 동시에 있다(R-S1 위반). 어느 쪽도 믿지 않는다. */
  if (lx && tenant) {
    del('lx_logged_in'); del('lx_role'); del('lx_tenant_session');
    go('login.html');
    return;
  }

  /* ── 포털 화면 ── */
  if (door) {
    var m = /portal-login-(.+)\.html/.exec(door), own = m ? m[1] : '';
    if (tenant) {
      if (tenant === own) return;                                   // 제 집
      go(TENANT_HOME[tenant] + '?denied=' + enc(file));            // 다른 기관의 작업공간
      return;
    }
    if (lx) { go(door + '?denied=' + enc(file)); return; }         // LX 세션(관리자 포함)은 기관 작업공간에 못 들어간다
    go(door + '?next=' + enc(file + location.search));
    return;
  }

  /* ── LX 화면 ── */
  if (tenant) { go(TENANT_HOME[tenant] + '?denied=' + enc(file)); return; }
  if (lx) {
    var r = get('lx_role') || 'admin';
    if (!MENUS[r]) r = 'admin';
    var need = MENU[file];
    if (need && MENUS[r].indexOf(need) < 0) { go(HOME[r] + '?denied=' + enc(file)); return; }
    /* 관리자 사이트는 다른 집이다(Q3) — 그리기 전에 표식을 단다. 모습(명도 반전)은 E1-6 의 CSS 가 맡는다. */
    if (r === 'admin') document.documentElement.setAttribute('data-site', 'admin');
    return;
  }
  go('login.html?next=' + enc(file + location.search));
})();
