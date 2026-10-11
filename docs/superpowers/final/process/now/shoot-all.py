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
def badge(txt):
    return "document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;top:14px;left:14px;z-index:2147483647;background:#E8590C;color:#fff;font:800 28px/1 system-ui,sans-serif;padding:12px 22px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.25)\">%s</div>')" % txt


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


def rail(pg, label):
    pg.evaluate("(l) => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === l)?.click()", label)


def xi_ready(pg, ms=120000):
    try:
        pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=ms)
    except Exception:
        pass
    pg.wait_for_timeout(3500)


def chat_ask(pg, q, name, note, wait_s=150):
    if not pg.locator('.k-chat-in:visible').count():
        pg.locator('.k-chat-fab').click()
        pg.wait_for_timeout(1200)
    pg.locator('.k-chat-in input, .k-chat-in textarea').first.fill(q)
    pg.locator('.k-chat-send').click()
    last, same = '', 0
    for _ in range(wait_s):
        pg.wait_for_timeout(1000)
        t = pg.evaluate("() => (document.querySelector('.k-chat-msg.ai:last-of-type')||document.body).innerText.length + ':' + !!document.querySelector('.k-chat-doing:not([hidden])')")
        same = same + 1 if t == last and t.endswith('false') else 0
        last = t
        if same >= 6:
            break
    pg.wait_for_timeout(1500)
    shoot(pg, name, note)


