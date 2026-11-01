"""산사태 취약지역 분석서비스 — 산림이 벗겨진 곳 찾기(10-31 PM "변화지역 분석만 잘하면 된다. 분석 성능이 낮아서 개선").

예전(후보 C · 10-28): 토지피복 ap25(산을 '비대상지'로 봄 · 산림 IoU 0.33 · 나지 0.0) + 지적 임야 필지로 산 범위를 대신함.
지금(landslide-d): 산림 변화용 토지피복 모델(6 묶음: 산림 · 건물 · 도로 · 경작 · 나지 · 수역 — AI 허브 124 · 125 · 126 25 cm 로
새로 학습 · 라벨 없는 곳은 학습에서 무시)을 두 시점에 돌려 화소마다 확률을 낸다.
  ① 앞 시점 산림(확률 p_forest_a 이상) — 임야 필지(여유 dilate_m) 안 · 또는 넓은 산림 덩어리(forest_block_m2 이상)에서 넓게(outside_min_m2) 벗겨진 곳
  ② 뒤 시점 산림 아님(산림 확률 p_forest_b_max 이하 · 1 순위가 건물 · 도로 · 경작 · 나지)
  ③ 두 시점 모두 보이는 곳(그림자 · 빈 곳 빼기 — 밝기 dark_a · dark_b) · 앞 시점 산림 가장자리 erode_m 안쪽(두 해 영상 어긋남)
  ③-1 덩어리 거름 — 뒤 시점 결(밝기 표준편차 tex_b_min 이상 · 흐린 촬영 띠 빼기) · 둘레(ring_m)의 산림이 뒤 시점에도 산림(ring_forest_b)
      · '산림 → 농지 · 초지'는 경작 확률 p_crop_b 이상일 때만(아니면 '산림 → 나지')
  ④ 덩어리마다 유형 — 뒤 시점 1 순위의 다수결: 건물 → '산림 → 건물' · 경작 → '산림 → 농지 · 초지' · 도로 → '산림 → 도로' · 나지 → '산림 → 나지'
     · 나지라도 길쭉하면(세장비 road_elong 이상) '산림 → 도로'(임도 · 절개)
     · 앞 시점에 이미 넓은 맨땅(quarry_min_m2 이상 · 채석장 · 공사장)에 붙어 넓어진 곳은 '채석장 · 개발지 확장'(따로 표시 · 기본 숨김 아님)
값은 config/landslide.yaml 한 곳(모델 경로 · 문턱) — 모델을 바꾸면 그 파일만 고친다(작업마다 다시 읽음).
"""
from __future__ import annotations

import threading
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

from landxi_api import config as _cfg

CFG_PATH = Path(__file__).resolve().parent.parent / "config" / "landslide.yaml"
FOREST, BUILT, ROAD, CROP, BARE, WATER = range(6)
T_BARE, T_ROAD, T_BUILT, T_CROP, T_QUARRY = "산림 → 나지", "산림 → 도로", "산림 → 건물", "산림 → 농지 · 초지", "채석장 · 개발지 확장"
TYPES = [T_BARE, T_ROAD, T_BUILT, T_CROP, T_QUARRY]
DEFAULT = {"model": "models/forest-change/forest6-r50-1031.pt", "version": "landslide-d", "p_forest_a": 0.6, "p_forest_b_max": 0.25,
           "dark_a": 22, "dark_b": 30, "dilate_m": 10, "forest_block_m2": 5000, "road_elong": 5.0, "quarry_min_m2": 3000, "min_area_m2": 100,
           "erode_m": 2.0, "ring_m": 30.0, "ring_forest_b": 0.5, "p_crop_b": 0.9, "tex_b_min": 10.0, "outside_min_m2": 2000}
_lock = threading.Lock()
_net: dict = {}
MEAN = np.array([0.485, 0.456, 0.406], np.float32) * 255
STD = np.array([0.229, 0.224, 0.225], np.float32) * 255


def cfg() -> dict:
    d = dict(DEFAULT)
    try:
        import yaml
        d.update(yaml.safe_load(CFG_PATH.read_text(encoding="utf-8")) or {})
    except Exception:  # noqa: BLE001
        pass
    return d


def model_path(c: dict | None = None) -> Path:
    p = Path((c or cfg())["model"])
    return p if p.is_absolute() else _cfg.DATA_ROOT / p


