"""now 페이지 한 바퀴 4단계 — 페이지의 모든 그림을 지금 한 번에 다시 찍는다(원칙 162 · CLAUDE.md §1-1-1).
바깥 주소(app · admin · 기관 .land-xi.dev)를 로그인 폼으로 열어 PC 1440. 역할별 로그인은 한 번씩(바깥 로그인 10분 20회 제한).
데이터를 바꾸는 동작(승인 · 공유 · 저장 · 분석 시작)은 누르지 않는다 — 서랍을 여는 데까지만. 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
시안(분야 관리 · API 그림)은 같은 때 다시 찍고 그림 위에 '시안' 표시.
사용: python shoot-all.py [--out 폴더] [--only 이름일부,...]   → <out>/ 에 png, log.json(장면별 시각 · 주소 · 상태)
"""
import datetime, json, os, re, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
args = sys.argv[1:]
def opt(k, d=None):
    return args[args.index(k) + 1] if k in args else d
NOW = datetime.datetime.now()
OUT = opt('--out') or os.path.join(HERE, f'shots-{NOW:%H%M}')
ONLY = [x for x in (opt('--only') or '').split(',') if x]
os.makedirs(OUT, exist_ok=True)
env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
PW = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')

APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
PRJ = 'prj_b2fa593a12'
PNU = '5219025030108240009'
LOG = json.load(open(os.path.join(OUT, 'log.json'), encoding='utf-8')) if os.path.exists(os.path.join(OUT, 'log.json')) else {}   # 같은 폴더에 다시 찍으면 이어 적는다
FAILED = []
BADGE = "document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;top:14px;left:14px;z-index:2147483647;background:#E8590C;color:#fff;font:800 28px/1 system-ui,sans-serif;padding:12px 22px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.25)\">시안</div>')"


def want(name):
    return not ONLY or any(o in name for o in ONLY)


