"""구현 현황판 생성기 — shots/overview/inventory.json → landxi/proto/review/status/.

인벤토리(화면 전수·썸네일)는 전수 촬영 에이전트가 갱신한다. 이 스크립트는 그 결과를
검토 허브 아래 정적 페이지로 굽는다. 템플릿은 status-tpl.html(같은 폴더).
사용: python tools/review/build-status.py
"""
import json
import os
import re
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
INV = os.path.join(ROOT, 'shots', 'overview', 'inventory.json')
THUMBS = os.path.join(ROOT, 'shots', 'overview', 'thumbs')
TPL = os.path.join(os.path.dirname(__file__), 'status-tpl.html')
OUT = os.path.join(ROOT, 'landxi', 'proto', 'review', 'status')
SMAP = os.path.join(ROOT, 'landxi', 'proto', 'review', 'screen-map.json')  # node tools/review/masters.mjs 가 생성
KEEP = ['id', '경로', '제목', '사용자_축', '기능군', '세대', '상태', '실데이터', '문제', '콘솔_오류']


def rel(repo_path):
    """저장소 경로 → status/index.html 기준 상대 경로 (?·# 꼬리는 그대로)."""
    m = re.match(r'^([^?#]*)(.*)$', str(repo_path))
    return os.path.relpath(m.group(1), 'landxi/proto/review/status').replace('\\', '/') + m.group(2)

inv = json.load(open(INV, encoding='utf-8'))
smap = json.load(open(SMAP, encoding='utf-8')) if os.path.exists(SMAP) else {'기능_순서': [], 'screens': {}}
os.makedirs(os.path.join(OUT, 'thumbs'), exist_ok=True)
screens = []
for s in inv['screens']:
    x = {k: s.get(k) for k in KEEP}
    m = smap['screens'].get(s['id'], {})  # 자산 대장과 같은 화면 키(기능 → 화면)
    x['function'] = m.get('function', '미분류')
    x['screen'] = m.get('screen', '미분류')
    x['verdict'] = m.get('verdict')
    # 대장과 같은 사용자 이름·행 키·매체·열기(서버가 필요한 화면은 Pages 에서 캡처·영상으로만 열린다)
    x['label'] = m.get('label') or s.get('제목') or s['id']
    x['anchor'] = m.get('anchor')
    x['access'] = m.get('access')
    x['media'] = [{'k': md['kind'], 's': rel(md['src']), 't': rel(md['thumb']) if md.get('thumb') else None, 'l': md['label'], 'p': rel(md['poster']) if md.get('poster') else None} for md in m.get('media', [])]
    o = m.get('open') or {}
    x['open'] = {'kind': o.get('kind'), 'href': rel(o['href']) if o.get('href') and not o['href'].startswith('http') else o.get('href'), 'live': o.get('live'), 'note': o.get('note')} if o else None
    t = s.get('썸네일')
    src = os.path.join(ROOT, 'shots', 'overview', t) if t else None
    if src and os.path.exists(src):
        shutil.copy2(src, os.path.join(OUT, 'thumbs', os.path.basename(src)))
        x['thumb'] = 'thumbs/' + os.path.basename(src)
    else:
        x['thumb'] = next((md['t'] or md['s'] for md in x['media'] if md['k'] == 'image'), None)
    screens.append(x)
# 새 화면(landxi/v3) — 인벤토리(전수 촬영)에 없는 것까지 자산 대장(screen-map)에서 가져온다. 세대·상태는 대장 기준으로 덮는다
seen = {x['id'] for x in screens}
for sid, m in smap['screens'].items():
    if m.get('slot') != '새 구현':
        continue
    if sid in seen:
        x = next(x for x in screens if x['id'] == sid)
    else:
        x = {k: None for k in KEEP}
        x['id'] = sid
        x.update({'function': m.get('function', '미분류'), 'screen': m.get('screen', '미분류'), 'verdict': m.get('verdict'), 'label': m.get('label'), 'anchor': m.get('anchor'), 'access': m.get('access')})
        x['media'] = [{'k': md['kind'], 's': rel(md['src']), 't': rel(md['thumb']) if md.get('thumb') else None, 'l': md['label'], 'p': rel(md['poster']) if md.get('poster') else None} for md in m.get('media', [])]
        o = m.get('open') or {}
        x['open'] = {'kind': o.get('kind'), 'href': rel(o['href']) if o.get('href') else None, 'live': o.get('live'), 'note': o.get('note')} if o else None
        x['thumb'] = next((md['t'] or md['s'] for md in x['media'] if md['k'] == 'image'), None)
        screens.append(x)
    for k in ('경로', '세대', '상태', '사용자_축', '실데이터'):
        if m.get(k):
            x[k] = m[k]
    x['문제'] = None
# 화면 용어표(CLAUDE.md §2) — 인벤토리 제목·문제 글에 남은 옛 말을 현황판에 싣기 전에 바꾼다
TERM = [('관제실', 'LX 관리자 화면'), ('관제 핵심판', 'LX 관리자 대시보드'), ('관제', 'LX 관리자 화면'), ('LX/OPS', 'LX 관리자'), ('생산 콘솔', 'LX 직원 대시보드'), ('정문', '로그인'),
        ("'시연'", '옛 표기'), ('시연', '예시'), ('준비 중', '첫 결과 전'), ('반입', '데이터 올리기'), ('조립', '서비스 만들기'), ('검수', '결과 확인'), ('착지', '첫 화면')]
def term(v):
    if not isinstance(v, str):
        return v
    for a, b in TERM:
        v = v.replace(a, b)
    return v
for x in screens:
    for k in ('제목', '문제', '실데이터', '기능군', 'label'):
        x[k] = term(x.get(k))
    if x.get('open'):
        x['open'] = {k: term(v) for k, v in x['open'].items()}
payload = {'screens': screens, 'order': smap.get('기능_순서', []), 'rows': smap.get('화면', []),
           'backend': [{k: term(v) for k, v in b.items()} for b in inv.get('backend', [])], 'data': [{k: term(v) for k, v in b.items()} for b in inv.get('data', [])],
           'generated_at': inv.get('generated_at')}
data = json.dumps(payload, ensure_ascii=False).replace('</', '<\\/')
body = open(TPL, encoding='utf-8').read().replace('__DATA__', data)
page = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<link rel="icon" href="data:,">\n'  # Pages 에 favicon.ico 가 없어 나는 404 콘솔 오류를 막는다(head 안에 있어야 브라우저가 따른다)
        '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
print('status page:', len(screens), 'screens,', sum(1 for s in screens if s['thumb']), 'thumbs')
