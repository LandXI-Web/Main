"""겹침 정리 1단(national/tidy) — 칸 경계 붙이기 · 조각 몫 · 다른 조각 중복 · '합칠까요?' 후보 · 원래 결과 보관(데이터베이스 없이)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Point, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from national import tidy as T  # noqa: E402


def _p(i, cls="경작지", shard="r000c000", edge=False, conf=0.9):
    return {"id": f"{shard}-{i}", "cls": cls, "shard_id": shard, "chip_edge": edge, "conf": conf}


def test_seam_cut_is_merged_but_same_chip_is_only_candidate():
    # 칸 경계(x=100)에서 잘린 한 논 — 다른 칩 · 가장자리 · 맞닿음 → 하나로
    a, b = box(0, 0, 100, 50), box(100, 0, 160, 50)
    # 같은 칩 안 0.2 m 떨어진 두 논배미 → 붙이지 않고 후보
    c, d = box(0, 100, 50, 150), box(50.2, 100, 90, 150)
    g, p, st, cands = T.seam_merge([a, b, c, d], [_p(1, shard="r0c0", edge=True), _p(2, shard="r0c1", edge=True), _p(3), _p(4)])
    assert st["merged_into"] == 1 and st["merged_pieces"] == 2
    assert len(g) == 3
    merged = [x for x, q in zip(g, p) if q.get("merged_from")]
    assert len(merged) == 1 and abs(merged[0].area - 8000) < 1
    assert len(cands) == 1 and {cands[0]["a"], cands[0]["b"]} == {"r000c000-3", "r000c000-4"}


def test_seam_rules_keep_far_pieces_other_classes_and_edited():
    a, b = box(0, 0, 100, 50), box(100.5, 0, 160, 50)              # 0.5 m 떨어짐 → 붙이지 않음(0.3 m 넘음)
    g, _, st, _ = T.seam_merge([a, b], [_p(1, shard="r0c0", edge=True), _p(2, shard="r0c1", edge=True)])
    assert st["merged_into"] == 0 and len(g) == 2
    a2, b2 = box(0, 0, 100, 50), box(100, 0, 160, 50)
    g, _, st, _ = T.seam_merge([a2, b2], [_p(1, cls="건물", shard="r0c0", edge=True), _p(2, shard="r0c1", edge=True)])
    assert st["merged_into"] == 0                                    # 분류가 다르면 붙이지 않음
    g, _, st, _ = T.seam_merge([a2, b2], [_p(1, shard="r0c0", edge=True), _p(2, shard="r0c1", edge=True)], keep_ids={"r0c0-1"})
    assert st["merged_into"] == 0                                    # 고친 자리는 손대지 않음
    g, _, st, _ = T.seam_merge([a2, b2], [_p(1, shard="r0c0", edge=True), _p(2, shard="r0c1", edge=True)], obb=True)
    assert st["merged_into"] == 0                                    # 차량(OBB)은 붙이지 않음


def test_crop_and_greenhouse_pieces_merge_without_edge_flag():
    # 10-26 — 사료작물: 다른 칩 · 가장자리 표시 없음 · 맞닿음 → 하나로 / 둘 다 가장자리 · 0.8 m 틈 → 하나로 / 같은 칩 · 가장자리 아님 · 0.8 m → 따로
    a, b = box(0, 0, 15, 15), box(15, 0, 30, 15)
    g, _, st, _ = T.seam_merge([a, b], [_p(1, cls="IRG", shard="r0c0"), _p(2, cls="IRG", shard="r0c1")])
    assert st["merged_into"] == 1 and len(g) == 1 and g[0].geom_type == "Polygon"
    c, d = box(0, 0, 15, 15), box(15.8, 0, 30, 15)
    g, _, st, _ = T.seam_merge([c, d], [_p(1, cls="IRG", shard="r0c0", edge=True), _p(2, cls="IRG", shard="r0c1", edge=True)])
    assert st["merged_into"] == 1 and g[0].geom_type == "Polygon"
    g, _, st, _ = T.seam_merge([c, d], [_p(1, cls="IRG", shard="r0c0"), _p(2, cls="IRG", shard="r0c1")])
    assert st["merged_into"] == 0                                    # 가장자리 표시 없는 0.8 m 틈 = 다른 논배미일 수 있음
    # 단동: 다른 칩 · 20 % 겹침 → 하나로 / 맞닿기만(겹침 0) → 따로(붙어 선 두 동)
    e, f = box(0, 0, 10, 40), box(0, 32, 10, 60)
    g, _, st, _ = T.seam_merge([e, f], [_p(1, cls="비닐하우스_단동", shard="r0c0"), _p(2, cls="비닐하우스_단동", shard="r1c0")])
    assert st["merged_into"] == 1
    h, k = box(0, 0, 10, 40), box(10, 0, 20, 40)                    # 옆으로 붙어 선 두 동 → 따로
    g, _, st, _ = T.seam_merge([h, k], [_p(1, cls="비닐하우스_단동", shard="r0c0"), _p(2, cls="비닐하우스_단동", shard="r0c1")])
    assert st["merged_into"] == 0
    m1, m2 = box(0, 0, 8, 15), box(0, 15, 8, 30)                    # 한 동의 앞뒤 토막(끝과 끝이 맞닿음) → 하나로
    g, _, st, _ = T.seam_merge([m1, m2], [_p(1, cls="비닐하우스_단동", shard="r0c0"), _p(2, cls="비닐하우스_단동", shard="r1c0")])
    assert st["merged_into"] == 1 and abs(g[0].area - 240) < 1
    # 농지 전수 '경작지'는 예전 규칙 그대로(가장자리 표시 없으면 붙이지 않음)
    g, _, st, _ = T.seam_merge([a, b], [_p(1, shard="r0c0"), _p(2, shard="r0c1")])
    assert st["merged_into"] == 0


def test_own_keep_part_cell_and_neighbour():
    cell = box(0, 0, 10, 10)
    own, sib = box(0, 0, 5, 10), box(5, 0, 10, 10)
    other = shapely.STRtree([box(10, 0, 20, 10)])
    pts = [Point(2, 5), Point(7, 5), Point(12, 5), Point(30, 30)]
    k = T.own_keep(pts, own, cell, [sib], other)
    assert k.tolist() == [True, False, False, True]                 # 내 조각 · 형제 조각 몫 · 이웃 칸 몫 · 아무 칸도 아님(남김)


def test_cross_dedupe_drops_lower_conf_across_jobs_only():
    a, b, c = box(0, 0, 10, 10), box(0.5, 0, 10.5, 10), box(30, 0, 40, 10)
    props = [_p(1, conf=0.9), _p(2, conf=0.7), _p(3)]
    assert T.cross_dedupe([a, b, c], props, ["j1", "j2", "j1"]) == {1}
    assert T.cross_dedupe([a, b], props[:2], ["j1", "j1"]) == set()          # 같은 조각 안은 작업기 NMS 몫
    assert T.cross_dedupe([a, b], props[:2], ["j1", "j2"], keep_ids={"r000c000-2"}) == {0}


def test_finalize_clean_lnglat_roundtrip_and_record():
    # 경위도 — 남원 근처 두 칩 경계에서 잘린 한 면
    x0, y0 = 127.39, 35.42
    a = box(x0, y0, x0 + 0.001, y0 + 0.0005)
    b = box(x0 + 0.001, y0, x0 + 0.0016, y0 + 0.0005)
    feats = [{"geom": a, "props": _p(1, shard="r0c0", edge=True)}, {"geom": b, "props": _p(2, shard="r0c1", edge=True)}]
    out, rec = T.finalize_clean(feats, task="seg")
    assert rec["by"] == "finalize" and rec["in"] == 2 and rec["out"] == 1 and rec["changed"]
    g = out[0]["geom"]
    assert abs(g.bounds[0] - x0) < 1e-6 and abs(g.bounds[2] - (x0 + 0.0016)) < 1e-6
    assert out[0]["props"]["merged_from"] == "r0c1-2" and out[0]["props"]["area_m2"] > 0
    out2, rec2 = T.finalize_clean([], task="seg")
    assert out2 == [] and not rec2["changed"]


def test_write_clean_keeps_raw_and_record(tmp_path, monkeypatch):
    from landxi_api import result_store
    b = tmp_path / "job_X"
    raw = b.with_name(b.name + ".fgb")
    g = [box(127.0, 35.0, 127.001, 35.001), box(127.002, 35.0, 127.003, 35.001)]
    result_store.write_fgb(raw, g, [{k: None for k in T.KEYS} | {"id": "a", "cls": "경작지"}, {k: None for k in T.KEYS} | {"id": "b", "cls": "경작지"}], T.KEYS)
    rec = T.write_clean(b, raw, [g[0]], [{"id": "a", "cls": "경작지"}], {"in": 2, "out": 1, "changed": True}, pmtiles=False)
    assert (tmp_path / "job_X.raw.fgb").exists() and rec["raw"] == "job_X.raw.fgb"          # 원래 결과는 옮겨 보관(지우지 않음)
    assert len(result_store.read_features(raw)) == 1 and len(result_store.read_features(tmp_path / "job_X.raw.fgb")) == 2
    assert T.raw_path(b).name == "job_X.raw.fgb"
    assert json.loads(T.tidy_path(b).read_text(encoding="utf-8"))["v"] == T.VERSION
    assert ".raw.fgb" in result_store.SIDE_EXT and "-tidy.json" in result_store.SIDE_EXT
