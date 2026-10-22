"""끝난 변화 탐지 결과의 소유구분을 브이월드 토지소유정보로 채운다(멱등 · 분류만 · 캐시).

python -m change.owner_fill [작업 …]   # 없으면 끝난 결과 전부
결과 파일(changes.geojson)의 owner 칸만 바꾼다 — 다른 칸 · 폴리곤 · 번호는 그대로.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from change import DATA, owner  # noqa: E402


def fill_run(job: str) -> dict:
    f = DATA / "runs" / job / "changes.geojson"
    fc = json.loads(f.read_text(encoding="utf-8"))
    pn = [x["properties"].get("pnu") for x in fc["features"] if x["properties"].get("pnu")]
    got = owner.fill(pn)
    n = 0
    for x in fc["features"]:
        p = x["properties"]
        if p.get("pnu") in got and p.get("owner") != got[p["pnu"]]:
            p["owner"] = got[p["pnu"]]
            n += 1
    f.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {"job": job, "pnus": len(set(pn)), "got": len(got), "changed": n}


def main():
    jobs = sys.argv[1:]
    if not jobs:
        jobs = sorted(p.name for p in (DATA / "runs").iterdir() if (p / "changes.geojson").exists() and p.name.startswith("job_"))
    for j in jobs:
        print(fill_run(j), flush=True)


if __name__ == "__main__":
    main()
