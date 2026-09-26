"""G1 · 경계 — geoBoundaries KGZ ADM1/ADM2 + Natural Earth 50m + LX 사업국 목록(F1-D 브리프 §0).

실행(저장소 루트): python -m server.pipelines.global.g1_boundaries [--refresh]
산출: kgz-adm1.geojson · kgz-adm2.geojson · lx-countries.json (LX_DATA_ROOT/global + landxi/global/data)
멱등: 원천은 raw/ 캐시 · 같은 입력이면 같은 바이트.
"""
from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
G = importlib.import_module("server.adapters.global")

GB = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/KGZ/ADM{n}/geoBoundaries-KGZ-ADM{n}_simplified.geojson"
NE50 = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"

# 키릴 병기(system-v2 §7 · ru UI 없음 · 지명만)
CYRILLIC = {"Ysyk-Ata": "Ысык-Ата", "Sokuluk": "Сокулук", "Alamudun": "Аламүдүн", "Chuy": "Чүй", "Bishkek": "Бишкек"}
YSYK_ATA_SHAPEID = "92254566B31675215078110"
BISHKEK_BBOX = [74.45, 42.78, 74.72, 42.93]
YSYK_PLAIN = [74.70, 42.75, 75.20, 43.00]

# LX 사업국 — recon global-map §2: 2023 내부자료 38개국 목록(이름 36개 확인 · 사할린 포함) + 공식 목록 파키스탄.
# 사할린은 나라가 아니므로 점. 결과 = 나라 36 + 사할린 점 1.
LX_LIST = [
    ("AZE", "아제르바이잔"), ("UZB", "우즈베키스탄"), ("TKM", "투르크메니스탄"), ("LAO", "라오스"), ("MYS", "말레이시아"),
    ("KHM", "캄보디아"), ("VNM", "베트남"), ("PHL", "필리핀"), ("MAR", "모로코"), ("BGD", "방글라데시"),
    ("ETH", "에티오피아"), ("SAU", "사우디아라비아"), ("ARM", "아르메니아"), ("TUN", "튀니지"), ("MNG", "몽골"),
    ("LKA", "스리랑카"), ("KGZ", "키르기스스탄"), ("JAM", "자메이카"), ("HTI", "아이티"), ("PER", "페루"),
    ("CHL", "칠레"), ("URY", "우루과이"), ("NPL", "네팔"), ("MDG", "마다가스카르"), ("KAZ", "카자흐스탄"),
    ("TZA", "탄자니아"), ("MMR", "미얀마"), ("IDN", "인도네시아"), ("PRY", "파라과이"), ("COL", "콜롬비아"),
    ("RWA", "르완다"), ("DOM", "도미니카공화국"), ("EGY", "이집트"), ("BFA", "부르키나파소"), ("ARG", "아르헨티나"),
    ("PAK", "파키스탄"),
]
# LX 공식 사업현황(https://www.lx.or.kr/kor/sub01_05_04_02.do · 2026-09-24 조회 · 2019년 이후 표시분) — 기간 끝이 오늘 이후면 진행 중
OFFICIAL = {
    "JAM": [("2026", "Land administration capacity PMC", "토지행정 역량강화 PMC", "KOICA ODA", "2026-01", "2031-03")],
    "IDN": [("2025", "3D cadastre pilot for digital smart city", "디지털 스마트시티용 3D 지적 구축 시범", "MOLIT ODA", "2025-05", "2027-11"),
            ("2022", "3D land ownership registration · digital twin data", "3D 토지소유 등록·디지털트윈 데이터", "KAIA ODA", "2022-09", "2023-06"),
            ("2019", "Cadastral information infrastructure master plan", "지적정보 인프라 통합 마스터플랜", "MOLIT ODA", "2019-06", "2020-04")],
    "COL": [("2025", "Digital transformation of land information", "토지정보 디지털 전환", "MOLIT ODA", "2025-05", "2028-02")],
    "NPL": [("2025", "Land management system modernisation capacity", "토지관리시스템 현대화 역량강화", "World Bank KWPF", "2025-01", "2025-11"),
            ("2024", "Smallholder land tenure · green land use", "소농 토지소유·친환경 토지이용 지원", "UN-Habitat", "2024-08", "2026-07")],
    "PAK": [("2024", "Land information modernisation capacity · phase 2", "토지정보 현대화 역량강화 2단계", "World Bank", "2024-03", "2024-05"),
            ("2023", "Land information modernisation capacity · phase 1", "토지정보 현대화 역량강화 1단계", "World Bank KWPF", "2023-08", "2023-11")],
    "PRY": [("2023", "Senior officials training · land administration", "고위공무원 토지행정·공간정보 연수", "MOLIT ODA", "2023-09", "2023-09")],
    "UZB": [("2023", "National spatial information integration capacity", "국가 공간정보 통합 역량 체계", "MOLIT ODA", "2023-09", "2026-04"),
            ("2021", "Real estate integrated system · IT infra phase 2", "부동산 통합시스템·IT 인프라 2단계", "World Bank KWPF", "2021-09", "2027-01"),
            ("2021", "Digital twin cultural heritage platform", "디지털트윈 문화유산 플랫폼", "NIPA ODA", "2021-05", "2021-12"),
            ("2020", "NGIS spatial information standardisation", "NGIS 공간정보 표준화 컨설팅", "MOLIT ODA", "2020-06", "2021-10"),
            ("2019", "Real estate integrated system · phase 1", "부동산 통합시스템 1단계", "World Bank", "2019-11", "2021-09")],
    "KGZ": [("2022", "Geodetic datum transition · land information management", "세계측지계 전환 및 국토정보관리 선진화 시범", "MOLIT ODA", "2022-08", "2025-11")],
    "VNM": [("2021", "Urban planning information system (UPIS)", "도시정보관리시스템(UPIS)", "KOICA ODA", "2021-12", "2025-12")],
    "TZA": [("2021", "Spatial information innovation centre · capacity", "공간정보혁신센터·역량강화", "MOLIT ODA", "2021-07", "2024-06")],
    "ARM": [("2021", "National spatial data standardisation", "국가공간정보 표준화", "ADB", "2021-09", "2023-02")],
    "BGD": [("2021", "Digital land management system consulting", "디지털토지관리시스템 컨설팅", "EDCF", "2021-09", "2026-10")],
    "ETH": [("2021", "Land information system consulting", "토지정보시스템 구축 컨설팅", "EDCF", "2021-09", "2027-01")],
    "KHM": [("2020", "Spatial data infrastructure base data pilot", "공간정보 인프라 기초데이터 시범", "MOLIT ODA", "2020-06", "2022-06")],
    "LAO": [("2020", "Land information infrastructure · capacity", "토지정보 인프라·역량강화", "MOLIT ODA", "2020-06", "2024-06")],
    "LKA": [("2019", "Land information infrastructure feasibility", "토지정보 인프라·시스템 타당성조사", "KEXIM", "2019-04", "2019-10")],
    "RWA": [("2019", "Spatial data infrastructure · land use monitoring (KSP)", "공간정보 인프라·토지이용 모니터링(KSP)", "KEXIM", "2019-03", "2019-09")],
}
SAKHALIN = {"id": "SAKHALIN", "name_en": "Sakhalin (Korean cemetery survey)", "name_ko": "사할린 (한인 묘역 조사)",
            "lnglat": [142.7, 50.3], "kind": "point", "note": "나라가 아님 — 러시아 전체를 칠하지 않고 점으로 표기",
            "projects": [{"year": "2020", "title_en": "Korean cemetery survey · 3rd", "title_ko": "한인 묘역 조사 3차", "finance": "MOIS ODA", "from": "2020-08", "to": "2020-12"},
                         {"year": "2019", "title_en": "Korean cemetery survey · 2nd", "title_ko": "한인 묘역 조사 2차", "finance": "MOIS ODA", "from": "2019-06", "to": "2019-12"}]}


