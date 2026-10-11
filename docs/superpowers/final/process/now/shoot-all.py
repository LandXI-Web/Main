"""now 페이지 한 바퀴 4단계(바퀴 3 · 10-11 두 번째 굽기) — 페이지의 모든 그림을 지금 한 번에 다시 찍는다(원칙 162 · CLAUDE.md §1-1-1).
바깥 주소(app · admin · 기관 .land-xi.dev)를 로그인 폼으로 열어 PC 1440. 실제 GPU 브라우저(Chrome 창). 역할별 로그인은 한 번씩(10분 20회 제한).
데이터를 바꾸는 동작(문의 보내기 · 신청 · 분석 실행 · 승인 · 내려받기 형식 누르기)은 하지 않는다 — 서랍을 여는 데까지만. 비밀번호는 server/.env 에서 읽고 출력하지 않는다.
시안(XI맵 현황판 · API 안내)은 같은 때 다시 찍는다(파일 이름 mock- → 페이지에 '시안').
사용: python shoot-all.py [--out 폴더] [--only 이름일부,...]   → <out>/ 에 png, log.json(장면별 시각 · 주소 · 상태)
"""
import datetime, json, os, re, shutil, subprocess, sys, zipfile
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
PROC = os.path.abspath(os.path.join(HERE, '..'))
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
LOGP = os.path.join(OUT, 'log.json')
LOG = json.load(open(LOGP, encoding='utf-8')) if os.path.exists(LOGP) else {}
FAILED = []
ERRS = {}


def want(name):
    return not ONLY or any(o in name for o in ONLY)