# ───────── LX 직원 (app · test@lx.or.kr) ─────────
def staff(b):
    c, pg = login_lx(b, APP, 'test@lx.or.kr')
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:120]))

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.k-rail', 4500)
        shoot(pg, 'dash', 'LX 직원 대시보드 — 프로젝트 진행 현황 요약 칸')
    scene('dash', dash)

    def dash_loading():
        held = []
        rx = re.compile(r'/api/v1/(projects\?scope=mine|me/jobs)')
        pg.route(rx, lambda r: held.append(r))
        pg.goto(f'{APP}/landxi/v3/lx-console/', wait_until='domcontentloaded')
        pg.wait_for_timeout(1500)
        pg.evaluate(badge('흉내'))
        shoot(pg, 'dash-loading', '대시보드 첫 순간(흉내 — 프로젝트 목록 · 내 작업 응답을 잠시 붙잡음 · 찍은 뒤 그대로 보냄)')
        for r in held:
            r.continue_()
        pg.unroute(rx)
    scene('dash-loading', dash_loading)

    def projects():
        go(pg, f'{APP}/landxi/v3/lx-project/', '.lxp-list .sb-tb tbody tr', 2000)
        shoot(pg, 'projects', '프로젝트 목록 — 단계 칸과 진행 n/6')
        pid = pg.evaluate("() => [...document.querySelectorAll('.lxp-list .sb-tb tbody tr')].find(r => /비닐하우스/.test(r.innerText))?.dataset.id")
        if pid:
            go(pg, f'{APP}/landxi/v3/lx-project/?project={pid}', '.lxp-bar-steps .lxp-st', 2500)
            shoot(pg, 'project-detail', '프로젝트 한 건 — 단계 줄(공개 뒤 안 한 추론 · 결과 확인은 건너뜀)')
    scene('projects', projects)

    def train_infer():
        go(pg, f'{APP}/landxi/v3/lx-train/?project={PRJ}&stage=train', '.k-rail', 4500)
        shoot(pg, 'train', '학습 탭 — 맨 위 설명 칸')
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=infer', '.k-rail', 4500)
        shoot(pg, 'infer', '추론 탭 — 맨 위 설명 칸')
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=publish', '.k-rail', 4500)
        shoot(pg, 'publish', '배포 신청 탭 — 모델 줄의 정확도 이름표')
        pg.evaluate("(()=>{const e=[...document.querySelectorAll('label,h3,h4,dt,span,b')].find(x=>/^분야/.test(x.textContent.trim()));if(e)e.scrollIntoView({block:'center'})})()")
        pg.wait_for_timeout(900)
        shoot(pg, 'apply', '배포 신청서 — 분야 여러 개 · 쓸 수 있는 영상')
    scene('train', train_infer)

    def analyze():
        go(pg, f'{APP}/landxi/v3/lx-analyze/', '.la-ac', 3500)
        shoot(pg, 'analyze-list', '분석하기 — 분야 거르기 칩 · 서비스 카드 · 검증 정확도 아래 기준 한 줄')
        try:
            pg.get_by_text('건축·변화', exact=False).first.click(timeout=4000)
            pg.wait_for_timeout(1200)
            pg.get_by_role('button', name=re.compile('^항공')).first.click(timeout=4000)
            pg.wait_for_timeout(1500)
        except Exception as e:
            print('칩 못 누름', str(e)[:80])
        shoot(pg, 'analyze-filtered', '분석하기 — 분야 건축·변화 + 영상 항공으로 거른 모습')
        pg.route('**/preview/**', lambda r: r.abort())
        pg.reload()
        pg.wait_for_selector('.la-ac', timeout=60000)
        pg.wait_for_timeout(3000)
        try:
            pg.click('text=농지·시설', timeout=4000)
        except Exception:
            pass
        pg.wait_for_timeout(1500)
        pg.evaluate(badge('흉내'))
        shoot(pg, 'analyze-fallback', '그림을 못 받은 카드(흉내 — 학습 표본 그림을 막음) · 같은 틀의 대체 그림 + 결과 장면 없음')
        pg.unroute('**/preview/**')
    scene('analyze', analyze)

    def detail():
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', '#imagery .la-im-c', 4000)
        shoot(pg, 'detail-top', '분석하기 자세히 — 위(서비스 소개 · 상태 표시)')
        pg.evaluate("() => document.querySelector('.la-eta')?.scrollIntoView({ block: 'center' })")
        pg.wait_for_timeout(700)
        shoot(pg, 'eta', '결과까지 걸리는 시간 — 고른 영상 · 범위 · 같은 영상 최근 실제 속도')
        pg.evaluate("() => [...document.querySelectorAll('.la-dl dt')].find(d => d.textContent === '걸리는 시간')?.scrollIntoView({ block: 'center' })")
        pg.wait_for_timeout(700)
        shoot(pg, 'cond', '이 카드의 조건 — 걸리는 시간 + 전제')
        pg.evaluate("document.querySelector('#imagery').scrollIntoView({block:'start'})")
        pg.wait_for_timeout(1500)
        shoot(pg, 'imagery-pick', '영상 고르기 — 카드 두 열 + 범위 지도')
        try:
            pg.locator('#imagery button', has_text=re.compile('더 보기')).first.click(timeout=4000)
            pg.wait_for_timeout(1000)
        except Exception:
            pass
        small = pg.locator('#imagery .la-im-c', has_text='남원시 2023 항공영상').first
        small.scroll_into_view_if_needed()
        small.click()
        pg.wait_for_timeout(3000)
        shoot(pg, 'imagery-small', "겹침이 작은 영상 '남원시 2023 항공영상'을 고른 모습 — 옆 칸이 그 영상 기준으로 바뀜")
    scene('detail', detail)

    def inbox():
        go(pg, f'{APP}/landxi/v3/lx-inbox/', '.ib-cells .ib-cell', 2000)
        shoot(pg, 'inbox', '요청함 — 요청과 개선 후보를 구분한 한 줄')
        pg.click('.ib-cell[data-k="improve"]')
        pg.wait_for_timeout(2500)
        shoot(pg, 'improve', '개선 후보 창 — 어디서 왔고 채택하면 무엇이 바뀌는지(채택은 누르지 않음)')
    scene('inbox', inbox)

    def mapchat():
        go(pg, f'{APP}/landxi/v3/lx-map/', 'body[data-ready="1"]', 4000)
        shoot(pg, 'map-list', '지도 서비스 — 지금 내 분석 결과 목록(켜기 전)')
        pg.locator('.k-chat-fab').click()
        pg.wait_for_timeout(1500)
        shoot(pg, 'chat-open', 'XI ChatGEO — 처음 연 모습')
        chat_ask(pg, '남원시 비닐하우스 읍면동별로 통계 내 줘', 'chat-stats', 'XI ChatGEO — 읍면동별 통계를 물은 답')
        chat_ask(pg, '보고서 초안 만들어 줘', 'chat-report', 'XI ChatGEO — 보고서 초안을 청한 답(내려받기는 누르지 않음)')
        chat_ask(pg, '분석 결과를 GeoJSON 으로 내려받고 싶어', 'chat-geojson', 'XI ChatGEO — 결과 내려받기를 청한 답')
    scene('chat', mapchat)

    def xi():
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html', None, 500)
        xi_ready(pg)
        shoot(pg, 'xi-arrive', 'XI맵 — 도착(지역 없이 전국)')
        rail(pg, '입체')
        pg.wait_for_timeout(1200)
        shoot(pg, 'xi-tilt-moving', 'XI맵 입체 — 기울이는 중(흰 빈자리 없이 · 전국 건수는 작은 칸)')
        pg.wait_for_timeout(5500)
        shoot(pg, 'xi-tilt', 'XI맵 입체 — 자리 잡은 뒤')
        rail(pg, '입체')
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html?region=52730', None, 500)
        xi_ready(pg)
        shoot(pg, 'xi-muju', 'XI맵 무주군 — 큰 숫자 · 글과 지도 층이 같은 판정')
        rail(pg, '층')
        pg.wait_for_timeout(1800)
        shoot(pg, 'xi-layers', 'XI맵 도구 층')
        rail(pg, '층')
        rail(pg, '보고서')
        pg.wait_for_timeout(2200)
        shoot(pg, 'xi-report', 'XI맵 도구 보고서')
        rail(pg, '보고서')
        rail(pg, '분석')
        pg.wait_for_timeout(2200)
        shoot(pg, 'xi-analyze', 'XI맵 도구 분석(실행은 누르지 않음)')
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html?region=11110', None, 500)
        xi_ready(pg, 90000)
        rail(pg, '분석')
        pg.wait_for_timeout(2200)
        shoot(pg, 'xi-noimg', 'XI맵 종로구 — 영상 등록이 없는 시군구에서 분석 도구')
    scene('xi', xi)

    def glob():
        pg.goto(f'{APP}/landxi/v3/global/index.html', wait_until='domcontentloaded')
        try:
            pg.wait_for_function("() => document.querySelector('.gl')?.dataset.level === 'district'", timeout=150000)
            pg.wait_for_function("() => document.querySelector('.gl-sheet')?.getAnimations().length === 0", timeout=60000)
        except Exception:
            pass
        pg.wait_for_timeout(2000)
        shoot(pg, 'xi-global', '해외 화면(Kyrgyzstan) — 오른쪽 판이 자리에 앉은 뒤')
    scene('xi-global', glob)

    # 시안 — 직원 세션을 같이 씀(시안 안 로그인 폼이 뜨면 채움)
    def mock(path, name, note):
        def one():
            pg.goto(f'{APP}/landxi/proto/review/mock/{path}', wait_until='domcontentloaded')
            try:
                pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=30000)
                if pg.is_visible('#login form'):
                    pg.fill('#login input[name=login]', 'test@lx.or.kr')
                    pg.fill('#login input[name=password]', PW)
                    pg.click('#login button')
            except Exception:
                pass
            try:
                pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)
            except Exception:
                pass
            pg.wait_for_timeout(2000)
            shoot(pg, name, note)
        scene(name, one)
    mock('ximap-evolve/index.html?v=front', 'mock-evo-front', '시안 — XI맵 앞면(전국 결과 · 영상 원천 · 연도 · 고치기)')
    mock('ximap-evolve/index.html?v=fix', 'mock-evo-fix', '시안 — 고치기(구례군 2023 실제 결과 · 칸 다 봤음)')
    mock('ximap-evolve/index.html?v=gov', 'mock-evo-gov', '시안 — 기관 신고(남원 실제 109건)')
    mock('ximap-evolve/index.html?v=train', 'mock-evo-train', '시안 — 다시 학습 · 같은 검증 묶음 비교')
    mock('ximap-evolve/index.html?v=wheel', 'mock-evo-wheel', '시안 — 한 바퀴(보기 → 고치기 → 쌓기 → 다시 학습 → 비교 → 배포 신청 → 새 판)')
    mock('ximap-r16/index.html?v=global', 'mock-r16-global', '시안 — 같은 지도에서 나라를 바꾼 해외(키르기스스탄)')

    # 세션 끝남 — 마지막(쿠키를 지움). 흉내
    def expired():
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', '#imagery .la-im-c', 3000)
        pg.evaluate("() => { const k = 'lx_api_session'; const s = JSON.parse(localStorage.getItem(k) || 'null'); if (s) { s.token = 'expired-sim'; localStorage.setItem(k, JSON.stringify(s)); } }")
        pg.locator('#imagery .la-im-c:not([disabled])').nth(1).click()
        pg.wait_for_selector('.k-md', timeout=20000)
        pg.wait_for_timeout(1200)
        pg.evaluate(badge('흉내'))
        shoot(pg, 'session-modal', "쓰던 중 로그인이 끝났을 때(흉내 — 이 브라우저에 저장된 로그인 값을 못 쓰는 값으로 바꿈) — 가운데 창 '로그인이 끝났습니다'")
    scene('session', expired)
    print('직원 오류', errs[:3])
    c.close()


