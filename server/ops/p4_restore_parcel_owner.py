#!/usr/bin/env python
"""0119 되돌리기 도우미 — 필지 주인을 바꾸기 전 값으로(보관 파일 02. 데이터/_backup/p4-20261022/parcels-owner.json.gz).
먼저 migrations/down/0119_p4_parcels_common.down.sql 을 적용한 뒤 돌린다. 사용: python server/ops/p4_restore_parcel_owner.py
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

SRC = config.DATA_ROOT / "_backup" / "p4-20261022" / "parcels-owner.json.gz"


def main():
    import psycopg
    d = json.loads(gzip.open(SRC, "rt", encoding="utf-8").read())
    with psycopg.connect(config.PG_ADMIN_DSN) as c:
        for tenant, pnus in d["owners"].items():
            for i in range(0, len(pnus), 50000):
                c.execute("UPDATE survey_parcels SET tenant_id=%s WHERE pnu = ANY(%s)", (tenant, pnus[i:i + 50000]))
        c.commit()
    print({t: len(v) for t, v in d["owners"].items()})


if __name__ == "__main__":
    main()
