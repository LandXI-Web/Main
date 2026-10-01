"""설계 7차 · 기관 분기 공간 — 그림(fig/*.html)은 1440 폭 전체로, 시안(mock/*.html)은 1440×900 으로,
지금 화면 두 장(광주전남 서비스 선택 · LX 관리자 기관 칸)은 로그인 폼으로 들어가 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r7/branch-space/shoot.py [이름 일부...] [--no-now] [--bg]
  --bg  예측 지도 시안의 바탕(여수 해안 25cm 항공을 약 2.7m 로 줄인 그림)을 shots/_bg/ 에 만든다(GDAL 필요 · GPU 안 씀).
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다. 바탕 그림도 shots/_bg/ 에만 둔다(이 영상은 밖으로 내보내지 않는 영상이라 저장소에 넣지 않는다).
비밀번호는 파일에 적지 않고 server/.env 에서 실행 때만 읽는다.
"""
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
MOCK = os.path.join(HERE, 'mock')
SHOTS = os.path.join(HERE, 'shots')
REPO = os.path.abspath(os.path.join(HERE, *(['..'] * 6)))
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')
LOGIN_ID = os.environ.get('LX_SHOOT_ID', 'lxadmin')   # 메일 아이디의 새 비밀번호는 대화로만 전해져 파일에 없다 — 같은 사람의 옛 아이디로 찍는다(LX_SHOOT_ID 로 바꿈)

FIGS = [
    ('01-space.html', 'space-1-one.png'),
    ('02-matching.html', 'space-2-matching.png'),
    ('03-tech.html', 'space-3-tech.png'),
    ('04-life.html', 'space-4-life.png'),
    ('05-examples.html', 'space-5-examples.png'),
]
MOCKS = [
    ('01-gj-select.html', 'new-gj-select.png'),
    ('02-gj-forecast.html', 'new-gj-forecast.png'),
    ('03-gj-guide.html', 'new-gj-guide.png'),
    ('04-admin-spaces.html', 'new-admin-spaces.png'),
]

# 예측 지도 시안 바탕 — 여수 해안(2025 항공 결과 100m 칸 · 이 PC 의 2023 항공 영상이 덮는 곳) · 웹 지도 좌표계 · 1368×836
BG_BBOX_LL = (127.7075, 34.5728, 127.7475, 34.5929)   # 서 · 남 · 동 · 북(경위도) — 영상이 덮는 곳 중 결과 칸이 가장 촘촘한 해안
BG_SIZE = (1368, 836)
VRT = os.path.join(os.path.dirname(REPO), '02. 데이터', '_work', 'ap25_2023_12130.vrt')
GDAL_BIN = os.environ.get('GDAL_BIN', 'C:/Users/User/anaconda3/envs/gcs/Library/bin')


def password() -> str:
    for name in ('.env', '.env.example'):
        p = os.path.join(REPO, 'server', name)
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                if line.strip().startswith('DEV_PASSWORD='):
                    return line.split('=', 1)[1].strip()
    raise SystemExit('비밀번호 설정을 찾지 못했습니다')


def make_bg():
    """GDAL 로 바탕 그림 한 장(CPU) — 원본을 약 2.7m 로 줄여 shots/_bg/yeosu-coast.jpg."""
    import math
    out_dir = os.path.join(SHOTS, '_bg')
    os.makedirs(out_dir, exist_ok=True)
    w, s, e, n = BG_BBOX_LL

    def merc(lon, lat):
        x = lon * 20037508.342789244 / 180
        y = math.log(math.tan((90 + lat) * math.pi / 360)) * 20037508.342789244 / math.pi
        return x, y
    x0, y0 = merc(w, s)
    x1, y1 = merc(e, n)
    env = dict(os.environ)
    env['PATH'] = GDAL_BIN + os.pathsep + env.get('PATH', '')
    share = os.path.join(os.path.dirname(GDAL_BIN), 'share')
    env.setdefault('GDAL_DATA', os.path.join(share, 'gdal'))
    env.setdefault('PROJ_LIB', os.path.join(share, 'proj'))
    tif = os.path.join(out_dir, 'yeosu-coast.tif')
    jpg = os.path.join(out_dir, 'yeosu-coast.jpg')
    subprocess.run([os.path.join(GDAL_BIN, 'gdalwarp'), '-overwrite', '-s_srs', 'EPSG:5186', '-t_srs', 'EPSG:3857',
                    '-te', str(x0), str(y0), str(x1), str(y1), '-ts', str(BG_SIZE[0]), str(BG_SIZE[1]),
                    '-r', 'average', '-multi', '-wo', 'NUM_THREADS=4', VRT, tif], check=True, env=env)
    subprocess.run([os.path.join(GDAL_BIN, 'gdal_translate'), '-of', 'JPEG', '-b', '1', '-b', '2', '-b', '3',
                    '-co', 'QUALITY=86', tif, jpg], check=True, env=env)
    os.remove(tif)
    print('바탕', jpg)


def shoot_static(b, folder, jobs, only, full):
    for src, out in jobs:
        if only and not any(o in src or o in out for o in only):
            continue
        pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        pg.goto('file:///' + os.path.join(folder, src).replace('\\', '/'))
        pg.wait_for_timeout(900)  # 서체
        pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
        pg.close()
        print('찍음', out)


def shoot_now(b, only):
    pw = password()
    want = lambda name: not only or any(o in name for o in only)  # noqa: E731
    if want('now-gj-select.png'):
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.goto(BASE + '/landxi/v3/gov-home/?org=gwangju-jeonnam')     # 광주전남 메인(그 기관 모습의 로그인)
        pg.wait_for_selector('.gh-form input[type=text]', timeout=60000)
        pg.fill('.gh-form input[type=text]', LOGIN_ID)
        pg.fill('.gh-form input[type=password]', pw)
        pg.click('button.gh-go')
        pg.wait_for_url(lambda u: 'gov-home' not in u, timeout=60000)
        pg.goto(BASE + '/landxi/v3/gov-select/?list=1')               # 서비스 선택(바로 넘기지 않음)
        pg.wait_for_selector('.gs-card', timeout=60000)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=os.path.join(SHOTS, 'now-gj-select.png'))
        print('찍음 now-gj-select.png')
        ctx.close()
    if want('now-admin-tenants.png'):
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.goto(BASE + '/landxi/v3/login/?site=admin')
        pg.wait_for_selector('#id', timeout=60000)
        pg.fill('#id', LOGIN_ID)
        pg.fill('#pw', pw)
        pg.click('#go')
        pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
        pg.goto(BASE + '/landxi/v3/ops-infra/#/tenants')
        for _ in range(3):
            try:
                pg.wait_for_selector('#pane-tenants .org', state='visible', timeout=60000)
                break
            except Exception:  # noqa: BLE001
                again = pg.get_by_text('다시 시도')
                if again.count():
                    again.first.click()
        pg.wait_for_timeout(2500)
        pg.screenshot(path=os.path.join(SHOTS, 'now-admin-tenants.png'))
        print('찍음 now-admin-tenants.png')
        ctx.close()


def main(argv):
    only = [a for a in argv if not a.startswith('--')]
    os.makedirs(SHOTS, exist_ok=True)
    if '--bg' in argv:
        make_bg()
    with sync_playwright() as p:
        b = p.chromium.launch()
        shoot_static(b, FIG, FIGS, only, True)
        shoot_static(b, MOCK, MOCKS, only, False)
        if '--no-now' not in argv:
            shoot_now(b, only)
        b.close()


if __name__ == '__main__':
    main(sys.argv[1:])
