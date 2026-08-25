#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_clouds.py — Land-XI 클라우드 데크 텍스처 생성기.

목적: "구름을 뚫고 나오는" 시네마틱 스크롤 모먼트용 3개 패럴랙스 평면 텍스처
(far/mid/near)와 화이트아웃용 haze 텍스처를 생성한다. numpy + Pillow만 사용,
scikit-image/opensimplex는 없어도 되도록 자체 tileable value-noise fBm을 구현했다.

타일 가능성(가로/세로 wrap)은 격자 좌표를 grid_size로 modulo 인덱싱하는
고전적인 tileable value-noise 기법으로 보장한다 — 픽셀 해상도와 무관하게
연속 함수가 grid_size 주기로 정확히 반복되므로 이미지 경계에서 이음매가
생기지 않는다.

실행:
  "C:\\Users\\oem\\anaconda3\\envs\\yolo\\python.exe" tools/clouds/make_clouds.py
"""
from __future__ import annotations
import os
import numpy as np
from PIL import Image

OUT_DIR = os.path.join("landxi", "assets", "proto", "clouds")


# --------------------------------------------------------------------------
# 1. Tileable value-noise fBm
# --------------------------------------------------------------------------

def value_noise_tileable(width: int, height: int, grid_size: int, seed: int) -> np.ndarray:
    """격자점에 난수를 배치하고 quintic 보간으로 매끄럽게 잇는 tileable value noise.

    grid_size는 정수 셀 개수. 좌표를 grid_size로 modulo 인덱싱하기 때문에
    x=0 과 x=grid_size(=한 바퀴)의 값이 항상 같다 → 가로/세로 모두 완벽히 tileable.
    """
    grid_size = max(2, int(round(grid_size)))
    rng = np.random.default_rng(seed)
    lattice = rng.random((grid_size, grid_size)).astype(np.float32)

    xs = (np.arange(width, dtype=np.float32) / width) * grid_size
    ys = (np.arange(height, dtype=np.float32) / height) * grid_size
    X, Y = np.meshgrid(xs, ys)

    x0 = np.floor(X).astype(np.int64)
    y0 = np.floor(Y).astype(np.int64)
    fx = X - x0
    fy = Y - y0

    x0m = x0 % grid_size
    x1m = (x0 + 1) % grid_size
    y0m = y0 % grid_size
    y1m = (y0 + 1) % grid_size

    # quintic smoothstep (Perlin의 fade 함수) — 2차 미분까지 연속이라 경계가 더 부드럽다.
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)

    v00 = lattice[y0m, x0m]
    v10 = lattice[y0m, x1m]
    v01 = lattice[y1m, x0m]
    v11 = lattice[y1m, x1m]

    top = v00 * (1 - ux) + v10 * ux
    bot = v01 * (1 - ux) + v11 * ux
    return top * (1 - uy) + bot * uy


def fbm(width: int, height: int, octaves: int, base_grid: float, persistence: float,
        lacunarity: float, seed: int) -> np.ndarray:
    """여러 옥타브의 tileable value noise를 합산한 fractal Brownian motion. 결과는 [0,1]."""
    total = np.zeros((height, width), dtype=np.float32)
    amplitude = 1.0
    max_amp = 0.0
    freq = base_grid
    for o in range(octaves):
        layer = value_noise_tileable(width, height, freq, seed + o * 9973 + 1)
        total += layer * amplitude
        max_amp += amplitude
        amplitude *= persistence
        freq *= lacunarity
    return total / max_amp


def smoothstep(edge0: np.ndarray | float, edge1: np.ndarray | float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / np.maximum(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------
# 2. Shape helpers
# --------------------------------------------------------------------------

def coverage_threshold(field: np.ndarray, coverage: float) -> float:
    """field 값 중 상위 coverage 비율이 살아남도록 하는 임계값(percentile)."""
    return float(np.percentile(field, 100.0 * (1.0 - coverage)))


def macro_variation(width: int, height: int, grid_size: int, seed: int,
                     strength: float, octaves: int = 2) -> np.ndarray:
    """저주파 tileable 필드로 만든 [1-strength, 1+strength] 배율 필드.

    좌표를 뒤트는(domain-warp) 대신 곱셈 변조만 쓰기 때문에 개별 필드가 각각
    tileable 이면 곱도 그대로 tileable — 이음매 위험 없이 반복 패턴을 깨준다.
    """
    m = fbm(width, height, octaves, grid_size, 0.5, 2.0, seed)
    return 1.0 + (m * 2.0 - 1.0) * strength


def wrap_blur(field: np.ndarray, radius: int) -> np.ndarray:
    """wrap-around 박스 블러(분리형, 여러 번 누적) — tileable 유지, 고주파 노이즈만 죽여
    압축 크기를 줄이고 알파 가장자리를 더 부드럽게 만든다."""
    if radius <= 0:
        return field
    out = field
    for axis in (1, 0):
        acc = out.copy()
        for k in range(1, radius + 1):
            acc = acc + np.roll(out, k, axis=axis) + np.roll(out, -k, axis=axis)
        out = acc / (2 * radius + 1)
    return out


def wrap_gradient(field: np.ndarray):
    """np.roll 기반 중심차분 — wrap-around 이므로 결과 gradient도 tileable 유지."""
    gx = (np.roll(field, -1, axis=1) - np.roll(field, 1, axis=1)) * 0.5
    gy = (np.roll(field, -1, axis=0) - np.roll(field, 1, axis=0)) * 0.5
    return gx, gy


def directional_shade(height_field: np.ndarray, light_dir=(-0.45, -0.55, 0.7),
                       strength: float = 1.0) -> np.ndarray:
    """height_field를 의사 3D 표면으로 보고 좌상단 광원 기준 diffuse 음영을 계산한다."""
    gx, gy = wrap_gradient(height_field)
    lx, ly, lz = light_dir
    norm = np.sqrt(1.0 + (gx * strength) ** 2 + (gy * strength) ** 2)
    nx = -gx * strength / norm
    ny = -gy * strength / norm
    nz = 1.0 / norm
    diffuse = nx * lx + ny * ly + nz * lz
    return np.clip(diffuse, 0.0, 1.0)


# --------------------------------------------------------------------------
# 3. Cloud layer builder
# --------------------------------------------------------------------------

SHADOW_RGB = np.array([0xB8, 0xC6, 0xD6], dtype=np.float32)
WHITE_RGB = np.array([255, 255, 255], dtype=np.float32)


def make_cloud_layer(width: int, height: int, seed: int, *, base_grid: float, octaves: int,
                      persistence: float, lacunarity: float, coverage: float, softness: float,
                      macro_grid: float, macro_strength: float, alpha_gamma: float,
                      shade_gamma: float, shade_strength: float, max_alpha: float,
                      edge_whiten: float, blur_radius: int = 2) -> np.ndarray:
    n = fbm(width, height, octaves, base_grid, persistence, lacunarity, seed)

    macro = macro_variation(width, height, macro_grid, seed + 555, macro_strength)
    n_shaped = np.clip(n * macro, 0.0, 1.0)

    thresh = coverage_threshold(n_shaped, coverage)
    alpha = smoothstep(thresh - softness, thresh + softness, n_shaped)
    alpha = np.power(alpha, alpha_gamma) * max_alpha
    alpha = wrap_blur(alpha, blur_radius)

    # 음영: 두께(n_shaped)와 방향광 diffuse를 섞어 윗면 하이라이트 / 아랫면 블루그레이 생성.
    diffuse = directional_shade(n_shaped, strength=shade_strength)
    shade = np.clip(0.45 * n_shaped + 0.55 * diffuse, 0.0, 1.0)
    shade = np.power(shade, shade_gamma)
    shade = wrap_blur(shade, max(1, blur_radius - 1))

    rgb = SHADOW_RGB[None, None, :] + (WHITE_RGB - SHADOW_RGB)[None, None, :] * shade[:, :, None]

    # premultiplied 느낌: 가장자리(알파가 낮은 곳)일수록 흰색 쪽으로 살짝 당겨 다크 프린징 방지.
    edge = 1.0 - alpha
    rgb = rgb * (1 - edge[:, :, None] * edge_whiten) + WHITE_RGB[None, None, :] * (edge[:, :, None] * edge_whiten)

    rgba = np.dstack([
        np.clip(rgb[:, :, 0], 0, 255),
        np.clip(rgb[:, :, 1], 0, 255),
        np.clip(rgb[:, :, 2], 0, 255),
        np.clip(alpha * 255.0, 0, 255),
    ]).astype(np.uint8)
    return rgba


# --------------------------------------------------------------------------
# 4. Haze (radial white-out)
# --------------------------------------------------------------------------

def make_haze(size: int = 1024) -> np.ndarray:
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    cx = cy = size / 2.0
    d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / (size / 2.0)
    # 중심 = 완전 불투명, 가장자리로 갈수록 부드럽게 소멸.
    alpha = 1.0 - smoothstep(0.15, 1.0, d)
    alpha = np.power(np.clip(alpha, 0, 1), 0.85)
    rgba = np.dstack([
        np.full((size, size), 255, dtype=np.uint8),
        np.full((size, size), 255, dtype=np.uint8),
        np.full((size, size), 255, dtype=np.uint8),
        np.clip(alpha * 255.0, 0, 255).astype(np.uint8),
    ])
    return rgba


# --------------------------------------------------------------------------
# 5. Main
# --------------------------------------------------------------------------

def save_webp(arr: np.ndarray, path: str, quality: int = 82, alpha_quality: int = 80,
              max_kb: float = 400.0):
    img = Image.fromarray(arr, mode="RGBA")
    q, aq = quality, alpha_quality
    for _ in range(6):
        img.save(path, format="WEBP", quality=q, alpha_quality=aq, method=6)
        size_kb = os.path.getsize(path) / 1024.0
        if size_kb <= max_kb or (q <= 40 and aq <= 40):
            break
        q = max(40, q - 12)
        aq = max(40, aq - 12)
    size_kb = os.path.getsize(path) / 1024.0
    flag = "" if size_kb <= max_kb else "  !! OVER BUDGET"
    print(f"  {path}  {img.size[0]}x{img.size[1]}  {size_kb:.1f}KB (q={q},aq={aq}){flag}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    W = H = 2048

    print("far (thin high-frequency veil)...")
    far = make_cloud_layer(
        W, H, seed=101,
        base_grid=20, octaves=7, persistence=0.5, lacunarity=2.1,
        coverage=0.5, softness=0.22,
        macro_grid=3, macro_strength=0.3,
        alpha_gamma=1.9, shade_gamma=0.7, shade_strength=4.0,
        max_alpha=0.36, edge_whiten=0.7, blur_radius=2,
    )
    save_webp(far, os.path.join(OUT_DIR, "cloud_far.webp"), quality=78, alpha_quality=72)

    print("mid (broken deck, ~55% coverage, clear gaps)...")
    mid = make_cloud_layer(
        W, H, seed=202,
        base_grid=6, octaves=6, persistence=0.58, lacunarity=2.0,
        coverage=0.55, softness=0.10,
        macro_grid=3, macro_strength=0.4,
        alpha_gamma=1.15, shade_gamma=0.9, shade_strength=10.0,
        max_alpha=0.92, edge_whiten=0.45, blur_radius=2,
    )
    save_webp(mid, os.path.join(OUT_DIR, "cloud_mid.webp"), quality=80, alpha_quality=78)

    print("near (big soft billows, ~70% coverage)...")
    near = make_cloud_layer(
        W, H, seed=303,
        base_grid=3.2, octaves=6, persistence=0.62, lacunarity=2.05,
        coverage=0.70, softness=0.09,
        macro_grid=2, macro_strength=0.3,
        alpha_gamma=1.0, shade_gamma=0.75, shade_strength=14.0,
        max_alpha=0.98, edge_whiten=0.35, blur_radius=2,
    )
    save_webp(near, os.path.join(OUT_DIR, "cloud_near.webp"), quality=82, alpha_quality=80)

    print("haze (radial white-out)...")
    haze = make_haze(1024)
    save_webp(haze, os.path.join(OUT_DIR, "haze.webp"), quality=85, alpha_quality=85)

    print("done.")


if __name__ == "__main__":
    main()
