# -*- coding: utf-8 -*-
"""
drone.glb — LX 측량용 쿼드콥터.

  blender -b -P tools/models/drone.py

흰색/그레이 바디 + 카본 암 4개 + 짐벌 카메라 + 회전 가능한 로터 4개.
스케일 1 unit = 1 m (프로펠러 포함 폭 약 1.0 m).
전방 = Blender +Y → glTF -Z (glTF 기준 기수는 -Z).
로터는 각각 rotor_0..3 노드이며, 노드 원점이 모터 축 위에 있어 glTF +Y 축 회전으로 돌린다.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lxbuild import Node, export_glb, material, reset_scene  # noqa: E402

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "landxi", "assets", "proto", "models", "drone.glb",
)

reset_scene()

# --------------------------------------------------------------------------- #
# 머티리얼 (LX 브랜드 블루 #006DF7 액센트)
# --------------------------------------------------------------------------- #
M_SHELL = material("Shell_White", "#E9ECF0", metallic=0.05, roughness=0.34)
M_GREY = material("Shell_Grey", "#5C646E", metallic=0.25, roughness=0.42)
M_CARBON = material("Carbon", "#22262C", metallic=0.35, roughness=0.38)
M_DARK = material("Body_Dark", "#171A1F", metallic=0.30, roughness=0.45)
M_ALU = material("Motor_Alu", "#A8AEB6", metallic=0.95, roughness=0.24)
M_BLUE = material("LX_Blue", "#006DF7", metallic=0.15, roughness=0.32)
M_GLASS = material("Lens_Glass", "#0A1418", metallic=1.0, roughness=0.06)
M_LED_R = material("LED_Red", "#FF2A2A", metallic=0.0, roughness=0.25, emission="#FF2A2A", emission_strength=3.5)
M_LED_G = material("LED_Green", "#22FF7A", metallic=0.0, roughness=0.25, emission="#22FF7A", emission_strength=3.5)

# --------------------------------------------------------------------------- #
# 1) 동체
# --------------------------------------------------------------------------- #
body = Node("body")

# 상부 셸 — +Y(기수) 로 갈수록 좁아지는 유선형 로프트
SHELL = [
    (-0.175, 0.042, 0.026),
    (-0.140, 0.088, 0.048),
    (-0.075, 0.116, 0.060),
    (0.000, 0.120, 0.062),
    (0.075, 0.112, 0.057),
    (0.140, 0.078, 0.042),
    (0.180, 0.034, 0.022),
    (0.198, 0.008, 0.007),
]
body.loft(M_SHELL, SHELL, seg=14, rot=(-90, 0, 0), loc=(0, 0, 0.012))

# 하부 벨리 팬 (어두운 그레이) — 셸보다 살짝 작게 겹쳐 실루엣을 나눈다
BELLY = [
    (-0.150, 0.048, 0.020),
    (-0.100, 0.096, 0.032),
    (0.000, 0.118, 0.040),
    (0.090, 0.104, 0.035),
    (0.155, 0.058, 0.022),
    (0.180, 0.016, 0.010),
]
body.loft(M_DARK, BELLY, seg=12, rot=(-90, 0, 0), loc=(0, 0, -0.030))

# 상단 방열 그릴 + LX 블루 액센트 스트라이프
body.cube(M_GREY, size=(0.11, 0.13, 0.012), loc=(0, -0.055, 0.070), bevel=0.004, bevel_seg=1)
for i in range(3):
    body.cube(M_DARK, size=(0.10, 0.014, 0.014), loc=(0, -0.095 + i * 0.038, 0.074))
body.cube(M_BLUE, size=(0.238, 0.030, 0.010), loc=(0, 0.010, 0.052), bevel=0.004, bevel_seg=1)

# 기수 비전 센서 창 2개 + 전방 LED
body.cube(M_GLASS, size=(0.046, 0.012, 0.030), loc=(0.052, 0.168, 0.006), rot=(-16, 0, 0))
body.cube(M_GLASS, size=(0.046, 0.012, 0.030), loc=(-0.052, 0.168, 0.006), rot=(-16, 0, 0))

# GPS 안테나 돔 (상단 후방)
body.cyl(M_SHELL, r1=0.036, depth=0.016, seg=10, loc=(0, -0.118, 0.062))
body.sphere(M_GREY, r=0.034, u=10, v=4, loc=(0, -0.118, 0.070), scale=(1, 1, 0.42))

# 배터리 팩 (후방 슬롯)
body.cube(M_DARK, size=(0.150, 0.075, 0.062), loc=(0, -0.150, 0.010), bevel=0.008, bevel_seg=1)
body.cube(M_GREY, size=(0.120, 0.010, 0.020), loc=(0, -0.190, 0.010))

# --------------------------------------------------------------------------- #
# 2) 암 4개 + 모터 + 랜딩 기어 (X 배열, 대각 0.70 m)
# --------------------------------------------------------------------------- #
ARM_R = 0.400          # 중심 → 모터 축 거리
ARM_A = (45, 135, 225, 315)
MOTOR_Z = 0.030        # 모터 축 밑면 높이(암이 살짝 위로 뻗음)
motor_pos = []

for k, a in enumerate(ARM_A):
    with body.frame(rot=(0, 0, a)) as f:
        # 암 (뿌리 → 끝으로 가늘어지는 카본 파이프, 살짝 상반각)
        f.cyl(M_CARBON, r1=0.026, r2=0.017, depth=ARM_R - 0.09, seg=8,
              loc=(0, (0.09 + ARM_R) / 2, 0.014), rot=(-86, 0, 0))
        # 암 뿌리 커버
        f.cube(M_GREY, size=(0.060, 0.075, 0.044), loc=(0, 0.115, 0.012))
        # 모터 마운트
        f.cyl(M_GREY, r1=0.030, depth=0.030, seg=10, loc=(0, ARM_R, MOTOR_Z - 0.006))
        # 모터 (스테이터 알루 캔 + 벨 하우징 + LX 블루 링)
        f.cyl(M_ALU, r1=0.026, depth=0.026, seg=12, loc=(0, ARM_R, MOTOR_Z + 0.020))
        f.cyl(M_DARK, r1=0.028, depth=0.014, seg=12, loc=(0, ARM_R, MOTOR_Z + 0.038))
        f.cyl(M_BLUE, r1=0.0285, depth=0.005, seg=12, loc=(0, ARM_R, MOTOR_Z + 0.031))
        # 랜딩 기어 (암 끝에서 아래로, 발끝 패드)
        f.cyl(M_CARBON, r1=0.010, r2=0.008, depth=0.135, seg=6,
              loc=(0, ARM_R - 0.030, -0.055), rot=(9, 0, 0))
        f.cyl(M_DARK, r1=0.017, depth=0.012, seg=6, loc=(0, ARM_R - 0.052, -0.122))
        # 항법등 (앞 2개 초록 / 뒤 2개 빨강)
        led = M_LED_G if a in (45, 315) else M_LED_R
        f.cyl(led, r1=0.009, depth=0.008, seg=6, loc=(0, ARM_R + 0.026, MOTOR_Z - 0.004), rot=(90, 0, 0))
    motor_pos.append((math.sin(math.radians(a)) * ARM_R * -1, math.cos(math.radians(a)) * ARM_R, MOTOR_Z))

body.finalize(sharp_angle=34)

# --------------------------------------------------------------------------- #
# 3) 짐벌 카메라 (기수 아래)
# --------------------------------------------------------------------------- #
gim = Node("gimbal", origin=(0, 0.132, -0.052))
gim.cyl(M_DARK, r1=0.018, depth=0.042, seg=8, loc=(0, 0.132, -0.028))        # 요 축
gim.cube(M_GREY, size=(0.096, 0.028, 0.032), loc=(0, 0.132, -0.056), bevel=0.006, bevel_seg=1)  # 롤 요크
gim.cube(M_DARK, size=(0.068, 0.082, 0.060), loc=(0, 0.134, -0.084), bevel=0.012, bevel_seg=1)  # 카메라 바디
gim.cyl(M_ALU, r1=0.026, depth=0.034, seg=12, loc=(0, 0.180, -0.086), rot=(-90, 0, 0))          # 렌즈 배럴
gim.cyl(M_DARK, r1=0.029, depth=0.010, seg=12, loc=(0, 0.199, -0.086), rot=(-90, 0, 0))         # 후드
gim.cyl(M_GLASS, r1=0.021, depth=0.006, seg=12, loc=(0, 0.201, -0.086), rot=(-90, 0, 0))        # 렌즈
gim.cyl(M_BLUE, r1=0.0275, depth=0.004, seg=12, loc=(0, 0.190, -0.086), rot=(-90, 0, 0))        # 액센트 링
gim.finalize(sharp_angle=34)

# --------------------------------------------------------------------------- #
# 4) 로터 4개 — rotor_0..3 (glTF +Y 축으로 회전)
# --------------------------------------------------------------------------- #
# 스팬 방향으로 코드/두께/피치가 변하는 실제 프로펠러 단면
BLADE = [
    (0.016, 0.0150, 0.0058, 0, 26),
    (0.044, 0.0288, 0.0048, 0, 19),
    (0.083, 0.0328, 0.0038, 0, 13),
    (0.124, 0.0270, 0.0030, 0, 8),
    (0.161, 0.0150, 0.0021, 0, 5),
    (0.175, 0.0023, 0.0007, 0, 4),
]
BLADE_TIP = [(z, rx, ry, off, tw) for (z, rx, ry, off, tw) in BLADE]

for k, a in enumerate(ARM_A):
    px = math.sin(math.radians(a)) * ARM_R * -1
    py = math.cos(math.radians(a)) * ARM_R
    hub_z = MOTOR_Z + 0.048
    r = Node("rotor_%d" % k, origin=(px, py, hub_z))
    with r.frame(loc=(px, py, hub_z), rot=(0, 0, a + 20)) as f:
        # 허브 + 잠금 너트
        f.cyl(M_DARK, r1=0.017, depth=0.012, seg=10)
        f.cyl(M_ALU, r1=0.009, depth=0.010, seg=8, loc=(0, 0, 0.010))
        # 2엽 블레이드 (짝수/홀수 로터는 회전 방향이 반대이므로 피치를 뒤집는다)
        flip = 1 if k % 2 == 0 else -1
        for b in (0, 180):
            with f.frame(rot=(0, 0, b)):
                st = [(z, rx, ry, off, tw * flip) for (z, rx, ry, off, tw) in BLADE_TIP]
                f.loft(M_DARK, st, seg=6, rot=(0, 90, 0), loc=(0, 0, 0.0))
                # 팁 마킹
                f.cube(M_SHELL, size=(0.030, 0.019, 0.0040), loc=(0.152, 0, 0.0))
    r.finalize(sharp_angle=40)

export_glb(OUT)
