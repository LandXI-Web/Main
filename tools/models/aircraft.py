# -*- coding: utf-8 -*-
"""
aircraft.glb — 소형 항공측량기 (세스나 172 계열: 고익 + 스트럿 + 단발 프로펠러).

  blender -b -P tools/models/aircraft.py

스케일 1 unit = 1 m (익폭 10 m, 전장 약 8 m).
전방 = Blender +Y → glTF -Z. 프로펠러는 `prop` 노드이며 glTF 기준 Z축(기수-꼬리 축)으로 회전한다.
"""

import os
import sys

sys.dont_write_bytecode = True          # tools/models/ 에 __pycache__ 를 남기지 않는다
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lxbuild import AIRFOIL, Node, export_glb, material, reset_scene  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "landxi", "assets", "proto", "models", "aircraft.glb",
)

reset_scene()

# --------------------------------------------------------------------------- #
# 머티리얼
# --------------------------------------------------------------------------- #
M_WHITE = material("Skin_White", "#ECEEF1", metallic=0.10, roughness=0.30)
M_GREY = material("Skin_Grey", "#7E868F", metallic=0.55, roughness=0.34)
M_BLUE = material("LX_Blue", "#006DF7", metallic=0.15, roughness=0.28)
M_NAVY = material("LX_Navy", "#0B2E5C", metallic=0.20, roughness=0.32)
M_DARK = material("Body_Dark", "#1B1E23", metallic=0.30, roughness=0.45)
M_ALU = material("Alu", "#B2B8C0", metallic=0.95, roughness=0.22)
M_GLASS = material("Cabin_Glass", "#16303C", metallic=0.9, roughness=0.08)
M_TIRE = material("Tire", "#191B1E", metallic=0.0, roughness=0.85)
M_PROP = material("Prop_Black", "#232629", metallic=0.35, roughness=0.40)
M_TIP = material("Prop_Tip", "#F2C230", metallic=0.0, roughness=0.35)
M_LED_R = material("Nav_Red", "#FF2A2A", metallic=0.0, roughness=0.25, emission="#FF2A2A", emission_strength=3.0)
M_LED_G = material("Nav_Green", "#22FF7A", metallic=0.0, roughness=0.25, emission="#22FF7A", emission_strength=3.0)

AF = AIRFOIL

# --------------------------------------------------------------------------- #
# 1) 동체 + 미익 + 창 + 랜딩기어  (노드: fuselage)
# --------------------------------------------------------------------------- #
fus = Node("fuselage")

# 동체 로프트: (y, 반폭, 반높이, 아래로 오프셋).  rot=(-90,0,0) 으로 로컬 +Z → 월드 +Y(기수).
BODY = [
    (-4.55, 0.05, 0.09, -0.60),   # 테일콘 끝(중심선보다 위)
    (-4.05, 0.15, 0.21, -0.52),
    (-3.20, 0.27, 0.34, -0.38),
    (-2.30, 0.39, 0.48, -0.21),
    (-1.40, 0.49, 0.60, -0.08),
    (-0.55, 0.56, 0.67, -0.01),
    (0.35, 0.58, 0.70, 0.00),     # 캐빈
    (1.15, 0.55, 0.65, -0.03),
    (1.75, 0.49, 0.56, -0.07),    # 방화벽
]
fus.loft(M_WHITE, BODY, seg=14, rot=(-90, 0, 0))

# 동체 상부 스파인(캐빈 지붕 → 테일) 을 덮는 얇은 그레이 밴드는 생략하고,
# 대신 LX 블루 치트라인을 동체 양옆에 붙인다.
for sx in (1, -1):
    fus.cube(M_BLUE, size=(0.035, 4.10, 0.110), loc=(sx * 0.520, -1.10, -0.02), rot=(0, 0, sx * 1.8))
    fus.cube(M_NAVY, size=(0.032, 3.90, 0.045), loc=(sx * 0.528, -1.10, -0.16), rot=(0, 0, sx * 1.8))

