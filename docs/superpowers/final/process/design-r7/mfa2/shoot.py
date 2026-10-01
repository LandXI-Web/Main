"""설계 7차 · 2차 인증 후속 — fig/*.html 을 1440 폭 전체로 찍어 shots/ 에 둔다(shots/ 는 gitignore).
사용: python docs/superpowers/final/process/design-r7/mfa2/shoot.py [이름 일부...]
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
SHOTS = os.path.join(HERE, 'shots')

# (원본, 결과 이름)
JOBS = [
    ('01-company-otp.html', 'mfa2-1-company-otp.png'),
    ('02-gov-otp.html', 'mfa2-2-gov-otp.png'),
]


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out in JOBS:
            if only and not any(o in src or o in out for o in only):
                continue
            pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
            pg.goto('file:///' + os.path.join(FIG, src).replace(os.sep, '/'), wait_until='load')
            pg.wait_for_timeout(700)  # 서체
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=True)
            pg.close()
            print('shot', out)
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
