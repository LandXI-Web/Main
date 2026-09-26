"""countCheck(F1-CONTRACT §6) — 서버 쪽 건수 대조. 1건이라도 다르면 실패(pytest · CLI 둘 다).

파일(원천) + DB(시드된 detections) 둘 다 본다: farmland 2,098 · greenhouse 1,674 · change 456 · landcover-2023 129,420
(건물 49,800 · 경작지 76,215 · 주차장 2,677 · 비닐하우스 728) · lc-gt 4,889 · sido 17 · sigungu 249 · emd 39 · P3 타일 88,404.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

REPO, DATA = config.REPO_ROOT, config.DATA_ROOT
EXPECT = {
    "farmland": 2098, "greenhouse": 1674, "change": 456, "landcover-2023": 129420,
    "landcover:건물": 49800, "landcover:경작지": 76215, "landcover:주차장": 2677, "landcover:비닐하우스": 728,
    "lc-gt": 4889, "sido": 17, "sigungu": 249, "emd": 39, "P3": 88404,
}


def _n(p: Path) -> int:
    return len(json.loads(p.read_text(encoding="utf-8"))["features"])


def file_counts() -> dict:
    geo = REPO / "landxi/assets/data/geo"
    out = {"farmland": _n(geo / "results/namwon-farmland-2025.geojson"), "greenhouse": _n(geo / "results/namwon-greenhouse-2025.geojson"),
           "change": _n(geo / "namwon-change.geojson"), "lc-gt": _n(DATA / "vector/namwon-lc-gt-2020.geojson"),
           "sido": _n(geo / "sido.geojson"), "sigungu": _n(geo / "sigungu.geojson"), "emd": _n(geo / "namwon-emd.geojson")}
    st = json.loads((DATA / "results/namwon-landcover-2023-emd-stats.json").read_text(encoding="utf-8"))["total"]
    out["landcover-2023"] = sum(v["n"] for v in st.values())
    for k, v in st.items():
        out[f"landcover:{k}"] = v["n"]
    m = config.manifest()["_by_id"]
    out["P3"] = m["namwon_ap25_2023.pmtiles"]["count"]
    # P3 PMTiles 헤더도 직접(타일 수 · addressed)
    from pmtiles.reader import MmapSource, Reader
    with open(DATA / "tiles/pmtiles/namwon_ap25_2023.pmtiles", "rb") as f:
        out["P3_header_addressed"] = Reader(MmapSource(f)).header()["addressed_tiles_count"]
    return out


def db_counts() -> dict:
    import psycopg
    q = {"farmland": "results/lx/namwon-farmland-2025", "greenhouse": "results/lx/namwon-greenhouse-2025", "change": "results/lx/namwon-change",
         "landcover-2023": "results/lx/namwon-landcover-2023"}
    out = {}
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        for k, j in q.items():
            out[k] = c.execute("SELECT count(*) FROM detections WHERE job_id=%s", (j,)).fetchone()[0]
        for cls, n in c.execute("SELECT cls, count(*) FROM detections WHERE job_id='results/lx/namwon-landcover-2023' GROUP BY cls").fetchall():
            out[f"landcover:{cls}"] = n
        out["tenants"] = c.execute("SELECT count(*) FROM tenants").fetchone()[0]
        out["cards"] = c.execute("SELECT count(*) FROM cards").fetchone()[0]
        out["card_versions"] = c.execute("SELECT count(*) FROM card_versions").fetchone()[0]
    return out


def check() -> list[str]:
    bad = []
    f, d = file_counts(), db_counts()
    for k, v in EXPECT.items():
        if f.get(k) != v:
            bad.append(f"file {k}: {f.get(k)} ≠ {v}")
        if k in d and d[k] != v:
            bad.append(f"db {k}: {d[k]} ≠ {v}")
    if f["P3_header_addressed"] != EXPECT["P3"]:
        bad.append(f"P3 header {f['P3_header_addressed']} ≠ {EXPECT['P3']}")
    for k, v in (("tenants", 6), ("cards", 9), ("card_versions", 8)):
        if d[k] != v:
            bad.append(f"db {k}: {d[k]} ≠ {v}")
    return bad


def test_count_check():
    assert check() == []


if __name__ == "__main__":
    b = check()
    print(json.dumps({"file": file_counts(), "db": db_counts(), "fail": b}, ensure_ascii=False, indent=1))
    sys.exit(1 if b else 0)
