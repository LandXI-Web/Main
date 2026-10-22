"""변화 탐지 서비스 등록(멱등) — 모델 change-ap25 · 국토 변화 분석서비스 판 2.0 · 카드 설명.

python -m change.setup [--dry]
바꾸기 전에 건드리는 줄(models · card_versions · card_info 의 card-change)을 02. 데이터/_backup/change-c22/ 에 JSON 으로 남긴다.
기존 판(card-change@1.0) · 남원 배포본(dp-nw-change)은 그대로 둔다(기존 서비스 · 기관 영향 0).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

from change import ROADLAND  # noqa: E402

MODEL = {
    "id": "change-ap25", "family": "landcover-unet", "version": "ap25", "task": "seg", "adapter": "change/unet",
    "weights_uri": str(ROADLAND / "models" / "ap25_best.pth"),
    "classes": ["신축", "소실", "경작 전환", "포장 확대", "식생 증감"],
    "input": ["ortho"], "tile_size": 1024, "status": "registered",
    "name": {"ko": "국토 변화 탐지(토지피복 U-Net · 두 해 비교)", "en": "Land change (land-cover U-Net, two years)"},
    "metrics": {"mean_iou": {"value": 0.79, "unit": "ratio", "basis": "recorded", "source": "토지피복 U-Net 12분류 · 25cm 검증 기록", "as_of": "2026-06-27"}},
}
CV = {"id": "card-change@2.0", "card_id": "card-change", "version": "2.0", "model_ids": ["change-ap25"],
      "changelog": "국토지리정보원 연도별 항공영상 두 해 비교 · 토지피복 U-Net(신축 · 소실 · 경작 전환 · 포장 확대) · 구역선 · 필지 교차",
      "approved_by": "system:change-order-1022"}
INFO = {"line": "두 해 국토지리정보원 항공영상을 비교해 새로 생긴 건물 · 없어진 건물 · 경작 전환 · 포장 확대를 찾고, 구역선 · 필지와 겹쳐 봅니다",
        "imagery": "국토지리정보원 항공정사영상(연도별)", "timepoints": "같은 범위 두 해", "finds": "신축 · 소실 · 경작 전환 · 포장 확대",
        "compare": "구역선 안/밖 · 필지(지목 · 소유구분)"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    import psycopg
    from psycopg.types.json import Jsonb
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        bk = {
            "models": [list(map(str, r)) for r in c.execute("SELECT * FROM models WHERE id IN ('change-ap25','unsupervised-change')").fetchall()],
            "card_versions": [list(map(str, r)) for r in c.execute("SELECT * FROM card_versions WHERE card_id='card-change'").fetchall()],
            "card_info": [list(map(str, r)) for r in c.execute("SELECT * FROM card_info WHERE card_id='card-change'").fetchall()],
            "deploys": [list(map(str, r)) for r in c.execute("SELECT id, card_id, card_version_id, tenant_id, stage FROM deploys WHERE card_id='card-change'").fetchall()],
        }
        out = config.DATA_ROOT / "_backup" / "change-c22"
        out.mkdir(parents=True, exist_ok=True)
        f = out / f"setup-before-{dt.datetime.now():%Y%m%d-%H%M%S}.json"
        f.write_text(json.dumps(bk, ensure_ascii=False, indent=1), encoding="utf-8")
        print("backup", f)
        if a.dry:
            return
        m = MODEL
        c.execute("""INSERT INTO models(id, family, version, weights_uri, task, classes, input, tile_size, status, adapter, name, metrics)
                     VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                     ON CONFLICT (id) DO UPDATE SET weights_uri=EXCLUDED.weights_uri, task=EXCLUDED.task, classes=EXCLUDED.classes,
                       adapter=EXCLUDED.adapter, name=EXCLUDED.name, metrics=EXCLUDED.metrics, tile_size=EXCLUDED.tile_size""",
                  (m["id"], m["family"], m["version"], m["weights_uri"], m["task"], Jsonb(m["classes"]), Jsonb(m["input"]), m["tile_size"],
                   m["status"], m["adapter"], Jsonb(m["name"]), Jsonb(m["metrics"])))
        v = CV
        c.execute("""INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog, approved_by, approved_at)
                     SELECT %s,%s,%s,%s, modules || %s::jsonb, %s, %s, now() FROM card_versions WHERE id='card-change@1.0'
                     ON CONFLICT (id) DO UPDATE SET model_ids=EXCLUDED.model_ids, changelog=EXCLUDED.changelog, modules=EXCLUDED.modules""",
                  (v["id"], v["card_id"], v["version"], v["model_ids"], json.dumps({"classes": MODEL["classes"][:4]}, ensure_ascii=False),
                   v["changelog"], v["approved_by"]))
        i = INFO
        c.execute("UPDATE card_info SET line=%s, imagery=%s, timepoints=%s, finds=%s, compare=%s, updated_at=now(), updated_by='system:change-order-1022' "
                  "WHERE card_id='card-change'", (i["line"], i["imagery"], i["timepoints"], i["finds"], i["compare"]))
        c.commit()
        print("ok", c.execute("SELECT id, model_ids FROM card_versions WHERE card_id='card-change'").fetchall())


if __name__ == "__main__":
    main()
