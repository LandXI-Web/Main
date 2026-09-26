"""F1-CONTRACT.md 예시 JSON → server/fixtures/contract/*.json (계약 §13). 값은 계약 문서 그대로([예시] 표기 포함).

각 파일 = {"method","path","status","body","optional":[응답에 더 있어도 되는 키(계약 본문이 언급한 선택 키)],"note"}.
test_contract.py 가 라우트 응답의 키 집합 = body 키 집합(+optional) 인지, 봉투 자리가 봉투인지 검사한다(값은 검사하지 않음).
프론트 에픽(F1-A/C/D)은 이 파일을 읽기 import 해 자기 픽스처의 키 집합을 맞춘다. mock_api.py(:8701)도 이 파일을 그대로 낸다.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
E = lambda v, u, b, s, note=None, as_of="2026-09-24": {**{"value": v, "unit": u, "basis": b, "as_of": as_of, "source": s}, **({"note": note} if note else {})}  # noqa: E731
AOI = {"type": "Polygon", "coordinates": [[[126.9440, 35.9950], [126.9490, 35.9950], [126.9490, 35.9990], [126.9440, 35.9990], [126.9440, 35.9950]]]}

LAYER = {
    "id": "ap25-namwon-2023", "name": {"ko": "2023 25cm 항공 · 남원", "en": "2023 aerial 25 cm · Namwon"}, "kind": "raster", "role": "imagery",
    "source": "pmtiles", "set": "imagery/namwon_ap25_2023", "path": "tiles/pmtiles/namwon_ap25_2023.pmtiles",
    "url": "http://localhost:8700/tiles/pmtiles/imagery/namwon_ap25_2023.pmtiles", "tiles": None, "scheme": "xyz", "layer": None, "promote_id": None,
    "minzoom": 10, "maxzoom": 18, "bounds": [127.166748, 35.290469, 127.683105, 35.576917], "gsd_m": 0.25, "epoch": "2023", "crs": "EPSG:3857",
    "tier": "tile", "license": "확인 중", "attribution": "2023 비도시 정사영상(전북) · 권리 확인 중", "export_policy": "tenant", "security_review": "pending",
    "rights_holder": "확인 중", "ladder": {"stage": "domestic", "from": 10, "to": 18, "order": 30},
    "count": E(88404, "count", "measured", "manifest.json#namwon_ap25_2023.pmtiles"), "signed": False}
LAYER_OPT = ["params", "note", "basis", "noncommercial"]

JOB = {"id": "job_01J9K3P7Q8R2S4T6V8W0X2Y4Z6", "tenant_id": "lx", "submitted_by": "u_lx_staff", "kind": "infer", "state": "running", "priority": 0,
       "demo": False, "pool": "a6000", "model_id": "car_v2_obb", "imagery_id": "axis-iksan-hwangdeung", "deploy_id": None, "card_id": None,
       "aoi": AOI, "options": {"chip": 1024, "overlap": 0.2, "conf": 0.25}, "shards_total": 1120, "shards_done": 96, "shards_failed": 0,
       "counts": {"vehicle": 1284}, "counts_env": E(1284, "count", "inferred", "job_01J9K…", "[예시] 진행 중 누적"),
       "chips_per_s": E(None, "chips_per_s", "measured", "gpu_worker 계량", "첫 shard 뒤 채워짐"), "gpu_s": E(0, "gpu_s", "measured", "usage_events"),
       "workers": ["a6000-0", "a6000-1"], "result_set": "results/lx/job_01J9K3P7Q8R2S4T6V8W0X2Y4Z6", "snapshot_ready": False,
       "created_at": "2026-09-24T14:02:11+09:00", "started_at": "2026-09-24T14:02:12+09:00", "finished_at": None, "error": None}

DEPLOY = {"id": "dp-nw-farm-25", "name": "남원 영농관리 2025", "tenant_id": "namwon", "card_id": "card-farm", "card_version_id": "card-farm@2.1",
          "version": "v2.1", "prev_card_version_id": "card-farm@2.0", "region_profile": "namwon",
          "region_name": {"ko": "전북특별자치도 남원시", "en": "Namwon-si, Jeonbuk"}, "aoi": {"type": "MultiPolygon", "coordinates": []}, "stage": "ga",
          "pinned": False, "gpu_pool": "a6000", "from_deploy_id": None,
          "modules": {"core": ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"],
                      "ext": {"mod-farm-cycle": True, "mod-farm-parcel": True}},
          "model_override": None, "snapshot_current": "results/namwon/dp-nw-farm-25@2.1", "snapshot_prev": "results/namwon/dp-nw-farm-25@2.0",
          "year": 2025, "status_history": "운영",
          "scale": E(2098, "필지", "measured", "results/namwon-farmland-2025.geojson", "cards.js '비닐하우스 9,664 동' 은 출처 없음 → 미표시", "2026-06-08"),
          "basis": "history", "approvals": [{"id": "ap_…", "decision": "approve", "by": "u_lx_admin", "at": "2026-09-24T09:00:00+09:00", "reason": "시드"}],
          "created_at": "2026-09-24T09:00:00+09:00", "updated_at": "2026-09-24T09:00:00+09:00"}

GPU = {"index": 0, "name": "NVIDIA RTX A6000",
       "util_pct": E(0, "%", "measured", "nvidia-smi utilization.gpu"), "mem_used_mib": E(23396, "MiB", "measured", "nvidia-smi memory.used"),
       "mem_total_mib": E(49140, "MiB", "measured", "nvidia-smi memory.total"), "temp_c": E(63, "°C", "measured", "nvidia-smi temperature.gpu"),
       "power_w": E(15.81, "W", "measured", "nvidia-smi power.draw"),
       "external": [{"pid": 0, "name": "llama-server.exe", "mem_mib": None, "note": "WDDM: 프로세스별 VRAM N/A"}],
       "external_used_mib": E(23396, "MiB", "measured", "memory.used − 워커 자기 보고", "워커 미기동 시 = memory.used"),
       "worker": "a6000-0", "job_id": None, "driver": "522.06", "mode": "WDDM"}

USAGE_DIM = lambda u, s, h, p, src: {"used": E(u, "GB" if "gb" in src else "gpu_s", "measured", src), "soft": s, "hard": h, "policy": p, "note": "[추정 기반 초기값]"}  # noqa: E731
USAGE = {"tenant_id": "namwon", "month": "2026-09",
         "dims": {"storage_gb": USAGE_DIM(0, 400, 500, "notify", "du"), "gpu_s_month": USAGE_DIM(0, 30000, 36000, "queue_low", "usage_events"),
                  "area_km2_month": USAGE_DIM(0, 1500, 2000, "notify", "usage_events"), "concurrent_jobs": USAGE_DIM(0, 2, 2, "queue_low", "jobs"),
                  "egress_gb_month": USAGE_DIM(None, 40, 50, "notify", "usage_events"), "vworld_calls_day": USAGE_DIM(0, 4000, 5000, "reject", "redis")},
         "isolation": {"prefix": "tenants/namwon/", "rls": True, "signed_tiles": True, "raw_routes": 0},
         "forecast": {"gpu_s_month": {"exceed_month": None, "basis": "estimate", "source": "quota.estimator 선형"}}}

F = {
    "health": ("GET", "/api/v1/health", 200, {"ok": True, "version": "0.1.0", "redis": True, "pg": True, "workers": {"gpu": 2, "cpu": 1}, "at": "2026-09-24T14:02:11+09:00"}, []),
    "auth_login": ("POST", "/api/v1/auth/login", 200, {"token": "lxs_…", "realm": "lx", "role": "staff", "tenant_id": None,
                                                        "user": {"id": "u_lx_staff", "name": "LX 직원"}, "expires_at": "2026-09-25T09:00:00+09:00"}, []),
    "me": ("GET", "/api/v1/me", 200, {"realm": "lx", "role": "admin", "tenant_id": None, "caps": ["jobs.submit", "results.edit", "deploys.write", "ops.read", "ops.write"]},
           ["user", "at"]),
    "catalog_layers": ("GET", "/api/v1/catalog/layers", 200, {"items": [LAYER], "ladder": {"domestic": ["gibs-viirs-truecolor", "gibs-hls-s30", "xdworld-satellite",
                        "ap25-namwon-2023"], "global": ["gibs-viirs-truecolor", "eox-s2cloudless-2025"]}, "as_of": "2026-09-24T14:02:11+09:00"},
                       ["build", "total"], {"items[]": LAYER_OPT}),
    "catalog_imagery": ("GET", "/api/v1/catalog/imagery/ap25-namwon-2023", 200, {**LAYER, "footprint": {"type": "MultiPolygon", "coordinates": []}},
                        ["path_internal"] + LAYER_OPT),
    "tiles_sign": ("GET", "/tiles/sign?set=results/namwon/dp-nw-farm-25@2.1", 200,
                   {"url": "http://localhost:8700/tiles/pmtiles/results/namwon/dp-nw-farm-25@2.1.pmtiles?exp=1758770000&sig=…", "expires_at": "2026-09-25T02:00:00+09:00"},
                   ["set", "canonical"]),
    "jobs_quote": ("POST", "/api/v1/jobs/quote", 200, {
        "area_km2": E(0.199, "km2", "measured", "shapely area(EPSG:5186)"), "shards": 1120,
        "shards_env": E(1120, "count", "measured", "scheduler.tile(1024, 0.2, gsd 0.0136)"),
        "gpu_s": E(None, "gpu_s", "estimate", "models.perf(car_v2_obb) 없음 — bench 전", "bench 후 채워짐"),
        "eta_s": E(None, "s", "estimate", "同上"),
        "quota": {"tenant_id": "lx", "dim": "gpu_s_month", "remaining": E(None, "gpu_s", "measured", "quotas(lx hard=null)", "무제한"), "policy": "queue_low"},
        "allowed": True, "reasons": [], "pool": "a6000"}, []),
    "jobs_submit": ("POST", "/api/v1/jobs", 202, {"job": JOB, "events_url": "/api/v1/events/jobs/job_01J9K3P7Q8R2S4T6V8W0X2Y4Z6"}, []),
    "job": ("GET", "/api/v1/jobs/{id}", 200, JOB, []),
    "jobs_list": ("GET", "/api/v1/jobs", 200, {"items": [JOB]}, ["total", "as_of"]),
    "results_features": ("GET", "/api/v1/results/{set}/features", 200, {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": "NW23-000000", "geometry": {"type": "MultiPolygon", "coordinates": []},
         "properties": {"id": "NW23-000000", "cls": "경작지", "cls_en": "farmland", "cid": 2, "conf": 0.82, "area_m2": 1234.5, "emd": "운봉읍",
                        "emd_cd": "52190250", "pnu": None, "edit_state": "raw", "job_id": "results/lx/namwon-landcover-2023", "shard_id": None, "chip_edge": False}}],
        "lx": {"count": E(129420, "count", "inferred", "detections"), "total": 129420}}, [], {"lx": ["limit", "offset"]}),
    "results_stats": ("GET", "/api/v1/results/{set}/stats?by=emd", 200, {"items": [{"key": "운봉읍", "cd": "52190250", "n": E(232, "polygons", "inferred", "emd-stats"),
                      "area_ha": E(1324.8, "ha", "inferred", "emd-stats"), "conf_mean": E(None, "ratio", "inferred", "emd-stats")}],
                      "total": {"n": E(129420, "polygons", "inferred", "emd-stats"), "area_ha": E(10963.9, "ha", "inferred", "emd-stats")}},
                      ["source", "as_of"], {"items[]": ["cls"]}),
    "feedback": ("POST", "/api/v1/feedback", 201, {"id": "fb_…", "state": "open"}, ["at"]),
    "parcels": ("GET", "/api/v1/parcels?lng=127.39&lat=35.416", 200, {"pnu": "5219025021100010000", "jibun": "…", "jimok": "전",
                "area_m2": E(1523.0, "m2", "measured", "국토정보기본도 2.0", as_of="2021-12"), "price_krw_m2": E(21300, "krw_m2", "measured", "공시지가", as_of="2021-12"),
                "owner_kind": "…", "source": "reference/parcels-namwon", "as_of": "2021-12"}, ["emd", "emd_cd", "ri", "road", "note"]),
    "registry_models": ("GET", "/api/v1/registry/models", 200, {"items": [{"id": "namwon/Vinyl_house/train2", "family": "yolo11x-seg", "task": "seg",
                        "classes": ["비닐하우스_단동", "비닐하우스_다동"], "weights_uri": "E:\\namwon\\Vinyl_house\\runs\\segment\\train2\\weights\\best.pt",
                        "input": ["ortho"], "gsd_trained_m": 0.02, "tile_size": 1024, "infer_shape": [1024, 1024], "image": None,
                        "metrics": {"mask_mAP50": E(0.93808, "ratio", "recorded", "models/namwon/Vinyl_house/train2/results.csv", "best epoch 89", "2026-01")},
                        "perf": None, "status": "registered", "card_url": "/files/models/namwon/Vinyl_house/train2/card.json"}]}, ["total", "as_of"]),
    "registry_cards": ("GET", "/api/v1/registry/cards", 200, {"items": [{"id": "card-farm", "name": "영농관리 행정서비스", "scope": "local", "status": "운영",
                       "versions": ["card-farm@2.0", "card-farm@2.1"], "modules": {"core": ["mod-auth"], "ext": {}}}]}, ["total", "as_of"]),
    "registry_lineage": ("GET", "/api/v1/registry/lineage/dp-nw-farm-25", 200, {"chain": [{"kind": "dataset", "id": "E:/aerial_dataset", "label": "항공 토지피복 15.3만"},
                         {"kind": "model", "id": "aerial25/best"}, {"kind": "deploy", "id": "dp-nw-farm-25"}]}, ["as_of"]),
    "deploys_list": ("GET", "/api/v1/deploys", 200, {"items": [DEPLOY]}, ["total", "as_of"]),
    "deploy": ("GET", "/api/v1/deploys/{id}", 200, DEPLOY, []),
    "deploy_port": ("POST", "/api/v1/deploys", 201, {**DEPLOY, "id": "dp-kgz-land-change-26", "stage": "draft", "from_deploy_id": "dp-nw-change",
                    "snapshot_current": None, "snapshot_prev": None}, ["results"]),
    "deploy_approve": ("POST", "/api/v1/deploys/{id}/approve", 200, {"approval": {"id": "ap_…", "decision": "approve", "by": "u_lx_admin",
                       "at": "2026-09-24T14:02:11+09:00", "reason": "…"}, "deploy": DEPLOY}, []),
    "tenants": ("GET", "/api/v1/tenants", 200, {"items": [{"id": "namwon", "name": {"ko": "전북특별자치도 남원시", "en": "Namwon-si"}, "kind": "user",
                "scope": "local", "crs": "EPSG:5186", "locale": "ko", "profile_id": "namwon", "home": "portal", "status": "active"}]}, ["total", "as_of"]),
    "usage": ("GET", "/api/v1/t/namwon/usage", 200, USAGE, [], {"gpu_s_month": ["projected"]}),
    "ops_nodes": ("GET", "/api/v1/ops/nodes", 200, {"items": [{"id": "node-tr3995wx", "hostname": "…", "role": "control+gpu", "pool": "a6000",
                  "cpu": "Threadripper PRO 3995WX 64C", "ram_gb": E(512, "GB", "measured", "env.md"), "gpus": [0, 1], "joined_at": "…", "last_seen": "…",
                  "state": "up"}, {"id": "node-a100-1", "state": "pending", "note": "A100 80GB×4 · 등록 대기"}]}, ["total", "as_of"], {"items[]": ["workers"]}),
    "ops_gpus": ("GET", "/api/v1/ops/gpus", 200, {"node": "node-tr3995wx", "at": "2026-09-24T14:02:11.480+09:00", "gpus": [GPU]}, ["note", "source"], {"gpus[]": ["worker_vram", "at"]}),
    "ops_queues": ("GET", "/api/v1/ops/queues", 200, {"pools": {"a6000": {"queued": 1, "running": 1, "workers": 2,
                   "p95_wait_s": E(None, "s", "measured", "jobs")}}, "lanes": [{"worker": "a6000-0", "blocks": [{"job_id": "…", "from": "…", "to": "…",
                   "state": "running", "tenant_id": "lx"}]}], "as_of": "…"}, [], {"pools.*": ["shards_backlog"]}),
    "ops_storage": ("GET", "/api/v1/ops/storage", 200, {"volumes": [{"mount": "E:", "free_gb": E(2085, "GB", "measured", "statfs"),
                    "total_gb": E(None, "GB", "measured", "statfs")}], "by_tier": {"raw": E(None, "GB", "measured", "-", "원본은 LX_DATA_ROOT 밖 · 목록만"),
                    "tile": E(None, "GB", "measured", "du tiles/"), "result": E(None, "GB", "measured", "du results/ vector/")},
                    "by_tenant": {"lx": E(None, "GB", "measured", "du")}}, ["as_of", "source", "data_root", "took_s", "at"], {"volumes[]": ["used_gb"]}),
    "ops_alerts": ("GET", "/api/v1/ops/alerts", 200, {"items": [], "last_check": "…"}, ["total"]),
    "ops_models": ("GET", "/api/v1/ops/models", 200, {"items": [{"model_id": "car_v2_obb", "resident_on": ["a6000-0"], "vram_mib": E(None, "MiB", "measured", "worker"),
                   "perf": None, "pinned": False}]}, ["total", "as_of"]),
    "ops_tenants": ("GET", "/api/v1/ops/tenants", 200, {"items": [USAGE]}, ["total", "as_of"], {"gpu_s_month": ["projected"]}),
    "ops_bench": ("GET", "/api/v1/ops/bench", 200, {"items": [{"model_id": "aerial25/best", "gpu": "A6000", "batch": 16, "fp16": True,
                  "chips_per_s": E(26, "chips_per_s", "measured", "pipeline-run.md", "P4 2026-09-24 · 읽기 포함 · 외부 점유 23,396 MiB"), "at": "2026-09-24"}]},
                  ["total", "as_of", "note"], {"items[]": ["gpu_index", "chip", "imgsz", "seconds", "chips", "vram_mib", "external_used_mib", "util_pct_mean",
                                                          "mem_used_during_mib", "kind"]}),
    "ops_join_token": ("POST", "/api/v1/ops/nodes/join-token", 200, {"token": "nj_…", "expires_at": "…", "compose_hint": "docker compose -f node.yml up  (Phase 2)"}, []),
    "error": ("*", "*", 400, {"error": {"code": "quota_exceeded", "message": "gpu_s_month 한도 36,000 초과 예상", "detail": {"dim": "gpu_s_month", "remaining": 120.5,
              "requested": 800}}, "request_id": "req_01J9…"}, []),
}

SSE = {"jobs": ["job.queued", "job.started", "shard.started", "shard.done", "shard.failed", "job.progress", "job.done", "snapshot.ready", "job.failed",
                "job.cancelled", "index.month"],
       "ops": ["gpu.sample", "queue.sample", "usage.delta", "deploy.changed", "alert", "job.state"],
       "errors": ["unauthorized", "forbidden", "demo_required", "not_found", "parcels_unavailable", "vworld_key_pending", "cog_unavailable", "quota_exceeded",
                  "aoi_outside_footprint", "aoi_too_large", "model_input_mismatch", "module_locked", "approval_required", "invalid_stage_transition",
                  "envelope_missing", "worker_unavailable"]}

if __name__ == "__main__":
    for name, spec in F.items():
        method, path, status, body, optional = spec[:5]
        nested = spec[5] if len(spec) > 5 else {}
        (HERE / f"{name}.json").write_text(json.dumps({"method": method, "path": path, "status": status, "body": body, "optional": optional,
                                                       "optional_nested": nested, "note": "F1-CONTRACT.md v1.0 예시 — 값은 [예시]/계약 기록값"},
                                                      ensure_ascii=False, indent=1), encoding="utf-8")
    (HERE / "_sse_and_errors.json").write_text(json.dumps(SSE, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(F), "fixtures")
