"""migrations/*.sql 을 번호순으로 전부 적용(D0 · 멱등) — setup.ps1 · start-landxi.ps1 이 부른다.

python server/migrate.py            # 새 파일·바뀐 파일만(sha256) · 기록 schema_migrations
python server/migrate.py --all      # 전부 다시(각 파일은 IF NOT EXISTS 로 멱등이어야 한다)
0002_survey.sql(F2-S) · 0003_agent.sql(F2-E) 은 다른 에픽 소유 — 있으면 적용, 없으면 건너뜀. 한 파일이 실패해도 나머지는 적용하고
끝에 실패 목록 + exit 1(기동 스크립트가 빨간 줄로 보여 준다).
그 뒤 published_sets 를 manifest.json(job_id 가 있는 게시 항목)과 맞춘다(v1.1-19 별칭 · 파일이 정본).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from landxi_api import config  # noqa: E402

MIG = config.SERVER_ROOT / "migrations"


def files() -> list[Path]:
    out = []
    for p in MIG.glob("*.sql"):
        m = re.match(r"^(\d+)_", p.name)
        if m:
            out.append((int(m.group(1)), p.name, p))
    return [p for _, _, p in sorted(out)]


def sync_published(conn) -> int:
    man = config.manifest()
    n = 0
    for it in man.get("items", []):
        jid, path = it.get("job_id"), it.get("path") or ""
        if not jid or not path.startswith("results/"):
            continue
        set_id = path[:-len(".pmtiles")] if path.endswith(".pmtiles") else path
        if not conn.execute("SELECT 1 FROM jobs WHERE id=%s", (jid,)).fetchone():
            continue
        conn.execute("INSERT INTO published_sets(set_id, job_id, tenant_id, path, n) VALUES (%s,%s,%s,%s,%s) "
                     "ON CONFLICT (set_id) DO UPDATE SET job_id=EXCLUDED.job_id, path=EXCLUDED.path, n=EXCLUDED.n",
                     (set_id, jid, set_id.split("/")[1], path, it.get("count")))
        n += 1
    return n


def dup_numbers() -> dict[int, list[str]]:
    """같은 번호를 쓴 이력 파일(0004 · 0008 이 옛 겹침) — 0118 부터는 겹치면 기동 때 알린다(번호는 이어서 쓴다 · 바퀴 22 P4)."""
    seen: dict[int, list[str]] = {}
    for p in MIG.glob("*.sql"):
        m = re.match(r"^(\d+)_", p.name)
        if m:
            seen.setdefault(int(m.group(1)), []).append(p.name)
    return {k: v for k, v in seen.items() if len(v) > 1}


def sync_tenant_regions(conn) -> dict:
    """기관이 볼 수 있는 시군구(접두) — config/regions.yaml tenants 가 정본 → tenant_regions 표(필지 RLS · 0119).
    sgg: [] = 전국('' 한 줄) · global(해외) = 국내 0 줄. parent: 가 있으면 tenants.parent_id(광역 · 기초 위아래)."""
    if not conn.execute("SELECT to_regclass('public.tenant_regions') IS NOT NULL").fetchone()[0]:
        return {"skipped": "tenant_regions 없음"}
    cfg = (config.load_yaml("regions") or {}).get("tenants") or {}
    have = {r[0] for r in conn.execute("SELECT id FROM tenants").fetchall()}
    n = 0
    with conn.transaction():
        for t, v in cfg.items():
            if t not in have:
                continue
            v = v or {}
            want = set() if v.get("global") else ({""} if not (v.get("sgg") or []) else {str(x) for x in v["sgg"]})
            conn.execute("DELETE FROM tenant_regions WHERE tenant_id=%s AND NOT (prefix = ANY(%s))", (t, sorted(want)))
            for px in sorted(want):
                conn.execute("INSERT INTO tenant_regions(tenant_id, prefix) VALUES (%s,%s) ON CONFLICT DO NOTHING", (t, px))
            n += len(want)
            par = v.get("parent")
            conn.execute("UPDATE tenants SET parent_id=%s WHERE id=%s AND parent_id IS DISTINCT FROM %s",
                         (par if par in have and par != t else None, t, par if par in have and par != t else None))
    return {"tenants": len(cfg), "prefixes": n}


def sync_tenant_role(conn) -> dict:
    """기관 권한 계정(landxi_tenant · 0121) — 비밀번호는 server/.env PG_TENANT_PASSWORD 에만(값이 없으면 접속 안 되는 채로 둔다 · 원칙 307).
    권한 · 칸막이는 lx_tenant_role_sync() 로 앱 계정과 맞춘다(새 표 · 새 정책도)."""
    if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='landxi_tenant'").fetchone():
        return {"skipped": "landxi_tenant 없음"}
    pw = config.get("PG_TENANT_PASSWORD")
    if pw:
        from psycopg import sql
        conn.execute(sql.SQL("ALTER ROLE landxi_tenant LOGIN PASSWORD {}").format(sql.Literal(pw)))
    out = conn.execute("CALL lx_tenant_role_sync(NULL)").fetchone()[0]     # 표마다 따로 커밋(잠금 3초)
    return {"login": bool(pw), **(out or {})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    import psycopg
    fails = []
    with psycopg.connect(config.PG_ADMIN_DSN, autocommit=True) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, sha256 text, applied_at timestamptz DEFAULT now())")
        done = {r[0]: r[1] for r in conn.execute("SELECT name, sha256 FROM schema_migrations").fetchall()}
        for p in files():
            sql = p.read_text(encoding="utf-8-sig")
            sha = hashlib.sha256(sql.encode()).hexdigest()
            if not a.all and done.get(p.name) == sha:
                print(f"[migrate] {p.name} = (적용됨)")
                continue
            try:
                with conn.transaction():
                    conn.execute(sql)
                    conn.execute("INSERT INTO schema_migrations(name, sha256) VALUES (%s,%s) ON CONFLICT (name) DO UPDATE SET sha256=EXCLUDED.sha256, "
                                 "applied_at=now()", (p.name, sha))
                print(f"[migrate] {p.name} 적용")
            except Exception as e:
                fails.append((p.name, str(e).splitlines()[0][:200]))
                print(f"[migrate] {p.name} 실패: {fails[-1][1]}")
        try:
            n = sync_published(conn)
            print(f"[migrate] published_sets ← manifest {n}건")
        except Exception as e:
            print(f"[migrate] published_sets 동기화 실패: {e}")
        for name, fn in (("tenant_regions ← regions.yaml", sync_tenant_regions), ("기관 권한 계정", sync_tenant_role)):
            try:
                print(f"[migrate] {name} {json.dumps(fn(conn), ensure_ascii=False)}")
            except Exception as e:
                fails.append((name, str(e).splitlines()[0][:200]))
                print(f"[migrate] {name} 실패: {fails[-1][1]}")
        dup = {k: v for k, v in dup_numbers().items() if k >= 118}
        if dup:
            fails.append(("이력 번호 겹침", json.dumps(dup, ensure_ascii=False)))
            print(f"[migrate] 이력 번호가 겹칩니다(0118 부터는 이어서 한 번호씩): {dup}")
    print(json.dumps({"files": [p.name for p in files()], "failed": fails}, ensure_ascii=False))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
