"""개선 후보 → 확인 대장 옮기기 도움(구현 4차 · 확인 대장 16차 개선-1 ⑤ · 원칙 34 · 57 · 98).

LX 관리자 · 담당 프로젝트장이 '개선 후보'에서 '채택'한 줄은 서버에 '확인 대기'로 남는다. 서버는 docs 파일을 고치지 않는다 —
이 스크립트가 '채택됐지만 확인 대장(docs/CONFIRM.md)에 아직 없는 것'을 뽑아 보여 주고, 오케스트레이터가 확인 대장에 옮긴다.
대장에 옮긴 줄은 '개선 후보 #번호' 표시로 알아본다(이 표시가 CONFIRM.md 에 있으면 '이미 옮김').

사용: python tools/review/pull-improvements.py            사람이 읽는 목록 + 대장에 붙일 표 줄
      python tools/review/pull-improvements.py --json     같은 내용 JSON
      python tools/review/pull-improvements.py --all      이미 옮긴 줄까지
DB 는 server/landxi_api/config 의 관리 접속(비밀번호는 server/.env — 화면 · 출력에 내지 않는다). 읽기만 한다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
CONFIRM = ROOT / "docs" / "CONFIRM.md"
KST = dt.timezone(dt.timedelta(hours=9))

HOW = {  # server/landxi_api/improve.py HOW 와 같은 기본 문구(채택 때 관리자가 적지 않았으면)
    "action": "말로 하는 지도 동작으로 넓히기", "screen": "이 화면에서도 하게 하거나, 할 수 있는 화면으로 바로 가는 버튼",
    "nodata": "그 지역 자료를 갖추거나, 결과가 있는 곳으로 안내", "scope": "할 수 있는 사람 · 화면으로 이어 주는 안내",
    "law": "풀어 쓴 말로도 조문을 찾게 하기", "parcel": "화면에서 고른 필지로 알아듣게 하기", "server": "답 서버가 멈춘 까닭을 찾아 막기",
    "other": "질문의 뜻을 알아듣도록 보완"}
KINDS = {"action": "지도 동작 없음", "screen": "이 화면에 없음", "nodata": "자료 없음", "scope": "권한 밖", "law": "법령 못 찾음",
         "parcel": "필지 못 찾음", "server": "서버 응답 없음", "other": "그 밖"}
ROLE_KO = {"staff": "LX 직원", "admin": "LX 관리자", "sales": "LX 영업", "tenant": "기관"}

SQL = """
SELECT i.id, i.no, i.gist, i.note, i.kind, i.state, i.how, i.ledger, i.source, i.decided_at, i.decided_by,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig IN ('blocked','map_failed')) AS n_block,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='reask') AS n_reask,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='not_helpful') AS n_nh,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.sig='card_cancel') AS n_cancel,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.source='check-1001') AS n_check,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.source IN ('auto','screen')) AS n_live,
       (SELECT array_agg(DISTINCT s.role) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS roles,
       (SELECT array_agg(DISTINCT s.screen) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test AND s.screen IS NOT NULL) AS screens,
       (SELECT count(DISTINCT s.tenant_id) FILTER (WHERE s.tenant_id <> 'lx') FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS n_orgs,
       (SELECT u.role FROM lx_users u WHERE u.id = i.decided_by) AS decider_role,
       (SELECT count(*) FROM improve_signals s WHERE s.item_id=i.id AND NOT s.test) AS n_real
  FROM improve_items i
 WHERE i.state = 'adopted' OR (%(all)s AND i.state IN ('adopted', 'built'))
 ORDER BY i.decided_at NULLS LAST, i.no
"""


def mark(no: int) -> str:
    return f"개선 후보 #{no}"


def side(roles: list[str]) -> str:
    lx = any(r in ("staff", "admin", "sales") for r in roles)
    org = "tenant" in roles
    return "둘 다" if lx and org else ("기관 분기" if org else "Land-XI")


def rows(include_all: bool) -> list[dict]:
    import psycopg
    from psycopg.rows import dict_row
    from landxi_api import config
    ledger = CONFIRM.read_text(encoding="utf-8") if CONFIRM.exists() else ""
    out = []
    with psycopg.connect(config.PG_ADMIN_DSN, row_factory=dict_row) as c:
        c.execute("SET default_transaction_read_only = on")
        for r in c.execute(SQL, {"all": include_all}).fetchall():
            roles = [x for x in (r["roles"] or []) if x]
            in_ledger = mark(r["no"]) in ledger
            if in_ledger and not include_all:
                continue
            check_only = r["n_check"] and not r["n_live"]
            out.append({
                "no": r["no"], "mark": mark(r["no"]), "what": r["gist"], "note": r["note"], "kind": KINDS.get(r["kind"], r["kind"]),
                "state": "확인 대기" if r["state"] == "adopted" else "만들어짐", "in_ledger": in_ledger,
                "count": {"blocked": r["n_block"], "reask": None if check_only else r["n_reask"], "not_helpful": None if check_only else r["n_nh"],
                          "card_cancel": r["n_cancel"], "from_check": r["n_check"]},
                "roles": [ROLE_KO.get(x, x) for x in roles], "orgs": r["n_orgs"], "screens": sorted(r["screens"] or []),
                "how": r["how"] or HOW.get(r["kind"], ""), "side": side(roles), "test_only": not r["n_real"],
                "adopted": {"at": r["decided_at"].astimezone(KST).strftime("%m-%d %H:%M") if r["decided_at"] else None,
                            "by": "LX 관리자" if r["decider_role"] == "admin" else ("LX 직원(프로젝트장)" if r["decider_role"] == "staff" else None)},
            })
    return out


def table_line(x: dict) -> str:
    c = x["count"]
    n = f"막힘 {c['blocked']}번" + (f" · 다시 물음 {c['reask']}" if c["reask"] else "") + (f" · 도움 안 됨 {c['not_helpful']}" if c["not_helpful"] else "")
    who = " · ".join(x["roles"]) + (f"(기관 {x['orgs']}곳)" if x["orgs"] else "")
    where = " · ".join(x["screens"]) or "화면 모름"
    what = re.sub(r"\|", "/", x["what"])
    return f"| 개선-? | [화면][{x['side']}] {what} — {x['mark']} | {x['state']} | {n} · {who} · {where} · 제안: {x['how']} |"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--all", action="store_true", help="이미 대장에 옮긴 줄 · 만들어진 줄까지")
    a = ap.parse_args()
    items = rows(a.all)
    if a.json:
        print(json.dumps({"as_of": dt.datetime.now(KST).isoformat(timespec="seconds"), "items": items}, ensure_ascii=False, indent=1))
        return
    now = dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    if not items:
        print(f"채택됐지만 확인 대장에 없는 개선 후보: 없음 ({now} 기준)")
        return
    print(f"채택됐지만 확인 대장에 없는 개선 후보 {len(items)}건 ({now} 기준 · 서버 값 그대로)\n")
    for x in items:
        c = x["count"]
        print(f"#{x['no']}  {x['what']}" + ("  [이미 대장에 있음]" if x["in_ledger"] else "") + ("  [시험으로 모인 줄 — 횟수에서 뺌]" if x["test_only"] else ""))
        print(f"  무엇: XI ChatGEO 가 못 한 요청 — 분류 '{x['kind']}'" + (f" · {x['note']}" if x["note"] else ""))
        dash = lambda v: "—" if v is None else str(v)   # noqa: E731
        print(f"  몇 번: 막힘 {c['blocked']} · 다시 물음 {dash(c['reask'])} · 도움 안 됨 {dash(c['not_helpful'])}"
              + (f" · 확인 카드 취소 {c['card_cancel']}" if c["card_cancel"] else "") + (f" (10-01 점검 {c['from_check']}건 포함)" if c["from_check"] else ""))
        print(f"  역할: {' · '.join(x['roles']) or '—'}" + (f" · 기관 {x['orgs']}곳" if x["orgs"] else "") + f"   화면: {' · '.join(x['screens']) or '—'}")
        print(f"  제안 방법: {x['how']}")
        print(f"  채택: {x['adopted']['by'] or '—'} · {x['adopted']['at'] or '—'}\n")
    print("확인 대장에 붙일 줄(번호 '개선-?'는 대장에서 정한다 · '개선 후보 #n' 표시는 그대로 두면 다음에 '이미 옮김'으로 알아본다):")
    print("| # | 항목 | 상태 | 근거 |")
    print("|---|---|---|---|")
    for x in items:
        print(table_line(x))


if __name__ == "__main__":
    main()
