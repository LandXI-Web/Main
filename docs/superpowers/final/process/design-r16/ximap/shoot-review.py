"""설계 16차(ximap) — 지금 XI맵(landxi/v3/xi-clean)을 바깥 주소에서 LX 직원 로그인 폼으로 열어 기능을 하나씩 눌러 찍는다(리뷰용 · 원칙 162).
로그인은 한 번만(바깥 로그인 10분 20회 제한) · 같은 브라우저 문맥으로 모든 화면. GPU 작업 실행 0(분석 도구는 열기만 · 실행 안 누름). 코드 수정 0.
사용: python docs/superpowers/final/process/design-r16/ximap/shoot-review.py
"""
import json, os, re, sys, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..', '..', '..'))
SHOTS = os.path.join(HERE, 'shots')
HOST = 'https://app.land-xi.dev'
XI = HOST + '/landxi/v3/xi-clean/index.html'
PC = (1440, 900)

def pw_of():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if not pw:
        env = open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read()
        pw = re.search(r'^DEV_PASSWORD=(.*)$', env, re.M).group(1).strip().strip('"')
    return pw

def wait_ready(pg, ms=90000):
    try:
        pg.wait_for_function("() => window.__xc && window.__xc.boot && window.__xc.boot.shown", timeout=ms)
    except Exception:
        pass
    pg.wait_for_timeout(2500)

def tool(pg, label):
    pg.evaluate("(l) => { const el = [...document.querySelectorAll('nav[aria-label=\"도구\"] .k-rail-i')].find(e => e.textContent.trim() === l); if (el) el.click(); return !!el; }", label)
    pg.wait_for_timeout(2200)

def main():
    os.makedirs(SHOTS, exist_ok=True)
    log = []
    def shot(pg, name, note):
        t = datetime.datetime.now()
        out = f"{name}-1440-{t:%H%M}.png"
        pg.screenshot(path=os.path.join(SHOTS, out))
        txt = pg.evaluate("() => document.body.innerText.slice(0, 4000)")
        log.append({'file': out, 'shot_at': t.isoformat(timespec='seconds'), 'url': pg.url, 'note': note, 'text_head': txt[:600]})
        print('찍음', out, '·', note)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': PC[0], 'height': PC[1]}, device_scale_factor=1, locale='ko-KR')
        pg = ctx.new_page()
        pg.goto(XI, wait_until='domcontentloaded')
        pg.wait_for_url(re.compile(r'/landxi/v3/login/'), timeout=30000)
        pg.wait_for_selector('#id', timeout=30000)
        shot(pg, 'r0-login', '로그인 화면(바깥 주소)')
        pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw_of()); pg.click('#go')   # 로그인 1회
        pg.wait_for_url(re.compile(r'xi-clean'), timeout=60000)
        wait_ready(pg)
        shot(pg, 'r1-arrive', 'LX 직원 도착 — 지역 없이 전국')
        # 시군구 하나(무주군 52730 · 결과 있는 곳)
        pg.goto(XI + '?region=52730', wait_until='domcontentloaded'); wait_ready(pg)
        shot(pg, 'r2-region-muju', '시군구 하나로 — 큰 숫자 + 결과 점 + 읍면동 막대')
        tool(pg, '층'); shot(pg, 'r3-tool-layers', '도구 층')
        tool(pg, '층')
        tool(pg, '가르기'); shot(pg, 'r4-tool-swipe', '도구 가르기')
        tool(pg, '가르기')
        tool(pg, '입체'); shot(pg, 'r5-tool-tilt', '도구 입체')
        tool(pg, '입체')
        tool(pg, '보고서'); shot(pg, 'r6-tool-report', '도구 보고서')
        tool(pg, '보고서')
        tool(pg, '분석'); shot(pg, 'r7-tool-analyze', '도구 분석(전역 분석 · 실행 안 함)')
        # 영상 없는 시군구(서울 종로구 11110)
        pg.goto(XI + '?region=11110', wait_until='domcontentloaded'); wait_ready(pg)
        tool(pg, '분석'); shot(pg, 'r8-region-no-imagery', '영상 등록이 없는 시군구에서 분석 도구')
        # 검색 — 시군구 · 지번 · 문장 한 칸(보내지 않음)
        pg.goto(XI + '?region=52730', wait_until='domcontentloaded'); wait_ready(pg)
        try:
            pg.click('header input, .k-mast input', timeout=5000)
            pg.keyboard.type('구례군 2021년과 2025년 비닐하우스 변화 보여 줘')
            pg.wait_for_timeout(1200)
            shot(pg, 'r9-search-ask', '검색 칸에 변화 질문을 쳤을 때(보내지 않음)')
        except Exception as e:
            print('검색 칸 없음', e)
        # 해외(글로벌) 화면 — 같은 세션으로 열리나
        pg.goto(HOST + '/landxi/v3/global/index.html', wait_until='domcontentloaded')
        pg.wait_for_timeout(9000)
        shot(pg, 'r10-global', '해외 화면(landxi/v3/global) — LX 직원 세션으로')
        b.close()
    json.dump(log, open(os.path.join(HERE, 'log-review.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