def _simplify(geom: dict, tol: float) -> dict:
    from shapely.geometry import mapping, shape
    g = shape(geom).simplify(tol, preserve_topology=True)
    m = mapping(g)
    return {"type": m["type"], "coordinates": G.rnd(json.loads(json.dumps(m["coordinates"])), 4)}


def main(refresh: bool = False) -> None:
    from shapely.geometry import shape
    today = G.now_iso()[:10]
    # ── geoBoundaries ─────────────────────────────────────────────
    for n in (1, 2):
        raw, meta = G.cached_fetch(GB.format(n=n), f"geoBoundaries-KGZ-ADM{n}_simplified.geojson", refresh=refresh)
        src = json.loads(raw)
        feats = []
        for f in src["features"]:
            p = f["properties"]
            name = p.get("shapeName")
            short = name.replace(" Region", "").replace(" District", "")
            props = {"code": p.get("shapeID"), "name": name, "name_cyr": CYRILLIC.get(short), "level": f"ADM{n}",
                     "iso": p.get("shapeGroup")}
            g = shape(f["geometry"])
            props["bbox"] = [round(v, 4) for v in g.bounds]
            feats.append({"type": "Feature", "id": len(feats), "properties": props,
                          "geometry": {"type": f["geometry"]["type"], "coordinates": G.rnd(f["geometry"]["coordinates"], 5)}})
        fc = {"type": "FeatureCollection",
              "lx": {"source": meta["url"], "fetched_at": meta["fetched_at"], "sha256": meta["sha256"],
                     "license": "ODbL (ADM0/ADM1 · OSM 2017)" if n == 1 else "CC BY-SA 3.0 (ADM2 · 2010 · 41 districts)",
                     "attribution": "geoBoundaries (wmgeolab) gbOpen KGZ",
                     "count": G.env(len(feats), "count", "measured", meta["url"], as_of=meta["fetched_at"][:10])},
              "features": feats}
        if n == 2:
            # 비슈케크 시는 ADM 단위가 아니다 → bbox 사각 + 경계 미확보(브리프 §0)
            b = BISHKEK_BBOX
            fc["features"].append({"type": "Feature", "id": len(feats), "properties": {
                "code": "kgz-bishkek-bbox", "name": "Bishkek (city)", "name_cyr": "Бишкек", "level": "bbox",
                "boundary": "not_acquired", "note": "비슈케크 시는 geoBoundaries ADM 단위가 아님 — bbox 사각 · 경계 미확보",
                "bbox": b}, "geometry": {"type": "Polygon", "coordinates": [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]]}})
            ys = [f for f in feats if f["properties"]["code"] == YSYK_ATA_SHAPEID]
            assert ys, "Ysyk-Ata shapeID 없음"
            fc["lx"]["ysykata_plain_aoi"] = YSYK_PLAIN
        G.write_out(f"kgz-adm{n}.geojson", fc)
        print(f"ADM{n}: {len(feats)} features")

    # ── Natural Earth 50m + LX 사업국 ───────────────────────────────
    raw, meta = G.cached_fetch(NE50, "ne_50m_admin_0_countries.geojson", refresh=refresh)
    ne = json.loads(raw)
    lx_iso = {i for i, _ in LX_LIST}
    ko = dict(LX_LIST)
    countries, feats = [], []
    for f in ne["features"]:
        p = f["properties"]
        iso = p["ADM0_A3"]
        if p.get("ADMIN") == "Antarctica":
            continue
        tol = 0.02 if iso in lx_iso else 0.05
        geom = _simplify(f["geometry"], tol)
        feats.append({"type": "Feature", "id": len(feats), "properties": {"iso3": iso, "name": p["NAME"], "lx": 1 if iso in lx_iso else 0},
                      "geometry": geom})
    ne_by = {f["properties"]["iso3"]: f for f in feats}
    for iso, name_ko in LX_LIST:
        f = ne_by[iso]
        projs = [{"year": y, "title_en": te, "title_ko": tk, "finance": fi, "from": a, "to": b} for (y, te, tk, fi, a, b) in OFFICIAL.get(iso, [])]
        active = any(p["to"] >= today[:7] for p in projs)
        f["properties"]["status"] = "active" if active else "history"
        c = shape(f["geometry"]).representative_point()
        countries.append({"iso3": iso, "name_en": f["properties"]["name"], "name_ko": name_ko,
                          "status": "active" if active else "history", "centroid": [round(c.x, 3), round(c.y, 3)],
                          "projects": projs,
                          "source": "LX 공식 사업현황(2019~ 표시분) · 2026-09-24 조회" if projs else "LX 글로벌사업처 내부자료 2023(38개국 목록 · 사업명 미기재)"})
    for f in feats:
        f["properties"].setdefault("status", None)
    out = {
        "source": "LX 공식 사업현황 https://www.lx.or.kr/kor/sub01_05_04_02.do + 내부자료 2023(글로벌사업처 주요사업 공유 · '38개국 79개 사업')",
        "fetched_at": meta["fetched_at"], "as_of": today,
        "license": "국가 면 = Natural Earth 50m (public domain) · 사업 목록 = LX 공개 자료",
        "note": "목록 확인 36(2023 내부자료 이름 35 + 공식 목록 파키스탄) · 사할린은 나라가 아니어서 점 · '38개국'은 내부자료 서술값(이름 36만 확인)",
        "count": G.env(len(countries), "count", "history", "LX official project list + internal list 2023 (recounted)", as_of="2026-09-24", note="36 listed · Sakhalin as a point"),
        "active_rule": f"사업 기간 끝(to) ≥ {today[:7]} 이면 active",
        "countries": countries, "points": [SAKHALIN],
        "world": {"type": "FeatureCollection", "source": NE50, "sha256": meta["sha256"], "features": feats},
    }
    G.write_out("lx-countries.json", out)
    print(f"LX countries {len(countries)} (active {sum(c['status']=='active' for c in countries)}) · world {len(feats)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    main(ap.parse_args().refresh)
