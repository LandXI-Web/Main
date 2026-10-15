"""XI ChatGEO 정기 개선 바퀴 — 예약 실행(원칙 249 · 10-15 ChatGEO-매주 '돌림' · impl-32 chatgeo-loop/LOOP.md 1절 주기).

Windows 예약 작업 'LandXI-ChatGEO-Weekly'(agent/register-weekly.ps1)가 매일 새벽 2시에 깨운다. 깨면 무엇을 할지 여기서 정한다:
  · 월요일                                  → 한 바퀴(개선 후보 전부 + 되던 질문)
  · 그 밖의 날 · 지난 바퀴 뒤 새로 모인 후보 10건 이상 → 한 바퀴를 앞당긴다(그날 새벽 = 다음 쉬는 시간)
  · 그 밖의 날 · 같은 질문을 3명 이상이 물은 후보   → 그 후보만 작은 판(그 후보 질문 + 되던 질문)
  · 해당 없음                               → 아무것도 하지 않는다(기록 한 줄)
고친다 = 서버 제안 가운데 바로 되는 것(다른 이름 · 질문 뜻 연결 · 답 문구 = 관리자 화면 '이대로 반영'과 같은 길 use=suggest) + 모아 두기(한 바퀴 때만).
새 도구 · 길잡이 모델 추가 학습은 사람이 정한다(LOOP.md 3절) — 여기서 하지 않는다.
내보낸다 = 통과 기준(답한 수 증가 · 나빠진 질문 0)을 넘으면 '승인 대기'까지만. 승인 · 거절은 LX 관리자(개선 후보 → '새 판' 줄).
못 넘으면 서버가 승인 요청을 막고(실제 사용자에게 적용 0) 시스템이 그 판을 거둔다 — 묶인 후보는 새로 옴으로 돌아가 다음 바퀴에 다시 본다.

    python -m agent.improve_weekly            예약 실행(위 규칙 · 쉬는 시간 01–06시가 아니면 그냥 끝)
    python -m agent.improve_weekly --test     시험 실행 — 판 메모 '시험' · 작은 판 하나 · 승인 대기까지 가면 시스템이 그 판을 거둔다(결과 정리)
    python -m agent.improve_weekly --dry      무엇을 할지만 적는다(묻지도 고치지도 않음)

기록 = 데이터 폴더 improve/weekly/{날짜시각}/(plan · eval-before · eval-after · compare · run.json) · 상태 = improve/weekly/state.json
전력: 언어 모델을 질문 하나씩 차례로(동시 0) · 분석 작업이 학습 장비를 쓰면 끝날 때까지 기다림(improve_eval.gpu_busy) ·
학습(추가 학습)은 하지 않음 · 한 바퀴 상한 3시간(예약 작업 실행 한도와 같은 값).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import traceback
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import improve_eval as E  # noqa: E402
from agent import improve_round as R  # noqa: E402
from landxi_api import config  # noqa: E402

HOME = config.DATA_ROOT / "improve" / "weekly"
STATE = HOME / "state.json"
LOCK = HOME / "running.lock"
NEW_MIN = 10          # 지난 바퀴 뒤 새로 모인 후보가 이만큼이면 앞당긴다
ASKERS_MIN = 3        # 같은 질문을 이만큼(서로 다른 사람)이 물었으면 작은 판
QUIET = (1, 6)        # 쉬는 시간(시) — 예약은 2시 · 놓친 실행이 낮에 뜨면 그냥 끝
CAP_S = 3 * 3600      # 한 바퀴 상한
KST = dt.timezone(dt.timedelta(hours=9))


def now() -> dt.datetime:
    return dt.datetime.now(KST)


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def save_state(st: dict) -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def log_line(st: dict, row: dict) -> None:
    st.setdefault("runs", []).append(row)
    st["runs"] = st["runs"][-60:]
    save_state(st)


def _ts(s: str | None) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(str(s)) if s else None
    except ValueError:
        return None


def decide(items: list[dict], st: dict, at: dt.datetime, test: bool) -> tuple[str, list[dict], str]:
    """→ (mode 'full'|'small'|'none', 고를 후보, 까닭)."""
    new = [x for x in items if x.get("state") == "new" and not x.get("test_item")]
    last = _ts(st.get("last_round_at"))
    fresh = [x for x in new if not last or (_ts(x.get("first_at")) or at) > last]
    many = [x for x in new if ((x.get("askers") or {}).get("value") or 0) >= ASKERS_MIN and x["id"] not in (st.get("small_done") or [])]
    if test:                                           # 시험 = 작은 판 하나(바로 고칠 수 있는 후보 가운데 사람이 가장 많이 물은 것)
        quick = sorted([x for x in new if (x.get("suggest") or {}).get("quick")], key=lambda x: -((x.get("askers") or {}).get("value") or 0))
        return ("small", quick[:1], "시험 실행 — 바로 고칠 수 있는 후보 하나") if quick else ("none", [], "시험 실행 — 바로 고칠 수 있는 후보 없음")
    if at.weekday() == 0:
        return "full", new, "월요일 정기 바퀴"
    if len(fresh) >= NEW_MIN:
        return "full", new, f"지난 바퀴 뒤 새 후보 {len(fresh)}건(앞당김)"
    if many:
        return "small", many, f"같은 질문을 {ASKERS_MIN}명 이상이 물은 후보 {len(many)}건(작은 판)"
    return "none", [], f"해당 없음(새 후보 {len(fresh)}건 · {ASKERS_MIN}명 이상 물은 후보 0)"


def plan_of(chosen: list[dict], mode: str, note: str) -> dict:
    fixes = []
    for x in chosen:
        sg = x.get("suggest") or {}
        if sg.get("quick"):
            fixes.append({"item": x["id"], "how": "a", "body": {"use": "suggest"}, "why": f"{sg.get('mode')} — {sg.get('how') or ''}"[:160]})
        elif mode == "full" and sg.get("mode") == "collect":
            fixes.append({"item": x["id"], "how": "collect", "body": {"mode": "collect"}, "why": (sg.get("how") or "모아 두기")[:160]})
    return {"note": note, "tools": [], "fixes": fixes}


def one_round(tok: dict, plan: dict, out: Path, only: set | None, t0: float) -> dict:
    """improve_round.main 과 같은 차례 — 전 → 새 판 → 고침 → 후 → 비교 → 승인 요청. only = 작은 판(그 후보 질문 + 되던 질문)."""
    A = E.H(tok["admin"])
    before = E.run(str(out / "eval-before.json"), only)
    if time.time() - t0 > CAP_S:
        return {"stopped": "상한 시간 — 고치기 전에 멈춤"}
    rel = E._retry(httpx.post, E.B + "/improve/releases", headers=A, json={"tools": [], "note": plan["note"], "by": "system"}, timeout=60).json()["release"]
    rid, log = rel["id"], [{"step": "release", "id": rel["id"], "seq": rel.get("seq")}]
    for f in plan["fixes"]:
        body = {**f["body"], "by": "system", **({} if f["how"] == "collect" else {"release": rid})}
        r = E._retry(httpx.post, E.B + f"/improve/items/{f['item']}/adopt", headers=A, json=body, timeout=60)
        it = (r.json() or {}).get("item") or {} if r.headers.get("content-type", "").startswith("application/json") else {}
        log.append({"step": "adopt", "item": f["item"], "how": f["how"], "status": r.status_code, "state": it.get("state"),
                    "error": None if r.status_code < 400 else r.text[:200]})
    after = E.run(str(out / "eval-after.json"), only)
    R.recheck(after, before, tok)
    after["summary"] = {v: sum(1 for r in after["rows"] if r["verdict"] == v) for v in ("답함", "안내함", "못 함")}
    (out / "eval-after.json").write_text(json.dumps(after, ensure_ascii=False, indent=1), encoding="utf-8")
    targeted = {f["item"] for f in plan["fixes"] if f["how"] != "collect"}
    cmp = R.compare(before, after, targeted)
    better_items = sorted({r["item"] for r in cmp["rows"] if r["change"] == "better" and r["after"] == "답함" and r["item"]})
    sub = {"before": {"total": before["total"], **before["summary"]}, "after": {"total": after["total"], **after["summary"]},
           "better": cmp["better"], "worse": cmp["worse"], "better_items": better_items, "works": R.works_before(before)}
    r = E._retry(httpx.post, E.B + f"/improve/releases/{rid}/submit", headers=A, json=sub, timeout=60)
    state = "pending" if r.status_code < 400 else "draft"
    log.append({"step": "submit", "status": r.status_code, "state": state})
    if state == "draft":                               # 통과 못 함 — 시스템이 그 판을 거둔다(규칙 끔 · 묶인 후보는 새로 옴 → 다음 바퀴에 다시)
        c = E._retry(httpx.post, E.B + f"/improve/releases/{rid}/reject", headers=A, json={"by": "system"}, timeout=60)
        state = "closed" if c.status_code < 400 else "draft"
        log.append({"step": "close", "status": c.status_code, "state": state})
    (out / "compare.json").write_text(json.dumps({**cmp, "submit": sub, "log": log}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return {"release": rid, "release_no": (r.json().get("release") or {}).get("no") if r.status_code < 400 else None, "state": state,
            "before": sub["before"], "after": sub["after"], "better": cmp["better"], "worse": cmp["worse"], "flaky": cmp["flaky"], "log": log}


def tidy_test(tok: dict, res: dict, plan: dict) -> list[dict]:
    """시험 실행 결과 정리 — 승인 대기면 시스템이 거둔다(거절 = 규칙 끔 · 후보는 새로 옴). 만드는 중이면 고친 후보를 하나씩 되돌린다."""
    A, done = E.H(tok["admin"]), []
    rid = res.get("release")
    if not rid:
        return done
    if res.get("state") == "pending":
        r = E._retry(httpx.post, E.B + f"/improve/releases/{rid}/reject", headers=A, json={"by": "system"}, timeout=60)
        done.append({"step": "reject", "release": rid, "status": r.status_code})
    return done


def main(argv: list[str]) -> int:
    test, dry = "--test" in argv, "--dry" in argv
    at, t0 = now(), time.time()
    st = load_state()
    HOME.mkdir(parents=True, exist_ok=True)
    if not test and not dry and not (QUIET[0] <= at.hour < QUIET[1]):
        log_line(st, {"at": at.isoformat(timespec="seconds"), "mode": "skip", "why": "쉬는 시간(01–06시)이 아님"})
        return 0
    if LOCK.exists() and time.time() - LOCK.stat().st_mtime < CAP_S:
        log_line(st, {"at": at.isoformat(timespec="seconds"), "mode": "skip", "why": "앞 바퀴가 아직 도는 중"})
        return 0
    try:
        httpx.get(E.B + "/health", timeout=10).raise_for_status()
    except Exception as e:  # noqa: BLE001
        log_line(st, {"at": at.isoformat(timespec="seconds"), "mode": "skip", "why": f"게이트웨이 응답 없음({type(e).__name__})"})
        return 1
    tok = E.login()
    items = E._retry(httpx.get, E.B + "/improve/items", headers=E.H(tok["admin"]), params={"state": "new"}, timeout=120).json()["items"]
    mode, chosen, why = decide(items, st, at, test)
    out = HOME / (at.strftime("%Y%m%d-%H%M") + ("-test" if test else ""))
    row = {"at": at.isoformat(timespec="seconds"), "mode": mode, "why": why, "test": test, "items": [x["id"] for x in chosen], "dir": out.name}
    if mode == "none" or dry:
        row["plan"] = plan_of(chosen, mode, why) if dry and mode != "none" else None
        log_line(st, row)
        print(json.dumps(row, ensure_ascii=False))
        return 0
    plan = plan_of(chosen, mode, ("시험 · " if test else "") + f"정기 개선 바퀴 {at:%m-%d} — {why}")
    out.mkdir(parents=True, exist_ok=True)
    (out / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    if not [f for f in plan["fixes"] if f["how"] != "collect"]:
        row["why"] += " · 바로 고칠 것 없음(새 판을 열지 않음)"
        if mode == "full":                             # 모아 두기만 — 판 없이(다음 바퀴 평가 질문)
            for f in plan["fixes"]:
                E._retry(httpx.post, E.B + f"/improve/items/{f['item']}/adopt", headers=E.H(tok["admin"]), json={**f["body"], "by": "system"}, timeout=60)
            st["last_round_at"] = at.isoformat(timespec="seconds")
        log_line(st, row)
        return 0
    LOCK.write_text(str(os.getpid()), encoding="utf-8")
    try:
        only = None if mode == "full" else ({x["id"] for x in chosen} | {b[0] for b in E.BASELINE})
        res = one_round(tok, plan, out, only, t0)
        if test:
            res["tidy"] = tidy_test(tok, res, plan)
        row.update({k: v for k, v in res.items() if k != "log"})
        if mode == "full" and not test:
            st["last_round_at"] = at.isoformat(timespec="seconds")
        if mode == "small" and not test:
            st["small_done"] = sorted(set(st.get("small_done") or []) | {x["id"] for x in chosen})
    except Exception as e:  # noqa: BLE001
        row.update({"error": f"{type(e).__name__}: {str(e)[:200]}", "trace": traceback.format_exc()[-800:]})
    finally:
        LOCK.unlink(missing_ok=True)
        row["minutes"] = round((time.time() - t0) / 60, 1)
        (out / "run.json").write_text(json.dumps(row, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        log_line(st, row)
    print(json.dumps({k: row.get(k) for k in ("mode", "why", "state", "before", "after", "better", "worse", "minutes", "error")}, ensure_ascii=False))
    return 0 if not row.get("error") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
