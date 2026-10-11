"""now 페이지 한 바퀴 4단계(바퀴 5 · 10-11 네 번째 굽기) — 페이지의 모든 그림을 지금 한 번에 다시 찍는다(원칙 162 · CLAUDE.md §1-1-1).
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

    def home(name, nav, wait, label):
        def f():
            go(pg, f'{APP}/landxi/v3/main/', None, 3500)
            pg.locator('.m-nav a', has_text=nav).click()
            pg.wait_for_function(wait, timeout=40000)
            pg.wait_for_timeout(4500)
            shoot(pg, name, label)
        return f
    scene('main-q2', home('main-q2', '활용 사례', "() => /\d+곳/.test(document.querySelector('#ch5-h')?.innerText || '')", "메인 '활용 사례' — 시군구 곳 수 · 서비스 이름 · 운영 기관 · 지도 점"))
    scene('main-q3', home('main-q3', '서비스', "() => /GeoAI/.test(document.querySelector('#ch4')?.innerText || '')", "메인 '서비스' — 업무마다 다른 서비스"))
    c.close()
    ERRS['public'] = errs


# ───────── LX 직원 ─────────
def staff(b):
    c, pg, errs = login_lx(b, APP, 'test@lx.or.kr')

    def dash():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.ld-jobs .ld-kinds', 2500)
        shoot(pg, 'dashboard', 'LX 직원 대시보드(지금 화면)')
    scene('dashboard', dash)

    def ximap():
        t0 = datetime.datetime.now()
        pg.goto(APP + '/landxi/v3/xi-clean/', wait_until='commit')
        pg.wait_for_function("() => { const x = window.__xc; return x?.boot?.shown && x.map?.getLayer('xb-sgg-f') && x.map.queryRenderedFeatures({ layers: ['xb-sgg-f'] }).length > 0; }", timeout=60000, polling=50)
        LOG['_first_view_s'] = round((datetime.datetime.now() - t0).total_seconds(), 2)
        pg.wait_for_timeout(2500)
        LOG['_hud'] = pg.evaluate("() => window.__xc.hud")
        LOG['_tools'] = pg.evaluate("() => [...document.querySelectorAll('.xc-tool')].map((x) => x.textContent.trim())")
        shoot(pg, 'ximap-open', 'XI맵 — 열자마자 전국 결과 · 왼쪽은 직원 메뉴 · 도구는 오른쪽')
    scene('ximap-open', ximap)

    def obj():
        OBJ = [127.50489, 35.39510]
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => { const x = window.__xc; return x?.boot?.shown && x.map?.getLayer('xb-sgg-f'); }", timeout=60000)
        pg.wait_for_timeout(2000)
        pg.evaluate("(c) => window.__xc.map.easeTo({ center: c, zoom: 18.2, duration: 0 })", OBJ)
        pg.wait_for_timeout(6000)
        cv = pg.locator('canvas.maplibregl-canvas').first.bounding_box()
        at = pg.evaluate("(c) => window.__xc.map.project(c)", OBJ)
        pg.mouse.click(cv['x'] + at['x'], cv['y'] + at['y'])
        pg.locator('.xe-card .xe-act').wait_for(timeout=20000)
        pg.wait_for_timeout(1200)
        shoot(pg, 'ximap-object-card', 'XI맵 — 남원 비닐하우스 객체를 눌러 그 자리 칸(지우기 · 분류 바꾸기 · 모양 고치기 · 새로 그리기 · 메모)')
        pg.locator('.xe-act button', has_text='모양 고치기').click()
        pg.wait_for_timeout(1500)
        v = pg.evaluate("() => { const m = window.__xc.map; const f = m.queryRenderedFeatures({ layers: ['xe-vtx'] })[0]; return f ? m.project(f.geometry.coordinates) : null; }")
        if v:
            pg.mouse.move(cv['x'] + v['x'], cv['y'] + v['y'])
            pg.mouse.down()
            pg.mouse.move(cv['x'] + v['x'] + 28, cv['y'] + v['y'] + 18, steps=6)
            pg.mouse.up()
        pg.wait_for_timeout(800)
        shoot(pg, 'ximap-reshape', "XI맵 — 모양 고치기: 꼭짓점을 끌어 본 모습(저장하지 않고 '그만')")
        pg.locator('.xe-bar button', has_text='그만').click()
        pg.wait_for_timeout(800)
        pg.locator('.xe-act button', has_text='분류 바꾸기').click()
        pg.wait_for_timeout(1200)
        shoot(pg, 'ximap-reclass-chips', "XI맵 — 분류 바꾸기: 고를 분류가 열린 모습(고르지 않음 · 저장 없음)")
        pg.keyboard.press('Escape')
    scene('ximap-object', obj)

    def kg():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg, 2500)
        pg.locator('.xn-b', has_text='키르기스스탄').click()
        pg.wait_for_function("() => !!window.__xc?.map?.getLayer('xn-kg-f')", timeout=40000)
        pg.wait_for_timeout(4500)
        shoot(pg, 'ximap-kg', 'XI맵 — 나라를 키르기스스탄으로 · 검색 칸이 비어 있음')
        KG = [74.45, 42.88]
        pg.evaluate("(c) => window.__xc.map.jumpTo({ center: c, zoom: 12.6 })", KG)
        pg.wait_for_timeout(4000)
        cv = pg.locator('canvas.maplibregl-canvas').first.bounding_box()
        b = pg.evaluate("""() => { const m = window.__xc.map; const fs = m.queryRenderedFeatures({ layers: ['xn-blk-f'] }); const f = fs.sort((a, c) => c.properties.area_ha - a.properties.area_ha)[0]; if (!f) return null;
          const g = f.geometry.coordinates[0]; let x = 0, y = 0; for (const q of g) { x += q[0]; y += q[1]; } return { n: fs.length, pt: m.project([x / g.length, y / g.length]) }; }""")
        if not b:
            raise Exception('구획을 못 찾음')
        pg.mouse.click(cv['x'] + b['pt']['x'], cv['y'] + b['pt']['y'])
        pg.wait_for_timeout(1800)
        LOG['_kg_blocks'] = b['n']
        shoot(pg, 'ximap-kg-blocks', 'XI맵 — 키르기스스탄 구획 · 구획을 눌러 경작지 판정 비율')
    scene('ximap-kg', kg)

    def mapsvc():
        go(pg, f'{APP}/landxi/v3/lx-map/', '.lm-h1', 5000)
        shoot(pg, 'mapsvc-layers', "지도 서비스 — 왼쪽 '층' 목록")
    scene('mapsvc', mapsvc)

    def helps():
        go(pg, f'{APP}/landxi/v3/help-my/', None, 2500)
        helpbtn(pg, '^자주 묻는')
        shoot(pg, 'help-faq', '지원 — 자주 묻는 질문(화살표)')
        helpbtn(pg, '^문의')
        shoot(pg, 'help-contact', '지원 — 문의 전화 · 메일')
        go(pg, f'{APP}/landxi/v3/global/', '.gl-crumb--globe', 3000)
        shoot(pg, 'globe', "지구본 단추")
    scene('helps', helps)

    def projects():
        go(pg, f'{APP}/landxi/v3/lx-project/', '.k-main', 3500)
        shoot(pg, 'project-list', '프로젝트 목록 — 진행 칸 · 6/6 아래 건너뜀 · 공개 뒤 남은 일')
        go(pg, f'{APP}/landxi/v3/lx-project/?project={PRJ}', '.k-main', 3500)
        shoot(pg, 'project-review', "프로젝트 한 장 — '결과 확인' 단계: 지도에서 결과 보기 + 확인했음(누르지 않음)")
        go(pg, f'{APP}/landxi/v3/lx-release/?project={PRJ}&stage=publish', '.k-main', 3500)
        pg.evaluate("() => { const e = [...document.querySelectorAll('*')].filter((x) => x.children.length === 0 && /지도에서 (봤음|보지|결과)|결과 확인/.test(x.textContent))[0]; e?.scrollIntoView({ block: 'center' }); }")
        pg.wait_for_timeout(1200)
        shoot(pg, 'release-form', '배포 신청서 — 결과 확인: 지도에서 봤음 · 아직 보지 않음')
        go(pg, f'{APP}/landxi/v3/lx-project/?project={PRJ}', '.k-main', 2500)
        pg.get_by_text('결과 확인 열기').first.click()
        pg.wait_for_function("() => document.documentElement.dataset.mapReady === '1'", timeout=60000)
        pg.wait_for_timeout(5000)
        shoot(pg, 'map-review', "지도 서비스 — '결과 확인 열기'로 왔을 때 위쪽 한 줄(누르지 않음)")
    scene('projects', projects)
    c.close()
    ERRS['staff'] = errs


# ───────── LX 관리자 ─────────
def admin(b):
    c, pg, errs = login_lx(b, ADMIN, 'lxadmin@lx.or.kr')

    def deploy():
        go(pg, f'{ADMIN}/landxi/v3/lx-deploy/', '.dp-plant', 2500)
        shoot(pg, 'admin-deploy-share', "배포 — '기관에 공유' 단추")
        pg.locator('.dp-tab', has_text='서비스 관리').click()
        pg.wait_for_timeout(3000)
        shoot(pg, 'admin-deploy-review', "배포 → 서비스 관리 — 결과 확인: 지도에서 봤음 · 아직 보지 않음")
    scene('admin-deploy', deploy)

    def improve():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/improve', '.im-t, .im-box, .im-chip', 3500)
        shoot(pg, 'adopt-candidates', "개선 후보 — 줄마다 시스템 제안 한 줄 · '이대로 반영 · 개발 요청 · 보류'(누르지 않음)")
    scene('adopt', improve)

    def oldreq():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/?view=deploys#/deploys/services', None, 4500)
        shoot(pg, 'admin-old-request', '배포 신청 — 옛 기록: 모델 기록이 남아 있지 않습니다')
    scene('admin-oldreq', oldreq)

    def amap():
        go(pg, f'{ADMIN}/landxi/v3/ops-core/', None, 7000)
        shoot(pg, 'admin-map', 'LX 관리자 대시보드 — 기관 이름표 하나씩 · 겹치면 비켜 놓음')
    scene('admin-map', amap)

    def orgs():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/?view=tenants', None, 3500)
        shoot(pg, 'admin-orgs', "기관 — 기관 이름 밑줄 · '기관 보기'")
        pg.locator('button.go', has_text='기관 보기').nth(1).click()
        pg.wait_for_timeout(3500)
        shoot(pg, 'admin-org-page', '기관 한 곳 — 개요 · 서비스와 담당 · 영상과 배경 · 사용과 계정')
    scene('admin-orgs', orgs)
    c.close()
    ERRS['admin'] = errs


# ───────── 남원 기관 관리자 ─────────
def namwon(b):
    c, pg, errs = login_org(b, 'namwon')
    base = pg.url.split('/landxi/')[0]

    def today():
        go(pg, f'{base}/landxi/v3/gov-select/', '.gs-tile', 2500)
        shoot(pg, 'gov-today', "남원시 첫 화면 — '오늘' 띠")
    scene('gov-today', today)

    def gx():
        go(pg, f'{base}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg, 4000)
        shoot(pg, 'gov-ximap-tools', '남원시 XI맵 — 도구(층 · 가르기 · 보고서)')
    scene('gov-ximap', gx)

    def rep():
        go(pg, f'{base}/landxi/v3/gov-report/?service=card-farm&tab=report', 'text=AI 분석 결과 보고서', 4500)
        shoot(pg, 'gov-report', "기관 보고서 — AI 분석 결과 보고서(남원시 전체)")
        pg.evaluate("() => { const e = [...document.querySelectorAll('h2,h3,h4')].find((x) => x.textContent.includes('우리 대장과 다른 필지')); e?.scrollIntoView({ block: 'start' }); }")
        pg.wait_for_timeout(1500)
        shoot(pg, 'gov-report-ledger', "기관 보고서 — '우리 대장과 다른 필지' 칸")
        go(pg, f'{base}/landxi/v3/gov-report/?service=card-farm&tab=report', 'text=AI 분석 결과 보고서', 3000)
        pg.locator('#rp-emd2').select_option(label='운봉읍')
        pg.get_by_role('button', name='보고서 만들기').click()
        pg.wait_for_timeout(4000)
        shoot(pg, 'gov-report-unbong', '기관 보고서 — 운봉읍: 경작지 + 비경작지 면적 합 = 합계')
    scene('gov-report', rep)

    def fus():
        go(pg, f'{base}/landxi/v3/gov-fusion/?service=card-farm', '.k-main', 5000)
        shoot(pg, 'gov-fusion', "기관 '행정정보와 비교' — 올린 대장 × 서비스 결과")
    scene('gov-fusion', fus)
    c.close()
    ERRS['namwon'] = errs


# ───────── 시안 ─────────
def mocks(b):
    M = f'{APP}/landxi/proto/review/mock'
    c, pg, errs = newctx(b)

    def sd4(q, name, note, hover=False):
        pg.goto(f'{M}/staff-dash-4/index.html{q}', wait_until='load')
        pg.wait_for_selector('#sd4-grid .sd4-cell', timeout=60000)
        pg.wait_for_timeout(3500)
        if hover:
            pg.locator('#sd4-grid .sd4-cell').nth(2).hover()
            pg.wait_for_timeout(1800)
        shoot(pg, name, note, mock=True)
    if want('mock-dash4'):
        sd4('', 'dash4', '시안 — LX 직원 대시보드 4차(① 할 일 → ② 결과 격자 → ③ 진행)')
        sd4('', 'dash4-grid-a-hover', '시안 — ⓐ 4열 격자 · 셋째 칸에 올려 도형이 드러남', hover=True)
        sd4('?grid=2', 'dash4-grid-b-2x2', '시안 — ⓑ 2×2(최근 4 · 더 크게)')
        sd4('?fill=1', 'dash4-grid-fill-fake', "시안 · 흉내 — 16칸을 다 채운 모습(같은 결과를 반복한 것 · 실제 아님)")
    if want('mock-flow'):
        for v, n, note in (('start', 'flow-start', '시안 — 학습 작업 흐름 처음: 기본 흐름이 놓여 있음'), ('live', 'flow-live', '시안 — 학습 중: 반복마다 그래프가 차오름'), ('compare', 'flow-compare', '시안 — 실험 둘을 나란히 비교')):
            pg.goto(f'{M}/train-flow-2/index.html?v={v}', wait_until='domcontentloaded')
            pg.wait_for_selector('.node', timeout=60000)
            pg.wait_for_timeout(3800)
            shoot(pg, n, note, mock=True)
    c.close()
    ERRS['mocks'] = errs


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    t0 = datetime.datetime.now()
    GROUPS = {'public': (public, ['main-q2', 'main-q3']),
              'staff': (staff, ['dashboard', 'ximap-open', 'ximap-object', 'ximap-kg', 'mapsvc', 'helps', 'projects']),
              'admin': (admin, ['admin-deploy', 'adopt', 'admin-oldreq', 'admin-map', 'admin-orgs']),
              'namwon': (namwon, ['gov-today', 'gov-ximap', 'gov-report', 'gov-fusion']),
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
