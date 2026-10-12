"""설계 24차 시안 촬영 — staff-dash-6 · train-template 을 바깥 주소에서 PC 1440 으로 찍는다('시안' 도장 · 서버 호출 0 · 로그인 없음).
그림마다 찍은 시각을 파일 이름과 각 폴더의 log-mock.json 에 남긴다(원칙 162). 사용: python shoot-mock.py [dash|train]"""
import json, os, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://app.land-xi.dev/landxi/proto/review/mock/'
JOBS = {
    'dash': ('staff-dash-6', 'staff-dash-6', [
        ('index.html', 'mock-dash6-1440', 900, None, False, '시안 PC 1440×900 첫 화면 — ① 내 분석 결과 3×3(전체 폭) · 아래로 ② 진행 현황 다섯 칸'),
        ('index.html', 'mock-dash6-full-1440', 900, None, True, '시안 세로 전체(1440 · 끝까지) — ①→② 진행 현황(다섯 칸) → ③ 내가 돌린 작업 · 요청함 → ④ 저장 용량 → ⑤ 공지 · 메모 · 전국 AI 현황 · 최근 프로젝트'),
        ('index.html?stages=6', 'mock-dash6-stages6-1440', 900, 'scroll:#sd6-board', False, "진행 현황 '여섯 칸'(결과 확인 칸 둠) — 단추로 바꿔 본 모습"),
        ('index.html', 'mock-dash6-stages5-1440', 900, 'scroll:#sd6-board', False, "진행 현황 '다섯 칸'(결과 확인 칸 뺌 · 기본) — 같은 자리"),
        ('index.html', 'mock-dash6-grid-hover', 900, 'hover:.sd4-cell:nth-child(5)', False, '격자 다섯째 칸(비닐하우스 · 증평군)에 올려 결과 도형이 드러난 뒤'),
    ]),
    'train': ('train-template', 'train-template', [
        ('index.html', 'template-explainer-1440', 900, None, True, '학습 서식 설명 그림 한 장 — 놓여 있는 기본 흐름 · 블록마다 직원이 바꿀 수 있는 것 / 없는 것(관리자 영역) · 선택지 ⓐ 값만 · ⓑ 블록까지'),
    ]),
}

def shoot(which):
    folder, out_dir, lst = JOBS[which]; shots = os.path.join(HERE, out_dir, 'shots'); os.makedirs(shots, exist_ok=True); log = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for qs, name, h, act, full, note in lst:
            ctx = b.new_context(viewport={'width': 1440, 'height': h}, device_scale_factor=1, locale='ko-KR'); pg = ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
            pg.goto(BASE + folder + '/' + qs, wait_until='load', timeout=90000); pg.wait_for_timeout(3600)
            if act:
                kind, sel = act.split(':', 1)
                if kind == 'hover': pg.hover(sel); pg.wait_for_timeout(1000)
                if kind == 'click': pg.click(sel); pg.wait_for_timeout(600)
                if kind == 'scroll': pg.eval_on_selector(sel, 'e => e.scrollIntoView({block:"start"})'); pg.wait_for_timeout(900)
            t = datetime.datetime.now(); out = f"{name}-{t:%H%M}.png"
            if full and which == 'dash':
                # 세로 전체 — 스크롤 영역(.ld)이 안쪽이라 창 높이를 문서 높이로 늘려 한 장에
                total = pg.evaluate('document.querySelector(".ld-in").scrollHeight + 64 + 24 + 40')
                ctx2 = b.new_context(viewport={'width': 1440, 'height': int(total)}, device_scale_factor=1, locale='ko-KR'); pg2 = ctx2.new_page()
                pg2.goto(BASE + folder + '/' + qs, wait_until='load', timeout=90000); pg2.wait_for_timeout(3600)
                pg2.screenshot(path=os.path.join(shots, out)); ctx2.close()
                log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + folder + '/' + qs, 'viewport': [1440, int(total)], 'note': note, 'errors': errs})
            else:
                pg.screenshot(path=os.path.join(shots, out), full_page=full)
                log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': BASE + folder + '/' + qs, 'viewport': [1440, h], 'full_page': full, 'note': note, 'errors': errs})
            print('찍음', out, errs or '이상 없음')
            ctx.close()
        b.close()
    json.dump(log, open(os.path.join(HERE, out_dir, 'log-mock.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    for w in (sys.argv[1:] or ['dash', 'train']): shoot(w)