def shoot(pg, name, note='', mock=False):
    t = datetime.datetime.now()
    pre = 'mock-' if mock else ''
    fn = f"{pre}{name}-{t:%H%M}.png"
    for old in [k for k in LOG if re.fullmatch(re.escape(pre + name) + r'-\d{4}\.png', k)]:
        LOG.pop(old, None)
    pg.screenshot(path=os.path.join(OUT, fn))
    LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': re.sub(r'\?.*$', '', pg.url) + (('?' + pg.url.split('?', 1)[1]) if '?' in pg.url else ''), 'note': note}
    json.dump(LOG, open(LOGP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('찍음', fn, flush=True)
    return fn


def scene(name, fn, *a):
    if not want(name):
        return
    try:
        fn(*a)
    except Exception as e:
        FAILED.append(name)
        print('실패', name, str(e)[:300].replace('\n', ' '), flush=True)
        LOG['FAILED:' + name] = str(e)[:300]


def newctx(b, vp=(1440, 900)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, locale='ko-KR')
    c.add_init_script("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}")   # XI ChatGEO 시험 표시(개선할 질문에 안 들어감)
    pg = c.new_page()
    pg.set_default_timeout(60000)
    pg.set_default_navigation_timeout(90000)
    errs = []
    pg.on('console', lambda m: errs.append(m.text[:160]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    pg.on('request', lambda r: errs.append('LOCAL ' + r.url[:80]) if re.search(r'//(127\.0\.0\.1|localhost)|:8700|:4173', r.url) else None)
    return c, pg, errs


def login_lx(b, base, who):
    c, pg, errs = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded')
    pg.wait_for_selector('#id')
    pg.fill('#id', who)
    pg.fill('#pw', PW)
    pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
    pg.wait_for_timeout(2000)
    return c, pg, errs


def login_org(b, tenant):
    c, pg, errs = newctx(b)
    pg.goto(f'https://{tenant}.land-xi.dev/', wait_until='domcontentloaded')
    pg.locator('.gh-login input[name=login]').wait_for(timeout=30000)
    pg.fill('.gh-login input[name=login]', 'lxadmin@lx.or.kr')
    pg.fill('.gh-login input[name=password]', PW)
    pg.press('.gh-login input[name=password]', 'Enter')
    pg.wait_for_url(re.compile(r'/landxi/v3/(?!gov-home/)[a-z-]+/'), timeout=30000)
    pg.wait_for_timeout(2500)
    return c, pg, errs


def go(pg, url, sel=None, wait=1500):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=60000)
    pg.wait_for_timeout(wait)


def rail(pg, label):
    pg.evaluate("(l) => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === l)?.click()", label)


# ───────── 로그인 없이(메인 · 로그인) ─────────
def main_pages(b):
    c, pg, errs = newctx(b)

    def hero():
        go(pg, f'{APP}/landxi/v3/main/', None, 4000)
        shoot(pg, 'main1-hero', '메인 첫 화면 — 소개 글(PC 26px)')
    scene('main1-hero', hero)

    def kgz():
        go(pg, f'{APP}/landxi/v3/main/', None, 3500)
        geo = pg.evaluate("() => { const t = document.getElementById('trackB'); const r = t.getBoundingClientRect(); return { top: r.top + scrollY, h: t.offsetHeight, H: innerHeight }; }")

        def gt(x, wait):
            yy = geo['top'] + (x / 10.5) * (geo['h'] - geo['H'])
            pg.evaluate("(yy) => scrollTo({ top: yy - 500, behavior: 'instant' })", yy)
            pg.wait_for_timeout(300)
            for i in range(5):
                pg.mouse.wheel(0, 100)
                pg.wait_for_timeout(120)
            pg.wait_for_timeout(wait)
        gt(3 + 0.5 * 5, 5000)
        shoot(pg, 'main5-kyrgyz-districts', '메인 해외 장면 — 군별 경작지 색칠')
        gt(3 + 0.92 * 5, 7000)
        shoot(pg, 'main5-kyrgyz-zoom', '메인 해외 장면 — 경작지가 가장 많은 군으로 다가간 실제 판정 칸')
    scene('main5', kgz)

    def inq():
        go(pg, f'{APP}/landxi/v3/main/', None, 3000)
        pg.evaluate("() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })")
        pg.wait_for_timeout(3500)
        pg.locator('#fin [data-inquiry]').click()
        md = pg.locator('.k-md')
        pg.locator('.k-md-bg.is-open .iq-form').wait_for()
        pg.wait_for_timeout(1000)
        md.locator('input[name=name]').fill('입력 모양 확인')
        md.locator('input[name=org]').fill('보내지 않음')
        md.locator('.iq-k', has_text='사용 방법').click()
        md.locator('textarea[name=body]').fill('이 칸은 화면만 보여 주는 글이며 보내지 않습니다.')
        md.locator('.iq-ck').check()
        md.locator('.iq-go').click()          # 연락처 둘 다 비어 있어 화면에서 막힘(보내지지 않음)
        pg.wait_for_timeout(500)
        shoot(pg, 'main3-need-one', '문의 창 — 연락처와 메일 둘 다 비면 안내(보내지 않음)')
        md.locator('input[name=phone]').fill('010-0000-0000')
        md.locator('input[name=email]').fill('name@example.com')
        pg.wait_for_timeout(300)
        shoot(pg, 'main3-two-fields', '문의 창 — 연락처(전화) · 메일 주소 두 칸(보내지 않음)')
    scene('main3', inq)

    def login():
        go(pg, f'{APP}/landxi/v3/login/', '#pw', 2500)
        pg.fill('#pw', 'abc12345')
        pg.click('#pw-see')
        pg.wait_for_timeout(300)
        shoot(pg, 'q8-login', "로그인 — 아이디 칸 안내 · 비밀번호 칸 '숨기기' 글자 단추(칸 값은 시험 글자 · 로그인하지 않음)")
    scene('q8-login', login)
    c.close()
    ERRS['main'] = errs


# ───────── LX 직원 (app · test@lx.or.kr) ─────────
def staff(b):
    c, pg, errs = login_lx(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.ld-after', 1500)
        pg.locator('.k-sess:not([hidden])').wait_for(timeout=15000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'q11-188-dashboard', "LX 직원 대시보드 — 머리줄 남은 시간 · 진행 현황 칸 안 '공개 뒤 결과 확인 남음'")
    scene('dash', dash)

    def analyze():
        go(pg, f'{APP}/landxi/v3/lx-analyze/', '.la-ac', 3000)
        shoot(pg, 'gpt25-gpt27-analyze', "분석하기 — 카드(그림 없으면 '그림 없음') · AI 모델 정확도")
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', '#imagery .la-im-c', 2500)
        pg.evaluate("document.querySelector('#imagery').scrollIntoView({block:'start'})")
        pg.wait_for_timeout(1200)
        shoot(pg, 'qa2-imagery-radio', '분석하기 자세히 — 영상 고르기(하나만 · 라디오)')
        pg.evaluate("() => [...document.querySelectorAll('.la-dl dt')].find(d => d.textContent === '학습')?.scrollIntoView({ block: 'end' })")
        pg.wait_for_timeout(1200)
        shoot(pg, 'gpt3-5-analyze-detail', "분석하기 자세히 — '이 카드의 조건'의 AI 모델 정확도")
    scene('analyze', analyze)

    def apply():
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=publish', '.rl-cover', 2500)
        pg.locator('.rl-cover').scroll_into_view_if_needed()
        pg.wait_for_timeout(700)
        shoot(pg, 'gpt25-apply-cover', '배포 신청서 — 대표 그림 칸(필수 · 신청하지 않음)')
    scene('apply', apply)

    def mapsvc():
        go(pg, f'{APP}/landxi/v3/lx-map/', 'body[data-ready="1"]', 3500)
        if pg.locator('.lm-unfold').is_visible():
            pg.locator('.lm-unfold').click()
        pg.wait_for_timeout(1500)
        shoot(pg, 'q7-map-service', '지도 서비스 — 왼쪽 칸 슬림 · 묶음 접고 펴기 · 범례 오른쪽 위')
        pg.locator('.lm-fold').click()
        pg.wait_for_timeout(1200)
        shoot(pg, 'q7-folded', "지도 서비스 — '접기'로 칸을 접은 모습")
        pg.locator('.lm-unfold').click()
        pg.wait_for_timeout(800)
        g = pg.locator('.lm-grp', has_text='비닐하우스 분석서비스').first
        if g.locator('.lm-gt').get_attribute('aria-expanded') != 'true':
            g.locator('.lm-gt').click()
            pg.wait_for_timeout(600)
        row = g.locator('li', has_text='남원시').first
        row.hover()
        row.locator('.lm-dlb').click()
        pg.wait_for_selector('.lm-dl', timeout=15000)
        pg.wait_for_timeout(800)
        shoot(pg, 'q6-download', "층 줄 '내려받기' — 처음 한 번 동의 한 줄 · GeoJSON · SHP · 필지 엑셀(형식은 누르지 않음)")
    scene('mapsvc', mapsvc)

    def ask(q):
        box = pg.locator('.k-ck')
        if not box.is_visible():
            pg.get_by_text('XI ChatGEO', exact=True).first.click()
        pg.locator('.k-ck-i').fill(q)
        pg.locator('.k-ck-i').press('Enter')
        pg.wait_for_function("() => ['done', 'failed', 'rejected'].includes(document.querySelector('.k-ck')?.dataset.state)", timeout=120000)
        pg.wait_for_timeout(1200)
        ans = pg.locator('.k-ck-a').last.inner_text()
        LOG.setdefault('_chat', []).append({'q': q, 'a': ans[:400]})
        print(q, '→', ans.replace('\n', ' ')[:120], flush=True)
        return ans

    def only_layers(names):
        while pg.locator('.lm-sw[aria-checked="true"]').count():
            pg.locator('.lm-sw[aria-checked="true"]').first.click()
            pg.wait_for_timeout(300)
        for gname, rname in names:
            g = pg.locator('.lm-grp', has_text=gname).first
            if g.locator('.lm-gt').get_attribute('aria-expanded') != 'true':
                g.locator('.lm-gt').click()
            g.locator('li', has_text=rname).first.locator('.lm-sw').click()
            pg.wait_for_timeout(1200)
        pg.wait_for_timeout(2500)

    def chat():
        go(pg, f'{APP}/landxi/v3/lx-map/', 'body[data-ready="1"]', 3000)
        if pg.locator('.lm-unfold').is_visible():
            pg.locator('.lm-unfold').click()
        only_layers([('비닐하우스 분석서비스', '남원시')])
        ask('비닐하우스 단동만 펼쳐줘')
        shoot(pg, 'qa5-chat-single', "XI ChatGEO — '비닐하우스 단동만' → 구분이 없어 거르지 않고 그렇게 답함")
        ask('면적 1,000㎡ 넘는 것만 보여 줘')
        shoot(pg, 'qa5-chat-area', "XI ChatGEO — '면적 1,000㎡ 넘는 것만' → 지도에 조건")
        ask('조건 풀어 줘')
        ask('보고서 초안 만들어 줘')
        shoot(pg, 'q5-chat-report', 'XI ChatGEO — 보고서 초안(AI 분석 결과 보고서)')
        # 보고서 안 지도 그림 — 내려받은 보고서 파일 안의 그림을 꺼내 그대로 보여 줌
        try:
            lk = pg.locator('button.k-ck-file').last
            with pg.expect_download(timeout=60000) as dl:
                lk.click()
            z = zipfile.ZipFile(dl.value.path())
            imgs = sorted([n for n in z.namelist() if n.startswith('word/media/')], key=lambda n: -z.getinfo(n).file_size)
            t = datetime.datetime.now()
            fn = f'q5-report-map-{t:%H%M}.png'
            open(os.path.join(OUT, fn), 'wb').write(z.read(imgs[0]))
            LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': '(내려받은 보고서 파일 안의 지도 그림)', 'note': '보고서 안 지도 그림'}
            print('찍음', fn, flush=True)
        except Exception as e:
            FAILED.append('q5-report-map')
            LOG['FAILED:q5-report-map'] = str(e)[:300]
            print('실패 보고서 그림', str(e)[:200], flush=True)
        if pg.locator('.k-ck').is_visible():
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(500)
        # 두 층 쌓기 · 같은 범위
        only_layers([('주차장', '하거동'), ('비닐하우스 분석서비스', '남원시')])
        ask('면적 1,000㎡ 넘는 것만 보여 줘')
        ask('운봉읍만')
        shoot(pg, 'gpt3-3-stack', 'XI ChatGEO — 면적 → 운봉읍 조건이 쌓임 · 답 첫 줄 = 대상 · 조건 · 수 · 왼쪽 조건 칩 둘')
        ask('읍면동 통계 보여 줘')
        shoot(pg, 'gpt3-4-stats', '읍면동 통계 — 켜진 층 · 같은 조건 · 같은 수')
        ask('보고서 초안 만들어 줘')
        shoot(pg, 'gpt3-4-report', '보고서 초안 — 통계와 같은 대상 · 같은 조건 · 같은 수')
        if pg.locator('.k-ck').is_visible():
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(500)
        row = pg.locator('.lm-grp', has_text='비닐하우스 분석서비스').first.locator('li', has_text='남원시').first
        row.hover()
        row.locator('.lm-lsb').click()
        pg.wait_for_selector('.lm-rows .lm-row', timeout=30000)
        pg.wait_for_timeout(800)
        shoot(pg, 'list', "층 줄의 '목록' — 결과 표(넓은 것부터 · 지금 조건 그대로)")
        first = pg.locator('.lm-rows .lm-row').first
        first.focus()
        pg.keyboard.press('Enter')
        pg.wait_for_selector('.lm-props[data-view="props"] .lm-back', timeout=20000)
        pg.wait_for_timeout(2500)
        shoot(pg, 'list-pick', "목록 첫 줄 → 지도가 그 도형으로 가고 속성 칸 · '← 목록으로'")
    scene('chat', chat)

    def edge():
        go(pg, f'{APP}/landxi/v3/lx-map/', 'body[data-ready="1"]', 3000)
        if pg.locator('.lm-unfold').is_visible():
            pg.locator('.lm-unfold').click()
        only_layers([('주차장', '하거동')])
        shoot(pg, 'map-edge', "지도 서비스 항공영상 — 가장자리 띠 · '영상끼리 만나는 경계' 안내 한 줄(바탕 아래)")
    scene('edge', edge)

    def xi():
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html', None, 500)
        pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=120000)
        pg.wait_for_timeout(2500)
        rail(pg, '입체')
        pg.wait_for_timeout(6000)
        shoot(pg, 'gpt3-8-xi-tilt', 'XI맵 첫 화면 → 입체(자리 잡은 뒤 · 흰 공백 없음)')
        rail(pg, '입체')
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html?region=52190', None, 500)
        try:
            pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=90000)
        except Exception:
            pass
        pg.wait_for_timeout(4000)
        rail(pg, '입체')
        pg.wait_for_timeout(1200)
        shoot(pg, 'gpt3-8-xi-region-tilt-moving', 'XI맵 남원 입체 — 기울이는 중')
        pg.wait_for_timeout(6000)
        shoot(pg, 'gpt3-8-xi-region-tilt', 'XI맵 남원 입체 — 자리 잡은 뒤')
    scene('xi', xi)

    def xi_layers():
        go(pg, f'{APP}/landxi/v3/xi-clean/index.html?region=52730', None, 500)
        try:
            pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=90000)
        except Exception:
            pass
        pg.wait_for_timeout(4000)
        rail(pg, '층')
        pg.wait_for_timeout(1800)
        shoot(pg, 'xi-layers', "XI맵 무주군 — 왼쪽 도구 '층'")
    scene('xi-layers', xi_layers)

    def warn():
        # 5분 전 알림 — 다른 로그인 하나를 따로 열어 이 브라우저 시계만 앞으로 옮긴다(앞의 그림들에 알림이 번지지 않게 맨 끝에)
        c2, pg2, errs2 = login_lx(b, APP, 'test@lx.or.kr')
        go(pg2, f'{APP}/landxi/v3/lx-console/', '.ld-after', 1500)
        pg2.locator('.k-sess:not([hidden])').wait_for(timeout=15000)
        exp = pg2.evaluate("() => JSON.parse(localStorage.getItem('lx_api_session')).expires_at")
        p2 = c2.new_page()
        p2.clock.install(time=datetime.datetime.fromisoformat(exp.replace('Z', '+00:00')) - datetime.timedelta(minutes=4, seconds=20))
        p2.goto(f'{APP}/landxi/v3/lx-console/', wait_until='domcontentloaded')
        p2.locator('.k-sess:not([hidden])').wait_for(timeout=30000)
        p2.clock.run_for(16000)
        p2.locator('.k-toast').wait_for(timeout=10000)
        p2.wait_for_timeout(400)
        shoot(p2, 'q188-warn', '끝나기 5분 전 알림(흉내 — 이 브라우저 시계만 앞으로 옮김 · 서버 값은 그대로)')
        c2.close()
    scene('q188-warn', warn)
    c.close()
    ERRS['staff'] = errs


# ───────── LX 관리자 ─────────
def admin(b):
    c, pg, errs = login_lx(b, ADMIN, 'lxadmin@lx.or.kr')

    def sess():
        go(pg, f'{ADMIN}/landxi/v3/ops-accounts/#session', '.acc-card[data-tab="session"] .acc-sess', 1200)
        shoot(pg, 'q188-admin-lx', "계정 → '자동 로그아웃' 탭(LX 계정)")
    scene('admin-sess', sess)

    def inq():
        go(pg, f'{ADMIN}/landxi/v3/ops-accounts/#inquiries', '.acc-card[data-tab="inquiries"] tbody tr', 1500)
        shoot(pg, 'main3-admin-list', "계정 관리 → '문의' 탭 목록(연락처 · 메일 두 칸)")
    scene('admin-inq', inq)

    def imp():
        pg.goto(f'{ADMIN}/landxi/v3/ops-infra/#/deploys/categories', wait_until='domcontentloaded')
        pg.reload(wait_until='domcontentloaded')
        pg.wait_for_selector('.k-rail', timeout=60000)
        pg.wait_for_timeout(2500)
        pg.get_by_text('개선 후보', exact=False).first.click()
        pg.wait_for_timeout(2500)
        shoot(pg, 'gpt3-6-improve', "배포 → '개선 후보' 목록(사용자 질문은 '질문 원문' 표시)")
    scene('admin-improve', imp)
    c.close()
    ERRS['admin'] = errs


# ───────── 남원 기관 관리자 ─────────
def namwon(b):
    c, pg, errs = login_org(b, 'namwon')
    base = pg.url.split('/landxi/')[0]

    def sess():
        go(pg, f'{base}/landxi/v3/gov-accounts/#session', '.acc-card[data-tab="session"] .acc-sess', 1200)
        shoot(pg, 'q188-namwon', "남원시 관리자 — 계정 → '자동 로그아웃'(자기 기관만)")
    scene('namwon-sess', sess)

    def req():
        go(pg, f'{base}/landxi/v3/gov-request/', '.gq-cards .k-sc', 2000)
        rows = pg.locator('#shared .gq-sr[role=radio]')
        if rows.count():
            rows.nth(0).click()
            pg.wait_for_timeout(600)
        shoot(pg, 'gpt3-1-request', '남원시 요청하기 → 분석 요청 — 올리기 칸 없이 LX 영상 하나 고르기(고르기만 · 요청하지 않음)')
    scene('namwon-request', req)

    def parcels():
        go(pg, f'{base}/landxi/v3/gov-select/?service=card-farm', '.gd-scene', 2500)
        pg.locator('.gs-tabs a', has_text='필지 목록').click()
        pg.wait_for_selector('#sus-table tbody tr', timeout=40000)
        pg.wait_for_timeout(1500)
        pg.locator('#sus-table tbody tr').first.click()
        pg.wait_for_selector('#det', timeout=15000)
        pg.wait_for_timeout(2500)
        shoot(pg, 'gpt3-2-parcels', '남원시 경작·휴경 분석서비스 → 필지 목록 + 한 행 상세(AI 분석 결과 · 판정 단추 없음)')
    scene('namwon-parcels', parcels)

    def fusion():
        go(pg, f'{base}/landxi/v3/gov-fusion/', '.k-main', 6000)
        shoot(pg, 'fusion', "남원시 행정정보와 비교 — '의심 필지' 말 대신 'AI 분석 결과 필지'")
    scene('namwon-fusion', fusion)
    c.close()
    ERRS['namwon'] = errs


# ───────── 시안(XI맵 현황판 · API 안내) ─────────
def mocks(b):
    if want('mock-b'):
        d = os.path.join(PROC, 'design-r19', 'ximap-board')
        r = subprocess.run([sys.executable, os.path.join(d, 'shoot-mock.py')], cwd=d, capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'LX_PW': PW})
        print((r.stdout or '')[-800:], (r.stderr or '')[-400:])
        lg = json.load(open(os.path.join(d, 'log-mock.json'), encoding='utf-8'))
        for e in lg:
            if e['kind'] not in ('mock', 'edges'):
                continue
            base = re.sub(r'-1440-\d{4}\.png$', '', e['file'])
            t = e['shot_at']
            fn = f"mock-{base}-{t[11:13]}{t[14:16]}.png"
            shutil.copyfile(os.path.join(d, 'shots', e['file']), os.path.join(OUT, fn))
            LOG[fn] = {'at': t, 'url': e['url'], 'note': '시안 — ' + base, 'errors': e.get('errors')}
            print('시안', fn, flush=True)
        json.dump(LOG, open(LOGP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if want('mock-api'):
        c, pg, errs = newctx(b)
        pg.goto('file:///' + os.path.join(PROC, 'design-r18', 'open-api-3', 'mock', 'api-guide.html').replace('\\', '/'), wait_until='load')
        pg.wait_for_timeout(1500)
        shoot(pg, 'api-guide-1440', '시안 — 사이트 API 안내', mock=True)
        c.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    t0 = datetime.datetime.now()
    GROUPS = {'main': (main_pages, ['main1', 'main5', 'main3', 'q8']),
              'staff': (staff, ['dash', 'analyze', 'apply', 'mapsvc', 'chat', 'edge', 'xi', 'q188-warn']),
              'admin': (admin, ['admin-']), 'namwon': (namwon, ['namwon-']), 'mocks': (mocks, ['mock-'])}
    for nm, (f, names) in GROUPS.items():
        if ONLY and not any(want(x) for x in names):
            continue
        try:
            f(b)
        except Exception as e:
            FAILED.append(nm)
            print('실패(묶음)', nm, str(e)[:300].replace(chr(10), ' '), flush=True)
    b.close()
LOG.setdefault('_summary', {})
LOG['_summary'] = {'start': (LOG['_summary'].get('start') or t0.isoformat(timespec='seconds')), 'end': datetime.datetime.now().isoformat(timespec='seconds'), 'failed': FAILED, 'viewport': '1440x900', 'base': APP, 'errors': ERRS}
json.dump(LOG, open(LOGP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('끝 — 실패', FAILED)
