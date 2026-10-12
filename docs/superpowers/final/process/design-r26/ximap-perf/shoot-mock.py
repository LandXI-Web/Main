"""설계 26차(ximap-perf) 시안 촬영 — 바깥 주소(또는 --local) PC 1440×900 · 시안 안 로그인 폼(LX 직원) 한 번 · 세션 주입 없음 · GPU 0.
사용: python shoot.py [--local] [shots|video] [이름 일부...]"""
import json, os, re, sys, datetime, shutil, subprocess
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT = "E:/Land-XI 플랫폼/01. 디자인"
LOCAL = '--local' in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
MODE = ARGS[0] if ARGS and ARGS[0] in ('shots', 'video') else 'shots'
ONLY = [a for a in ARGS if a not in ('shots', 'video')]
ORIGIN = 'http://127.0.0.1:4173' if LOCAL else 'https://app.land-xi.dev'
MOCK = ORIGIN + '/landxi/proto/review/mock/ximap-perf/'
OUT = os.path.join(ROOT, 'docs/superpowers/final/process/design-r26/ximap-perf') if not LOCAL else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'local')
SHOTS = os.path.join(OUT, 'shots'); os.makedirs(SHOTS, exist_ok=True)
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(ROOT + '/server/.env', encoding='utf-8').read(), re.M).group(1).strip().strip('"')
LIST = [
    ('index.html?v=a', 'mock-a-live-1440', 0, 'A안 라이브 지휘소 — 열자마자: 전국 실제 경작지 면 · 지금 분석 중인 읍면동(차오름) · 흐르는 결과 고리 · 아래 연도 막대 · 가운데 XI ChatGEO · 오른쪽 아래 진화 띠'),
    ('index.html?v=a&ask=0', 'mock-a-ask-1440', 5200, 'A안 — ChatGEO 에 "전주 덕진구 경작지 보여줘" → 지도가 날아가고 답(서버 숫자)'),
    ('index.html?v=b&scene=now', 'mock-b-now-1440', 0, 'B안 장면 1 살아 있는 전국 분석'),
    ('index.html?v=b&scene=time', 'mock-b-time-1440', 2500, 'B안 장면 2 시간을 넘나드는 지도 — 남원 2023 ↔ 2025 실제 결과'),
    ('index.html?v=b&scene=evolve', 'mock-b-evolve-1440', 800, 'B안 장면 3 고치며 똑똑해지는 지도 — 고친 것 → 학습 데이터 → 다시 학습 → 새 판 비교(87% · 지금 91%) → 기관에 공유'),
    ('index.html?v=b&scene=talk', 'mock-b-talk-1440', 0, 'B안 장면 4 말로 다루는 지도 — XI ChatGEO 가 화면 가운데'),
]
VIDEOS = [('index.html?v=a&play=1', 'mock-a-10s'), ('index.html?v=b&play=1', 'mock-b-10s')]

def login_then(pg, url):
    pg.goto(url, wait_until='load', timeout=90000)
    pg.wait_for_selector('#login:not([hidden]) form, html[data-map-ready="1"]', timeout=60000)
    if pg.is_visible('#login form'):
        pg.fill('#login input[name=login]', 'test@lx.or.kr'); pg.fill('#login input[name=password]', pw); pg.click('#login button')
    pg.wait_for_selector('html[data-map-ready="1"]', timeout=150000)

def shots():
    log = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        for qs, name, wait, note in LIST:
            if ONLY and not any(o in name for o in ONLY): continue
            errs.clear()
            try: login_then(pg, MOCK + qs)
            except Exception as e: errs.append('기다림 ' + str(e)[:100])
            pg.wait_for_timeout(2500 + wait)
            t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': MOCK + qs, 'viewport': [1440, 900], 'note': note, 'errors': list(errs)})
            print('찍음', out, errs or '이상 없음')
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def video():
    log = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for qs, name in VIDEOS:
            if ONLY and not any(o in name for o in ONLY): continue
            tmp = os.path.join(OUT, '_vid'); os.makedirs(tmp, exist_ok=True)
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR', record_video_dir=tmp, record_video_size={'width': 1440, 'height': 900}); pg = ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            try: login_then(pg, MOCK + qs)
            except Exception as e: errs.append('기다림 ' + str(e)[:100])
            t0 = datetime.datetime.now(); pg.wait_for_timeout(10500)
            path = pg.video.path(); ctx.close()
            t = datetime.datetime.now(); out = f"{name}-{t0:%H%M}.webm"; dst = os.path.join(SHOTS, out)
            shutil.move(path, dst)
            # 로그인 · 불러오는 동안은 잘라 내고 지도가 준비된 뒤 10초만(ffmpeg · 마지막 10.5초)
            mp4 = dst[:-5] + '.mp4'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-sseof', '-10.5', '-i', dst, '-an', '-vf', 'scale=1440:900', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', mp4])
            if os.path.exists(mp4): os.remove(dst); out = os.path.basename(mp4)
            log.append({'file': out, 'shot_at': t0.isoformat(timespec='seconds'), 'url': MOCK + qs, 'viewport': [1440, 900], 'seconds': 10, 'errors': errs})
            print('녹화', out, errs or '이상 없음')
            shutil.rmtree(tmp, ignore_errors=True)
        b.close()
    json.dump(log, open(os.path.join(OUT, 'log-video.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    (video if MODE == 'video' else shots)()
