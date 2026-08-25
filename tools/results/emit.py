# -*- coding: utf-8 -*-
"""results.json → landxi/assets/data/results.js, tools/results/INVENTORY.md"""
import os, json, io

SCR = os.path.dirname(os.path.abspath(__file__))
REPO = r"F:\Land-XI 플랫폼\01. 디자인"
RES = json.load(io.open(os.path.join(SCR, "results.json"), encoding="utf-8"))
INV = json.load(io.open(os.path.join(SCR, "inv.json"), encoding="utf-8"))
IX = {d["id"]: d for d in INV}

for e in RES:
    d = IX[e["id"]]
    e["what"] = d["what"]
    e["unit"] = d["unit"]
    e["layer"] = d["layer"]
    # 키 순서 고정
    order = ["id", "title", "year", "sensor", "region", "service", "unit", "what",
             "src", "layer", "geojson", "grid", "lite", "stats", "fields", "camera"]
    for k in list(e.keys()):
        if k not in order:
            order.append(k)
    RES[RES.index(e)] = {k: e[k] for k in order if k in e}

head = """// 실제 AI 분석 결과 카탈로그 — 원본은 `02. 데이터/*.gpkg` (EPSG:5186) 4종.
// tools/results/ 의 변환 파이프라인이 EPSG:4326 · 좌표 6자리로 재작성한 산출물을 가리킨다.
// 자동 생성 — 손으로 고치지 말고 파이프라인을 다시 돌릴 것. 통계는 단순화 이전 원본 기준이다.
// geojson/grid 경로는 landxi/ 기준 상대 경로.
export const RESULTS = """
body = json.dumps(RES, ensure_ascii=False, indent=2)
tail = """;

export const resultById = id => RESULTS.find(r => r.id === id) || null;
export const resultsByService = service => RESULTS.filter(r => r.service === service);
"""
open(os.path.join(REPO, "landxi", "assets", "data", "results.js"), "w", encoding="utf-8").write(head + body + tail)
print("results.js written", len(head + body + tail))
