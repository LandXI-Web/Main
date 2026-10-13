"""설계 29차(ximap-fusion) 시안 촬영 — 바깥 주소(또는 --local = 로컬 관문 :4180) PC 1440×900 · 시안 안 로그인 폼(LX 직원) 한 번 · 세션 주입 없음 · GPU 0.
누르기는 실제 마우스로(시안이 돌려주는 화면 좌표에).
사용: python shoot.py [--local] [shots|video]"""
import json, os, re, sys, datetime, shutil, subprocess, time, base64
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT = "E:/Land-XI 플랫폼/01. 디자인"
LOCAL = '--local' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
MODE = ARGS[0] if ARGS and ARGS[0] in ('shots', 'video') else 'shots'
ORIGIN = 'http://127.0.0.1:4180' if LOCAL else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/ximap-fusion/index.html'
OUT = os.path.join(ROOT, 'docs/superpowers/final/process/design-r29/ximap-fusion')
SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(ROOT + '/server/.env', encoding='utf-8').read(), re.M).group(1).strip().strip('"')
ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def open_(pg, qs=''):
    pg.goto(MOCK + qs, wait_until='load', timeout=90000)
    pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=90000)
    if pg.is_visible('#login form'):
        pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', pw); pg.click('#login button')
    pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)


def pt(pg, what, *a):
    return pg.evaluate(f"(a) => window.__pt.{what}(...a)", list(a))


def click(pg, p, steps=10):
    pg.mouse.move(p['x'], p['y'], steps=steps); pg.mouse.click(p['x'], p['y'])


def wait_ask(pg):
    pg.wait_for_function("window.__pt && !window.__pt.busy() && window.__pt.dash()", timeout=120000)


def snap(pg, name, note, log, errs):
    t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
    pg.screenshot(path=os.path.join(SHOTS, out))
    log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': pg.url.split('?')[0], 'viewport': [1440, 900], 'note': note, 'errors': list(errs)})
    print('찍음', out, errs or '이상 없음'); errs.clear()


def ctx_page(p):
    b = p.chromium.launch(args=ARGS_GL)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR')
    if LOCAL: ctx.add_init_script("try{localStorage.setItem('lx_api_base','http://127.0.0.1:4180')}catch(e){}")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    return b, ctx, pg, errs