def shoot(pg, name, note='', full=False, clip=None):
    t = datetime.datetime.now()
    fn = f'{name}-{t:%H%M}.png'
    kw = {'full_page': True} if full else {}
    if clip:
        kw['clip'] = clip
    pg.screenshot(path=os.path.join(OUT, fn), **kw)
    LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': re.sub(r'\?.*$', '', pg.url) + (('?' + pg.url.split('?', 1)[1]) if '?' in pg.url and 'job=' not in pg.url else ''), 'note': note}
    json.dump(LOG, open(os.path.join(OUT, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('찍음', fn, flush=True)


def scene(name, fn, *a):
    if not want(name):
        return
    try:
        fn(*a)
    except Exception as e:
        FAILED.append(name)
        print('실패', name, str(e)[:200].replace('\n', ' '), flush=True)
        LOG['FAILED:' + name] = str(e)[:300]


def newctx(b, vp=(1440, 900)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1)
    pg = c.new_page()
    pg.set_default_timeout(60000)
    pg.set_default_navigation_timeout(90000)
    return c, pg


def login_lx(b, base, who):
    c, pg = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded')
    pg.locator('input[name=login], input[autocomplete=username], input[type=text]').first.fill(who)
    pg.locator('input[type=password]').first.fill(PW)
    pg.locator('input[type=password]').first.press('Enter')
    try:
        pg.wait_for_url(lambda u: not re.search(r'/login/?(\?|$)', u), timeout=20000)
    except Exception:
        pass
    pg.wait_for_timeout(2500)
    return c, pg


def login_org(b, tenant):
    c, pg = newctx(b)
    pg.goto(f'https://{tenant}.land-xi.dev/', wait_until='domcontentloaded')
    pg.locator('.gh-login input[name=login]').wait_for(timeout=30000)
    pg.fill('.gh-login input[name=login]', 'lxadmin@lx.or.kr')
    pg.fill('.gh-login input[name=password]', PW)
    pg.press('.gh-login input[name=password]', 'Enter')
    pg.wait_for_url(re.compile(r'/landxi/v3/(?!gov-home/)[a-z-]+/'), timeout=30000)
    pg.wait_for_timeout(2500)
    return c, pg


def go(pg, url, sel=None, wait=1500):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=60000)
    pg.wait_for_timeout(wait)


FEATURE_JS = """(cls) => {
  const m = window.__lm && window.__lm.map; if (!m) return null;
  const c = m.getCanvas(), W = c.clientWidth, H = c.clientHeight;
  const ids = m.getStyle().layers.map((l) => l.id).filter((i) => i.startsWith('lm-r-') && i.endsWith('-fill') && m.getLayoutProperty(i, 'visibility') !== 'none');
  const fs = m.queryRenderedFeatures([[W * 0.2, H * 0.15], [W * 0.62, H * 0.85]], { layers: ids }).filter((f) => !cls || f.properties.cls === cls);
  if (!fs.length) return null;
  const g = fs[0].geometry, ring = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
  const cen = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  const p = m.project(cen); return { x: p.x, y: p.y };
}"""

# ───────── LX 직원 (app · test@lx.or.kr) ─────────
def staff(b):
    c, pg = login_lx(b, APP, 'test@lx.or.kr')
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:120]))

    def menu():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.k-rail', 3500)
        shoot(pg, 'menu', 'LX 직원 메뉴 — 지금 메뉴(지도 서비스 포함)', clip={'x': 0, 'y': 0, 'width': 420, 'height': 560})
        shoot(pg, 'q10-console', 'LX 직원 대시보드')
    scene('menu', menu)

    def projects():
        go(pg, f'{APP}/landxi/v3/lx-project/?scope=mine', '.k-rail', 3000)
        shoot(pg, 'q10-projects', '프로젝트 목록')
    scene('q10-projects', projects)

    def q2():
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-farm', '.k-rail', 3500)
        shoot(pg, 'q2-detail-top', '분석하기 자세히 — 위')
        pg.evaluate("(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.scrollHeight>x.clientHeight+50&&getComputedStyle(x).overflowY!=='visible'&&x.clientHeight>300);e.forEach(x=>x.scrollTop=x.scrollHeight);window.scrollTo(0,document.body.scrollHeight)})()")
        pg.wait_for_timeout(900)
        shoot(pg, 'q2-detail-low', '분석하기 자세히 — 아래(이 카드의 조건)')
    scene('q2', q2)

    def q6():
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=infer', '.k-rail', 3500)
        shoot(pg, 'q6-infer-closed', '추론 — 설정 접힘')
        pg.locator('details.rl-set summary').first.click()
        pg.wait_for_timeout(800)
        shoot(pg, 'q6-infer-open', '추론 — 설정 펼침(신뢰도 기준 · 최소 크기)')
        pg.evaluate("(()=>{const l=document.querySelector('a.rl-link');if(l)l.scrollIntoView({block:'center'})})()")
        pg.wait_for_timeout(800)
        bb = pg.locator('a.rl-link').first.bounding_box()
        shoot(pg, 'q6-infer-result', '추론 — 결과 목록(바꾼 값 표시) · 결과 칸만', clip={'x': max(0, bb['x'] - 480), 'y': max(0, bb['y'] - 90), 'width': 620, 'height': 240})
    scene('q6', q6)

    def q9():
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=publish', '.k-rail', 3500)
        shoot(pg, 'q9-apply-staff', '배포 신청서 — 정확도 경고 자리')
    scene('q9-apply-staff', q9)

    def later6():
        go(pg, f'{APP}/landxi/v3/lx-project/?project={PRJ}', '.k-rail', 3500)
        shoot(pg, 'later6-project', '프로젝트 한 건 — 쉬운 말')
    scene('later6', later6)

    def q10():
        go(pg, f'{APP}/landxi/v3/lx-train/?project={PRJ}&stage=label&flow=1', '.k-rail', 3500)
        try:
            pg.wait_for_selector('.k-drawer', timeout=6000)
        except Exception:
            pg.locator('button:has-text("학습데이터 올리기")').first.click()
            pg.wait_for_selector('.k-drawer', timeout=20000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'q10-label-open', '학습데이터 구축 — 올리기 · 라벨 확인 서랍')
        go(pg, f'{APP}/landxi/v3/lx-train/?project={PRJ}&stage=train&flow=1', '.k-rail', 3500)
        try:
            pg.wait_for_selector('.k-drawer', timeout=6000)
        except Exception:
            pg.locator('button:has-text("학습 실행")').first.click()
            pg.wait_for_selector('.k-drawer', timeout=20000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'q10-train-open', '학습 — 학습 실행 · 결과 서랍(열기만)')
    scene('q10-label', q10)

    # 지도 서비스 · 영상 고르기
    state = {}

    def mapsvc():
        go(pg, f'{APP}/landxi/v3/lx-map/', 'body[data-ready="1"]', 3000)
        while pg.locator('.lm-sw[aria-checked="true"]').count():
            pg.locator('.lm-sw[aria-checked="true"]').first.click()
        card = pg.locator('.lm-grp', has_text='비닐하우스 분석서비스').first
        proj = pg.locator('.lm-grp.is-proj', has_text='비닐하우스').first
        for g in (card, proj):
            if g.locator('.lm-gt').get_attribute('aria-expanded') != 'true':
                g.locator('.lm-gt').click()
            sw = g.locator('.lm-sw').first
            if sw.get_attribute('aria-checked') != 'true':
                sw.click()
        state['pid'] = (proj.get_attribute('data-g') or ':').split(':')[1]
        pg.wait_for_timeout(5000)
        shoot(pg, 'a-mapsvc-two-groups', '지도 서비스 — 묶음 둘 동시에')
        pt = pg.evaluate(FEATURE_JS, '비닐하우스')
        bb = pg.locator('.lm-stage .maplibregl-canvas').bounding_box()
        pg.mouse.click(bb['x'] + pt['x'], bb['y'] + pt['y'])
        pg.wait_for_selector('.lm-props', timeout=15000)
        pg.wait_for_timeout(3500)
        shoot(pg, 'b-mapsvc-props', '지도 서비스 — 도형 누르면 오른쪽 속성')
    scene('a-mapsvc', mapsvc)

    def infer_link():
        pid = state.get('pid') or PRJ
        go(pg, f'{APP}/landxi/v3/lx-release/?project={pid}&stage=infer', 'a.rl-link', 1500)
        pg.evaluate("(()=>{const l=document.querySelector('a.rl-link');if(l)l.scrollIntoView({block:'center'})})()")
        pg.wait_for_timeout(700)
        shoot(pg, 'c-infer-result-link', "추론 — '결과 보기'")
        pg.locator('a.rl-link', has_text='결과 보기').first.click()
        pg.wait_for_url(lambda u: '/lx-map/' in u, timeout=30000)
        pg.wait_for_selector('body[data-ready="1"]', timeout=60000)
        pg.wait_for_selector('.lm-grp.is-proj .lm-sw[aria-checked="true"]', timeout=30000)
        pg.wait_for_timeout(5000)
        shoot(pg, 'd-from-infer-to-mapsvc', "'결과 보기' 눌러 지도 서비스에서 그 결과")
    scene('c-infer', infer_link)

    def imagery():
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', '#imagery .la-im-c', 4000)
        pg.evaluate("document.querySelector('#imagery').scrollIntoView({block:'start'})")
        pg.wait_for_timeout(2500)
        shoot(pg, 'e-imagery-pick', '분석하기 상세 — 영상 고르기')
        other = pg.locator('#imagery .la-im-c[aria-pressed="false"]:not([disabled])').first
        other.click()
        pg.wait_for_timeout(3000)
        shoot(pg, 'f-imagery-other', '다른 영상을 고른 모습')
    scene('e-imagery', imagery)
    print('직원 오류', errs[:3])
    c.close()


