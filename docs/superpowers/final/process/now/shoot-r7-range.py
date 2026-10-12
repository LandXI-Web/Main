"""바퀴 7 — 전국 결과 범위 · 순서 시안 그림(보유 계획표의 값을 한 장으로) 굽기. 사용: python shoot-r7-range.py <html> <출력폴더>"""
import datetime, sys, os
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
t = datetime.datetime.now()
h = open(src, encoding='utf-8').read().replace('__T__', f'{t:%m월 %d일 %H:%M}')
tmp = src + '.out.html'
open(tmp, 'w', encoding='utf-8').write(h)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 800})
    pg.goto('file:///' + tmp.replace(os.sep, '/')); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(out, f'mock-national-range-{t:%H%M}.png'), full_page=True); b.close()
print(t)
