"""설계 25차 시안 촬영 — staff-dash-7(A안 · B안)을 바깥 주소에서 PC 1440 으로 찍는다('시안' 도장 · 서버 호출 0 · 로그인 없음).
그림마다 찍은 시각을 파일 이름과 폴더의 log-mock.json 에 남긴다(원칙 162). 사용: python shoot-mock.py"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://app.land-xi.dev/landxi/proto/review/mock/staff-dash-7/'
LST = [
    ('index.html?plan=A', 'mock-dash7-A-1440', False, None, 'A안 · PC 1440×900 첫 화면 — 위 격자 3×3 크게, 아래 진행 현황 띠가 보이기 시작'),
    ('index.html?plan=A', 'mock-dash7-A-full-1440', True, None, 'A안 · 세로 전체 — 격자 → 진행 현황 띠 → 작업 · 요청함 · 저장 용량 띠 → 공지 · 메모 · 최근 프로젝트 · 전국 AI 현황 한 줄'),
    ('index.html?plan=B', 'mock-dash7-B-1440', False, None, 'B안 · PC 1440×900 한 화면 — 격자 3×3(더 낮게) → 한 줄에 진행 현황 + 작업 · 요청함 · 저장 용량 → 소식 한 줄(스크롤 없음)'),
    ('index.html?plan=B&stages=6', 'mock-dash7-B-stages6-1440', False, None, "B안 · 진행 현황 '여섯 칸'(결과 확인 칸 둠)"),
    ('index.html?plan=A', 'mock-dash7-A-grid-hover', False, 'hover:.sd4-cell:nth-child(5)', 'A안 · 격자 다섯째 칸(비닐하우스 · 증평군)에 올려 결과 도형이 드러난 뒤'),
]

def main():
    shots = os.path.join(HERE, 'staff-dash-7', 'shots'); os.makedirs(shots, exist_ok=True); log = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for qs, name, full, act, note in LST:
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(BASE + qs, wait_until='load', timeout=90000); pg.wait_for_timeout(3600)
            if act:
                kind, sel = act.split(':', 1)
                if kind == 'hover': pg.hover(sel); pg.wait_for_timeout(1000)
            t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
            sh = pg.evaluate('document.querySelector(".ld").scrollHeight')
            if full:
                total = sh + 64
                ctx2 = b.new_context(viewport={'width': 1440, 'height': int(total)}, device_scale_factor=1, locale='ko-KR'); pg2 = ctx2.new_page()
                pg2.goto(BASE + qs, wait_until='load', timeout=90000); pg2.wait_for_timeout(3600)
                pg2.screenshot(path=os.path.join(shots, out)); ctx2.close()
                log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + qs, 'viewport': [1440, int(total)], 'content_height': sh, 'note': note, 'errors': errs})
            else:
                pg.screenshot(path=os.path.join(shots, out))
                log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + qs, 'viewport': [1440, 900], 'content_height': sh, 'note': note, 'errors': errs})
            print('찍음', out, '본문 높이', sh, errs or '이상 없음')
            ctx.close()
        b.close()
    json.dump(log, open(os.path.join(HERE, 'staff-dash-7', 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); main()
