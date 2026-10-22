"""정리 전후 그림 — 같은 자리(남원 · 이웃 읍면동 분석이 같은 경작지를 두 번 잡은 곳이 가장 많은 자리) 2025 영상 위에
왼쪽 = AI 가 낸 원래 결과(보관본) · 오른쪽 = 정리 결과(지도 · 숫자가 읽는 것). 경계마다 옅은 채움 — 두 겹이면 진하게 보인다. 읽기 전용."""
import sys
from pathlib import Path
import numpy as np, shapely
import rasterio
from rasterio.windows import from_bounds
from rasterio.vrt import WarpedVRT
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MP
plt.rcParams["font.family"] = "Malgun Gothic"
sys.path.insert(0, r"E:/Land-XI 플랫폼/01. 디자인/server")
from national import tidy as T
from landxi_api.result_store import base, vector_of_base, read_features

H = Path(__file__).parent
IMG25 = r"E:/Land-XI 플랫폼/02. 데이터/national/imagery-api/ngii-air-2025.xml"
CX, CY, R = 127.362, 35.398, 0.0016


def objs(which):
    bb = (CX - R, CY - R, CX + R, CY + R)
    with T._pg() as c:
        jobs = c.execute("SELECT n.job_id FROM national_jobs n JOIN national_cells cc ON cc.asset=n.asset AND cc.year=n.year AND cc.cell_cd=n.cell_cd "
                         "WHERE n.asset='farm' AND n.year=2025 AND NOT n.test AND cc.state='done' AND n.state='done' AND n.model_id IS NOT DISTINCT FROM cc.model_id "
                         "AND n.bbox[1] <= %s AND n.bbox[3] >= %s AND n.bbox[2] <= %s AND n.bbox[4] >= %s", (bb[2], bb[0], bb[3], bb[1])).fetchall()
    out = []
    for (j,) in jobs:
        b = base("lx", j)
        p = T.raw_path(b) if which == "raw" else vector_of_base(b)
        for f in read_features(p, bbox=bb):
            if (f.get("properties") or {}).get("cls") == "경작지":
                out.append(shapely.from_geojson(__import__("json").dumps(f["geometry"])))
    return list(T.to_metric(out))


def dbl(G):
    G = np.asarray(G, dtype=object); A = shapely.area(G)
    i, j = shapely.STRtree(G).query(G, predicate="intersects"); m = i < j; i, j = i[m], j[m]
    r = shapely.area(shapely.intersection(G[i], G[j])) / np.minimum(A[i], A[j])
    return int((r >= 0.5).sum())


raw, clean = objs("raw"), objs("clean")
c = T.to_metric([shapely.Point(CX, CY)])[0]
half = 300
b = (c.x - half, c.y - half, c.x + half, c.y + half)
with rasterio.open(IMG25) as ds:
    v = WarpedVRT(ds, crs="EPSG:5186", resampling=1)
    w = from_bounds(*b, transform=v.transform)
    img = np.transpose(v.read([1, 2, 3], window=w, out_shape=(3, 1200, 1200)), (1, 2, 0))
fig, axs = plt.subplots(1, 2, figsize=(16, 8.6), dpi=110)
for ax, G, title in ((axs[0], raw, "정리 전 — AI가 낸 원래 결과(보관)"), (axs[1], clean, "정리 후 — 지도 · 숫자가 읽는 결과")):
    ax.imshow(img, extent=(b[0], b[2], b[1], b[3]))
    for g in G:
        for p in getattr(g, "geoms", [g]):
            if p.geom_type == "Polygon":
                ax.add_patch(MP(np.asarray(p.exterior.coords)[:, :2], closed=True, fc=(0.18, 0.62, 0.36, 0.28), ec=(1, 1, 1, 0.9), lw=0.7))
    ax.set_xlim(b[0], b[2]); ax.set_ylim(b[1], b[3]); ax.set_xticks([]); ax.set_yticks([])
    inb = [g for g in G if g.intersects(shapely.box(*b))]
    ax.set_title(f"{title}\n이 자리 경작지 경계 {len(inb):,}개 · 같은 것을 두 번(반 넘게 겹침) {dbl(inb):,}쌍", fontsize=13, loc="left")
fig.suptitle("남원 2025 전국 분석(농지) · 이웃 읍면동 · 조각 분석이 같은 경작지를 두 번 잡은 자리(600 m × 600 m) — 진한 초록 = 두 겹", fontsize=13, x=0.01, ha="left")
fig.tight_layout(rect=(0, 0, 1, 0.93))
fig.savefig(H.parent / "compare-namwon-dup.png")
print(len(raw), len(clean))
