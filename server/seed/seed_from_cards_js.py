"""시드(F1-CONTRACT §6) — 마이그레이션 → cards.js·portal.js(Node 덤프) → tenants · cards · card_versions · deploys · imagery ·
models · quotas · accounts · nodes → 정적 결과 세트를 detections 로(검수 전 결과 · 건수 대조용).

사용: python server/seed/seed_from_cards_js.py [--migrate-only] [--no-results]
숫자 규칙: deploys.scale 은 출처 있는 것만(dp-nw-farm-25 2,098 필지 · dp-nw-change 456 · dp-gj-marine-25 1,857). cards.js 의
'비닐하우스 9,664 동'은 출처가 없어 싣지 않는다(설계서 §10.2 ②).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import psycopg
from psycopg import sql
from shapely import set_srid, to_wkb
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402
from workers.registry_scan import scan_models, upsert_models_sql  # noqa: E402

REPO = config.REPO_ROOT
DATA = config.DATA_ROOT


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def migrate(conn):
    ddl = (config.SERVER_ROOT / "migrations" / "0001_init.sql").read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(ddl)
        cur.execute("ALTER ROLE landxi_app PASSWORD %s" % sql.Literal(config.get("PG_APP_PASSWORD", "landxi-dev-app")).as_string(conn))
        cur.execute("ALTER ROLE landxi_worker PASSWORD %s" % sql.Literal(config.get("PG_WORKER_PASSWORD", "landxi-dev-worker")).as_string(conn))
    conn.commit()
    log("migrate ok")


def node_dump() -> dict:
    js = ("const u=(p)=>'file:///'+p.replace(/\\\\/g,'/');"
          "const base=process.argv[1];"
          "Promise.all([import(u(base+'/cards.js')),import(u(base+'/portal.js'))]).then(([c,p])=>{"
          "process.stdout.write(JSON.stringify({CARDS:c.CARDS,DEPLOYS:c.DEPLOYS,CORE_MODULES:c.CORE_MODULES,EXT_MODULES:c.EXT_MODULES,TENANTS:p.TENANTS}))})"
          ".catch(e=>{console.error(e);process.exit(1)})")
    r = subprocess.run(["node", "-e", js, str(REPO / "landxi" / "assets" / "data")], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError("node dump 실패: " + r.stderr[-800:])
    return json.loads(r.stdout)


TENANTS = [
    ("lx", {"ko": "LX 한국국토정보공사", "en": "LX Korea Land and Geospatial InformatiX Corporation"}, "maker", "local", "EPSG:5186", "ko", None),
    ("namwon", {"ko": "전북특별자치도 남원시", "en": "Namwon-si"}, "user", "local", "EPSG:5186", "ko", "namwon"),
    ("gwangju-jeonnam", {"ko": "광주전남특별시", "en": "Gwangju-Jeonnam"}, "user", "local", "EPSG:5186", "ko", "gwangju-jeonnam"),
    ("kgz-agri", {"ko": "키르기스 농업부(으슥아타)", "en": "Kyrgyz Ministry of Agriculture (Ysyk-Ata)"}, "user", "global", "EPSG:32643", "en", "kgz-ysykata"),
    ("kgz-land", {"ko": "키르기스 토지자원청(소쿨룩·비슈케크)", "en": "Kyrgyz State Agency on Land Resources (Sokuluk · Bishkek)"}, "user", "global", "EPSG:32643", "en", "kgz-sokuluk"),
    ("lx-demo", {"ko": "LX 영업 시연(계량 전용)", "en": "LX sales demo (metering only)"}, "maker", "local", "EPSG:5186", "ko", None),
]

CV = [  # id, card, version, model_ids
    ("card-farm@2.0", "card-farm", "2.0", ["aerial25/best"], "2023 25cm 항공 × aerial25/best(P4 재추론)"),
    ("card-farm@2.1", "card-farm", "2.1", ["namwon/cultivate_uncultivate/train"], "2025 드론 · 경작/비경작"),
    ("card-living@1.3", "card-living", "1.3", [], "생활환경 판독(학습 프로젝트 역추적 안 됨 — cards.js projectGap)"),
    ("card-road@2.1", "card-road", "2.1", [], "도로 포장 판독"),
    ("card-change@1.0", "card-change", "1.0", ["unsupervised-change"], "A04 비지도 변화 지수"),
    ("card-marine@1.2", "card-marine", "1.2", [], "해양쓰레기 판독"),
    ("card-global-farm@0.1", "card-global-farm", "0.1", ["index/ndvi_pc"], "PC S2 NDVI 지수 계산(draft)"),
    ("card-global-disaster@0.1", "card-global-disaster", "0.1", [], "EMS 판독 열람(draft)"),
]
DEPLOY_CV = {"dp-nw-living-23": ("card-living@1.3", None), "dp-nw-farm-25": ("card-farm@2.1", "card-farm@2.0"),
             "dp-nw-road-26": ("card-road@2.1", None), "dp-nw-crowd-27": (None, None), "dp-nw-change": ("card-change@1.0", None),
             "dp-gj-marine-25": ("card-marine@1.2", None), "dp-gj-marine-27": ("card-marine@1.2", None)}
DEPLOY_TENANT = {"dp-nw": "namwon", "dp-gj": "gwangju-jeonnam"}
STAGE = {"운영": "ga", "구축": "canary", "예정": "draft"}
SNAP = {"dp-nw-farm-25": ("results/namwon/dp-nw-farm-25@2.1", "results/namwon/dp-nw-farm-25@2.0"),
        "dp-nw-change": ("results/namwon/dp-nw-change@1.0", None),
        "dp-gj-marine-25": ("results/gwangju-jeonnam/dp-gj-marine-25@1.2", None)}
SCALE = {
    "dp-nw-farm-25": {"value": 2098, "unit": "필지", "basis": "measured", "as_of": "2026-06-08", "source": "results/namwon-farmland-2025.geojson",
                      "note": "cards.js '비닐하우스 9,664 동' 은 출처 없음 → 미표시"},
    "dp-nw-change": {"value": 456, "unit": "count", "basis": "measured", "as_of": "2026-06-08", "source": "landxi/assets/data/geo/namwon-change.geojson"},
    "dp-gj-marine-25": {"value": 1857, "unit": "count", "basis": "measured", "as_of": "2026-06-08",
                        "source": "results/yeosu-marine-2025-aerial.geojson", "note": "항공 2025 탐지 · 드론 2026 2,078 별도"},
}
FARM_EXT = {"parcel-match": "mod-farm-parcel", "crop-cycle": "mod-farm-cycle", "house-count": "mod-farm-house", "farm-subsidy": "mod-farm-subsidy"}
CORE = ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"]


def ext_modules(dump, key):
    out = {}
    for m in (dump["EXT_MODULES"].get(key) or []) if key else []:
        mid = FARM_EXT.get(m["id"]) if key == "farm" else f"mod-{key}-{m['id']}"
        out[mid or f"mod-{key}-{m['id']}"] = m.get("build") == "done"
    return out


def tenant_aoi(tenant: str):
    """기관 관할이 시군구 하나면 그 시군구 경계(regions_base · 파일 경로 의존 0 · core-flow) — 아니면 None(광역 = 프로필 bbox)."""
    from landxi_api.regions import regions_base, tenant_scope
    sc = tenant_scope(tenant) or []
    if len(sc) != 1 or len(sc[0]) != 5:
        return None, None
    _, geoms, _ = regions_base()
    g = geoms.get(sc[0])
    if g is None:
        return None, None
    return (MultiPolygon([g]) if g.geom_type == "Polygon" else g), sc[0]


def bbox_mp(b):
    return MultiPolygon([box(*b)])


def seed_core(conn, dump):
    profiles = config.load_yaml("region_profiles")["profiles"]
    cur = conn.cursor()
    cur.execute("SELECT set_config('app.realm','lx',false)")
    for t in TENANTS:
        cur.execute("INSERT INTO tenants(id, name, kind, scope, crs, locale, profile_id, status) VALUES (%s,%s,%s,%s,%s,%s,%s,'active') "
                    "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind, scope=EXCLUDED.scope, crs=EXCLUDED.crs, "
                    "locale=EXCLUDED.locale, profile_id=EXCLUDED.profile_id", (t[0], json.dumps(t[1], ensure_ascii=False), *t[2:]))
    # cards 9
    for c in dump["CARDS"]:
        cur.execute("INSERT INTO cards(id, name, scope, domain, kind, status_history, portable) VALUES (%s,%s,%s,%s,%s,%s,%s) "
                    "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, scope=EXCLUDED.scope, domain=EXCLUDED.domain, kind=EXCLUDED.kind, "
                    "status_history=EXCLUDED.status_history, portable=EXCLUDED.portable",
                    (c["id"], json.dumps({"ko": c["name"], "en": c.get("duty")}, ensure_ascii=False), c["scope"], c.get("duty"),
                     json.dumps(c.get("kind"), ensure_ascii=False), c["status"], bool(c.get("portable"))))
    # models (card_versions 가 가리킴)
    upsert_models_sql(cur, scan_models())
    ext_of = {c["id"]: c.get("ext") for c in dump["CARDS"]}
    for vid, card, ver, mids, log_ in CV:
        mods = {"core": CORE, "ext": ext_modules(dump, ext_of.get(card))}
        cur.execute("INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog, approved_by, approved_at) VALUES "
                    "(%s,%s,%s,%s,%s,%s,'u_lx_admin',now()) ON CONFLICT (id) DO UPDATE SET model_ids=EXCLUDED.model_ids, modules=EXCLUDED.modules, "
                    "changelog=EXCLUDED.changelog", (vid, card, ver, mids, json.dumps(mods, ensure_ascii=False), log_))
    deploys = []
    for d in dump["DEPLOYS"]:
        tenant = DEPLOY_TENANT[d["id"][:5]]
        cv, prev = DEPLOY_CV[d["id"]]
        prof = tenant                              # 시드 기관 id = 지역 프로필 id(region_profiles.yaml)
        aoi = tenant_aoi(tenant)[0] or bbox_mp(profiles[prof]["bbox"])
        cur_s, prev_s = SNAP.get(d["id"], (None, None))
        deploys.append((d["id"], d.get("note") and f"{d['region'].split(' · ')[0]} {d['cardId'].removeprefix('card-')} {d['year']}" or d["id"],
                        tenant, d["cardId"], cv, prev, prof, profiles[prof]["name"], aoi, STAGE[d["status"]], ext_of.get(d["cardId"]), cur_s, prev_s,
                        d["year"], d["status"], SCALE.get(d["id"]), d.get("note")))
    names = {"dp-nw-living-23": "남원 생활환경 2023", "dp-nw-farm-25": "남원 영농관리 2025", "dp-nw-road-26": "남원 도로안전 2026",
             "dp-nw-crowd-27": "남원 인파관리 2027", "dp-nw-change": "남원 국토변화(국산리) 2025", "dp-gj-marine-25": "광주전남 해양쓰레기 2025",
             "dp-gj-marine-27": "광주전남 해양쓰레기 2027"}
    deploys.append(("dp-kgz-agri-farm-26", "Ysyk-Ata farmland NDVI 2026", "kgz-agri", "card-global-farm", "card-global-farm@0.1", None,
                    "kgz-ysykata", profiles["kgz-ysykata"]["name"], bbox_mp([74.70, 42.75, 75.20, 43.00]), "canary", "farm", None, None, 2026,
                    "시범", None, "geoBoundaries Ysyk-Ata 북부 평원"))
    deploys.append(("dp-mm-meiktila-25", "Meiktila damage (시연 한정)", "lx", "card-global-disaster", "card-global-disaster@0.1", None,
                    "mm-meiktila", profiles["mm-meiktila"]["name"], bbox_mp(profiles["mm-meiktila"]["bbox"]), "shadow", "change", None, None, 2025,
                    "시연", None, "EMSR798 판독 열람"))
    for (did, name, tenant, card, cv, prev, prof, rname, aoi, stage, ext, cs, ps, year, sh, scale, note) in deploys:
        mods = {"core": CORE, "ext": ext_modules(dump, ext)}
        cur.execute(
            "INSERT INTO deploys(id, name, tenant_id, card_id, card_version_id, prev_card_version_id, region_profile, region_name, aoi, stage, "
            "pinned, gpu_pool, from_deploy_id, modules, snapshot_current, snapshot_prev, year, status_history, scale, basis) VALUES "
            "(%s,%s,%s,%s,%s,%s,%s,%s,ST_Multi(ST_GeomFromWKB(%s,4326)),%s,false,'a6000',NULL,%s,%s,%s,%s,%s,%s,'history') "
            "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, tenant_id=EXCLUDED.tenant_id, card_version_id=EXCLUDED.card_version_id, "
            "prev_card_version_id=EXCLUDED.prev_card_version_id, region_profile=EXCLUDED.region_profile, region_name=EXCLUDED.region_name, "
            "aoi=EXCLUDED.aoi, stage=EXCLUDED.stage, modules=EXCLUDED.modules, snapshot_current=EXCLUDED.snapshot_current, "
            "snapshot_prev=EXCLUDED.snapshot_prev, year=EXCLUDED.year, status_history=EXCLUDED.status_history, scale=EXCLUDED.scale, "
            "pinned=false, model_override=NULL, updated_at=now()",
            (did, names.get(did, name), tenant, card, cv, prev, prof, json.dumps(rname, ensure_ascii=False), to_wkb(aoi), stage,
             json.dumps(mods, ensure_ascii=False), cs, ps, year, sh, json.dumps(scale, ensure_ascii=False) if scale else None))
        if stage == "ga":
            cur.execute("INSERT INTO approvals(id, subject_type, subject_id, requested_by, decided_by, decision, reason, at) VALUES "
                        "(%s,'deploy',%s,'u_lx_admin','u_lx_admin','approve','시드',now()) ON CONFLICT (id) DO NOTHING", (f"ap_seed_{did}", did))
    # 다른 지역에 적용으로 생긴 배포본은 시드가 지운다(재현 가능하게) — 시드 목록 밖 deploys
    seed_ids = [d[0] for d in deploys]
    cur.execute("DELETE FROM deploys WHERE id <> ALL(%s)", (seed_ids,))
    conn.commit()
    try:                                           # 배포본 sgg_cd(core-flow) — 비어 있는 것만 경계·결과로 채운다
        from seed.backfill_deploy_sgg import run as backfill_sgg
        log("deploys sgg_cd", sum(1 for x in backfill_sgg() if x["sgg_cd"]))
    except Exception as e:  # noqa: BLE001
        log("deploys sgg_cd 백필 실패", repr(e))
    log("tenants", len(TENANTS), "cards", len(dump["CARDS"]), "card_versions", len(CV), "deploys", len(deploys))
    conn.commit()


def seed_imagery(conn):
    sets = config.load_yaml("sets")
    mf = config.manifest()["_by_id"]
    cur = conn.cursor()
    import geopandas as gpd
    n = 0
    for im in sets["imagery"]:
        m = mf.get(im.get("manifest"), {})
        fp = None
        if im.get("footprint_from"):
            g = gpd.read_file(DATA / im["footprint_from"]).to_crs(4326)
            u = unary_union(list(g.geometry))
            fp = u if u.geom_type == "MultiPolygon" else MultiPolygon([u])
        elif im.get("bounds") or m.get("bounds"):
            fp = bbox_mp(im.get("bounds") or m["bounds"])
        layer = {"manifest": im.get("manifest"), "cog_path": im.get("cog_path"), "role": im.get("role", "imagery"),
                 "pmtiles_set": im.get("pmtiles_set")}
        cur.execute(
            "INSERT INTO imagery(id, name, tier, gsd_m, epoch, crs, footprint, path_internal, pmtiles_set, xyz_folder, license, attribution, "
            "export_policy, security_review, rights_holder, asset_ref, ladder, kind, layer) VALUES (%s,%s,%s,%s,%s,%s,"
            "CASE WHEN %s::bytea IS NULL THEN NULL ELSE ST_Multi(ST_GeomFromWKB(%s,4326)) END,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, tier=EXCLUDED.tier, gsd_m=EXCLUDED.gsd_m, epoch=EXCLUDED.epoch, crs=EXCLUDED.crs, "
            "footprint=EXCLUDED.footprint, path_internal=EXCLUDED.path_internal, pmtiles_set=EXCLUDED.pmtiles_set, xyz_folder=EXCLUDED.xyz_folder, "
            "license=EXCLUDED.license, attribution=EXCLUDED.attribution, export_policy=EXCLUDED.export_policy, security_review=EXCLUDED.security_review, "
            "rights_holder=EXCLUDED.rights_holder, asset_ref=EXCLUDED.asset_ref, ladder=EXCLUDED.ladder, kind=EXCLUDED.kind, layer=EXCLUDED.layer",
            (im["id"], json.dumps(im["name"], ensure_ascii=False), im["tier"], im["gsd_m"], im["epoch"], im["crs"],
             to_wkb(fp) if fp is not None else None, to_wkb(fp) if fp is not None else None, im.get("path_internal"),
             im["set"] if im["tier"] != "raw" else None, im.get("xyz_folder"), im["license"], im["attribution"], im["export_policy"],
             im["security_review"], im["rights_holder"], im["asset_ref"], json.dumps(im["ladder"]), im.get("kind", "ortho"), json.dumps(layer)))
        n += 1
    conn.commit()
    log("imagery", n)


def seed_quotas_accounts_nodes(conn):
    from argon2 import PasswordHasher
    ph = PasswordHasher()
    q = config.load_yaml("quotas")
    cur = conn.cursor()
    for t, dims in q["tenants"].items():
        for d, v in dims.items():
            cur.execute("INSERT INTO quotas(tenant_id, dim, soft, hard, policy, note) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (tenant_id, dim) DO UPDATE "
                        "SET soft=EXCLUDED.soft, hard=EXCLUDED.hard, policy=EXCLUDED.policy, note=EXCLUDED.note",
                        (t, d, v.get("soft"), v.get("hard"), v["policy"], q["note"]))
    acc = json.loads((config.SERVER_ROOT / "seed" / "accounts.dev.json").read_text(encoding="utf-8"))
    pw = ph.hash(config.DEV_PASSWORD)
    for u in acc["lx_users"]:
        cur.execute("INSERT INTO lx_users(id, login, pw_hash, role, status, name) VALUES (%s,%s,%s,%s,'active',%s) ON CONFLICT (id) DO UPDATE "
                    "SET login=EXCLUDED.login, pw_hash=EXCLUDED.pw_hash, role=EXCLUDED.role, name=EXCLUDED.name", (u["id"], u["login"], pw, u["role"], u["name"]))
    for u in acc["tenant_users"]:
        cur.execute("INSERT INTO tenant_users(id, tenant_id, login, pw_hash, role, status, name) VALUES (%s,%s,%s,%s,%s,'active',%s) ON CONFLICT (id) "
                    "DO UPDATE SET login=EXCLUDED.login, pw_hash=EXCLUDED.pw_hash, role=EXCLUDED.role, name=EXCLUDED.name",
                    (u["id"], u["tenant_id"], u["login"], pw, u["role"], u["name"]))
    for n in config.load_yaml("pools")["nodes"]:
        cur.execute("INSERT INTO nodes(id, hostname, role, gpus, pool, joined_at, state, note) VALUES (%s,%s,%s,%s,%s,now(),%s,%s) ON CONFLICT (id) DO UPDATE "
                    "SET role=EXCLUDED.role, gpus=EXCLUDED.gpus, pool=EXCLUDED.pool, state=EXCLUDED.state, note=EXCLUDED.note",
                    (n["id"], n.get("id"), n.get("role"), json.dumps(n.get("gpus")), n.get("pool"), n.get("state", "up"), n.get("note")))
    conn.commit()
    log("quotas", sum(len(v) for v in q["tenants"].values()), "accounts", len(acc["lx_users"]) + len(acc["tenant_users"]))


# ── 정적 결과 세트 → detections(tenant lx · job_id = 세트 id) ─────────────────
STATIC = [
    # set id, file, kind
    ("results/lx/namwon-landcover-2023", DATA / "results/namwon-landcover-2023.geojson", "p4"),
    ("results/lx/namwon-farmland-2025", REPO / "landxi/assets/data/geo/results/namwon-farmland-2025.geojson", "a02"),
    ("results/lx/namwon-greenhouse-2025", REPO / "landxi/assets/data/geo/results/namwon-greenhouse-2025.geojson", "a02"),
    ("results/lx/namwon-change", REPO / "landxi/assets/data/geo/namwon-change.geojson", "a04"),
    ("results/lx/yeosu-marine-2025-aerial", REPO / "landxi/assets/data/geo/results/yeosu-marine-2025-aerial.geojson", "marine"),
]
EN = {"경작지": "farmland", "비닐하우스_단동": "greenhouse_single", "비닐하우스_다동": "greenhouse_multi", "비닐하우스": "greenhouse",
      "건물": "building", "주차장": "parking"}


def _mp(g):
    g = shape(g)
    if g.geom_type == "Polygon":
        return MultiPolygon([g])
    if g.geom_type == "MultiPolygon":
        return g
    polys = [p for p in getattr(g, "geoms", []) if p.geom_type == "Polygon"]
    return MultiPolygon(polys) if polys else None


def seed_results(conn):
    cur = conn.cursor()
    cur.execute("SELECT set_config('app.realm','lx',false)")
    for set_id, f, kind in STATIC:
        have = cur.execute("SELECT count(*) FROM detections WHERE job_id=%s", (set_id,)).fetchone()[0]
        d = json.loads(f.read_text(encoding="utf-8"))
        feats = d["features"]
        if have == len(feats):
            log("results", set_id, "이미", have)
            continue
        cur.execute("DELETE FROM detections WHERE job_id=%s", (set_id,))
        t0 = time.time()
        with cur.copy("COPY detections (tenant_id, job_id, fid, cls, cls_en, cid, conf, area_m2, emd, emd_cd, pnu, edit_state, chip_edge, geom) "
                      "FROM STDIN") as cp:
            for i, ft in enumerate(feats):
                pr = ft["properties"]
                mp = _mp(ft["geometry"])
                if mp is None:
                    continue
                if kind == "p4":
                    row = ("lx", set_id, pr["id"], pr["cls"], pr["cls_en"], pr["cid"], pr["conf"], pr["area_m2"], pr.get("emd"), pr.get("emd_cd"),
                           None, "raw", bool(pr.get("chip_edge")))
                elif kind == "a02":
                    row = ("lx", set_id, pr["id"], pr["cls"], EN.get(pr["cls"], pr["cls"]), pr.get("cid"), pr.get("conf"), pr.get("area"),
                           pr.get("emd"), None, pr.get("pnu"), "raw", None)
                elif kind == "a04":
                    row = ("lx", set_id, f"CHG-{i:04d}", pr["cls"], pr["cls"], None, pr.get("score"), pr.get("area_m2"), None, None, None, "raw", None)
                else:
                    row = ("lx", set_id, pr.get("id") or f"MR-{i:05d}", pr["cls"], pr["cls"], pr.get("cid"), pr.get("conf"), pr.get("area"),
                           None, None, None, "raw", None)
                cp.write_row(row + (to_wkb(set_srid(mp, 4326), hex=True, include_srid=True),))
        conn.commit()
        log("results", set_id, len(feats), f"{time.time()-t0:.1f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--migrate-only", action="store_true")
    ap.add_argument("--no-results", action="store_true")
    a = ap.parse_args()
    with psycopg.connect(config.PG_ADMIN_DSN) as conn:
        migrate(conn)
        if a.migrate_only:
            return
        dump = node_dump()
        (config.SERVER_ROOT / "seed" / ".cards_dump.json").write_text(json.dumps(dump, ensure_ascii=False, indent=1), encoding="utf-8")
        seed_core(conn, dump)
        seed_imagery(conn)
        seed_quotas_accounts_nodes(conn)
        if not a.no_results:
            seed_results(conn)
    # F3 §3 S-6 카드 확장(intro · ledger_schema · crop_url) + S-9 시드 정리(시험 배포본 · 시험 결재 · pytest 작업 관제 제외)
    from seed_f3 import main as seed_f3_main
    seed_f3_main()
    log("seed done")


if __name__ == "__main__":
    main()
