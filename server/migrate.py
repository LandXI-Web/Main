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
    print(json.dumps({"files": [p.name for p in files()], "failed": fails}, ensure_ascii=False))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