def available() -> bool:
    return model_path().is_file()


def load(device="cuda"):
    """설정의 모델(같은 경로 · 장치면 한 번만 올림)."""
    p = model_path()
    k = (str(p), str(device))
    with _lock:
        if k in _net:
            return _net[k]
        import segmentation_models_pytorch as smp
        import torch
        ck = torch.load(p, map_location="cpu", weights_only=False)
        net = smp.Unet(ck.get("encoder", "resnet50"), encoder_weights=None, classes=len(ck.get("names") or range(6)))
        net.load_state_dict(ck["state"])
        net = net.to(device).eval()
        _net.clear()
        _net[k] = net
        return net


def probs(net, rgb: np.ndarray, device="cuda", pause=None, tile: int = 1024, overlap: int = 128) -> np.ndarray:
    """RGB(H, W, 3) → 6 묶음 확률(6, H, W · float16). 칸 가장자리는 버리고 가운데만 이어 붙임."""
    import torch
    H, W = rgb.shape[:2]
    out = np.zeros((6, H, W), np.float16)
    blank = rgb.max(axis=2) < 8
    step = tile - overlap
    m = overlap // 2
    ys = list(range(0, max(1, H - overlap), step)) or [0]
    xs = list(range(0, max(1, W - overlap), step)) or [0]
    for y0 in ys:
        for x0 in xs:
            y1, x1 = min(y0 + tile, H), min(x0 + tile, W)
            if blank[y0:y1, x0:x1].mean() > 0.98:
                continue
            a = rgb[y0:y1, x0:x1].astype(np.float32)
            ph, pw = (32 - a.shape[0] % 32) % 32, (32 - a.shape[1] % 32) % 32
            if ph or pw:
                a = np.pad(a, ((0, ph), (0, pw), (0, 0)), mode="reflect")
            x = torch.from_numpy(((a - MEAN) / STD).transpose(2, 0, 1)[None]).to(device)
            with torch.no_grad(), torch.autocast("cuda", dtype=torch.float16, enabled=str(device).startswith("cuda")):
                p = torch.softmax(net(x).float(), 1)[0].cpu().numpy()[:, :y1 - y0, :x1 - x0]
            ty0 = 0 if y0 == 0 else m
            tx0 = 0 if x0 == 0 else m
            out[:, y0 + ty0:y1, x0 + tx0:x1] = p[:, ty0:, tx0:]
            if pause:
                pause()
    out[:, blank] = 0
    return out


def _lum(rgb):
    return rgb.astype(np.float32).mean(axis=2)


