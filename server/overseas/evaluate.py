"""같은 시험 묶음(고정 목록)으로 우리 모델 · 공개 판정(Esri · WorldCover) 견주기 + 금 표본 후보(사람 확인용) — CPU 만(GPU 0).

  python -m overseas.evaluate --model overseas/job_… [--out 증거 폴더]

기준 정답 = ESA WorldCover 2021(사람이 만든 것이 아니라 위성 판정 — 진짜 정확도는 금 표본으로 다시 잰다).
견주는 것: 우리 모델(2021 달별 합성) · Esri/Impact Observatory 2021 · WorldCover 2020 — 모두 같은 시험 묶음 · 같은 화소.
2025 는 정답이 없으므로 우리 모델 2025 와 Esri 2025 가 얼마나 같은지(일치)만 · OSM 농경지 구획 안을 경작지로 그린 비율.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import numpy as np  # noqa: E402
from overseas import s2  # noqa: E402
from overseas.dataset import BLK, ESRI_LUT, NAMES, TRAIN, WC_LUT, block_grid  # noqa: E402

C = len(NAMES)
TGT = {"경작지": 2, "시가지": 3, "물·습지": 4}


def cm(pred, ref, mask=None):
    k = (ref != 255) & (pred != 255)
    if mask is not None:
        k &= mask
    return np.bincount(ref[k].astype(np.int64) * C + pred[k].astype(np.int64), minlength=C * C).reshape(C, C)


def summ(m) -> dict:
    out = {"oa": round(float(np.trace(m) / max(1, m.sum())), 4)}
    for ko, c in TGT.items():
        tp, fp, fn = float(m[c, c]), float(m[:, c].sum() - m[c, c]), float(m[c].sum() - m[c, c])
        out[ko] = {"f1": round(2 * tp / max(1, 2 * tp + fp + fn), 4), "iou": round(tp / max(1, tp + fp + fn), 4),
                   "precision": round(tp / max(1, tp + fp), 4), "recall": round(tp / max(1, tp + fn), 4)}
    return out


def predict(net, mu, sd, x):
    import torch
    f = s2.features(x)
    with torch.no_grad():
        t = (torch.from_numpy(f[None]) - mu) / sd
        p = net(t)[0]
    pred = p.argmax(0).numpy().astype(np.uint8)
    pred[~(x.reshape(-1, 6, *x.shape[1:])[:, 3] > 0).any(0)] = 255
    return pred


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--gold", type=int, default=29, help="주마다 금 표본 후보 수")
    a = ap.parse_args()
    import torch
    torch.set_num_threads(16)
    from national.common import pg
    from overseas.unet import load
    with pg() as c:
        row = c.execute("SELECT weights_uri FROM models WHERE id=%s", (a.model,)).fetchone()
    net, mu, sd, cfg = load(row[0], "cpu")
    sp = json.loads((TRAIN / "splits.json").read_text(encoding="utf-8"))
    tests = [b for b in sp["blocks"] if b["split"] == "test"]
    M = {k: np.zeros((C, C), np.int64) for k in ("ours21", "esri21", "wc20", "ours21_agree", "esri21_agree")}
    A = {k: np.zeros((C, C), np.int64) for k in ("ours25_vs_esri25", "ours21_vs_esri21")}
    osm = {k: [0, 0] for k in ("ours21", "wc21", "esri21", "ours25", "esri25")}
    per_ob: dict[str, dict] = {}
    rng = np.random.default_rng(20261015)
    gold = []
    vis = []
    for b in tests:
        p = BLK / f"{b['id']}.npz"
        if not p.exists():
            continue
        d = np.load(p)
        ref = WC_LUT[d["wc2021"]]
        wc20 = WC_LUT[d["wc2020"]]
        e21, e25 = ESRI_LUT[d["esri2021"]], ESRI_LUT[d["esri2025"]]
        o21 = predict(net, mu, sd, d["x2021"])
        o25 = predict(net, mu, sd, d["x2025"])
        agree = wc20 == ref
        M["ours21"] += cm(o21, ref)
        M["esri21"] += cm(e21, ref)
        M["wc20"] += cm(wc20, ref)
        M["ours21_agree"] += cm(o21, ref, agree)
        M["esri21_agree"] += cm(e21, ref, agree)
        A["ours25_vs_esri25"] += cm(o25, e25)
        A["ours21_vs_esri21"] += cm(o21, e21)
        po = per_ob.setdefault(b["oblast"], {"ours21": np.zeros((C, C), np.int64), "esri21": np.zeros((C, C), np.int64)})
        po["ours21"] += cm(o21, ref)
        po["esri21"] += cm(e21, ref)
        om = d["osm"] > 0
        for k, arr in (("ours21", o21), ("wc21", ref), ("esri21", e21), ("ours25", o25), ("esri25", e25)):
            osm[k][0] += int((om & (arr == 2)).sum())
            osm[k][1] += int(om.sum())
        if len(vis) < 6 and b["stratum"] in ("crop", "built") and (len(vis) < 3 or b["stratum"] == "built"):
            vis.append((b, d["x2021"], ref, o21, e21))
        # 금 표본 후보(2025 · 사람이 고해상 영상 · 현장으로 확인) — 우리 2025 판정으로 층을 나눠 무작위
        g = block_grid(b)
        gold.append((b, g, o25, e25, ref))
    res = {"made_at": dt.datetime.now().isoformat(timespec="seconds"), "model": a.model, "test_blocks": len(tests),
           "test_chips": len(tests) * 16, "reference": "ESA WorldCover 2021(v200)",
           "vs_reference": {k: summ(v) for k, v in M.items()},
           "agreement_2025": {k: summ(v) for k, v in A.items()},
           "osm_farmland_as_cropland": {k: round(v[0] / max(1, v[1]), 4) for k, v in osm.items()},
           "osm_px": osm["wc21"][1],
           "per_oblast": {ob: {k: summ(v) for k, v in d_.items()} for ob, d_ in per_ob.items()}}
    out = Path(a.out) if a.out else TRAIN / "eval"
    out.mkdir(parents=True, exist_ok=True)
    (out / "eval.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    # 금 표본 후보
    from pyproj import Transformer
    quota = (("경작지", 2, 9), ("경작지 · Esri 와 다름", -1, 6), ("초지·관목", 1, 5), ("시가지", 3, 4), ("물", 4, 2), ("그 밖(나무 · 맨땅 · 눈)", -2, 3))
    by_ob: dict[str, list] = {}
    for item in gold:
        by_ob.setdefault(item[0]["oblast"], []).append(item)
    pts = []
    for ob, items in by_ob.items():
        for tag, cls, n in quota:
            cand = []
            for b, g, o25, e25, ref in items:
                if cls >= 0:
                    m = o25 == cls
                elif cls == -1:
                    m = (o25 == 2) != (e25 == 2)
                    m &= (o25 != 255) & (e25 != 255)
                else:
                    m = np.isin(o25, [0, 5])
                rr, cc = np.nonzero(m[8:-8, 8:-8])
                for r_, c_ in zip(rr[:: max(1, len(rr) // 40)], cc[:: max(1, len(rr) // 40)]):
                    cand.append((b, g, int(r_) + 8, int(c_) + 8, o25, e25, ref))
            if not cand:
                continue
            for i in rng.choice(len(cand), min(n, len(cand)), replace=False):
                b, g, r_, c_, o25, e25, ref = cand[int(i)]
                x = g.x0 + (c_ + 0.5) * 10
                y = g.y0 - (r_ + 0.5) * 10
                lon, lat = Transformer.from_crs(g.epsg, 4326, always_xy=True).transform(x, y)
                nm = lambda v: NAMES[v] if v < len(NAMES) else "판정 없음"  # noqa: E731
                pts.append({"id": f"G{len(pts) + 1:03d}", "oblast": ob, "block": b["id"], "stratum": tag, "lon": round(lon, 6), "lat": round(lat, 6),
                            "ours_2025": nm(int(o25[r_, c_])), "esri_2025": nm(int(e25[r_, c_])), "worldcover_2021": nm(int(ref[r_, c_])),
                            "check": "", "note": ""})
    with open(out / "gold-candidates.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(pts[0].keys()))
        w.writeheader()
        w.writerows(pts)
    (out / "gold-candidates.geojson").write_text(json.dumps({"type": "FeatureCollection", "name": "금 표본 후보 2025(사람 확인 전)", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [p_["lon"], p_["lat"]]}, "properties": p_} for p_ in pts]},
        ensure_ascii=False), encoding="utf-8")
    res["gold_candidates"] = len(pts)
    (out / "eval.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    # 그림 — 시험 묶음 몇 장(영상 7월 · 정답 · 우리 · Esri)
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.colors import ListedColormap
        plt.rcParams["font.family"] = ["Malgun Gothic", "sans-serif"]
        cmap = ListedColormap(["#2e7d32", "#c5e1a5", "#f9a825", "#d32f2f", "#1976d2", "#bdbdbd"])
        fig, ax = plt.subplots(len(vis), 4, figsize=(12, 3 * len(vis)))
        for i, (b, x, ref, o, e) in enumerate(vis):
            k = 3 * 6                                      # 7월
            rgb = np.stack([x[k + 2], x[k + 1], x[k]], -1).astype(np.float32) * 1e-4
            rgb = np.clip(rgb / 0.3, 0, 1) ** 0.6
            for j, (im, t) in enumerate(((rgb, f"{b['oblast']} · 영상 2021-07"), (ref, "WorldCover 2021"), (o, "우리 모델"), (e, "Esri 2021"))):
                ax[i, j].imshow(im if j == 0 else np.ma.masked_equal(im, 255), cmap=None if j == 0 else cmap, vmin=0, vmax=5, interpolation="nearest")
                ax[i, j].set_title(t, fontsize=11)
                ax[i, j].axis("off")
        fig.suptitle("시험 묶음(2.56 km) · 초록=나무 · 연두=초지 · 노랑=경작지 · 빨강=시가지 · 파랑=물 · 회색=맨땅·눈", fontsize=12)
        fig.tight_layout(rect=[0, 0, 1, 0.975])
        fig.savefig(out / "test-blocks.png", dpi=90)
    except Exception as e:  # noqa: BLE001
        print("그림 실패", repr(e))
    print(json.dumps({k: res[k] for k in ("vs_reference", "agreement_2025", "osm_farmland_as_cropland", "gold_candidates")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
