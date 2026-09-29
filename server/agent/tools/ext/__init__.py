"""도구 확장 자리(C2 plan 3.1) — `tools/ext/*.py` 를 불러와 레지스트리에 합친다.

각 작업(c2-xi · c2-fusion · c2-report-law · c2-vlm-global · c2-ops …)은 자기 모듈 하나만 이 폴더에 둔다. 모듈이 내보내는 이름:
  SPECS    : dict[name → {description, properties, required?}]            (필수)
  HANDLERS : dict[name → async (args, ctx) → Out]                          (CLIENT 도구는 없어도 된다 → ui_actions [{op: name, **args}])
  WRITE    : set · CONFIRM : set(사람이 확인 카드로 승인해야 실행) · CLIENT : set(브라우저가 실행하는 지도 도구 → ui_actions)
  allowed(name, principal) -> bool                                         (없으면 기관·LX 모두 허용 · 게스트 0)
  WHY      : dict[name → 한 줄](계획 기록) · SAY : dict[name → 사용자 말](명령 바 계획 줄 · 확인 카드)
  HINT     : str(시스템 프롬프트에 붙일 규칙 1–2줄)
  ROUTE    : (msg, ctx) → {"tool", "args"} | None  (선택 · 모델 앞 결정적 직행 · sync/async)
  GUARD_PASS : re.Pattern(선택) — 이 문장은 '해당 지역 데이터가 없습니다' 가드를 건너뛴다(관할 밖 가드는 그대로)
  PREPARE  : dict[name → (args, ctx) → args](선택 · 확인 카드 전에 인자 해석 · sync/async)
  CONTRACT : dict[name → (None, method, path)](선택 · 계약 경로가 있으면)
모듈 하나가 불러오기에 실패해도 서버는 뜬다(경고만). 같은 이름이 겹치면 먼저 불린 것(기본 도구 → 파일 이름순)이 이기고 경고를 남긴다.
시험용 모듈은 환경 변수 LX_AGENT_EXT_EXTRA(쉼표 목록 · 모듈 경로)로만 더한다.
"""
from __future__ import annotations

import importlib
import logging
import os
import pkgutil
import re
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("landxi.agent.ext")

LOADED: dict[str, dict] = {}              # 모듈 → {ok, tools, error}
ALLOWED: dict[str, Callable] = {}         # 도구 → allowed(name, p)
OWNER: dict[str, str] = {}                # 도구 → 모듈
WHY: dict[str, str] = {}
SAY: dict[str, str] = {}
HINTS: list[str] = []
ROUTES: list[tuple[str, Callable]] = []
GUARD_PASS: list[re.Pattern] = []
PREPARE: dict[str, Callable] = {}
WARNINGS: list[str] = []
_STATE = {"done": False}


def _default_allowed(name: str, p) -> bool:
    return getattr(p, "realm", None) in ("tenant", "lx")


def _warn(msg: str):
    WARNINGS.append(msg)
    log.warning(msg)
    print(f"[agent.ext] {msg}", flush=True)


def module_names() -> list[str]:
    here = Path(__file__).resolve().parent
    names = sorted(m.name for m in pkgutil.iter_modules([str(here)]) if not m.name.startswith("_"))
    extra = [x.strip() for x in os.environ.get("LX_AGENT_EXT_EXTRA", "").split(",") if x.strip()]
    return [f"{__name__}.{n}" for n in names] + extra


