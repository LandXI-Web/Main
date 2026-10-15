"""바퀴 14 now 그림 — 바깥 주소 로그인 폼(LX 직원 1 · LX 관리자 1) + 시안 주소. 비밀번호는 server/.env.
사용: python shoot-r14.py <출력폴더> [묶음...]   묶음 = staff · admin · ov · gov · pub · mock · 묶음:장면,장면 (실패한 장면만 다시)
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
LIMIT = 600
SEL = {}
for a in sys.argv[2:]:
    k, _, v = a.partition(':'); SEL[k] = [x for x in v.split(',') if x]


def save():
    json.dump(LOG, open(LOGF, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def shoot(pg, name, note, full=False):
    t = datetime.datetime.now(); fn = f'{name}-{t:%H%M}.png'
    for old in [f for f in os.listdir(OUT) if re.fullmatch(re.escape(name) + r'-\d{4}\.png', f)]:
        os.remove(os.path.join(OUT, old))
    try:
        pg.screenshot(path=os.path.join(OUT, fn), full_page=full, timeout=40000)
    except Exception:
        import base64
        c = pg.context.new_cdp_session(pg)
        r = c.send('Page.captureScreenshot', {'format': 'png'})
        open(os.path.join(OUT, fn), 'wb').write(base64.b64decode(r['data']))
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
    pg = c.new_page(); pg.set_default_timeout(45000); pg.set_default_navigation_timeout(60000)
    return c, pg


def login(b, base, who):
    c, pg = newctx(b)
    pg.goto(base + '/landxi/v3/login/', wait_until='domcontentloaded', timeout=120000); pg.wait_for_selector('#id')
    pg.fill('#id', who); pg.fill('#pw', PW); pg.click('#go')
    try: pg.wait_for_function("() => !!localStorage.getItem('lx_api_session')", timeout=60000, polling=300)
    except Exception: pg.wait_for_url(lambda u: '/login/' not in u, timeout=45000)
    try: pg.wait_for_load_state('networkidle', timeout=20000)
    except Exception: pass
    pg.wait_for_timeout(4000)
    LOG['_logins'] += 1; save()
    return c, pg


def go(pg, url, sel=None, wait=1500, to=45000):
    pg.goto(url, wait_until='domcontentloaded')
    if sel:
        pg.wait_for_selector(sel, timeout=to)
    pg.wait_for_timeout(wait)


def calm(pg, n=100):
    try: pg.wait_for_function("() => !/서버 응답이 늦습니다|불러오는 중/.test(document.body.innerText)", timeout=n * 1000, polling=500)
    except Exception: LOG.setdefault('_slow', []).append(pg.url); save()


def xi_ready(pg):
    pg.wait_for_function("() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown", timeout=170000, polling=100)




XI_READY = "() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-big') && document.querySelector('.k-chat-root[data-dock]')"
V = '/landxi/v3/'


def settle(pg):
    try: pg.wait_for_function("() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded()", timeout=25000)
    except Exception: pass


def say(pg, q):
    inp = pg.locator('.k-chat-root[data-dock] .k-ck-i')
    inp.click(); inp.fill(''); inp.press_sequentially(q, delay=35); inp.press('Enter')
    try: pg.wait_for_function("() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy'", timeout=60000)
    except Exception: pass


def ximap(pg, qs=''):
    go(pg, f'{APP}{V}xi-clean/{qs}', None, 500)
    pg.wait_for_function(XI_READY, timeout=170000, polling=100)
    settle(pg); pg.wait_for_timeout(1500)


QS = [('d1', '남원시 현황 보여 줘'), ('d2', '남원시 비닐하우스 어디가 많아?'), ('d3', '남원시 농지 이용 실태 어때?'), ('d4', '전국 분석 얼마나 진행됐어?'), ('d5', '남원시 함양군 비교해 줘'), ('d6', '남원시 지목별 공시지가 통계'), ('d7', '함양군 현황 보여 줘')]
NAT = [127.247506, 35.562193]; SVC = [127.5345, 35.4335]


def fw(pg, js, n=60000):
    try:
        pg.wait_for_function(js, timeout=n, polling=100); return True
    except Exception:
        return False


def staff(b):
    c, pg = login(b, APP, 'test@lx.or.kr')
    LOG.setdefault('_errs', [])
    pg.on('pageerror', lambda e: LOG['_errs'].append(str(e)[:200]))

    def dash():
        go(pg, f'{APP}{V}lx-console/', None, 500)
        pg.wait_for_function("() => document.documentElement.dataset.consoleReady === '1'", timeout=90000); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-staff-dash', 'LX 직원 대시보드 1440')
        pg.set_viewport_size({'width': 2560, 'height': 1440}); pg.wait_for_timeout(3500); calm(pg)
        shoot(pg, 'now-staff-dash-2560', 'LX 직원 대시보드 2560')
        pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(1500)
    scene('staff', 'dash', dash)

    def first():
        ximap(pg, '?test=1')
        pg.evaluate("() => { try { localStorage.setItem('xc_statv', 'map'); localStorage.setItem('xc_hudv', 'now'); } catch (e) {} }")
        LOG['_xi_first'] = pg.evaluate("() => ({hud: document.querySelector('.xb-hud')?.innerText, big: (() => { const e = document.querySelector('.xb-hud .xb-big'); return e ? parseFloat(getComputedStyle(e).fontSize) : null; })(), chips: [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip')].map(b => b.textContent), what: [...document.querySelectorAll('.k-what')].filter(a => a.offsetParent).map(a => a.textContent)})"); save()
        shoot(pg, 'now-xi-first', 'XI맵 첫 화면(전국 큰 숫자 · 채팅 창)')
        say(pg, '비닐하우스만 보여 줘')
        fw(pg, "() => window.__xc.task === '비닐하우스'", 20000)
        settle(pg); pg.wait_for_timeout(1200)
        LOG['_xi_filter'] = pg.evaluate("() => ({task: window.__xc.task, hud: document.querySelector('.xb-hud')?.innerText})"); save()
        shoot(pg, 'now-xi-filter', '비닐하우스만 보여 줘')
        say(pg, '원래대로')
        fw(pg, "() => !window.__xc.task", 20000); settle(pg)
    scene('staff', 'first', first)

    def onmap():
        ximap(pg)
        pg.locator('.xo-sw button[data-v="map"]').click(); pg.wait_for_timeout(400)
        LOG.setdefault('_on', {})
        for id_, q in QS:
            if id_ not in ('d1', 'd2', 'd3', 'd4', 'd5'):
                continue
            pg.evaluate("() => { window.__xc.dash = null; }")
            inp = pg.locator('.k-chat-root[data-dock] .k-ck-i'); inp.click(); inp.fill(''); inp.press_sequentially(q, delay=20); inp.press('Enter')
            if not fw(pg, "() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'running'", 60000):
                LOG['_on'][id_] = {'q': q, 'fail': True}; save(); continue
            fw(pg, "() => window.__xc.dash?.fill === 'done'", 20000)
            settle(pg); pg.wait_for_timeout(900)
            LOG['_on'][id_] = pg.evaluate("() => ({...window.__xc.dash, head: document.querySelector('.xo-head')?.innerText.replace(/\\s+/g, ' ').trim(), tags: document.querySelectorAll('.xo-tag').length, panel: [...document.querySelectorAll('.xo-ph span')].map(x => x.textContent)})")
            LOG['_on'][id_]['q'] = q; save()
            shoot(pg, f'now-on-{id_}-fill', '지도 위 통계 ' + q)
            if id_ == 'd1':
                pg.wait_for_timeout(1900); shoot(pg, 'now-on-d1-tour', '1위로 날아감')
                fw(pg, "() => window.__xc.dash?.tour && window.__xc.dash.tour !== null", 30000); settle(pg); pg.wait_for_timeout(600)
                idx = pg.evaluate("() => { const ks = new Set((window.__xc.map.getSource('xo-f')?._data?.features || []).map((f) => f.properties.k)); return [...document.querySelectorAll('.xo-p.open [data-k]')].findIndex((r, i) => i > 0 && ks.has(r.dataset.k)); }")
                row = pg.locator('.xo-p.open [data-k]').nth(max(1, idx))
                if row.count():
                    row.hover(); pg.wait_for_timeout(700); shoot(pg, 'now-on-d1-hover', '판 막대에 올림')
                    row.click(); settle(pg); pg.wait_for_timeout(900); shoot(pg, 'now-on-d1-pick', '판 막대를 누름')
            else:
                fw(pg, "() => window.__xc.dash?.tour && window.__xc.dash.tour !== null", 30000); settle(pg)
            try:
                pg.locator('.xo-x').click()
            except Exception:
                pass
            pg.wait_for_timeout(1500); settle(pg)
    scene('staff', 'onmap', onmap)

    def fusion():
        ximap(pg)
        pg.locator('.xo-sw button[data-v="dash"]').click(); pg.wait_for_timeout(500)
        LOG.setdefault('_dash', {})
        for id_, q in QS:
            if id_ not in ('d1', 'd2', 'd3', 'd5', 'd6'):
                continue
            pg.evaluate("() => { window.__xc.dash = null; }")
            say(pg, q)
            ok = fw(pg, "() => window.__xc.dash?.title && !document.querySelector('.xd').hidden", 60000)
            if not ok:
                LOG['_dash'][id_] = {'q': q, 'fail': True}; save(); continue
            settle(pg); pg.wait_for_timeout(1800)
            LOG['_dash'][id_] = pg.evaluate("() => ({title: window.__xc.dash.title, kpis: [...document.querySelectorAll('.xd-kpi')].map(k => k.innerText.replace(/\\s+/g, ' ').trim())})")
            LOG['_dash'][id_]['q'] = q; save()
            shoot(pg, f'now-fu-{id_}', '융합 대시보드 ' + q)
        try:
            pg.locator('.xd-back').click(); pg.wait_for_timeout(1200)
        except Exception:
            pass
        pg.locator('.xo-sw button[data-v="map"]').click(); pg.wait_for_timeout(500)
    scene('staff', 'fusion', fusion)

    def pickat(center, rx):
        pg.evaluate("(c) => window.__xc.map.jumpTo({ center: c, zoom: 16.2 })", center); settle(pg)
        try:
            pg.wait_for_function("(src) => window.__xc.map.getStyle().layers.some((l) => new RegExp(src).test(l.id) && l.type === 'fill')", arg=rx, timeout=30000)
        except Exception:
            pass
        settle(pg); pg.wait_for_timeout(2000)
        return pg.evaluate("""(src) => {
  const m = window.__xc.map, ls = m.getStyle().layers.filter((l) => new RegExp(src).test(l.id) && l.type === 'fill').map((l) => l.id);
  const fs = m.queryRenderedFeatures({ layers: ls });
  const c = m.getCanvas(), cx = c.clientWidth / 2, cy = c.clientHeight / 2, r = c.getBoundingClientRect();
  let best = null;
  for (const f of fs) {
    if (!/Polygon/.test(f.geometry.type)) continue;
    const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    const sx = g.reduce((a, q) => a + q[0], 0) / g.length, sy = g.reduce((a, q) => a + q[1], 0) / g.length;
    const s = m.project([sx, sy]);
    if (!m.queryRenderedFeatures(s, { layers: ls }).length) continue;
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (!best || d < best.d) best = { d, x: s.x + r.x, y: s.y + r.y };
  }
  return best; }""", rx)

    card_ready = "() => { const c = document.querySelector('.xe-card:not([hidden])'); return c && !/불러오는 중/.test(c.innerText); }"

    def edit():
        ximap(pg, '?test=1')
        pt = pickat(SVC, '^xb-r-'); pg.mouse.click(pt['x'], pt['y'])
        pg.wait_for_function(card_ready, timeout=30000); pg.wait_for_timeout(1000)
        LOG['_edit_svc'] = pg.evaluate("() => document.querySelector('.xe-card:not([hidden])')?.innerText"); save()
        shoot(pg, 'now-edit-svc', '서비스 결과 객체 그 자리 고치기 칸')
        ximap(pg, '?test=1')
        pt = pickat(NAT, '^xn-o-.*-f$'); pg.mouse.click(pt['x'], pt['y'])
        pg.wait_for_function(card_ready, timeout=30000); pg.wait_for_timeout(1000)
        LOG['_edit_nat'] = pg.evaluate("() => document.querySelector('.xe-card:not([hidden])')?.innerText"); save()
        shoot(pg, 'now-edit-nat', '전국 결과 객체 그 자리 고치기 칸')
        pg.locator('.xe-card .xe-act button', has_text=re.compile(r'^삭제$')).first.click(); pg.wait_for_timeout(500)
        shoot(pg, 'now-edit-ask', '삭제 확인')
        pg.locator('.xe-card .xe-ask button', has_text=re.compile(r'^삭제$')).first.click()
        fw(pg, "() => /삭제/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || '')", 20000); pg.wait_for_timeout(1400)
        shoot(pg, 'now-edit-deleted', '삭제됨(시험)')
        pg.locator('.xe-card .xe-undo').first.click()
        fw(pg, "() => !/삭제/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || '')", 20000); pg.wait_for_timeout(1200)
        LOG['_edit_undone'] = True; save()
    scene('staff', 'edit', edit)

    def variants():
        ximap(pg)
        for v in ('a', 'b'):
            pg.locator(f'.xv-sw button[data-v="{v}"]').click(); pg.wait_for_timeout(1000)
            LOG['_var_' + v] = pg.evaluate("() => document.querySelector('.xv-a:not([hidden]), .xv-b:not([hidden])')?.innerText || null"); save()
            shoot(pg, f'mock-xi-v{v}-national', f'결과 표시 시안 {v} 전국')
            dot = pg.locator('.xv-a .xv-dot' if v == 'a' else '.xv-b .xv-it').first
            if dot.count():
                dot.evaluate("e => e.click()"); pg.wait_for_timeout(1800); settle(pg)
                shoot(pg, f'mock-xi-v{v}-task', f'결과 표시 시안 {v} 업무 하나')
                pg.evaluate("() => document.querySelector('.xv-a [aria-pressed=true], .xv-b [aria-pressed=true]')?.click()"); pg.wait_for_timeout(800)
            pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.45, 35.42], zoom: 10 })"); settle(pg); pg.wait_for_timeout(2500)
            shoot(pg, f'mock-xi-v{v}-region', f'결과 표시 시안 {v} 시군구')
            pg.evaluate("() => window.__xc.map.jumpTo({ center: [127.9, 36.2], zoom: 6.2 })"); settle(pg); pg.wait_for_timeout(800)
        pg.locator('.xv-sw button[data-v="now"]').click(); pg.wait_for_timeout(500)
    scene('staff', 'variants', variants)

    def world():
        go(pg, f'{APP}{V}global/', None, 500); pg.wait_for_timeout(6000)
        shoot(pg, 'now-world', '세계 지도(LX 직원)')
    scene('staff', 'world', world)
    c.close()


def admin(b):
    c, pg = login(b, ADMIN, 'lxadmin@lx.or.kr')
    ready = lambda: pg.wait_for_function("() => { const b = document.querySelector('.sd-body'); return b && !b.querySelector('.sd-wait') && (b.querySelector('table, .sd-none') || b.querySelector('[data-kind=error]')); }", timeout=60000)

    def det(map_=False):
        pg.wait_for_function("() => { const d = document.querySelector('.sd-det'); return d && d.querySelector('.sd-d') && !d.querySelector('.sd-wait'); }", timeout=40000)
        if map_:
            try: pg.wait_for_function("() => document.querySelector('.sd-det .k-stage.is-ready')", timeout=40000)
            except Exception: pass
        try: pg.wait_for_load_state('networkidle', timeout=20000)
        except Exception: pass
        pg.wait_for_timeout(2500)

    def shared():
        go(pg, f'{ADMIN}/landxi/v3/ops-infra/#/shared', None, 800, 90000)
        ready(); det(True)
        shoot(pg, 'now-sd-img', '공유 데이터 영상 줄 상세')
        pg.locator('.sd-tbl tr.sd-row').nth(1).click(); det(True); shoot(pg, 'now-sd-img2', '공유 데이터 영상 둘째 줄')
        pg.locator('.sd-tabs button', has_text='학습 데이터').click(); ready(); det(False)
        try: pg.wait_for_function("() => [...document.querySelectorAll('.sd-d-pic')].filter((x) => x.querySelector('img')?.complete).length >= 2", timeout=30000)
        except Exception: pass
        pg.wait_for_timeout(800); shoot(pg, 'now-sd-train', '공유 데이터 학습 데이터 줄 상세')
        pg.locator('.sd-tabs button', has_text='행정 자료').click(); ready(); det(True)
        shoot(pg, 'now-sd-admin', '공유 데이터 행정 자료 첫 줄 상세')
        r = pg.locator('tr.sd-row[data-key^="admin:imp_"]')
        if r.count():
            r.first.click(); det(True); shoot(pg, 'now-sd-admin-org', '공유 데이터 행정 자료 기관 줄')
        r = pg.locator('tr.sd-row[data-key^="admin:vw-"]')
        if r.count() > 1:
            r.nth(1).click(); det(True); pg.wait_for_timeout(2000); shoot(pg, 'now-sd-admin-vw', '공유 데이터 행정 자료 브이월드 줄')
    scene('admin', 'shared', shared)

    def dashb():
        go(pg, f'{ADMIN}{V}ops-core/', None, 800, 90000); calm(pg); pg.wait_for_timeout(3000)
        shoot(pg, 'now-admin-dash', 'LX 관리자 대시보드 1440')
        go(pg, f'{ADMIN}{V}ops-core/#/approvals', None, 800, 90000); calm(pg); pg.wait_for_timeout(2500)
        shoot(pg, 'now-admin-req', '요청 관리 1440')
    scene('admin', 'dash', dashb)
    c.close()


def ov(b):
    c, pg = newctx(b)
    ORGH = 'https://kgz-agri.land-xi.dev'
    pg.on('pageerror', lambda e: LOG.setdefault('_ov_errs', []).append(str(e)[:200]))
    t0 = time.time()
    pg.goto(ORGH + '/', wait_until='domcontentloaded', timeout=120000)
    pg.wait_for_selector('.gh-login input[name=login]', timeout=60000)
    pg.fill('.gh-login input[name=login]', 'lxadmin@lx.or.kr'); pg.fill('.gh-login input[name=password]', PW); pg.press('.gh-login input[name=password]', 'Enter')
    pg.wait_for_url(lambda u: re.search(r'/landxi/v3/(?!gov-home/)[a-z-]+/', u), timeout=60000)
    LOG['_logins'] += 1; save()
    ST = """() => { const why = document.querySelector('.gl-why'); const big = document.querySelector('.gl-hud .k-big'); const ld = document.querySelector('.k-ld');
      return { level: document.querySelector('.gl')?.dataset.level, state: document.body.dataset.state, why: why && !why.hidden ? why.textContent : '', run: document.querySelector('.gl-run')?.disabled,
        big: big?.dataset.state || '', v: big?.dataset.v || '', loading: !!ld && !ld.hidden, label: big?.querySelector('.k-big-l')?.textContent || '' }; }"""

    def until(fn, ms=30000):
        t = time.time()
        while time.time() - t < ms / 1000:
            try:
                s = pg.evaluate(ST)
                if fn(s): return s, int((time.time() - t) * 1000)
            except Exception:
                pass
            pg.wait_for_timeout(100)
        return pg.evaluate(ST), None

    def landing():
        if '/global/' not in pg.url: go(pg, f'{ORGH}{V}global/', None, 200)
        s, ms_g = until(lambda s: s['level'] or s['loading'], 40000)
        if s.get('loading'): shoot(pg, 'now-ov-loading', '해외 첫 화면 불러오는 중')
        s, ms_a = until(lambda s: s['state'] == 'ready', 40000)
        s, ms_r = until(lambda s: s['run'] is False, 30000)
        s, ms_b = until(lambda s: s['big'] == 'ok', 30000)
        pg.wait_for_timeout(1500)
        LOG['_ov_first'] = dict(globe_ms=ms_g, arrive_ms=ms_a, run_ms=ms_r, big_ms=ms_b, v=s.get('v'), label=s.get('label'), since_login=int((time.time() - t0) * 1000))
        save(); shoot(pg, 'now-ov-landing', '해외 기관 첫 화면(지역 닿은 뒤)')
        t = time.time(); go(pg, f'{ORGH}{V}global/', None, 100)
        s2, _ = until(lambda s: s['big'] == 'ok', 40000)
        LOG['_ov_revisit'] = dict(big_ms=int((time.time() - t) * 1000), v=s2.get('v')); save()
        pg.wait_for_timeout(1200)
    scene('ov', 'landing', landing)

    def tabs():
        if '/global/' not in pg.url: go(pg, f'{ORGH}{V}global/', None, 200)
        until(lambda s: s['big'] == 'ok', 60000)
        tab = lambda n: pg.locator('.gl-tab', has_text=n).click()
        opts = pg.locator('.gl-season option').evaluate_all("o => o.map(x => x.value)")
        other = next((v for v in opts if re.search('Summer', v)), opts[0])
        pg.select_option('.gl-season', other); until(lambda s: s['big'] == 'ok' and not s['why'].startswith('Checking'), 30000); pg.wait_for_timeout(1500)
        shoot(pg, 'now-ov-season', '해외 계절 바꿈')
        pg.select_option('.gl-season', opts[-1]); until(lambda s: s['big'] == 'ok' and s['run'] is False, 30000)
        tab('NDVI'); pg.wait_for_timeout(2500); shoot(pg, 'now-ov-ndvi', '해외 NDVI 탭')
        tab('Register'); pg.wait_for_timeout(800)
        csv = os.path.join(ROOT, 'shots', 'r3', 'r3-global', 'kgz-agri-sample-register.csv')
        pg.locator('.gl-reg input[type=file]').set_input_files(csv)
        try: pg.wait_for_function("() => !/Comparing/.test(document.querySelector('.gl-reg-up')?.textContent || '')", timeout=30000)
        except Exception: pass
        pg.wait_for_timeout(2000); shoot(pg, 'now-ov-register', '해외 Register 탭 대장 올린 뒤')
        tab('Season'); pg.wait_for_timeout(2500); shoot(pg, 'now-ov-season-red', '해외 Season 탭으로 돌아옴(대장 칠 남음)')
    scene('ov', 'tabs', tabs)

    def chat():
        if '/global/' not in pg.url: go(pg, f'{ORGH}{V}global/', None, 200)
        until(lambda s: s['big'] == 'ok', 60000)
        btn = pg.locator('.gl-ask:visible, button:has-text("XI ChatGEO"):visible, a:has-text("XI ChatGEO"):visible, [aria-label*="ChatGEO"]:visible').first
        btn.click(); pg.wait_for_selector('.k-ck-i', state='visible', timeout=10000)
        i = pg.locator('.k-ck-i:visible').first; i.fill('How much cropland dropped in Ysyk-Ata this season?'); i.press('Enter')
        try: pg.wait_for_function("() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); const a = box?.querySelector('.k-ck-a'); return box && !box.dataset.busy && a && a.textContent.trim().length > 3 && !a.querySelector('.k-ck-dots'); }", timeout=90000)
        except Exception: pass
        pg.wait_for_timeout(800)
        LOG['_ov_chat'] = pg.evaluate("() => { const box = [...document.querySelectorAll('.k-ck')].find((x) => x.getClientRects().length); return (box?.querySelector('.k-ck-a')?.textContent || '').trim().slice(0, 300); }"); save()
        shoot(pg, 'now-ov-chat', '해외 XI ChatGEO 답')
    scene('ov', 'chat', chat)
    c.close()


def gov(b):
    c, pg = newctx(b)
    pg.goto('https://namwon.land-xi.dev/', wait_until='domcontentloaded', timeout=120000)
    pg.wait_for_selector('.gh-login input[name=login]', timeout=60000)
    pg.fill('.gh-login input[name=login]', 'lxadmin@lx.or.kr'); pg.fill('.gh-login input[name=password]', PW); pg.press('.gh-login input[name=password]', 'Enter')
    pg.wait_for_url(lambda u: re.search(r'/landxi/v3/(?!gov-home/)[a-z-]+/', u), timeout=60000)
    LOG['_logins'] += 1; save(); pg.wait_for_timeout(3000)

    def dash():
        go(pg, f'https://namwon.land-xi.dev{V}gov-select/?service=card-farm', None, 800, 90000); calm(pg); pg.wait_for_timeout(3500)
        shoot(pg, 'now-gov-dash', '기관 서비스 대시보드 1440')
    scene('gov', 'dash', dash)

    def xi():
        res = []
        for k in range(2):
            t = time.time()
            pg.goto(f'https://namwon.land-xi.dev{V}xi-clean/?service=card-farm', wait_until='commit')
            pg.wait_for_function("() => window.__xc?.boot?.shown && !document.querySelector('.k-ld:not([hidden])')", timeout=120000, polling=100)
            try: pg.wait_for_function("() => window.__xc.map.areTilesLoaded() && !window.__xc.map.isMoving()", timeout=30000, polling=100)
            except Exception: pass
            res.append(round(time.time() - t, 1))
        LOG['_gov_xi_s'] = res; save()
        pg.wait_for_timeout(1500)
        shoot(pg, 'now-gov-ximap', '기관 XI맵(서비스로 열기)')
    scene('gov', 'xi', xi)
    c.close()


def pub(b):
    c, pg = newctx(b)

    def main_login():
        go(pg, f'{APP}{V}login/', '#id', 3000); pg.wait_for_timeout(3000)
        shoot(pg, 'now-pub-login', '로그인 화면(로그인 전)')
        go(pg, f'{APP}{V}main/', None, 6000)
        shoot(pg, 'now-pub-main', '메인 첫 장면(로그인 전)')
    scene('pub', 'login', main_login)
    c.close()


def mock(b):
    c, pg = newctx(b)
    M = f'{APP}/landxi/proto/review/mock/overseas-perf/index.html'

    def m():
        def go2(qs, name, wait=1500):
            pg.goto(M + qs, wait_until='networkidle'); pg.wait_for_timeout(wait); shoot(pg, name, '시안 ' + name)
        go2('', 'mock-ov-a-fill', 2600)
        go2('', 'mock-ov-a-full', 8500)
        go2('?t=chg&still=1', 'mock-ov-a-change')
        go2('?ask=1&fal=1&still=1', 'mock-ov-a-ask')
        go2('?dash=1&still=1', 'mock-ov-a-dash', 1200)
        go2('?v=b&still=1', 'mock-ov-b-board', 1500)
        LOG['_mock_min_font'] = pg.evaluate("() => { let m = 99; for (const v of ['A', 'B']) { const e = document.getElementById(v); if (e) e.hidden = false; } document.querySelectorAll('body *').forEach((e) => { if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const s = parseFloat(getComputedStyle(e).fontSize); if (s < m) m = s; } }); return m; }"); save()
    scene('mock', 'm', m)
    c.close()


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    which = [k for k in SEL] or ['staff', 'admin', 'ov', 'gov', 'pub', 'mock']
    for nm, fn in (('staff', staff), ('admin', admin), ('ov', ov), ('gov', gov), ('pub', pub), ('mock', mock)):
        if nm in which:
            try:
                fn(b)
            except Exception as e:
                LOG['_failed'].append('묶음:' + nm); print('실패(묶음)', nm, str(e)[:300]); save()
    b.close()
save()
print('끝 - 실패', LOG['_failed'], '로그인', LOG['_logins'])
