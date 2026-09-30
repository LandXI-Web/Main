"""설계 6차 · 2차 인증 — fig/*.html 은 1440 폭 전체를 찍고, 지금 로그인 화면(기관·관리자 입구)은 바깥 주소에서 로그인 없이 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r6/mfa/shoot.py [이름 일부...]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다. 로그인은 하지 않는다(화면만).
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
SHOTS = os.path.join(HERE, 'shots')

# (원본, 결과 이름, (폭, 높이), 전체 페이지 여부, 기다림 ms)
JOBS = [
    ('fig:01-roles.html', 'mfa-1-roles.png', (1440, 900), True, 700),
    ('fig:02-lx-otp.html', 'mfa-2-lx-otp.png', (1440, 900), True, 700),
    ('fig:03-totp.html', 'mfa-3-totp.png', (1440, 900), True, 700),
    ('fig:04-compare.html', 'mfa-4-compare.png', (1440, 900), True, 700),
    ('fig:05-login.html', 'mfa-5-login.png', (1440, 900), True, 700),
    ('https://gov.land-xi.dev/landxi/v3/login/', 'now-gov-login.png', (1440, 900), False, 5000),
    ('https://admin.land-xi.dev/landxi/v3/login/', 'now-admin-login.png', (1440, 900), False, 5000),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out, (w, h), full, ms in JOBS:
            if only and not any(o in src or o in out for o in only):
                continue
            url = 'file:///' + os.path.join(FIG, src[4:]).replace('\\', '/') if src.startswith('fig:') else src
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url, wait_until='load')
            pg.wait_for_timeout(ms)  # 서체 · 지도 장면
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            pg.close()
            print('찍음', out)
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
