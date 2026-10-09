"""구현 8차 · 분석하기 목록(카드틀-3 · 5 · 6 ⓐ) — 로그인 폼(LX 직원)으로 들어가 PC 1440 만 찍는다(모바일 없음 · 원칙 139).
사용: python docs/superpowers/final/process/impl-8/analyze-list/shoot.py   (비밀번호 = env LX_PW/DEV_PASSWORD 또는 server/.env)
찍으면서 잰다: 가로 넘침 · 한 단어만 남은 줄 · 3줄 이상 제목 · 금지어 · 깨진 그림 · 카드 수.
"""
import json
import os
import re

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


FORBID = re.compile(r'현장 확인|시연|데모|준비\s?중|\bAPI\b|GPU|\bms\b|card-|smp_|job_|/landxi/|mAP|관제|판독|검수|반입')

CHECK_JS = r"""
(() => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const lines = (el) => { const r = document.createRange(); const words = []; const tw = document.createTreeWalker(el, 4); let n;
    while ((n = tw.nextNode())) { const s = n.nodeValue; let m; const rx = /\S+/g; while ((m = rx.exec(s))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); if (b.width) words.push({ t: m[0], top: Math.round(b.top) }); } }
    const L = []; for (const w of words) { const l = L[L.length - 1]; if (l && Math.abs(l.top - w.top) < 6) l.w.push(w.t); else L.push({ top: w.top, w: [w.t] }); } return L; };
  const cards = [...document.querySelectorAll('.la-ac')];
  const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1, cards: cards.length, orphans: [], tall: [], cut: [], text: '', broken: [] };
  for (const c of cards) {
    for (const el of c.querySelectorAll('.k-sc-t,.la-ac-line,.la-ac-where .v,.la-ac-hero small,.la-ac-hero b')) {
      const L = lines(el); if (L.length >= 2 && L[L.length - 1].w.length === 1) out.orphans.push(el.textContent);
      if (el.matches('.k-sc-t') && L.length >= 3) out.tall.push(el.textContent);
      if (el.scrollWidth > el.clientWidth + 1) out.cut.push(el.textContent);
    }
  }
  out.text = [...document.querySelectorAll('.la-page *')].filter((e) => vis(e) && !e.children.length).map((e) => e.textContent.trim()).filter(Boolean).join(' | ');
  out.broken = [...document.images].filter((i) => vis(i) && !(i.complete && i.naturalWidth > 0)).length;
  out.names = cards.map((c) => c.querySelector('.k-sc-t').textContent);
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
        pg.evaluate("() => { try { localStorage.removeItem('lx-analyze.view'); } catch {} }")
        for name, view in (('list-default-1440.png', None), ('list-big-1440.png', 'big')):
            pg.goto(BASE + '/landxi/v3/lx-analyze/')
            pg.wait_for_selector('body[data-ready="1"] .la-ac', timeout=60000)
            if view:
                pg.click('.la-view-b:has-text("크게")')
            pg.wait_for_timeout(2500)
            pg.screenshot(path=os.path.join(SHOTS, name))
            r = pg.evaluate(CHECK_JS)
            r['forbidden'] = sorted(set(FORBID.findall(r['text'])))
            r.pop('text')
            rep[name] = r
            print(name, json.dumps(r, ensure_ascii=False))
        # 고른 보기가 기억되는지 — 다시 열면 '크게'
        pg.goto(BASE + '/landxi/v3/lx-analyze/')
        pg.wait_for_selector('body[data-ready="1"] .la-ac', timeout=60000)
        rep['remembered'] = pg.evaluate("() => document.querySelector('.la-acg').dataset.view")
        pg.evaluate("() => { try { localStorage.removeItem('lx-analyze.view'); } catch {} }")
        b.close()
    json.dump(rep, open(os.path.join(HERE, 'check.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('remembered', rep['remembered'])


if __name__ == '__main__':
    main()
