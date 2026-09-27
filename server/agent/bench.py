"""D0 실측 — 도구 호출 성공률(20문 × 3회) · 첫 토큰 ms · 토큰/초 · 한국어 도구 인자 정확도 · 라우터 ms · 폴백 전환 · GPU 전력 로그.

    python -m agent.bench ../shots/f2/E/d0-bench.json        (cwd = server/)

전력 규칙: 순차 요청만(동시 0) · 시작 전 GPU0 이용률 ≥ 30% 면 중단(두 장 동시 고부하 금지) · nvidia-smi 1s 표본을 같이 남긴다.
컨테이너는 건드리지 않는다(폴백 전환은 이 프로세스 안에서 vLLM URL 을 닫힌 포트로 바꿔 잰다 — 네트워크 차단과 같은 효과 · 종료 0).
"""
from __future__ import annotations

import asyncio
import json
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import backends, config  # noqa: E402
from agent.runner import SYSTEM  # noqa: E402
from agent.tools import registry  # noqa: E402
from landxi_api.deps import CAPS, Principal  # noqa: E402

FRAME = {"type": "Polygon", "coordinates": [[[127.352, 35.527], [127.355, 35.527], [127.355, 35.529], [127.352, 35.529], [127.352, 35.527]]]}
Q = [  # (문장, 기대 도구, 기대 인자 부분집합, 프레임 여부)
    ("아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘", "survey_findings", {"rule": "R1", "emd": "아영면", "jimok": "답"}, False),
    ("운봉읍 무허가 건축 의심 필지 보여줘", "survey_findings", {"rule": "R1", "emd": "운봉읍"}, False),
    ("남원 전체 의심 몇 건이야?", "survey_stats", {}, False),
    ("휴경 의심 필지 상위 10개", "survey_findings", {"rule": "R2", "top": 10}, False),
    ("임야를 개간한 의심 필지 보여줘", "survey_findings", {"rule": "R5"}, False),
    ("도로 위에 건물이 있는 의심 필지 보여줘", "survey_findings", {"rule": "R6"}, False),
    ("산내면 의심 건수 알려줘", "survey_stats", {"emd": "산내면"}, False),
    ("A등급 의심 필지 목록 줘", "survey_findings", {"priority": "A"}, False),
    ("필지 5219045021110530012 대장이랑 현황 비교해줘", "survey_parcel", {"pnu": "5219045021110530012"}, False),
    ("이 프레임 비닐하우스 분석해줘", "jobs_quote", {"service": "greenhouse"}, True),
    ("규칙별 의심 건수 알려줘", "survey_stats", {"by": "rule"}, False),
    ("읍면동별 의심 건수 순위 보여줘", "survey_stats", {"by": "emd"}, False),
    ("농지를 주차장으로 쓰는 의심 필지 보여줘", "survey_findings", {"rule": "R4"}, False),
    ("대지 위에 비닐하우스가 있는 필지 보여줘", "survey_findings", {"rule": "R3"}, False),
    ("경도 127.5805 위도 35.4757 필지 알려줘", "parcel_at", {}, False),
    ("아영면 R1 A등급 5개만 보여줘", "survey_findings", {"rule": "R1", "emd": "아영면", "priority": "A"}, False),
    ("금지면 휴경 의심 필지 보여줘", "survey_findings", {"rule": "R2", "emd": "금지면"}, False),
    ("인월면 무허가 건축 의심 몇 건이야?", None, {"emd": "인월면"}, False),     # survey_stats 또는 survey_findings 둘 다 정답
    ("운봉읍 논 위 건물 의심 상위 3개", "survey_findings", {"rule": "R1", "emd": "운봉읍", "top": 3}, False),
    ("남원 농지 중 건물이 탐지된 필지 보여줘", "survey_findings", {"rule": "R1"}, False),
]
ROUTER_Q = [(q, "map") for q, *_ in Q[:12]] + [("아영면 실태조사 보고서 초안 써줘", "report"), ("운봉읍 R1 공문 초안 작성해줘", "report"),
                                            ("GPU1 왜 느려?", "ops"), ("작업 큐 대기열 상태 알려줘", "ops"), ("안녕하세요", "smalltalk"), ("넌 뭘 할 수 있어?", "smalltalk")]