# 캐빈 창 (앞유리 + 좌우 측면창 2쌍)
fus.cube(M_GLASS, size=(0.92, 0.10, 0.62), loc=(0, 1.28, 0.44), rot=(-42, 0, 0))
fus.cube(M_GLASS, size=(0.055, 0.20, 0.40), loc=(0, 1.44, 0.30), rot=(-42, 0, 0))
for sx in (1, -1):
    fus.cube(M_GLASS, size=(0.045, 0.78, 0.42), loc=(sx * 0.565, 0.62, 0.34), rot=(0, 0, sx * 2.0))
    fus.cube(M_GLASS, size=(0.045, 0.62, 0.36), loc=(sx * 0.552, -0.30, 0.32), rot=(0, 0, sx * 2.0))
# 창틀(유리 뒤에 살짝 큰 다크 프레임)
fus.cube(M_DARK, size=(0.98, 0.07, 0.68), loc=(0, 1.26, 0.44), rot=(-42, 0, 0))
for sx in (1, -1):
    fus.cube(M_DARK, size=(0.030, 0.84, 0.48), loc=(sx * 0.556, 0.62, 0.34), rot=(0, 0, sx * 2.0))
    fus.cube(M_DARK, size=(0.030, 0.68, 0.42), loc=(sx * 0.543, -0.30, 0.32), rot=(0, 0, sx * 2.0))
# 도어 라인
for sx in (1, -1):
    fus.cube(M_GREY, size=(0.028, 1.00, 0.018), loc=(sx * 0.575, 0.55, -0.12))
# 노즈 안티글레어 패널 (앞유리 앞쪽 무광 다크)
fus.cube(M_DARK, size=(0.62, 0.66, 0.030), loc=(0, 1.72, 0.475), rot=(-9, 0, 0))

# 항공측량 카메라 포트 (동체 하부 해치 + 렌즈)
fus.cube(M_DARK, size=(0.52, 0.62, 0.10), loc=(0, -0.45, -0.70), bevel=0.02, bevel_seg=1)
fus.cyl(M_ALU, r1=0.19, depth=0.10, seg=14, loc=(0, -0.45, -0.78))
fus.cyl(M_GLASS, r1=0.155, depth=0.03, seg=14, loc=(0, -0.45, -0.84))

# --- 수직미익 (앞전 후퇴 + 도살핀) ------------------------------------------ #
fus.loft(M_WHITE, [
    (0.28, 0.095, 0.92, -3.62),
    (0.73, 0.085, 0.82, -3.72),
    (1.02, 0.072, 0.678, -3.816),
], profile=AF)
fus.loft(M_BLUE, [
    (1.015, 0.0722, 0.680, -3.815),
    (1.18, 0.065, 0.60, -3.90),
    (1.46, 0.045, 0.42, -4.02),
    (1.58, 0.022, 0.30, -4.08),
], profile=AF)
# 도살핀(수직미익 앞쪽 필렛)
fus.loft(M_WHITE, [(0.05, 0.055, 0.52, -3.16), (0.34, 0.075, 0.78, -3.50)], profile=AF)

# --- 수평미익 ---------------------------------------------------------------- #
for sx in (1, -1):
    fus.loft(M_WHITE, [
        (0.00, 0.055, 0.44, 0.00),
        (0.85, 0.050, 0.42, 0.03),
        (1.52, 0.040, 0.34, 0.09),
        (1.72, 0.020, 0.27, 0.13),
    ], profile=AF, rot=(0, sx * 90, 0), loc=(0, -3.88, 0.24))
    # 승강타 밸런스 혼
    fus.cube(M_WHITE, size=(0.12, 0.22, 0.035), loc=(sx * 1.66, -4.26, 0.26))

