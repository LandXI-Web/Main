"""설계 6차 · 1차·2차 서비스 관계 + 남원 카드 이전 — fig/*.html 은 1440 폭 전체를, mock/*.html 은 1440×900 으로 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r6/services2/shoot.py [이름 일부...]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
MOCK = os.path.join(HERE, 'mock')
SHOTS = os.path.join(HERE, 'shots')

# (폴더, 파일, 결과 이름, (폭, 높이), 전체 페이지 여부)
JOBS = [
    (FIG, '01-relation.html', 'rel-1-marine.png', (1440, 900), True),
    (FIG, '02-frame.html', 'rel-2-frame.png', (1440, 900), True),
    (FIG, '03-screens.html', 'rel-3-screens.png', (1440, 900), True),
    (FIG, '04-namwon-move.html', 'move-1-namwon.png', (1440, 900), True),
    (MOCK, '01-select-namwon.html', 'new-select-namwon.png', (1440, 900), False),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for folder, src, out, (w, h), full in JOBS:
            if only and not any(o in src or o in out for o in only):
                continue
            url = 'file:///' + os.path.join(folder, src).replace('\\', '/')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(700)  # 서체
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            pg.close()
            print('찍음', out)
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
