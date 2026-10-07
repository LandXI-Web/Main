"""빈 여백 비율 재기 — 첫 뷰(스크롤 0) 안에서 왼쪽 메뉴·마스트를 뺀 내용 영역을 4px 격자로 나눠
  ① 칸 덮임: 머리(.row-h) · 할 일 띠(.todo-bar) · 흰 칸(.k) 이 덮는 비율 → 빈 여백(칸 밖) = 100 − ①
  ② 내용 덮임: 글 · 그림 · 칩 · 막대 · 입력칸 · 단추가 실제로 덮는 비율 → 칸 안 빈 공간 = ① − ②"""
import sys, os
from playwright.sync_api import sync_playwright
JS = r"""
(() => {
  const main = document.querySelector('.main').getBoundingClientRect();
  const W = Math.min(innerWidth, main.right), H = innerHeight, X0 = main.left, Y0 = main.top;
  const S = 4, cols = Math.ceil((W - X0) / S), rows = Math.ceil((H - Y0) / S);
  const mk = () => new Uint8Array(cols * rows);
  const paint = (g, r) => { const x1 = Math.max(0, Math.floor((r.left - X0) / S)), x2 = Math.min(cols, Math.ceil((r.right - X0) / S)), y1 = Math.max(0, Math.floor((r.top - Y0) / S)), y2 = Math.min(rows, Math.ceil((r.bottom - Y0) / S)); for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * cols + x] = 1; };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < H; };
  const skip = (e) => !!e.closest('.stamp,.chat,.mast,.rail,script,style');
  const box = mk(), ink = mk();
  document.querySelectorAll('.main .k, .main .todo-bar, .main .row-h, .main .tile, .main .strip').forEach((e) => { if (vis(e) && !skip(e)) paint(box, e.getBoundingClientRect()); });
  document.querySelectorAll('.main img, .main svg, .main .chip, .main .bar, .main .fld, .main .btn, .main .sh, .main .map, .main .td, .main .pick, .main .seg i, .main .meter').forEach((e) => { if (vis(e) && !skip(e)) paint(ink, e.getBoundingClientRect()); });
  const tw = document.createTreeWalker(document.querySelector('.main'), 4); let n;
  while ((n = tw.nextNode())) { const el = n.parentElement; if (!el || skip(el) || !vis(el) || !n.nodeValue.trim()) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) if (b.width && b.height) paint(ink, b); }
  const sum = (g) => g.reduce((a, b) => a + b, 0) / (cols * rows);
  return { box: Math.round(sum(box) * 1000) / 10, ink: Math.round(sum(ink) * 1000) / 10, height: document.documentElement.scrollHeight };
})()
"""
def run(url, sizes):
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h in sizes:
            pg = b.new_page(viewport={'width': w, 'height': h}); pg.goto(url); pg.wait_for_timeout(1200)
            m = pg.evaluate(JS)
            print(f"{w}x{h}  칸 덮임 {m['box']}% → 칸 밖 빈 여백 {round(100-m['box'],1)}%  ·  내용 덮임 {m['ink']}% → 칸 안 빈 공간 {round(m['box']-m['ink'],1)}%  ·  세로 {m['height']}")
            pg.close()
        b.close()
if __name__ == '__main__':
    path = os.path.abspath(sys.argv[1]).replace(chr(92), '/')
    q = sys.argv[2] if len(sys.argv) > 2 else ''
    run('file:///' + path + q, [(1440, 900), (1920, 1080)])