# --- 랜딩 기어 ---------------------------------------------------------------- #
# 메인 기어: 스프링 스틸 레그 + 타이어 + 휠 팬츠
for sx in (1, -1):
    fus.cyl(M_ALU, r1=0.070, r2=0.048, depth=1.11, seg=6,
            loc=(sx * 0.62, -0.32, -0.72), rot=(0, sx * 111, 0))
    fus.cyl(M_TIRE, r1=0.28, depth=0.15, seg=14, loc=(sx * 1.18, -0.32, -0.95), rot=(0, 90, 0))
    fus.cyl(M_ALU, r1=0.110, depth=0.17, seg=10, loc=(sx * 1.18, -0.32, -0.95), rot=(0, 90, 0))
    # 휠 팬츠(유선형 페어링)
    fus.loft(M_WHITE, [
        (-0.10, 0.110, 0.42, 0.0),
        (0.00, 0.126, 0.45, 0.0),
        (0.10, 0.110, 0.42, 0.0),
    ], profile=AF, rot=(0, 90, 0), loc=(sx * 1.18, -0.30, -0.91))
# 노즈 기어
fus.cyl(M_ALU, r1=0.068, r2=0.052, depth=0.52, seg=6, loc=(0, 1.60, -0.76), rot=(-10, 0, 0))
fus.cyl(M_TIRE, r1=0.22, depth=0.13, seg=12, loc=(0, 1.55, -1.01), rot=(0, 90, 0))
fus.cyl(M_ALU, r1=0.085, depth=0.15, seg=8, loc=(0, 1.55, -1.01), rot=(0, 90, 0))

# --- 잡부품: 안테나 / 피토관 / 비콘 -------------------------------------------- #
fus.loft(M_WHITE, [(0.0, 0.020, 0.16, 0.0), (0.22, 0.012, 0.11, 0.03)], profile=AF, loc=(0, -1.55, 0.55))
fus.cyl(M_ALU, r1=0.012, depth=0.55, seg=5, loc=(0, -2.60, 0.60), rot=(-78, 0, 0))
fus.cyl(M_LED_R, r1=0.040, depth=0.05, seg=8, loc=(0, -3.55, 0.62))

fus.finalize(sharp_angle=34)

# --------------------------------------------------------------------------- #
# 2) 주익 (고익, 익폭 10 m) + 스트럿  (노드: wing)
# --------------------------------------------------------------------------- #
WZ = 0.70           # 주익 기준면 높이
wing = Node("wing", origin=(0, 0, WZ))

# 캐빈 지붕 위 중앙 익근 페어링
wing.loft(M_WHITE, [
    (-0.42, 0.115, 0.80, 0.0),
    (0.00, 0.125, 0.82, 0.0),
    (0.42, 0.115, 0.80, 0.0),
], profile=AF, rot=(0, 90, 0), loc=(0, 0.28, WZ - 0.02))

PANEL = [
    (0.42, 0.105, 0.80, 0.00, 0),
    (2.20, 0.100, 0.79, 0.02, 0),
    (3.60, 0.082, 0.66, 0.12, -1.2),
    (4.70, 0.062, 0.53, 0.22, -2.0),
    (4.98, 0.030, 0.46, 0.26, -2.4),
]
for sx in (1, -1):
    with wing.frame(loc=(0, 0.28, WZ), rot=(0, 0, 0)) as f:
        # 상반각 2.5°
        with f.frame(rot=(0, -sx * 2.5, 0)):
            f.loft(M_WHITE, PANEL, profile=AF, rot=(0, sx * 90, 0))
            # 익단 블루 + 항법등
            f.loft(M_BLUE, [
                (4.60, 0.066, 0.55, 0.21, 0),
                (4.99, 0.030, 0.46, 0.26, 0),
            ], profile=AF, rot=(0, sx * 90, 0))
            led = M_LED_G if sx > 0 else M_LED_R
            f.cyl(led, r1=0.045, depth=0.05, seg=8, loc=(sx * 5.00, -0.26, 0), rot=(0, sx * 90, 0))
            # 플랩/에일러론 분할선
            f.cube(M_GREY, size=(4.30, 0.022, 0.030), loc=(sx * 2.72, 0.62, -0.02))
            # 스트로브
            f.cube(M_ALU, size=(0.10, 0.16, 0.03), loc=(sx * 4.86, 0.30, 0.02))

