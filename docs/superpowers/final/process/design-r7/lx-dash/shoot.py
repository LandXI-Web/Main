"""설계 7차(lx-dash) 시안 촬영 — mock/ 의 HTML 을 찍어 shots/new-*.png 로 (shots/ 는 gitignore).
사용: python docs/superpowers/final/process/design-r7/lx-dash/shoot.py [이름 일부...]
GPU · 서버 · 로그인 없음 — 파일만 연다. 지금 화면(now-*)은 now.mjs 가 로그인 폼으로 찍는다.
찍으면서 첫 뷰 글자 수(레일 · 탭 · 시안 표시 제외) · 보이는 버튼 수 · 금지어를 함께 잰다(법전 5장 글 예산).
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

# (파일, 결과 이름, 크기, 전체 페이지 여부)
SHOTS_LIST = [
    ('mock/dash-a.html', 'new-dash-a-1440.png', (1440, 900), False),
    ('mock/dash-a-m.html', 'new-dash-a-390.png', (390, 844), False),
    ('mock/gov-select.html', 'new-gov-select-1440.png', (1440, 900), False),
    ('mock/gov-space.html', 'new-gov-space-1440.png', (1440, 900), False),
    ('mock/dash-b.html', 'new-dash-b-1440.png', (1440, 900), False),
    ('mock/gallery.html', 'new-gallery-1440.png', (1440, 900), False),
    ('mock/gallery-m.html', 'new-gallery-390.png', (390, 844), False),
    ('mock/card-detail.html', 'new-card-detail-1440.png', (1440, 900), False),
    ('mock/card-detail.html', 'new-card-detail-full.png', (1440, 900), True),
    ('mock/card-detail-m.html', 'new-card-detail-390.png', (390, 844), False),
    ('mock/ximap-first.html', 'new-ximap-first-1440.png', (1440, 900), False),
]

# 금지어(키트 lint 와 같은 뜻 · 시안용 요약)
FORBID = [
    ('시연·데모·준비 중', re.compile(r'시연|데모|준비\s?중')),
    ('API', re.compile(r'\bAPI\b')),
    ('GPU명', re.compile(r'\b(RTX|A6000|Radeon|GeForce|NVIDIA|CUDA)\b', re.I)),
    ('p95·ms', re.compile(r'\bp9[59]\b|\b\d+(\.\d+)?\s?ms\b', re.I)),
    ('shard·칩/s', re.compile(r'\bshards?\b|칩/s', re.I)),
    ('좌표', re.compile(r'\b\d{2,3}\.\d{4,}\s?[,·]\s?\d{2}\.\d{4,}\b')),
    ('지어낸 용어', re.compile(r'관제|생산\s?콘솔|정문|반입|조립|검수|이식|심기|판독|착지|봉투|계보|극장|\bOPS\b')),
]

BUDGET_JS = """
(() => {
  const skip = (el) => !!el.closest('.m-rail,.m-tabs,.m-note,.m-stamp,[data-budget-skip]');
  const W = innerWidth, H = innerHeight;
  let chars = 0, buttons = 0;
  const tw = document.createTreeWalker(document.body, 4);
  let n;
  while ((n = tw.nextNode())) {
    const el = n.parentElement;
    if (!el || skip(el) || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
    const s = n.nodeValue.trim(); if (!s) continue;
    const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    if (b.bottom > 0 && b.right > 0 && b.top < H && b.left < W) chars += s.replace(/\\s/g, '').length;
  }
  document.querySelectorAll('button,.t-btn,[role=button]').forEach((b) => {
    if (skip(b)) return; const r = b.getBoundingClientRect();
    if (r.width && r.bottom > 0 && r.top < H) buttons++;
  });
  const text = [...document.querySelectorAll('body *')].filter((e) => !skip(e)).map((e) => e.childNodes.length ? [...e.childNodes].filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join(' ') : '').join('\\n');
  return { chars, buttons, text };
})()
"""


def shoot(only):
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for src, out, (w, h), full in SHOTS_LIST:
            if only and not any(o in src or o in out for o in only):
                continue
            path, _, q = src.partition('?')
            url = 'file:///' + os.path.join(HERE, path).replace('\\', '/') + ('?' + q if q else '')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
            pg.goto(url)
            pg.wait_for_timeout(900)  # 서체·그림
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            m = pg.evaluate(BUDGET_JS)
            hits = sorted({k for k, rx in FORBID if rx.search(m['text'])})
            print(f"찍음 {out}  첫 뷰 글자 {m['chars']} · 버튼 {m['buttons']} · 금지어 {hits or 0}")
            pg.close()
        b.close()


if __name__ == '__main__':
    shoot(sys.argv[1:])
