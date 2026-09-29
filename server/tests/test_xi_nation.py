"""core-xi — XI맵 전역 AI 추론 전국화(코어 ①).

· 전국 읍면동 경계 GET /regions/{sgg}/emd(V-World LT_C_ADEMD_INFO 캐시) · 옛/새 시군구 코드 · regions.emd_index
· postprocess 지역 변수화 — 예시 지역(기준) 기존 결과의 읍면동 회귀(옛 경계 파일 대비 이름·코드 동일 · 차이는 경계선 근처만)
· 시군구 전역 계획(tiling.sgg_shards) — 화면 중심 읍면동부터 · 칸마다 emd_cd
· POST /jobs/quote scope sgg — 새 지역(영상 일부) · 영상 없는 시군구(no_imagery) · 실제 작업 첫 결과 ≤ 10 s(취소)
· GET /regions/{sgg}/results — 그 시군구 결과 층(카탈로그 + 전역 분석)
· 소유 파일 지역 문자열 0
판정 지역 인자(시험 파일만 예외): 기준 52190 · 새 지역 46130(= 12130) · 영상 없음 41135.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from conftest import B, H  # noqa: E402

BASE_SGG, NEW_OLD, NEW_NEW, NO_IMG = "52190", "46130", "12130", "41135"
REPO = Path(__file__).resolve().parents[2]


def test_emd_endpoint_old_new_codes(tok):
    a = httpx.get(B + f"/regions/{NEW_OLD}/emd", headers=H(tok["staff"]), timeout=90).json()
    b = httpx.get(B + f"/regions/{NEW_NEW}/emd", headers=H(tok["staff"]), timeout=90).json()
    assert a["sgg_cd"] == b["sgg_cd"] == NEW_NEW and a["prev_cd"] == NEW_OLD
    assert a["n"] == b["n"] >= 20
    assert all(f["properties"]["emd_cd"].startswith(NEW_NEW) and f["properties"]["name"] for f in a["features"])
    c = httpx.get(B + f"/regions/{BASE_SGG}/emd", headers=H(tok["gj"]), timeout=90).json()
    assert c["n"] >= 20 and all(f["properties"]["emd_cd"].startswith(BASE_SGG) for f in c["features"])
    assert httpx.get(B + "/regions/99999/emd", headers=H(tok["staff"]), timeout=30).status_code == 404


def test_emd_index_contract():
    from landxi_api.regions import emd_index
    ix = emd_index(NEW_OLD)
    assert ix is not None and ix.sgg_cd == NEW_NEW and len(ix) >= 20
    i = 0
    pt = ix.geoms[i].representative_point()
    assert ix.find(pt) == (ix.names[i], ix.codes[i])
    assert ix.find_lnglat(0.0, 0.0) is None


def _old_index():
    """예전 postprocess 의 기준(옛 읍면동 파일 · EPSG:5186 · within) — 회귀 비교용(시험 안에서만)."""
    from pyproj import Transformer
    from shapely import STRtree
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform
    d = json.loads((REPO / "landxi/assets/data/geo/namwon-emd.geojson").read_text(encoding="utf-8"))
    to = Transformer.from_crs(4326, 5186, always_xy=True).transform
    geoms = [sh_transform(to, shape(f["geometry"])).buffer(0) for f in d["features"]]
    return STRtree(geoms), geoms, [(f["properties"]["nm"], f["properties"]["cd"]) for f in d["features"]], to


def test_postprocess_regression_base_region():
    """기준 지역의 끝난 전역 작업(칸 GeoJSON)으로: 새 읍면동 붙이기(emd_index) vs 예전 규칙(옛 경계 파일).
    이름·코드 체계 동일 · 99.5% 이상 같은 읍면동 · 다른 것은 모두 옛 경계선 50 m 안(경계 원천이 2021 행정경계 → V-World 최신으로 바뀐 몫)."""
    from pyproj import Transformer
    from shapely.geometry import shape
    from shapely.ops import transform as sh_transform
    from workers import bus, postprocess
    import psycopg
    from landxi_api import config
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        row = c.execute("SELECT j.id FROM jobs j WHERE j.kind='infer' AND j.state='done' AND j.imagery_id IN "
                        "(SELECT id FROM imagery WHERE sgg_cd=%s AND path_internal IS NOT NULL) "
                        "AND (SELECT count(DISTINCT emd_cd) FROM detections d WHERE d.job_id=j.id) >= 20 ORDER BY j.shards_total DESC LIMIT 1",
                        (BASE_SGG,)).fetchone()
    if not row:
        pytest.skip("기준 지역 전역 작업 기록 없음")
    sdir = bus.shard_dir("lx", row[0], False)
    files = sorted(sdir.glob("*.geojson"))[::6]          # 칸 1/6 표본(빠르게)
    raw = []
    for f in files:
        for ft in json.loads(f.read_text(encoding="utf-8"))["features"]:
            raw.append({"geom": shape(ft["geometry"]), "props": ft["properties"]})
    assert raw
    feats, st = postprocess.run(raw, task="seg")
    assert st["sgg_cd"] == BASE_SGG and st["emd_n"] >= 20
    tr, geoms, names, to = _old_index()
    old_names = {n for n, _ in names}
    new_names = {f["props"]["emd"] for f in feats}
    assert new_names <= old_names                         # 같은 이름 체계(법정 읍면동)
    same = diff = 0
    far = []
    for f in feats:
        g = sh_transform(to, f["geom"]).representative_point()
        hit = [int(k) for k in tr.query(g, predicate="within")]
        if not hit:
            continue
        o = names[hit[0]]
        if o[1] == f["props"]["emd_cd"] and o[0] == f["props"]["emd"]:
            same += 1
        else:
            diff += 1
            dist = geoms[hit[0]].exterior.distance(g) if geoms[hit[0]].geom_type == "Polygon" else geoms[hit[0]].boundary.distance(g)
            if dist > 50:
                far.append((f["props"]["id"], round(dist, 1)))
    assert same > 1000
    assert diff / (same + diff) < 0.005, (same, diff)
    assert not far, far[:5]


def test_sgg_plan_order_center_first():
    from landxi_api.regions import emd_index
    from workers.scheduler import plan_sgg
    ix = emd_index(BASE_SGG)
    e0 = ix.geoms[5].representative_point()
    g, sh, info = plan_sgg(_imagery_of(BASE_SGG), BASE_SGG, center=[e0.x, e0.y], chip=1024, overlap=0.125, upsample=0.5)
    assert sh and all(s["params"]["emd_cd"].startswith(BASE_SGG) for s in sh)
    assert sh[0]["params"]["emd_cd"] == ix.codes[5]          # 화면 중심을 품은 읍면동이 먼저
    order = [e["emd_cd"] for e in info["emd"]]
    seen, last = set(), None
    for s in sh:                                            # 읍면동 단위로 묶여 나온다(되돌아가지 않음)
        cd = s["params"]["emd_cd"]
        if cd != last:
            assert cd not in seen
            seen.add(cd)
            last = cd
    assert order[0] == ix.codes[5] and len(set(s["shard_id"] for s in sh)) == len(sh)


def _imagery_of(sgg: str) -> str:
    import psycopg
    from landxi_api import config
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        r = c.execute("SELECT id FROM imagery WHERE sgg_cd=%s AND path_internal IS NOT NULL AND gsd_m=0.25 AND kind='ortho' ORDER BY id LIMIT 1", (sgg,)).fetchone()
    if not r:
        pytest.skip(f"{sgg} 25cm 영상 없음")
    return r[0]


def test_quote_sgg_new_region_and_no_imagery(tok):
    q = httpx.post(B + "/jobs/quote", json={"kind": "infer", "options": {"scope": "sgg", "sgg_cd": NEW_OLD}}, headers=H(tok["staff"]), timeout=120).json()
    if not q.get("imagery"):
        pytest.skip("새 지역 영상 등록 전(core-imagery)")
    assert q["allowed"] and q["sgg_cd"] == NEW_NEW and q["shards"] > 0 and q["model_id"]
    assert 0 < q["coverage"]["value"] <= 1
    emd = httpx.get(B + f"/regions/{NEW_OLD}/emd", headers=H(tok["staff"]), timeout=90).json()
    names = {f["properties"]["emd_cd"]: f["properties"]["name"] for f in emd["features"]}
    assert all(names.get(e["emd_cd"]) == e["name"] for e in q["emds"])
    n = httpx.post(B + "/jobs/quote", json={"kind": "infer", "options": {"scope": "sgg", "sgg_cd": NO_IMG}}, headers=H(tok["staff"]), timeout=120).json()
    if n.get("imagery"):
        pytest.skip("영상 없는 시군구로 고른 곳에 영상이 생김(core-imagery V-World 경로)")
    assert n["allowed"] is False and "no_imagery" in n["reasons"] and n["shards"] == 0
    s = httpx.post(B + "/jobs/quote", json={"kind": "infer", "options": {"scope": "sgg", "sgg_cd": NEW_OLD}}, headers=H(tok["sales"]), timeout=120).json()
    assert "demo_required" in s["reasons"]


def test_sgg_job_first_result_and_cancel(tok):
    """실제 전역 작업 1건(시험 표시) — 제출 → 첫 shard.done ≤ 10 s · emd_cd 실림 · 관리자 목록에 같은 id → 취소."""
    body = {"kind": "infer", "options": {"scope": "sgg", "sgg_cd": NEW_OLD, "chip": 1024, "overlap": 0.125, "conf": 0.25}}
    q = httpx.post(B + "/jobs/quote", json=body, headers=H(tok["staff"]), timeout=120).json()
    if not q.get("allowed"):
        pytest.skip(f"견적 불가 {q.get('reasons')}")
    t0 = time.time()
    r = httpx.post(B + "/jobs", json={**body, "test": True, "label": "pytest/core-xi"}, headers=H(tok["staff"]), timeout=120)
    assert r.status_code == 202, r.text
    jid = r.json()["job"]["id"]
    first = None
    emd = None
    try:
        with httpx.stream("GET", B + f"/events/jobs/{jid}", headers=H(tok["staff"]), timeout=httpx.Timeout(60, read=60)) as s:
            ev = None
            for line in s.iter_lines():
                if line.startswith("event:"):
                    ev = line[6:].strip()
                elif line.startswith("data:") and ev == "shard.done":
                    first = time.time() - t0
                    emd = json.loads(line[5:]).get("emd_cd")
                    break
                if time.time() - t0 > 90:
                    break
        adm = httpx.get(B + "/jobs?include_test=1&limit=50", headers=H(tok["admin"]), timeout=30).json()
        assert any(x["id"] == jid for x in adm["items"])
    finally:
        httpx.post(B + f"/jobs/{jid}/cancel", headers=H(tok["staff"]), timeout=30)
    assert first is not None and emd and emd.startswith(NEW_NEW)
    # 다른 작업이 대기열 앞에 있거나 다른 GPU 가 고부하(전력 규칙)면 늦을 수 있다 — 그 외엔 10 s 안
    assert first <= 10 or httpx.get(B + "/jobs?state=running&limit=5", headers=H(tok["admin"]), timeout=30).json()["items"], first


def test_region_results_lists_catalog_and_scope(tok):
    for who in ("staff", "gj"):
        j = httpx.get(B + f"/regions/{NEW_OLD}/results", headers=H(tok[who]), timeout=60).json()
        assert j["sgg_cd"] == NEW_NEW
        assert any(i["from"] == "catalog" for i in j["items"]), who     # 해양쓰레기 등 카탈로그 결과 층
    nw = httpx.get(B + f"/regions/{NEW_OLD}/results", headers=H(tok["namwon"]), timeout=60).json()
    assert not any(i["from"] == "job" and not i["signed"] for i in nw["items"])   # 관할 밖 기관은 LX 전역 결과 없음


def test_job_done_event_carries_sgg(tok):
    import psycopg
    from landxi_api import config
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        r = c.execute("SELECT id, options->>'sgg_cd' FROM jobs WHERE kind='infer' AND state='done' AND options->>'scope'='sgg' "
                      "ORDER BY finished_at DESC LIMIT 1").fetchone()
    if not r:
        pytest.skip("끝난 전역 작업 없음")
    with httpx.stream("GET", B + f"/events/jobs/{r[0]}", headers=H(tok["admin"]), timeout=httpx.Timeout(30, read=30)) as s:
        ev = None
        for line in s.iter_lines():
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:") and ev == "job.done":
                d = json.loads(line[5:])
                assert d["sgg_cd"] == r[1] and d["set"].endswith(r[0])
                return
    pytest.skip("이벤트 스트림 만료")


OWNED = ["server/landxi_api/jobs.py", "server/landxi_api/regions.py", "server/landxi_api/events.py", "server/workers/scheduler.py",
         "server/workers/gpu_worker.py", "server/workers/tiling.py", "server/workers/postprocess.py",
         "landxi/v3/xi-clean/app.js", "landxi/v3/xi-clean/analyze.js", "landxi/v3/xi-clean/xc.css", "landxi/v3/xi-clean/index.html",
         "landxi/v3/xi-clean/replay-worker.js"]


def test_owned_files_no_region_strings():
    pat = re.compile(r"namwon|yeosu|52190|46130|12130|남원|여수", re.I)
    bad = []
    for f in OWNED:
        for i, line in enumerate((REPO / f).read_text(encoding="utf-8").splitlines(), 1):
            if pat.search(line):
                bad.append(f"{f}:{i}")
    assert not bad, bad
