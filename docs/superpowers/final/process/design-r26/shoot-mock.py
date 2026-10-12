"""설계 26차 시안 촬영 — staff-dash-8(판 하나)과 data-concept/data-map.html 을 바깥 주소에서 PC 1440 으로 찍는다('시안' 도장 · 서버 호출 0 · 로그인 없음).
그림마다 찍은 시각을 파일 이름과 폴더의 log-mock.json 에 남긴다(원칙 162). 사용: python shoot-mock.py [dash|map|all]"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://app.land-xi.dev/landxi/proto/review/mock/staff-dash-8/'
MAP = 'https://app.land-xi.dev/landxi/proto/review/mock/data-map/index.html'
DASH = [
    ('index.html', 'mock-dash8-1440', False, None, '8차 · PC 1440×900 첫 화면 — 위 진행 현황 → 작업 · 요청함 · 저장 용량 → 아래 최근 진행한 프로젝트 카드가 보이기 시작'),
    ('index.html', 'mock-dash8-full-1440', True, None, '8차 · 세로 전체 — 진행 현황 → 숫자 칸 → 최근 진행한 프로젝트 4장 → 공지 · 메모 · 전국 AI 현황 한 줄'),
    ('index.html?stages=6', 'mock-dash8-stages6-1440', False, None, "8차 · 진행 현황 '여섯 칸'(결과 확인 칸 둠)"),
]

def shoot(b, url, name, full, note, outdir, log):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    pg.goto(url, wait_until='load', timeout=90000); pg.wait_for_timeout(3600)
    t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
    sh = pg.evaluate('(document.querySelector(".ld") || document.body).scrollHeight')
    if full:
        ctx2 = b.new_context(viewport={'width': 1440, 'height': int(sh + 64)}, device_scale_factor=1, locale='ko-KR'); pg2 = ctx2.new_page()
        pg2.goto(url, wait_until='load', timeout=90000); pg2.wait_for_timeout(3600)
        pg2.screenshot(path=os.path.join(outdir, out)); ctx2.close()
        log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': url, 'viewport': [1440, int(sh + 64)], 'content_height': sh, 'note': note, 'errors': errs})
    else:
        pg.screenshot(path=os.path.join(outdir, out))
        log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': url, 'viewport': [1440, 900], 'content_height': sh, 'note': note, 'errors': errs})
    print('찍음', out, '본문 높이', sh, errs or '이상 없음'); ctx.close()

def main(which):
    with sync_playwright() as p:
        b = p.chromium.launch()
        if which in ('dash', 'all'):
            shots = os.path.join(HERE, 'staff-dash-8', 'shots'); os.makedirs(shots, exist_ok=True); log = []
            for qs, name, full, act, note in DASH: shoot(b, BASE + qs, name, full, note, shots, log)
            json.dump(log, open(os.path.join(HERE, 'staff-dash-8', 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if which in ('map', 'all'):
            d = os.path.join(HERE, 'data-concept'); os.makedirs(d, exist_ok=True); log = []
            shoot(b, MAP, 'data-map', True, '데이터 개념 진단 — 들어오는 곳 · 보이는 곳 · 쓰는 사람 표 한 장(겹침은 빨간 표시)', d, log)
            os.replace(os.path.join(d, log[0]['file']), os.path.join(d, 'data-map.png')); log[0]['file'] = 'data-map.png'
            json.dump(log, open(os.path.join(d, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        b.close()

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); main(sys.argv[1] if len(sys.argv) > 1 else 'all')
