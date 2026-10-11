"""외부 검수 3차 보완 b — 증거. 바깥 주소(app.land-xi.dev) · 실제 GPU 브라우저(Chrome 창) · LX 직원 로그인 폼 한 번.
지도 서비스: 두 레이어(남원 비닐하우스 · 여주 하거동 주차장)를 켠 채 XI ChatGEO 시험 질문 4개(시험 표시 · 게이트웨이 경로 · 모델 호출 없는 직행)
 → 조건 칩 · 답 첫 줄(대상 · 조건 · 수) · 칩 하나 풀기 · 목록 보기(키보드 Enter) · 콘솔 오류. 데이터는 바꾸지 않는다.
사용: python docs/superpowers/final/process/impl-15/gpt-b/shoot.py"""
import os, re, json, datetime
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, *['..'] * 6))
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
HOST = 'https://app.land-xi.dev'
pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD') or re.search(r'^DEV_PASSWORD=(.*)$', open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8').read(), re.M).group(1).strip().strip('"')
log = {'chat': []}


def shot(pg, name, note):
    t = datetime.datetime.now(); pg.screenshot(path=os.path.join(SHOTS, name))
    log[name] = {'shot_at': t.strftime('%Y-%m-%d %H:%M:%S'), 'url': pg.url.split('#')[0].split('?')[0], 'note': note}; print('찍음', name)


def ask(pg, q):
    box = pg.locator('.k-ck')
    if not box.is_visible():
        pg.get_by_text('XI ChatGEO', exact=True).first.click()
    pg.locator('.k-ck-i').fill(q)
    t0 = pg.evaluate('performance.now()')
    pg.locator('.k-ck-i').press('Enter')
    pg.wait_for_function("() => ['done', 'failed', 'rejected'].includes(document.querySelector('.k-ck')?.dataset.state)", timeout=120000)
    pg.wait_for_timeout(900)
    ans = pg.locator('.k-ck-a').last.inner_text()
    flt = pg.locator('.lm-flt').inner_text() if pg.locator('.lm-flt').count() else None
    ms = pg.evaluate('(t0) => window.__lm.filterAt ? Math.round(window.__lm.filterAt - t0) : null', t0)
    log['chat'].append({'q': q, 'answer': ans, 'flt': flt, 'filter_ms': ms if ms and ms > 0 else None}); print(q, '→', ans.replace('\n', ' / ')[:200])
    return ans


with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=False)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='ko-KR')
    ctx.add_init_script("try { sessionStorage.setItem('lx.chat.test', '1') } catch (e) {}")
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(HOST + '/landxi/v3/login/', wait_until='domcontentloaded'); pg.wait_for_selector('#id')
    pg.fill('#id', 'test@lx.or.kr'); pg.fill('#pw', pw); pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
    pg.goto(HOST + '/landxi/v3/lx-map/', wait_until='domcontentloaded')
    pg.wait_for_selector('body[data-ready="1"]', timeout=90000); pg.wait_for_timeout(1500)
    if pg.locator('.lm-unfold').is_visible(): pg.locator('.lm-unfold').click()
    # 두 레이어만 켠다 — 남원 비닐하우스(분석서비스) · 여주 하거동 주차장(프로젝트)
    while pg.locator('.lm-sw[aria-checked="true"]').count():
        pg.locator('.lm-sw[aria-checked="true"]').first.click(); pg.wait_for_timeout(300)
    for gname, rname in (('비닐하우스 분석서비스', '남원시'), ('주차장', '하거동')):
        g = pg.locator('.lm-grp', has_text=gname).first
        if g.locator('.lm-gt').get_attribute('aria-expanded') != 'true': g.locator('.lm-gt').click()
        g.locator('li', has_text=rname).first.locator('.lm-sw').click(); pg.wait_for_timeout(1200)
    pg.wait_for_timeout(2500)
    # GPT3-3 — 쌓기
    ask(pg, '면적 1,000㎡ 넘는 것만 보여 줘')
    ask(pg, '운봉읍만')
    shot(pg, 'gpt3-3-stack-1440.png', '면적 1,000㎡ 넘음 → 운봉읍: 앞 조건 위에 더함 · 답 첫 줄 = 대상 · 조건 전부 · 수 · 왼쪽 조건 칩 둘(칩마다 풀기)')
    # GPT3-4 — 같은 범위(통계 · 보고서)
    ask(pg, '읍면동 통계 보여 줘')
    shot(pg, 'gpt3-4-stats-1440.png', '읍면동 통계 — 대상: 켜진 레이어 2개(이름) · 조건 그대로 · 레이어별 수')
    ask(pg, '보고서 초안 만들어 줘')
    shot(pg, 'gpt3-4-report-1440.png', '보고서 초안 — 통계와 같은 대상 · 같은 조건 · 같은 수')
    # 칩 하나 풀기(면적) — 화면 단추
    pg.locator('.lm-chip', has_text='㎡').locator('button').click()
    pg.wait_for_function("() => !/㎡/.test(document.querySelector('.lm-flt')?.innerText || '')", timeout=20000); pg.wait_for_timeout(800)
    log['after_drop_area'] = pg.locator('.lm-flt').inner_text(); print('칩 풀기', log['after_drop_area'].replace('\n', ' '))
    if pg.locator('.k-ck').is_visible():
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    # 도형목록 — 남원 줄의 '목록' → 결과 표 → 키보드로 첫 줄 Enter → 그 자리 · 속성 칸
    row = pg.locator('.lm-grp', has_text='비닐하우스 분석서비스').first.locator('li', has_text='남원시').first
    row.hover(); row.locator('.lm-lsb').click()
    pg.wait_for_selector('.lm-rows .lm-row', timeout=30000); pg.wait_for_timeout(800)
    log['list_head'] = pg.locator('.lm-rsub').inner_text()
    shot(pg, 'list-1440.png', "레이어 줄의 '목록' — 그 레이어의 결과 표(넓은 것부터 · 지금 조건 운봉읍 그대로)")
    first = pg.locator('.lm-rows .lm-row').first
    first.focus(); pg.keyboard.press('Enter')
    pg.wait_for_selector('.lm-props[data-view="props"] .lm-back', timeout=20000); pg.wait_for_timeout(2500)
    log['props'] = pg.locator('.lm-props').inner_text()[:300]
    log['props_focus'] = pg.evaluate('document.activeElement?.textContent')
    shot(pg, 'list-pick-1440.png', '목록 첫 줄(키보드 Enter) → 지도가 그 도형으로 가고 속성 칸 · 위에 ← 목록으로')
    pg.locator('.lm-back').press('Enter'); pg.wait_for_selector('.lm-props[data-view="list"] .lm-row', timeout=20000)
    log['back_to_list'] = True
    log['errors'] = errs
    b.close()
json.dump(log, open(os.path.join(HERE, 'log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('errors', errs)