def _elong(mask: np.ndarray) -> float:
    """덩어리 세장비 — 주성분 두 축 길이 비(길 · 절개 띠 판정)."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 10:
        return 1.0
    c = np.cov(np.vstack([xs, ys]).astype(np.float64))
    ev = np.sort(np.linalg.eigvalsh(c))
    return float(np.sqrt(ev[1] / max(ev[0], 1e-6)))


def masks(PA: np.ndarray, PB: np.ndarray, A: np.ndarray, B: np.ndarray, res: float, imya: np.ndarray | None,
          aoi: np.ndarray | None = None, c: dict | None = None) -> dict[str, np.ndarray]:
    """두 시점 확률 → 유형별 마스크(덩어리마다 유형 하나)."""
    c = c or cfg()
    ca, cb = PA.argmax(0), PB.argmax(0)
    fa = (ca == FOREST) & (PA[FOREST] >= c["p_forest_a"])
    fa0 = fa
    # 산 범위 — 임야 필지(여유) 또는 넓은 산림 덩어리
    region = np.zeros(fa.shape, bool)
    if imya is not None and imya.any():
        k = max(1, int(round(c["dilate_m"] / res)))
        region |= ndi.binary_dilation(imya, iterations=k)
    in_imya = region.copy()
    # 넓은 산림 덩어리도 산 범위 — 지적은 지금 판이라 개발된 산(공장 · 태양광 부지)은 지목이 이미 바뀌어 임야가 아니다.
    # 임야 밖에서는 넓게 벗겨진 곳(outside_min_m2 이상)만 남긴다(밭 · 과수원 가장자리 오탐 막기 · 지적이 없는 지역은 이 기준만)
    lab, n = ndi.label(fa)
    if n:
        sz = np.bincount(lab.ravel())
        big = np.where(sz * res * res >= c["forest_block_m2"])[0]
        big = big[big > 0]
        if len(big):
            region |= np.isin(lab, big)
    # 두 해 영상 어긋남(1~3 m) · 나무 가장자리 그림자 — 앞 시점 산림 가장자리 erode_m 안쪽만
    ke = int(round(c["erode_m"] / res))
    if ke > 0:
        fa = ndi.binary_erosion(fa, iterations=ke)
    gone = (PB[FOREST] <= c["p_forest_b_max"]) & np.isin(cb, [BUILT, ROAD, CROP, BARE])
    LB = _lum(B)
    seen = (_lum(A) >= c["dark_a"]) & (LB >= c["dark_b"]) & (A.max(axis=2) > 0) & (B.max(axis=2) > 0)
    lost = fa & region & gone & seen
    if aoi is not None:
        lost &= aoi
    k1 = max(1, int(round(1.0 / res)))
    st = np.ones((2 * k1 + 1, 2 * k1 + 1), bool)
    lost = ndi.binary_closing(ndi.binary_opening(lost, structure=st), structure=st)
    out = {t: np.zeros(fa.shape, bool) for t in TYPES}
    lab, n = ndi.label(lost)
    if not n:
        return out
    # 앞 시점에 이미 넓은 맨땅(채석장 · 공사장) — 그 둘레에 붙어 넓어진 곳은 따로
    open_a = (ca == BARE) & ~fa
    ql, qn = ndi.label(open_a)
    quarry = np.zeros(fa.shape, bool)
    if qn:
        qs = np.bincount(ql.ravel())
        qb = np.where(qs * res * res >= c["quarry_min_m2"])[0]
        qb = qb[qb > 0]
        if len(qb):
            quarry = ndi.binary_dilation(np.isin(ql, qb), iterations=max(1, int(round(5.0 / res))))
    objs = ndi.find_objects(lab)
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        m = lab[sl] == i
        if m.sum() < 4:                          # 작은 조각도 남긴다 — 블록 경계에서 나뉜 것은 뒤(run.py)에서 이어 붙여 넓이로 거른다
            continue
        if in_imya[sl][m].mean() < 0.5 and m.sum() * res * res < c["outside_min_m2"]:
            continue
        # 결 검사 — 벗겨진 땅 · 길 · 건물은 뒤 시점 밝기에 결(표준편차)이 있다. 흐리게 찍힌 촬영 띠 · 안개는 결이 없다(남원 표본 10-31)
        if float(LB[sl][m].std()) < c["tex_b_min"]:
            continue
        # 둘레 검사 — 덩어리 둘레(ring_m)의 앞 시점 산림이 뒤 시점에도 산림으로 보여야(넓은 영역이 통째로 흐리거나 색이 다른 촬영 띠는 버림)
        if c["ring_m"] > 0:
            R = int(round(c["ring_m"] / res))
            y0, y1 = max(0, sl[0].start - R), min(lab.shape[0], sl[0].stop + R)
            x0, x1 = max(0, sl[1].start - R), min(lab.shape[1], sl[1].stop + R)
            mm = lab[y0:y1, x0:x1] == i
            ringall = (ndi.distance_transform_edt(~mm) <= R) & ~mm
            ring = ringall & fa0[y0:y1, x0:x1]
            if ring.sum() >= 0.2 * ringall.sum() and (PB[FOREST, y0:y1, x0:x1][ring] >= 0.5).mean() < c["ring_forest_b"]:
                continue
        votes = np.bincount(cb[sl][m], minlength=6)
        g = int(np.argmax(votes[[BUILT, ROAD, CROP, BARE]]))
        t = {0: T_BUILT, 1: T_ROAD, 2: T_CROP, 3: T_BARE}[g]
        if t == T_CROP and float(PB[CROP][sl][m].mean()) < c["p_crop_b"]:   # '새 밭'은 뒤 시점 경작 확률이 또렷할 때만 — 아니면 벗겨진 땅(나지)으로
            t = T_BARE
        if t == T_BARE and quarry[sl][m].any():
            t = T_QUARRY
        elif t in (T_BARE, T_CROP) and _elong(m) >= c["road_elong"]:
            t = T_ROAD
        out[t][sl] |= m
    return out
