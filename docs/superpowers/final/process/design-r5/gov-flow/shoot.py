"""설계 5차 · 기관 분기 흐름 — fig/*.html 은 1440 폭 전체를, mock/*.html 은 1440×900(메인은 전체) 으로 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r5/gov-flow/shoot.py [이름 일부...]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다.
"""
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
MOCK = os.path.join(HERE, 'mock')
SHOTS = os.path.join(HERE, 'shots')

# (폴더, 파일[?상태], 결과 이름, (폭, 높이), 전체 페이지 여부)
JOBS = [
    (FIG, '01-flow.html', 'flow-1-onestop.png', (1440, 900), True),
    (FIG, '02-request.html', 'flow-2-request.png', (1440, 900), True),
    (MOCK, '01-main-namwon.html', 'new-main-namwon.png', (1440, 900), True),
    (MOCK, '01-main-gwangju.html', 'new-main-gwangju.png', (1440, 900), True),
    (MOCK, '02-login.html', 'new-login.png', (1440, 900), False),
    (MOCK, '02-login.html?join', 'new-login-join.png', (1440, 900), False),
    (MOCK, '03-select.html', 'new-select.png', (1440, 900), False),
    (MOCK, '04-dashboard.html', 'new-dashboard.png', (1440, 900), False),
    (MOCK, '04-dashboard.html?parcels', 'new-dashboard-parcels-flag.png', (1440, 900), False),
    (MOCK, '04-dashboard.html?download', 'new-dashboard-download.png', (1440, 900), False),
    (MOCK, '05-request.html', 'new-request.png', (1440, 900), False),
    (MOCK, '05-request.html?sent', 'new-request-sent.png', (1440, 900), False),
    (MOCK, '06-lx-inbox.html', 'new-lx-inbox.png', (1440, 900), False),
    (MOCK, '07-flagged.html', 'new-flagged.png', (1440, 900), False),
    (MOCK, '08-admin.html', 'new-admin.png', (1440, 900), False),
]

# 나란히(두 장): 남원 · 광주전남 메인 위쪽 900px — 틀은 같고 마크·이름·색·서비스만 다른 것이 한눈에
PAIRS = [
    (['new-main-namwon.png', 'new-main-gwangju.png'], 'new-main-two.png', 900),
    (['new-login.png', 'new-login-join.png'], 'new-login-two.png', 900),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for folder, src, out, (w, h), full in JOBS:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(folder, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(700)  # 서체·이미지
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            pg.close()
            print('찍음', out)
        b.close()


def pairs(only):
    for parts, out, crop_h in PAIRS:
        if only and not any(o in out for o in only):
            continue
        ims = []
        for n in parts:
            fp = os.path.join(SHOTS, n)
            if not os.path.exists(fp):
                ims = []
                break
            im = Image.open(fp).convert('RGB')
            ims.append(im.crop((0, 0, im.width, min(im.height, crop_h))))
        if not ims:
            print('건너뜀', out)
            continue
        gap, w = 24, 708
        h = round(w * crop_h / 1440)
        canvas = Image.new('RGB', (w * 2 + gap, h), (242, 244, 246))
        for i, im in enumerate(ims):
            canvas.paste(im.resize((w, h), Image.LANCZOS), (i * (w + gap), 0))
        canvas.save(os.path.join(SHOTS, out))
        print('나란히', out)


if __name__ == '__main__':
    only = sys.argv[1:]
    shoot(only)
    pairs(only)