class Power(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.rows, self.stop = [], False

    def run(self):
        while not self.stop:
            try:
                o = subprocess.run(["C:/Windows/System32/nvidia-smi.exe",
                                    "--query-gpu=index,utilization.gpu,power.draw,memory.used", "--format=csv,noheader,nounits"],
                                   capture_output=True, text=True, timeout=5, creationflags=0x08000000)
                t = time.time()
                for line in o.stdout.strip().splitlines():
                    i, u, pw, mem = [x.strip() for x in line.split(",")]
                    self.rows.append({"t": round(t, 2), "gpu": int(i), "util": float(u), "power_w": float(pw), "mem_mib": float(mem)})
            except Exception:
                pass
            time.sleep(1.0)


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))] if xs else None


async def one(q, frame, tools):
    ctx = "[현재 화면] 라우터 의도=map · 화면 모드=survey · " + ("프레임=있음(사람이 그림)" if frame else "프레임=없음")
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": ctx + "\n\n" + q}]
    return await backends.chat_stream(msgs, tools=tools, max_tokens=300, chain=["vllm"])


async def main(out: Path):
    staff = Principal("lx", "staff", None, "u_bench", caps=CAPS[("lx", "staff")])
    tools = registry.tools_for(staff)
    pw = Power()
    pw.start()
    await asyncio.sleep(2.5)
    g0 = [r["util"] for r in pw.rows if r["gpu"] == 0]
    if g0 and max(g0) >= 30:
        pw.stop = True
        raise SystemExit(f"GPU0 고부하({max(g0)}%) — 전력 규칙: 두 장 동시 고부하 금지 · 벤치 중단")
    trials = []
    for rep in range(3):
        for k, (q, tool, exp, frame) in enumerate(Q):
            t0 = time.perf_counter()
            try:
                r = await one(q, frame, tools)
                calls = [(c["name"], json.loads(c["arguments"] or "{}")) for c in r.tool_calls]
                ok_json = True
            except json.JSONDecodeError:
                ok_json, calls = False, []
            except Exception as e:  # noqa: BLE001
                trials.append({"q": k, "rep": rep, "error": str(e)[:120]})
                continue
            names = [n for n, _ in calls]
            hit = (tool in names) if tool else any(n in ("survey_stats", "survey_findings") for n in names)
            args = next((a for n, a in calls if (n == tool if tool else n in ("survey_stats", "survey_findings"))), {})
            arg_ok = all(str(args.get(kk)).strip() == str(v) for kk, v in exp.items()) if hit else False
            trials.append({"q": k, "rep": rep, "tool_ok": hit, "json_ok": ok_json, "arg_ok": arg_ok, "names": names, "args": args,
                           "first_token_ms": r.first_token_ms, "total_ms": r.total_ms, "completion_tokens": r.completion_tokens,
                           "prompt_tokens": int(r.usage.get("prompt_tokens") or 0)})
    # 토큰/초 — 한국어 서술(도구 없이) 3회
    gen = []
    for _ in range(3):
        r = await backends.chat_stream([{"role": "user", "content": "남원시 농지 실태조사의 목적과 절차를 공무원 보고체로 5문장 설명하라."}], max_tokens=256, chain=["vllm"])
        gen.append({"first_token_ms": r.first_token_ms, "total_ms": r.total_ms, "completion_tokens": r.completion_tokens, "tps": r.tps})
    # 라우터
    rt = []
    for q, intent in ROUTER_Q:
        c = await backends.classify(q)
        rt.append({"q": q, "want": intent, "got": c["intent"], "ms": c["ms"], "backend": c["backend"]})
    # 폴백 전환: vLLM 을 닫힌 포트로(이 프로세스 안에서만) → Ollama 첫 토큰까지
    saved = config.BACKENDS["vllm"]["base"]
    config.BACKENDS["vllm"]["base"] = "http://127.0.0.1:8009/v1"
    fb = []
    try:
        for _ in range(3):
            t0 = time.perf_counter()
            tried = []

            async def on_fb(x):
                tried.append(x)
            r = await backends.chat_stream([{"role": "system", "content": SYSTEM}, {"role": "user", "content": Q[0][0]}], tools=tools, max_tokens=200,
                                           on_fallback=on_fb)
            fb.append({"switch_ms": tried[0]["ms"] if tried else None, "backend": r.backend, "model": r.model,
                       "first_token_after_switch_ms": r.first_token_ms, "wall_ms": round((time.perf_counter() - t0) * 1000, 1),
                       "tool_names": [c["name"] for c in r.tool_calls]})
    finally:
        config.BACKENDS["vllm"]["base"] = saved
    pw.stop = True
    await asyncio.sleep(1.2)
    ok = [t for t in trials if "error" not in t]
    res = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%S+09:00"), "model": config.BACKENDS["vllm"]["model"], "base": saved,
        "tool_calls": {"trials": len(trials), "tool_name_success": sum(t["tool_ok"] for t in ok), "arg_accuracy": sum(t["arg_ok"] for t in ok),
                       "json_valid": sum(t["json_ok"] for t in ok), "errors": len(trials) - len(ok),
                       "first_token_ms_p50": pct([t["first_token_ms"] for t in ok if t["first_token_ms"]], 50),
                       "first_token_ms_p95": pct([t["first_token_ms"] for t in ok if t["first_token_ms"]], 95),
                       "total_ms_p50": pct([t["total_ms"] for t in ok], 50), "prompt_tokens_p50": pct([t["prompt_tokens"] for t in ok], 50),
                       "per_question": [{"q": Q[k][0], "hit": sum(t["tool_ok"] for t in ok if t["q"] == k), "arg": sum(t["arg_ok"] for t in ok if t["q"] == k),
                                         "names": [t["names"] for t in ok if t["q"] == k][0] if any(t["q"] == k for t in ok) else []} for k in range(len(Q))]},
        "generation": {"runs": gen, "tps_mean": round(statistics.mean([g["tps"] for g in gen if g["tps"]]), 1),
                       "first_token_ms_mean": round(statistics.mean([g["first_token_ms"] for g in gen]), 1)},
        "router": {"n": len(rt), "accuracy": sum(x["want"] == x["got"] for x in rt), "ms_p50": pct([x["ms"] for x in rt], 50), "ms_p95": pct([x["ms"] for x in rt], 95),
                   "backend": sorted({x["backend"] for x in rt}), "rows": rt},
        "fallback": fb,
        "gpu_power": {g: {"max_power_w": max((r["power_w"] for r in pw.rows if r["gpu"] == g), default=None),
                          "mean_power_w": round(statistics.mean([r["power_w"] for r in pw.rows if r["gpu"] == g]), 1) if any(r["gpu"] == g for r in pw.rows) else None,
                          "max_util": max((r["util"] for r in pw.rows if r["gpu"] == g), default=None), "samples": sum(1 for r in pw.rows if r["gpu"] == g)} for g in (0, 1)},
        "power_rows": pw.rows,
        "trials": trials,
    }
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    s = res["tool_calls"]
    print(f"도구 이름 {s['tool_name_success']}/{s['trials']} · 인자 {s['arg_accuracy']}/{s['trials']} · 첫 토큰 p50 {s['first_token_ms_p50']}ms p95 {s['first_token_ms_p95']}ms · "
          f"tps {res['generation']['tps_mean']} · 라우터 {res['router']['accuracy']}/{res['router']['n']} p50 {res['router']['ms_p50']}ms · "
          f"폴백 {[f['switch_ms'] for f in fb]} → {[f['backend'] for f in fb]} · GPU {json.dumps(res['gpu_power'])}")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1])))
