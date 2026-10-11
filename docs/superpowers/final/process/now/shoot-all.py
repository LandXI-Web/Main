"""now 페이지 한 바퀴 4단계(바퀴 4 · 10-11 세 번째 굽기) — 페이지의 모든 그림을 지금 한 번에 다시 찍는다(원칙 162 · CLAUDE.md §1-1-1).
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


def xi_ready(pg, wait=3000):
    pg.wait_for_function("() => document.documentElement.dataset.xc === 'ready'", timeout=90000)
    pg.wait_for_timeout(wait)


def helpbtn(pg, pat):
    pg.evaluate("(p) => [...document.querySelectorAll('[role=tab],button,a')].find(x => new RegExp(p).test(x.textContent.trim()) && !x.classList.contains('hm-ask'))?.click()", pat)
    pg.wait_for_timeout(1500)


# ───────── 로그인 없이 ─────────
def public(b):
    c, pg, errs = newctx(b)

    def guide():
        go(pg, f'{APP}/landxi/v3/api-guide/', '#svc .ag-card', 800)
        shoot(pg, 'API3-guide', "API 안내 — 로그인 없이 열림(세 걸음 · 서비스 목록 · 표준 가이드)")
    scene('API3-guide', guide)
    c.close()
    ERRS['public'] = errs


# ───────── LX 직원 ─────────
def staff(b):
    c, pg, errs = login_lx(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.ld-jobs .ld-kinds', 1500)
        shoot(pg, 'GPT4-3-dashboard', "LX 직원 대시보드 — '내가 돌린 작업' 종류별 합 = 상태별 합")
    scene('GPT4-3', dash)

    def mappick():
        go(pg, f'{APP}/landxi/v3/lx-map/?job=job_01M4JX13YPQ4M50XGZCTQPFYVN', 'body[data-ready="1"]', 1000)
        pg.wait_for_function("() => document.documentElement.dataset.mapReady === '1'", timeout=60000)
        pg.evaluate("() => window.__lm.map.fitBounds([[127.6403656, 37.2231154], [127.6407769, 37.2234183]], { duration: 0, maxZoom: 18, padding: 260 })")
        pg.wait_for_timeout(3000)
        cc = pg.evaluate("() => { const m = window.__lm.map; const q = m.project([127.640672, 37.2233328]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }")
        pg.mouse.click(cc['x'], cc['y'])
        pg.locator('.lm-props[data-view="props"]').wait_for(timeout=20000)
        pg.wait_for_timeout(2500)
        shoot(pg, 'GPT4-1-picked', '지도 서비스 — 주차장 도형을 눌러 속성 칸(값 없는 칸은 —)')
        pg.evaluate("() => document.dispatchEvent(new CustomEvent('kit:agent-action', { cancelable: true, detail: { op: 'map_filter', label: '1,000㎡ 넘음', n: 0, area_min: 1000, area_op_min: '>', chips: [{ k: 'area', label: '1,000㎡ 넘음' }] } }))")
        pg.wait_for_timeout(1500)
        shoot(pg, 'GPT4-1-filtered-closed', "거르기 '면적 1,000㎡ 넘는 것만' — 고른 도형이 빠져 속성 칸이 닫힘")
    scene('GPT4-1', mappick)

    def xitools():
        go(pg, f'{APP}/landxi/v3/xi-clean/?sgg=41670', '.k-rail .k-rail-i', 4500)
        shoot(pg, 'GPT4-4-ximap-tools', 'XI맵 — 도구(레이어 · 가르기 · 보고서 · 분석)는 글자만')
    scene('GPT4-4', xitools)

    def layer():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg, 4000)
        lay = pg.locator('.k-rail-i', has_text='레이어').first
        if lay.count():
            lay.click()
            pg.wait_for_timeout(1000)
        LOG['_rail'] = pg.evaluate("() => [...document.querySelectorAll('.k-rail-i')].map(b => b.textContent.trim())")
        LOG['_terrain'] = pg.evaluate("() => { const m = window.__xc?.map; return { pitch: m?.getPitch(), maxPitch: m?.getMaxPitch(), dem: !!m?.getSource('xc-dem'), terrain: !!m?.getTerrain?.() }; }")
        shoot(pg, 'layer-xi-rail', 'XI맵 — 왼쪽 도구 레이어 · 가르기 · 보고서 · 분석(입체 없음)')
        pg.keyboard.press('Escape')
        pg.keyboard.press('Control+k')
        pg.wait_for_timeout(700)
        pg.locator('.k-ck-i').fill('영상 꺼 줘')
        pg.locator('.k-ck-i').press('Enter')
        pg.wait_for_function("() => /레이어|층/.test(document.querySelector('.k-ck')?.innerText || '')", timeout=60000)
        pg.wait_for_timeout(1500)
        LOG['_chat'] = pg.evaluate("() => (document.querySelector('.k-ck')?.innerText || '').slice(0, 300)")
        shoot(pg, 'layer-chatgeo', "XI ChatGEO — '영상 꺼 줘' → '영상 레이어를 껐습니다'")
        pg.keyboard.press('Escape')
    scene('layer', layer)

    def kgz():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg, 2500)
        pg.locator('.xn-b', has_text='키르기스스탄').click()
        pg.wait_for_function("() => !!window.__xc?.map?.getLayer('xn-kg-f')", timeout=30000)
        pg.wait_for_timeout(6000)
        shoot(pg, 'global-kgz', 'XI맵 — 사업 나라 키르기스스탄 · 군 41곳 경작지 결과')
        pt = pg.evaluate("""() => { const m = window.__xc.map; const fs = m.querySourceFeatures('xn-kg'); const f = fs.find((x) => x.properties.name === 'Sokuluk');
          if (!f) return null; const c = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0]; let x = 0, y = 0; for (const p of c) { x += p[0]; y += p[1]; }
          const q = m.project([x / c.length, y / c.length]); const r = m.getCanvas().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }""")
        if not pt:
            raise Exception('Sokuluk 군 자리를 못 찾음')
        pg.mouse.click(pt['x'], pt['y'])
        pg.wait_for_timeout(7000)
        shoot(pg, 'global-kgz-focus', 'XI맵 — 군을 눌러 확대 · Sokuluk 군은 실제 판정 칸')
    scene('global-kgz', kgz)

    def imagery():
        go(pg, f'{APP}/landxi/v3/lx-analyze/?card=card-5e85a9&region=52190', '#imagery .la-im-map .maplibregl-canvas', 800)
        pg.evaluate("document.querySelector('#imagery').scrollIntoView({block:'start'})")
        pg.wait_for_timeout(5000)
        shoot(pg, 'qa2-imagery-one', '분석하기 — 영상 고르기 · 고른 영상 하나만 청록 테두리')
        other = pg.locator('#imagery .la-im-c[data-on="0"][data-no="0"]').first
        if other.count():
            other.hover()
            pg.wait_for_timeout(1200)
            shoot(pg, 'qa2-imagery-hover', '분석하기 — 다른 영상 카드에 올리면 그 범위만 옅은 점선')
    scene('qa2', imagery)

    def edges():
        HELP = os.path.join(ROOT, 'landxi', 'v3', 'help-my', 'data', 'screens')
        st = lambda: datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
        at = {}
        go(pg, f'{APP}/landxi/v3/lx-analyze/', '.la-head', 3500)
        pg.screenshot(path=os.path.join(HELP, 'analyze.jpg'), type='jpeg', quality=78)
        at['analyze'] = f'{st()} 찍음 · 실제 화면'
        shoot(pg, 'what-analyze', "분석하기 첫 화면 — '이 화면은?'")
        go(pg, f'{APP}/landxi/v3/lx-map/', '.lm-h1', 6000)
        pg.screenshot(path=os.path.join(HELP, 'mapsvc.jpg'), type='jpeg', quality=78)
        at['mapsvc'] = f'{st()} 찍음 · 실제 화면'
        shoot(pg, 'what-mapsvc', "지도 서비스 첫 화면 — '이 화면은?'")
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg, 5000)
        pg.screenshot(path=os.path.join(HELP, 'ximap.jpg'), type='jpeg', quality=78)
        at['ximap'] = f'{st()} 찍음 · 실제 화면'
        shoot(pg, 'what-ximap', "XI맵 첫 화면 — '이 화면은?'")
        json.dump(at, open(os.path.join(HELP, 'at.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        go(pg, f'{APP}/landxi/v3/help-my/?tab=screens', '.hm-sc img', 500)
        pg.wait_for_function("() => [...document.querySelectorAll('.hm-sc img')].every((i) => i.complete && i.naturalWidth > 0)", timeout=30000)
        pg.wait_for_timeout(1500)
        shoot(pg, 'edges-help', "지원 '세 화면' 탭 — 실제 그림 셋 + 한 줄씩")
    scene('edges', edges)

    def icons():
        go(pg, f'{APP}/landxi/v3/help-my/', None, 2500)
        helpbtn(pg, '^자주 묻는')
        LOG['_faq_svg'] = pg.locator('.hm-q svg').count()
        shoot(pg, 'icons-help-faq', '지원 — 자주 묻는 질문(화살표 없음)')
        helpbtn(pg, '^문의')
        LOG['_contact_svg'] = pg.locator('.hm-ct svg').count()
        shoot(pg, 'icons-help-contact', '지원 — 문의 전화 · 메일(글자만)')
        go(pg, f'{APP}/landxi/v3/global/', '.gl-crumb--globe', 3000)
        shoot(pg, 'icons-global', "지구본 단추 — '지구본' 글자")
    scene('icons', icons)

    def review():
        go(pg, f'{APP}/landxi/v3/lx-project/?project={PRJ}', '.k-main', 3500)
        shoot(pg, 'q-count-project', "프로젝트 화면 — '결과 확인' 0/20(이번 묶음)")
        go(pg, f'{APP}/landxi/v3/lx-review/?project={PRJ}', '.k-main', 4000)
        shoot(pg, 'q-count-review', "결과 확인 화면 — 표본 0/100(판정에 필요한 수)")
    scene('q-count', review)
    c.close()
    ERRS['staff'] = errs


# ───────── LX 관리자 ─────────
def admin(b):
    c, pg, errs = login_lx(b, ADMIN, 'lxadmin@lx.or.kr')

    def share():
        go(pg, f'{ADMIN}/landxi/v3/lx-deploy/', '.dp-plant', 2500)
        LOG['_plant'] = pg.locator('.dp-plant').inner_html()
        shoot(pg, 'icons-deploy-share', "배포 — '기관에 공유' 단추(글자만)")
    scene('icons-deploy', share)

    def adopt():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/improve', '.im-t, .im-box', 2500)
        a = pg.locator('button[data-a="adopt"]').first
        if not a.count():
            raise Exception('채택할 줄이 없음')
        a.click()
        pg.locator('.im-modes').wait_for(timeout=10000)
        pg.wait_for_timeout(900)
        shoot(pg, 'adopt-form', "개선 후보 '채택' — 갈래 넷(다른 이름 · 질문 뜻 연결 · 답 문구 · 개발 할 일) 칸 열기(보내지 않음)")
        pg.keyboard.press('Escape')
    scene('adopt', adopt)

    def keys():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/?view=deploys#/deploys/api', None, 5000)
        LOG['_keys_text'] = pg.evaluate("() => (document.querySelector('.k-main')?.innerText || '').slice(0, 200)")
        shoot(pg, 'API3-keys-tab', "배포 → API — 신청 시스템 × 서비스 줄")
    scene('API3-keys', keys)

    def req():
        go(pg, f'{ADMIN}/landxi/v3/ops-core/#/approvals/apikeys', '.aa-row, .k-main', 3500)
        shoot(pg, 'API3-requests-tab', "요청 관리 → 'API 키 신청' 탭")
        pg.get_by_text('처리한 신청도 보기').click()
        pg.wait_for_timeout(1500)
        rows = pg.locator('.aa-row')
        LOG['_req_rows'] = rows.count()
        if rows.count():
            rows.first.click()
            pg.locator('.k-drawer').wait_for(timeout=15000)
            pg.wait_for_timeout(1200)
            shoot(pg, 'API3-approve-open', "'API 키 신청' 처리한 신청 한 줄을 열어 본 모습(승인 · 거절은 누르지 않음)")
    scene('API3-requests', req)
    c.close()
    ERRS['admin'] = errs


# ───────── 남원 기관 관리자 ─────────
def namwon(b):
    c, pg, errs = login_org(b, 'namwon')
    base = pg.url.split('/landxi/')[0]

    def org():
        go(pg, f'{base}/landxi/v3/gov-select/?view=org', 'form.bf', 2500)
        LOG['_apikey_section'] = pg.locator('section.gk').count()
        shoot(pg, 'GPT4-5-org-info', "남원시 기관 정보 — '받은 API 키' 칸 없음")
    scene('GPT4-5', org)

    def today():
        go(pg, f'{base}/landxi/v3/gov-select/', '.gs-tile', 2500)
        LOG['_tile_ic'] = pg.locator('.gs-tile-ic').count()
        shoot(pg, 'icons-gov-today', "남원시 첫 화면 — '오늘' 띠(글자만)")
    scene('icons-gov', today)
    c.close()
    ERRS['namwon'] = errs


# ───────── 시안 ─────────
def mocks(b):
    for d_name in ('ximap-board-2', 'train-flow', 'gov-report-main'):
        if not want('mock-' + d_name):
            continue
        d = os.path.join(PROC, 'design-r20', d_name)
        r = subprocess.run([sys.executable, os.path.join(d, 'shoot-mock.py')], cwd=d, capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONIOENCODING': 'utf-8', 'LX_PW': PW})
        print((r.stdout or '')[-600:], (r.stderr or '')[-300:])
        lg = json.load(open(os.path.join(d, 'log-mock.json'), encoding='utf-8'))
        for e in lg:
            base = re.sub(r'-1440-\d{4}\.png$', '', e['file'])
            t = e['shot_at']
            fn = f"mock-{d_name}-{base}-{t[11:13]}{t[14:16]}.png"
            shutil.copyfile(os.path.join(d, 'shots', e['file']), os.path.join(OUT, fn))
            LOG[fn] = {'at': t, 'url': e['url'], 'note': '시안 — ' + base, 'errors': e.get('errors')}
            print('시안', fn, flush=True)
    if want('mock-staff-dash'):
        c, pg, errs = newctx(b)
        for v in ('a', 'b'):
            pg.goto(f'{APP}/landxi/proto/review/mock/staff-dash-content/index.html?v={v}', wait_until='load')
            pg.wait_for_timeout(1500)
            shoot(pg, f'wire-{v}', '시안 — LX 직원 대시보드 와이어' + (' ⓐ 할 일 중심' if v == 'a' else ' ⓑ 성과 중심'), mock=True)
        c.close()
    json.dump(LOG, open(LOGP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    t0 = datetime.datetime.now()
    GROUPS = {'public': (public, ['API3-guide']),
              'staff': (staff, ['GPT4-3', 'GPT4-1', 'GPT4-4', 'layer', 'global-kgz', 'qa2', 'edges', 'icons', 'q-count']),
              'admin': (admin, ['icons-deploy', 'adopt', 'API3-keys', 'API3-requests']), 'namwon': (namwon, ['GPT4-5', 'icons-gov']),
              'mocks': (mocks, ['mock-'])}
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
