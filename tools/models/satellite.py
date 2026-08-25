# -*- coding: utf-8 -*-
"""
satellite.glb — 지구관측(EO) 위성.

  blender -b -P tools/models/satellite.py

MLI 골드로 감싼 버스 + 알루미늄 구조 프레임 + 태양전지 날개 2매 + 광학 탑재체 배럴
+ 고이득 접시 안테나. 스케일 1 unit = 1 m (버스 약 2.4 m, 배럴 포함 전고 약 5 m, 날개 폭 12 m).
Blender 는 Z-up 으로 만들고 익스포터가 Y-up 으로 변환한다(나디르 = glTF -Y).
"""

import os
import sys

sys.dont_write_bytecode = True          # tools/models/ 에 __pycache__ 를 남기지 않는다
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lxbuild import Node, export_glb, material, reset_scene  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "landxi", "assets", "proto", "models", "satellite.glb",
)

reset_scene()

# --------------------------------------------------------------------------- #
# 머티리얼
# --------------------------------------------------------------------------- #
M_GOLD = material("MLI_Gold", "#B98F3C", metallic=0.86, roughness=0.44)
M_GOLD_DK = material("MLI_Amber", "#7E5A16", metallic=0.9, roughness=0.58)
M_BUS = material("Bus_Alu", "#33383F", metallic=0.92, roughness=0.32)
M_STEEL = material("Struct_Alu", "#8E959E", metallic=0.95, roughness=0.26)
M_RAD = material("Radiator_White", "#D6DAE0", metallic=0.08, roughness=0.32)
M_CELL = material("Solar_Cell", "#0D1838", metallic=0.62, roughness=0.15)
M_DARK = material("Optic_Black", "#131518", metallic=0.35, roughness=0.62)
M_LENS = material("Lens", "#0B2E38", metallic=1.0, roughness=0.05, emission="#0E3C4A", emission_strength=0.6)

# --------------------------------------------------------------------------- #
# 1) 버스 — MLI 로 감싼 몸체 + 노출된 알루미늄 구조 프레임
# --------------------------------------------------------------------------- #
BX, BY, BZ = 1.90, 2.00, 2.40
HX, HY, HZ = BX / 2, BY / 2, BZ / 2
bus = Node("bus")

# MLI 로 감싼 코어 (가로 이음매가 보이도록 3단)
bus.cube(M_GOLD, size=(BX, BY, BZ * 0.40), loc=(0, 0, BZ * 0.30), bevel=0.05, bevel_seg=2)
bus.cube(M_GOLD, size=(BX, BY, BZ * 0.32), loc=(0, 0, 0), bevel=0.05, bevel_seg=2)
bus.cube(M_GOLD, size=(BX, BY, BZ * 0.28), loc=(0, 0, -BZ * 0.34), bevel=0.05, bevel_seg=2)
# 이음매 밴드
for z in (BZ * 0.10, -BZ * 0.16):
    bus.cube(M_GOLD_DK, size=(BX * 1.012, BY * 1.012, 0.035), loc=(0, 0, z))

# 구조 프레임: 수직 코너 포스트 4개 + 상/하 링
for sx in (1, -1):
    for sy in (1, -1):
        bus.cube(M_STEEL, size=(0.10, 0.10, BZ * 1.02), loc=(sx * (HX - 0.02), sy * (HY - 0.02), 0), bevel=0.018, bevel_seg=1)
for z in (HZ, -HZ):
    bus.cube(M_STEEL, size=(BX * 1.035, 0.085, 0.085), loc=(0, HY - 0.02, z), bevel=0.015, bevel_seg=1)
    bus.cube(M_STEEL, size=(BX * 1.035, 0.085, 0.085), loc=(0, -HY + 0.02, z), bevel=0.015, bevel_seg=1)
    bus.cube(M_STEEL, size=(0.085, BY * 0.94, 0.085), loc=(HX - 0.02, 0, z), bevel=0.015, bevel_seg=1)
    bus.cube(M_STEEL, size=(0.085, BY * 0.94, 0.085), loc=(-HX + 0.02, 0, z), bevel=0.015, bevel_seg=1)

# 상단/하단 데크 판
bus.cube(M_BUS, size=(BX * 0.94, BY * 0.94, 0.06), loc=(0, 0, HZ + 0.055), bevel=0.02, bevel_seg=1)
bus.cube(M_BUS, size=(BX * 0.94, BY * 0.94, 0.06), loc=(0, 0, -HZ - 0.055), bevel=0.02, bevel_seg=1)

