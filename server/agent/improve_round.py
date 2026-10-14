"""XI ChatGEO 정기 개선 바퀴 한 바퀴(원칙 249 · impl-32 chatgeo-loop · docs/superpowers/final/process/impl-32/chatgeo-loop/LOOP.md).

  모은다(서버가 저절로 · improve.record_run) → 나눈다(개선 후보 표) → 고친다(이 파일 · 계획 JSON) → 잰다(improve_eval) → 내보낸다(판 승인 요청).

    python -m agent.improve_round PLAN.json BEFORE.json OUT_DIR        (cwd = server/)

① 새 판(만드는 중 · by 시스템)을 연다 — 계획의 새 도구 이름을 싣는다(판이 승인되기 전에는 시험 질문에만 길이 열림).
② 계획의 고칠 것을 관리자 화면 '이대로 반영'과 같은 길(POST /improve/items/{id}/adopt)로 넣는다 — by 시스템 · 판에 묶음(모아 두기는 판 밖).
③ '후' 점수를 잰다(같은 평가 질문 · 같은 판정). 나빠진 듯한 질문은 두 번 더 물어 한 번이라도 전과 같으면 '흔들림'으로 본다(모델 답의 흔들림).
④ 전/후 비교 → 통과 기준(답한 수 증가 · 나빠진 질문 0)을 넘으면 승인 요청(POST /improve/releases/{id}/submit) · 못 넘으면 만드는 중으로 남긴다.
승인 · 거절 · 되돌리기는 LX 관리자 화면(개선 후보 → '새 판' 줄)에서 사람이 한다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import improve_eval as E  # noqa: E402

RANK = {"못 함": 0, "안내함": 1, "답함": 2}


def compare(before: dict, after: dict, targeted: set | None = None) -> dict:
    """질문마다 전/후 판정 — better(고친 후보의 질문이 올라감) · worse(내려감 · 흔들림 제외) · flaky(흔들림) · same.
    고치지 않은 후보의 질문이 올라간 것은 모델 답의 흔들림이다(나아진 수 · '이제 됩니다'에 넣지 않는다)."""
    a_by = {r["id"]: r for r in after["rows"]}
    rows = []
    for b in before["rows"]:
        a = a_by.get(b["id"])
        if not a:
            continue
        d = RANK[a["verdict"]] - RANK[b["verdict"]]
        if d > 0:
            st = "better" if targeted is None or b.get("item") in targeted else "flaky"
        else:
            st = "worse" if d < 0 and not a.get("flaky") else ("flaky" if d < 0 else "same")
        rows.append({"id": b["id"], "item": b.get("item"), "no": b.get("no"), "q": b["q"], "before": b["verdict"], "after": a["verdict"], "change": st,
                     "tools_after": a.get("tools") or [], "answer_after": a.get("answer"), "hint_after": a.get("hint")})
    return {"rows": rows, "better": sum(1 for r in rows if r["change"] == "better"), "worse": sum(1 for r in rows if r["change"] == "worse"),
            "flaky": sum(1 for r in rows if r["change"] == "flaky")}


def recheck(after: dict, before: dict, tok: dict, n: int = 2) -> None:
    """나빠진 듯한 질문만 n 번 더 — 한 번이라도 전 판정 이상이면 흔들림(모델 답이 매번 같지 않음)으로 표시."""
    b_by = {r["id"]: r for r in before["rows"]}
    for r in after["rows"]:
        b = b_by.get(r["id"])
        if not b or RANK[r["verdict"]] >= RANK[b["verdict"]]:
            continue
        for _ in range(n):
            res = E.ask(tok[r["role"]], r["q"], E.ctx_for(r["page"], r["role"]))
            v, _k = E.I.judge(res["event"], res["data"], confirm=res["confirm"])
            if RANK[v] >= RANK[b["verdict"]]:
                r["flaky"] = True
                r["recheck"] = v
                break


def main(plan_path: str, before_path: str, out_dir: str) -> None:
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    out = Path(out_dir)
    before = json.loads(Path(before_path).read_text(encoding="utf-8"))
    tok = E.login()
    A = E.H(tok["admin"])
    rel = E._retry(httpx.post, E.B + "/improve/releases", headers=A, json={"tools": plan.get("tools") or [], "note": plan.get("note"), "by": "system"},
                   timeout=60).json()["release"]
    rid = rel["id"]
    log = [{"step": "release", "id": rid, "seq": rel["seq"]}]
    for f in plan.get("fixes") or []:
        body = {**f["body"], "by": "system"}
        if f.get("how") != "collect":
            body["release"] = rid
        r = E._retry(httpx.post, E.B + f"/improve/items/{f['item']}/adopt", headers=A, json=body, timeout=60)
        it = (r.json() or {}).get("item") or {}
        log.append({"step": "adopt", "item": f["item"], "how": f.get("how"), "status": r.status_code, "state": it.get("state"),
                    "mode": (it.get("adopt") or {}).get("mode_label"), "error": None if r.status_code < 400 else r.text[:200]})
        print(log[-1], flush=True)
    after = E.run(str(out / "eval-after.json"))
    recheck(after, before, tok)
    after["summary"] = {v: sum(1 for r in after["rows"] if r["verdict"] == v) for v in ("답함", "안내함", "못 함")}
    (out / "eval-after.json").write_text(json.dumps(after, ensure_ascii=False, indent=1), encoding="utf-8")
    cmp = compare(before, after, {f["item"] for f in plan.get("fixes") or [] if f.get("how") != "collect"})
    items_better = sorted({r["item"] for r in cmp["rows"] if r["change"] == "better" and r["after"] == "답함" and r["item"]})
    notify = sorted(set(items_better) | {x for x in (plan.get("notify_also") or [])
                                          if any(r["item"] == x and r["after"] == "답함" for r in cmp["rows"])})
    sub = {"before": {"total": before["total"], **before["summary"]}, "after": {"total": after["total"], **after["summary"]},
           "better": cmp["better"], "worse": cmp["worse"], "better_items": notify,
           "works": works_before(before)}
    r = E._retry(httpx.post, E.B + f"/improve/releases/{rid}/submit", headers=A, json=sub, timeout=60)
    log.append({"step": "submit", "status": r.status_code, "body": r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text[:200]})
    (out / "compare.json").write_text(json.dumps({**cmp, "submit": sub, "log": log}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(json.dumps({"before": sub["before"], "after": sub["after"], "better": cmp["better"], "worse": cmp["worse"], "flaky": cmp["flaky"],
                      "submit": r.status_code}, ensure_ascii=False))


def works_before(before: dict) -> list[str]:
    """고치기 전 평가에서 이미 '답함'이던 개선 후보(그 후보의 질문 모두) — 화면은 '이대로 반영' 대신 '지금 됩니다'."""
    by: dict[str, list[str]] = {}
    for r in before.get("rows") or []:
        if r.get("item"):
            by.setdefault(r["item"], []).append(r["verdict"])
    return sorted(k for k, v in by.items() if v and all(x == "답함" for x in v))


if __name__ == "__main__":
    main(*sys.argv[1:4])
