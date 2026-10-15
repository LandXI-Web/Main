"""해외 결과 자산 — Sentinel-2 달별 합성 · 학습 데이터 · 나라 전체 분석(원칙 256 · 260 · 10-15 해외-학습데이터 '이대로 시작')."""

_mt: dict = {}


def fresh(name: str):
    """GPU 워커처럼 오래 사는 프로세스에서 — 파일이 바뀌었으면 다시 읽은 모듈(어댑터 파일만 다시 읽으면 이 모듈들은 옛 판 그대로라)."""
    import importlib
    import sys
    from pathlib import Path
    mod = importlib.import_module(name)
    f = Path(mod.__file__)
    mt = f.stat().st_mtime
    if _mt.get(name) != mt:                       # 처음 부를 때도 한 번 다시 읽는다(그 전에 옛 판이 올라와 있을 수 있음)
        mod = importlib.reload(mod)
    _mt[name] = mt
    sys.modules[name] = mod
    return mod
