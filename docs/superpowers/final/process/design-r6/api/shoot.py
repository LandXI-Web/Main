"""설계 6차 · 외부 연동 API — fig/*.html 은 1440 폭 전체를, mock/*.html 은 1440×900 으로 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r6/api/shoot.py [이름 일부...]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다. GPU · 서버 · 로그인 없음 — 파일만 연다.
'지금' 그림(now-admin-inbox.png)은 구현 1차 결재함 캡처를 그대로 복사한다.
"""
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
MOCK = os.path.join(HERE, 'mock')
SHOTS = os.path.join(HERE, 'shots')
NOW = os.path.join(HERE, '..', '..', 'impl-1', 'admin', 'img', '02-after-inbox-open.png')

# (폴더, 파일[?상태], 결과 이름, (폭, 높이), 전체 페이지 여부)
JOBS = [
    (FIG, '01-key-flow.html', 'api-key-flow.png', (1440, 900), True),
    (FIG, '02-request-flow.html', 'api-request-flow.png', (1440, 900), True),
    (FIG, '03-imagery-in.html', 'api-imagery-in.png', (1440, 900), True),
    (FIG, '04-export-formats.html', 'api-export-formats.png', (1440, 900), True),
    (FIG, '05-who.html', 'api-who.png', (1440, 900), True),
    (MOCK, 'admin-inbox.html', 'new-admin-api-request.png', (1440, 900), False),
    (MOCK, 'admin-inbox.html?reject', 'new-admin-api-reject.png', (1440, 900), False),
    (MOCK, 'admin-inbox.html?key', 'new-admin-key-issue.png', (1440, 900), False),
    (MOCK, 'gov-api.html', 'new-gov-api-apply.png', (1440, 900), False),
    (MOCK, 'gov-api.html?once', 'new-gov-api-once.png', (1440, 900), False),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    if os.path.exists(NOW) and (not only or any(o in 'now-admin-inbox.png' for o in only)):
        shutil.copy2(NOW, os.path.join(SHOTS, 'now-admin-inbox.png'))
        print('복사', 'now-admin-inbox.png')
    with sync_playwright() as p:
        b = p.chromium.launch()
        for folder, src, out, (w, h), full in JOBS:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(folder, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(800)  # 서체 · 이미지
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            pg.close()
            print('찍음', out)
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
