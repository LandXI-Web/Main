"""파이프라인 공용: manifest.json 항목 '추가만'(기존 항목은 id 가 같아도 덮지 않고 건너뛴다 — 단 F1-B 가 만든 항목은 갱신)."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

MANIFEST = config.DATA_ROOT / "manifest.json"
OWNER = "F1-B"


def manifest_add(item: dict) -> str:
    """item['id'] 가 없으면 추가. 있으면: F1-B 소유 항목이면 갱신, 아니면 손대지 않는다."""
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    item = {**item, "owner": OWNER, "added": time.strftime("%Y-%m-%dT%H:%M:%S+09:00")}
    for i, it in enumerate(m["items"]):
        if it.get("id") == item["id"]:
            if it.get("owner") != OWNER:
                return "kept(foreign)"
            m["items"][i] = item
            break
    else:
        m["items"].append(item)
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(MANIFEST)
    return "written"


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)
