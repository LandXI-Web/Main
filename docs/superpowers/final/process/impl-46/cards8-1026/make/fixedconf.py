"""고정 신뢰도 하한에서 곤포 모델 재기(CPU · GPU 쓰지 않음) — 배경 평가 칸 100장의 오탐 수 + 남원 검증 칸 표본의 곤포 찾음/놓침.
  python fixedconf.py WEIGHTS TAG [N_POS]     (env FC_KIND=gh → 단동다동: 배경 평가 23칸 · 기록 검증 칸 표본 · 분류 무시하고 짝)
 짝 = 상자 IoU 0.5 이상(라벨 상자 ↔ 예측 상자) · 하한 0.25 · 0.5 · 0.8"""
import sys, glob, json, random, os
from pathlib import Path
os.environ.setdefault("OMP_NUM_THREADS", "8")
from ultralytics import YOLO
import numpy as np
W, TAG = sys.argv[1], sys.argv[2]; NP = int(sys.argv[3]) if len(sys.argv) > 3 else 120
D = Path("E:/Land-XI 플랫폼/02. 데이터/training")
KIND = os.environ.get("FC_KIND", "silage")          # silage | gh
if KIND == "gh":
    bg = sorted(glob.glob(str(D / "cards8-1026/gh-bg/eval/images/*.jpg")))
    pos = sorted(glob.glob("E:/namwon/Vinyl_house/images/val/*"))
else:
    bg = sorted(glob.glob(str(D / "cards8-1026/silage-bg/eval/images/*.jpg")))
    pos = sorted(glob.glob(str(D / "eval/silage-v1/images/val/*")))
random.seed(5); pos = sorted(random.sample(pos, min(NP, len(pos))))
m = YOLO(W)
TH = (0.25, 0.5, 0.8)
def boxes_of(lbl, w, h):
    out = []
    for ln in open(lbl, encoding="utf-8") if os.path.exists(lbl) else []:
        v = [float(x) for x in ln.split()[1:]]
        if len(v) >= 6:
            xs, ys = v[0::2], v[1::2]; out.append([min(xs) * w, min(ys) * h, max(xs) * w, max(ys) * h])
        elif len(v) == 4:
            cx, cy, bw, bh = v; out.append([(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h])
    return np.array(out).reshape(-1, 4)
def iou(a, b):
    x0 = np.maximum(a[:, None, 0], b[None, :, 0]); y0 = np.maximum(a[:, None, 1], b[None, :, 1])
    x1 = np.minimum(a[:, None, 2], b[None, :, 2]); y1 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x1 - x0, 0, None) * np.clip(y1 - y0, 0, None)
    aa = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1]); bb = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / np.maximum(aa[:, None] + bb[None, :] - inter, 1e-9)
res = {"weights": W, "bg_imgs": len(bg), "pos_imgs": len(pos), "bg_fp": {}, "bg_imgs_with_fp": {}, "pos": {}}
fp = {t: 0 for t in TH}; fpi = {t: 0 for t in TH}
for f in bg:
    r = m.predict(f, imgsz=1024, conf=0.25, device="cpu", verbose=False, retina_masks=False)[0]
    c = r.boxes.conf.numpy() if r.boxes is not None else np.zeros(0)
    for t in TH:
        n = int((c >= t).sum()); fp[t] += n; fpi[t] += int(n > 0)
tp = {t: 0 for t in TH}; fpp = {t: 0 for t in TH}; ngt = 0
for f in pos:
    r = m.predict(f, imgsz=1024, conf=0.25, device="cpu", verbose=False, retina_masks=False)[0]
    h, w = r.orig_shape
    lbl = f.replace("\\", "/").replace("/images/", "/labels/").rsplit(".", 1)[0] + ".txt"
    g = boxes_of(lbl, w, h); ngt += len(g)
    pb = r.boxes.xyxy.numpy() if r.boxes is not None else np.zeros((0, 4)); pc = r.boxes.conf.numpy() if r.boxes is not None else np.zeros(0)
    for t in TH:
        p = pb[pc >= t]
        if not len(p):
            continue
        if not len(g):
            fpp[t] += len(p); continue
        M = iou(p, g); used = set(); k = 0
        for i in np.argsort(-M.max(axis=1)):
            j = int(M[i].argmax())
            if M[i, j] >= 0.5 and j not in used:
                used.add(j); k += 1
        tp[t] += k; fpp[t] += len(p) - k
for t in TH:
    res["bg_fp"][str(t)] = fp[t]; res["bg_imgs_with_fp"][str(t)] = fpi[t]
    res["pos"][str(t)] = {"gt": ngt, "tp": tp[t], "fp": fpp[t], "recall": round(tp[t] / max(ngt, 1), 3), "precision_pos_tiles": round(tp[t] / max(tp[t] + fpp[t], 1), 3)}
out = Path(__file__).parent / f"fixedconf-{TAG}.json"; json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print(json.dumps(res, ensure_ascii=False))
