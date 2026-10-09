"""로딩-1(원칙 161) — 느린 응답을 흉내 내(API 지연 주입) 로딩 순간을 찍는다. 로그인 폼으로만. PC 1440 · 1920(원칙 139).
사용: python docs/superpowers/final/process/impl-8/loading/shoot.py   (비밀번호 = env LX_PW/DEV_PASSWORD 또는 server/.env)
잰다: 가운데 표시 수(.k-ld 보임) · 화면에 보이는 '불러오는 중' 글 수 · 칸 막대 수 · 가운데 표시의 위치(내용 영역 중심과의 차) · 도착 뒤 사라짐 · 콘솔 오류.
"""
import asyncio
import json
import os
import re

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
ROOT = os.path.abspath(os.path.join(HERE, '../../../../../..'))
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')
STAFF, ADMIN = 'test@lx.or.kr', 'lxadmin@lx.or.kr'
os.makedirs(SHOTS, exist_ok=True)
SKIP = re.compile(r'/api/v1/(auth|session|login|me(\?|$)|i18n)')


def password():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if pw:
        return pw
    for line in open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8'):
        if line.startswith('DEV_PASSWORD='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('비밀번호 없음')


MEASURE = r"""
() => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; };
  const ld = [...document.querySelectorAll('.k-ld')].filter(vis);
  const tw = document.createTreeWalker(document.body, 4); let n, words = 0;
  while ((n = tw.nextNode())) if (n.nodeValue.includes('불러오는 중') && n.parentElement && vis(n.parentElement)) words++;
  const bars = [...document.querySelectorAll('.k-empty-p.is-indet, .t-progress.is-indet')].filter(vis).length;
  let off = null;
  const c = ld[0]?.querySelector('.k-ld-c');
  const m = document.querySelector('.k-main');
  if (c && m) { const a = c.getBoundingClientRect(), b = m.getBoundingClientRect(); off = [Math.round((a.left + a.width / 2) - (b.left + b.width / 2)), Math.round((a.top + a.height / 2) - (b.top + b.height / 2))]; }
  const slow = ld[0]?.dataset.slow === '1';
  return { center: ld.length, words, bars, off, slow, holds: document.querySelectorAll('[data-k-wait="1"]').length };
}
"""


async def login(b, who, pw, w):
    ctx = await b.new_context(viewport={'width': w, 'height': 1080 if w >= 1920 else 900}, device_scale_factor=1)
    pg = await ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(BASE + '/landxi/v3/login/')
    await pg.wait_for_selector('#id', timeout=60000)
    await pg.fill('#id', who)
    await pg.fill('#pw', pw)
    await pg.click('#go')
    await pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
    await pg.wait_for_timeout(1500)
    return pg, errs


async def slowdown(pg, ms):
    async def h(route):
        if '/api/v1/' in route.request.url and not SKIP.search(route.request.url):
            await asyncio.sleep(ms / 1000)
        try:
            await route.continue_()
        except Exception:
            pass
    await pg.route('**/*', h)


async def shot(pg, path, name, delay, wait_ms, rep, errs, after=True):
    await slowdown(pg, delay)
    errs.clear()
    await pg.goto(BASE + path)
    await pg.wait_for_timeout(wait_ms)
    m = await pg.evaluate(MEASURE)
    await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))
    r = {'loading': m}
    if after:
        for _ in range(60):
            await pg.wait_for_timeout(500)
            a = await pg.evaluate(MEASURE)
            if not a['center']:
                break
        await pg.wait_for_timeout(1200)
        r['after'] = await pg.evaluate(MEASURE)
        await pg.screenshot(path=os.path.join(SHOTS, name + '-done.png'))
    await pg.unroute('**/*')
    r['errors'] = [e for e in errs if 'favicon' not in e][:8]
    rep[name] = r
    print(name, json.dumps(r, ensure_ascii=False))


async def main():
    pw = password()
    rep = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w in (1440, 1920):
            st, e1 = await login(b, STAFF, pw, w)
            await shot(st, '/landxi/v3/lx-project/', f'project-{w}', 3500, 1400, rep, e1)
            await shot(st, '/landxi/v3/lx-analyze/', f'analyze-{w}', 3500, 1400, rep, e1)
            if w == 1920:
                await shot(st, '/landxi/v3/xi-clean/', f'ximap-{w}', 3500, 2000, rep, e1)
            ad, e2 = await login(b, ADMIN, pw, w)
            await shot(ad, '/landxi/v3/ops-core/', f'admin-{w}', 3500, 1400, rep, e2)
            if w == 1440:
                await shot(ad, '/landxi/v3/ops-core/', f'admin-slow-{w}', 8000, 7000, rep, e2)
            await st.context.close(); await ad.context.close()
        await b.close()
    json.dump(rep, open(os.path.join(HERE, 'check.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


asyncio.run(main())
