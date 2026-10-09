"""구현 8차 · 저장 용량(직원-7 · 용량-1 '이대로 구현') — 로그인 폼으로 실제 증량 신청 1건 → LX 관리자 승인 → 직원 화면 반영. PC 1440 만(원칙 139).
사용: python docs/superpowers/final/process/impl-8/storage/shoot.py   (비밀번호 = env LX_PW/DEV_PASSWORD 또는 server/.env)
시험 신청은 사유에 '시험'을 적고, 끝나면 그 직원의 할당을 기본 할당으로 되돌린다(신청 이력은 '시험' 표시로 남김).
잰다: 가로 넘침 · 한 단어만 남은 줄 · 글자 넘침(잘림) · 금지 말(결재 · 반려 · 늘리기 요청 · 이유 한 줄).
"""
import json
import os

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
ROOT = os.path.abspath(os.path.join(HERE, '../../../../../..'))
BASE = os.environ.get('LX_SHOOT_BASE', 'http://127.0.0.1:4173')
STAFF, ADMIN = 'test@lx.or.kr', 'lxadmin@lx.or.kr'
WHY = '시험 — 2차 학습데이터 추가'
os.makedirs(SHOTS, exist_ok=True)


def password():
    pw = os.environ.get('LX_PW') or os.environ.get('DEV_PASSWORD')
    if pw:
        return pw
    for line in open(os.path.join(ROOT, 'server', '.env'), encoding='utf-8'):
        if line.startswith('DEV_PASSWORD='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('비밀번호 없음')


CHECK_JS = r"""
(sel) => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0; };
  const lines = (el) => { const r = document.createRange(); const words = []; const tw = document.createTreeWalker(el, 4); let n;
    while ((n = tw.nextNode())) { const s = n.nodeValue; let m; const rx = /\S+/g; while ((m = rx.exec(s))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); if (b.width) words.push({ t: m[0], top: Math.round(b.top) }); } }
    const L = []; for (const w of words) { const l = L[L.length - 1]; if (l && Math.abs(l.top - w.top) < 6) l.w.push(w.t); else L.push({ top: w.top, w: [w.t] }); } return L; };
  const root = document.querySelector(sel) || document.body;
  const out = { overflowX: document.documentElement.scrollWidth > innerWidth + 1, orphans: [], cut: [], words: [] };
  for (const el of root.querySelectorAll('h2, h3, p, li, dd, dt, b, span, small, button, th, td')) {
    if (!vis(el) || el.children.length > 3) continue;
    const L = lines(el);
    if (L.length >= 2 && L[L.length - 1].w.length === 1 && el.textContent.trim().split(/\s+/).length > 2) out.orphans.push(el.textContent.trim().slice(0, 40));
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && el.clientWidth > 0) out.cut.push(el.textContent.trim().slice(0, 40));
  }
  const txt = root.innerText;
  for (const w of ['결재', '반려', '늘리기 요청', '이유 한 줄', '원하는 할당', '쓴 양']) if (txt.includes(w)) out.words.push(w);
  out.orphans = [...new Set(out.orphans)]; out.cut = [...new Set(out.cut)];
  return out;
}
"""


def login(b, who, pw):
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(BASE + '/landxi/v3/login/')
    pg.wait_for_selector('#id', timeout=60000)
    pg.fill('#id', who)
    pg.fill('#pw', pw)
    pg.click('#go')
    pg.wait_for_url(lambda u: '/login/' not in u, timeout=60000)
    return pg


def main():
    pw = password()
    rep = {}

    def check(pg, name, sel):
        r = pg.evaluate(CHECK_JS, sel)
        rep[name] = r
        print(name, json.dumps(r, ensure_ascii=False))

    with sync_playwright() as p:
        b = p.chromium.launch()
        st = login(b, STAFF, pw)
        # ① 대시보드 저장 용량 칸 — 도넛 · 할당 대비 막대 · 증량 신청
        st.goto(BASE + '/landxi/v3/lx-console/')
        st.wait_for_selector('.ld-store .k-me-dn', timeout=60000)
        st.wait_for_timeout(2000)
        st.locator('.ld-store').scroll_into_view_if_needed()
        st.wait_for_timeout(500)
        st.screenshot(path=os.path.join(SHOTS, 'dash-store-1440.png'))
        check(st, 'dash-store-1440.png', '.ld-store')
        # ② 내 정보 — 대시보드 '용량 증량 신청' → 내 정보 창이 열리고 저장 용량 칸에서 폼이 펼쳐짐
        st.click('.ld-store .k-me-ask')
        st.wait_for_selector('.k-me-askf input[name="want_gb"]', timeout=30000)
        st.fill('.k-me-askf input[name="want_gb"]', '100')
        st.fill('.k-me-askf input[name="why"]', WHY)
        st.wait_for_timeout(600)
        st.screenshot(path=os.path.join(SHOTS, 'my-ask-1440.png'))
        check(st, 'my-ask-1440.png', '.k-md')
        st.click('.k-me-askf .t-btn:not(.t-btn--text)')
        st.wait_for_selector('.k-me-pend', timeout=30000)
        st.wait_for_timeout(800)
        st.screenshot(path=os.path.join(SHOTS, 'my-sent-1440.png'))
        check(st, 'my-sent-1440.png', '.k-md')

        # ③ LX 관리자 — 계정 화면 '저장 용량' 탭 하나 · 증량 신청 서랍
        ad = login(b, ADMIN, pw)
        ad.goto(BASE + '/landxi/v3/ops-accounts/#storage')
        ad.wait_for_selector('.acs-dr .acc-acts', timeout=60000)
        ad.wait_for_timeout(1500)
        ad.screenshot(path=os.path.join(SHOTS, 'admin-storage-1440.png'))
        check(ad, 'admin-storage-1440.png', '.acc')
        rep['tabs'] = ad.evaluate("() => [...document.querySelectorAll('.acc-tab')].map((e) => e.textContent.trim())")
        rep['drawer'] = ad.evaluate("() => document.querySelector('.acs-dr').innerText")
        # 승인 서랍 가까이(오른쪽 단)
        box = ad.locator('.acs-dr').bounding_box()
        ad.screenshot(path=os.path.join(SHOTS, 'admin-drawer-1440.png'),
                      clip={'x': max(0, box['x'] - 560), 'y': max(0, box['y'] - 24), 'width': min(1440 - max(0, box['x'] - 560), box['width'] + 584), 'height': min(900 - max(0, box['y'] - 24), box['height'] + 48)})
        ad.click('.acs-dr .acc-acts .t-btn:not(.t-btn--2)')
        ad.wait_for_selector('.acs-dr-none', timeout=30000)
        ad.wait_for_timeout(1200)
        ad.screenshot(path=os.path.join(SHOTS, 'admin-after-1440.png'))
        rep['admin-after'] = ad.evaluate("() => [...document.querySelectorAll('.acs-tbl tbody tr')].map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim())")

        # ④ 직원 화면 반영 — 내 정보(할당 100 GB · 이력 '승인') · 대시보드 칸
        st.goto(BASE + '/landxi/v3/lx-console/')
        st.wait_for_selector('.ld-store .k-me-dn', timeout=60000)
        st.wait_for_timeout(1500)
        rep['dash-after'] = st.evaluate("() => document.querySelector('.ld-store').innerText")
        st.click('.k-me-b')
        st.wait_for_selector('.k-me-rows li', timeout=30000)
        st.wait_for_timeout(800)
        st.screenshot(path=os.path.join(SHOTS, 'my-approved-1440.png'))
        check(st, 'my-approved-1440.png', '.k-md')
        rep['my-after'] = st.evaluate("() => document.querySelector('.k-me-r').innerText")

        # ⑤ 되돌리기 — 시험 직원의 할당을 기본 할당으로(관리자 화면 '기본으로')
        ad.goto(BASE + '/landxi/v3/ops-accounts/#storage')
        ad.wait_for_selector('.acs-tbl tbody tr', timeout=60000)
        ad.wait_for_timeout(800)
        row = ad.locator('.acs-tbl tbody tr', has_text=STAFF)
        row.locator('button.acs-do', has_text='기본으로').click()
        ad.wait_for_timeout(2000)
        rep['reverted'] = ad.locator('.acs-tbl tbody tr', has_text=STAFF).inner_text().replace('\n', ' ')
        b.close()
    json.dump(rep, open(os.path.join(HERE, 'check.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: rep[k] for k in ('tabs', 'dash-after', 'reverted')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
