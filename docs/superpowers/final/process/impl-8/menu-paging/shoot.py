"""구현 8차 · LX 직원 메뉴(지도-1 ⓐ · 서비스카드-1 ⓐ) · 분석하기 보기 개수(지도-4 ⓐ) — 로그인 폼(LX 직원)으로 PC 1440 만(원칙 139).
사용: python docs/superpowers/final/process/impl-8/menu-paging/shoot.py   (비밀번호 = env LX_PW/DEV_PASSWORD 또는 server/.env)
잰다: 가로 넘침 · 한 단어만 남은 줄(메뉴 · 카드) · 메뉴 칸 이름 · 머리 XI맵 단추 · 한 페이지 장수 · 페이지 넘김 · 기억.
"""
import json
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
ROOT = os.path.abspath(os.path.join(HERE, '../../../../../..'))
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')
LOGIN_ID = 'test@lx.or.kr'


def password():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if pw:
        return pw
    for line in open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8'):
        if line.startswith('DEV_PASSWORD='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('비밀번호 없음')


CHECK_JS = r"""
(() => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const lines = (el) => { const r = document.createRange(); const words = []; const tw = document.createTreeWalker(el, 4); let n;
    while ((n = tw.nextNode())) { const s = n.nodeValue; let m; const rx = /\S+/g; while ((m = rx.exec(s))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); if (b.width) words.push({ t: m[0], top: Math.round(b.top) }); } }
    const L = []; for (const w of words) { const l = L[L.length - 1]; if (l && Math.abs(l.top - w.top) < 6) l.w.push(w.t); else L.push({ top: w.top, w: [w.t] }); } return L; };
  const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1, orphans: [], cut: [] };
  const els = [...document.querySelectorAll('.k-rail-i > span:last-child, .la-ac .k-sc-t, .la-ac-line, .la-ac-where .v, .la-ac-hero small, .la-view, .la-pager small')].filter(vis);
  for (const el of els) { const L = lines(el); if (L.length >= 2 && L[L.length - 1].w.length === 1) out.orphans.push(el.textContent); if (el.scrollWidth > el.clientWidth + 1 && !el.matches('.la-ac-where .v')) out.cut.push(el.textContent); }
  out.menu = [...document.querySelectorAll('.k-rail > *')].filter(vis).map((e) => e.classList.contains('k-rail-sep') ? '|' : e.textContent.trim());
  out.current = document.querySelector('.k-rail-i[aria-current="true"]')?.textContent.trim() || null;
  out.mastXi = !!document.querySelector('.k-mast .k-xi');
  out.ximapHref = document.querySelector('.k-rail-i[data-id="ximap"]')?.getAttribute('href') || null;
  out.cards = document.querySelectorAll('.la-ac').length;
  out.per = document.querySelector('.la-acg')?.dataset.n || null;
  out.pager = document.querySelector('.la-pager')?.textContent.trim() || null;
  return out;
})()
"""


def main():
    pw = password()
    rep = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.goto(BASE + '/landxi/v3/login/')
        pg.wait_for_selector('#id', timeout=60000)
        pg.fill('#id', LOGIN_ID)
        pg.fill('#pw', pw)
        pg.click('#go')
        pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
        pg.evaluate("() => { try { localStorage.removeItem('lx-analyze.per'); } catch {} }")

        def shot(name, url, ready, act=None):
            pg.goto(BASE + url)
            pg.wait_for_selector(ready, timeout=60000)
            if act:
                act()
            pg.wait_for_timeout(2500)
            pg.screenshot(path=os.path.join(SHOTS, name))
            r = pg.evaluate(CHECK_JS)
            rep[name] = r
            print(name, json.dumps(r, ensure_ascii=False))

        shot('dashboard-1440.png', '/landxi/v3/lx-console/', '.k-rail-i')
        shot('analyze-4-1440.png', '/landxi/v3/lx-analyze/', 'body[data-ready="1"] .la-ac')
        shot('analyze-2-1440.png', '/landxi/v3/lx-analyze/', 'body[data-ready="1"] .la-ac', lambda: pg.click('.la-view-b[aria-label="한 페이지 2장"]'))
        # 페이지 넘김 — 2장 보기에서 2페이지
        pg.click('.la-pg[aria-label="2페이지"]'); pg.wait_for_timeout(800)
        rep['page2'] = pg.evaluate("() => [...document.querySelectorAll('.la-ac .k-sc-t')].map((e) => e.textContent)")
        shot('analyze-8-1440.png', '/landxi/v3/lx-analyze/', 'body[data-ready="1"] .la-ac', lambda: pg.click('.la-view-b[aria-label="한 페이지 8장"]'))
        pg.goto(BASE + '/landxi/v3/lx-analyze/')
        pg.wait_for_selector('body[data-ready="1"] .la-ac', timeout=60000)
        rep['remembered'] = pg.evaluate("() => document.querySelector('.la-acg').dataset.n")
        pg.evaluate("() => { try { localStorage.removeItem('lx-analyze.per'); } catch {} }")
        # 서비스 카드 화면은 지우지 않았다 — 열리고 메뉴는 '분석하기'에 불
        pg.goto(BASE + '/landxi/v3/lx-cards/')
        pg.wait_for_selector('.k-rail-i', timeout=60000)
        pg.wait_for_timeout(1500)
        rep['lx-cards'] = pg.evaluate(CHECK_JS)
        b.close()
    json.dump(rep, open(os.path.join(HERE, 'check.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('page2', rep['page2'], 'remembered', rep['remembered'], 'cards-screen', rep['lx-cards']['current'])


if __name__ == '__main__':
    main()
