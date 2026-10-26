"""축척 견딤 시험용 검증 묶음 — 기록 검증 칸(1024 · 드론 약 1.6 cm)을 n×n 으로 줄여 한 장(1024)에 모은다.
한 장 = 땅 n배 넓이(가로) · 해상도 1/n — 운영에서 upsample 1/n 으로 넣을 때와 같은 축척. (주의: 붙인 칸은 이웃 땅이 아님 → 넓은 맥락 효과는 못 잼 · 해상도 효과만)
  python val_mosaic.py growth|production N"""
import sys, glob, os, random
import numpy as np, cv2
kind, n = sys.argv[1], int(sys.argv[2])
SRC = f"E:/namwon/{kind}_baseline"
OUT = f"E:/Land-XI 플랫폼/02. 데이터/training/scale-1026/{kind}-s{n}"
os.makedirs(OUT + "/images/val", exist_ok=True); os.makedirs(OUT + "/labels/val", exist_ok=True)
ims = sorted(glob.glob(SRC + "/images/val/*.tif"))
random.Random(1026).shuffle(ims)
cell = 1024 // n
k = 0
for g in range(0, len(ims) - n * n + 1, n * n):
    canvas = np.zeros((cell * n, cell * n, 3), np.uint8); lab = []
    for j, f in enumerate(ims[g:g + n * n]):
        r, c = divmod(j, n)
        im = cv2.imread(f, cv2.IMREAD_COLOR)
        canvas[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = cv2.resize(im, (cell, cell), interpolation=cv2.INTER_AREA)
        lf = f.replace("/images/", "/labels/").replace("\images\\", "\labels\\").rsplit(".", 1)[0] + ".txt"
        if os.path.exists(lf):
            for ln in open(lf):
                v = ln.split()
                if len(v) < 7: continue
                p = np.array(v[1:], float).reshape(-1, 2)
                p = (p * cell + [c * cell, r * cell]) / (cell * n)
                lab.append(v[0] + " " + " ".join(f"{x:.6f}" for x in p.ravel()))
    nm = f"m{n}_{k:04d}"
    cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 95])[1].tofile(f"{OUT}/images/val/{nm}.jpg")   # 한글 경로 — imwrite 는 조용히 실패
    open(f"{OUT}/labels/val/{nm}.txt", "w").write("\n".join(lab) + ("\n" if lab else ""))
    k += 1
names = open(SRC + "/dataset.yaml", encoding="utf-8").read().split("path:")[0]
open(f"{OUT}/dataset.yaml", "w", encoding="utf-8").write(names + f"path: {OUT}\ntrain: images/val\nval: images/val\n")
print(kind, n, k, "장", OUT)
