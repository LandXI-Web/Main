"""설계 28차(ximap-perf-3) 시안 촬영 — 바깥 주소(또는 --local = 로컬 관문 :4180) PC 1440×900 · 시안 안 로그인 폼(LX 직원) 한 번 · 세션 주입 없음 · GPU 0.
올리기 · 누르기 · 끌기는 실제 마우스로(시안이 돌려주는 화면 좌표에).
사용: python shoot.py [--local] [shots|video] [이름 일부...]"""
import json, os, re, sys, datetime, shutil, subprocess
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT = "E:/Land-XI 플랫폼/01. 디자인"
LOCAL = '--local' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
MODE = ARGS[0] if ARGS and ARGS[0] in ('shots', 'video') else 'shots'
ONLY = [a for a in ARGS if a not in ('shots', 'video')]
ORIGIN = 'http://127.0.0.1:4180' if LOCAL else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/ximap-perf-3/index.html'
OUT = os.path.join(ROOT, 'docs/superpowers/final/process/design-r28/ximap-perf-3')
SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(ROOT + '/server/.env', encoding='utf-8').read(), re.M).group(1).strip().strip('"')
ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def local_base(ctx):
    if LOCAL: ctx.add_init_script("try{localStorage.setItem('lx_api_base','http://127.0.0.1:4180')}catch(e){}")


def open_(pg, qs=''):
    pg.goto(MOCK + qs, wait_until='load', timeout=90000)
    pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=90000)
    if pg.is_visible('#login form'):
        pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', pw); pg.click('#login button')
    pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)


def pt(pg, what, *a):
    return pg.evaluate(f"(a) => window.__pt.{what}(...a)", list(a))


def glide(pg, p, steps=12):
    pg.mouse.move(p['x'], p['y'], steps=steps)


def snap(pg, name, note, log, errs):
    t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
    pg.screenshot(path=os.path.join(SHOTS, out))
    log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': pg.url, 'viewport': [1440, 900], 'note': note, 'errors': list(errs)})
    print('찍음', out, errs or '이상 없음'); errs.clear()


def want(n):
    return not ONLY or any(o in n for o in ONLY)


