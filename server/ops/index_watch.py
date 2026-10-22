"""안 쓰는 색인 1주 관찰(10-22 now21 인프라-안쓰는색인 ⓐ '일주일 더 보고 0번이면 지움').

    python ops/index_watch.py --start     # 지금 한 번도 안 쓰인 색인(5MB 넘음 · 위치 색인 · 고유 · 기본 열쇠 · 나눈 표의 칸 색인 제외)의 쓰인 횟수를 적어 둔다
    python ops/index_watch.py --finish    # 적어 둔 날부터 7일이 지났으면, 그사이 한 번도 안 쓰인 색인만 지운다(다시 만들 수 있게 정의를 남김)
    python ops/index_watch.py --status

기록 = 02. 데이터/_logs/index-watch.json. 지운 것은 감사 기록 'db.index.drop' 한 줄. 예약 작업 'LandXI-Index-Watch'(한 번 · 7일 뒤)가 --finish 를 부른다.
DB 를 잠그지 않게 DROP INDEX CONCURRENTLY. 비밀번호는 server/.env(PG_ADMIN_DSN)에서 읽고 출력하지 않는다."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
ENV = HERE.parent / ".env"
LOG = Path("E:/Land-XI 플랫폼/02. 데이터/_logs/index-watch.json")
DAYS = 7
CAND = ("SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan, pg_relation_size(s.indexrelid) AS bytes, pg_get_indexdef(s.indexrelid) AS def "
        "FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid JOIN pg_class c ON c.oid = s.indexrelid JOIN pg_am am ON am.oid = c.relam "
        "WHERE s.idx_scan = 0 AND pg_relation_size(s.indexrelid) > 5000000 AND NOT i.indisunique AND NOT i.indisprimary "
        "AND am.amname = 'btree' AND NOT EXISTS (SELECT 1 FROM pg_inherits h WHERE h.inhrelid = s.indexrelid) "
        "AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = s.indexrelid) ORDER BY bytes DESC")


def dsn() -> str:
    return re.search(r"^PG_ADMIN_DSN=(.*?)\s*$", ENV.read_text(encoding="utf-8"), re.M).group(1).replace("@localhost:", "@127.0.0.1:")


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))


def start():
    with psycopg.connect(dsn(), autocommit=True) as c:
        rows = c.execute(CAND).fetchall()
    st = {"started_at": now().isoformat(timespec="seconds"), "days": DAYS, "state": "watching",
          "items": [{"schema": r[0], "table": r[1], "index": r[2], "scans_at_start": int(r[3]), "mb": round(r[4] / 1e6, 1), "def": r[5]} for r in rows]}
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"관찰 시작 — 색인 {len(rows)}개 · {sum(i['mb'] for i in st['items']):.0f}MB · {DAYS}일 뒤 판정")


def finish(force: bool = False):
    st = json.loads(LOG.read_text(encoding="utf-8"))
    if st.get("state") != "watching":
        print("이미 판정함:", st.get("state")); return
    t0 = dt.datetime.fromisoformat(st["started_at"])
    if not force and now() < t0 + dt.timedelta(days=st.get("days", DAYS)):
        print("아직 관찰 중 —", (t0 + dt.timedelta(days=st.get("days", DAYS))).isoformat(timespec="minutes"), "에 판정"); return
    dropped, kept = [], []
    with psycopg.connect(dsn(), autocommit=True) as c:
        for it in st["items"]:
            r = c.execute("SELECT idx_scan FROM pg_stat_user_indexes WHERE schemaname=%s AND indexrelname=%s", (it["schema"], it["index"])).fetchone()
            if not r:
                kept.append({**it, "why": "이미 없음"}); continue
            if int(r[0]) < int(it["scans_at_start"]):
                kept.append({**it, "why": "그사이 통계가 처음부터 다시 셈 — 판정 못함"}); continue
            used = int(r[0]) - int(it["scans_at_start"])
            if used > 0:
                kept.append({**it, "scans_in_week": used}); continue
            c.execute(f'DROP INDEX CONCURRENTLY IF EXISTS "{it["schema"]}"."{it["index"]}"')
            dropped.append(it)
        c.execute("SELECT set_config('app.realm','lx',false)")
        c.execute("INSERT INTO audit_log(actor, realm, action, subject, before, after) VALUES ('system','system','db.index.drop','index-watch',%s,%s)",
                  (json.dumps({"watched": len(st["items"]), "since": st["started_at"]}),
                   json.dumps({"dropped": [d["index"] for d in dropped], "kept": [k["index"] for k in kept],
                               "mb_freed": round(sum(d["mb"] for d in dropped), 1)}, ensure_ascii=False)))
    st.update(state="done", finished_at=now().isoformat(timespec="seconds"), dropped=dropped, kept=kept)
    LOG.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"판정 — 지움 {len(dropped)}개({sum(d['mb'] for d in dropped):.0f}MB) · 둠 {len(kept)}개")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", action="store_true")
    ap.add_argument("--finish", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    if a.start:
        start()
    elif a.finish:
        finish(a.force)
    else:
        print(LOG.read_text(encoding="utf-8") if LOG.exists() else "기록 없음")
