"""V-World 캐시에 남은 status ERROR 본문 제거(F1-B must_fix 4 · v1.1).

v1.0 프록시는 200 으로 온 ERROR(PARAM_REQUIRED 등)를 7일 캐시했다. 이 스크립트는 cache/vworld/** 를 훑어
ERROR 본문(.bin + .json 메타)을 지운다. 게이트웨이는 이제 ERROR 를 캐시하지 않고(502 upstream_error) 읽을 때도 걸러 낸다.

python server/pipelines/purge_vworld_error_cache.py [--dry]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import proxy  # noqa: E402


def purge(cache_root: Path | None = None, dry: bool = False) -> dict:
    """cache_root/vworld/** 의 ERROR 본문 제거. 판정은 게이트웨이와 같은 `proxy.upstream_status_error()`
    (JSON 이 깨진 본문도 원문 바이트 `"status" : "ERROR"` 정규식으로 잡는다 — F2-B 1차 판정 불합격 1)."""
    root = Path(cache_root or proxy.cache_root()) / "vworld"
    seen = removed = 0
    rows = []
    for b in sorted(root.rglob("*.bin")) if root.exists() else []:
        m = b.with_suffix(".json")
        seen += 1
        ctype = "application/json"
        key = ""
        if m.exists():
            try:
                meta = json.loads(m.read_text(encoding="utf-8"))
                ctype, key = meta.get("ctype", ctype), meta.get("key", "")
            except Exception:
                pass
        err = proxy.upstream_status_error(b.read_bytes(), ctype) or proxy._key_error(b.read_bytes(), ctype)
        if err:
            rows.append({"file": str(b.relative_to(root)).replace("\\", "/"), "error": err.split(" · ")[0], "key": key[:160]})
            if not dry:
                b.unlink(missing_ok=True)
                m.unlink(missing_ok=True)
            removed += 1
    return {"cache": str(root), "entries": seen, "error_bodies": removed, "dry": dry, "removed": rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    print(json.dumps(purge(dry=a.dry), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
