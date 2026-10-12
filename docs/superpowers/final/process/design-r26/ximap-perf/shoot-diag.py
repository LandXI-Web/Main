"""진단 캡처 — 바깥 주소 로그인 폼(LX 직원) → XI맵 · 지도 서비스 PC 1440×900. 세션 주입 없음."""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT = "E:/Land-XI 플랫폼/01. 디자인"
env = open(ROOT + "/server/.env", encoding="utf-8").read()
pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
O = "https://app.land-xi.dev"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "diag"); os.makedirs(OUT, exist_ok=True)
log = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    pg.goto(O + "/landxi/v3/login/", wait_until='load', timeout=90000); pg.wait_for_timeout(2500)
    pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw); pg.click('#go')
    pg.wait_for_url(re.compile(r'lx-console|lx-|xi-clean'), timeout=60000); pg.wait_for_timeout(2000)
    for path, name, note in [("/landxi/v3/xi-clean/", "diag-ximap-1440", "지금 XI맵(LX 직원) 첫 화면"), ("/landxi/v3/lx-map/", "diag-mapsvc-1440", "지금 지도 서비스(LX 직원) 첫 화면")]:
        errs.clear(); pg.goto(O + path, wait_until='load', timeout=90000)
        try: pg.wait_for_selector('html[data-map-ready="1"]', timeout=60000)
        except Exception as e: errs.append('기다림 ' + str(e)[:60])
        pg.wait_for_timeout(4000)
        t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
        pg.screenshot(path=os.path.join(OUT, out))
        txt = pg.evaluate("() => document.body.innerText.slice(0, 2500)")
        log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': O + path, 'viewport': [1440, 900], 'note': note, 'errors': list(errs)})
        open(os.path.join(OUT, name + '.txt'), 'w', encoding='utf-8').write(txt)
        print('찍음', out, errs or '이상 없음')
    b.close()
json.dump(log, open(os.path.join(OUT, 'log-diag.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