# ───────── LX 관리자 (admin · lxadmin@lx.or.kr) ─────────
def admin(b):
    c, pg = login_lx(b, ADMIN, 'lxadmin@lx.or.kr')
    org = ADMIN

    def q9a():
        go(pg, f'{org}/landxi/v3/ops-infra/#/deploys', '.k-rail', 3500)
        row = pg.locator('tr:has(.t-chip), tr:has-text("검토 중")').first
        try:
            row.click(timeout=5000)
        except Exception:
            pass
        pg.wait_for_timeout(1800)
        shoot(pg, 'q9-apply-admin', '배포 신청 탭 — 신청 한 건 열기(승인 · 거절은 누르지 않음)')
    scene('q9-apply-admin', q9a)

    def l1():
        go(pg, f'{org}/landxi/v3/ops-infra/#/tenants', '.org[data-id="namwon"]', 2500)
        shoot(pg, 'later1-tenants', '기관 목록 — 분석한 면적')
    scene('later1', l1)

    def q16():
        go(pg, f'{org}/landxi/v3/ops-core/#/approvals', '.k-rail', 3500)
        try:
            pg.locator('.oc-tabs button', has_text='분석 요청').first.click(timeout=4000)
        except Exception:
            pass
        pg.wait_for_timeout(1500)
        try:
            pg.locator('.rq-row[data-id]').first.click(position={'x': 400, 'y': 25}, timeout=8000)
            pg.wait_for_selector('.k-drawer', timeout=10000)
        except Exception:
            print('서랍 안 열림 — 목록만 찍음', flush=True)
        pg.wait_for_timeout(1500)
        shoot(pg, 'q16-requests', '요청 관리 · 분석 요청 — 한 건 서랍(바꾸지 않음)')
    scene('q16', q16)

    def q17():
        go(pg, f'{org}/landxi/v3/ops-infra/#/tenants', '.org[data-id="namwon"]', 1500)
        pg.locator('.org[data-id="namwon"]').click()
        pg.wait_for_selector('.tp-h h1')
        pg.wait_for_timeout(1800)
        shoot(pg, 'q17-tenant-overview', "기관 한 곳 — 개요")
        pg.locator('.tp-tabs button[data-k="svc"]').click()
        pg.wait_for_selector('.tp-svc')
        pg.wait_for_timeout(1000)
        shoot(pg, 'q17-tenant-services', '기관 한 곳 — 서비스와 담당')
        pg.locator('.tp-tabs button[data-k="use"]').click()
        pg.wait_for_selector('.tp-use .tp-t')
        pg.wait_for_timeout(1500)
        shoot(pg, 'q17-tenant-use', '기관 한 곳 — 사용과 계정')
    scene('q17', q17)

    def n13():
        go(pg, f'{org}/landxi/v3/ops-infra/#/deploys/share', '.rv-sgg', 1500)
        pg.locator('.rv-sgg').first.click()
        pg.wait_for_selector('.rv-sg-g label')
        pg.wait_for_timeout(1000)
        shoot(pg, 'n13-share-sgg', '기관 공유 — 광역 칸 시군구 고르기(저장 · 거두기는 누르지 않음)')
    scene('n13', n13)

    def p17():
        go(pg, f'{org}/landxi/v3/ops-accounts/', '.acc-tab', 2500)
        pg.locator('.acc-tab[data-tab="logins"]').click()
        pg.wait_for_timeout(2500)
        shoot(pg, 'p17-logins', '계정 관리 — 로그인 기록(들어온 입구)')
        pg.locator('.acc-tab[data-tab="users"]').click()
        pg.wait_for_timeout(2000)
        pg.locator('tbody tr', has_text='test@lx.or.kr').first.click()
        pg.wait_for_selector('.k-drawer', timeout=15000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'p17-user-drawer', '계정 서랍 — 최근 로그인 · 입구')
    scene('p17', p17)

    def p170():
        go(pg, f'{org}/landxi/v3/ops-accounts/', '.acc-tab', 2500)
        pg.locator('.acc-tab[data-tab="ops"]').click()
        pg.wait_for_timeout(2500)
        shoot(pg, 'p170-ops', '계정 관리 — 운영 정보(문의 연락처 · 저장은 누르지 않음)')
    scene('p170-ops', p170)
    c.close()