# ───────── LX 관리자 (admin · lxadmin@lx.or.kr) ─────────
def admin(b):
    c, pg = login_lx(b, ADMIN, 'lxadmin@lx.or.kr')
    org = ADMIN

    def hashgo(h, sel, wait=1500):
        pg.goto(f'{org}/landxi/v3/{h}', wait_until='domcontentloaded')
        pg.reload(wait_until='domcontentloaded')
        pg.wait_for_selector(sel, timeout=60000)
        pg.wait_for_timeout(wait)

    def cat():
        hashgo('ops-infra/#/deploys/categories', '.k-rail', 3500)
        shoot(pg, 'admin-category', '배포 → 분야 탭 — 순서 · 이름 · 쓰는 서비스 수')
        hashgo('ops-infra/#/deploys/share', '.rv-sgg', 1500)
        shoot(pg, 'admin-share', '배포 → 기관 공유 — 분야 묶음 머리줄')
    scene('admin-cat', cat)

    def acc():
        go(pg, f'{org}/landxi/v3/ops-accounts/', '.acc-tab', 2500)
        shoot(pg, 'admin-accounts', '계정 관리 — LX 계정만')
        pg.locator('.acc-tab[data-tab="logins"]').click()
        pg.wait_for_timeout(2500)
        shoot(pg, 'admin-logins', '계정 관리 — LX 로그인 기록만')
        go(pg, f'{org}/landxi/v3/ops-infra/#/tenants', '.org[data-id="namwon"]', 1500)
        pg.locator('.org[data-id="namwon"]').click()
        pg.wait_for_selector('.tp-h h1')
        pg.locator('.tp-tabs button[data-k="use"]').click()
        pg.wait_for_selector('.tp-use')
        pg.wait_for_timeout(1800)
        shoot(pg, 'admin-tenant-use', '기관 한 곳 — 사용과 계정(요약 숫자만)')
    scene('admin-acc', acc)

    def api():
        hashgo('ops-infra/#/deploys/api', '.ak-row, .ak-tbl', 1800)
        shoot(pg, 'api-tab', '배포 → API 탭 — 기관 × 서비스마다 키 줄')
        pg.locator('tr.ak-pair .ak-mk').first.click()
        pg.wait_for_selector('.k-drawer .ak-form')
        pg.wait_for_timeout(800)
        shoot(pg, 'api-create', "'키 만들기' 서랍(여는 데까지 · 만들지 않음)")
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(600)
        try:
            pg.locator('tr.ak-row').first.click(timeout=5000)
            pg.wait_for_selector('.k-drawer .ak-ctbl', timeout=10000)
            pg.wait_for_timeout(1000)
            shoot(pg, 'api-detail', '키 자세히 — 상태 · 끝나는 날 · 형식 · 한도 · 최근 호출 기록(지난 시험 키 · 바꾸지 않음)')
            pg.keyboard.press('Escape')
        except Exception:
            print('키 줄 없음', flush=True)
        hashgo('ops-infra/#/deploys/usage', '.rv-tbl--usage', 1500)
        shoot(pg, 'api-usage', '배포 → 사용 현황 — API 호출 열')
    scene('api', api)

    def inq():
        go(pg, f'{org}/landxi/v3/ops-accounts/#inquiries', '.acc-card[data-tab="inquiries"] tbody tr', 1500)
        shoot(pg, 'inq-list', "계정 관리 → '문의' 탭 목록")
        row = pg.locator('.acc-card[data-tab="inquiries"] tbody tr', has_text='Land-XI 시험').first
        if not row.count():
            row = pg.locator('.acc-card[data-tab="inquiries"] tbody tr').first
        row.click()
        pg.locator('.k-drawer .acc-iq-body').wait_for()
        pg.wait_for_timeout(900)
        shoot(pg, 'inq-open', '문의 한 건 열기(지난 시험 문의 · 바꾸지 않음)')
    scene('inq', inq)
    c.close()