def shots():
    log = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS_GL)
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); local_base(ctx); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        if want('first'):
            open_(pg); pg.wait_for_timeout(4000)
            snap(pg, 'first-1440', '첫 화면 — 업무 기본 선택 없음 · 서버에 있는 모든 분석 결과가 함께 빛남 · 왼쪽 위는 전국 합계(업무 이름 없음) · 남은 날 · 진행 % 없음', log, errs)
        if want('hover') or want('press'):
            open_(pg); pg.wait_for_timeout(2500)
            c = pt(pg, 'region', '남원시')
            if c: glide(pg, {'x': c['x'] - 140, 'y': c['y'] + 80}, 2); glide(pg, c, 14)
            pg.wait_for_timeout(1200)
            if want('hover'): snap(pg, 'hover-1440', '올림 — 남원시가 떠오르고(다른 곳은 가라앉음) 옆에 그 시군구의 여러 업무 숫자(서버 값)', log, errs)
            if want('press') and c:
                pg.mouse.click(c['x'], c['y']); pg.wait_for_timeout(9000)
                o = pt(pg, 'obj')
                if o: glide(pg, o, 10); pg.mouse.click(o['x'], o['y']); pg.wait_for_timeout(2800)
                snap(pg, 'press-1440', '누름 — 남원시로 내려가 모든 결과가 객체로 펼쳐짐 → 객체 하나 눌러 그 자리 고치기', log, errs)
        if want('filter'):
            open_(pg); pg.wait_for_timeout(2500)
            c = pt(pg, 'chip', 0); pg.mouse.click(c['x'], c['y']); pg.wait_for_timeout(5000)
            snap(pg, 'filter-1440', '말로 거르기 — "비닐하우스만 보여 줘" → 비닐하우스만 남고 나머지 업무는 사라짐 · 원래대로', log, errs)
        if want('time'):
            open_(pg, '?at=namwon'); pg.wait_for_timeout(3500)
            a, z = pt(pg, 'year', 2025), pt(pg, 'year', 2024.05)
            pg.mouse.move(a['x'], a['y']); pg.mouse.down(); pg.mouse.move(z['x'], z['y'], steps=16); pg.mouse.up(); pg.wait_for_timeout(1200)
            snap(pg, 'time-1440', '시간 — 막대를 끌어 남원 2023 · 2025 결과가 겹침(2차 그대로)', log, errs)
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-shots.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def video():
    """실제 마우스로 한 바퀴를 움직이며 화면 흐름(브라우저 화면 전송 · 장면마다 실제 시각이 붙음)을 받아,
    장면마다 그 시각 구간만 잘라 10초 하나로 잇는다(빨리 감기 없음 · 소프트웨어 그리기라 실제 한 바퀴는 1분 남짓)."""
    import time, base64
    log = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS_GL)
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); local_base(ctx)
        pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        open_(pg, '?cursor=1'); pg.wait_for_timeout(3000)
        frames = []
        cdp = ctx.new_cdp_session(pg)
        def on_frame(ev):
            frames.append((ev['metadata']['timestamp'], ev['data']))
            try: cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception: pass
        cdp.on('Page.screencastFrame', on_frame)
        cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 85, 'maxWidth': 1440, 'maxHeight': 900, 'everyNthFrame': 1})
        t0 = datetime.datetime.now(); seg = []
        now = time.time
        def hold(ms):
            pg.wait_for_timeout(ms)
        glide(pg, {'x': 760, 'y': 600}, 2); hold(600); e = now(); seg.append((e - 1.0, 1.0))
        c2, c = pt(pg, 'region', '함양군'), pt(pg, 'region', '남원시')
        if c2: glide(pg, c2, 8); hold(1100); e = now(); seg.append((e - 1.2, 1.2))
        if c: glide(pg, c, 8); hold(1100); e = now(); seg.append((e - 1.2, 1.2))
        if c: s0 = now(); pg.mouse.click(c['x'], c['y']); hold(10000); seg.append((s0, 3.4))
        o = pt(pg, 'obj')
        if o: glide(pg, o, 6); s0 = now(); pg.mouse.click(o['x'], o['y']); hold(3000); seg.append((s0 - 0.2, 1.4))
        f = pt(pg, 'fix')
        if f: glide(pg, f, 4); s0 = now(); pg.mouse.click(f['x'], f['y']); hold(1500); seg.append((s0 - 0.2, 0.8))
        k = pt(pg, 'chip', 0); glide(pg, k, 6); s0 = now(); pg.mouse.click(k['x'], k['y']); hold(1200); seg.append((s0 - 0.1, 0.6))
        pg.wait_for_function("document.querySelector('#askA.in') !== null", timeout=60000); hold(1200)
        still = base64.b64encode(pg.screenshot(type='jpeg', quality=85)).decode(); seg.append(('still', 1.4))
        hold(2000); cdp.send('Page.stopScreencast'); hold(500)
        tmp = os.path.join(os.environ.get('TEMP', OUT), 'xp3-frames'); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp, exist_ok=True)
        frames.sort(key=lambda x: x[0])
        FPS = 25; lst = []; n = 0
        for a, d in seg:          # 장면마다 1/25초 간격으로 그 시각 직전 화면을 고른다(마지막 답은 그 순간 찍은 화면)
            for k_ in range(int(round(d * FPS))):
                if a == 'still':
                    fn = os.path.join(tmp, f"{n:05d}.jpg"); open(fn, 'wb').write(base64.b64decode(still)); n += 1; continue
                t = a + k_ / FPS
                cand = [fr for fr in frames if fr[0] <= t]
                fr = cand[-1] if cand else frames[0]
                fn = os.path.join(tmp, f"{n:05d}.jpg"); open(fn, 'wb').write(base64.b64decode(fr[1])); n += 1
        dst = os.path.join(SHOTS, f"perf3-10s-{t0:%H%M}.mp4")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(tmp, '%05d.jpg'), '-vf', 'scale=1440:900', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', dst])
        shutil.rmtree(tmp, ignore_errors=True)
        total = round(n / FPS, 1)
        log.append({'file': os.path.basename(dst), 'shot_at': t0.isoformat(timespec='seconds'), 'url': pg.url, 'viewport': [1440, 900], 'seconds': total, 'frames_received': len(frames),
                    'note': '실제 마우스 한 바퀴를 장면별로 잘라 이음(빨리 감기 없음): 첫 화면 → 함양군 올림 → 남원시 올림 → 누름(모든 결과가 객체로 펼쳐짐) → 객체 눌러 모양 고치기(예시 동작) → XI ChatGEO "비닐하우스만 보여 줘" → 거른 결과', 'errors': errs})
        print('녹화', os.path.basename(dst), total, '초 · 받은 화면', len(frames), errs or '이상 없음')
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-video.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    (video if MODE == 'video' else shots)()
