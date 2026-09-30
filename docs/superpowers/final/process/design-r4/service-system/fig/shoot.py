"""서비스 제공 체계 그림 촬영 — fig/*.html 을 1440 폭으로 찍어 ../shots/sys-*.png 로.
사용: python docs/superpowers/final/process/design-r4/service-system/fig/shoot.py
"""
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, '..', 'shots')
FIGS = [
    ('01-system-map.html', 'sys-1-four-ways.png'),
    ('02-lifecycle.html', 'sys-2-lifecycle-namwon.png'),
    ('03-onboarding.html', 'sys-3-onboarding.png'),
]

if __name__ == '__main__':
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out in FIGS:
            pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
            pg.goto('file:///' + os.path.join(HERE, src).replace('\\', '/'))
            pg.wait_for_timeout(500)
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=True)
            pg.close()
            print('찍음', out)
        b.close()
