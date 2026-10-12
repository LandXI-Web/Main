"""바퀴 8 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r8.py <출력폴더> [묶음...]   묶음 = staff · admin · mocks · 묶음:장면,장면 (실패한 장면만 다시)
장면마다 시간 제한(150초) — 넘으면 멈춘 장면을 stuck.json 에 적고 종료 → 같은 명령을 다시 돌리면 끝낸 장면은 건너뛴다."""
import datetime, json, os, re, sys, threading, time
from playwright.sync_api import sync_playwright
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
PW = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
APP, ADMIN = 'https://app.land-xi.dev', 'https://admin.land-xi.dev'
LOGF = os.path.join(OUT, 'log.json')
LOG = json.load(open(LOGF, encoding='utf-8')) if os.path.exists(LOGF) else {}
LOG.setdefault('_done', []); LOG.setdefault('_logins', 0); LOG.setdefault('_failed', [])
LIMIT = 150
SEL = {}
for a in sys.argv[2:]:
    k, _, v = a.partition(':'); SEL[k] = [x for x in v.split(',') if x]


def save():
    json.dump(LOG, open(LOGF, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def shoot(pg, name, note, full=False):
    t = datetime.datetime.now(); fn = f'{name}-{t:%H%M}.png'
    for old in [f for f in os.listdir(OUT) if re.fullmatch(re.escape(name) + r'-\d{4}\.png', f)]:
        os.remove(os.path.join(OUT, old))
    pg.screenshot(path=os.path.join(OUT, fn), full_page=full)
    LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': note}; save()
    print('찍음', fn, flush=True)


def scene(group, n, f):
    if SEL.get(group) and n not in SEL[group]:
        return
    if n in LOG['_done'] and not SEL.get(group):
        return

    def stuck():
        json.dump({'stuck': n, 'at': datetime.datetime.now().isoformat(timespec='seconds')}, open(os.path.join(OUT, 'stuck.json'), 'w'))
        print('시간 초과 — 멈춤', n, flush=True); os._exit(3)
    tm = threading.Timer(LIMIT, stuck); tm.start()
    try:
        f(); LOG['_done'].append(n)
        if n in LOG['_failed']: LOG['_failed'].remove(n)
    except Exception as e:
        if n not in LOG['_failed']: LOG['_failed'].append(n)
        print('실패', n, str(e)[:300].replace('\n', ' '), flush=True)
    finally:
        tm.cancel(); save()


def newctx(b, vp=(1440, 900)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, locale='ko-KR')
    c.add_init_script("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}")
    pg = c.new_page(); pg.set_default_timeout(45000); pg.set_default_navigation_timeout(60000)
    return c, pg


def login(b, base, who):
    c, pg = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded'); pg.wait_for_selector('#id')
    pg.fill('#id', who); pg.fill('#pw', PW); pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=45000); pg.wait_for_timeout(2000)
    LOG['_logins'] += 1; save()
    return c, pg


def go(pg, url, sel=None, wait=1500):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=45000)
    pg.wait_for_timeout(wait)


