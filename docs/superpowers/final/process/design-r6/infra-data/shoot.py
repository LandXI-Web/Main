"""설계 6차 · 기관 만들기 · 데이터 · 인프라 — fig/*.html 을 1440 폭 전체로 찍고, 지금 관리자 화면 두 장(기관 · 인프라)을 로그인 폼으로 들어가 찍는다.
사용: python docs/superpowers/final/process/design-r6/infra-data/shoot.py [이름 일부...] [--no-now]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다. 비밀번호는 파일에 적지 않고 server/.env 에서 실행 때만 읽는다.
"""
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
SHOTS = os.path.join(HERE, 'shots')
REPO = os.path.abspath(os.path.join(HERE, *(['..'] * 6)))
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')

FIGS = [
    ('01-org-create.html', 'org-1-create.png'),
    ('02-address.html', 'org-2-address.png'),
    ('03-data-map.html', 'data-1-map.png'),
    ('04-guards.html', 'data-2-guards.png'),
    ('07-share.html', 'data-3-share.png'),
    ('05-roles.html', 'roles-1.png'),
    ('06-infra-panel.html', 'infra-1-panel.png'),
]
NOW = [   # (주소, 결과 이름, 다 그려졌다는 표시)
    ('/landxi/v3/ops-infra/#/tenants', 'now-admin-tenants.png', '#pane-tenants .org'),
    ('/landxi/v3/ops-infra/#/infra', 'now-admin-infra.png', '#pane-infra .hero'),
]


def password() -> str:
    for name in ('.env', '.env.example'):
        p = os.path.join(REPO, 'server', name)
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                if line.strip().startswith('DEV_PASSWORD='):
                    return line.split('=', 1)[1].strip()
    raise SystemExit('비밀번호 설정을 찾지 못했습니다')


def shoot_figs(b, only):
    for src, out in FIGS:
        if only and not any(o in src or o in out for o in only):
            continue
        pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        pg.goto('file:///' + os.path.join(FIG, src).replace('\\', '/'))
        pg.wait_for_timeout(800)
        pg.screenshot(path=os.path.join(SHOTS, out), full_page=True)
        pg.close()
        print('찍음', out)


def shoot_now(b, only):
    jobs = [j for j in NOW if not only or any(o in j[1] for o in only)]
    if not jobs:
        return
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(BASE + '/landxi/v3/login/?site=admin')
    pg.wait_for_selector('#id', timeout=30000)
    pg.fill('#id', os.environ.get('LX_SHOOT_ID', 'lxadmin'))   # 메일 아이디(원칙 77)로 바뀌면 LX_SHOOT_ID 로 넘긴다
    pg.fill('#pw', password())
    pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
    for path, out, ready in jobs:
        pg.goto(BASE + path)
        for _ in range(3):                 # 기관 사용량 계산이 늦으면 '다시 시도'를 눌러 한 번 더 기다린다
            try:
                pg.wait_for_selector(ready, state='visible', timeout=60000)
                break
            except Exception:  # noqa: BLE001
                again = pg.get_by_text('다시 시도')
                if again.count():
                    again.first.click()
        pg.wait_for_timeout(2500)          # 고리 · 막대 그리기
        pg.screenshot(path=os.path.join(SHOTS, out), full_page=False)
        print('찍음', out)
    ctx.close()


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        shoot_figs(b, args)
        if '--no-now' not in sys.argv:
            shoot_now(b, args)
        b.close()
