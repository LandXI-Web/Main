"""설계 4차 시안 촬영 — mock/*.html 을 1440×900 으로 찍어 shots/new-*.png 로, 기존 캡처는 shots/now-*.png 로 복사.
사용: python docs/superpowers/final/process/design-r4/shoot.py [이름 일부...]
"""
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..'))
MOCK = os.path.join(HERE, 'mock')
SHOTS = os.path.join(HERE, 'shots')
R3 = os.path.join(HERE, '..', 'design-r3', 'shots')
R2 = os.path.join(HERE, '..', 'design-r2', 'shots')
UX = os.path.join(HERE, '..', 'uiux-ref', 'shots')

# 바뀐 뒤 시안: (mock 파일, 결과 이름, 크기)
NEW = [
    ('01a-namwon.html', 'new-1-a-namwon.png', (1440, 900)),
    ('01a-gwangju.html', 'new-1-a-gwangju.png', (1440, 900)),
    ('01b-namwon.html', 'new-1-b-namwon.png', (1440, 900)),
    ('01b-gwangju.html', 'new-1-b-gwangju.png', (1440, 900)),
    ('02-staff-upload.html', 'new-2-staff-upload.png', (1440, 900)),
    ('02-gov-upload.html', 'new-2-gov-upload.png', (1440, 900)),
    ('03-admin-approve.html', 'new-3-admin-approve.png', (1440, 900)),
    ('03-admin-approve.html?reject', 'new-3-admin-reject.png', (1440, 900)),
    ('04-now.html', 'now-4-various.png', (1440, 900)),
    ('04-wait.html', 'new-4-wait.png', (1440, 900)),
    ('04-empty.html', 'new-4-empty.png', (1440, 900)),
    ('04-error.html', 'new-4-error.png', (1440, 900)),
    ('05-gov-flag.html', 'new-5-gov-flag.png', (1440, 900)),
    ('05-staff-inbox.html', 'new-5-staff-inbox.png', (1440, 900)),
    ('06-flow.html', 'new-6-flow.png', (1440, 710)),  # 내용에 맞춘 높이(아래 빈 칸 없음)
    ('06-project-new.html', 'new-6-project-new.png', (1440, 900)),
    ('06-publish-request.html', 'new-6-publish-request.png', (1440, 900)),
    ('L1-step.html', 'new-L1-step.png', (1440, 900)),
]

# 바깥 화면(지금 있는 것 그대로): 옛 라벨링 작업공간(개발 서버 :4173) · AXIS-Label 정적 화면(서버 없이 파일만 내주는 임시 정적 서버 — GPU·API 없음)
AXIS_DIR = 'E:/Auto_Label_project'
# (주소, 결과 이름, 정적으로 내줄 폴더(없으면 None), 페이지 열기 전에 넣을 브라우저 저장값 — 옛 화면은 로그인 표시가 있어야 열림)
OLD_SESSION = "try{localStorage.setItem('lx_logged_in','1');localStorage.setItem('lx_role','staff')}catch(e){}"
EXT = [
    ('http://127.0.0.1:4173/landxi/proto/ai-project-label.html', 'now-L1-old-label-workspace.png', None, OLD_SESSION),
    ('http://127.0.0.1:4198/static/index.html', 'now-L1-axis-label.png', AXIS_DIR, None),
]

