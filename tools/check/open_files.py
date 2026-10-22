"""로그인 없이 받아지는 파일 자동 점검(10-22 now21 저장보안-제안-공개파일자동점검 채택) — 바깥에 열 때마다(start-public.ps1) 한 번 돈다.

    python tools/check/open_files.py [--base https://app.land-xi.dev] [--quiet]

본다:
  ① 닫혀야 하는 것 — 로그인 · 서명 없이 받으면 401 · 403 · 404 여야 한다:
     sets.yaml 의 공개가 아닌 세트 전부(게이트웨이 /tiles/pmtiles/…) · 옛 정적 길(landxi/data 의 결과 · 영상 · 필지 · 파일 목록) ·
     저장소 안 설정 · 코드 · 기록(.env · server/ · tools/ · docs/ · shots/) · 로그인이 필요한 API(필지 조회 · 지도 중계)
  ② 열려야 하는 것 — 공용 기준 지도(세계 바탕 · 행정경계 · 공개 세트)는 200 · 206.
Cloudflare 가장자리 보관을 비켜 가도록 주소마다 ?nb= 를 붙인다. 결과는 02. 데이터/_logs/open-files-check.json.
① 에서 하나라도 받아지면 LX 관리자 경보(ops_alerts 'open_files_found')를 열고, 다 막히면 닫는다. 종료 코드 = 걸린 수(0 = 통과)."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

import requests
import yaml

REPO = Path(__file__).resolve().parents[2]
LOG = Path("E:/Land-XI 플랫폼/02. 데이터/_logs/open-files-check.json")

STATIC_CLOSED = [
    "/landxi/data/manifest.json",
    "/landxi/data/vector/pmtiles/namwon-farmland-2025.pmtiles",
    "/landxi/data/vector/pmtiles/parcels-namwon.pmtiles",
    "/landxi/data/results/lx/namwon-change.pmtiles",
    "/landxi/data/tiles/namwon_ap25_2023/12/3500/1600.webp",
    "/landxi/assets/data/geo/results/yeosu-marine-2025-aerial.geojson",
    "/landxi/assets/data/geo/namwon-change.geojson",
    "/server/.env", "/.env", "/.env.local", "/server/config/sets.yaml", "/tools/public-gate.mjs",
    "/docs/superpowers/recon-1022/DB-AUDIT.md", "/shots/", "/.git/config", "/package.json",
    "/api/v1/docs", "/api/v1/redoc",
    "/api/v1/parcels?bbox=127.3,35.4,127.4,35.5",
    "/api/v1/proxy/vworld/req/wfs?typename=lp_pa_cbnd_bubun",
]
STATIC_OPEN = [
    "/landxi/data/vector/pmtiles/sido.pmtiles",
    "/landxi/data/vector/pmtiles/sigungu.pmtiles",
    "/landxi/v3/login/",
]


def sets() -> list[tuple[str, bool]]:
    """(세트, 공개인가) — 게이트웨이 규칙(catalog.set_public)과 같은 판정."""
    s = yaml.safe_load((REPO / "server" / "config" / "sets.yaml").read_text(encoding="utf-8")) or {}
    out = []
    for k in ("layers", "imagery"):
        for L in s.get(k) or []:
            st = L.get("set")
            if not st:
                continue
            pub = L.get("export_policy") == "public" and (L.get("role") != "result" or L.get("security_review") == "cleared")
            out.append((st, pub))
    for a in (s.get("aliases") or {}):
        out.append((a, False))
    return out


def get(base: str, path: str) -> int:
    sep = "&" if "?" in path else "?"
    try:
        r = requests.get(base + path + f"{sep}nb={int(time.time())}", headers={"range": "bytes=0-99"}, timeout=30, allow_redirects=False)
        return r.status_code
    except requests.RequestException:
        return 0


def alert(found: list[dict]) -> None:
    """LX 관리자 경보 열기 · 닫기(게이트웨이 경보 표 ops_alerts 와 같은 줄)."""
    try:
        sys.path.insert(0, str(REPO / "server"))
        import psycopg
        from landxi_api import config
        with psycopg.connect(config.PG_WORKER_DSN.replace("@localhost:", "@127.0.0.1:"), connect_timeout=5) as c:
            c.execute("SELECT set_config('app.realm','lx',true)")
            aid = "al_open_files_found_x_x"
            if found:
                c.execute("INSERT INTO ops_alerts(id, rule, level, node, gpu, value, opened_at) VALUES (%s,'open_files_found','fault','gate',NULL,%s,now()) "
                          "ON CONFLICT (id) DO UPDATE SET opened_at = CASE WHEN ops_alerts.closed_at IS NULL THEN ops_alerts.opened_at ELSE now() END, "
                          "closed_at = NULL, value = EXCLUDED.value",
                          (aid, json.dumps({"value": len(found), "unit": "count", "basis": "measured", "source": "tools/check/open_files.py"})))
            else:
                c.execute("UPDATE ops_alerts SET closed_at = now() WHERE id = %s AND closed_at IS NULL", (aid,))
            c.commit()
    except Exception as e:  # noqa: BLE001 — 경보는 못 열어도 결과 파일은 남긴다
        print("경보 기록 건너뜀:", type(e).__name__)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://app.land-xi.dev")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--wait", type=float, default=0, help="처음에 기다릴 초(바깥에 연 직후 터널이 붙을 시간)")
    a = ap.parse_args()
    time.sleep(max(0.0, a.wait))
    base = a.base.rstrip("/")
    rows = []
    for st, pub in sets():
        p = f"/tiles/pmtiles/{st}.pmtiles"
        code = get(base, p)
        ok = code in (200, 206) if pub else code in (401, 403, 404)
        rows.append({"path": p, "want": "열림" if pub else "닫힘", "code": code, "ok": ok})
    for p in STATIC_CLOSED:
        code = get(base, p)
        rows.append({"path": p, "want": "닫힘", "code": code, "ok": code in (301, 302, 400, 401, 403, 404, 405)})
    for p in STATIC_OPEN:
        code = get(base, p)
        rows.append({"path": p, "want": "열림", "code": code, "ok": code in (200, 206)})
    found = [r for r in rows if not r["ok"] and r["want"] == "닫힘"]
    shut = [r for r in rows if not r["ok"] and r["want"] == "열림"]
    out = {"at": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "base": base, "checked": len(rows),
           "open_but_should_close": found, "closed_but_should_open": shut, "rows": rows}
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    alert(found)
    if not a.quiet:
        print(f"로그인 없이 받아지는 파일 점검 — {len(rows)}곳 · 열려 있으면 안 되는데 열림 {len(found)} · 열려야 하는데 닫힘 {len(shut)}")
        for r in found + shut:
            print(f"  {r['want']} 이어야 함 · {r['code']} · {r['path']}")
    return len(found)


if __name__ == "__main__":
    sys.exit(main())