# 리프트 스트럿 (동체 하부 → 주익 중간) + 보조 스트럿
for sx in (1, -1):
    wing.loft(M_ALU, [
        (-1.24, 0.032, 0.115, 0.0),
        (1.24, 0.028, 0.100, 0.0),
    ], profile=AF, rot=(0, sx * 66.5, 0), loc=(sx * 1.52, 0.14, WZ - 0.52))
    wing.cyl(M_ALU, r1=0.026, depth=0.42, seg=5, loc=(sx * 1.30, 0.52, WZ - 0.44), rot=(56, sx * 20, 0))

wing.finalize(sharp_angle=34)

# --------------------------------------------------------------------------- #
# 3) 카울 + 배기 (노드: cowl)
# --------------------------------------------------------------------------- #
cowl = Node("cowl", origin=(0, 2.4, 0))
cowl.loft(M_WHITE, [
    (1.72, 0.495, 0.565, -0.07),
    (2.25, 0.455, 0.500, -0.11),
    (2.75, 0.375, 0.400, -0.14),
    (3.05, 0.290, 0.305, -0.15),
    (3.18, 0.230, 0.240, -0.15),
], seg=14, rot=(-90, 0, 0))
# 냉각 공기 흡입구 2개
for sx in (1, -1):
    cowl.cyl(M_DARK, r1=0.115, depth=0.10, seg=10, loc=(sx * 0.22, 3.14, 0.02), rot=(-84, 0, 0))
# 카울 상부 블루 라인
cowl.cube(M_BLUE, size=(0.30, 1.30, 0.030), loc=(0, 2.45, 0.44), rot=(6, 0, 0))
# 배기관
cowl.cyl(M_GREY, r1=0.055, depth=0.30, seg=6, loc=(-0.18, 2.55, -0.55), rot=(-70, 0, 0))
cowl.finalize(sharp_angle=34)

# --------------------------------------------------------------------------- #
# 4) 프로펠러 — `prop` 노드 (glTF Z축 = 기수-꼬리 축으로 회전)
# --------------------------------------------------------------------------- #
HUB_Y, HUB_Z = 3.20, -0.15
prop = Node("prop", origin=(0, HUB_Y, HUB_Z))

with prop.frame(loc=(0, HUB_Y, HUB_Z), rot=(-90, 0, 0)) as f:
    # 스피너 (프로펠러와 함께 회전)
    f.loft(M_ALU, [
        (-0.02, 0.235, 0.235),
        (0.16, 0.225, 0.225),
        (0.34, 0.160, 0.160),
        (0.46, 0.075, 0.075),
        (0.51, 0.0, 0.0),
    ], seg=14)
    f.cyl(M_DARK, r1=0.20, depth=0.06, seg=14, loc=(0, 0, 0.06))
    # 2엽 블레이드 — 스팬 방향으로 코드·두께·피치가 변한다
    BLADE = [
        (0.16, 0.055, 0.115, 0.0, 34),
        (0.36, 0.048, 0.135, 0.0, 25),
        (0.60, 0.038, 0.128, 0.0, 16),
        (0.82, 0.028, 0.105, 0.0, 10),
        (0.95, 0.012, 0.070, 0.0, 7),
    ]
    for b in (0, 180):
        with f.frame(rot=(0, 0, b)):
            f.loft(M_PROP, BLADE, profile=AF, rot=(0, 90, 0), loc=(0, 0, 0.10))
            f.loft(M_TIP, [(0.83, 0.027, 0.103, 0.0, 10), (0.96, 0.012, 0.070, 0.0, 7)],
                   profile=AF, rot=(0, 90, 0), loc=(0, 0, 0.10))

prop.finalize(sharp_angle=40)

export_glb(OUT)
