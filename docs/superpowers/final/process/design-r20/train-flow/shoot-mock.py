"""설계 20차(train-flow) 시안 촬영 — landxi/proto/review/mock/train-flow/ 를 PC 1440 으로 찍는다('시안' 도장 · 서버 호출 0 · 로그인 없음).
그림마다 찍은 시각을 파일 이름과 log-mock.json 에 남긴다(원칙 162). 사용: python shoot-mock.py [--local] [이름 일부...]"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = '--local' in sys.argv
BASE = ('http://127.0.0.1:4173' if LOCAL else 'https://app.land-xi.dev') + '/landxi/proto/review/mock/train-flow/index.html'
SHOTS = os.environ.get('SHOTS_DIR') if LOCAL else os.path.join(HERE, 'shots')
LIST = [('?v=start', 'f1-start'), ('?v=run', 'f2-run-lineage'), ('?v=settings', 'f3-settings-test'), ('?v=wrong', 'f4-wrong-link')]

def shoot(only):
    os.makedirs(SHOTS, exist_ok=True); log = []
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
        for qs, name in LIST:
            if only and not any(o in qs or o in name for o in only): continue
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(BASE + qs, wait_until='domcontentloaded', timeout=90000); pg.wait_for_selector('.node', timeout=90000); pg.wait_for_timeout(2500); pg.wait_for_timeout(1200)
            t = datetime.datetime.now(); out = f"{name}-1440-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(SHOTS, out))
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + qs, 'errors': errs}); print('찍음', out, errs or '이상 없음')
        b.close()
    if not LOCAL: json.dump(log, open(os.path.join(HERE, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); shoot([a for a in sys.argv[1:] if not a.startswith('--')])