# 지금 화면: 기존 캡처를 now-*.png 로(지어내지 않고 이미 찍힌 것만)
NOW = [
    (os.path.join(R3, 'gov-home.jpg'), 'now-1-gov-namwon-landxi-look.png'),
    (os.path.join(R3, 'staff-console.jpg'), 'now-1-landxi-staff.png'),
    (os.path.join(R2, 'old-D4-portal-namwon.jpg'), 'now-1-old-portal-namwon.png'),
    (os.path.join(R2, 'old-D4-portal-login-gj.jpg'), 'now-1-old-portal-login-gj.png'),
    (os.path.join(R3, 'staff-ingest-1-영상등록.jpg'), 'now-2-staff-upload.png'),
    (os.path.join(R3, 'gov-home-1-올리기.jpg'), 'now-2-gov-upload.png'),
    (os.path.join(UX, 'S2-02-approvals.jpg'), 'now-3-admin-approvals-stuck.png'),
    (os.path.join(R2, 'old-D2-publish-admin.jpg'), 'now-3-old-publish-admin.png'),
    (os.path.join(R3, 'gov-report-2-판정.jpg'), 'now-5-gov-judge.png'),
    (os.path.join(R3, 'staff-console.jpg'), 'now-5-staff-count-only.png'),
    (os.path.join(R3, 'staff-console-2-서비스만들기.jpg'), 'now-6-staff-make-service.png'),
    (os.path.join(R2, 'old-D2-project.jpg'), 'now-6-old-project.png'),
    (os.path.join(UX, 'S1-09-model-card.jpg'), 'now-L1-train-label-link.png'),
]

# 나란히(세 장): Land-XI 직원 화면(지금 캡처) · 남원 · 광주전남
TRIO = [
    (['now-1-landxi-staff.png', 'new-1-a-namwon.png', 'new-1-a-gwangju.png'], 'new-1-a-three.png'),
    (['now-1-landxi-staff.png', 'new-1-b-namwon.png', 'new-1-b-gwangju.png'], 'new-1-b-three.png'),
    (['now-L1-train-label-link.png', 'now-L1-old-label-workspace.png', 'now-L1-axis-label.png'], 'now-L1-three.png'),
]


def ext(only):
    import subprocess
    import time
    procs = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for url, out, serve_dir, init in EXT:
                if only and not any(o in out for o in only):
                    continue
                if serve_dir:
                    port = url.split(':')[2].split('/')[0]
                    procs.append(subprocess.Popen([sys.executable, '-m', 'http.server', port, '--directory', serve_dir, '--bind', '127.0.0.1'],
                                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
                    time.sleep(1.2)
                pg = b.new_page(viewport={'width': 1440, 'height': 900})
                if init:
                    pg.add_init_script(init)
                try:
                    pg.goto(url, wait_until='load', timeout=15000)
                    pg.wait_for_timeout(2500)
                    pg.screenshot(path=os.path.join(SHOTS, out))
                    print('바깥 화면', out)
                except Exception as e:  # 서버가 없으면 건너뜀(지어내지 않음)
                    print('못 찍음', out, str(e)[:80])
                pg.close()
            b.close()
    finally:
        for pr in procs:
            pr.terminate()


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out, (w, h) in NEW:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(MOCK, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(600)  # 서체·이미지
            pg.screenshot(path=os.path.join(SHOTS, out))
            pg.close()
            print('찍음', out)
        b.close()


def copy_now(only):
    for src, out in NOW:
        if only and not any(o in out for o in only):
            continue
        if not os.path.exists(src):
            print('없음', src)
            continue
        Image.open(src).convert('RGB').save(os.path.join(SHOTS, out))
        print('복사', out)


def trio(only):
    for parts, out in TRIO:
        if only and not any(o in out for o in only):
            continue
        ims = []
        for n in parts:
            fp = os.path.join(SHOTS, n)
            if not os.path.exists(fp):
                ims = []
                break
            ims.append(Image.open(fp).convert('RGB'))
        if not ims:
            print('건너뜀', out)
            continue
        gap, w = 16, 469
        h = round(w * 900 / 1440)
        canvas = Image.new('RGB', (w * 3 + gap * 2, h), (242, 244, 246))
        for i, im in enumerate(ims):
            canvas.paste(im.resize((w, h), Image.LANCZOS), (i * (w + gap), 0))
        canvas.save(os.path.join(SHOTS, out))
        print('나란히', out)


if __name__ == '__main__':
    only = sys.argv[1:]
    copy_now(only)
    ext(only)
    shoot(only)
    trio(only)
