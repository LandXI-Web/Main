"""모델 파일(.pt) 읽기 — 파일 안 기록에서 계열(YOLO11 등) · 크기(n~x) · 결과 형태(BOX · OBB · SEG) · 클래스 목록 · 입력 크기를 자동으로 읽는다(11-01 PM
"모델 크기를 꼭 적게 하는 개념 보다는 pt 파일 모델 파일을 등록 … 프로젝트에서 생성된건 자동으로 매칭"). 사람이 적지 않고, 읽지 못한 값은 비워 둔다(지어내지 않는다).

· 모델 올리기(training.py up_finish) · 학습 결과 등록(adapters/adapter_train_yolo.py) · 크기 빠진 기존 모델 채우기가 이 한 함수를 쓴다.
· 올린 파일은 믿을 수 없는 입력이므로 별도 프로세스에서(probe_subprocess) · 허용한 클래스만 풀어(제한 unpickler) 읽는다. 실행 가능한 객체는 풀지 않는다.
· 크기는 파일 안 yaml 의 크기 글자와 파라미터 수가 서로 맞을 때만 인정한다(둘이 어긋나면 크기 없음)."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

PARAMS = {  # ultralytics 공개 모델 크기(파라미터 수 · 영역 분할 기준 근사) — 파일 안 크기 글자 검증용
    "yolo11": {"n": 2.87e6, "s": 10.1e6, "m": 22.4e6, "l": 27.6e6, "x": 62.1e6},
}
_TASK = {"segment": "seg", "obb": "obb", "detect": "det", "Segment": "seg", "OBB": "obb", "Detect": "det"}
_SHAPE_WORD = {"seg": "영역(SEG)", "obb": "회전 상자(OBB)", "det": "상자(BOX)"}
_ALLOW = ("torch", "ultralytics", "collections", "numpy", "_codecs", "copyreg", "pathlib", "argparse", "typing", "functools", "math", "datetime")
_BUILTIN_OK = {"set", "frozenset", "dict", "list", "tuple", "int", "float", "str", "bytes", "bytearray", "bool", "complex", "slice", "range", "object", "getattr"}


def _restricted_pickle():
    import pickle

    class _U(pickle.Unpickler):
        def find_class(self, module, name):
            if module in ("builtins", "__builtin__") and name in _BUILTIN_OK:
                return super().find_class(module, name)
            if module.split(".")[0] in _ALLOW and not (module.startswith("torch.utils.cpp_extension") or name in ("system", "popen", "eval", "exec", "load", "loads")):
                return super().find_class(module, name)
            raise pickle.UnpicklingError(f"허용하지 않은 객체: {module}.{name}")

    class _M:                                             # torch.load 가 요구하는 모양(pickle 모듈 대용)
        Unpickler = _U
        UnpicklingError = pickle.UnpicklingError
        load = staticmethod(pickle.load)
        Pickler = pickle.Pickler
    return _M


def probe(path: str | Path) -> dict:
    """{ok, family, size, task, shape_word, classes, imgsz, params, basis} — 못 읽으면 {ok: False, why}."""
    try:
        import torch
        ck = torch.load(str(path), map_location="cpu", weights_only=False, pickle_module=_restricted_pickle())
    except Exception as e:                                 # noqa: BLE001
        return {"ok": False, "why": "모델 파일을 읽지 못했습니다 — YOLO 모델 파일(.pt)인지 확인해 주세요", "err": repr(e)[:160]}
    try:
        m = ck.get("ema") or ck.get("model")
        y = dict(getattr(m, "yaml", None) or {})
        yf = str(y.get("yaml_file") or "")
        mm = re.match(r"^(yolo(?:v)?\d+)([nslmx])?(-seg|-obb|-cls|-pose)?\.ya?ml$", Path(yf).name) if yf else None
        scale = y.get("scale") or (mm.group(2) if mm else None)
        base = mm.group(1) if mm else None
        head = type(m.model[-1]).__name__ if hasattr(m, "model") else ""
        task = _TASK.get(getattr(m, "task", "")) or _TASK.get(head)
        n = sum(p.numel() for p in m.parameters())
        size = None
        if scale and base in PARAMS and scale in PARAMS[base]:
            ref = PARAMS[base][scale] * (1.0 if task == "seg" else 0.92)   # 상자 · 회전 상자는 영역 분할 머리가 없어 조금 작다
            size = scale if abs(ref - n) / ref < 0.12 else None
        elif scale:
            size = scale
        names = getattr(m, "names", None) or ck.get("names") or {}
        classes = [str(v) for _, v in sorted(names.items(), key=lambda kv: int(kv[0]))] if isinstance(names, dict) else [str(v) for v in names]
        ta = ck.get("train_args") or {}
        imgsz = ta.get("imgsz")
        imgsz = int(imgsz[0] if isinstance(imgsz, (list, tuple)) else imgsz) if imgsz else None
        if not (base and task):
            return {"ok": False, "why": "이 파일에서 모델 종류를 읽지 못했습니다 — YOLO 모델 파일(.pt)인지 확인해 주세요"}
        family = f"{base}{size or ''}-{task}" if task in ("seg", "obb") else f"{base}{size or ''}"
        return {"ok": True, "family": family, "size": size, "task": task, "shape_word": _SHAPE_WORD.get(task), "classes": classes, "imgsz": imgsz,
                "params": n, "basis": f"모델 파일 안 기록({Path(yf).name or '—'} · 파라미터 {n:,}개)에서 읽음"}
    except Exception as e:                                 # noqa: BLE001
        return {"ok": False, "why": "이 파일에서 모델 종류를 읽지 못했습니다", "err": repr(e)[:160]}


def probe_subprocess(path: str | Path, timeout: int = 120) -> dict:
    """올린 파일은 별도 프로세스에서 읽는다(게이트웨이 메모리 · 안정 보호)."""
    try:
        r = subprocess.run([sys.executable, "-I", str(Path(__file__).resolve()), str(path)], capture_output=True, text=True, timeout=timeout, encoding="utf-8")
        return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception as e:                                 # noqa: BLE001
        return {"ok": False, "why": "모델 파일을 읽지 못했습니다", "err": repr(e)[:160]}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(probe(sys.argv[1]), ensure_ascii=False))
