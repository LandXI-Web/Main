"""게이트웨이 여러 프로세스(uvicorn --workers N · impl-46 ops · 원칙 300 '오픈 했을때 불편함이 없이').

20명 동시 접속에서 게이트웨이 한 프로세스가 코어 하나를 다 쓰고(impl-45b load-20) 첫 화면이 8~18초가 됐다. 프로세스를 늘리되
프로세스 안에만 있던 상태가 갈라지지 않게 두 가지를 맞춘다.

1) 한 번만 도는 일(대표 프로세스 한 개) — 기동 복구 sweep · 대장 매칭 잇기 · 경보/배포 흐름 감시(ops.alert_loop → deploys.flow_loop) ·
   XI 재학습 스케줄러(core.loop) · 기관 공간 60초 주기(spaces) · 읍면동 빈칸 채우기(survey). 대표는 파일 잠금(server/.gateway-primary.lock)
   으로 정한다 — 프로세스가 죽으면 OS 가 잠금을 풀고, 남은 프로세스가 15초 안에 이어받는다(on_primary 로 건 일을 그때 띄운다).
   LX_GATEWAY_WORKERS 가 1(기본)이면 예전과 같이 늘 대표다. LX_GATEWAY_PRIMARY=0/1 은 강제(시험용 두 번째 게이트웨이 = 0).

2) 프로세스 캐시 비우기 — 쓰기 뒤 '바로 같은 값'을 약속하던 캐시(요약 · 공유 목록 · 지역 파생 · 저장 공간 · 기관 사용 현황 · 서비스 규칙 ·
   XI맵 판 · 필지 색인)는 비운 프로세스가 Redis 채널(lx:gw:inval)로 알리고, 다른 프로세스가 같은 캐시를 비운다. 원래 함수를 감싸거나
   (summary.invalidate 등) 캐시 dict 를 알림 dict 로 바꿔 끼운다(install · 호출하는 곳은 그대로). 세션 · 로그인 실패 수 · SSE · 작업 대기열은
   원래 DB/Redis 에 있어 손대지 않는다.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

log = logging.getLogger("landxi.procs")
PID = os.getpid()
CHANNEL = "lx:gw:inval"
WORKERS = max(1, int(os.environ.get("LX_GATEWAY_WORKERS") or 1))
_FORCE = os.environ.get("LX_GATEWAY_PRIMARY")          # "1" · "0" · 없음
_LOCK_PATH = Path(os.environ.get("LX_PRIMARY_LOCK") or Path(__file__).resolve().parents[1] / ".gateway-primary.lock")   # 시험 게이트웨이는 따로(tests/testdb.py)
_st: dict = {"primary": False, "fh": None, "loop": None, "applying": False, "installed": False}
_HANDLERS: dict = {}
_ON_PRIMARY: list = []


def multi() -> bool:
    return WORKERS > 1


def is_primary() -> bool:
    return bool(_st["primary"])


def elect() -> bool:
    """대표 잠금을 잡아 본다(잡으면 프로세스가 끝날 때까지 쥔다)."""
    if _st["primary"]:
        return True
    if _FORCE in ("0", "1"):
        _st["primary"] = _FORCE == "1"
        return _st["primary"]
    if not multi():
        _st["primary"] = True
        return True
    fh = None
    try:
        fh = open(_LOCK_PATH, "a+b")
        if os.name == "nt":
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        else:  # pragma: no cover
            import fcntl
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        if fh:
            try:
                fh.close()
            except Exception:  # noqa: BLE001
                pass
        return False
    _st.update(primary=True, fh=fh)
    print(f"[gateway] pid {PID} = 대표 프로세스(한 번만 도는 일 담당 · 프로세스 {WORKERS})", flush=True)
    return True


def on_primary(fn):
    """대표가 되면(지금 또는 나중에 이어받을 때) 한 번 부른다 — fn 은 동기 함수(안에서 create_task)."""
    _ON_PRIMARY.append(fn)
    if _st["primary"]:
        fn()


async def _primary_watch():
    while not _st["primary"]:
        await asyncio.sleep(15)
        if elect():
            for fn in list(_ON_PRIMARY):
                try:
                    fn()
                except Exception as e:  # noqa: BLE001
                    print(f"[gateway] 대표 이어받기 일 실패 {fn!r}: {e!r}", flush=True)


# ── 캐시 비우기 알림 ─────────────────────────────────────────────────────────
def broadcast(kind: str, arg=None) -> None:
    if not multi() or _st["applying"]:
        return
    msg = json.dumps({"k": kind, "a": arg, "pid": PID}, ensure_ascii=False, default=str)

    async def pub():
        try:
            from .deps import redis
            await (await redis()).publish(CHANNEL, msg)
        except Exception as e:  # noqa: BLE001
            log.warning("inval publish %s: %r", kind, e)
    try:
        asyncio.get_running_loop().create_task(pub())
    except RuntimeError:                       # 스레드에서 불렸다 — 게이트웨이 루프로 넘긴다
        lp = _st["loop"]
        if lp is not None and not lp.is_closed():
            asyncio.run_coroutine_threadsafe(pub(), lp)


def _apply(kind: str, arg) -> None:
    fn = _HANDLERS.get(kind)
    if not fn:
        return
    _st["applying"] = True
    try:
        fn(arg)
    except Exception as e:  # noqa: BLE001
        log.warning("inval apply %s: %r", kind, e)
    finally:
        _st["applying"] = False


async def _listen():
    import redis.asyncio as aioredis
    from . import config
    while True:
        try:
            r = aioredis.from_url(config.REDIS_URL, decode_responses=True, socket_connect_timeout=5)
            ps = r.pubsub()
            await ps.subscribe(CHANNEL)
            async for m in ps.listen():
                if m.get("type") != "message":
                    continue
                try:
                    d = json.loads(m["data"])
                except Exception:  # noqa: BLE001
                    continue
                if d.get("pid") != PID:
                    _apply(d.get("k"), d.get("a"))
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("inval listen: %r — 2초 뒤 다시", e)
            await asyncio.sleep(2)


class _NotifyDict(dict):
    """캐시 dict 대신 끼우는 dict — 비우는 동작(clear · pop · 시각 키를 0 으로)을 다른 프로세스에 알린다."""

    def __init__(self, kind: str, src: dict, zero_key: str | None = None):
        super().__init__(src)
        self._kind, self._zk = kind, zero_key

    def __setitem__(self, k, v):
        super().__setitem__(k, v)
        if self._zk is not None and k == self._zk and not v:
            broadcast(self._kind)

    def clear(self):
        super().clear()
        if self._zk is None:
            broadcast(self._kind)

    def pop(self, k, *d):
        r = super().pop(k, *d)
        if self._zk is None:
            broadcast(self._kind, k)
        return r


def _wrap(mod, name: str, kind: str):
    orig = getattr(mod, name)

    def w(*a):
        out = orig(*a)
        broadcast(kind, list(a))
        return out
    w.__wrapped__ = orig
    w.__doc__ = orig.__doc__
    setattr(mod, name, w)
    _HANDLERS[kind] = lambda a: orig(*(a or []))


def _swap(mod, name: str, kind: str, zero_key: str | None = None):
    cur = getattr(mod, name)
    nd = _NotifyDict(kind, cur, zero_key)
    setattr(mod, name, nd)
    if zero_key is None:
        _HANDLERS[kind] = lambda a: dict.clear(nd) if a is None else dict.pop(nd, a, None)
    else:
        _HANDLERS[kind] = lambda a: dict.__setitem__(nd, zero_key, 0)


def install() -> None:
    """기동 때 한 번(요청을 받기 전) — 여러 프로세스일 때만 감싸고 끼운다."""
    if _st["installed"] or not multi():
        return
    _st["installed"] = True
    from . import catalog, ledger, ops, quota, regions, summary, svc_rules, ximap
    _wrap(summary, "invalidate", "summary")
    _wrap(quota, "invalidate_storage", "quota")
    _wrap(ops, "tenants_usage_stale", "ten")
    _wrap(svc_rules, "forget", "svc_rules")
    _wrap(ximap, "_invalidate", "ximap")
    orig_pi = ledger.ParcelIndex.clear

    def pi_clear():
        orig_pi()
        broadcast("parcel_index")
    ledger.ParcelIndex.clear = staticmethod(pi_clear)
    _HANDLERS["parcel_index"] = lambda a: orig_pi()
    _swap(catalog, "_share_cache", "share")
    _swap(regions, "_derived", "derived", zero_key="t")


def start() -> list:
    """lifespan 안에서 — 루프 기억 · 알림 듣기 · (대표가 아니면) 이어받기 감시. 반환 = 끝낼 때 cancel 할 일."""
    _st["loop"] = asyncio.get_running_loop()
    tasks = []
    if multi():
        tasks.append(asyncio.create_task(_listen()))
        if not _st["primary"] and _FORCE is None:
            tasks.append(asyncio.create_task(_primary_watch()))
    return tasks


def status() -> dict:
    return {"pid": PID, "workers": WORKERS, "primary": is_primary()}
