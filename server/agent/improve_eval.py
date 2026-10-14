"""XI ChatGEO 개선 바퀴 — '잰다' 단계(원칙 249 · impl-32 chatgeo-loop).

평가 질문 묶음을 실제 게이트웨이에 차례로 물어(시험 질문 표시 context.test — 개선 고리가 모으지 않음) 답함 · 안내함 · 못 함을 센다.
판정은 서버가 개선 후보를 모으는 규칙과 같은 것(landxi_api.improve.judge — 끝 사건 + 막힘 분류):
  답함   = 막힘 분류가 없음(도구 답 · 지도 동작 · 확인 카드까지 감)
  안내함 = 할 수 없는 일이 맞고(권한 밖 · 화면 밖 등) 다음 할 일(버튼 · 안내 한 줄)이 붙음
  못 함  = 막힘 분류가 있고 다음 할 일도 없음 · 서버 실패 · 시간 초과
확인 카드(분석 실행 등)는 '답함'으로 보고 곧바로 거절한다(작업을 돌리지 않는다).

질문 묶음 = 개선 후보 전부(GET /improve/items · 가린 요지 ○○ 는 그 역할이 볼 수 있는 예시 지역으로 채움) + 되던 질문(BASELINE).
    python -m agent.improve_eval OUT.json [--only ID,ID] [--rounds 1]        (cwd = server/)
전력: 차례로 하나씩(동시 0) · 언어 모델이 없는 카드(GPU0)가 30% 넘게 바쁘면 기다린다(두 장 동시 고부하 금지).
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
from landxi_api import improve as I  # noqa: E402

B = f"http://127.0.0.1:{config.API_PORT}/api/v1"
PAGE_OF = {v: k for k, v in I.HOME_KO.items()}       # 화면 이름 → 화면 키
PAGE_OF.update({"첫 화면": "lx-console", "XI맵": "xi-clean", "LX 관리자 대시보드": "ops"})
# 가린 지명(○○) 자리 — 그 역할이 볼 수 있는 예시 지역(원칙: 남원은 예시일 뿐 · 지역마다 같은 구조)
FILL = {"lx": ["남원시", "구례군"], "namwon": ["남원시", "남원시"]}
REGION = {"lx": ("52190", "전북특별자치도 남원시"), "namwon": ("52190", "전북특별자치도 남원시")}
# 되던 질문(나빠지면 안 되는 질문) — 실제 화면에서 늘 쓰는 말 · 역할 · 화면
BASELINE = [
    ("b01", "남원시 의심 필지 몇 건이야?", "staff", "lx-console"),
    ("b02", "운봉읍 무허가 건축 의심 필지 보여줘", "staff", "lx-console"),
    ("b03", "읍면동별 의심 건수 순위 보여줘", "staff", "lx-console"),
    ("b04", "남원시로 이동해 줘", "staff", "xi-clean"),
    ("b05", "지도 확대해 줘", "staff", "xi-clean"),
    ("b06", "비닐하우스만 보여 줘", "staff", "xi-clean"),
    ("b07", "원래대로 다 보여 줘", "staff", "xi-clean"),
    ("b08", "건축법 제11조 내용 알려줘", "staff", "lx-console"),
    ("b09", "농지 전용 허가 근거 조문 알려줘", "staff", "lx-console"),
    ("b10", "우리 지역 결과 요약해 줘", "tenant", "gov-report"),
    ("b11", "구례군 결과 보여 줘", "tenant", "gov-report"),
    ("b12", "안녕하세요", "staff", "lx-console"),
    ("b13", "작업 대기열 상태 알려줘", "admin", "ops"),
    ("b14", "Zoom in", "staff", "xi-clean"),
]


def _retry(fn, *a, **kw):
    """게이트웨이가 잠깐 다시 뜨는 동안(다른 작업의 재시작) 끊긴 요청은 다시 보낸다 — 최대 2분."""
    t0 = time.time()
    while True:
        try:
            return fn(*a, **kw)
        except (httpx.TransportError, httpx.TimeoutException):
            if time.time() - t0 > 120:
                raise
            time.sleep(5)


def login() -> dict:
    pw = config.DEV_PASSWORD
    out = {}
    for k, body in {"staff": {"realm": "lx", "login": "test@lx.or.kr"}, "admin": {"realm": "lx", "login": "lxadmin@lx.or.kr"},
                    "sales": {"realm": "lx", "login": "sales@lx.or.kr"},
                    "tenant": {"realm": "tenant", "tenant_id": "namwon", "login": "lxadmin@lx.or.kr", "site": "gov"}}.items():
        r = _retry(httpx.post, B + "/auth/login", json={**body, "password": pw}, timeout=30)
        r.raise_for_status()
        out[k] = r.json()["token"]
    return out


def H(t: str) -> dict:
    return {"authorization": f"Bearer {t}"}


JOSA_PAIR = [("으로", "로"), ("과", "와"), ("을", "를"), ("은", "는"), ("이", "가")]


def fill(q: str, who: str) -> str:
    """○○ 자리를 예시 지역으로 — 뒤 조사는 그 이름 받침에 맞춘다(남원시으로 → 남원시로)."""
    names = list(FILL["namwon" if who == "tenant" else "lx"])
    while I.MASK in q:
        nm = names.pop(0) if names else FILL["lx"][0]
        i = q.index(I.MASK)
        rest = q[i + len(I.MASK):]
        for a, b in JOSA_PAIR:
            if rest.startswith(a) or rest.startswith(b):
                j = a if I._jong(nm) and not (a == "으로" and I._jong(nm) == 8) else b
                rest = j + rest[len(a) if rest.startswith(a) else len(b):]
                break
        q = q[:i] + nm + rest
    return q


def ctx_for(page: str, who: str) -> dict:
    sgg, full = REGION["namwon" if who == "tenant" else "lx"]
    c = {"page": page, "test": True, "has_map": page in ("lx-console", "xi-clean", "lx-map", "gov-report", "gov-fusion", "global")}
    if page in ("xi-clean", "gov-report", "gov-fusion", "lx-map", "lx-console"):
        c.update(region=sgg, region_name=full)
    if page == "xi-clean":
        c["sets"] = []
    if page == "ops":
        c.update(screen="ops", screen_name="LX 관리자 대시보드 · 현황")
    return c


def questions(tok: dict) -> list[dict]:
    """개선 후보 전부(GET /improve/eval-set?all=1 · LX 관리자) → 질문 · 역할 · 화면. 줄 이름이 사용자 질문이 아니면(점검 요약) 같은 뜻 질문만 쓴다."""
    j = _retry(httpx.get, B + "/improve/eval-set", headers=H(tok["admin"]), params={"all": "1"}, timeout=120).json()
    out = []
    for it in sorted(j["items"], key=lambda x: x["seq"]):
        role = it.get("role") if it.get("role") in ("staff", "admin", "sales", "tenant") else "staff"
        page = PAGE_OF.get(it.get("screen") or "", None) or {"tenant": "gov-report", "admin": "ops", "sales": "sales"}.get(role, "lx-console")
        qs = ([it["question"]] if it.get("asked") or not it.get("same") else []) + list(it.get("same") or [])
        if not qs:
            qs = [it["question"]]
        for k, q in enumerate(qs[:3]):
            out.append({"id": f"{it['id']}#{k}", "item": it["id"], "no": it["seq"], "q": fill(q, role), "masked": q, "role": role, "page": page,
                        "kind": it["kind"], "state": it.get("state")})
    for bid, q, role, page in BASELINE:
        out.append({"id": bid, "item": None, "no": None, "q": q, "masked": q, "role": role, "page": page, "kind": "되던 질문"})
    return out


def gpu_busy() -> bool:
    try:
        o = subprocess.run(["nvidia-smi", "--query-gpu=index,utilization.gpu", "--format=csv,noheader,nounits"], capture_output=True, text=True,
                           timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        for line in o.strip().splitlines():
            i, u = [x.strip() for x in line.split(",")]
            if i == "0" and int(u) >= 30:
                return True
    except Exception:  # noqa: BLE001
        return False
    return False


def ask(tok: str, q: str, context: dict, wait_s: int = 150) -> dict:
    r = _retry(httpx.post, B + "/agent/runs", headers=H(tok), json={"message": q, "mode": "map", "context": context}, timeout=60)
    if r.status_code >= 400:
        return {"event": "agent.failed", "data": {"message": r.json().get("message") if r.headers.get("content-type", "").startswith("application/json") else r.text[:120]},
                "confirm": False, "ms": 0}
    rid = r.json()["run"]["id"]
    t0, after, confirm, tool = time.time(), None, False, []
    while time.time() - t0 < wait_s:
        j = _retry(httpx.get, B + f"/agent/runs/{rid}/events", headers=H(tok), params={"after": after} if after else None, timeout=30).json()
        for x in j["items"]:
            after = x["id"]
            ev, d = x["event"], x["data"]
            if ev == "agent.tool.call":
                tool.append(d.get("tool") or d.get("name"))
            if ev == "agent.confirm" and not confirm:
                confirm = True
                httpx.post(B + f"/agent/runs/{rid}/confirm", headers=H(tok), json={"confirm_id": d.get("confirm_id"), "decision": "reject"}, timeout=30)
            if ev in I.TERMINAL:
                return {"event": ev, "data": d, "confirm": confirm, "tools": [t for t in tool if t], "ms": int((time.time() - t0) * 1000)}
        time.sleep(0.7)
    return {"event": "agent.failed", "data": {"message": "시간 초과"}, "confirm": confirm, "tools": [t for t in tool if t], "ms": int((time.time() - t0) * 1000)}


def run(out_path: str, only: set | None = None) -> dict:
    tok = login()
    qs = [q for q in questions(tok) if not only or q["id"].split("#")[0] in only or q["id"] in only]
    rows = []
    for k, q in enumerate(qs):
        t_wait = time.time()
        while gpu_busy() and time.time() - t_wait < 600:
            time.sleep(10)
        res = ask(tok[q["role"]], q["q"], ctx_for(q["page"], q["role"]))
        verdict, kind = I.judge(res["event"], res["data"], confirm=res["confirm"])
        ans = str(res["data"].get("answer_md") or res["data"].get("message") or "")
        ans = re.sub(r"\{\{[^}]*\}\}", "n", ans)
        rows.append({**q, "verdict": verdict, "block": I.KINDS.get(kind) if kind else None, "tools": res.get("tools") or [], "ms": res["ms"],
                     "answer": re.sub(r"\s+", " ", ans)[:160], "hint": (res["data"].get("hint") or {}).get("text")})
        print(f"[{k + 1}/{len(qs)}] {verdict:4} {q['id']:22} {q['q'][:40]}", flush=True)
    summ = {v: sum(1 for r in rows if r["verdict"] == v) for v in ("답함", "안내함", "못 함")}
    res = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "total": len(rows), "summary": summ, "rows": rows}
    Path(out_path).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summ, ensure_ascii=False))
    return res


if __name__ == "__main__":
    a = sys.argv[1:]
    only = None
    if "--only" in a:
        only = set(a[a.index("--only") + 1].split(","))
    run(a[0], only)
