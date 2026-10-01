"""제안 2 시안 촬영 — mock/ 의 HTML 을 찍어 shots/new-*.png 로. GPU · 서버 · 로그인 없음(파일만 연다).
사용: python docs/superpowers/final/process/suggest-2/shoot.py
지금 화면(before-*)은 로그인 폼으로 따로 찍는다(스크래치 now.mjs — 저장소에 두지 않음).
찍으면서 금지어(용어표 · 내부 지표)를 함께 검사한다.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
os.makedirs(SHOTS, exist_ok=True)

# (파일, 결과 이름, 크기, 전체 페이지 여부)
LIST = [
    ('mock/list.html', 'new-project-list-1440.png', (1440, 900), False),
    ('mock/view.html?f=made', 'new-project-made-1440.png', (1440, 900), True),
    ('mock/view.html?f=log', 'new-project-log-1440.png', (1440, 900), True),
    ('mock/view.html?f=retrain', 'new-project-retrain-1440.png', (1440, 900), True),
    ('mock/view.html?f=people', 'new-project-handover-lead-1440.png', (1440, 900), True),
    ('mock/handover.html', 'new-admin-handover-1440.png', (1440, 900), False),
    ('mock/flow.html', 'new-shoot-flow-1440.png', (1440, 560), False),
]

FORBID = [
    ('시연·데모·준비 중', re.compile(r'시연|데모|준비\s?중')),
    ('API', re.compile(r'\bAPI\b')),
    ('GPU명', re.compile(r'\b(RTX|A6000|A100|Radeon|GeForce|NVIDIA|CUDA)\b', re.I)),
    ('p95·ms', re.compile(r'\bp9[59]\b|\b\d+(\.\d+)?\s?ms\b', re.I)),
    ('shard·칩/s', re.compile(r'\bshards?\b|칩/s', re.I)),
    ('지어낸 용어', re.compile(r'관제|생산\s?콘솔|정문|반입|조립|검수|이식|심기|판독|착지|봉투|계보|극장|\bOPS\b|AI 도우미|물어보기')),
    ('내부 코드', re.compile(r'\b[A-Z]\d{1,2}\b|§')),
]

want = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch()
    for src, out, (w, h), full in LIST:
        if want and not any(x in out for x in want):
            continue
        pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        path, _, q = src.partition('?')
        pg.goto('file:///' + os.path.join(HERE, path).replace('\\', '/') + ('?' + q if q else ''))
        pg.wait_for_timeout(900)
        text = pg.evaluate("() => document.body.innerText")
        bad = [(n, m.group(0)) for n, r in FORBID for m in [r.search(text)] if m]
        pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
        pg.close()
        print(('금지어 ' + str(bad) if bad else '통과'), out)
    b.close()
