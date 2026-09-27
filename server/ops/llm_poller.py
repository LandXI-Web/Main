#!/usr/bin/env python
"""LX/OPS LLM 폴러 (F2-C · F1-CONTRACT v1.1-28) — vLLM /metrics 대리 읽기 → ops:llm.

주기(기본 3s · F2-C 3차: 10s 는 96토큰 요청(1.9 s)을 8.6 s 뒤 '9.6 tok/s' 한 번으로 뭉갰다)마다
  vLLM   :8000 gemma-4-12b-it · :8001 hyperclovax-seed-1.5b   GET /metrics (Prometheus 텍스트)
         처리량 tps = vllm:generation_tokens_total 의 최근 10 s 창 차분 ÷ 창 길이(“처리량 n tok/s(10 s 평균)” — 유휴 포함 평균)
         생성 속도 gen_tps = vllm:time_per_output_token_seconds(없으면 inter_token_latency_seconds) 히스토그램
                  Δcount ÷ Δsum (창 안에 끝난 토큰 간격들의 평균 역수 = 요청 한 줄기의 디코드 속도) · 창 안에 요청이 없으면 마지막 값과 그 시각
         vllm:prompt_tokens_total 차분 → prompt_tps
         vllm:num_requests_running · vllm:num_requests_waiting · vllm:kv_cache_usage_perc
  GPU    docker inspect {컨테이너} → DeviceRequests.DeviceIDs (10분 캐시 · 읽기만 — 컨테이너 제어 0)
  Ollama :11434 GET /api/ps → 적재 모델 · size_vram(Ollama 가 스스로 보고하는 VRAM)
  에이전트 Redis HGETALL agent:models (F2-E 헬스 · 있으면)
Redis 가 있으면 SET ops:llm {json} EX 120 — gpu_poller 가 GpuSample.gpus[i].external[] 에 llm 띠로 싣는다.
--stdout 이면 한 줄 JSON(:8702 브리지가 읽는다).

원칙: 읽기만 한다. vLLM·Ollama 에 요청(추론)을 보내지 않는다 — GPU1 에 부하 0(전력 규칙).
VRAM: vLLM 은 WSL2 컨테이너라 Windows 프로세스로 보이지 않는다 → 프로세스별 VRAM 결손(note 'WSL 프로세스 VRAM 미노출').

실행
  python server/ops/llm_poller.py --stdout --once --redis=
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpu_poller  # noqa: E402
from gpu_poller import KST, Store  # noqa: E402

gpu_poller.TAG = "llm_poller"
log = gpu_poller.log

BACKENDS = [
    {"backend": "vllm", "role": "두뇌(도구 호출)", "port": 8000, "url": os.environ.get("LX_VLLM_URL", "http://127.0.0.1:8000")},
    {"backend": "vllm", "role": "라우터(의도 분류)", "port": 8001, "url": os.environ.get("LX_VLLM_ROUTER_URL", "http://127.0.0.1:8001")},
]
OLLAMA = os.environ.get("LX_OLLAMA_URL", "http://127.0.0.1:11434")
LINE = re.compile(r'^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+([-+0-9.eE]+|NaN|\+Inf|-Inf)\s*$')
LABEL = re.compile(r'(\w+)="((?:[^"\\]|\\.)*)"')


def now_iso() -> str:
    return dt.datetime.now(KST).isoformat(timespec="milliseconds")


def env(value, unit, source, as_of, note=None, basis="measured"):
    e = {"value": value, "unit": unit, "basis": basis, "as_of": as_of, "source": source}
    if note:
        e["note"] = note
    return e


def get(url: str, timeout: float = 2.0) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None


def parse_metrics(txt: str) -> dict:
    """→ {metric: [(labels, value)]}"""
    out: dict[str, list] = {}
    for line in txt.splitlines():
        if not line or line.startswith("#"):
            continue
        m = LINE.match(line)
        if not m:
            continue
        labels = dict(LABEL.findall(m.group(2) or ""))
        try:
            v = float(m.group(3))
        except ValueError:
            continue
        out.setdefault(m.group(1), []).append((labels, v))
    return out


def one(ms: dict, name: str) -> tuple[float | None, str | None]:
    rows = ms.get(name) or []
    if not rows:
        return None, None
    return sum(v for _, v in rows), rows[0][0].get("model_name")


_gpu_cache: dict = {"at": 0.0, "map": {}}


def container_gpus() -> dict[int, dict]:
    """host 포트 → {container, gpu} (docker inspect · 읽기만 · 10분 캐시)."""
    if time.time() - _gpu_cache["at"] < 600 and _gpu_cache["map"]:
        return _gpu_cache["map"]
    out: dict[int, dict] = {}
    try:
        nw = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        names = subprocess.run(["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, timeout=8, creationflags=nw).stdout.split()
        for n in names:
            if "vllm" not in n:
                continue
            j = subprocess.run(["docker", "inspect", n, "--format", "{{json .HostConfig.DeviceRequests}}|{{json .HostConfig.PortBindings}}"],
                               capture_output=True, text=True, timeout=8, creationflags=nw).stdout.strip()
            dev_s, _, port_s = j.partition("|")
            dev = json.loads(dev_s or "null") or []
            ids = [int(x) for d in dev for x in (d.get("DeviceIDs") or []) if str(x).isdigit()]
            ports = json.loads(port_s or "null") or {}
            for binds in ports.values():
                for b in binds or []:
                    if str(b.get("HostPort", "")).isdigit():
                        out[int(b["HostPort"])] = {"container": n, "gpu": ids[0] if len(ids) == 1 else None, "gpus": ids}
    except Exception as e:  # noqa: BLE001
        log(f"docker inspect 실패 {e.__class__.__name__} — GPU 배치 결손")
    _gpu_cache.update(at=time.time(), map=out)
    return out


TPS_WINDOW_S = 10.0   # 처리량 창(표기 '10 s 평균')


class Poller:
    def __init__(self):
        self.prev: dict[int, tuple[float, float, float]] = {}   # port → (t, gen_total, prompt_total)
        self.ring: dict[int, list] = {}                          # port → [(t, gen_total, prompt_total, itl_count, itl_sum)] 최근 창
        self.last_gen: dict[int, dict] = {}                      # port → 마지막 생성 속도 {v, at}
        self.hist: dict[int, list] = {}                          # port → [{t, v}] tps 60 개(스파크라인)

    def backend(self, b: dict, at: str, gmap: dict) -> dict:
        txt = get(b["url"] + "/metrics")
        base = {"backend": b["backend"], "role": b["role"], "port": b["port"], **(gmap.get(b["port"]) or {"container": None, "gpu": None})}
        src = f"vLLM :{b['port']}/metrics"
        if txt is None:
            return {**base, "up": False, "model": None, "tps": env(None, "tokens", src, at, "응답 없음"), "reqs_active": None}
        ms = parse_metrics(txt)
        gen, model = one(ms, "vllm:generation_tokens_total")
        pr, _ = one(ms, "vllm:prompt_tokens_total")
        run, _ = one(ms, "vllm:num_requests_running")
        wait, _ = one(ms, "vllm:num_requests_waiting")
        kv, _ = one(ms, "vllm:kv_cache_usage_perc")
        if kv is None:
            kv, _ = one(ms, "vllm:gpu_cache_usage_perc")
        itl_n, _ = one(ms, "vllm:time_per_output_token_seconds_count"); itl_s, _ = one(ms, "vllm:time_per_output_token_seconds_sum")
        itl_src = "vllm:time_per_output_token_seconds"
        if itl_n is None:
            itl_n, _ = one(ms, "vllm:inter_token_latency_seconds_count"); itl_s, _ = one(ms, "vllm:inter_token_latency_seconds_sum")
            itl_src = "vllm:inter_token_latency_seconds"
        t = time.time()
        tps = ptps = None
        rg = self.ring.setdefault(b["port"], [])
        if gen is not None:
            rg.append((t, gen, pr or 0, itl_n, itl_s))
        while len(rg) > 2 and t - rg[1][0] >= TPS_WINDOW_S:   # 창 시작 = 10 s 이상 전의 가장 늦은 표본
            rg.pop(0)
        p = rg[0] if len(rg) > 1 else None
        if p and t - p[0] > 0.5:
            dt_s = t - p[0]
            tps = max(0.0, (gen - p[1]) / dt_s)
            ptps = max(0.0, ((pr or 0) - p[2]) / dt_s) if pr is not None else None
        win_note = f"Δ generation_tokens_total ÷ {t - p[0]:.1f}s 창 · 유휴 포함 평균" if p else "첫 표본 — 다음 주기부터 차분"
        # 생성 속도 — 최근 주기(직전 표본 ↔ 지금)에 끝난 토큰 간격들: Δcount ÷ Δsum
        q = rg[-2] if len(rg) > 1 else None
        gen_tps = None
        if q and itl_n is not None and q[3] is not None and itl_n - q[3] > 0 and (itl_s - q[4]) > 0:
            gen_tps = (itl_n - q[3]) / (itl_s - q[4])
            self.last_gen[b["port"]] = {"v": round(gen_tps, 1), "at": at, "n": int(itl_n - q[3])}
        lg = self.last_gen.get(b["port"])
        if lg is None and itl_n and itl_s:   # 폴러 기동 뒤 요청이 아직 없으면 — vLLM 기동 뒤 누적 평균(정직 표기)
            lg = {"v": round(itl_n / itl_s, 1), "at": at, "n": int(itl_n), "cum": True}
        if gen is not None:
            self.prev[b["port"]] = (t, gen, pr or 0)
        h = self.hist.setdefault(b["port"], [])
        if tps is not None:
            h.append({"t": round(t * 1000), "v": round(tps, 2)})
            del h[:-60]
        return {**base, "up": True, "model": model,
                "tps": env(None if tps is None else round(tps, 2), "tokens", src + " vllm:generation_tokens_total 10 s 창 차분", at, win_note + " · 처리량 토큰/초"),
                "tps_window_s": env(None if not p else round(t - p[0], 1), "s", src, at, "처리량 창 길이"),
                "gen_tps": env(None if not lg else lg["v"], "tokens", src + " " + itl_src + " 히스토그램 Δcount ÷ Δsum", lg["at"] if lg else at,
                               (("vLLM 기동 뒤 누적 평균 · " if lg.get("cum") else "이번 주기 " if gen_tps is not None else "마지막 요청 · ") + f"토큰 간격 {lg['n']:,}개 · 요청 한 줄기 생성 속도(토큰/초)") if lg else "기동 뒤 요청 없음"),
                "gen_basis": None if not lg else ("cum" if lg.get("cum") else "live" if gen_tps is not None else "last"),
                "gen_live": gen_tps is not None,
                "prompt_tps": env(None if ptps is None else round(ptps, 2), "tokens", src + " vllm:prompt_tokens_total 차분", at, "입력 토큰/초"),
                "reqs_active": None if run is None else int(run), "reqs_waiting": None if wait is None else int(wait),
                "kv_cache_pct": env(None if kv is None else round(kv * 100, 1), "%", src + " vllm:kv_cache_usage_perc", at, "KV 캐시 사용률(사전 할당 안)"),
                "gen_tokens_total": None if gen is None else int(gen), "prompt_tokens_total": None if pr is None else int(pr),
                "tps_hist": list(h), "note": "WSL 프로세스 VRAM 미노출"}

    def ollama(self, at: str) -> dict:
        txt = get(OLLAMA + "/api/ps")
        if txt is None:
            return {"up": False, "models": [], "note": "Ollama :11434 응답 없음"}
        try:
            j = json.loads(txt)
        except ValueError:
            return {"up": False, "models": []}
        ms = [{"name": m.get("name"), "size_vram_mib": env(round((m.get("size_vram") or 0) / 2 ** 20), "MiB", "Ollama /api/ps size_vram", at, "Ollama 자기 보고(두 장 분할 합)"),
               "expires_at": m.get("expires_at")} for m in j.get("models", [])]
        return {"up": True, "models": ms, "note": "종료 금지(사용자 결정) · 읽기만"}

    def sample(self, store: Store) -> dict:
        at = now_iso()
        gmap = container_gpus()
        backends = [self.backend(b, at, gmap) for b in BACKENDS]
        agent = None
        if store.ok():
            h = store.do("HGETALL", "agent:models")
            if h:
                agent = dict(zip(h[::2], h[1::2]))
                for k, v in list(agent.items()):
                    try:
                        agent[k] = json.loads(v)
                    except (ValueError, TypeError):
                        pass
        return {"at": at, "backends": backends, "ollama": self.ollama(at), "agent_models": agent,
                "source": "server/ops/llm_poller.py · vLLM /metrics · Ollama /api/ps · docker inspect(읽기만)"}


def main():
    ap = argparse.ArgumentParser(description="LX/OPS LLM 폴러 (F2-C)")
    ap.add_argument("--interval", type=float, default=3.0)
    ap.add_argument("--redis", default=os.environ.get("LX_REDIS_URL", "redis://localhost:6380"))
    ap.add_argument("--stdout", action="store_true")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    for s_ in (sys.stdout, sys.stderr):
        try:
            s_.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    store = Store(a.redis or None)
    p = Poller()
    log(f"시작 interval={a.interval}s · vLLM {', '.join(str(b['port']) for b in BACKENDS)} · Ollama {OLLAMA}")
    if a.once:                      # 차분에는 두 표본이 필요하다
        p.sample(store)
        time.sleep(min(3.0, a.interval))
    while True:
        t0 = time.time()
        s = p.sample(store)
        if a.stdout:
            sys.stdout.write(json.dumps(s, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        if store.ok():
            store.do("SET", "ops:llm", json.dumps(s, ensure_ascii=False), "EX", "120")
        if a.once:
            break
        time.sleep(max(0.1, a.interval - (time.time() - t0)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