# ───────── 기관 ─────────
def namwon(b):
    c, pg = login_org(b, 'namwon')
    base = pg.url.split('/landxi/')[0]

    def p8():
        go(pg, f'{base}/landxi/v3/xi-clean/?region=52190&pnu={PNU}', '.xc-pi-sw', 4000)
        pg.wait_for_timeout(2500)
        shoot(pg, 'p8-card-lxmap-off', '기관 결과 지도 — 필지 카드 · LX맵 끔')
        pg.locator('.xc-pi-sw').click()
        pg.wait_for_timeout(4000)
        shoot(pg, 'p8-card-lxmap-on', '기관 결과 지도 — 필지 카드 · LX맵 켬(보기만)')
    scene('p8', p8)

    def n19():
        go(pg, f'{base}/landxi/v3/gov-select/', '.k-bell', 3500)
        pg.locator('.k-bell').click()
        pg.wait_for_timeout(1500)
        shoot(pg, 'n19-version-bell', '남원시 기관 — 종 알림')
    scene('n19', n19)
    c.close()


def gwangju(b):
    c, pg = login_org(b, 'gwangju-jeonnam')
    base = pg.url.split('/landxi/')[0]

    def n16():
        go(pg, f'{base}/landxi/v3/gov-accounts/#accounts', '.ds', 2500)
        pg.locator('.ds').scroll_into_view_if_needed()
        pg.wait_for_timeout(1000)
        shoot(pg, 'n16-dept-scope', '광역 기관 계정 — 부서별 관할(바꾸지 않음)')
    scene('n16', n16)
    c.close()


