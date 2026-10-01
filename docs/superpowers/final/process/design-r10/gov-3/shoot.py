"""설계 10차(gov-3) 시안 촬영 — mock/*.html 을 1440 과 390 두 폭으로 찍어 shots/new-*.png 로.
사용: python docs/superpowers/final/process/design-r10/gov-3/shoot.py [이름 일부...]
GPU · 서버 · 로그인 없음 — 파일만 연다. 지금 화면(before-*)은 scratch 의 shoot-before3.py(로그인 폼)로 따로 찍었다.
찍으면서 함께 잰다: 가로 넘침 · 글자가 상자를 넘는 곳 · 한 단어만 남은 줄 · 금지어 · 첫 뷰 글자 수.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

PC = (1440, 900)
M = (390, 844)
LIST = [
    ('mock/dash3.html?menu=a', 'new-menu-a-1440.png', PC, False),
    ('mock/dash3.html?menu=a', 'new-menu-a-390.png', M, False),
    ('mock/dash3.html?menu=a&full=1', 'new-menu-a-390-full.png', M, True),
    ('mock/dash3.html?menu=b', 'new-menu-b-1440.png', PC, False),
    ('mock/dash3.html?menu=c', 'new-menu-c-1440.png', PC, False),
    ('mock/menu-compare.html', 'new-menu-compare-1440.png', PC, True),
    ('mock/admin-tenants-list.html', 'new-admin-tenants-1440.png', PC, False),
    ('mock/admin-tenant-page.html', 'new-admin-tenant-page-1440.png', PC, False),
    ('mock/admin-tenant-page.html', 'new-admin-tenant-page-1440-full.png', PC, True),
    ('mock/admin-tenant-page.html?full=1', 'new-admin-tenant-page-390-full.png', M, True),
    ('mock/parcel-link.html', 'new-parcel-lxmap-on-1440.png', PC, True),
    ('mock/parcel-link.html?lx=0', 'new-parcel-lxmap-off-1440.png', PC, True),
    ('mock/vworld-attrs.html', 'new-parcel-attrs-1440.png', PC, True),
    ('mock/fig-2nd.html', 'new-2nd-flow-1440.png', PC, True),
]

FORBID = [
    ('시연·데모·준비 중', re.compile(r'시연|데모|준비\s?중')),
    ('API', re.compile(r'\bAPI\b')),
    ('GPU명', re.compile(r'\b(RTX|A6000|Radeon|GeForce|NVIDIA|CUDA)\b', re.I)),
    ('p95·ms', re.compile(r'\bp9[59]\b|\b\d+(\.\d+)?\s?ms\b', re.I)),
    ('shard·칩/s', re.compile(r'\bshards?\b|칩/s', re.I)),
    ('좌표', re.compile(r'\b\d{2,3}\.\d{4,}\s?[,·]\s?\d{2}\.\d{4,}\b')),
    ('전문 용어(형식·해상도·좌표계)', re.compile(r'\b(TIF|TIFF|JP2|ECW|COG|GeoTIFF|EPSG)\b|해상도|좌표계|cm\s?항공|cm\s?드론')),
    ('지어낸 용어', re.compile(r'관제|생산\s?콘솔|정문|반입|조립|검수\b|이식|심기|판독|착지|봉투|계보|극장|\bOPS\b|AI 도우미|물어보기|분석 의뢰|촬영 의뢰|영상 설명|우리 공간|결재')),
]

CHECK_JS = """
(() => {
  const skip = (el) => !!el.closest('.stamp,.note,script,style');
  const W = innerWidth, H = innerHeight;
  const out = { overflowX: document.documentElement.scrollWidth > W + 1, clipped: [], orphans: [], chars: 0, buttons: 0, text: '' };
  const els = [...document.querySelectorAll('body *')].filter((e) => !skip(e) && !e.closest('[hidden]'));
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (e.children.length === 0 && e.textContent.trim() && cs.overflow === 'visible' && e.scrollWidth > e.clientWidth + 2 && cs.whiteSpace === 'nowrap') out.clipped.push(e.textContent.trim().slice(0, 30));
  }
  const probe = (el) => {
    const r = document.createRange(); const words = []; const tw = document.createTreeWalker(el, 4); let n;
    while ((n = tw.nextNode())) { const s = n.nodeValue; let m; const rx = /\\S+/g; while ((m = rx.exec(s))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); if (b.width) words.push({ t: m[0], top: Math.round(b.top) }); } }
    if (words.length < 3) return null;
    const lines = []; for (const w of words) { const L = lines[lines.length - 1]; if (L && Math.abs(L.top - w.top) < 6) L.w.push(w.t); else lines.push({ top: w.top, w: [w.t] }); }
    if (lines.length < 2) return null;
    const last = lines[lines.length - 1];
    return last.w.length === 1 ? last.w[0] : null;
  };
  for (const e of els.filter((e) => /^(H1|H2|H3|P|DD|LI|TD)$/.test(e.tagName) && e.children.length <= 2)) { const o = probe(e); if (o) out.orphans.push(o); }
  const tw = document.createTreeWalker(document.body, 4); let n;
  while ((n = tw.nextNode())) { const el = n.parentElement; if (!el || skip(el) || el.closest('[hidden]')) continue; const s = n.nodeValue.trim(); if (!s) continue; const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!b.width && !b.height) continue; out.text += s + '\\n'; if (b.bottom > 0 && b.top < H) out.chars += s.replace(/\\s/g, '').length; }
  document.querySelectorAll('.btn').forEach((b) => { if (skip(b) || b.closest('[hidden]')) return; const r = b.getBoundingClientRect(); if (r.width && r.bottom > 0 && r.top < H) out.buttons++; });
  return out;
})()
"""


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out, (w, h), full in LIST:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(HERE, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(1000)
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            m = pg.evaluate(CHECK_JS)
            hits = sorted({k for k, rx in FORBID if rx.search(m['text'])})
            flags = []
            if m['overflowX']: flags.append('가로 넘침')
            if m['clipped']: flags.append('잘린 글 ' + ' / '.join(m['clipped'][:4]))
            if m['orphans']: flags.append('한 단어 줄 ' + ' / '.join(m['orphans'][:6]))
            if hits: flags.append('금지어 ' + ','.join(hits))
            if flags: bad += 1
            print(f"찍음 {out}  첫 뷰 글자 {m['chars']} · 버튼 {m['buttons']} · {' · '.join(flags) or '이상 없음'}")
            pg.close()
        b.close()
    print('이상 있는 캡처:', bad)


if __name__ == '__main__':
    shoot(sys.argv[1:])
