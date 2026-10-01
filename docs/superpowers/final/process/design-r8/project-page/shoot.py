"""설계 8차(project-page) 시안 촬영 — mock/view.html 을 1440 과 390 두 폭으로 찍어 shots/new-*.png 로.
사용: python docs/superpowers/final/process/design-r8/project-page/shoot.py [이름 일부...]
GPU · 서버 · 로그인 없음 — 파일만 연다. 지금 화면(before-*)은 로그인 폼으로 따로 찍는다(스크래치 now.py — 저장소에 두지 않음).
찍으면서 함께 잰다: 가로 넘침 · 글자가 상자를 넘는 곳 · 한 단어만 남은 줄 · 금지어 · 첫 뷰 글자 수 · 첫 뷰에 보이는 버튼 수 · 페이지 세로 길이.
"""
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

PC = (1440, 900)
M = (390, 844)
# (파일?쿼리, 결과 이름, 크기, 전체 페이지)
LIST = [
    ('mock/view.html', 'new-project-1440.png', PC, False),
    ('mock/view.html', 'new-project-1440-full.png', PC, True),
    ('mock/view.html?f=where,made', 'new-project-made-1440.png', PC, False),
    ('mock/view.html?dlg=retrain&f=retrain', 'new-project-retrain-1440.png', PC, False),
    ('mock/view.html?dlg=log&f=log', 'new-project-log-1440.png', PC, False),
    ('mock/view.html?dlg=handover&f=people', 'new-project-handover-1440.png', PC, False),
    ('mock/view.html?dlg=me&f=me', 'new-me-1440.png', PC, False),
    ('mock/view.html', 'new-project-390.png', M, False),
    ('mock/view.html', 'new-project-390-full.png', M, True),
    ('mock/view.html?dlg=me', 'new-me-390.png', M, False),
    ('mock/view.html?dlg=handover', 'new-project-handover-390.png', M, False),
]

FORBID = [
    ('시연·데모·준비 중', re.compile(r'시연|데모|준비\s?중')),
    ('API', re.compile(r'\bAPI\b')),
    ('GPU명', re.compile(r'\b(RTX|A6000|A100|Radeon|GeForce|NVIDIA|CUDA|GPU)\b', re.I)),
    ('p95·ms', re.compile(r'\bp9[59]\b|\b\d+(\.\d+)?\s?ms\b', re.I)),
    ('shard·칩/s', re.compile(r'\bshards?\b|칩/s', re.I)),
    ('좌표', re.compile(r'\b\d{2,3}\.\d{4,}\s?[,·]\s?\d{2}\.\d{4,}\b')),
    ('작업 번호 · 경로', re.compile(r'\bjob_|\bprj_|\bsmp_|\bcard-[0-9a-f]{6}\b|/landxi/')),
    ('지어낸 용어', re.compile(r'관제|생산\s?콘솔|정문|반입|조립|검수|이식|심기|판독|착지|봉투|계보|극장|\bOPS\b|AI 도우미|물어보기')),
]

CHECK_JS = """
(() => {
  const skip = (el) => !!el.closest('.stamp,.note,script,style');
  const W = innerWidth, H = innerHeight;
  const out = { overflowX: document.documentElement.scrollWidth > W + 1, clipped: [], orphans: [], chars: 0, buttons: 0, text: '', height: document.documentElement.scrollHeight };
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const els = [...document.querySelectorAll('body *')].filter((e) => !skip(e) && vis(e));
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
  for (const e of els.filter((e) => /^(H1|H2|H3|H4|P|B|SPAN|DD|LI|TD)$/.test(e.tagName) && e.children.length <= 2)) { const o = probe(e); if (o) out.orphans.push(o); }
  const tw = document.createTreeWalker(document.body, 4); let n;
  while ((n = tw.nextNode())) { const el = n.parentElement; if (!el || skip(el) || !vis(el)) continue; const s = n.nodeValue.trim(); if (!s) continue; const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); if (!b.width && !b.height) continue; out.text += s + '\\n'; if (b.bottom > 0 && b.top < H) out.chars += s.replace(/\\s/g, '').length; }
  document.querySelectorAll('.btn').forEach((b) => { if (skip(b) || !vis(b)) return; const r = b.getBoundingClientRect(); if (r.width && r.bottom > 0 && r.top < H) out.buttons++; });
  // 그림이 실제로 떴나(깨진 그림 0)
  out.imgBroken = [...document.images].filter((i) => vis(i) && !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src'));
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
            pg.wait_for_timeout(1200)  # 서체 · 그림
            pg.screenshot(path=os.path.join(SHOTS, out), full_page=full)
            m = pg.evaluate(CHECK_JS)
            hits = sorted({k for k, rx in FORBID if rx.search(m['text'])})
            flags = []
            if m['overflowX']: flags.append('가로 넘침')
            if m['clipped']: flags.append('잘린 글 ' + ' / '.join(m['clipped'][:4]))
            if m['orphans']: flags.append('한 단어 줄 ' + ' / '.join(m['orphans'][:6]))
            if m['imgBroken']: flags.append('깨진 그림 ' + ' / '.join(m['imgBroken'][:4]))
            if hits: flags.append('금지어 ' + ','.join(hits))
            if flags: bad += 1
            print(f"찍음 {out}  세로 {m['height']} · 첫 뷰 글자 {m['chars']} · 버튼 {m['buttons']} · {' · '.join(flags) or '이상 없음'}")
            pg.close()
        b.close()
    print('이상 있는 캡처:', bad)


if __name__ == '__main__':
    shoot(sys.argv[1:])
