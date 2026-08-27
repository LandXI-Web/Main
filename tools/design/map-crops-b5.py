# -*- coding: utf-8 -*-
"""B5 프로젝트 풀블리드 지도 판 — 남원 농경지 2025.06 로컬 타일(namwon_2506, z19)을 1384×852 로 스티치.
  "C:\Users\oem\anaconda3\envs\yolo\python.exe" tools/design/map-crops-b5.py   (repo root)
산출: design-canvas/v2/img/pj-map-label.jpg (라벨링 판) · pj-map-analysis.jpg (분석 판). 오버레이 없음(청록 폴리곤은 판의 SVG).
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'crops'))
from lib import Render, local_tile, save_jpeg_budget  # noqa: E402

OUT = ROOT / 'design-canvas' / 'v2' / 'img'
AOI = (127.3481, 35.5276, 127.3567, 35.5347)          # imagery.js namwon_2506 bounds
cx, cy = (AOI[0] + AOI[2]) / 2, (AOI[1] + AOI[3]) / 2
PLATES = {'pj-map-label': (cx - 0.0015, cy + 0.0012), 'pj-map-analysis': (cx + 0.0018, cy - 0.0015)}
for name, (lon, lat) in PLATES.items():
    r = Render(lambda z, x, y: local_tile('namwon_2506', z, x, y), 19, lon, lat, 330, out2x=(1384, 852))
    n, q = save_jpeg_budget(r.base2x, OUT / f'{name}.jpg', 260)
    print(name, lon, lat, 'alpha', round(r.mean_alpha, 3), n // 1024, 'KB q', q)