def _merge(short: str, m, registry, from_contract) -> list[str]:
    specs = dict(getattr(m, "SPECS", None) or {})
    handlers = dict(getattr(m, "HANDLERS", None) or {})
    client = set(getattr(m, "CLIENT", None) or ())
    write = set(getattr(m, "WRITE", None) or ())
    confirm = set(getattr(m, "CONFIRM", None) or ())
    contract = dict(getattr(m, "CONTRACT", None) or {})
    why = dict(getattr(m, "WHY", None) or {})
    say = dict(getattr(m, "SAY", None) or {})
    prepare = dict(getattr(m, "PREPARE", None) or {})
    allow = getattr(m, "allowed", None)
    got = []
    for name, spec in specs.items():
        if name in registry.SPECS or name in OWNER:
            _warn(f"{short}: 도구 '{name}' 이 이미 있습니다({OWNER.get(name, '기본 도구')}) — 먼저 불린 쪽 유지")
            continue
        if not isinstance(spec, dict) or "description" not in spec:
            _warn(f"{short}: 도구 '{name}' 명세에 description 이 없습니다 — 건너뜀")
            continue
        if name not in handlers and name not in client:
            _warn(f"{short}: 도구 '{name}' 핸들러가 없습니다 — 건너뜀")
            continue
        registry.SPECS[name] = spec
        if name in handlers:
            registry.HANDLERS[name] = handlers[name]
        if name in client:
            from_contract.CLIENT.add(name)          # registry.CLIENT 와 같은 집합
        else:
            from_contract.CONTRACT[name] = contract.get(name) or (None, "EXT", f"ext:{short}")
        if name in write:
            registry.WRITE.add(name)
        if name in confirm:
            registry.CONFIRM.add(name)
        if name in prepare:
            PREPARE[name] = prepare[name]
        ALLOWED[name] = allow if callable(allow) else _default_allowed
        OWNER[name] = short
        WHY[name] = why.get(name) or str(spec["description"]).split(".")[0][:40]
        if name in say:
            SAY[name] = say[name]
        got.append(name)
    hint = getattr(m, "HINT", None)
    if isinstance(hint, str) and hint.strip():
        HINTS.append(hint.strip())
    route = getattr(m, "ROUTE", None)
    if callable(route):
        ROUTES.append((short, route))
    gp = getattr(m, "GUARD_PASS", None)
    if isinstance(gp, re.Pattern):
        GUARD_PASS.append(gp)
    return got


def load(registry=None, from_contract=None, force: bool = False) -> dict[str, dict]:
    """ext/*.py 를 불러와 합친다(한 번 · force=True 면 다시 — 테스트용)."""
    if _STATE["done"] and not force:
        return LOADED
    if registry is None or from_contract is None:
        from .. import from_contract as fc
        from .. import registry as rg
        registry, from_contract = registry or rg, from_contract or fc
    _STATE["done"] = True
    for full in module_names():
        short = full.rsplit(".", 1)[-1]
        try:
            m = importlib.import_module(full)
            if force and full.startswith(__name__ + "."):
                m = importlib.reload(m)
            tools = _merge(short, m, registry, from_contract)
            LOADED[short] = {"ok": True, "tools": tools, "error": None}
        except Exception as e:  # noqa: BLE001 — 모듈 하나가 서버를 막지 않는다
            LOADED[short] = {"ok": False, "tools": [], "error": f"{type(e).__name__}: {str(e)[:200]}"}
            _warn(f"{short}: 불러오기 실패 — {type(e).__name__}: {str(e)[:200]}")
    return LOADED


def unload(registry, from_contract):
    """테스트 정리 — 합친 도구를 되돌린다."""
    for name in list(OWNER):
        registry.SPECS.pop(name, None)
        registry.HANDLERS.pop(name, None)
        registry.WRITE.discard(name)
        registry.CONFIRM.discard(name)
        from_contract.CLIENT.discard(name)
        from_contract.CONTRACT.pop(name, None)
    for d in (ALLOWED, OWNER, WHY, SAY, PREPARE, LOADED):
        d.clear()
    for lst in (HINTS, ROUTES, GUARD_PASS, WARNINGS):
        lst.clear()
    _STATE["done"] = False


async def maybe(v: Any):
    """sync/async 둘 다 받는다."""
    import inspect
    return await v if inspect.isawaitable(v) else v