# 방열판(+Y 면) — 흰 패널 + 방열 핀
bus.cube(M_RAD, size=(BX * 0.74, 0.04, BZ * 0.62), loc=(0, HY + 0.035, 0.02), bevel=0.012, bevel_seg=1)
for i in range(4):
    bus.cube(M_STEEL, size=(BX * 0.76, 0.022, 0.02), loc=(0, HY + 0.062, -0.60 + i * 0.42))

# 장비 유닛 (-Y 면 / ±X 면)
bus.cube(M_BUS, size=(0.62, 0.11, 0.40), loc=(-0.42, -HY - 0.055, 0.52), bevel=0.02, bevel_seg=1)
bus.cube(M_GOLD, size=(0.46, 0.10, 0.30), loc=(0.52, -HY - 0.05, -0.44), bevel=0.02, bevel_seg=1)
bus.cube(M_BUS, size=(0.10, 0.44, 0.34), loc=(HX + 0.05, -0.42, -0.36), bevel=0.02, bevel_seg=1)
bus.cube(M_GOLD, size=(0.10, 0.34, 0.36), loc=(-HX - 0.05, 0.40, 0.46), bevel=0.02, bevel_seg=1)
# 배관/하니스
bus.cyl(M_STEEL, r1=0.028, depth=BZ * 0.9, seg=6, loc=(HX + 0.06, 0.52, 0.0))

# --- 상단 데크 탑재물 ------------------------------------------------------- #
TOP = HZ + 0.085

# 스타트래커 2기(경통 + 차광 후드)
for sx in (0.52, -0.52):
    bus.cyl(M_BUS, r1=0.105, depth=0.30, seg=10, loc=(sx, 0.56, TOP + 0.15), rot=(20, 0, 0))
    bus.cyl(M_DARK, r1=0.125, r2=0.135, depth=0.10, seg=10, loc=(sx + 0.0, 0.62, TOP + 0.32), rot=(20, 0, 0))

# S-band 혼 안테나
bus.cyl(M_GOLD, r1=0.055, r2=0.14, depth=0.28, seg=10, loc=(0.0, -0.60, TOP + 0.14))
bus.cyl(M_DARK, r1=0.142, depth=0.018, seg=10, loc=(0.0, -0.60, TOP + 0.285))

# 자세제어 추력기 4기(모서리)
for sx in (1, -1):
    for sy in (1, -1):
        bus.cyl(M_STEEL, r1=0.04, r2=0.07, depth=0.12, seg=8, loc=(sx * 0.74, sy * 0.80, TOP + 0.055))

# 휩(모노폴) 안테나 2개
bus.cyl(M_STEEL, r1=0.014, depth=0.95, seg=6, loc=(0.80, -0.12, TOP + 0.47), rot=(0, 9, 0))
bus.cyl(M_STEEL, r1=0.014, depth=0.70, seg=6, loc=(-0.80, 0.16, TOP + 0.35), rot=(0, -12, 0))

# GPS 패치 안테나
bus.cube(M_RAD, size=(0.20, 0.20, 0.035), loc=(0.10, 0.06, TOP + 0.02))

bus.finalize(sharp_angle=30)

# --------------------------------------------------------------------------- #
# 2) 광학 탑재체 (나디르 = -Z)
# --------------------------------------------------------------------------- #
BOT = -HZ - 0.085
pay = Node("payload", origin=(0, 0, BOT))

pay.cube(M_GOLD_DK, size=(1.12, 1.12, 0.07), loc=(0, 0, BOT - 0.04), bevel=0.02, bevel_seg=1)
# 망원경 경통 (MLI 로 감싼 구간 + 노출 구간)
pay.cyl(M_GOLD, r1=0.45, depth=0.46, seg=16, loc=(0, 0, BOT - 0.30))
pay.cyl(M_DARK, r1=0.43, depth=0.92, seg=16, loc=(0, 0, BOT - 0.98))
for i in range(3):  # 보강 링
    pay.cyl(M_STEEL, r1=0.455, depth=0.03, seg=16, loc=(0, 0, BOT - 0.66 - i * 0.36))
