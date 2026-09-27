#!/usr/bin/env python
"""LX/OPS 감사·결재 읽기 (F2-C) — 게이트웨이 직결 모드에서 배포 제어 '이력(audit_log)'·운영 현황 '결재 대기'를 정본 DB 에서 읽는다.

게이트웨이(F2-B 소유)에 /ops/audit · /approvals 라우트가 없어서(계약 밖 · F1-C 결과 §4.10) :8702 브리지가 이 스크립트를 부른다.
읽기만(SELECT). 관리자 세션 검증은 브리지가 게이트웨이 /me 로 먼저 한다.

  python server/ops/audit_read.py audit --subject dp-nw-farm-25 --limit 50
  python server/ops/audit_read.py approvals --limit 50
  python server/ops/audit_read.py llm          # 기관별 LLM 계량(usage_events dim='llm_tokens' · 이번 달 토큰 · 오늘 실행 수) — 관제 쿼터 링 7·8
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys


def dsn() -> str:
    if os.environ.get("PG_DSN"):
        return os.environ["PG_DSN"]
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    try:
        for line in open(p, encoding="utf-8"):
            if line.strip().startswith("PG_ADMIN_DSN="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return "postgresql://postgres:landxi-dev-admin@localhost:5433/landxi"


def jsonable(v):
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


async def main(a):
    import asyncpg
    con = await asyncpg.connect(dsn(), timeout=5)
    try:
        if a.kind == "llm":
            rows = await con.fetch("SELECT tenant_id, "
                                   "coalesce(sum(amount) FILTER (WHERE at >= date_trunc('month', now())), 0) AS tokens_month, "
                                   "count(DISTINCT job_id) FILTER (WHERE at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul') AS runs_day, "
                                   "max(at) AS last_at, count(*) AS events FROM usage_events WHERE dim = 'llm_tokens' GROUP BY tenant_id")
            items = [{k: jsonable(v) for k, v in dict(r).items()} for r in rows]
            for it in items:
                it["tokens_month"] = float(it["tokens_month"] or 0); it["runs_day"] = int(it["runs_day"] or 0); it["events"] = int(it["events"] or 0)
            sys.stdout.write(json.dumps({"items": items, "source": "PostGIS usage_events dim='llm_tokens'(F2-E 계량 · 읽기만)"}, ensure_ascii=False, default=str))
            return
        if a.kind == "audit":
            rows = await con.fetch("SELECT id, actor, realm, action, subject, before, after, at FROM audit_log "
                                   "WHERE ($1::text IS NULL OR subject = $1) ORDER BY at DESC LIMIT $2", a.subject, a.limit)
            total = await con.fetchval("SELECT count(*) FROM audit_log WHERE ($1::text IS NULL OR subject = $1)", a.subject)
        else:
            rows = await con.fetch("SELECT id, subject_type, subject_id, requested_by, decided_by, decision, reason, at FROM approvals "
                                   "ORDER BY at DESC NULLS LAST LIMIT $1", a.limit)
            total = await con.fetchval("SELECT count(*) FROM approvals")
        items = [{k: jsonable(v) for k, v in dict(r).items()} for r in rows]
        if a.kind == "audit":
            for it in items:   # 사유는 after.reason 또는 before/after 밖 — 게이트웨이 audit() 형식을 그대로 둔다
                aft = it.get("after") if isinstance(it.get("after"), dict) else {}
                it["reason"] = aft.get("reason") if isinstance(aft, dict) else None
        out = {"items": items, "total": int(total or 0), "source": "PostGIS " + ("audit_log" if a.kind == "audit" else "approvals") + " (읽기만 · server/ops/audit_read.py)"}
        if a.kind == "approvals":
            out["pending"] = sum(1 for it in items if it.get("decision") is None)
        sys.stdout.write(json.dumps(out, ensure_ascii=False, default=str))
    finally:
        await con.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["audit", "approvals", "llm"])
    ap.add_argument("--subject", default=None)
    ap.add_argument("--limit", type=int, default=50)
    for s_ in (sys.stdout, sys.stderr):
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    try:
        asyncio.run(main(ap.parse_args()))
    except Exception as e:  # noqa: BLE001
        sys.stdout.write(json.dumps({"items": [], "total": 0, "error": f"{e.__class__.__name__}: {e}"}, ensure_ascii=False))
