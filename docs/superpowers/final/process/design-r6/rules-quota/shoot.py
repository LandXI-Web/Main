"""설계 6차 · 결재 규칙과 기관 한도 — fig/*.html 을 1440 폭 전체로 찍고, 지금 관리자 '기관' 화면 한 장을 로그인 폼으로 들어가 찍는다.
구현 1차 관리자 캡처 두 장(요청한 관리자가 연 결재 · 9월 30일 기관 화면)은 그대로 복사해 쓴다(같은 화면 실물).
사용: python docs/superpowers/final/process/design-r6/rules-quota/shoot.py [이름 일부...] [--no-now]
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다. 비밀번호는 파일에 적지 않고 server/.env 에서 실행 때만 읽는다. GPU 는 쓰지 않는다.
"""
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
SHOTS = os.path.join(HERE, 'shots')
REPO = os.path.abspath(os.path.join(HERE, *(['..'] * 6)))
IMPL1 = os.path.join(REPO, 'docs', 'superpowers', 'final', 'process', 'impl-1', 'admin', 'img')
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')

FIGS = [
    ('01-approval-path.html', 'rq-approval-path.png'),
    ('02-no-approver.html', 'rq-approval-alone.png'),
    ('03-ledger-vs-queue.html', 'rq-ledger-vs-queue.png'),
    ('04-redesign.html', 'rq-quota-redesign.png'),
    ('05-usage-view.html', 'rq-usage-view.png'),
    ('06-queue-rules.html', 'rq-queue-rules.png'),
    ('07-staff-allot.html', 'rq-staff-allot.png'),
]
COPY = [   # 구현 1차 캡처(로그인 폼 · 1440×900) → 이 폴더 이름
    ('07-self-request-no-buttons.png', 'rq-now-self-request.png'),
    ('09-tenants-over-limit-line.png', 'rq-now-0930-tenants.png'),
]
NOW = [    # (주소, 결과 이름, 다 그려졌다는 표시)
    ('/landxi/v3/ops-infra/#/tenants', 'rq-now-1001-tenants.png', '#pane-tenants .org'),
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


def copy_impl1(only):
    for src, out in COPY:
        if only and not any(o in src or o in out for o in only):
            continue
        shutil.copyfile(os.path.join(IMPL1, src), os.path.join(SHOTS, out))
        print('복사', out)


def shoot_now(b, only):
    jobs = [j for j in NOW if not only or any(o in j[1] for o in only)]
    if not jobs:
        return
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(BASE + '/landxi/v3/login/?site=admin')
    pg.wait_for_selector('#id', timeout=30000)
    # 메일 아이디(lxadmin@lx.or.kr)의 비밀번호는 대화로만 전해져 server/.env 에 없다 — 옛 시범 아이디로 찍고,
    # 옛 아이디가 정리되면 LX_SHOOT_ID · LX_SHOOT_PW 환경변수로 넘긴다(파일에 적지 않음).
    pg.fill('#id', os.environ.get('LX_SHOOT_ID', 'lxadmin'))
    pg.fill('#pw', os.environ.get('LX_SHOOT_PW') or password())
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
        pg.wait_for_timeout(2500)          # 고리 그리기
        pg.screenshot(path=os.path.join(SHOTS, out), full_page=False)
        print('찍음', out)
    ctx.close()


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    os.makedirs(SHOTS, exist_ok=True)
    copy_impl1(args)
    with sync_playwright() as p:
        b = p.chromium.launch()
        shoot_figs(b, args)
        if '--no-now' not in sys.argv:
            shoot_now(b, args)
        b.close()