# 차광 후드
pay.cyl(M_DARK, r1=0.44, r2=0.60, depth=0.52, seg=16, loc=(0, 0, BOT - 1.70))
pay.cyl(M_GOLD_DK, r1=0.615, depth=0.045, seg=16, loc=(0, 0, BOT - 1.96))
# 조리개 안쪽 배플 + 렌즈
pay.cyl(M_DARK, r1=0.53, depth=0.16, seg=16, loc=(0, 0, BOT - 1.88), caps=False)
pay.cyl(M_LENS, r1=0.40, depth=0.03, seg=16, loc=(0, 0, BOT - 1.84))
# 방사냉각기 포드 + 케이블 트레이
pay.cube(M_RAD, size=(0.15, 0.32, 0.50), loc=(0.53, 0.0, BOT - 0.78), bevel=0.02, bevel_seg=1)
pay.cyl(M_STEEL, r1=0.026, depth=1.0, seg=6, loc=(-0.46, 0.10, BOT - 0.75))

pay.finalize(sharp_angle=30)

# --------------------------------------------------------------------------- #
# 3) 태양전지 날개 2매 (±X, 총 폭 12 m)
# --------------------------------------------------------------------------- #
YOKE = HX + 0.55
PW, PL, PT = 1.92, 1.46, 0.055
GAP = 0.075

for side, sx in (("l", -1), ("r", 1)):
    w = Node("solar_%s" % side, origin=(sx * (HX + 0.06), 0, 0.10))
    w.cyl(M_STEEL, r1=0.072, depth=0.60, seg=10, loc=(sx * (HX + 0.34), 0, 0.10), rot=(0, 90, 0))
    w.cyl(M_BUS, r1=0.13, depth=0.20, seg=12, loc=(sx * YOKE, 0, 0.10), rot=(0, 90, 0))
    for i in range(3):
        x = sx * (YOKE + 0.14 + PL / 2 + i * (PL + GAP))
        w.solar_panel(M_CELL, M_STEEL, size=(PL, PW, PT), cells=(4, 6), loc=(x, 0, 0.10))
        w.cube(M_STEEL, size=(PL * 0.96, 0.05, 0.05), loc=(x, 0, 0.10 - PT / 2 - 0.02))
        if i < 2:
            hx = sx * (YOKE + 0.14 + PL * (i + 1) + GAP * i + GAP / 2)
            w.cyl(M_STEEL, r1=0.03, depth=PW * 0.86, seg=8, loc=(hx, 0, 0.10), rot=(90, 0, 0))
    w.finalize(sharp_angle=30)

# --------------------------------------------------------------------------- #
# 4) 고이득 접시 안테나 (-Y 붐 위, 지구쪽으로 기울임)
# --------------------------------------------------------------------------- #
R_DISH, F_DISH = 0.56, 0.44
ant = Node("antenna", origin=(0, -HY - 0.06, -0.62))

ant.cyl(M_STEEL, r1=0.05, depth=0.58, seg=8, loc=(0, -HY - 0.34, -0.62), rot=(90, 0, 0))
ant.sphere(M_BUS, r=0.115, u=10, v=6, loc=(0, -HY - 0.62, -0.62))
ant.cyl(M_BUS, r1=0.085, depth=0.20, seg=8, loc=(0, -HY - 0.70, -0.70), rot=(-124, 0, 0))

with ant.frame(loc=(0, -HY - 0.80, -0.80), rot=(-124, 0, 0)) as f:
    ZR = R_DISH ** 2 / (4 * F_DISH)          # 림 높이
    f.dish(M_STEEL, radius=R_DISH, focal=F_DISH, rings=3, seg=18, thickness=0.018)
    f.cyl(M_GOLD_DK, r1=R_DISH + 0.014, depth=0.026, seg=18, loc=(0, 0, ZR))   # 림
    f.cyl(M_BUS, r1=0.13, depth=0.10, seg=10, loc=(0, 0, -0.06))               # 허브
    # 뒷면 방사형 리브 6개 — 뒤에서 봐도 하드웨어로 보이게
    for a in range(6):
        with f.frame(rot=(0, 0, a * 60)):
            f.cube(M_STEEL, size=(R_DISH * 0.92, 0.028, 0.05), loc=(R_DISH * 0.5, 0, ZR * 0.42), rot=(0, -22, 0))
    # 급전혼(초점) + 3점 지지대
    f.cyl(M_GOLD, r1=0.045, r2=0.085, depth=0.15, seg=8, loc=(0, 0, F_DISH - 0.02), rot=(180, 0, 0))
    for a in (0, 120, 240):
        with f.frame(rot=(0, 0, a)):
            f.cyl(M_STEEL, r1=0.012, depth=0.52, seg=5, loc=(R_DISH * 0.40, 0, F_DISH * 0.60), rot=(0, 26, 0))

ant.finalize(sharp_angle=30)

export_glb(OUT)
