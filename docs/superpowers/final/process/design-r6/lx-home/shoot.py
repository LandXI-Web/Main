"""설계 6차(lx-home) 시안 촬영 — mock/ 의 HTML 을 찍어 shots/new-*.png 로 (shots/ 는 gitignore).
사용: python docs/superpowers/final/process/design-r6/lx-home/shoot.py [이름 일부...]
GPU · 서버 · 로그인 없음 — 파일만 연다. 지금 화면(now-*)은 now.mjs 가 로그인 폼으로 찍는다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

# (파일, 결과 이름, 크기)
SHOTS_LIST = [
    ('mock/home.html', 'new-home-1440.png', (1440, 900)),
    ('mock/home-m.html', 'new-home-390.png', (390, 844)),
    ('mock/home-m.html?menu', 'new-menu-390.png', (390, 844)),
    ('mock/analyze.html', 'new-analyze.png', (1440, 900)),
    ('mock/projects.html', 'new-projects.png', (1440, 900)),
    ('mock/project-inside.html', 'new-project-inside.png', (1440, 900)),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out, (w, h) in SHOTS_LIST:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(HERE, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(700)  # 서체·배경 이미지
            pg.screenshot(path=os.path.join(SHOTS, out))
            pg.close()
            print('찍음', out)
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
