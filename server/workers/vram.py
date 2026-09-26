"""VRAM 예산(F1-CONTRACT §7 · 사용자 결정 2026-09-24: Ollama llama-server 절대 종료 금지 · 남는 메모리만).

budget = total − used − reserve(2,048 MiB). used 에는 외부(Ollama) 점유가 들어 있다. WDDM 이라 프로세스별 VRAM 은 N/A —
외부 프로세스는 이름·개수만 센다. 워커는 torch.cuda.set_per_process_memory_fraction(budget/total) 로 스스로 묶는다.
"""
from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from landxi_api import config  # noqa: E402


@dataclass
class GpuMem:
    index: int
    name: str
    total_mib: int
    used_mib: int
    util_pct: int
    external_procs: list[str]
    mode: str


def parse_query(csv_text: str) -> list[dict]:
    out = []
    for line in csv_text.strip().splitlines():
        v = [s.strip() for s in line.split(",")]
        if len(v) < 5:
            continue
        out.append({"index": int(v[0]), "name": v[1], "used": int(float(v[2])), "total": int(float(v[3])), "util": int(float(v[4])),
                    "mode": v[5] if len(v) > 5 else "?"})
    return out


def parse_procs(table: str) -> dict[int, list[str]]:
    """nvidia-smi 표의 Processes 절 → {gpu: [프로세스 이름]} (WDDM 은 메모리 N/A)."""
    procs: dict[int, list[str]] = {}
    inproc = False
    for line in table.splitlines():
        if "Processes:" in line:
            inproc = True
            continue
        if not inproc:
            continue
        m = re.match(r"\|\s+(\d+)\s+\S+\s+\S+\s+(\d+)\s+(\S+)\s+(.+?)\s+(\S+)\s*\|", line)
        if m:
            name = m.group(4).strip().split("\\")[-1].split("/")[-1]
            procs.setdefault(int(m.group(1)), []).append(name)
    return procs


def query(index: int | None = None) -> list[GpuMem]:
    q = subprocess.run([config.NVIDIA_SMI, "--query-gpu=index,name,memory.used,memory.total,utilization.gpu,driver_model.current",
                        "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    t = subprocess.run([config.NVIDIA_SMI], capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    procs = parse_procs(t)
    out = []
    rows = parse_query(q)
    # 2026-09-26 21:2x 실측: 드라이버 597.16 WDDM 에서 두 A6000 이 한 LUID(연결 어댑터 phys_0/phys_1)로 묶여 nvidia-smi memory.used 가
    # 두 장 모두 같은 값(43,268)을 낸다 — PDH 로는 phys_0 43,275 · phys_1 10,033. 이때는 장별 값을 믿지 않고 CUDA 로 잰다(하한 유지).
    linked = len(rows) > 1 and len({g["used"] for g in rows}) == 1
    for g in rows:
        if index is not None and g["index"] != index:
            continue
        used = g["used"]
        if linked:
            LINKED["count"] += 1
            used = sanitize_used(g["index"], g["total"])
        elif used < 0 or used > g["total"]:
            used = sanitize_used(g["index"], g["total"])
        out.append(GpuMem(g["index"], g["name"], g["total"], used, g["util"], procs.get(g["index"], []), g["mode"]))
    return out


def query_raw() -> list[dict]:
    """nvidia-smi 값 그대로(보정 없음) — 진행 이벤트의 util/mem 표시용. 예산 계산에는 query() 를 쓴다."""
    q = subprocess.run([config.NVIDIA_SMI, "--query-gpu=index,name,memory.used,memory.total,utilization.gpu,driver_model.current",
                        "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    return [g for g in parse_query(q) if 0 <= g["used"] <= g["total"]]


INVALID = {"count": 0}
LINKED = {"count": 0}


def sanitize_used(index: int, total: int) -> int:
    """드라이버 597.16(2026-09-26 20:40 갱신 · 재부팅 전) WDDM 에서 nvidia-smi memory.used 가 2^44 MiB 쓰레기값을 낸다.
    그때는 CUDA 드라이버 API(cudaMemGetInfo: total − free)로 대신 잰다. 이것도 못 믿으면 보수적으로 total 의 절반을 점유로 본다."""
    INVALID["count"] += 1
    try:
        import torch
        if torch.cuda.is_available():
            vis = [int(x) for x in (__import__("os").environ.get("CUDA_VISIBLE_DEVICES") or "").split(",") if x.strip().isdigit()]
            dev = vis.index(index) if vis and index in vis else (index if not vis else None)
            if dev is not None:
                free, tot = torch.cuda.mem_get_info(dev)
                return max(int(round((tot - free) / 2**20)), EXTERNAL_FLOOR_MIB)
    except Exception:
        pass
    return max(total // 2, EXTERNAL_FLOOR_MIB)


# WDDM 에서 cudaMemGetInfo 는 다른 프로세스(Ollama) 점유를 다 못 볼 수 있다 → 마지막 정상 실측(2026-09-26 20:39 · 522.06 nvidia-smi
# memory.used 24,585 MiB · llama-server ×4) 을 하한으로 둔다. Ollama 몫을 절대 침범하지 않기 위한 보수값.
EXTERNAL_FLOOR_MIB = int(config.get("LX_EXTERNAL_FLOOR_MIB", "24585"))


def budget_mib(total: int, used: int, reserve: int = config.VRAM_RESERVE_MIB) -> int:
    return max(0, total - used - reserve)


def llama_tasklist() -> int:
    try:
        t = subprocess.run(["tasklist", "/FI", "IMAGENAME eq llama-server.exe"], capture_output=True, text=True, timeout=10, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
        return sum(1 for l in t.splitlines() if l.lower().startswith("llama-server"))
    except Exception:
        return 0


def external_label(procs: list[str]) -> str:
    if not procs:
        n = llama_tasklist()
        return f"llama-server ×{n} · tasklist(nvidia-smi 표에 안 보임)" if n else "외부 프로세스 없음"
    from collections import Counter
    c = Counter(p.replace(".exe", "") for p in procs)
    return ", ".join(f"{k} ×{v}" for k, v in c.items())


def fmt(n: int | float) -> str:
    return f"{int(round(n)):,}"
