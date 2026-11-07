"""세계 바탕 낮은 줌(z0–3)을 파일 한 장으로 묶는다(첫 방문 때 조각 85개 대신 한 번에 · 화면 그림은 그대로 — 조각 바이트를 그대로 이어 붙임).
조각 판을 다시 구우면(kit/stage.js WORLD_V 를 올릴 때) 이것도 다시 돌린다: python tools/bake-world-pack.py
결과: landxi/data/tiles/world-bm/pack-z3.bin (데이터 폴더 — 저장소에 올라가지 않는다) · 앞 4바이트 = 색인 글자 수 · 색인 JSON {"z/x/y":[시작,길이]} · 조각 바이트"""
import json, os, struct, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'landxi', 'data', 'tiles', 'world-bm')
ZMAX = 3
idx, blobs, off = {}, [], 0
for z in range(ZMAX + 1):
    for x in range(2 ** z):
        for y in range(2 ** z):
            p = os.path.join(ROOT, str(z), str(x), f'{y}.webp')
            if not os.path.exists(p): continue
            b = open(p, 'rb').read()
            idx[f'{z}/{x}/{y}'] = [off, len(b)]; blobs.append(b); off += len(b)
head = json.dumps(idx, separators=(',', ':')).encode()
out = os.path.join(ROOT, 'pack-z3.bin')
tmp = out + '.tmp'
with open(tmp, 'wb') as f:
    f.write(struct.pack('<I', len(head))); f.write(head)
    for b in blobs: f.write(b)
os.replace(tmp, out)
print(out, len(idx), 'tiles', os.path.getsize(out), 'bytes')
