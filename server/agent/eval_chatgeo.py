"""XI ChatGEO 회귀 틀 — 400문 시험 묶음을 서버에 차례로 묻고 묶음별로 판정한다(CHATGEO-DEV-ORDER §3 · 원칙 305 · WP-0).

    python -m agent.eval_chatgeo OUT.json [--only C07,C10] [--n 1,2] [--persona namwon] [--sev top,high] [--base BASE.json]   (cwd = server/)
    python -m agent.eval_chatgeo --recheck OUT.json [--base BASE.json]     (다시 묻지 않고 저장된 답만 다시 판정)

· 질문 = agent/tests/eval/chatgeo-400.jsonl(build_400.py) · 판정 = agent/tests/eval/check.py(LLM 0)
· 보내는 법 = 로그인 토큰으로 POST /agent/runs(context = 그 계정이 XI맵을 처음 열었을 때 화면이 보내는 것 · test 표시 → run_test… · 개선 대기열에 안 모임)
  화면처럼 같은 계정의 바로 앞 답 번호를 prev_run 으로 붙인다(이어 묻기 사슬도 같은 길).
· 전력: 차례로 하나씩(동시 0) · 20문마다 nvidia-smi 를 6번 보고 장당 평균 70% · 140 W 를 넘으면 쉬었다 간다(상한 200 W · 한 장 추론).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402

HERE = Path(__file__).resolve().parent
EVAL = HERE / "tests" / "eval"
sys.path.insert(0, str(EVAL))
import check  # noqa: E402

B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
LOGIN = {"staff": {"realm": "lx", "login": "test@lx.or.kr"},
         "namwon": {"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "site": "gov"}}


def _retry(fn, *a, **kw):
    t0 = time.time()
    while True:
        try:
            return fn(*a, **kw)
        except (httpx.TransportError, httpx.TimeoutException):
            if time.time() - t0 > 180:
                raise
            time.sleep(5)


def login() -> dict:
    out = {}
    for k, body in LOGIN.items():
        r = _retry(httpx.post, B + "/auth/login", json={**body, "password": config.DEV_PASSWORD}, timeout=30)
        r.raise_for_status()
        out[k] = r.json()["token"]
    return out


def gpu_sample(n: int = 6, gap: float = 5.0) -> list[dict]:
    cards: dict = {}
    for i in range(n):
        try:
            o = subprocess.run(["nvidia-smi", "--query-gpu=index,utilization.gpu,power.draw", "--format=csv,noheader,nounits"], capture_output=True,
                               text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        except Exception:  # noqa: BLE001
            return []
        for line in o.strip().splitlines():
            g, u, w = [x.strip() for x in line.split(",")]
            c = cards.setdefault(int(g), {"u": [], "w": []})
            c["u"].append(float(u))
            c["w"].append(float(w))
        if i < n - 1:
            time.sleep(gap)
    return [{"gpu": g, "util_avg": round(sum(c["u"]) / len(c["u"])), "watt_avg": round(sum(c["w"]) / len(c["w"])), "watt_max": max(c["w"])}
            for g, c in sorted(cards.items())]


def gpu_ok(s: list[dict]) -> bool:
    return all(c["util_avg"] <= 70 and c["watt_avg"] <= 140 and c["watt_max"] <= 200 for c in s)


def ask(tok: str, q: str, context: dict, wait_s: int = 150) -> dict:
    t0 = time.time()
    r = _retry(httpx.post, B + "/agent/runs", headers={"authorization": f"Bearer {tok}"},
               json={"message": q, "mode": "map", "context": context}, timeout=60)
    if r.status_code >= 400:
        return {"event": "http_error", "data": {"message": r.text[:200]}, "ms": int((time.time() - t0) * 1000), "tools": []}
    rid = r.json()["run"]["id"]
    after, tools = None, []
    while time.time() - t0 < wait_s:
        j = _retry(httpx.get, B + f"/agent/runs/{rid}/events", headers={"authorization": f"Bearer {tok}"},
                   params={"after": after} if after else None, timeout=30).json()
        for x in j.get("items") or []:
            after = x["id"]
            ev, d = x["event"], x.get("data") or {}
            if ev == "agent.tool.call" and (d.get("tool") or d.get("name")):
                tools.append(d.get("tool") or d.get("name"))
            if ev == "agent.confirm":
                httpx.post(B + f"/agent/runs/{rid}/confirm", headers={"authorization": f"Bearer {tok}"},
                           json={"confirm_id": d.get("confirm_id"), "decision": "reject"}, timeout=30)
            if ev in ("agent.done", "agent.rejected", "agent.failed"):
                return {"run_id": rid, "event": ev, "data": d, "tools": tools, "ms": int((time.time() - t0) * 1000)}
        time.sleep(0.5)
    return {"run_id": rid, "event": "timeout", "data": {}, "tools": tools, "ms": int((time.time() - t0) * 1000)}


def slim(res: dict) -> dict:
    """저장할 것만 — 답 · 쓴 봉투 · 단추 · 블록 · 지도 동작 · 범위 · 끝 사건."""
    d = res.get("data") or {}
    used = set(d.get("used") or []) | set(re.findall(r"\{\{env:(e\d+)\}\}", str(d.get("answer_md") or "")))
    envs = {k: {"value": (v or {}).get("value"), "unit": (v or {}).get("unit"), "meaning": (d.get("env_meta") or {}).get(k),
                "scope": (v or {}).get("scope")} for k, v in (d.get("envelopes") or {}).items() if k in used}
    return {"run_id": res.get("run_id"), "event": res.get("event"), "ms": res.get("ms"), "tools": res.get("tools") or [],
            "answer_md": d.get("answer_md") if res.get("event") == "agent.done" else (d.get("message") or ""),
            "category": d.get("category"), "error": d.get("error"), "envs": envs,
            "next": [{"label": b.get("label"), "href": b.get("href"), "q": b.get("q")} for b in (d.get("next") or [])],
            "blocks": [{"type": b.get("type"), "label": b.get("label") or b.get("title"), "href": b.get("href")} for b in (d.get("blocks") or [])],
            "ui_ops": d.get("ui_ops") or [], "scope": d.get("scope"), "scope_flags": d.get("scope_flags"), "unapplied": d.get("unapplied"),
            "unverified_n": len(d.get("unverified") or [])}


def load(only=None, ns=None, persona=None, sev=None) -> list[dict]:
    rows = [json.loads(x) for x in (EVAL / "chatgeo-400.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    keep = [r for r in rows if (not only or r["cluster"] in only) and (not ns or r["n"] in ns) and (not persona or r["persona"] == persona)
            and (not sev or r["sev"] in sev)]
    want = {r["n"] for r in keep}
    by = {r["n"]: r for r in rows}
    for r in list(keep):                 # 이어 묻기 사슬은 앞 질문도 함께
        f = r.get("follow")
        while f and f not in want:
            want.add(f)
            f = by[f].get("follow")
    return [r for r in rows if r["n"] in want]


def run(out_path: str, rows: list[dict], base: str | None = None) -> dict:
    tok = login()
    last = {}
    by_n = {}
    results = []
    gpu = []
    for k, row in enumerate(rows):
        if k % 20 == 0:
            s = gpu_sample()
            gpu.append({"at_q": k, "cards": s})
            while s and not gpu_ok(s):
                print("GPU 높음 — 60초 쉼", s, flush=True)
                time.sleep(60)
                s = gpu_sample()
                gpu.append({"at_q": k, "cards": s, "retry": True})
        ctx = dict(row["context"])
        ctx["test"] = True
        prev = by_n.get(row["follow"]) if row.get("follow") else last.get(row["persona"])
        if prev:
            ctx["prev_run"] = prev
        try:
            res = ask(tok[row["persona"]], row["q"], ctx)
        except Exception as e:  # noqa: BLE001
            res = {"event": "script_error", "data": {"message": str(e)[:200]}, "ms": 0}
        s = slim(res)
        if s.get("run_id"):
            last[row["persona"]] = s["run_id"]
            by_n[row["n"]] = s["run_id"]
        rec = {"n": row["n"], "persona": row["persona"], "cluster": row["cluster"], "sev": row["sev"], "q": row["q"], **s}
        results.append(rec)
        v = check.judge(row, rec)
        print(f"[{k + 1}/{len(rows)}] {'PASS' if v['ok'] else 'FAIL'} {row['cluster']} n={row['n']} {rec['ms']}ms {row['q'][:30]} :: {';'.join(v['why'])[:80]}",
              flush=True)
    gpu.append({"at_q": len(rows), "cards": gpu_sample()})
    doc = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "total": len(results), "gpu": gpu, "results": results}
    Path(out_path).write_text(json.dumps(doc, ensure_ascii=False, indent=0), encoding="utf-8")
    return report(out_path, base)


def report(out_path: str, base: str | None = None) -> dict:
    doc = json.loads(Path(out_path).read_text(encoding="utf-8"))
    rows = {r["n"]: r for r in (json.loads(x) for x in (EVAL / "chatgeo-400.jsonl").read_text(encoding="utf-8").splitlines() if x.strip())}
    summ = check.summarize(rows, doc["results"])
    bsum = None
    if base and Path(base).exists():
        bdoc = json.loads(Path(base).read_text(encoding="utf-8"))
        bsum = check.summarize(rows, bdoc["results"])
    md = check.markdown(summ, bsum, doc)
    Path(out_path).with_suffix(".md").write_text(md, encoding="utf-8")
    doc["summary"] = summ
    Path(out_path).write_text(json.dumps(doc, ensure_ascii=False, indent=0), encoding="utf-8")
    print(md[:4000])
    return summ


if __name__ == "__main__":
    a = sys.argv[1:]

    def opt(name):
        return a[a.index(name) + 1] if name in a else None
    if "--recheck" in a:
        report(opt("--recheck"), opt("--base"))
        sys.exit(0)
    only = set(opt("--only").split(",")) if opt("--only") else None
    ns = {int(x) for x in opt("--n").split(",")} if opt("--n") else None
    sev = set(opt("--sev").split(",")) if opt("--sev") else None
    run(a[0], load(only, ns, opt("--persona"), sev), opt("--base"))