def shots():
    log = []
    with sync_playwright() as p:
        b, ctx, pg, errs = ctx_page(p)
        open_(pg); pg.wait_for_timeout(3500)
        snap(pg, 'first-1440', '첫 화면 — 지도 · 지금 분석 중 · XI ChatGEO 예시 질문 두 개', log, errs)
        click(pg, pt(pg, 'chip', 0)); pg.wait_for_timeout(1700)
        snap(pg, 'mean-1440', '말함 — XI ChatGEO 가 뜻 확인(지역 · 업무 · 비교) → 융합 재료가 차례로 켜짐', log, errs)
        wait_ask(pg); pg.wait_for_timeout(5000)
        snap(pg, 'dash1-1440', '대시보드 전환 — 남원시 농지 이용: 지도는 왼쪽으로 작아지고 큰 숫자 · 읍면동별 · 지목별 · 의심 종류별 · 필지 표(공시지가) · 해석', log, errs)
        click(pg, pt(pg, 'bar', 'bE', 2)); pg.wait_for_timeout(6000)
        snap(pg, 'pick1-1440', '막대 누름 — 지도가 그 읍면동으로 · 표가 그 읍면동 필지로', log, errs)
        click(pg, pt(pg, 'back')); pg.wait_for_timeout(3500)
        click(pg, pt(pg, 'chip', 1)); wait_ask(pg); pg.wait_for_timeout(5000)
        snap(pg, 'dash2-1440', '대시보드 전환 — 어제 호우 × 비닐하우스: 강수(예시 동작 · 공식 특보는 기상청 키 뒤) × 전국 분석 비닐하우스', log, errs)
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-shots.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def video():
    """실제 마우스 한 바퀴를 화면 흐름(장면마다 실제 시각)으로 받아 장면별 구간만 잘라 10초로 잇는다(빨리 감기 없음)."""
    log = []
    with sync_playwright() as p:
        b, ctx, pg, errs = ctx_page(p)
        open_(pg, '?cursor=1'); pg.wait_for_timeout(3000)
        frames = []; cdp = ctx.new_cdp_session(pg)
        def on_frame(ev):
            frames.append((ev['metadata']['timestamp'], ev['data']))
            try: cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception: pass
        cdp.on('Page.screencastFrame', on_frame)
        cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 85, 'maxWidth': 1440, 'maxHeight': 900, 'everyNthFrame': 1})
        t0 = datetime.datetime.now(); seg = []; now = time.time
        pg.mouse.move(700, 500); pg.wait_for_timeout(700); seg.append((now() - 0.6, 0.6))
        c = pt(pg, 'chip', 0); pg.mouse.move(c['x'], c['y'], steps=8); s0 = now(); pg.mouse.click(c['x'], c['y']); pg.wait_for_timeout(500)
        seg.append((s0, 2.2))                                  # 질문 · 뜻 확인 · 융합 재료
        pg.wait_for_function("document.querySelector('#main.dash') !== null", timeout=120000); s1 = now() - 0.2
        wait_ask(pg); pg.wait_for_timeout(3500); seg.append((s1, 2.6))   # 전환
        bp = pt(pg, 'bar', 'bE', 2); pg.mouse.move(bp['x'], bp['y'], steps=6); s2 = now(); pg.mouse.click(bp['x'], bp['y']); pg.wait_for_timeout(4500); seg.append((s2, 1.6))
        bk = pt(pg, 'back'); pg.mouse.move(bk['x'], bk['y'], steps=6); pg.mouse.click(bk['x'], bk['y']); pg.wait_for_timeout(3200)
        c = pt(pg, 'chip', 1); pg.mouse.move(c['x'], c['y'], steps=6); s3 = now(); pg.mouse.click(c['x'], c['y']); pg.wait_for_timeout(400); seg.append((s3, 1.2))
        pg.wait_for_function("document.querySelector('#main.dash') !== null", timeout=120000); s4 = now() - 0.2
        wait_ask(pg); pg.wait_for_timeout(3000); seg.append((s4, 2.0))
        cdp.send('Page.stopScreencast'); pg.wait_for_timeout(400)
        tmp = os.path.join(os.environ.get('TEMP', OUT), 'xf-frames'); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp, exist_ok=True)
        frames.sort(key=lambda x: x[0]); FPS = 25; n = 0
        for a, d in seg:
            for k in range(int(round(d * FPS))):
                t = a + k / FPS; cand = [fr for fr in frames if fr[0] <= t]; fr = cand[-1] if cand else frames[0]
                open(os.path.join(tmp, f"{n:05d}.jpg"), 'wb').write(base64.b64decode(fr[1])); n += 1
        dst = os.path.join(SHOTS, f"fusion-10s-{t0:%H%M}.mp4")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(tmp, '%05d.jpg'), '-vf', 'scale=1440:900', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', dst])
        shutil.rmtree(tmp, ignore_errors=True)
        log.append({'file': os.path.basename(dst), 'shot_at': t0.isoformat(timespec='seconds'), 'url': MOCK, 'viewport': [1440, 900], 'seconds': round(n / FPS, 1), 'frames_received': len(frames),
                    'note': '실제 마우스 한 바퀴를 장면별로 잘라 이음: 첫 화면 → "남원시 농지 이용 실태 어때?" → 뜻 확인 · 융합 → 대시보드 전환 → 읍면동 막대 누름(지도 · 표 따라감) → 지도로 돌아가기 → "어제 호우 지역에 비닐하우스 몇 동?" → 대시보드', 'errors': errs})
        print('녹화', os.path.basename(dst), round(n / FPS, 1), '초', errs or '이상 없음')
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-video.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    (video if MODE == 'video' else shots)()
