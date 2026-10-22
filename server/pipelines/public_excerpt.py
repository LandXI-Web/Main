"""공개 발췌 — 로그인 화면 장면이 로그인 없이 읽는 작은 판(10-22 바퀴 22 P4 · 공개 저장소 결과 사본 추적 끊기의 앞 단계).

로그인 화면 '해양쓰레기' 장면은 화면 폴더의 결과 사본(GeoJSON 면 전체)을 정적 길로 읽고 있었다. 이제 게이트웨이 공개 길
GET /api/v1/public/excerpt/{이름} 이 이 발췌(점 · 점수만 · 좌표 소수 5자리 ≈ 1m)를 내준다. 결과 면 · 속성 · 파일 경로는 담지 않는다.

사용: python server/pipelines/public_excerpt.py            # 정해 둔 발췌를 모두 다시 만든다
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

OUT = config.DATA_ROOT / "tiles" / "public" / "excerpts"
REPO = config.SERVER_ROOT.parent
# 이름 → (원천 파일 후보 · 보이는 날) — 원천은 결과 묶음 파일(없으면 화면 폴더의 옛 사본)
EXCERPTS = {
    "login-marine": ([config.DATA_ROOT / "vector" / "yeosu-marine-2026-drone.geojson",
                      REPO / "landxi" / "assets" / "data" / "geo" / "results" / "yeosu-marine-2026-drone.geojson"], "2026-08-25"),
}


def _centroid(g: dict) -> list[float] | None:
    c = g.get("coordinates")
    if g.get("type") == "Point":
        return c
    while isinstance(c, list) and c and isinstance(c[0], list) and isinstance(c[0][0], list):
        c = c[0]
    if not c:
        return None
    return [sum(p[0] for p in c) / len(c), sum(p[1] for p in c) / len(c)]


def build(name: str) -> dict:
    srcs, as_of = EXCERPTS[name]
    src = next((p for p in srcs if p.exists()), None)
    if src is None:
        raise FileNotFoundError(name)
    d = json.loads(src.read_text(encoding="utf-8"))
    feats = []
    for f in d.get("features") or []:
        c = _centroid(f.get("geometry") or {})
        if not c:
            continue
        conf = (f.get("properties") or {}).get("conf")
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c[0], 5), round(c[1], 5)]},
                      "properties": {"conf": round(float(conf), 2) if conf is not None else None}})
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.json"
    out.write_text(json.dumps({"type": "FeatureCollection", "as_of": as_of, "features": feats}, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    return {"name": name, "features": len(feats), "bytes": out.stat().st_size}


if __name__ == "__main__":
    for n in EXCERPTS:
        print(build(n))