# ───────── 로그인 없이(메인) ─────────
def main_pages(b):
    c, pg = newctx(b)

    def m3():
        go(pg, f'{APP}/landxi/v3/main/', None, 4000)
        JS = "(()=>{for(const e of document.querySelectorAll('h1,h2,h3,p,div,span')){if(e.children.length==0&&/행정 정보와 맞춰/.test(e.textContent)){let o=1,n=e;while(n&&n!==document.body){o*=parseFloat(getComputedStyle(n).opacity);n=n.parentElement}const b=e.getBoundingClientRect();return [Math.round(b.top),o]}}return null})()"
        for i in range(160):
            pg.mouse.wheel(0, 100)
            pg.wait_for_timeout(120)
            t = pg.evaluate(JS)
            if t and t[1] > 0.9 and 0 < t[0] < 850:
                break
        for i in range(18):          # 셋째 장면의 마지막 단계('바로 판단')까지
            pg.mouse.wheel(0, 100)
            pg.wait_for_timeout(120)
        pg.wait_for_timeout(1200)
        shoot(pg, 'later9-main3', '메인 — 셋째 장면')
        pg.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        pg.wait_for_timeout(2500)
        shoot(pg, 'p170-main-end', '메인 — 맨 아래 문의하기')
    scene('later9', m3)
    c.close()


# ───────── 시안 ─────────
def mocks(b):
    for qs, name in [('?v=apply', 'mock-c-apply-category'), ('?v=admin', 'mock-c-admin-category'), ('?v=list', 'mock-c-analyze-list'),
                     ('?v=list&cat=%EA%B1%B4%EC%B6%95%C2%B7%EB%B3%80%ED%99%94&img=%ED%95%AD%EA%B3%B5', 'mock-c-analyze-list-filtered')]:
        def one(qs=qs, name=name):
            c, pg = newctx(b)
            pg.goto(f'{APP}/landxi/proto/review/mock/map-service-3/index.html{qs}', wait_until='domcontentloaded')
            try:
                pg.wait_for_selector('html[data-map-ready="1"]', timeout=60000)
            except Exception:
                pass
            pg.wait_for_timeout(2500)
            pg.evaluate(BADGE)
            shoot(pg, name, '시안 — 분야 관리', full=True)
            c.close()
        scene(name, one)

    def api():
        c, pg = newctx(b)
        pg.goto('http://127.0.0.1:4173/docs/superpowers/final/process/design-r15/open-api-2/fig/key-map.html', wait_until='domcontentloaded')
        pg.wait_for_timeout(2500)
        pg.evaluate(BADGE)
        shoot(pg, 'mock-api-key-map', '시안 — 외부 연동 API 키 그림(개발 서버 파일 · 바깥 주소에는 올라가 있지 않음)', full=True)
        c.close()
    scene('mock-api', api)


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    t0 = datetime.datetime.now()
    GROUPS = {'staff': (staff, ['menu', 'q10-projects', 'q2', 'q6', 'q9-apply-staff', 'later6', 'q10-label', 'a-mapsvc', 'c-infer', 'e-imagery']),
              'admin': (admin, ['q9-apply-admin', 'later1', 'q16', 'q17', 'n13', 'p17', 'p170-ops']),
              'namwon': (namwon, ['p8', 'n19']), 'gwangju': (gwangju, ['n16']), 'main': (main_pages, ['later9']), 'mock': (mocks, ['mock'])}
    for nm, (f, names) in GROUPS.items():
        if not any(want(x) for x in names):
            continue
        try:
            f(b)
        except Exception as e:
            FAILED.append(nm)
            print('실패(묶음)', nm, str(e)[:200].replace(chr(10), ' '), flush=True)
    b.close()
LOG.setdefault('_summary', {})
LOG['_summary'] = {'start': (LOG['_summary'].get('start') or t0.isoformat(timespec='seconds')), 'end': datetime.datetime.now().isoformat(timespec='seconds'), 'failed': FAILED, 'viewport': '1440x900', 'base': APP}
json.dump(LOG, open(os.path.join(OUT, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('끝 — 실패', FAILED)
