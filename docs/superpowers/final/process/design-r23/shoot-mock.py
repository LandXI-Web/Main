"""설계 23차 시안 촬영 — staff-dash-5 · train-flow-3 를 바깥 주소에서 PC 1440 으로 찍는다('시안' 도장 · 서버 호출 0 · 로그인 없음).
그림마다 찍은 시각을 파일 이름과 각 폴더의 log-mock.json 에 남긴다(원칙 162). 사용: python shoot-mock.py [dash|train]"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://app.land-xi.dev/landxi/proto/review/mock/'
JOBS = {
    'dash': ('staff-dash-5', [
        ('index.html', 'mock-dash5-1440', 900, None, '시안 PC 1440×900 첫 화면 — ① 내 분석 결과 3×3 · ② 진행 현황 · 작업 · 요청함 · ③ 저장 용량 · 공지 · 메모'),
        ('index.html', 'mock-dash5-full-1440', 1260, None, '시안 세로 전체(1440×1260 창) — ④ 전국 AI 현황 · 최근 프로젝트까지'),
        ('index.html', 'mock-dash5-grid-hover', 900, 'hover:.sd4-cell:nth-child(5)', '격자 다섯째 칸(비닐하우스 · 증평군)에 올려 결과 도형이 드러난 뒤'),
    ]),
    'train': ('train-flow-3', [
        ('index.html', 'f1-done-1440', 900, None, '시안 PC 1440×900 — 10-08 에 끝난 이 프로젝트 학습: 흐름 판 · 반복마다 정확도 그래프 · 핵심 수치'),
        ('index.html', 'f2-done-full-1440', 1260, None, '시안 세로 전체 — 아래 학습 이력 목록(판 · 날짜 · AI 모델 정확도 · 학습 데이터 n장)'),
        ('index.html?v=live', 'f3-live-1440', 900, None, "시안 — 같은 학습이 도는 중일 때(20회 중 12회째 · 그래프가 차오름) · 지금 도는 학습이 없어 '시안' 표시"),
        ('index.html', 'f4-drawer-cfg-1440', 900, 'click:.node[data-id="cfg1"]', '학습 설정 블록을 눌러 오른쪽 서랍이 열린 모습(반복 · 크기 · 한 번에 · GPU 한 줄)'),
    ]),
}

def shoot(which):
    folder, lst = JOBS[which]; shots = os.path.join(HERE, folder, 'shots'); os.makedirs(shots, exist_ok=True); log = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for qs, name, h, act, note in lst:
            ctx = b.new_context(viewport={'width': 1440, 'height': h}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(BASE + folder + '/' + qs, wait_until='load', timeout=90000); pg.wait_for_timeout(3600)
            if act:
                kind, sel = act.split(':', 1)
                if kind == 'hover': pg.hover(sel); pg.wait_for_timeout(1000)
                if kind == 'click': pg.click(sel); pg.wait_for_timeout(600)
            t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
            pg.screenshot(path=os.path.join(shots, out))
            log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + folder + '/' + qs, 'viewport': [1440, h], 'note': note, 'errors': errs}); print('찍음', out, errs or '이상 없음')
            ctx.close()
        b.close()
    json.dump(log, open(os.path.join(HERE, folder, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    for w in (sys.argv[1:] or ['dash', 'train']): shoot(w)