# ───────── 남원 기관 관리자 ─────────
def namwon(b):
    c, pg = login_org(b, 'namwon')
    base = pg.url.split('/landxi/')[0]

    def acc():
        go(pg, f'{base}/landxi/v3/gov-accounts/#accounts', '.k-rail', 3000)
        shoot(pg, 'namwon-accounts', '남원시 관리자 — 계정(자기 기관만)')
        try:
            pg.get_by_text('로그인 기록', exact=False).first.click(timeout=5000)
            pg.wait_for_timeout(2000)
        except Exception:
            go(pg, f'{base}/landxi/v3/gov-accounts/#logins', '.k-rail', 2500)
        shoot(pg, 'namwon-logins', '남원시 관리자 — 로그인 기록(자기 기관만)')
    scene('namwon-acc', acc)

    def keys():
        go(pg, f'{base}/landxi/v3/gov-select/?view=org', '.gk', 1500)
        pg.locator('.gk').scroll_into_view_if_needed()
        pg.wait_for_timeout(800)
        shoot(pg, 'gov-keys', "남원시 기관 정보 — '받은 API 키'(보기만 · 키 값 없음)")
    scene('gov-keys', keys)
    c.close()


# ───────── 로그인 없이(메인 · 로그인) ─────────
def scroll_to(pg, rx, limit=200):
    JS = "(rx)=>{const R=new RegExp(rx);for(const e of document.querySelectorAll('h1,h2,h3,p,div,span')){if(e.children.length==0&&R.test(e.textContent)){let o=1,n=e;while(n&&n!==document.body){o*=parseFloat(getComputedStyle(n).opacity);n=n.parentElement}const b=e.getBoundingClientRect();return [Math.round(b.top),o]}}return null}"
    for i in range(limit):
        t = pg.evaluate(JS, rx)
        if t and t[1] > 0.9 and 0 < t[0] < 800:
            break
        pg.mouse.wheel(0, 100)
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(1200)


