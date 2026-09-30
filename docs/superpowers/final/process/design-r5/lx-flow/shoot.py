"""설계 5차(lx-flow) 시안 촬영 — fig/·mock/ 의 HTML 을 찍어 shots/*.png 로 (shots/ 는 gitignore).
사용: python docs/superpowers/final/process/design-r5/lx-flow/shoot.py [이름 일부...]
GPU · 서버 · 로그인 없음 — 파일만 연다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

# (파일, 결과 이름, 크기)
SHOTS_LIST = [
    ('fig/flow.html', 'flow-lx-13.png', (1600, 1260)),
    ('mock/admin-judge.html', 'judge-1-approve.png', (1440, 900)),
    ('mock/admin-judge.html?reject', 'judge-2-reject.png', (1440, 900)),
    ('mock/admin-guide.html', 'judge-3-guide.png', (1440, 900)),
    ('mock/label-tool.html', 'label-1-tool.png', (1440, 900)),
    ('mock/label-tool.html?review', 'label-2-review.png', (1440, 900)),
    ('mock/ledger-output.html', 'ledger-1-table.png', (1440, 900)),
    ('mock/project-new.html', 'ledger-2-project-new.png', (1440, 900)),
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