def xi_ready(pg):
    pg.wait_for_function("() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown", timeout=60000, polling=50)


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')

    def projects():
        go(pg, f'{APP}/landxi/v3/lx-console/', '.k-rail a.k-rail-i[data-id="projects"]', 800)
        pg.locator('.k-rail a.k-rail-i[data-id="projects"]').click()
        pg.wait_for_function("() => document.documentElement.dataset.projects === '1'", timeout=45000); pg.wait_for_timeout(2500)
        shoot(pg, 'now-projects', '프로젝트 목록(카드)')
        pg.get_by_role('button', name='새 프로젝트').first.click()
        box = pg.locator('.lxp-new'); box.wait_for(); pg.wait_for_timeout(700)
        box.locator('input[name=name]').fill('비닐하우스 2027')
        pg.wait_for_timeout(300)
        shoot(pg, 'now-new-project', '새 프로젝트 한 창(만들지 않고 열어 둔 모습)')
        pg.keyboard.press('Escape')
    scene('staff', 'projects', projects)

    def xinat():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg); pg.wait_for_timeout(3500)
        LOG['_hud'] = pg.evaluate("() => document.querySelector('.xna-card')?.innerText || null"); save()
        shoot(pg, 'now-ximap-national', 'XI맵 전국(경작지 면 · 분석 예정)')
        pt = pg.evaluate("""() => { const m = window.__xc.map, r = m.getCanvas().getBoundingClientRect();
          for (let y = r.height * 0.3; y < r.height * 0.9; y += 17) for (let x = r.width * 0.3; x < r.width * 0.8; x += 17) if (m.queryRenderedFeatures([x, y], { layers: ['xn-hit'] }).length) { const u = m.unproject([x, y]); return [x + r.x, y + r.y, u.lng, u.lat]; }
          return null; }""")
        LOG['_hit'] = pt; save()
        if pt:
            pg.mouse.move(pt[0] - 6, pt[1]); pg.mouse.move(pt[0], pt[1]); pg.wait_for_timeout(800)
            shoot(pg, 'now-ximap-hover', '올리면 요약')
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 })"); pg.wait_for_timeout(1500)
        pg.locator('.xna-chip', has_text='하천').click(); pg.wait_for_timeout(3000)
        LOG['_hud_river'] = pg.evaluate("() => document.querySelector('.xna-card')?.innerText || null"); save()
        shoot(pg, 'now-ximap-river', '하천 · 계곡(멈춤)')
    scene('staff', 'xinat', xinat)

    def xiclose():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        xi_ready(pg); pg.wait_for_timeout(3000)
        pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.13, 35.80], zoom: 11.2 })"); pg.wait_for_timeout(7000)
        shoot(pg, 'now-ximap-closeup', '끝난 읍면동 확대(전주시 완산구 둘레)')
    scene('staff', 'xiclose', xiclose)

    def dh():
        go(pg, f'{APP}/landxi/v3/lx-console/', None, 500)
        pg.locator('.k-rail a.k-rail-i', has_text='데이터하우스').click()
        pg.wait_for_selector('.dh-tbl tbody tr', timeout=45000); pg.wait_for_timeout(800)
        shoot(pg, 'now-datahouse', '데이터하우스 · 학습 데이터 · 클래스별')
    scene('staff', 'dh', dh)

    def cls():
        go(pg, f'{APP}/landxi/v3/xi-clean/', None, 500)
        pg.wait_for_function("() => window.__xc?.boot?.shown && window.__xc.board?.hot", timeout=60000)
        hot = pg.evaluate("() => window.__xc.board.hot")
        pg.evaluate("(c) => window.__xc.map.jumpTo({ center: c, zoom: 14.6 })", hot)
        FILL = """() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id);
          if (m.isMoving() || !ls.length) return null; const r = m.getCanvas().getBoundingClientRect();
          for (const f of m.queryRenderedFeatures({ layers: ls }).filter((f) => f.geometry.type.endsWith('Polygon'))) {
            const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
            const c = ring.reduce((a, q) => [a[0] + q[0] / ring.length, a[1] + q[1] / ring.length], [0, 0]); const q = m.project(c);
            if (q.x > 420 && q.x < r.width - 520 && q.y > 200 && q.y < r.height - 160 && m.queryRenderedFeatures([q.x, q.y], { layers: ls }).length) return [q.x + r.x, q.y + r.y]; }
          return null; }"""
        pt = None
        for _ in range(80):
            pg.wait_for_timeout(500); pt = pg.evaluate(FILL)
            if pt: break
        assert pt, '객체 자리를 못 찾음'
        pg.mouse.click(pt[0], pt[1])
        pg.wait_for_selector('.xe-card:not([hidden]) .xe-act', timeout=20000); pg.wait_for_timeout(500)
        pg.locator('.xe-card .xe-act button', has_text='분류 바꾸기').click()
        pg.wait_for_selector('.xe-card .xe-pk', timeout=15000); pg.wait_for_timeout(400)
        shoot(pg, 'now-class-pick', 'XI맵 분류 바꾸기 — 클래스 목록')
        pg.locator('.xe-card button', has_text='새 클래스 더하기').click()
        pg.locator('.xe-card input[aria-label="새 클래스 이름"]').fill('연동 비닐하우스'); pg.wait_for_timeout(300)
        shoot(pg, 'now-class-add', '새 클래스 더하기')
        pg.locator('.xe-card .xe-act button', has_text='더하기').click()
        pg.wait_for_selector('.xe-card .xe-pk-say p', timeout=15000); pg.wait_for_timeout(300)
        shoot(pg, 'now-class-similar', '비슷한 클래스 먼저')
    scene('staff', 'cls', cls)

    def train():
        pid = pg.evaluate("async () => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const j = await fetch('/api/v1/projects?scope=all', { headers: s ? { authorization: 'Bearer ' + s.token } : {} }).then(r => r.json()).catch(() => null); return (j?.items || j?.projects || []).find(x => /비닐하우스/.test(x.name))?.id || null; }")
        assert pid, '프로젝트 못 찾음'
        pg.goto(f'{APP}/landxi/v3/lx-train/?project={pid}&stage=train', wait_until='commit')
        pg.wait_for_function("() => document.documentElement.dataset.trainBoard === '1'", timeout=45000); pg.wait_for_timeout(1500)
        shoot(pg, 'now-train-flow', '학습 화면 — 기본 흐름')
        pg.locator('.tb-node[data-kind="data"]').first.click(); pg.wait_for_timeout(500)
        shoot(pg, 'now-train-data', "학습 데이터 블록 서랍 — 'XI맵에서 고친 것'")
        pg.keyboard.press('Escape')
        pg.locator('.tb-node[data-kind="eval"]').first.click(); pg.keyboard.press('Delete')
        pg.locator('.tb-add .tb-chip', has_text='추론 시험').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        shoot(pg, 'now-train-changed', '블록을 바꾼 모습(평가 대신 추론 시험)')
        pg.locator('.tb-reset').click(); pg.wait_for_timeout(300)
    scene('staff', 'train', train)
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')

    def adash():
        go(pg, f'{ADMIN}/landxi/v3/ops-core/', None, 500)
        pg.wait_for_function("() => /전국 농지/.test(document.querySelector('.oc-todo')?.textContent || '')", timeout=45000); pg.wait_for_timeout(2500)
        shoot(pg, 'now-admin-dashboard', 'LX 관리자 대시보드')
        LOG['_todo'] = pg.evaluate("() => [...document.querySelectorAll('.oc-todo li')].map(x => x.innerText.trim())"); save()
        t = datetime.datetime.now(); fn = f'now-admin-todo-{t:%H%M}.png'
        for old in [f for f in os.listdir(OUT) if re.fullmatch(r'now-admin-todo-\d{4}\.png', f)]: os.remove(os.path.join(OUT, old))
        pg.locator('.oc-todo').first.screenshot(path=os.path.join(OUT, fn))
        LOG[fn] = {'at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': '관리자 대시보드 할 일 줄(전력 예산 문구)'}; save()
        fn2 = f'now-admin-line-{t:%H%M}.png'
        for old in [f for f in os.listdir(OUT) if re.fullmatch(r'now-admin-line-\d{4}\.png', f)]: os.remove(os.path.join(OUT, old))
        pg.locator('.oc-todo li', has_text='전국 농지').first.screenshot(path=os.path.join(OUT, fn2))
        LOG[fn2] = {'at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': '관리자 대시보드 전국 농지 진행 한 줄'}; save()
        prog = pg.evaluate("async () => { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); const r = await fetch('/api/v1/national/progress', { headers: s ? { authorization: 'Bearer ' + s.token } : {} }); return { status: r.status, body: await r.json().catch(() => null) }; }")
        LOG['_progress_at'] = datetime.datetime.now().isoformat(timespec='seconds')
        json.dump(prog, open(os.path.join(OUT, 'progress.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1); save()
    scene('admin', 'adash', adash)

    def retrain():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/retrain', '.rt-col .rt-tbl tbody tr', 800)
        full = pg.evaluate("() => document.querySelector('.rt-col').scrollHeight + 200")
        pg.set_viewport_size({'width': 1440, 'height': max(900, int(full))}); pg.wait_for_timeout(500)
        shoot(pg, 'now-admin-retrain', 'LX 관리자 — 배포 → XI 재학습')
        pg.set_viewport_size({'width': 1440, 'height': 900})
    scene('admin', 'retrain', retrain)

    def dhw():
        go(pg, f'{ADMIN}/landxi/v3/lx-ingest/?tab=train', '.dh-seg', 800)
        pg.locator('.dh-seg button', has_text='승인 대기').click(); pg.wait_for_timeout(1200)
        shoot(pg, 'now-admin-datahouse', 'LX 관리자 — 데이터하우스 승인 대기')
    scene('admin', 'dhw', dhw)

    def tmpl():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/deploys/templates', '.rt-blks', 800)
        shoot(pg, 'now-admin-template', 'LX 관리자 — 학습 서식')
    scene('admin', 'tmpl', tmpl)
    c.close()


def mocks(b):
    M = f'{APP}/landxi/proto/review/mock/staff-dash-7/index.html'
    jobs = (('dA', '?plan=A', 'mock-dash7-A', 900, None, '시안 7차 A안 첫 화면'),
            ('dAfull', '?plan=A', 'mock-dash7-A-full', 'FULL', None, '시안 7차 A안 세로 전체'),
            ('dB', '?plan=B', 'mock-dash7-B', 900, None, '시안 7차 B안 첫 화면'),
            ('dBs6', '?plan=B&stages=6', 'mock-dash7-B-stages6', 900, None, '시안 B안 진행 현황 여섯 칸'),
            ('dAhover', '?plan=A', 'mock-dash7-A-hover', 900, 'hover:.sd4-cell:nth-child(5)', 'A안 격자 다섯째 칸에 올린 모습'))
    for key, qs, name, h, act, note in jobs:
        def f(qs=qs, name=name, h=h, act=act, note=note):
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            pg.set_default_timeout(45000)
            pg.goto(M + qs, wait_until='load', timeout=60000); pg.wait_for_timeout(3800)
            if act:
                k, sel = act.split(':', 1)
                if k == 'hover': pg.hover(sel); pg.wait_for_timeout(1000)
            if h == 'FULL':
                total = pg.evaluate('document.querySelector(".ld-in").scrollHeight + 64 + 24 + 40')
                pg.set_viewport_size({'width': 1440, 'height': int(total)}); pg.wait_for_timeout(1500)
            shoot(pg, name, note)
            ctx.close()
        scene('mocks', key, f)


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'admin', 'mocks']
    for nm, fn in (('staff', staff), ('admin', admin), ('mocks', mocks)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 — 실패', LOG['_failed'], '로그인', LOG['_logins'])
