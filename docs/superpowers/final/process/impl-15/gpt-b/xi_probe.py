"""XI맵 첫 진입 · 입체 점검 — 바깥 주소 · 실제 GPU 브라우저(Chrome 창 · headless 아님) · LX 직원 로그인 폼 1회.
창 1265×710 · 1440×900 · 1920×1080. 각 크기: 새 탭으로 XI맵 → 도착 시각 · 늦음 안내 → 입체 → 1.2초 · 6초 그림 → 흰 칸 비율."""
import os, re, json, sys, datetime
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = r'E:\Land-XI 플랫폼\01. 디자인'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
TAG = sys.argv[2] if len(sys.argv) > 2 else 'probe'
QS = sys.argv[3] if len(sys.argv) > 3 else ''
SIZES = [(1265, 710), (1440, 900), (1920, 1080)]
os.makedirs(OUT, exist_ok=True)
HOST = 'https://app.land-xi.dev'
pw = os.environ.get('LX_PW') or re.search(r'^DEV_PASSWORD=(.*)$', open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read(), re.M).group(1).strip().strip('"')


def white(path, top=0.0):
    im = Image.open(path).convert('RGB'); w, h = im.size
    im = im.crop((int(w * 0.25), int(h * top), w, h)).resize((200, 120))
    px = list(im.getdata())
    return round(sum(1 for r, g, b in px if r > 245 and g > 245 and b > 245) / len(px), 3)


res = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False, args=['--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR')
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(HOST + '/landxi/v3/login/', wait_until='domcontentloaded'); pg.wait_for_selector('#id')
    pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw); pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000); pg.wait_for_timeout(1500)
    for (w, h) in SIZES:
        pg.set_viewport_size({'width': w, 'height': h})
        t0 = datetime.datetime.now()
        pg.goto(HOST + '/landxi/v3/xi-clean/index.html' + QS, wait_until='domcontentloaded')
        pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=90000)
        boot = pg.evaluate("() => window.__xc.boot")
        gl = pg.evaluate("() => { try { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL) } catch (e) { return String(e) } }")
        pg.wait_for_timeout(2500)
        slow = pg.evaluate("() => !!window.__xc.slow || /응답이 늦/.test(document.body.innerText)")
        k = f'{w}x{h}'
        flat = os.path.join(OUT, f'{TAG}-{k}-flat.png'); pg.screenshot(path=flat)
        pg.evaluate("() => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === '입체')?.click()")
        pg.wait_for_timeout(1200)
        mv = os.path.join(OUT, f'{TAG}-{k}-tilt-moving.png'); pg.screenshot(path=mv)
        pg.wait_for_timeout(6000)
        st = os.path.join(OUT, f'{TAG}-{k}-tilt.png'); pg.screenshot(path=st)
        cam = pg.evaluate("() => { const m = window.__xc?.map || window.__xcMap; return m ? { z: m.getZoom(), p: m.getPitch() } : null }")
        has_tilt = pg.evaluate("() => !![...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === '입체')")
        res[k] = {'boot': boot, 'gl': gl, 'slow': slow, 'white_flat': white(flat), 'white_moving': white(mv), 'white_tilt': white(st),
                  'white_tilt_top': white(st, 0.0), 'cam': cam, 'tilt_button': has_tilt, 'at': t0.strftime('%H:%M:%S')}
        print(k, json.dumps(res[k], ensure_ascii=False))
        pg.evaluate("() => [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === '입체')?.click()")
        pg.wait_for_timeout(1500)
    res['errors'] = errs
    b.close()
json.dump(res, open(os.path.join(OUT, f'{TAG}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('errors', errs)
