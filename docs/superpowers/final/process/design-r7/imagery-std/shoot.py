"""설계 7차 · 영상 표준 하나로 — 그림(fig/*.html)을 1440 폭 전체로 찍어 shots/ 에 둔다.
사용: python docs/superpowers/final/process/design-r7/imagery-std/shoot.py [이름 일부...] [--chips]
  --chips  압축 비교 조각(shots/_chips/)을 공개 영상에서 새로 만든다 — 제주시 원도심 드론(OpenAerialMap · CC BY 4.0 ·
           제공 Jeju Urban Regeneration Center)의 가운데 한 곳을 4cm 로 읽어 압축 방식별로 바꾼 뒤 같은 자리를 4배로 키워 잘라 둔다.
           인터넷 · GDAL 필요 · GPU 안 씀. 우리 영상(항공 · 드론 · ECW)은 밖으로 내보내지 않는 영상이라 조각을 만들지 않는다 — 수치 · 막대로만.
shots/ 는 gitignore — 확인 요청 페이지 생성 때 복사한다.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = os.path.join(HERE, 'fig')
SHOTS = os.path.join(HERE, 'shots')
CHIPS = os.path.join(SHOTS, '_chips')
GDAL_BIN = os.environ.get('GDAL_BIN', 'C:/Users/User/anaconda3/envs/gcs/Library/bin')

FIGS = [
    ('01-flow.html', 'std-1-flow.png'),
    ('02-diet.html', 'std-2-diet.png'),
    ('03-chips.html', 'std-3-chips.png'),
    ('04-manage.html', 'std-4-manage.png'),
    ('05-ecw.html', 'std-5-ecw.png'),
]

PUBLIC = ('/vsicurl/https://oin-hotosm-temp.s3.us-east-1.amazonaws.com/'
          '6a2d26a591730de10f6b6833/0/6a2d26a591730de10f6b6834.tif')   # 제주시 원도심 · 1cm · CC BY 4.0
VARIANTS = [('deflate', ['COMPRESS=DEFLATE', 'PREDICTOR=YES']), ('jpeg90', ['COMPRESS=JPEG', 'QUALITY=90']),
            ('jpeg80', ['COMPRESS=JPEG', 'QUALITY=80']), ('webp80', ['COMPRESS=WEBP', 'QUALITY=80']),
            ('jpeg60', ['COMPRESS=JPEG', 'QUALITY=60'])]
CROP = (176, 1688, 128, 104)   # 2048칸 조각 안의 자리(주차된 차 모서리 · 맨홀 · 아스팔트) — 4배로 키워 둔다
ZOOM = 4


def make_chips():
    import numpy as np
    import rasterio
    import cv2
    from rasterio.windows import Window
    from skimage.metrics import structural_similarity as ssim
    os.makedirs(CHIPS, exist_ok=True)
    src = os.path.join(CHIPS, '_src.tif')
    with rasterio.open(PUBLIC, overview_level=1) as d:           # 1cm 의 4분의 1 = 4cm(드론 결과물과 비슷한 해상도)
        win = Window(d.width // 2 - 1024, d.height // 2 - 1024, 2048, 2048)
        ref = d.read(window=win)
        prof = dict(driver='GTiff', width=2048, height=2048, count=3, dtype='uint8', crs=d.crs, transform=d.window_transform(win))
    with rasterio.open(src, 'w', **prof) as o:
        o.write(ref)
    env = dict(os.environ, GDAL_DATA=os.path.join(os.path.dirname(GDAL_BIN), 'share', 'gdal'))
    x, y, w, h = CROP

    def cut(arr, name):
        c = np.transpose(arr[:, y:y + h, x:x + w], (1, 2, 0))
        c = cv2.resize(c, (w * ZOOM, h * ZOOM), interpolation=cv2.INTER_NEAREST)
        ok, buf = cv2.imencode('.png', cv2.cvtColor(c, cv2.COLOR_RGB2BGR))   # 한글 경로 — imwrite 대신 바이트로 쓴다
        with open(os.path.join(CHIPS, name + '.png'), 'wb') as f:
            f.write(buf.tobytes())
    cut(ref, 'orig')
    out = {'raw_bytes': int(ref.size)}
    for name, co in VARIANTS:
        dst = os.path.join(CHIPS, f'_{name}.tif')
        cmd = [os.path.join(GDAL_BIN, 'gdal_translate.exe'), '-q', '-of', 'COG', '-co', 'BLOCKSIZE=512',
               '-co', 'OVERVIEW_RESAMPLING=AVERAGE', '-co', 'NUM_THREADS=4']
        for c in co:
            cmd += ['-co', c]
        subprocess.run(cmd + [src, dst], check=True, env=env)
        with rasterio.open(dst) as d:
            b = d.read()
        mse = float(((ref.astype('float64') - b) ** 2).mean())
        ya = 0.299 * ref[0] + 0.587 * ref[1] + 0.114 * ref[2]
        yb = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]
        out[name] = {'bytes': os.path.getsize(dst), 'psnr': None if mse == 0 else round(10 * float(np.log10(255 ** 2 / mse)), 1),
                     'ssim': round(float(ssim(ya, yb, data_range=255)), 3)}
        cut(b, name)
        os.remove(dst)
        print('조각', name, out[name])
    os.remove(src)
    with open(os.path.join(CHIPS, 'chips.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def shoot(only):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out in FIGS:
            if only and not any(o in src or o in out for o in only):
                continue
            pg = b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
            pg.goto('file:///' + os.path.join(FIG, src).replace('\\', '/'))
            pg.wait_for_timeout(900)  # 서체
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=True)
            pg.close()
            print('찍음', out)
        b.close()


if __name__ == '__main__':
    argv = sys.argv[1:]
    os.makedirs(SHOTS, exist_ok=True)
    if '--chips' in argv:
        make_chips()
    shoot([a for a in argv if not a.startswith('--')])