def main_pages(b):
    c, pg = newctx(b)

    def hero():
        go(pg, f'{APP}/landxi/v3/main/', None, 4000)
        shoot(pg, 'main-hero', '메인 — 첫 화면(모토 · 소개 글)')
        pg.click('.m-nav a[href="#ch4"]')
        pg.wait_for_timeout(2500)
        shoot(pg, 'main-services', "메인 '서비스' 장면 — 제목 · 글 · 카드 셋")
    scene('main-hero', hero)

    def ch3():
        go(pg, f'{APP}/landxi/v3/main/', None, 3000)
        scroll_to(pg, '행정 정보와 맞춰')
        for i in range(18):
            pg.mouse.wheel(0, 100)
            pg.wait_for_timeout(120)
        pg.wait_for_timeout(1200)
        shoot(pg, 'main-ch3', '메인 — 셋째 장면(행정 정보와 맞춰 바로 판단)')
    scene('main-ch3', ch3)

    def ch5():
        go(pg, f'{APP}/landxi/v3/main/', None, 3000)
        scroll_to(pg, '바로 열립니다')
        shoot(pg, 'main-open', "메인 — '같은 서비스가 그 지역 영상과 대장으로 바로 열립니다' 장면")
    scene('main-open', ch5)

    def kyr():
        go(pg, f'{APP}/landxi/v3/main/', None, 3500)
        info = pg.evaluate("() => { const t = document.getElementById('trackB'); const r = t.getBoundingClientRect(); return { top: r.top + scrollY, h: t.offsetHeight }; }")
        y = info['top'] + (info['h'] - 900) * 0.62
        pg.evaluate("(yy) => scrollTo({ top: yy - 600, behavior: 'instant' })", y)
        pg.wait_for_timeout(400)
        for i in range(6):
            pg.mouse.wheel(0, 100)
            pg.wait_for_timeout(120)
        pg.wait_for_timeout(4000)
        shoot(pg, 'main-kyrgyz', '메인 마지막 해외 장면 — 키르기스스탄 실제 분석 결과')
        pg.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        pg.wait_for_timeout(3500)
        shoot(pg, 'main-end', '메인 맨 아래 — 마감 문장 · 문의하기')
        pg.locator('#fin [data-inquiry]').click()
        pg.locator('.k-md-bg.is-open .iq-form').wait_for()
        pg.wait_for_timeout(1200)
        shoot(pg, 'main-inquiry', '문의하기 창(보내지는 않음)')
    scene('main-kyrgyz', kyr)

    def login():
        go(pg, f'{APP}/landxi/v3/login/', None, 2500)
        shoot(pg, 'login-empty', '로그인 화면 — 아이디 · 비밀번호 칸')
        with pg.expect_navigation(timeout=15000):
            pg.locator('.door__home').click()
        pg.wait_for_timeout(2500)
        shoot(pg, 'login-logo-click', 'Land-XI 를 누른 뒤 — 메인으로')
    scene('login', login)
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    t0 = datetime.datetime.now()
    GROUPS = {'main': (main_pages, ['main-', 'login']), 'staff': (staff, ['dash', 'projects', 'train', 'analyze', 'detail', 'inbox', 'chat', 'xi', 'mock', 'session']),
              'admin': (admin, ['admin-', 'api', 'inq']), 'namwon': (namwon, ['namwon-', 'gov-keys'])}
    for nm, (f, names) in GROUPS.items():
        if ONLY and not any(want(x) for x in names):
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
