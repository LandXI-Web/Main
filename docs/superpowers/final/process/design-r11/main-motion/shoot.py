"""설계 11차(main-motion) 시안 촬영 — 미리보기 복사본(landxi/proto/review/main-motion/)을 1440 · 390 으로 찍는다.
사용: python docs/superpowers/final/process/design-r11/main-motion/shoot.py
GPU · 로그인 · 영상 생성 없음. 캡처는 꼭 필요한 장면만(장면당 1~2장) + 첫 등장 영상(webm) 하나.
"""
import os, shutil, glob
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
os.makedirs(SHOTS, exist_ok=True)
BASE = os.environ.get('LX_BASE', 'http://localhost:4173') + '/landxi/proto/review/main-motion/index.html'
PC, M = (1440, 900), (390, 844)

def shot(pg, name, full=False):
    pg.screenshot(path=os.path.join(SHOTS, name), full_page=full)
    print('·', name)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)

    # 1) 첫 등장 영상(1440 · 표기 ⓐ) — 4.5초
    vdir = os.path.join(HERE, '_video')
    ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, record_video_dir=vdir, record_video_size={'width': PC[0], 'height': PC[1]})
    pg = ctx.new_page(); pg.goto(BASE + '?shot=1', wait_until='domcontentloaded')
    pg.wait_for_timeout(650); shot(pg, 'new-hero-enter-mid-1440.png')   # 글자가 반쯤 선 순간
    pg.wait_for_timeout(2600); shot(pg, 'new-hero-1440.png')            # 다 선 뒤 + 스크롤 안내
    pg.wait_for_timeout(1200)
    ctx.close()
    for f in glob.glob(os.path.join(vdir, '*.webm')): shutil.move(f, os.path.join(SHOTS, 'new-hero-enter-1440.webm'))
    shutil.rmtree(vdir, ignore_errors=True)

    # 2) 표기 ⓑ(쓸어 드러남) — 중간 한 장
    ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}); pg = ctx.new_page()
    pg.goto(BASE + '?shot=1&word=b', wait_until='domcontentloaded'); pg.wait_for_timeout(700)
    shot(pg, 'new-word-b-mid-1440.png'); ctx.close()

    # 3) 마지막 장면 ⓐ · ⓑ (1440)
    for v in ('a', 'b'):
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}); pg = ctx.new_page()
        pg.goto(BASE + f'?shot=1&fin={v}', wait_until='domcontentloaded'); pg.wait_for_timeout(300)
        pg.evaluate("document.getElementById('fin').scrollIntoView({block:'start'})"); pg.wait_for_timeout(2600)
        shot(pg, f'new-fin-{v}-1440.png'); ctx.close()

    # 4) 휴대폰 390 — 첫 화면(안내 포함) · 마지막 ⓐ · ⓑ
    ctx = b.new_context(viewport={'width': M[0], 'height': M[1]}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = ctx.new_page()
    pg.goto(BASE + '?shot=1', wait_until='domcontentloaded'); pg.wait_for_timeout(3300); shot(pg, 'new-hero-390.png')
    for v in ('a', 'b'):
        pg.goto(BASE + f'?shot=1&fin={v}', wait_until='domcontentloaded'); pg.wait_for_timeout(300)
        pg.evaluate("document.getElementById('fin').scrollIntoView({block:'start'})"); pg.wait_for_timeout(2600)
        shot(pg, f'new-fin-{v}-390.png')
    ctx.close(); b.close()
print('done')
