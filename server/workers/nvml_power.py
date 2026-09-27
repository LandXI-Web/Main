"""NVML 전력 빠른 읽기(ctypes · pynvml 없이) — 전력 게이트의 반응 지연을 nvidia-smi -lms 500 스트림(0.5–1 s)보다 줄인다.

read() → {index: watts} (NVML 인덱스 = nvidia-smi 인덱스 · CUDA_VISIBLE_DEVICES 와 무관하게 모든 GPU).
가능하면 순간값 필드(NVML_FI_DEV_POWER_INSTANT=186)를 쓰고, 안 되면 nvmlDeviceGetPowerUsage(드라이버 평균)로.
NVML 을 못 열면 available() False — 호출자는 nvidia-smi 스트림으로 폴백한다.
"""
from __future__ import annotations

import ctypes
import os
import threading

_lock = threading.Lock()
_st: dict = {"lib": None, "handles": [], "ok": None, "mode": None}
FI_POWER_INSTANT = 186


class _FieldValue(ctypes.Structure):
    _fields_ = [("fieldId", ctypes.c_uint), ("scopeId", ctypes.c_uint), ("timestamp", ctypes.c_longlong),
                ("latencyUsec", ctypes.c_longlong), ("valueType", ctypes.c_uint), ("nvmlReturn", ctypes.c_uint),
                ("value", ctypes.c_ulonglong)]


def _open():
    if _st["ok"] is not None:
        return _st["ok"]
    cands = [os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvml.dll"),
             r"C:\Program Files\NVIDIA Corporation\NVSMI\nvml.dll", "nvml.dll", "libnvidia-ml.so.1"]
    for c in cands:
        try:
            lib = ctypes.CDLL(c)
            break
        except OSError:
            lib = None
    if lib is None or lib.nvmlInit_v2() != 0:
        _st["ok"] = False
        return False
    n = ctypes.c_uint()
    lib.nvmlDeviceGetCount_v2(ctypes.byref(n))
    hs = []
    for i in range(n.value):
        h = ctypes.c_void_p()
        if lib.nvmlDeviceGetHandleByIndex_v2(i, ctypes.byref(h)) == 0:
            hs.append(h)
    _st.update(lib=lib, handles=hs, ok=bool(hs))
    return _st["ok"]


def available() -> bool:
    with _lock:
        return bool(_open())


def mode() -> str | None:
    return _st["mode"]


def read_avg() -> dict[int, float]:
    """nvmlDeviceGetPowerUsage — 드라이버 평균(nvidia-smi power.draw 와 같은 값 · 판정 power-log 기준)."""
    with _lock:
        if not _open():
            return {}
        out = {}
        for i, h in enumerate(_st["handles"]):
            mw = ctypes.c_uint()
            if _st["lib"].nvmlDeviceGetPowerUsage(h, ctypes.byref(mw)) == 0:
                out[i] = round(mw.value / 1000.0, 1)
        return out


def read() -> dict[int, float]:
    with _lock:
        if not _open():
            return {}
        lib, out = _st["lib"], {}
        for i, h in enumerate(_st["handles"]):
            w = None
            if _st["mode"] in (None, "instant"):
                fv = _FieldValue(fieldId=FI_POWER_INSTANT)
                if lib.nvmlDeviceGetFieldValues(h, 1, ctypes.byref(fv)) == 0 and fv.nvmlReturn == 0 and fv.value:
                    w = fv.value / 1000.0
                    _st["mode"] = "instant"
                elif _st["mode"] is None:
                    _st["mode"] = "usage"
            if w is None:
                mw = ctypes.c_uint()
                if lib.nvmlDeviceGetPowerUsage(h, ctypes.byref(mw)) == 0:
                    w = mw.value / 1000.0
                    if _st["mode"] is None:
                        _st["mode"] = "usage"
            if w is not None:
                out[i] = round(w, 1)
        return out


if __name__ == "__main__":
    import time
    t = time.perf_counter()
    for _ in range(10):
        v = read()
    print(v, mode(), f"{(time.perf_counter() - t) * 100:.2f} ms/read")
